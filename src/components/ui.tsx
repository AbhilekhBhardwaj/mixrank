import type { ReactNode } from "react";
import type { Confidence, DetectionMethod, TechMatch } from "@/lib/types";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(11,11,11,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
      {meta ? <p className="text-xs text-ink-muted">{meta}</p> : null}
    </header>
  );
}

/**
 * The two checks, named the way a reader with no background would name them.
 * Every user-facing string for a pass comes from here, so the vocabulary cannot
 * drift between the chart, the table, and the single-site view.
 */
export const CHECK_COPY: Record<DetectionMethod, { name: string; found: string; detail: string }> =
  {
    primary: {
      name: "Quick check",
      found: "Found via: Quick check",
      detail: "Spotted right away in the site's homepage code.",
    },
    fallback: {
      name: "Deeper check",
      found: "Found via: Deeper check",
      detail:
        "The homepage had no clear signs, so we checked other files the site publishes.",
    },
    none: {
      name: "Not identified",
      found: "Not identified",
      detail: "Neither check could tell what this site is built with.",
    },
  };

export const ROBOTS_SKIPPED_COPY = {
  name: "Skipped",
  found: "Skipped: site's crawling rules",
  detail:
    "This site's robots.txt asks tools to stay away, or we couldn't load it. Either way, we didn't fetch anything.",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "Strong evidence",
  medium: "Good evidence",
  low: "Weak evidence",
};

/**
 * A technology chip. The dot carries the check that found it; the text label
 * always accompanies it, so identity never rests on color alone.
 */
export function TechBadge({ tech }: { tech: TechMatch }) {
  const dot = tech.method === "primary" ? "bg-series-1" : "bg-series-2";
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-line bg-sunken px-3 py-1 text-xs font-medium text-ink"
      title={`${tech.category} · ${CONFIDENCE_LABEL[tech.confidence]} · ${tech.evidence}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      {tech.name}
      {tech.confidence !== "high" ? (
        <span className="text-ink-muted">{CONFIDENCE_LABEL[tech.confidence].toLowerCase()}</span>
      ) : null}
    </span>
  );
}

/**
 * Says which check found the answer, in words rather than method names.
 * `compact` drops the "Found via:" prefix for dense table cells, where the
 * column heading already supplies it.
 */
export function FoundViaBadge({
  method,
  blockedByRobots = false,
  compact = false,
}: {
  method: DetectionMethod;
  blockedByRobots?: boolean;
  compact?: boolean;
}) {
  const copy = blockedByRobots ? ROBOTS_SKIPPED_COPY : CHECK_COPY[method];

  const tone = blockedByRobots
    ? "border-dashed border-line text-ink-muted"
    : method === "primary"
      ? "border-series-1 text-series-1"
      : method === "fallback"
        ? "border-series-2 text-series-2"
        : "border-line text-ink-muted";

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${tone}`}
      title={copy.detail}
    >
      {compact ? copy.name : copy.found}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight text-ink">{value}</span>
        {delta ? <span className="text-xs font-semibold text-good">{delta}</span> : null}
      </p>
      {sub ? <p className="mt-1 text-xs leading-snug text-ink-secondary">{sub}</p> : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm leading-relaxed text-ink-muted">
      {children}
    </p>
  );
}

/**
 * Collapsed-by-default detail. Built on <details> so it works without
 * JavaScript, is keyboard-operable, and is announced correctly by screen
 * readers -- none of which a div-and-useState version gets for free.
 */
export function Disclosure({
  summary,
  children,
  className = "",
}: {
  summary: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded text-xs font-semibold text-ink-secondary transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1/40">
        <span
          aria-hidden
          className="inline-block text-ink-muted transition-transform duration-150 group-open:rotate-90"
        >
          &#9656;
        </span>
        {summary}
      </summary>
      <div className="mt-3 text-sm leading-relaxed text-ink-secondary">{children}</div>
    </details>
  );
}
