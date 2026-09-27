import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** HEAD-style probes still need the body suppressed but the status kept. */
  readBody?: boolean;
  /**
   * Consulted before every hop, including the first. Returning false refuses the
   * request without making it. This is where robots.txt is enforced: a redirect
   * can cross into an origin with different rules, so the check has to run per
   * hop rather than once at the call site.
   */
  allowUrl?: (url: URL) => Promise<boolean> | boolean;
}

export interface FetchOutcome {
  ok: boolean;
  status: number | null;
  finalUrl: string;
  headers: Record<string, string>;
  body: string;
  error?: string;
  /** True when `allowUrl` refused this URL, so no request was made. */
  blockedByRobots?: boolean;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 600_000;
const MAX_REDIRECTS = 5;

const USER_AGENT =
  "Mozilla/5.0 (compatible; TechnographicExplorer/1.0; +https://example.com/bot)";

/** Normalises bare input like `example.com` into an absolute https URL. */
export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("URL is empty");
  // Reject an explicit non-web scheme up front. Without this, prefixing https://
  // to `ftp://host` yields the hostname "ftp" and a misleading error.
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed);
  if (scheme && !/^https?$/i.test(scheme[1])) {
    throw new Error(`Unsupported protocol: ${scheme[1]}:`);
  }

  const withScheme = scheme ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }
  if (!url.hostname.includes(".")) {
    throw new Error(`Not a public hostname: ${url.hostname}`);
  }
  return url;
}

function isPrivateAddress(address: string, family: number): boolean {
  if (family === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const addr = address.toLowerCase().split("%")[0];
  if (addr === "::1" || addr === "::") return true;
  if (addr.startsWith("fe80") || addr.startsWith("fc") || addr.startsWith("fd")) return true;
  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1], 4);
  return false;
}

/**
 * Rejects hosts that resolve into private space. This endpoint takes arbitrary
 * URLs from the public internet, so without this it is an SSRF pivot into
 * whatever network the server runs on.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    if (isPrivateAddress(bare, isIP(bare))) {
      throw new Error(`Refusing to fetch private address ${bare}`);
    }
    return;
  }
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(bare)) {
    throw new Error(`Refusing to fetch internal hostname ${bare}`);
  }
  const records = await lookup(bare, { all: true });
  if (records.length === 0) throw new Error(`Could not resolve ${bare}`);
  for (const record of records) {
    if (isPrivateAddress(record.address, record.family)) {
      throw new Error(`${bare} resolves to a private address`);
    }
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

/** Reads at most `maxBytes` so a huge or endless response cannot exhaust memory. */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let text = "";
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text.slice(0, maxBytes);
}

/**
 * Fetches a URL with a timeout, a body cap, and manual redirect handling so
 * every hop is re-validated against the private-address check.
 */
export async function guardedFetch(
  target: string | URL,
  options: FetchOptions = {},
): Promise<FetchOutcome> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    readBody = true,
    allowUrl,
  } = options;

  let current = typeof target === "string" ? normalizeUrl(target) : target;
  let deadline = Date.now() + timeoutMs;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      await assertPublicHost(current.hostname);
    } catch (error) {
      return emptyOutcome(current.toString(), messageOf(error));
    }

    if (allowUrl) {
      // `allowUrl` may sleep to honour a Crawl-delay. That wait is politeness,
      // not the server being slow, so it does not count against the timeout.
      const waitStartedAt = Date.now();
      const allowed = await allowUrl(current);
      deadline += Date.now() - waitStartedAt;
      if (!allowed) {
        return {
          ...emptyOutcome(current.toString(), "Disallowed by robots.txt"),
          blockedByRobots: true,
        };
      }
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return emptyOutcome(current.toString(), "Timed out");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);

    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      });

      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel().catch(() => {});
        current = new URL(location, current);
        if (current.protocol !== "http:" && current.protocol !== "https:") {
          return emptyOutcome(current.toString(), "Redirected to unsupported protocol");
        }
        continue;
      }

      const headers = headersToObject(response.headers);
      const body = readBody ? await readCapped(response, maxBytes) : "";
      if (!readBody) await response.body?.cancel().catch(() => {});

      return {
        ok: response.ok,
        status: response.status,
        finalUrl: current.toString(),
        headers,
        body,
      };
    } catch (error) {
      const message = controller.signal.aborted ? "Timed out" : messageOf(error);
      return emptyOutcome(current.toString(), message);
    } finally {
      clearTimeout(timer);
    }
  }

  return emptyOutcome(current.toString(), "Too many redirects");
}

function emptyOutcome(finalUrl: string, error: string): FetchOutcome {
  return { ok: false, status: null, finalUrl, headers: {}, body: "", error };
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    // undici wraps DNS/TLS failures in a generic message; the cause is the useful part.
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return cause.message;
    return error.message;
  }
  return String(error);
}
