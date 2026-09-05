/**
 * THE CANDIDATE READOUT — Program 234 · Release H.
 *
 * What the model-evaluation machinery currently says, published where the rest of the settled record
 * lives. Deliberately small: current version, cohort, n, coverage, metric delta, verdict, and the
 * condition under which the next evaluation may run.
 *
 * The verdict a reader is most likely to see here is a refusal, and that is the point. A candidate
 * that beat the incumbent on a window scored before the terms were written down is reported as
 * INCONCLUSIVE — the number cleared the bar and the process did not, and the process is what makes
 * the number mean anything. Nothing on this page or behind it promotes a model.
 */
import type { ReactNode } from "react";

export interface ReadoutRow {
  id: string; sport: string; state: string;
  candidate: string; incumbent: string; metric: string;
  cohort: [string | null, string | null];
  n: number; coverage: number | null; delta: number | null;
  verdict: string; reasons: string[];
  nextEvaluationCondition: string | null;
}

/** Colour never carries the meaning alone — the verdict word is always printed. */
const TONE: Record<string, string> = {
  PROMOTION_EARNED: "var(--vault-success)",
  REJECTED: "var(--vault-text-mute)",
  INCONCLUSIVE: "var(--vault-gold-bright)",
  INSUFFICIENT_SAMPLE: "var(--vault-text-mute)",
  INSUFFICIENT_COVERAGE: "var(--vault-text-mute)",
  WINDOW_NOT_OPEN: "var(--vault-text-faint)",
  LEAKED: "var(--vault-danger)",
  INVALID: "var(--vault-danger)",
};

export default function CandidateReadout({ rows, auditRange }: { rows: ReadoutRow[]; auditRange: [string, string] | null }): ReactNode {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="candidate-readout-h" className="mt-10 flex flex-col gap-3">
      <h2 id="candidate-readout-h" className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 750 }}>
        Candidate models, under terms fixed in advance
      </h2>
      <p className="m-0 text-[13px] leading-relaxed max-w-2xl" style={{ color: "var(--vault-text-mute)" }}>
        A candidate is compared with the model in use on the same settled rows, scored on the same
        metric, against a bar written down before the window opened. Daily grading is not daily
        improvement, and a candidate cannot promote itself: every verdict below is a reading, and
        promotion is a separate act a person performs.
        {auditRange ? <> Scored over {auditRange[0]} → {auditRange[1]}.</> : null}
      </p>

      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-[10px] px-3.5 py-3 flex flex-col gap-1.5"
            style={{ border: "1px solid var(--vault-border)", background: "var(--vault-wash-faint)" }}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: TONE[r.verdict] ?? "var(--vault-text-mute)", fontSize: 10.5, fontWeight: 700 }}>
                {r.verdict.replaceAll("_", " ")}
              </span>
              <span style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 650 }}>
                {r.candidate} vs {r.incumbent}
              </span>
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
                {r.sport.toUpperCase()} · {r.state.replaceAll("_", " ").toLowerCase()}
              </span>
            </div>
            <div className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
              {r.cohort[0] ?? "—"} → {r.cohort[1] ?? "—"} · n={r.n.toLocaleString()}
              {r.coverage != null ? ` · coverage ${(r.coverage * 100).toFixed(1)}%` : ""}
              {/* The delta is printed only where one was computed — a refused evaluation has none,
                  and inventing a zero would read as "no difference" rather than "not measured". */}
              {r.delta != null ? ` · ${r.metric} ${r.delta >= 0 ? "−" : "+"}${Math.abs(r.delta).toFixed(4)} vs incumbent` : ` · ${r.metric} not measured`}
            </div>
            {r.reasons.map((reason, i) => (
              <p key={i} className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.55 }}>{reason}</p>
            ))}
            {r.nextEvaluationCondition ? (
              <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 11.5, lineHeight: 1.55 }}>
                <strong style={{ color: "var(--vault-text-mute)" }}>Next:</strong> {r.nextEvaluationCondition}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <p className="m-0 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10, lineHeight: 1.6 }}>
        Reproduce: npx tsx scripts/model-learning-audit.mjs --json /tmp/audit.json &amp;&amp; npx tsx scripts/model-eval/evaluate-candidate.mjs --audit /tmp/audit.json
      </p>
    </section>
  );
}
