"use client";

import { useState } from "react";
import type { BatchRun, DetectionResult } from "@/lib/types";
import { CoverageChart } from "./CoverageChart";
import { Card, CardHeader, Disclosure, EmptyState, FoundViaBadge, StatTile } from "./ui";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function BatchDemo({
  run,
  isHistoric,
  onRunComplete,
  sampleSize,
  supabaseConfigured,
}: {
  run: BatchRun | null;
  isHistoric: boolean;
  onRunComplete: (run: BatchRun) => void;
  sampleSize: number;
  supabaseConfigured: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  async function runBatch() {
    setLoading(true);
    setError(null);
    setStorageError(null);

    try {
      const response = await fetch("/api/detect-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Batch run failed");
      onRunComplete(data as BatchRun);
      if (data.storageError) setStorageError(data.storageError as string);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Batch run failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-sm font-semibold tracking-tight text-ink">
              {sampleSize} real small-business and independent websites
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
              Runs the quick check on every site, then the deeper check on any it missed,
              and counts how many more sites the deeper check identifies.
            </p>
          </div>
          <button
            type="button"
            onClick={runBatch}
            disabled={loading}
            className="shrink-0 rounded-lg bg-series-1 px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Running…" : run ? "Run it again" : "Run the test"}
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-ink-muted" role="status">
            Checking {sampleSize} websites. This usually takes 30 to 90 seconds.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-critical" role="alert">
            {error}
          </p>
        ) : null}
        {storageError ? (
          <p className="mt-4 text-sm text-ink-secondary">
            Results are shown below but were not saved: {storageError}
          </p>
        ) : null}
        {!supabaseConfigured ? (
          <p className="mt-4 text-xs text-ink-muted">
            No database is set up, so results won&rsquo;t be saved between visits.
          </p>
        ) : null}
      </Card>

      {run ? (
        <>
          <Card>
            <CardHeader
              title="Where every site ended up"
              meta={
                isHistoric
                  ? `Last saved run · ${formatTimestamp(run.createdAt)}`
                  : `This run · ${formatTimestamp(run.createdAt)}`
              }
            />
            <CoverageChart summary={run.summary} />
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Websites checked"
              value={String(run.summary.totalSites)}
              sub={
                run.summary.unreachable > 0
                  ? `${run.summary.unreachable} didn't respond`
                  : "all reachable"
              }
            />
            <StatTile
              label="Identified by the quick check"
              value={`${run.summary.primaryRate}%`}
              sub={`${run.summary.primaryDetected} sites`}
            />
            <StatTile
              label="Identified once both checks ran"
              value={`${run.summary.combinedRate}%`}
              delta={`+${run.summary.improvementPoints} pts`}
              sub={`${run.summary.totalDetected} sites`}
            />
            <StatTile
              label="Added by the deeper check"
              value={String(run.summary.fallbackDetected)}
              sub={
                run.summary.primaryDetected > 0
                  ? `${run.summary.improvementRate}% more than the quick check alone`
                  : "no baseline to compare against"
              }
            />
          </div>

          <Card>
            <CardHeader
              title="All sites"
              meta={`${run.results.length} sites`}
            />
            {run.results.length > 0 ? (
              <ResultsTable results={run.results} />
            ) : (
              <EmptyState>This run has no saved per-site rows.</EmptyState>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState>
            Nothing here yet. Press &ldquo;Run the test&rdquo; to check all {sampleSize} websites.
          </EmptyState>
        </Card>
      )}
    </div>
  );
}

function hostOf(result: DetectionResult): string {
  try {
    return new URL(result.finalUrl ?? result.url).host;
  } catch {
    return result.url;
  }
}

/** What this site was found to be, in one cell. */
function summaryOf(result: DetectionResult): string {
  if (result.blockedByRobots) {
    return result.robots?.state === "unreachable"
      ? "Not checked: couldn't load its robots.txt"
      : "Not checked: the site asked us not to";
  }
  if (result.platformTechnologies.length > 0) {
    return result.platformTechnologies.map((tech) => tech.name).join(", ");
  }
  if (result.technologies.length > 0) {
    return `No platform found (saw ${result.technologies.map((t) => t.name).join(", ")})`;
  }
  return result.error ?? "Nothing found";
}

function ResultsTable({ results }: { results: DetectionResult[] }) {
  // Deeper-check wins first: they are the point of the demo.
  const order = { fallback: 0, primary: 1, none: 2 } as const;
  const sorted = [...results].sort(
    (a, b) => order[a.method] - order[b.method] || hostOf(a).localeCompare(hostOf(b)),
  );

  return (
    <>
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full min-w-[580px] text-left text-sm">
          <caption className="sr-only">
            Every website checked, what was found, and which check found it.
          </caption>
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th scope="col" className="px-2 pb-2 font-medium">
                Website
              </th>
              <th scope="col" className="px-2 pb-2 font-medium">
                What it runs on
              </th>
              <th scope="col" className="px-2 pb-2 font-medium">
                Found by
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((result) => (
              <tr key={result.url} className="border-b border-line/60 last:border-0">
                <th
                  scope="row"
                  className="max-w-[220px] truncate px-2 py-2.5 text-left font-medium text-ink"
                >
                  {hostOf(result)}
                </th>
                <td className="px-2 py-2.5 text-ink-secondary">{summaryOf(result)}</td>
                <td className="px-2 py-2.5">
                  <FoundViaBadge
                    method={result.method}
                    blockedByRobots={result.blockedByRobots}
                    compact
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Disclosure summary="About this table" className="mt-5 border-t border-line pt-4">
        <p>
          &ldquo;What it runs on&rdquo; only lists platforms: a CMS, ecommerce system,
          site builder, or framework. Analytics, payment, CDN, and support tools are
          recorded too, but finding one doesn&rsquo;t count as identifying the site. They
          don&rsquo;t tell you what the site is built with.
        </p>
      </Disclosure>
    </>
  );
}
