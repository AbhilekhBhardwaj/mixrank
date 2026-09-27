"use client";

import { useState } from "react";
import type { BatchSummary } from "@/lib/types";

type SegmentKey = "primary" | "fallback" | "robots" | "undetected";

interface Segment {
  key: SegmentKey;
  label: string;
  count: number;
  fill: string;
  description: string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * One 100%-of-corpus track, split by how each site was resolved. The headline
 * percentages live in the hero above, so this chart carries the breakdown
 * rather than repeating the figure.
 */
export function CoverageChart({ summary }: { summary: BatchSummary }) {
  const [hovered, setHovered] = useState<SegmentKey | null>(null);

  const segments: Segment[] = [
    {
      key: "primary",
      label: "Found by the quick check",
      count: summary.primaryDetected,
      fill: "bg-series-1",
      description: "Spotted right away in the site's homepage code.",
    },
    {
      key: "fallback",
      label: "Found by the deeper check",
      count: summary.fallbackDetected,
      fill: "bg-series-2",
      description:
        "The homepage had no clear signs, so we checked other files the site publishes.",
    },
    {
      key: "robots",
      label: "Skipped to respect crawling rules",
      count: summary.robotsBlocked,
      fill: "bg-grid",
      description:
        "The site's robots.txt asks tools to stay away, or we couldn't load it. We didn't fetch anything or guess.",
    },
    {
      key: "undetected",
      label: "Still unidentified",
      count: summary.undetected,
      fill: "bg-baseline",
      description: "Both checks ran, but neither could tell what the site is built with.",
    },
  ];

  const total = Math.max(summary.totalSites, 1);
  // A zero-count segment would render as a hairline gap, so only real ones draw.
  const visible = segments.filter((segment) => segment.count > 0);
  const share = (count: number) => Math.round((count / total) * 1000) / 10;

  return (
    <div>
      <div className="relative">
        {hovered ? <Tooltip segments={segments} total={total} hovered={hovered} /> : null}

        <div
          className="flex h-4 w-full gap-[2px] overflow-hidden rounded"
          role="img"
          aria-label={`Of ${summary.totalSites} sites: ${summary.primaryDetected} found by the quick check, ${summary.fallbackDetected} found by the deeper check, ${summary.robotsBlocked} skipped to respect crawling rules, ${summary.undetected} still unidentified.`}
          onMouseLeave={() => setHovered(null)}
        >
          {visible.map((segment) => (
            <div
              key={segment.key}
              className={`${segment.fill} h-full transition-opacity duration-150 ${
                hovered && hovered !== segment.key ? "opacity-40" : "opacity-100"
              }`}
              style={{ width: `${(segment.count / total) * 100}%` }}
              onMouseEnter={() => setHovered(segment.key)}
            />
          ))}
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((segment) => (
            <div
              key={segment.key}
              className="flex items-baseline gap-2 transition-opacity duration-150"
              style={{ opacity: hovered && hovered !== segment.key ? 0.5 : 1 }}
              onMouseEnter={() => setHovered(segment.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <span
                className={`${segment.fill} mt-1.5 h-2 w-2 shrink-0 rounded-full`}
                aria-hidden
              />
              <div className="min-w-0">
                <dt className="text-xs leading-snug text-ink-secondary">{segment.label}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                  {segment.count}
                  <span className="ml-1.5 font-normal text-ink-muted">
                    {share(segment.count)}%
                  </span>
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>

      <p className="mt-6 border-t border-line pt-4 text-xs text-ink-muted">
        {summary.totalSites} websites &middot; {summary.reachable} responded &middot; took{" "}
        {formatDuration(summary.durationMs)}
      </p>
    </div>
  );
}

function Tooltip({
  segments,
  total,
  hovered,
}: {
  segments: Segment[];
  total: number;
  hovered: SegmentKey;
}) {
  const index = segments.findIndex((segment) => segment.key === hovered);
  const segment = segments[index];
  const before = segments.slice(0, index).reduce((sum, s) => sum + s.count, 0);
  const center = ((before + segment.count / 2) / total) * 100;

  return (
    <div
      className="pointer-events-none absolute bottom-full z-10 mb-2 w-60 -translate-x-1/2 rounded-lg border border-line bg-surface p-3 text-left shadow-lg"
      style={{ left: `${Math.min(Math.max(center, 16), 84)}%` }}
    >
      <p className="text-xs font-semibold text-ink">{segment.label}</p>
      <p className="mt-1 text-xs text-ink-secondary">
        {segment.count} sites &middot; {Math.round((segment.count / total) * 1000) / 10}%
      </p>
      <p className="mt-2 text-xs leading-snug text-ink-muted">{segment.description}</p>
    </div>
  );
}
