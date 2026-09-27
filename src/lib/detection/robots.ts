import { guardedFetch } from "./fetcher";
import type { RobotsReport, RobotsState } from "@/lib/types";

/**
 * The product token this crawler answers to. A robots.txt group naming this
 * token applies to us in preference to the `*` group. Keep it in sync with the
 * User-Agent string in `fetcher.ts` -- a token we advertise but do not honour is
 * worse than no token at all.
 */
export const CRAWLER_TOKEN = "TechnographicExplorer";

const ROBOTS_TIMEOUT_MS = 6000;
const ROBOTS_MAX_BYTES = 60_000;

/**
 * The longest Crawl-delay we will sit through. A site asking for more than this
 * is left alone after robots.txt rather than fetched faster than it asked:
 * waiting minutes per request would stall a batch, and ignoring the number
 * would defeat the point of reading it.
 */
const MAX_CRAWL_DELAY_MS = 10_000;

interface Rule {
  allow: boolean;
  /** The literal path pattern, e.g. `/wp-admin/`. */
  pattern: string;
  matcher: RegExp;
}

interface Group {
  agents: string[];
  rules: Rule[];
  /** Seconds between requests, from a `Crawl-delay` line in this group. */
  crawlDelay: number | null;
}

/**
 * Compiles a robots.txt path pattern into an anchored regex.
 *
 * The format has exactly two metacharacters: `*` matches any run of characters,
 * and a trailing `$` anchors the end of the path. Everything else is literal and
 * has to be escaped -- `.` and `+` are ordinary characters in a URL path and
 * must not be read as regex syntax.
 */
function compilePattern(pattern: string): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      source += ".*";
    } else if (char === "$" && i === pattern.length - 1) {
      source += "$";
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}`);
}

/**
 * Splits robots.txt into groups.
 *
 * Consecutive `User-agent` lines share one group; the first `Allow`/`Disallow`/
 * `Crawl-delay` closes the agent list, so a later `User-agent` starts a new
 * group. Anything else -- `Sitemap`, vendor extensions -- is ignored here and
 * read separately where it matters.
 */
function parseGroups(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let acceptingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!current || !acceptingAgents) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
        acceptingAgents = true;
      }
      if (value) current.agents.push(value.toLowerCase());
      continue;
    }

    // Crawl-delay is not part of RFC 9309, but plenty of sites publish it and
    // it is cheap to honour. Like a rule, it belongs to the group above it.
    if (field === "crawl-delay") {
      if (!current) continue;
      acceptingAgents = false;
      const seconds = Number(value);
      if (value && Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds;
      continue;
    }

    if (field !== "allow" && field !== "disallow") continue;
    // A rule appearing before any User-agent line belongs to no group.
    if (!current) continue;
    acceptingAgents = false;

    // `Disallow:` with an empty value means "nothing is disallowed", which is
    // already the default, so it contributes no rule. An empty `Allow:` is
    // meaningless in the same way.
    if (!value) continue;

    // Patterns are relative paths; a stray absolute URL is not addressed to us.
    if (!value.startsWith("/")) continue;

    current.rules.push({
      allow: field === "allow",
      pattern: value,
      matcher: compilePattern(value),
    });
  }

  return groups;
}

/**
 * Picks the groups that apply to `token`.
 *
 * Matching is on the whole token, case-insensitively: a group addressed to
 * `Googlebot` is not addressed to us. Only when no group names us does the `*`
 * group apply -- a specific group replaces the wildcard rather than adding to
 * it. Several groups may name the same agent, so all of them are returned.
 */
function groupsFor(groups: Group[], token: string): Group[] {
  const wanted = token.toLowerCase();

  const specific = groups.filter((group) => group.agents.includes(wanted));
  if (specific.length > 0) return specific;

  return groups.filter((group) => group.agents.includes("*"));
}

/**
 * Applies the rules to one path.
 *
 * RFC 9309: the most specific rule wins, measured by the length of the pattern,
 * and `Allow` beats `Disallow` on a tie. Without the tie-break, the common
 * `Disallow: /` + `Allow: /public/` pairing would lock us out of the very paths
 * the site explicitly opened up.
 */
function isPathAllowed(rules: Rule[], pathWithQuery: string): boolean {
  let winner: Rule | null = null;

  for (const rule of rules) {
    if (!rule.matcher.test(pathWithQuery)) continue;
    if (
      !winner ||
      rule.pattern.length > winner.pattern.length ||
      (rule.pattern.length === winner.pattern.length && rule.allow && !winner.allow)
    ) {
      winner = rule;
    }
  }

  return winner ? winner.allow : true;
}

export interface RobotsPolicy {
  state: RobotsState;
  status: number | null;
  /** The raw file when one was served. The fallback pass mines it for platform hints. */
  body: string;
  /** How many Allow/Disallow rules address this crawler. */
  ruleCount: number;
  /** Minimum gap between requests to this origin, from Crawl-delay. 0 when none. */
  crawlDelayMs: number;
  /** Plain-language one-liner, shown in the UI. */
  summary: string;
  isAllowed(target: URL): boolean;
}

function formatSeconds(ms: number): string {
  const seconds = Math.round(ms / 100) / 10;
  return seconds === 1 ? "1 second" : `${seconds} seconds`;
}

function describe(
  state: RobotsState,
  status: number | null,
  ruleCount: number,
  crawlDelayMs: number,
): string {
  if (state === "no-file") {
    return "This site has no robots.txt, so there were no crawling rules to follow.";
  }
  if (state === "unreachable") {
    const code = status === null ? "" : ` (HTTP ${status})`;
    return `We couldn't load this site's robots.txt${code}, so we didn't fetch anything else, just to be safe.`;
  }
  if (crawlDelayMs > MAX_CRAWL_DELAY_MS) {
    return `This site's robots.txt asks for ${formatSeconds(crawlDelayMs)} between requests. That's longer than this tool waits, so we left the site alone.`;
  }

  const rules =
    ruleCount === 0
      ? "This site has a robots.txt, but none of its rules apply to this tool."
      : ruleCount === 1
        ? "This site has a robots.txt with 1 rule that applies to this tool, and we followed it."
        : `This site has a robots.txt with ${ruleCount} rules that apply to this tool, and we followed them.`;
  const delay =
    crawlDelayMs > 0
      ? ` It also asks for ${formatSeconds(crawlDelayMs)} between requests, so we waited that long.`
      : "";
  return rules + delay;
}

function buildPolicy(
  state: RobotsState,
  status: number | null,
  body: string,
  groups: Group[] = [],
): RobotsPolicy {
  const rules = groups.flatMap((group) => group.rules);
  // Several groups can name us; the strictest delay among them wins.
  const crawlDelayMs = Math.max(0, ...groups.map((group) => (group.crawlDelay ?? 0) * 1000));
  const tooSlow = crawlDelayMs > MAX_CRAWL_DELAY_MS;

  return {
    state,
    status,
    body,
    ruleCount: rules.length,
    crawlDelayMs,
    summary: describe(state, status, rules.length, crawlDelayMs),
    isAllowed(target: URL): boolean {
      // robots.txt itself is always fetchable; that is how the rules are learned.
      if (target.pathname === "/robots.txt") return true;
      if (state === "unreachable") return false;
      if (state === "no-file") return true;
      if (tooSlow) return false;
      return isPathAllowed(rules, `${target.pathname}${target.search}`);
    },
  };
}

/**
 * Fetches and parses one origin's robots.txt.
 *
 * The three outcomes are the ones RFC 9309 distinguishes, and they are not
 * interchangeable:
 *
 *   4xx   the file is *unavailable*: the site publishes no rules, so everything
 *         is permitted. A blanket 403 on robots.txt lands here too.
 *   5xx / network failure   the file is *unreachable*: rules may well exist but
 *         are unknown, so the whole site is treated as disallowed. Assuming
 *         "allowed" here is precisely how a crawler ends up fetching what it was
 *         told not to.
 *   2xx   parse it.
 */
async function loadPolicy(origin: URL): Promise<RobotsPolicy> {
  const response = await guardedFetch(new URL("/robots.txt", origin), {
    timeoutMs: ROBOTS_TIMEOUT_MS,
    maxBytes: ROBOTS_MAX_BYTES,
  });

  const status = response.status;

  if (response.error || status === null) return buildPolicy("unreachable", status, "");
  if (status >= 500) return buildPolicy("unreachable", status, "");
  if (status < 200 || status >= 300) return buildPolicy("no-file", status, "");

  // Plenty of hosts answer /robots.txt with a styled 404 page at HTTP 200.
  // Parsing that yields no rules anyway, but calling it "no file" is honest and
  // keeps the hint pass from mining a marketing page for disallow directives.
  if (/<html/i.test(response.body.slice(0, 300))) {
    return buildPolicy("no-file", status, "");
  }

  const groups = groupsFor(parseGroups(response.body), CRAWLER_TOKEN);
  return buildPolicy("rules", status, response.body, groups);
}

export interface RobotsGate {
  /** The policy for the origin `target` belongs to, fetched once per origin. */
  policyFor(target: URL): Promise<RobotsPolicy>;
  /** Checks robots.txt without making or scheduling a request. Refusals are recorded. */
  permits(target: URL): Promise<boolean>;
  /**
   * Shaped for `guardedFetch`'s `allowUrl` hook: checks robots.txt, then waits
   * out the origin's Crawl-delay before letting the request go.
   */
  allows(target: URL): Promise<boolean>;
  /** Every path this gate refused, in the order they were refused. */
  skipped(): string[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Per-site robots.txt gate.
 *
 * Caching is by origin and stores the in-flight promise, so the concurrent
 * checks the fallback pass fires off share a single robots.txt request rather
 * than racing to make their own. Redirects can cross origins, so this is keyed
 * on origin rather than fetched once per site.
 *
 * Crawl-delay is enforced by handing out time slots. Each request books the
 * next free slot before it starts waiting, so requests fired at the same moment
 * still go out spaced apart instead of all waking together.
 */
export function createRobotsGate(): RobotsGate {
  const policies = new Map<string, Promise<RobotsPolicy>>();
  const nextSlot = new Map<string, number>();
  const refused: string[] = [];

  function policyFor(target: URL): Promise<RobotsPolicy> {
    const key = target.origin;
    let policy = policies.get(key);
    if (!policy) {
      policy = loadPolicy(target).then((loaded) => {
        // Fetching robots.txt was itself a request, so the clock starts now.
        nextSlot.set(key, Date.now() + loaded.crawlDelayMs);
        return loaded;
      });
      policies.set(key, policy);
    }
    return policy;
  }

  async function permits(target: URL): Promise<boolean> {
    const policy = await policyFor(target);
    const allowed = policy.isAllowed(target);
    if (!allowed) {
      const path = `${target.pathname}${target.search}`;
      if (!refused.includes(path)) refused.push(path);
    }
    return allowed;
  }

  return {
    policyFor,
    permits,
    async allows(target: URL): Promise<boolean> {
      if (!(await permits(target))) return false;

      const { crawlDelayMs } = await policyFor(target);
      if (crawlDelayMs > 0) {
        const now = Date.now();
        const slot = Math.max(now, nextSlot.get(target.origin) ?? now);
        nextSlot.set(target.origin, slot + crawlDelayMs);
        if (slot > now) await sleep(slot - now);
      }
      return true;
    },
    skipped: () => [...refused],
  };
}

export function toReport(policy: RobotsPolicy, skipped: string[]): RobotsReport {
  return {
    state: policy.state,
    status: policy.status,
    summary: policy.summary,
    skipped,
  };
}
