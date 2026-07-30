/**
 * Canonical outcome accounting, rendered.
 *
 * The point of this section is the row that has no rate. A results page that shows only wins and
 * losses is showing a curated subset of what it generated, and the rows it drops — a batter who never
 * came to bat, a slate the integrity gate refused — are exactly the ones a reader would most want
 * explained. So every generated row is placed in a bucket, the buckets add up on screen, and the
 * withheld slate keeps its place in the list with an explanation instead of a number.
 *
 * Two absences look identical in a ledger and are not the same thing, so they are rendered as two
 * different rows: a slate we REFUSED to settle (withheld) and a slate that was NEVER PRODUCED (no
 * board ever existed, so there is nothing to grade). A date missing from the accounting is filled in
 * here rather than skipped, because a silent gap in a dated list reads as "nothing went wrong".
 *
 * Every count comes from `results-accounting.ts`. The only arithmetic here is the interval around a
 * rate we were handed, because a rate without its uncertainty invites a conclusion its sample cannot
 * support.
 */
import {
  OUTCOME_LABEL,
  OUTCOME_MEANING,
  type DateAccounting,
  type OutcomeState,
} from "@/lib/research/results-accounting";

const pct = (v: number | null): string => (v == null ? "—" : `${(v * 100).toFixed(2)}%`);

/**
 * Wilson score interval at 95%. Preferred over the textbook normal approximation because it stays
 * inside [0,1] and does not collapse to a zero-width band on a small or lopsided sample — the two
 * cases where a naive interval would most flatter the number it qualifies.
 */
function wilson95(wins: number, decisive: number): { lo: number; hi: number } | null {
  if (!Number.isFinite(wins) || !Number.isFinite(decisive) || decisive <= 0) return null;
  const z = 1.959964;
  const p = wins / decisive;
  const d = 1 + (z * z) / decisive;
  const centre = p + (z * z) / (2 * decisive);
  const spread = z * Math.sqrt((p * (1 - p)) / decisive + (z * z) / (4 * decisive * decisive));
  return { lo: Math.max(0, (centre - spread) / d), hi: Math.min(1, (centre + spread) / d) };
}

/** Every calendar date from `from` to `to` inclusive, as YYYY-MM-DD. Pure; no timezone maths. */
function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return out;
  for (let t = start; t <= end; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

const INTEGRITY_COPY: Record<DateAccounting["integrity"], { label: string; meaning: string; tone: string }> = {
  CLEAN: {
    label: "Complete",
    meaning: "Every generated row reached a final state.",
    tone: "var(--vault-gold)",
  },
  IN_PROGRESS: {
    label: "In progress",
    meaning: "Games are still being played. Rows resolve as they finish; nothing is counted early.",
    tone: "var(--text-mute)",
  },
  PARTIAL: {
    label: "Incomplete",
    meaning: "Some rows on this finished slate never resolved. They are counted, not hidden.",
    tone: "var(--text-mute)",
  },
  QUARANTINED: {
    label: "Withheld",
    meaning: "Settlement was stopped by an integrity check. No outcomes were published.",
    tone: "var(--vault-danger)",
  },
  UNAVAILABLE: {
    label: "Unknown",
    meaning: "We could not read enough to say what happened.",
    tone: "var(--text-mute)",
  },
};

/** The distinct copy for a date with no accounting at all — a slate that was never produced. */
const NEVER_GENERATED = {
  label: "Not produced",
  meaning: "No slate was built for this date, so there is nothing to grade.",
  tone: "var(--text-mute)",
};

/** The buckets, in the order a reader should meet them. */
const BUCKETS: readonly { key: keyof DateAccounting; state: OutcomeState }[] = [
  { key: "wins", state: "WIN" },
  { key: "losses", state: "LOSS" },
  { key: "voids", state: "VOID" },
  { key: "pending", state: "PENDING" },
  { key: "unavailable", state: "UNAVAILABLE" },
  { key: "passes", state: "PASS" },
];

function Row({ a }: { a: DateAccounting }) {
  const integrity = INTEGRITY_COPY[a.integrity];
  const withheld = a.integrity === "QUARANTINED";

  return (
    <li
      className="rounded-[6px] border p-4"
      style={{
        borderColor: withheld ? "var(--vault-danger-dim)" : "var(--vault-border)",
        background: "var(--vault-panel)",
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-[var(--text)]">{a.date}</h3>
        <span className="text-[12px] font-semibold" style={{ color: integrity.tone }}>
          {integrity.label}
        </span>
      </div>
      <p className="mt-1 text-[13px] text-[var(--text-mute)]">{integrity.meaning}</p>

      {withheld ? (
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-mute)]">
          {a.generated.toLocaleString()} rows were generated for this slate. None were graded, so there
          is <strong className="text-[var(--text)]">no win/loss record</strong> for it and it is excluded
          from every rate on this site.
        </p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-3 flex justify-between border-b border-[var(--vault-rule)] pb-1">
              <dt className="text-[13px] font-semibold text-[var(--text)]">Generated</dt>
              <dd className="text-[13px] font-semibold text-[var(--text)]">{a.generated.toLocaleString()}</dd>
            </div>
            {BUCKETS.map((b) => (
              <div key={b.state} className="flex justify-between">
                <dt className="text-[13px] text-[var(--text-mute)]" title={OUTCOME_MEANING[b.state]}>
                  {OUTCOME_LABEL[b.state]}
                </dt>
                <dd className="text-[13px] tabular-nums text-[var(--text)]">
                  {(a[b.key] as number).toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>

          {/* A rate is only shown with the three things that make it readable: how many decided
              results it is over, which slate they came from, and how wide the uncertainty is. With
              no decided results there is no rate — not 0%, not "—" beside a percent sign. */}
          {a.decisive > 0 && a.decisiveHitRate != null ? (
            (() => {
              const ci = wilson95(a.wins, a.decisive);
              return (
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-mute)]">
                  Decisive record{" "}
                  <strong className="text-[var(--text)]">{pct(a.decisiveHitRate)}</strong>{" "}
                  ({a.wins} of {a.decisive} decided results on the {a.date} slate
                  {ci ? `; 95% interval ${pct(ci.lo)}–${pct(ci.hi)}` : ""}). Every generated row is
                  accounted for
                  {a.gap === 0 ? "" : `, except ${a.gap} we could not place`}.
                </p>
              );
            })()
          ) : (
            <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-mute)]">
              No result on this slate has been decided yet, so there is{" "}
              <strong className="text-[var(--text)]">no rate to show</strong> for it. Every generated
              row is accounted for
              {a.gap === 0 ? "" : `, except ${a.gap} we could not place`}.
            </p>
          )}
        </>
      )}

      {a.notes.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {a.notes.map((n) => (
            <li key={n} className="text-[13px] leading-relaxed text-[var(--text-mute)]">
              {n}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** A date the accounting has nothing for, rendered as its own state rather than left as a gap. */
function NotProducedRow({ date }: { date: string }) {
  return (
    <li
      className="rounded-[6px] border border-dashed p-4"
      style={{ borderColor: "var(--vault-border-strong)", background: "var(--vault-panel)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-[var(--text)]">{date}</h3>
        <span className="text-[12px] font-semibold" style={{ color: NEVER_GENERATED.tone }}>
          {NEVER_GENERATED.label}
        </span>
      </div>
      <p className="mt-1 text-[13px] text-[var(--text-mute)]">{NEVER_GENERATED.meaning}</p>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-mute)]">
        Nothing was generated for this date, so there are no rows, no outcomes and{" "}
        <strong className="text-[var(--text)]">no rate</strong>. This is different from a withheld
        slate: there we produced predictions and then refused to publish outcomes for them. Here
        there was never anything to publish.
      </p>
    </li>
  );
}

export default function ResultsAccountingSection({ rows }: { rows: readonly DateAccounting[] }) {
  if (rows.length === 0) return null;

  // Fill the calendar so a date with no accounting is a visible state, not an invisible gap.
  const known = new Map(rows.map((r) => [r.date, r]));
  const sorted = [...rows].map((r) => r.date).sort();
  const span = datesBetween(sorted[0], sorted[sorted.length - 1]);
  const timeline = (span.length > 0 ? span : sorted).slice().reverse();

  return (
    <section aria-labelledby="accounting-heading" className="mt-10">
      <h2
        id="accounting-heading"
        className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-mute)]"
      >
        Every row we generated
      </h2>
      <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-[var(--text-mute)]">
        These counts start from what the model actually produced, not from what happened to be graded.
        A row that never resolved, a slate we withheld, and a date we never produced a slate for each
        keep their place in this list — removing any of them would quietly improve every number
        beside it.
      </p>

      <ul className="mt-4 space-y-3">
        {timeline.map((date) => {
          const a = known.get(date);
          return a ? <Row key={date} a={a} /> : <NotProducedRow key={date} date={date} />;
        })}
      </ul>

      <details className="mt-4 rounded-[6px] border border-[var(--vault-border)] p-4">
        <summary className="cursor-pointer text-[14px] font-semibold text-[var(--text)]">
          What each outcome means
        </summary>
        <dl className="mt-3 space-y-2">
          {(["WIN", "LOSS", "VOID", "PENDING", "UNAVAILABLE", "PASS", "QUARANTINED"] as OutcomeState[]).map(
            (s) => (
              <div key={s}>
                <dt className="text-[13px] font-semibold text-[var(--text)]">{OUTCOME_LABEL[s]}</dt>
                <dd className="text-[13px] leading-relaxed text-[var(--text-mute)]">{OUTCOME_MEANING[s]}</dd>
              </div>
            ),
          )}
        </dl>
      </details>
    </section>
  );
}
