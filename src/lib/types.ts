export type DetectionMethod = "primary" | "fallback" | "none";

export type TechCategory =
  | "CMS"
  | "Ecommerce"
  | "Site Builder"
  | "Framework"
  | "Analytics"
  | "Payments"
  | "CDN / Infrastructure"
  | "Support"
  | "Marketing";

export type EvidenceSource =
  | "html"
  | "header"
  | "robots"
  | "sitemap"
  | "path-probe";

export type Confidence = "high" | "medium" | "low";

export interface TechMatch {
  /** Display name, e.g. "WordPress". */
  name: string;
  category: TechCategory;
  /** Which pass produced this match. */
  method: Exclude<DetectionMethod, "none">;
  source: EvidenceSource;
  confidence: Confidence;
  /** Human-readable justification shown in the UI, e.g. `robots.txt disallows /wp-admin/`. */
  evidence: string;
}

export interface ProbeResult {
  path: string;
  status: number | null;
  /** True when the response looks like a real page rather than a soft 404. */
  meaningful: boolean;
  /** Set when the path was deliberately not requested, and why. */
  skipped?: "robots" | "no-baseline" | "soft-404";
  note?: string;
}

/**
 * How robots.txt resolved for a host.
 *
 * `no-file` and `unreachable` are deliberately separate: RFC 9309 treats a 4xx
 * as "this site publishes no rules" (fetch freely) and a 5xx or network failure
 * as "the rules exist but are unknown" (fetch nothing).
 */
export type RobotsState = "rules" | "no-file" | "unreachable";

export interface RobotsReport {
  state: RobotsState;
  status: number | null;
  /** Plain-language one-liner for the UI. */
  summary: string;
  /** Paths the tool wanted to fetch but did not, because robots.txt disallows them. */
  skipped: string[];
}

export interface DetectionResult {
  url: string;
  finalUrl: string | null;
  status: number | null;
  /** Whether the site was reachable at all. `false` means DNS/TLS/timeout failure. */
  reachable: boolean;
  method: DetectionMethod;
  technologies: TechMatch[];
  /** Technologies that identify the underlying platform/stack, not just add-ons. */
  platformTechnologies: TechMatch[];
  fallbackRan: boolean;
  probes: ProbeResult[];
  /** What robots.txt said for this host, and which paths it put off-limits. */
  robots?: RobotsReport;
  /** True when robots.txt disallowed the site's own page, so nothing was scanned. */
  blockedByRobots?: boolean;
  /** Set when path probing was skipped because the site 200s on nonexistent URLs. */
  probeWarning?: string;
  /**
   * Set when the host served a bot-challenge or block interstitial instead of
   * the real page, meaning results describe the edge rather than the site.
   */
  warning?: string;
  error?: string;
  durationMs: number;
}

export interface BatchSummary {
  totalSites: number;
  reachable: number;
  /** Sites that failed to answer. Disjoint from `robotsBlocked`. */
  unreachable: number;
  /** Sites where the primary signature pass identified a platform. */
  primaryDetected: number;
  /** Sites the fallback pass rescued after primary found nothing. */
  fallbackDetected: number;
  /** primaryDetected + fallbackDetected. */
  totalDetected: number;
  /** Sites whose robots.txt told us not to fetch the page, so nothing was tried. */
  robotsBlocked: number;
  undetected: number;
  /** Percentages, 0-100, rounded to one decimal. */
  primaryRate: number;
  combinedRate: number;
  /** Percentage-point lift from the fallback pass. */
  improvementPoints: number;
  /** Relative lift over the primary-only baseline, e.g. 40 = 40% more sites identified. */
  improvementRate: number;
  durationMs: number;
}

export interface BatchRun {
  id: string | null;
  createdAt: string;
  label: string | null;
  summary: BatchSummary;
  results: DetectionResult[];
  /** False when Supabase is not configured, so the run was not persisted. */
  persisted: boolean;
}
