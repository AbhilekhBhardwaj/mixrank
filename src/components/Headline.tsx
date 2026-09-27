import type { BatchSummary } from "@/lib/types";

/**
 * Turns two percentages into a sentence someone can read once and repeat.
 *
 * "6 in 10" lands where "61.2%" does not. The rounding is deliberate and the
 * exact figures sit directly above it, so nothing is hidden by the plainer
 * phrasing.
 */
function plainEnglish(summary: BatchSummary): string {
  const missed = Math.round((100 - summary.primaryRate) / 10);
  const found = Math.round(summary.combinedRate / 10);
  return `Without the deeper check, ${missed} in 10 small sites went unidentified. With it, ${found} in 10 are correctly identified.`;
}

/**
 * The headline result, and the first thing anyone should see. Everything else
 * on the page is evidence for this one number.
 */
export function Headline({ summary }: { summary: BatchSummary }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(11,11,11,0.04)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
        How many small sites we can identify
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-5 sm:gap-x-9">
        <Figure value={`${summary.primaryRate}%`} caption="Quick check only" muted />

        <span aria-hidden className="pb-5 text-3xl text-ink-muted sm:pb-7 sm:text-4xl">
          &rarr;
        </span>

        <Figure value={`${summary.combinedRate}%`} caption="With the deeper check" />

        <p className="max-w-xs pb-2 text-sm leading-relaxed text-ink-secondary">
          {plainEnglish(summary)}
        </p>
      </div>

      <p className="mt-6 border-t border-line pt-4 text-sm text-ink-secondary">
        <span className="font-semibold text-good">
          +{summary.improvementPoints} percentage points
        </span>{" "}
        &middot; {summary.fallbackDetected} of {summary.totalSites} sites identified only
        because of the deeper check
      </p>
    </section>
  );
}

/**
 * Stands in for the headline before anything has been measured.
 *
 * Kept at the same size and position as the real figure so the top of the page
 * reads as purposeful on a cold open rather than simply empty -- and deliberately
 * shows no number, because inventing one would undermine the only claim the page
 * makes.
 */
export function HeadlinePending({ sampleSize }: { sampleSize: number }) {
  return (
    <section className="rounded-2xl border border-dashed border-line bg-surface p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
        How many small sites we can identify
      </p>
      <p className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-ink-secondary sm:text-4xl">
        Not measured yet
      </p>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-secondary">
        Press <span className="font-semibold text-ink">Run the test</span> below to check{" "}
        {sampleSize} real websites. You&rsquo;ll see how many the quick check identifies on
        its own, and how many more the deeper check adds.
      </p>
    </section>
  );
}

function Figure({
  value,
  caption,
  muted = false,
}: {
  value: string;
  caption: string;
  muted?: boolean;
}) {
  return (
    <span className="block">
      <span
        className={`block text-5xl font-semibold leading-none tracking-tight tabular-nums sm:text-7xl ${
          muted ? "text-ink-muted" : "text-ink"
        }`}
      >
        {value}
      </span>
      <span className="mt-3 block text-xs font-medium text-ink-secondary sm:text-sm">
        {caption}
      </span>
    </span>
  );
}
