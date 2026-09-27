import { guardedFetch, normalizeUrl } from "./fetcher";
import { runPrimaryDetection } from "./primary";
import { looksLikeInterstitial, runFallbackDetection } from "./fallback";
import { createRobotsGate, toReport } from "./robots";
import { isPlatformCategory } from "./signatures";
import type { BatchSummary, Confidence, DetectionResult, TechMatch } from "@/lib/types";

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

/** Collapses repeat findings for the same technology, keeping the strongest evidence. */
function dedupe(matches: TechMatch[]): TechMatch[] {
  const best = new Map<string, TechMatch>();
  for (const match of matches) {
    const existing = best.get(match.name);
    if (!existing || CONFIDENCE_RANK[match.confidence] > CONFIDENCE_RANK[existing.confidence]) {
      best.set(match.name, match);
    }
  }
  return [...best.values()].sort(
    (a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence],
  );
}

function platformsOf(matches: TechMatch[]): TechMatch[] {
  return matches.filter((match) => isPlatformCategory(match.category));
}

/** How much a signal is trusted when two CMS claims collide. */
const SOURCE_RANK: Record<TechMatch["source"], number> = {
  header: 5,
  html: 4,
  robots: 3,
  sitemap: 2,
  "path-probe": 1,
};

/**
 * A site runs one CMS. Secondary signals are individually weaker than a
 * signature, so a site with leftover paths from a migration, or a robots.txt
 * assembled by hand, can trip rules for two platforms at once. Keeping only the
 * best-supported claim stops the tool reporting a site as Drupal and Joomla and
 * WordPress simultaneously.
 *
 * Only the CMS category is exclusive: a WordPress site with a Shopify storefront
 * is a real combination, so other platform categories pass through untouched.
 */
function resolveCmsConflict(matches: TechMatch[]): TechMatch[] {
  const cms = matches.filter((match) => match.category === "CMS");
  if (cms.length <= 1) return matches;

  const winner = cms.reduce((best, candidate) =>
    CONFIDENCE_RANK[candidate.confidence] !== CONFIDENCE_RANK[best.confidence]
      ? CONFIDENCE_RANK[candidate.confidence] > CONFIDENCE_RANK[best.confidence]
        ? candidate
        : best
      : SOURCE_RANK[candidate.source] > SOURCE_RANK[best.source]
        ? candidate
        : best,
  );

  return matches.filter((match) => match.category !== "CMS" || match === winner);
}

/**
 * Two-pass detection for a single site.
 *
 * Every outbound request goes through a robots.txt gate first. The gate reads
 * the file once per origin and is consulted before each fetch -- including each
 * redirect hop, since a redirect can land on an origin with different rules.
 * A disallowed path is not requested at all and is reported as skipped, which
 * means detection is sometimes deliberately less complete than it could be.
 *
 * The fallback pass is gated on the *platform* question, not on finding any
 * technology at all: a site where we only spotted Google Analytics or a CDN is
 * still an unidentified site, and is exactly the case the second pass exists
 * to rescue.
 */
export async function detectSite(input: string): Promise<DetectionResult> {
  const startedAt = Date.now();

  let base: URL;
  try {
    base = normalizeUrl(input);
  } catch (error) {
    return {
      url: input,
      finalUrl: null,
      status: null,
      reachable: false,
      method: "none",
      technologies: [],
      platformTechnologies: [],
      fallbackRan: false,
      probes: [],
      error: error instanceof Error ? error.message : "Invalid URL",
      durationMs: Date.now() - startedAt,
    };
  }

  const gate = createRobotsGate();
  const response = await guardedFetch(base, { timeoutMs: 10_000, allowUrl: gate.allows });
  const policy = await gate.policyFor(new URL(response.finalUrl));

  // robots.txt told us not to fetch the page. That is an answer, not a failure,
  // and it is reported as one rather than dressed up as an unidentified site.
  if (response.blockedByRobots) {
    return {
      url: base.toString(),
      finalUrl: response.finalUrl,
      status: null,
      reachable: false,
      method: "none",
      technologies: [],
      platformTechnologies: [],
      fallbackRan: false,
      probes: [],
      robots: toReport(policy, gate.skipped()),
      blockedByRobots: true,
      durationMs: Date.now() - startedAt,
    };
  }

  if (response.error || response.status === null) {
    return {
      url: base.toString(),
      finalUrl: response.finalUrl,
      status: response.status,
      reachable: false,
      method: "none",
      technologies: [],
      platformTechnologies: [],
      fallbackRan: false,
      probes: [],
      robots: toReport(policy, gate.skipped()),
      error: response.error ?? "No response",
      durationMs: Date.now() - startedAt,
    };
  }

  const primaryMatches = dedupe(runPrimaryDetection(response));
  const primaryPlatforms = platformsOf(primaryMatches);

  // The body we scanned may be an edge interstitial rather than the site. Say so
  // rather than quietly reporting whatever the challenge page happens to contain.
  const warning = looksLikeInterstitial(response.body, response.status)
    ? "The site showed a bot check or block page instead of its real homepage, so these results may describe that page, not the site."
    : undefined;

  if (primaryPlatforms.length > 0) {
    return {
      url: base.toString(),
      finalUrl: response.finalUrl,
      status: response.status,
      reachable: true,
      method: "primary",
      technologies: primaryMatches,
      platformTechnologies: primaryPlatforms,
      fallbackRan: false,
      probes: [],
      robots: toReport(policy, gate.skipped()),
      warning,
      durationMs: Date.now() - startedAt,
    };
  }

  // Primary came back empty on the question that matters. Instead of returning
  // "unknown", look at the secondary signals a site cannot easily hide.
  const fallback = await runFallbackDetection(new URL(response.finalUrl), gate);
  const combined = resolveCmsConflict(dedupe([...primaryMatches, ...fallback.matches]));
  const combinedPlatforms = platformsOf(combined);

  return {
    url: base.toString(),
    finalUrl: response.finalUrl,
    status: response.status,
    reachable: true,
    method: combinedPlatforms.length > 0 ? "fallback" : "none",
    technologies: combined,
    platformTechnologies: combinedPlatforms,
    fallbackRan: true,
    probes: fallback.probes,
    probeWarning: fallback.probeWarning,
    robots: toReport(policy, gate.skipped()),
    warning,
    durationMs: Date.now() - startedAt,
  };
}

/** Runs `worker` over `items` with a bounded number of in-flight requests. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

export async function detectBatch(urls: string[], concurrency = 6): Promise<DetectionResult[]> {
  return mapWithConcurrency(urls, concurrency, detectSite);
}

function percent(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function summarize(results: DetectionResult[], durationMs: number): BatchSummary {
  const totalSites = results.length;
  const reachable = results.filter((r) => r.reachable).length;
  const primaryDetected = results.filter((r) => r.method === "primary").length;
  const fallbackDetected = results.filter((r) => r.method === "fallback").length;
  const totalDetected = primaryDetected + fallbackDetected;
  // Sites we were asked not to fetch are not detection failures, so they are
  // counted apart from "undetected" rather than quietly depressing it.
  const robotsBlocked = results.filter((r) => r.blockedByRobots).length;

  const primaryRate = percent(primaryDetected, totalSites);
  const combinedRate = percent(totalDetected, totalSites);

  return {
    totalSites,
    reachable,
    // Kept disjoint from robotsBlocked: a site we chose not to fetch is not a
    // site that failed to answer, and counting it as both would overstate both.
    unreachable: totalSites - reachable - robotsBlocked,
    primaryDetected,
    fallbackDetected,
    totalDetected,
    robotsBlocked,
    undetected: totalSites - totalDetected - robotsBlocked,
    primaryRate,
    combinedRate,
    improvementPoints: Math.round((combinedRate - primaryRate) * 10) / 10,
    improvementRate: percent(fallbackDetected, primaryDetected),
    durationMs,
  };
}
