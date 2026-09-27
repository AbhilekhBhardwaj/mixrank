"use client";

import { useState } from "react";
import type { DetectionResult, EvidenceSource } from "@/lib/types";
import { Card, CardHeader, Disclosure, EmptyState, FoundViaBadge, TechBadge } from "./ui";

/** Where a piece of evidence came from, in words rather than field names. */
const SOURCE_LABEL: Record<EvidenceSource, string> = {
  html: "The page itself",
  header: "The server's reply",
  robots: "The site's robots.txt",
  sitemap: "The site's sitemap",
  "path-probe": "A known admin page",
};

export function SingleCheck() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Detection failed");
      setResult(data as DetectionResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Detection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Check any website"
          meta="Runs the quick check first, and the deeper check only if needed"
        />
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="example.com"
            aria-label="Website address"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-series-1 focus:outline-none focus:ring-2 focus:ring-series-1/20"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="shrink-0 rounded-lg bg-series-1 px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Checking…" : "Check it"}
          </button>
        </form>

        {error ? (
          <p className="mt-4 text-sm text-critical" role="alert">
            {error}
          </p>
        ) : null}
      </Card>

      {result ? <ResultCard result={result} /> : null}
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

/** The single sentence that answers "so what is this site?". */
function verdictOf(result: DetectionResult): string {
  if (result.blockedByRobots) return "Not checked";
  if (result.error) return "Could not reach this site";
  if (result.platformTechnologies.length > 0) {
    return result.platformTechnologies.map((tech) => tech.name).join(" + ");
  }
  return "Couldn't tell";
}

function subVerdictOf(result: DetectionResult): string {
  if (result.blockedByRobots) {
    // "Asked us not to" and "rules could not be loaded" are different reasons
    // to stop; the robots summary already says which one applies.
    return (
      result.robots?.summary ??
      "This site's robots.txt asks tools to stay away, so we didn't fetch anything."
    );
  }
  if (result.error) return result.error;
  if (result.platformTechnologies.length > 0) {
    const others = result.technologies.filter((tech) => !result.platformTechnologies.includes(tech));
    return others.length > 0
      ? `Also spotted: ${others.map((tech) => tech.name).join(", ")}`
      : "That's what this site is built with.";
  }
  if (result.technologies.length > 0) {
    return `We couldn't find the platform, but we did spot: ${result.technologies
      .map((tech) => tech.name)
      .join(", ")}.`;
  }
  return "Neither check found any sign of what this site is built with.";
}

function ResultCard({ result }: { result: DetectionResult }) {
  const identified = result.platformTechnologies.length > 0;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink-muted">{hostOf(result)}</p>
          <h2
            className={`mt-1.5 text-3xl font-semibold tracking-tight ${
              identified ? "text-ink" : "text-ink-secondary"
            }`}
          >
            {verdictOf(result)}
          </h2>
        </div>
        <FoundViaBadge method={result.method} blockedByRobots={result.blockedByRobots} />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{subVerdictOf(result)}</p>

      {result.robots && !result.blockedByRobots ? (
        <p className="mt-4 rounded-lg border border-line bg-sunken px-4 py-3 text-xs leading-relaxed text-ink-secondary">
          {result.robots.summary}
          {result.robots.skipped.length > 0
            ? ` ${result.robots.skipped.length} ${
                result.robots.skipped.length === 1 ? "page was" : "pages were"
              } skipped because the site asked.`
            : null}
        </p>
      ) : null}

      {result.warning ? (
        <p className="mt-4 rounded-lg border border-series-2 bg-sunken px-4 py-3 text-sm leading-relaxed text-ink-secondary">
          {result.warning}
        </p>
      ) : null}

      {result.technologies.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {result.technologies.map((tech) => (
            <TechBadge key={tech.name} tech={tech} />
          ))}
        </div>
      ) : null}

      {!identified && !result.error && !result.blockedByRobots ? (
        <div className="mt-5">
          <EmptyState>
            Some sites are built by hand and don&rsquo;t use a platform at all, so
            &ldquo;couldn&rsquo;t tell&rdquo; can be the right answer.
          </EmptyState>
        </div>
      ) : null}

      <Disclosure summary="Technical details" className="mt-6 border-t border-line pt-4">
        <dl className="space-y-1.5 font-mono text-xs text-ink-muted">
          <div className="flex gap-2">
            <dt className="shrink-0">Final URL</dt>
            <dd className="min-w-0 break-all text-ink-secondary">
              {result.finalUrl ?? "none"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0">Response</dt>
            <dd className="text-ink-secondary">
              {result.status !== null ? `HTTP ${result.status}` : "none"} ·{" "}
              {`${result.durationMs}ms`}
            </dd>
          </div>
          {result.robots && result.robots.skipped.length > 0 ? (
            <div className="flex gap-2">
              <dt className="shrink-0">Disallowed by robots.txt, not fetched</dt>
              <dd className="min-w-0 break-all text-ink-secondary">
                {result.robots.skipped.join(", ")}
              </dd>
            </div>
          ) : null}
        </dl>

        {result.technologies.length > 0 ? (
          <table className="mt-4 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th scope="col" className="pb-2 font-medium">
                  Technology
                </th>
                <th scope="col" className="pb-2 font-medium">
                  Evidence came from
                </th>
                <th scope="col" className="pb-2 font-medium">
                  What was seen
                </th>
              </tr>
            </thead>
            <tbody>
              {result.technologies.map((tech) => (
                <tr key={tech.name} className="border-b border-line/60 last:border-0">
                  <th scope="row" className="py-2 pr-4 text-left font-medium text-ink">
                    {tech.name}
                  </th>
                  <td className="py-2 pr-4 text-ink-secondary">{SOURCE_LABEL[tech.source]}</td>
                  <td className="py-2 text-ink-muted">{tech.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {result.fallbackRan ? <ProbeList result={result} /> : null}
      </Disclosure>
    </Card>
  );
}

function ProbeList({ result }: { result: DetectionResult }) {
  return (
    <div className="mt-5">
      <p className="text-xs font-semibold text-ink">Admin pages the deeper check tried</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Each platform keeps its login page at a different address, so finding one is a
        clue. We also request a page that can&rsquo;t exist and compare the two, so a site
        that says &ldquo;yes&rdquo; to everything can&rsquo;t produce a false match.
      </p>

      {result.probeWarning ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-secondary">{result.probeWarning}</p>
      ) : null}

      <ul className="mt-3 space-y-1.5">
        {result.probes.map((probe) => (
          <li key={probe.path} className="flex flex-wrap items-baseline gap-x-3 text-xs">
            <span className="font-mono text-ink-secondary">{probe.path}</span>
            <span
              className={`font-mono ${probe.meaningful ? "text-series-2" : "text-ink-muted"}`}
            >
              {probe.status ?? "not requested"}
            </span>
            {probe.note ? <span className="text-ink-muted">{probe.note}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
