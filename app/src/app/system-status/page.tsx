/**
 * SPRINT 051 — the System Status page.
 *
 * Built first, deliberately. It is the smallest surface that consumes the public research contract and
 * the one where dishonesty is most costly: a status page that shows green while a settlement was
 * refused is worse than having no status page at all, because it teaches the reader to stop checking.
 *
 * DESIGN RULES ENFORCED HERE
 *   · every value comes from the adapter — this file performs no arithmetic on rates;
 *   · "running late" reads differently from "failed", because a scheduler that habitually starts two
 *     hours after its cron is not an outage and conflating the two teaches people to ignore both;
 *   · status is never carried by colour alone — each row states its condition in words;
 *   · an unreadable contract renders as "unknown", never as healthy.
 */
import type { Metadata } from "next";
import Link from "next/link";

import {
  STATE_LABEL,
  STATE_MEANING,
  type StageState,
  loadSystemStatus,
  loadTerminal,
} from "@/lib/research/public-contract-adapter";

export const metadata: Metadata = {
  title: "System Status — GameTimePicks",
  description:
    "Live status of every stage in the GameTimePicks research pipeline: data capture, settlement, prediction history, calibration, market registry, and the daily research brief.",
};

/**
 * Visual treatment per state.
 *
 * `mark` is a text glyph rather than a coloured dot alone — colour is a reinforcement here, never the
 * carrier of meaning, so the page stays readable in monochrome and to a screen reader.
 */
const TREATMENT: Record<StageState, { mark: string; tone: string; border: string }> = {
  READY: { mark: "OK", tone: "var(--vault-gold)", border: "var(--vault-border)" },
  DUE: { mark: "··", tone: "var(--text-mute)", border: "var(--vault-border)" },
  DELAYED_WITHIN_GRACE: { mark: "~", tone: "var(--text-mute)", border: "var(--vault-border)" },
  FAILED: { mark: "!", tone: "var(--vault-danger)", border: "var(--vault-danger-dim)" },
  QUARANTINED: { mark: "◇", tone: "var(--vault-danger)", border: "var(--vault-danger-dim)" },
  STALE: { mark: "△", tone: "var(--text-mute)", border: "var(--vault-border-strong)" },
  UNAVAILABLE: { mark: "?", tone: "var(--text-mute)", border: "var(--vault-border-strong)" },
};

/** Human names for the pipeline stages the contract reports. */
const STAGE_LABEL: Record<string, string> = {
  predictionHistory: "Prediction history",
  calibrationArtifact: "Calibration",
  marketRegistry: "Market registry",
  dailyResearchBrief: "Daily research brief",
  latestSettlement: "Latest settlement",
};

/**
 * The contract states its reason as `latestSettlement is QUARANTINED` — precise for an operator and
 * wrong for a reader. Swap the stage key for its human label without altering the meaning.
 */
function humaniseReason(reason: string): string {
  let out = reason;
  for (const [key, label] of Object.entries(STAGE_LABEL)) out = out.replace(key, label.toLowerCase());
  return out.replace(/\b([A-Z_]{4,})\b/g, (m) => (STATE_LABEL as Record<string, string>)[m]?.toLowerCase() ?? m);
}

function StateBadge({ state }: { state: StageState }) {
  const t = TREATMENT[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[12px] font-semibold"
      style={{ color: t.tone, borderColor: t.border }}
    >
      <span aria-hidden>{t.mark}</span>
      {STATE_LABEL[state]}
    </span>
  );
}

export default function SystemStatusPage() {
  const status = loadSystemStatus();
  const terminal = loadTerminal();

  return (
    <div className="mx-auto max-w-[820px] px-4 sm:px-6 py-10">
      <header>
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--text-mute)]">
          System status
        </p>
        <h1 className="mt-2 text-[26px] sm:text-[32px] font-bold leading-tight text-[var(--text)]">
          What is working, and what is not
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-mute)]">
          Every stage below reports for itself. The overall state is the worst of them — we do not
          average a failure away behind four successes.
        </p>
      </header>

      {/* Overall */}
      <section aria-labelledby="overall-heading" className="mt-8">
        <h2 id="overall-heading" className="sr-only">Overall status</h2>
        <div
          className="rounded-[8px] border p-5"
          style={{ borderColor: TREATMENT[status.overall].border, background: "var(--vault-panel)" }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <StateBadge state={status.overall} />
            <span className="text-[15px] font-semibold text-[var(--text)]">
              {STATE_MEANING[status.overall]}
            </span>
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-mute)]">
            {status.unreadable
              ? "We could not read our own status artifacts. Treat everything on this page as unknown rather than as working."
              : humaniseReason(status.overallReason)}
          </p>
          {terminal.asOfSettledDate ? (
            <p className="mt-3 text-[13px] text-[var(--text-mute)]">
              Newest fully settled slate: <strong className="text-[var(--text)]">{terminal.asOfSettledDate}</strong>
            </p>
          ) : null}
        </div>
      </section>

      {/* Stages */}
      <section aria-labelledby="stages-heading" className="mt-10">
        <h2 id="stages-heading" className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-mute)]">
          Pipeline stages
        </h2>

        {status.stages.length === 0 ? (
          <p className="mt-4 rounded-[6px] border border-[var(--vault-border-strong)] p-4 text-[14px] text-[var(--text-mute)]">
            No stage information is available. This is an unknown state, not a healthy one.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {status.stages.map((s) => (
              <li
                key={s.stage}
                className="rounded-[6px] border p-4"
                style={{ borderColor: TREATMENT[s.state].border, background: "var(--vault-panel)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-[var(--text)]">
                    {STAGE_LABEL[s.stage] ?? s.stage}
                  </h3>
                  <StateBadge state={s.state} />
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-mute)]">{s.detail}</p>
                <p className="mt-1 text-[13px] text-[var(--text-mute)]">{STATE_MEANING[s.state]}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quarantine — shown, explained, and carrying no record */}
      {terminal.quarantines.length > 0 ? (
        <section aria-labelledby="quarantine-heading" className="mt-10">
          <h2 id="quarantine-heading" className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-mute)]">
            Withheld slates
          </h2>
          <ul className="mt-4 space-y-3">
            {terminal.quarantines.map((q) => (
              <li
                key={q.date}
                className="rounded-[6px] border p-4"
                style={{ borderColor: "var(--vault-danger-dim)", background: "var(--vault-panel)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-[var(--text)]">{q.date}</h3>
                  <StateBadge state="QUARANTINED" />
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-mute)]">
                  {q.publicExplanation}
                </p>
                <p className="mt-2 text-[13px] text-[var(--text-mute)]">
                  This date has no win/loss record and is excluded from every rate on this site.
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* What the states mean */}
      <section aria-labelledby="legend-heading" className="mt-10">
        <h2 id="legend-heading" className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-mute)]">
          What these states mean
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {(Object.keys(STATE_LABEL) as StageState[]).map((s) => (
            <div key={s} className="rounded-[6px] border border-[var(--vault-border)] p-3">
              <dt className="mb-1">
                <StateBadge state={s} />
              </dt>
              <dd className="text-[13px] leading-relaxed text-[var(--text-mute)]">{STATE_MEANING[s]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="mt-10 border-t border-[var(--vault-border)] pt-6">
        <p className="text-[13px] leading-relaxed text-[var(--text-mute)]">
          GameTimePicks is a paper-only, educational research project in public beta. Nothing here is
          betting advice.{" "}
          <Link href="/methodology" className="underline underline-offset-2 text-[var(--text)]">
            How it works
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
