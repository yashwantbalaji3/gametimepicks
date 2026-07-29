/**
 * SPRINT 054 — the explainer that answers the twelve questions a first-time visitor has.
 *
 * Every number on this site now comes from one canonical contract, but a number a reader cannot
 * interpret is not transparency. This component is the interpretation layer, and it is deliberately
 * built from the SAME artifact the pages render — so an explanation cannot drift from the thing it
 * explains, which is exactly how a hardcoded 51.7% survived on two pages for weeks.
 *
 * The hardest thing to get right here is tone. The honest answers are unflattering: the model is
 * overconfident, no market is approved, and the sportsbook still scores better. Written defensively
 * that reads as a product apologising for itself; written breezily it reads as a product hiding.
 * The aim is neither — state the measurement, state what it does and does not support, move on.
 */
import {
  OUTCOME_LABEL,
  OUTCOME_MEANING,
  type OutcomeState,
} from "@/lib/research/results-accounting";
import type { TerminalView } from "@/lib/research/public-contract-adapter";
import { formatRate } from "@/lib/research/public-contract-adapter";

const REGISTRY_MEANING: Record<string, string> = {
  APPROVED: "Enough settled results, calibrated probabilities, and a better score than the sportsbook on the same rows.",
  MONITOR: "Too few settled results to say anything yet. Reported, never acted on.",
  RECALIBRATE: "A real record exists, but our stated probabilities are not trustworthy enough to lead with.",
  DISABLED: "A large sample sits entirely below break-even. The history stays visible; we make no recommendation from it.",
};

function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--vault-rule)] pt-4">
      <h3 className="text-[15px] font-semibold text-[var(--text)]">{q}</h3>
      <div className="mt-2 space-y-2 text-[14px] leading-relaxed text-[var(--text-mute)]">{children}</div>
    </div>
  );
}

export default function HowToReadThis({ terminal }: { terminal: TerminalView }) {
  const cal = terminal.calibration;
  const mu = terminal.modelUniverse;
  const reg = terminal.registry;
  const quarantine = terminal.quarantines[0] ?? null;

  return (
    <section aria-labelledby="how-to-read-heading" className="mt-12">
      <h2 id="how-to-read-heading" className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-mute)]">
        How to read this site
      </h2>
      <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-[var(--text-mute)]">
        Every figure below is read from the same file the rest of the site renders, so this explanation
        cannot drift from the numbers it describes.
      </p>

      <div className="mt-6 space-y-5">
        <QA q="What are the three probabilities you show?">
          <p>
            <strong className="text-[var(--text)]">Raw simulation estimate</strong> — what the model
            produced, unmodified. It is kept as evidence and never overwritten.
          </p>
          <p>
            <strong className="text-[var(--text)]">Historically calibrated estimate</strong> — the raw
            number corrected using what actually happened on earlier slates.
          </p>
          <p>
            <strong className="text-[var(--text)]">Sportsbook no-vig estimate</strong> — derived from{" "}
            <em>both</em> sides of the sportsbook&rsquo;s price, with the bookmaker&rsquo;s margin removed.
            It is their number, not ours, and we use it as the benchmark.
          </p>
        </QA>

        <QA q="Why is the calibrated estimate different from the raw one?">
          {mu ? (
            <p>
              Because the raw model is systematically overconfident. Across{" "}
              {mu.decisiveRows.toLocaleString()} settled results it stated about{" "}
              {formatRate(mu.hitRate == null || mu.overconfidencePp == null ? null : mu.hitRate + mu.overconfidencePp / 100, 0)}{" "}
              on average and was right {formatRate(mu.hitRate, 0)} of the time — about{" "}
              {mu.overconfidencePp?.toFixed(1)} percentage points too confident.
            </p>
          ) : null}
          <p>
            Calibration maps those stated probabilities onto observed frequencies, so the number you see
            is closer to true. <strong className="text-[var(--text)]">It does not create new predictive
            information.</strong> It changes how confident we sound, not what we know.
          </p>
        </QA>

        <QA q="Has the model shown it can out-predict the sportsbook?">
          <p className="text-[var(--text)]">No.</p>
          {cal ? (
            <p>
              On {cal.heldOutWindow.rows.toLocaleString()} results the calibrator never saw, calibration
              improved our score (Brier {cal.rawBrier.toFixed(4)} → {cal.calibratedBrier.toFixed(4)};
              lower is better). On those same rows the sportsbook&rsquo;s own no-vig price scored{" "}
              {cal.marketBrier.toFixed(4)} — still better than ours.
            </p>
          ) : null}
          <p>
            That is the current state of the evidence. If it changes, it will change because a
            preregistered experiment showed it on held-out data, not because the wording changed.
          </p>
        </QA>

        <QA q="What do the market statuses mean?">
          <dl className="space-y-2">
            {Object.entries(REGISTRY_MEANING).map(([status, meaning]) => (
              <div key={status}>
                <dt className="text-[13px] font-semibold text-[var(--text)]">{status}</dt>
                <dd className="text-[13px] leading-relaxed">{meaning}</dd>
              </div>
            ))}
          </dl>
          {reg?.noneApproved ? (
            <p className="mt-2">
              <strong className="text-[var(--text)]">No market is currently APPROVED.</strong> {reg.statusNote}
            </p>
          ) : null}
        </QA>

        <QA q="What happened to every prediction you generated?">
          <p>
            Each one lands in exactly one of these states, and the counts add up to the number generated.
            Rows we cannot grade stay in the count — removing them would quietly improve every rate
            beside them.
          </p>
          <dl className="mt-2 space-y-2">
            {(["WIN", "LOSS", "VOID", "PENDING", "UNAVAILABLE", "PASS", "QUARANTINED"] as OutcomeState[]).map((s) => (
              <div key={s}>
                <dt className="text-[13px] font-semibold text-[var(--text)]">{OUTCOME_LABEL[s]}</dt>
                <dd className="text-[13px] leading-relaxed">{OUTCOME_MEANING[s]}</dd>
              </div>
            ))}
          </dl>
        </QA>

        {quarantine ? (
          <QA q={`Why is ${quarantine.date} withheld?`}>
            <p>{quarantine.publicExplanation}</p>
            <p>
              We could have published something for that day. Publishing a result we know was graded
              against the wrong game would be worse than publishing nothing.
            </p>
          </QA>
        ) : null}

        <QA q="How is the paper record different from the model history?">
          <p>
            They are two different things over two different date ranges, and we never combine them.
          </p>
          <p>
            The <strong className="text-[var(--text)]">paper record</strong> is a small set of
            founder-approved paper selections. The{" "}
            <strong className="text-[var(--text)]">model history</strong> is every prediction the model
            generated — {mu ? mu.decisiveRows.toLocaleString() : "tens of thousands of"} settled rows.
            Neither is evidence about the other.
          </p>
        </QA>

        <QA q="How do I know today's data is current?">
          <p>
            The <strong className="text-[var(--text)]">System Status</strong> page reports every stage of
            the pipeline separately, and the overall state is the worst of them — we do not average a
            failure away behind several successes. A stage we cannot read reports as unknown, never as
            working.
          </p>
        </QA>

        <QA q="What is still unproven?">
          <p>
            The model does not out-predict the sportsbook. No market meets the approval bar. Historical
            settled rows predate our current event-identity checks and are labelled as legacy rather than
            retroactively stamped with lineage they never had.
          </p>
          <p>
            GameTimePicks is paper-only and educational. Nothing here is betting advice.
          </p>
        </QA>
      </div>
    </section>
  );
}
