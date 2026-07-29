/**
 * SPRINT 053 — canonical outcome accounting, rendered.
 *
 * The point of this section is the row that has no rate. A results page that shows only wins and
 * losses is showing a curated subset of what it generated, and the rows it drops — a batter who never
 * came to bat, a slate the integrity gate refused — are exactly the ones a reader would most want
 * explained. So every generated row is placed in a bucket, the buckets add up on screen, and the
 * withheld slate keeps its place in the list with an explanation instead of a number.
 *
 * Every value comes from `results-accounting.ts`. This component formats; it does not compute.
 */
import {
  OUTCOME_LABEL,
  OUTCOME_MEANING,
  type DateAccounting,
  type OutcomeState,
} from "@/lib/research/results-accounting";

const pct = (v: number | null): string => (v == null ? "—" : `${(v * 100).toFixed(2)}%`);

const INTEGRITY_COPY: Record<DateAccounting["integrity"], { label: string; meaning: string; tone: string }> = {
  CLEAN: {
    label: "Complete",
    meaning: "Every generated row reached a final state.",
    tone: "var(--vault-gold)",
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

          <p className="mt-3 text-[14px] text-[var(--text-mute)]">
            Decisive record{" "}
            <strong className="text-[var(--text)]">
              {pct(a.decisiveHitRate)}
            </strong>{" "}
            ({a.wins}/{a.decisive}) · every generated row accounted for
            {a.gap === 0 ? "" : `, except ${a.gap} we could not place`}.
          </p>
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

export default function ResultsAccountingSection({ rows }: { rows: readonly DateAccounting[] }) {
  if (rows.length === 0) return null;

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
        A row that never resolved, or a slate we withheld, stays in the count with a reason —
        removing it would quietly improve every number beside it.
      </p>

      <ul className="mt-4 space-y-3">
        {rows.map((a) => (
          <Row key={a.date} a={a} />
        ))}
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
