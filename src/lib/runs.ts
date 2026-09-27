import { getSupabase } from "./supabase";
import type {
  BatchRun,
  BatchSummary,
  DetectionMethod,
  DetectionResult,
  RobotsReport,
} from "./types";

interface RunRow {
  id: string;
  created_at: string;
  label: string | null;
  total_sites: number;
  reachable: number;
  unreachable: number;
  primary_detected: number;
  fallback_detected: number;
  total_detected: number;
  robots_blocked: number | null;
  undetected: number;
  primary_rate: number;
  combined_rate: number;
  improvement_points: number;
  improvement_rate: number;
  duration_ms: number;
}

interface ResultRow {
  url: string;
  final_url: string | null;
  status: number | null;
  reachable: boolean;
  method: DetectionMethod;
  technologies: DetectionResult["technologies"];
  probes: DetectionResult["probes"];
  fallback_ran: boolean;
  robots: RobotsReport | null;
  blocked_by_robots: boolean | null;
  error: string | null;
  duration_ms: number;
}

function toSummary(row: RunRow): BatchSummary {
  return {
    totalSites: row.total_sites,
    reachable: row.reachable,
    unreachable: row.unreachable,
    primaryDetected: row.primary_detected,
    fallbackDetected: row.fallback_detected,
    totalDetected: row.total_detected,
    // Null on rows written before robots.txt compliance existed.
    robotsBlocked: row.robots_blocked ?? 0,
    undetected: row.undetected,
    primaryRate: Number(row.primary_rate),
    combinedRate: Number(row.combined_rate),
    improvementPoints: Number(row.improvement_points),
    improvementRate: Number(row.improvement_rate),
    durationMs: row.duration_ms,
  };
}

function toResult(row: ResultRow): DetectionResult {
  const technologies = row.technologies ?? [];
  return {
    url: row.url,
    finalUrl: row.final_url,
    status: row.status,
    reachable: row.reachable,
    method: row.method,
    technologies,
    platformTechnologies: technologies.filter((tech) =>
      ["CMS", "Ecommerce", "Site Builder", "Framework"].includes(tech.category),
    ),
    fallbackRan: row.fallback_ran,
    probes: row.probes ?? [],
    robots: row.robots ?? undefined,
    blockedByRobots: row.blocked_by_robots ?? undefined,
    error: row.error ?? undefined,
    durationMs: row.duration_ms,
  };
}

/**
 * Persists a batch run. Storage is best-effort: a Supabase outage should not
 * fail a detection run the user already waited for, so this reports failure
 * through the return value instead of throwing.
 */
export async function saveRun(
  summary: BatchSummary,
  results: DetectionResult[],
  label: string | null,
): Promise<{ id: string | null; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { id: null, error: "Supabase is not configured" };

  const { data: run, error: runError } = await supabase
    .from("detection_runs")
    .insert({
      label,
      total_sites: summary.totalSites,
      reachable: summary.reachable,
      unreachable: summary.unreachable,
      primary_detected: summary.primaryDetected,
      fallback_detected: summary.fallbackDetected,
      total_detected: summary.totalDetected,
      robots_blocked: summary.robotsBlocked,
      undetected: summary.undetected,
      primary_rate: summary.primaryRate,
      combined_rate: summary.combinedRate,
      improvement_points: summary.improvementPoints,
      improvement_rate: summary.improvementRate,
      duration_ms: summary.durationMs,
    })
    .select("id")
    .single();

  if (runError || !run) return { id: null, error: runError?.message ?? "Insert failed" };

  const { error: resultsError } = await supabase.from("detection_results").insert(
    results.map((result) => ({
      run_id: run.id,
      url: result.url,
      final_url: result.finalUrl,
      status: result.status,
      reachable: result.reachable,
      method: result.method,
      technologies: result.technologies,
      probes: result.probes,
      fallback_ran: result.fallbackRan,
      robots: result.robots ?? null,
      blocked_by_robots: result.blockedByRobots ?? false,
      error: result.error ?? null,
      duration_ms: result.durationMs,
    })),
  );

  return { id: run.id, error: resultsError?.message };
}

export async function getLatestRun(): Promise<BatchRun | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: run, error } = await supabase
    .from("detection_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<RunRow>();

  if (error || !run) return null;

  const { data: results } = await supabase
    .from("detection_results")
    .select("*")
    .eq("run_id", run.id)
    .order("created_at", { ascending: true })
    .returns<ResultRow[]>();

  return {
    id: run.id,
    createdAt: run.created_at,
    label: run.label,
    summary: toSummary(run),
    results: (results ?? []).map(toResult),
    persisted: true,
  };
}
