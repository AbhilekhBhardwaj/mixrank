/**
 * Fixed-window per-IP rate limiting.
 *
 * State lives in module memory, so the window is per server instance: behind
 * several instances the effective limit is the configured limit times the
 * instance count. That is fine for a demo whose purpose is to stop one client
 * hammering the outbound fetcher; a multi-instance deployment should move this
 * to Redis or Upstash and keep the same interface.
 */

interface Bucket {
  count: number;
  /** Epoch ms at which this window expires and the count resets. */
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Sweep expired buckets occasionally so an IP churn cannot grow the map forever. */
const SWEEP_THRESHOLD = 5000;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (buckets.size > SWEEP_THRESHOLD) sweep(now);

  const existing = buckets.get(key);
  const bucket =
    existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);

  const ok = bucket.count <= limit;
  return {
    ok,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is client-controlled unless a trusted proxy overwrites it,
 * so this is a courtesy limit rather than a security control -- it stops
 * accidental hammering, not a determined attacker rotating the header.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
  };
}

/**
 * Applies a limit and returns a ready-made 429 when it is exceeded, or the
 * headers to attach to a successful response.
 */
export function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs = 60_000,
): { blocked: Response } | { blocked: null; headers: Record<string, string> } {
  const result = rateLimit(`${scope}:${clientIp(request)}`, limit, windowMs);
  const headers = rateLimitHeaders(result);

  if (!result.ok) {
    return {
      blocked: Response.json(
        {
          error: `Rate limit exceeded: ${limit} request${limit === 1 ? "" : "s"} per minute. Retry in ${result.retryAfterSeconds}s.`,
        },
        {
          status: 429,
          headers: { ...headers, "Retry-After": String(result.retryAfterSeconds) },
        },
      ),
    };
  }

  return { blocked: null, headers };
}
