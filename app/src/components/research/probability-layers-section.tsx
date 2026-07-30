/**
 * The probability layers, side by side, on the slate page.
 *
 * The intro here is deliberately two sentences. The full walkthrough of what each layer is lives once,
 * on /learn, and this section links to it — the same explanation used to be written out in full on
 * four pages, which meant four copies to keep true.
 *
 * The layout puts the calibrated estimate first and the raw estimate last, deliberately. The raw
 * number is the largest and the least trustworthy — it runs about nine points hot — so leading with it
 * would give the most prominence to the least defensible figure. The sportsbook's own number sits
 * between them because it is the benchmark, not a competitor we are beating.
 *
 * Rows are in EVENT-TIME order. Sorting by probability would rank the model's confidence as if it
 * predicted quality, and the measured record says the opposite: the highest-confidence grouping has
 * the worst hit rate.
 */
import Link from "next/link";

import {
  type ProbabilityRow,
} from "@/lib/research/probability-rows-loader";

const pct = (v: number | null | undefined): string =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;

const STATUS_NOTE: Record<string, string> = {
  APPROVED: "meets the evidence bar",
  MONITOR: "too few settled results to judge",
  RECALIBRATE: "does not out-score the sportsbook here",
  DISABLED: "poor measured record — shown for research only",
};

function Layer({ label, value, note, emphasis }: { label: string; value: string; note: string; emphasis?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-[var(--text-mute)]">{label}</dt>
      <dd
        className={`tabular-nums ${emphasis ? "text-[18px] font-bold text-[var(--text)]" : "text-[15px] text-[var(--text)]"}`}
      >
        {value}
      </dd>
      <dd className="text-[11px] leading-snug text-[var(--text-mute)]">{note}</dd>
    </div>
  );
}

export default function ProbabilityLayersSection({
  rows,
  slateDate,
}: {
  rows: readonly ProbabilityRow[];
  slateDate: string;
}) {
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="prob-layers-heading" className="mt-10">
      <h2
        id="prob-layers-heading"
        className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-mute)]"
      >
        Three estimates for the same question
      </h2>
      <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-[var(--text-mute)]">
        Our raw simulation, that number corrected against past results, and the sportsbook&rsquo;s own
        price with its margin removed. Listed by start time — never ranked by our own confidence,
        because the measured record shows our most confident calls are our worst.{" "}
        <Link href="/learn#probabilities" className="underline underline-offset-2 text-[var(--text)]">
          What these three mean
        </Link>
        .
      </p>

      <ul className="mt-4 space-y-3">
        {rows.map((r) => {
          const withheld = r.eligibility.treatment === "SHOW_WITHOUT_PROBABILITY";
          return (
            <li
              key={r.id}
              className="rounded-[6px] border border-[var(--vault-border)] p-4"
              style={{ background: "var(--vault-panel)" }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-[15px] font-semibold text-[var(--text)]">
                  {r.player}{" "}
                  <span className="font-normal text-[var(--text-mute)]">
                    {r.market}
                    {r.line == null ? "" : ` ${r.side === "over" ? "over" : "under"} ${r.line}`}
                  </span>
                </h3>
                <span className="text-[12px] text-[var(--text-mute)]">
                  {r.matchup}
                  {r.startTime ? ` · ${r.startTime.slice(11, 16)} UTC` : ""}
                </span>
              </div>

              {withheld ? (
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-mute)]">
                  {r.eligibility.disclosure}
                </p>
              ) : (
                <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Layer
                    label="Calibrated estimate"
                    value={pct(r.layers.calibrated ?? r.layers.raw)}
                    note={
                      r.layers.displayedSource === "calibrated"
                        ? "corrected against past results"
                        : "not calibrated — shown raw"
                    }
                    emphasis
                  />
                  <Layer
                    label="Sportsbook (no-vig)"
                    value={pct(r.layers.market)}
                    note="their price, margin removed"
                  />
                  <Layer
                    label="Raw simulation"
                    value={pct(r.layers.raw)}
                    note="unadjusted model output"
                  />
                </dl>
              )}

              <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-mute)]">
                <span className="font-semibold text-[var(--text)]">{r.registryStatus}</span>
                {" — "}
                {STATUS_NOTE[r.registryStatus] ?? "status unknown"}
                {r.registrySample > 0 ? ` · ${r.registrySample.toLocaleString()} settled results in this market` : ""}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[13px] leading-relaxed text-[var(--text-mute)]">
        Slate {slateDate}. Calibration makes our stated probability more accurate; it does not mean we
        out-predict the sportsbook — measured on held-out results, we do not. Paper-only and
        educational.
      </p>
    </section>
  );
}
