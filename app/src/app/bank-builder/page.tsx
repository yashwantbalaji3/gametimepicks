/**
 * /bank-builder — a clean, focused product page. Only three things:
 *   1. The ladder + current status (bankroll, step, public record, today's card status).
 *   2. Today's official Bank Builder card (the pending Step-3 candidate), if one exists.
 *   3. Previous hits (settled ladder steps + public record).
 * No Plus100 builder, no audit logs, no unrelated projections. Presentation only — the bankroll /
 * ledger are read from the public artifact and never mutated here. Paper-only, educational.
 */
import Link from "next/link";

import PageHero from "@/components/page-hero";
import BoardStatTile from "@/components/board-stat-tile";
import BankBuilderTower from "@/components/bank-builder-tower";
import OfficialStep3CandidateCard from "@/components/bank-builder/official-step3-candidate";
import { loadOfficialStep3Candidate } from "@/lib/world-cup-flex";
import {
  BANK_BUILDER_BASE,
  BANK_BUILDER_LADDER,
  formatLadderUsd,
  formatLadderUsdPrecise,
  resolveLadderStep,
} from "@/lib/bank-builder-ladder";
import {
  loadPublicBankBuilderSummary,
  loadPublicBankBuilderLedger,
} from "@/lib/data-bank-builder";

const META_TITLE = "Bank Builder · GameTime Picks";
const META_DESCRIPTION =
  "An educational $100 → $10,000 paper-bankroll ladder — one card per step. The current run, today's official card, and previous hits. Paper-only; we do not take real money.";

export const metadata = {
  title: META_TITLE,
  description: META_DESCRIPTION,
  openGraph: { title: META_TITLE, description: META_DESCRIPTION, type: "website", url: "/bank-builder/" },
  twitter: { card: "summary_large_image", title: META_TITLE, description: META_DESCRIPTION },
};

function fmtDate(d: string): string {
  try {
    return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

export default function BankBuilderPage() {
  const pubSummary = loadPublicBankBuilderSummary();
  const pubLedger = loadPublicBankBuilderLedger();
  const currentBankroll = pubSummary?.currentBankrollUnits ?? BANK_BUILDER_BASE;
  const activeStep = resolveLadderStep(currentBankroll) ?? BANK_BUILDER_LADDER[0];
  const rec = pubSummary?.record ?? { wins: 0, losses: 0, pushes: 0 };
  const recordLabel = `${rec.wins}–${rec.losses}${rec.pushes ? `–${rec.pushes}` : ""}`;
  const officialStep3 = loadOfficialStep3Candidate(currentBankroll);
  const hits = (pubLedger?.entries ?? []).filter((e) => e.result === "win");

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden">
      {/* SECTION 1 — hero + status */}
      <PageHero
        eyebrow="Educational paper-trading · simulated bankroll"
        title="Bank Builder"
        subMaxWidth={560}
        sub="A paper ladder tracking the current run — five steps from $100 toward $10,000, one card per step. Paper-only; we do not take real money."
      />
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <BoardStatTile label="Paper bankroll" value={formatLadderUsdPrecise(currentBankroll)} sub="current run" accent="var(--risk-low)" />
        <BoardStatTile label="Step" value={`${activeStep.step} / 5`} sub={`Today · ${formatLadderUsd(activeStep.start)} → ${formatLadderUsd(activeStep.goal)}`} accent="var(--sport-mlb)" />
        <BoardStatTile label="Public record" value={recordLabel} sub="settled ladder steps" accent="var(--vault-gold-bright)" />
        <BoardStatTile label="Today's card" value={officialStep3 ? "Pending" : "—"} sub={officialStep3 ? "World Cup · Step 3" : "none cleared yet"} accent="var(--risk-longshot)" />
      </div>

      {/* SECTION 2 — the ladder + the day-by-day run plan */}
      <div className="mt-6">
        <BankBuilderTower activeStepNumber={activeStep.step} currentBankroll={currentBankroll} />
      </div>

      <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5" aria-label="Run plan">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-300">Run plan</h2>
          <span className="text-[11.5px] text-zinc-500">Bankroll today is {formatLadderUsdPrecise(currentBankroll)} — targets below are goals, not the current balance.</span>
        </div>
        <ol className="flex flex-col gap-2">
          {BANK_BUILDER_LADDER.filter((s) => s.step >= activeStep.step).slice(0, 3).map((s, i) => {
            const day = ["Today", "Tomorrow", "Saturday"][i] ?? `Step ${s.step}`;
            const isActive = i === 0;
            return (
              <li
                key={s.step}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-2.5 text-[12.5px]"
                style={{
                  border: isActive ? "1px solid rgba(240,199,94,0.40)" : "1px solid var(--vault-rule)",
                  background: isActive ? "rgba(240,199,94,0.06)" : "rgba(7,11,26,0.40)",
                }}
              >
                <span className="font-semibold" style={{ color: "var(--vault-text)" }}>{day}</span>
                <span className="tabular-nums" style={{ color: "var(--vault-text)" }}>{formatLadderUsd(s.start)} → {formatLadderUsd(s.goal)}</span>
                <span
                  className="ml-auto rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
                  style={{
                    color: isActive ? "var(--vault-gold-bright)" : "var(--vault-text-faint)",
                    border: `1px solid ${isActive ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
                  }}
                >
                  {isActive ? "Active · pending" : "Planned"}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-[11.5px] leading-snug text-zinc-500">
          Tomorrow and Saturday are planned only if today&apos;s card settles successfully. A loss resets the run to the {formatLadderUsd(BANK_BUILDER_LADDER[0].start)} base. Paper-only educational tracking.
        </p>
      </section>

      {/* SECTION 3 — today's official card */}
      {officialStep3 ? (
        <OfficialStep3CandidateCard candidate={officialStep3} />
      ) : (
        <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-5 py-4" aria-label="Today's card">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-300">Today&apos;s card</h2>
          <p className="mt-1.5 text-[13px] text-zinc-400">No official Bank Builder card has cleared today&apos;s gates yet. A card appears only when the slate supports one.</p>
        </section>
      )}

      {/* SECTION 4 — previous hits */}
      {hits.length > 0 && (
        <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5" aria-label="Previous hits">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-300">Previous hits</h2>
            <span className="text-[12px] text-zinc-400">Record <strong className="text-emerald-300">{recordLabel}</strong> · settled from official results</span>
          </div>
          <ol className="flex flex-col gap-2">
            {hits.map((e) => (
              <li key={e.step} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-2.5 text-[12.5px]">
                <span className="font-semibold text-zinc-200">Step {e.step}</span>
                <span className="rounded px-1.5 py-0.5 text-[11px] font-bold tracking-[0.08em] bg-emerald-500/15 text-emerald-300">WIN</span>
                <span className="tabular-nums text-zinc-300">{formatLadderUsdPrecise(e.bankrollBefore)} → {formatLadderUsdPrecise(e.bankrollAfter)}</span>
                <span className="ml-auto truncate text-[11.5px] text-zinc-500">{fmtDate(e.date)} · {e.sport}{e.event ? ` · ${e.event}` : ""}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* SECTION 5 — tiny footer */}
      <p className="mt-6 text-center text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        Paper-only educational tracking.{" "}
        <Link href="/learn#bank-builder" className="underline" style={{ color: "var(--vault-text-mute)" }}>How it works →</Link>
      </p>
    </div>
  );
}
