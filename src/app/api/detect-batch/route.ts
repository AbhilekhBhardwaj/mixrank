import { NextResponse } from "next/server";
import { detectBatch, summarize } from "@/lib/detection";
import { SAMPLE_BATCH_LABEL, SAMPLE_SITES } from "@/lib/sample-sites";
import { enforceRateLimit } from "@/lib/rate-limit";
import { saveRun } from "@/lib/runs";
import type { BatchRun } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Guards the demo against someone posting a few thousand URLs. */
const MAX_URLS = 100;

/**
 * A batch fans out to several hundred outbound requests, so this is much
 * tighter than the single-site limit.
 */
const REQUESTS_PER_MINUTE = 3;

export async function POST(request: Request) {
  const limit = enforceRateLimit(request, "detect-batch", REQUESTS_PER_MINUTE);
  if (limit.blocked) return limit.blocked;

  const fail = (error: string, status: number) =>
    NextResponse.json({ error }, { status, headers: limit.headers });

  let body: { urls?: unknown; label?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is valid: it means "run the built-in sample batch".
  }

  let urls: string[];
  let label: string | null;

  if (body.urls === undefined) {
    urls = SAMPLE_SITES;
    label = SAMPLE_BATCH_LABEL;
  } else {
    if (!Array.isArray(body.urls)) {
      return fail("`urls` must be an array of strings", 400);
    }
    urls = body.urls.filter((u): u is string => typeof u === "string" && u.trim() !== "");
    label = typeof body.label === "string" && body.label.trim() !== "" ? body.label.trim() : null;
  }

  if (urls.length === 0) return fail("No URLs to check", 400);
  if (urls.length > MAX_URLS) {
    return fail(`Too many URLs: ${urls.length} (max ${MAX_URLS})`, 400);
  }

  const startedAt = Date.now();
  const results = await detectBatch(urls);
  const summary = summarize(results, Date.now() - startedAt);

  const { id, error } = await saveRun(summary, results, label);

  const run: BatchRun = {
    id,
    createdAt: new Date().toISOString(),
    label,
    summary,
    results,
    persisted: id !== null,
  };

  return NextResponse.json({ ...run, storageError: error ?? null }, { headers: limit.headers });
}
