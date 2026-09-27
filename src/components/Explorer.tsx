"use client";

import { useCallback, useState } from "react";
import type { BatchRun } from "@/lib/types";
import { BatchDemo } from "./BatchDemo";
import { Headline, HeadlinePending } from "./Headline";
import { SingleCheck } from "./SingleCheck";

type TabId = "batch" | "single";

/** Labelled from the corpus size so the tab cannot drift out of step with it. */
function tabsFor(sampleSize: number): { id: TabId; label: string }[] {
  return [
    { id: "batch", label: `The ${sampleSize}-site test` },
    { id: "single", label: "Check a website" },
  ];
}

/**
 * Owns the batch run so the headline figure can sit above the tabs, where it is
 * the first thing on the page, while the controls that produce it stay inside
 * the tab they belong to.
 */
export function Explorer({
  initialRun,
  sampleSize,
  supabaseConfigured,
}: {
  initialRun: BatchRun | null;
  sampleSize: number;
  supabaseConfigured: boolean;
}) {
  const [tab, setTab] = useState<TabId>("batch");
  const [run, setRun] = useState<BatchRun | null>(initialRun);
  const [isHistoric, setIsHistoric] = useState(initialRun !== null);

  const onRunComplete = useCallback((next: BatchRun) => {
    setRun(next);
    setIsHistoric(false);
  }, []);

  return (
    <div>
      {run ? (
        <div className="mb-10">
          <Headline summary={run.summary} />
        </div>
      ) : tab === "batch" ? (
        <div className="mb-10">
          <HeadlinePending sampleSize={sampleSize} />
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="Views"
        className="mb-6 inline-flex rounded-lg border border-line bg-sunken p-1"
      >
        {tabsFor(sampleSize).map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1/40 ${
              tab === entry.id
                ? "bg-surface text-ink shadow-[0_1px_2px_rgba(11,11,11,0.06)]"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "batch" ? (
        <BatchDemo
          run={run}
          isHistoric={isHistoric}
          onRunComplete={onRunComplete}
          sampleSize={sampleSize}
          supabaseConfigured={supabaseConfigured}
        />
      ) : (
        <SingleCheck />
      )}
    </div>
  );
}
