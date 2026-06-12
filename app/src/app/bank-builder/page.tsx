/**
 * /bank-builder — the Bank Builder paper-bankroll ladder prototype
 * (design doc §3). An educational $100 → $3,000 ladder: five rungs,
 * each doubling (the final rung needs 1.875×), with one Daily Builder
 * Pick per active rung. **Read-only** — it derives entirely from the
 * already-published optimizer/suggested snapshot and the existing graded
 * record. No new pipeline, no parallel grader, no real money.
 *
 * What this PR (prototype) ships:
 *   - The static ladder, rendered base → crown.
 *   - The active rung (Step 1 / $100 base, since no ladder history is
 *     persisted yet — §4.2 defers durable history).
 *   - Today's Builder Slip: a *minimal* prototype selector that picks the
 *     highest-confidence non-longshot pending slip from the published
 *     pool whose combined decimal odds clear the rung's target. This is
 *     the documented default heuristic (§3.4); a later PR extracts it
 *     into a tested, deterministic `selectBuilderSlip` helper in
 *     `parlay-suggested.ts` with the richer game-time / diversity
 *     preferences.
 *   - Honest no-history state ("Tracking starts when a Builder Slip
 *     settles.") — no fabricated past runs.
 *
 * Honesty (design doc §3.6): framed as educational paper-trading;
 * disclaimer top AND bottom; none of the banned hype vocabulary;
 * payouts only from real odds (the ticket card renders "—" when a leg
 * lacks a price); a settled slip is never shown as a Builder Pick.
 */
import Link from "next/link";

import ParlayTicketCard from "@/components/parlay-ticket-card";
import PageHero from "@/components/page-hero";
import BoardStatTile from "@/components/board-stat-tile";
import BankBuilderTower from "@/components/bank-builder-tower";
import BankBuilderShareCard from "@/components/bank-builder-share-card";
import BankBuilderFeaturedCard from "@/components/bank-builder-finals-spotlight";
import {
  getSuggestedParlaysForDate,
  getOptimizerSnapshotForDate,
  getLatestOptimizerSnapshot,
} from "@/lib/data-parlays";
import { getLegPool } from "@/lib/custom-parlay";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import { currentEtDate } from "@/lib/freshness";
import {
  selectPlus100BuilderSlip,
  BUILDER_PLUS100_TARGET,
  type BuilderSlipSelection,
} from "@/lib/parlay-suggested";
import { filterOfficialSuggestedSlips } from "@/lib/sport-capabilities";
import { loadWorldCupFlexLeg, loadOfficialStep3Candidate } from "@/lib/world-cup-flex";
import WorldCupFlexCard from "@/components/bank-builder/world-cup-flex-card";
import OfficialStep3CandidateCard from "@/components/bank-builder/official-step3-candidate";
import { formatAmerican } from "@/lib/odds-math";
import {
  legRecentFormLabel,
  slipRecentFormSummary,
  indexRecentSeries,
  attachRecentSeries,
} from "@/lib/recent-form";
import { diagnoseBuilderPool } from "@/lib/bank-builder-eligibility";
import {
  BANK_BUILDER_BASE,
  BANK_BUILDER_GOAL,
  BANK_BUILDER_LADDER,
  formatLadderUsd,
  formatLadderUsdPrecise,
  resolveLadderStep,
} from "@/lib/bank-builder-ladder";
import {
  loadBankBuilderSummary,
  loadBankBuilderLedger,
  loadFeaturedBuilderCard,
  loadPublicBankBuilderSummary,
  loadPublicBankBuilderLedger,
} from "@/lib/data-bank-builder";

const META_TITLE = "Bank Builder · GameTime Picks";
const META_DESCRIPTION =
  "An educational $100 → $3,000 paper-bankroll ladder. One Daily Builder Pick per step, drawn from the published suggested pool. Paper only — we do not take real money.";

export const metadata = {
  title: META_TITLE,
  description: META_DESCRIPTION,
  openGraph: {
    title: META_TITLE,
    description: META_DESCRIPTION,
    type: "website",
    url: "/bank-builder/",
  },
  twitter: {
    card: "summary_large_image",
    title: META_TITLE,
    description: META_DESCRIPTION,
  },
};

const DISCLAIMER =
  "Educational only. Past results do not predict future outcomes. We do not take real money.";

function fmtBuilderDate(d: string): string {
  try {
    return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

const MARKET_LABELS: Record<string, string> = {
  batter_hits: "batter hits",
  batter_total_bases: "total bases",
  batter_home_runs: "home runs",
  pitcher_strikeouts: "strikeouts",
  PTS: "points",
  REB: "rebounds",
  AST: "assists",
};
const prettyMarket = (m: string) => MARKET_LABELS[m] ?? m.replace(/_/g, " ");

export default function BankBuilderPage() {
  const today = currentEtDate();
  const suggested = getSuggestedParlaysForDate(today);
  const calibrationTable = loadCalibrationTable();

  // Durable ladder history (§4.2): read the persisted, SETTLED-only paper-bankroll
  // ledger (scripts/build-bank-builder-ledger.mjs). Fail-closed — if the artifact is
  // absent we fall back to the honest base rung. We never fabricate prior progress.
  const bbSummary = loadBankBuilderSummary();
  const bbLedger = loadBankBuilderLedger();
  const lastSettled = bbLedger?.entries?.[bbLedger.entries.length - 1] ?? null;

  // PUBLIC $100→$10,000 ladder (2026-06-11 migration) is the source of truth for
  // the public hero/ladder. The canonical tracked ledger (bbSummary / bbLedger) is
  // preserved untouched and surfaced below as audit/history. Falls back to the
  // canonical summary pre-migration.
  const pubSummary = loadPublicBankBuilderSummary();
  const pubLedger = loadPublicBankBuilderLedger();
  const currentBankroll =
    pubSummary?.currentBankrollUnits ?? bbSummary?.currentBankrollUnits ?? BANK_BUILDER_BASE;
  const activeStep = resolveLadderStep(currentBankroll) ?? BANK_BUILDER_LADDER[0];

  // PR `feature/sport-specific-suggested` (2026-06-02): the Builder Slip is
  // drawn only from OFFICIAL Suggested slips — single-sport only. Filtering out
  // mixed-sport slips keeps Bank Builder consistent with the official surface
  // (no mixed Builder card) without forcing a pick: when nothing single-sport
  // prices near +100, the honest empty state still renders.
  const poolDate = suggested?.date ?? today;
  const officialPool = filterOfficialSuggestedSlips(suggested?.slips ?? []);
  // PR 4: enrich the official pool's legs with REAL recentSeries from the
  // optimizer legPool (the published snapshot omits it) so L10 can be shown.
  // Pure, real-data-only join by (playerId, market, line, side); never
  // fabricated. Falls back to the latest optimizer when today's is absent.
  const optimizerForDate =
    getOptimizerSnapshotForDate(poolDate) ??
    getLatestOptimizerSnapshot()?.payload ??
    null;
  const recentSeriesIndex = indexRecentSeries(
    optimizerForDate ? getLegPool(optimizerForDate) : [],
  );
  const pool = attachRecentSeries(officialPool, recentSeriesIndex);
  // The Builder Slip targets ~+100 combined odds: a $100 paper stake aims
  // for roughly a $200 total return (~$100 profit). We pick the pending,
  // fully-unsettled slip priced closest to +100 (2-leg preferred), and
  // render an honest empty state when nothing prices into the band.
  const builderPick = selectPlus100BuilderSlip(pool);

  // Official Step-3 World Cup candidate (lowered $1,400–$1,500+ target). Pending — never settles
  // the ledger here. When present it IS the official candidate, so the separate Flex Card (which
  // spotlights one of its legs) is hidden to avoid a contradictory "separate vs official" state.
  const officialStep3 = loadOfficialStep3Candidate(currentBankroll);
  const flexLeg = officialStep3 ? null : loadWorldCupFlexLeg();
  // PR 4: transparent eligibility diagnosis — when no card qualifies, show the
  // EXACT honest reason (no pending cards / none near +100 / etc.), never a
  // "nothing good enough to win" framing.
  const diagnosis = diagnoseBuilderPool(pool);
  const poolIsFallback = suggested?.isFallback ?? false;
  const savedPregame = suggested?.source === "snapshot";

  // Featured NBA Finals same-game card — SETTLED from the official box score, shown
  // as a featured/paper card SEPARATE from the tracked ladder (which settles on the
  // official MLB Builder pick). Honest tracked-vs-featured accounting; no merge.
  const featuredCard = loadFeaturedBuilderCard();

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-8 overflow-x-hidden">
      {/* ---- Hero + top disclaimer ----------------------------------- */}
      <PageHero
        eyebrow="Educational paper-trading · simulated bankroll"
        title="Bank Builder"
        subMaxWidth={620}
        sub={
          <>
            A {formatLadderUsd(BANK_BUILDER_BASE)} →{" "}
            {formatLadderUsd(BANK_BUILDER_GOAL)} paper-bankroll ladder. Five
            rungs, one Daily Builder Pick per rung, drawn from the same
            published suggested pool that powers Parlay Lab. On a loss the
            ladder resets to the {formatLadderUsd(BANK_BUILDER_BASE)} base — the
            reset is always shown, never hidden.
          </>
        }
      />

      {/* Product KPIs — current paper run at a glance. Lifetime experimental
          record is intentionally NOT a hero KPI (audit-only, below). */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <BoardStatTile
          label="Paper Bankroll"
          value={formatLadderUsdPrecise(currentBankroll)}
          sub="current run"
          accent="var(--risk-low)"
        />
        <BoardStatTile
          label="Current Step"
          value={`${activeStep.step} / 5`}
          sub={`${formatLadderUsd(activeStep.start)} → ${formatLadderUsd(activeStep.goal)} target zone`}
          accent="var(--sport-mlb)"
        />
        <BoardStatTile
          label="Last Builder Slip"
          value={pubSummary?.lastSettledLabel ?? (lastSettled ? lastSettled.result.toUpperCase() : "—")}
          sub={
            pubSummary
              ? `${fmtBuilderDate(pubSummary.lastSettledDate ?? "")} · settled from official results`
              : "tracking begins on first settled slip"
          }
          accent="var(--vault-gold-bright)"
        />
        <BoardStatTile
          label="Next Target"
          value={formatLadderUsd(activeStep.goal)}
          sub={`from ${formatLadderUsdPrecise(currentBankroll)} · Step ${activeStep.step} of 5`}
          accent="var(--risk-longshot)"
        />
      </div>

      {/* ---- Current PUBLIC run ($100→$10,000 ladder) --------------- */}
      {pubLedger && (
        <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
              Current public run · $100 → $10,000 paper ladder
            </h2>
            <span className="text-[11px] text-zinc-500">Educational paper tracking · not betting advice</span>
          </div>
          <ol className="mt-2 flex flex-col gap-2">
            {pubLedger.entries.map((e) => (
              <li
                key={e.step}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-2.5 text-[12.5px]"
              >
                <span className="font-semibold text-zinc-200">Step {e.step}</span>
                <span className="text-zinc-500">{fmtBuilderDate(e.date)} · {e.sport}{e.event ? ` · ${e.event}` : ""}</span>
                <span className="rounded px-1.5 py-0.5 text-[11px] font-bold tracking-[0.08em] bg-emerald-500/15 text-emerald-300">
                  {e.result === "win" ? (e.sport === "NBA" ? "NBA FINALS HIT" : "WIN") : e.result.toUpperCase()}
                </span>
                <span className="tabular-nums text-zinc-300">
                  {formatLadderUsdPrecise(e.bankrollBefore)} → {formatLadderUsdPrecise(e.bankrollAfter)}
                </span>
                <span className="ml-auto truncate text-[11.5px] text-zinc-500">
                  {e.legs.map((l) => `${l.player} ${l.side} ${l.line ?? ""} ${prettyMarket(l.market)}`).join(" + ")}
                </span>
              </li>
            ))}
            {/* Active step */}
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-400/30 bg-amber-400/[0.05] px-4 py-2.5 text-[12.5px]">
              <span className="font-semibold text-zinc-200">Step {activeStep.step}</span>
              <span className="rounded px-1.5 py-0.5 text-[11px] font-bold tracking-[0.08em] bg-amber-400/15 text-amber-300">ACTIVE</span>
              <span className="tabular-nums text-zinc-300">
                {formatLadderUsdPrecise(currentBankroll)} → target {formatLadderUsd(activeStep.goal)}
              </span>
              <span className="ml-auto text-[11.5px] text-zinc-500">
                Step-{activeStep.step} candidate stakes {formatLadderUsdPrecise(pubLedger.nextStakeUnits)} ·{" "}
                {officialStep3
                  ? "official World Cup candidate selected · pending result (see below)"
                  : pubLedger.nextPickStatus === "pending"
                    ? "pending — no card cleared today's gates"
                    : pubLedger.nextPickStatus}
              </span>
            </li>
          </ol>
        </section>
      )}

      {/* ---- Original tracked ledger — PRESERVED for audit ----------- */}
      {/* Per the 2026-06-11 policy migration, the public run above recognizes the
          officially-confirmed NBA Finals featured hit as Step 2. The original
          canonical tracked ledger (which settles on the official MLB Builder pick)
          is preserved unchanged here — the MLB June 10 slip also won. This is a
          forward policy migration, not an edited settlement result. */}
      <details className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/30 px-4 py-3">
        <summary className="cursor-pointer text-[12.5px] text-zinc-400 hover:text-zinc-300">
          Original tracked ledger (audit) — settles on the official MLB Builder pick; preserved unchanged
        </summary>
        <div className="mt-3">

      {/* ---- Last Settled Builder Slip (polished slip card) ---------- */}
      {lastSettled && lastSettled.result === "win" && (
        <section className="mt-5 overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 bg-emerald-500/[0.06] px-5 py-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
              Last Settled Builder Slip
            </h2>
            <span className="rounded-md bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold tracking-[0.1em] text-emerald-300">
              WIN
            </span>
          </div>
          <div className="px-5 pt-3 pb-1 text-[12px] text-zinc-400">
            {fmtBuilderDate(lastSettled.date)} · {(lastSettled.sport ?? "MLB").toUpperCase()} · settled from official results
          </div>
          <ul className="divide-y divide-zinc-800/70 px-5">
            {lastSettled.legs.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-zinc-100">{l.player}</div>
                  <div className="text-[12.5px] text-zinc-400">
                    {l.side} {l.line} {prettyMarket(l.market)}
                    {typeof l.finalStat === "number" && (
                      <span className="text-zinc-500"> · result: {l.finalStat}</span>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${l.result === "win" ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-700/40 text-zinc-300"}`}>
                  {l.result === "win" ? "Won" : l.result === "loss" ? "Lost" : "Push"}
                </span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-y-1 border-t border-zinc-800/70 px-5 py-3 text-[12.5px] sm:grid-cols-4">
            <div><span className="text-zinc-500">Paper stake</span><br /><span className="font-semibold text-zinc-100">{formatLadderUsd(lastSettled.stakeUnits ?? lastSettled.bankrollBefore)}</span></div>
            <div><span className="text-zinc-500">Odds</span><br /><span className="font-semibold text-zinc-100">{formatAmerican(lastSettled.combinedAmerican)}</span></div>
            <div><span className="text-zinc-500">Paper return</span><br /><span className="font-semibold text-zinc-100">{formatLadderUsd(lastSettled.bankrollAfter)}</span></div>
            <div><span className="text-zinc-500">Paper profit</span><br /><span className="font-semibold text-emerald-400">+{formatLadderUsd(lastSettled.bankrollAfter - lastSettled.bankrollBefore)}</span></div>
          </div>
        </section>
      )}

      {/* ---- Current run timeline + collapsed audit ------------------ */}
      {bbSummary && bbSummary.settledPickCount > 0 && lastSettled && (
        <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
            Current Paper Run
          </h2>
          <ol className="flex flex-col gap-2">
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-[12.5px]">
              <span className="font-semibold text-zinc-200">{fmtBuilderDate(lastSettled.date)}</span>
              <span className="text-zinc-500">Step {lastSettled.progressionStepBefore}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${lastSettled.result === "win" ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-700/40 text-zinc-300"}`}>{lastSettled.result.toUpperCase()}</span>
              <span className="tabular-nums text-zinc-400">{formatLadderUsd(lastSettled.bankrollBefore)} → {formatLadderUsd(lastSettled.bankrollAfter)}</span>
            </li>
          </ol>
          <p className="mt-3 text-[12px] leading-snug text-zinc-500">
            The ladder only advances when the published slate produces a qualifying Builder
            Slip. We do not force a pick to keep the run going.
          </p>
          <details className="mt-3 text-[12px] text-zinc-500">
            <summary className="cursor-pointer text-zinc-400 hover:text-zinc-300">View audit details</summary>
            <div className="mt-2 space-y-1 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 font-mono text-[11px] leading-relaxed text-zinc-500">
              <div>slipId: {lastSettled.slipId ?? "—"}</div>
              <div>settlementSource: {lastSettled.settlementSource}</div>
              <div>lifetime settled record (all experimental runs): {bbSummary.record.wins}-{bbSummary.record.losses}{bbSummary.record.pushes ? `-${bbSummary.record.pushes}` : ""}</div>
              <div>current streak: {bbSummary.currentStreak > 0 ? `W${bbSummary.currentStreak}` : bbSummary.currentStreak < 0 ? `L${-bbSummary.currentStreak}` : "—"}</div>
              <div>audit flags: {Object.entries(lastSettled.audit).map(([k, v]) => `${k}=${v}`).join(" · ")}</div>
              <div>generatedAt: {bbSummary.generatedAt}</div>
            </div>
          </details>
        </section>
      )}
        </div>
      </details>

      <DisclaimerBanner placement="top" />

      {/* ---- Eligibility chips + transparent criteria (PR 4) --------- */}
      <EligibilityPanel />

      {/* ---- The ladder (current run, Step 3) — the page's primary focus -- */}
      <div className="mt-6">
        <BankBuilderTower
          activeStepNumber={activeStep.step}
          currentBankroll={currentBankroll}
        />
      </div>

      {/* ---- Official Step-3 World Cup candidate (lowered $1,400–$1,500+ target).
          Pending result — does NOT settle the ladder until the matches finish. */}
      {officialStep3 ? <OfficialStep3CandidateCard candidate={officialStep3} /> : null}

      {/* ---- World Cup Flex Card — a SEPARATE spotlight leg, only shown when there is
          NO official candidate (otherwise its leg lives inside the official card above). */}
      {flexLeg ? <WorldCupFlexCard leg={flexLeg} exampleStake={currentBankroll} /> : null}

      {/* Featured NBA Finals same-game card — settled from the official box
          score, shown separately from the tracked ladder (honest accounting). */}
      <BankBuilderFeaturedCard card={featuredCard} />

      {/* ---- SEPARATE $100 educational builder — visually + verbally split
          from the $728.76 ladder so users never confuse the two. Its ~+100
          target is for the $100 base step, NOT the current Step-3 candidate. */}
      <section
        className="mt-8 rounded-2xl border border-dashed p-1"
        style={{ borderColor: "rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.30)" }}
        aria-label="Separate $100 educational builder"
      >
        <div className="px-4 pt-3 pb-1">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--vault-text-mute)" }}>
            Separate $100 educational builder
          </h2>
          <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            A standalone teaching tool that picks the day&apos;s best slip near {formatAmerican(BUILDER_PLUS100_TARGET)} from
            the published pool — a $100 paper stake aiming for ~$200. It is{" "}
            <strong style={{ color: "var(--vault-text-mute)" }}>not</strong> the {formatLadderUsdPrecise(currentBankroll)}{" "}
            Step-{activeStep.step} ladder candidate above, and never changes the ladder bankroll.
          </p>
        </div>
        <TodaysBuilderPick
          pick={builderPick}
          diagnosis={diagnosis}
          calibrationTable={calibrationTable}
          savedPregame={savedPregame}
          poolDate={poolDate}
          poolIsFallback={poolIsFallback}
        />
      </section>

      {/* ---- Screenshot-friendly share card -------------------------- */}
      <BankBuilderShareCard
        activeStepNumber={activeStep.step}
        currentBankroll={currentBankroll}
        lastSlip={
          lastSettled && lastSettled.result === "win"
            ? {
                result: "win",
                dateLabel: fmtBuilderDate(lastSettled.date),
                profitUsd: lastSettled.bankrollAfter - lastSettled.bankrollBefore,
                legs: lastSettled.legs.map((l) => ({
                  player: l.player,
                  selection: `${l.side} ${l.line} ${prettyMarket(l.market)}`,
                })),
              }
            : null
        }
      />

      {/* ---- Bottom disclaimer + responsible-use link ---------------- */}
      <DisclaimerBanner placement="bottom" />
      <p className="mt-3 text-center text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        Bank Builder is a learning demonstration of analytical methodology.{" "}
        <Link
          href="/responsible-use/"
          className="underline"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Read responsible-use →
        </Link>
      </p>
    </div>
  );
}

/* ===================================================================== */
/* Sub-components                                                         */
/* ===================================================================== */

function DisclaimerBanner({ placement }: { placement: "top" | "bottom" }) {
  return (
    <p
      className={`${placement === "top" ? "mt-4" : "mt-8"} rounded-[8px] px-3.5 py-2.5 text-[12.5px] leading-relaxed`}
      style={{
        background: "var(--gtp-card-sunken)",
        border: "1px solid var(--vault-rule)",
        color: "var(--vault-text-mute)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.14em] mr-2"
        style={{ color: "var(--vault-warn)", fontSize: 10.5 }}
      >
        Paper only
      </span>
      {DISCLAIMER}
    </p>
  );
}

function TodaysBuilderPick({
  pick,
  diagnosis,
  calibrationTable,
  savedPregame,
  poolDate,
  poolIsFallback,
}: {
  pick: BuilderSlipSelection | null;
  diagnosis: ReturnType<typeof diagnoseBuilderPool>;
  calibrationTable: ReturnType<typeof loadCalibrationTable>;
  savedPregame: boolean;
  poolDate: string;
  poolIsFallback: boolean;
}) {
  const recentForm = pick ? slipRecentFormSummary(pick.slip) : null;
  return (
    <section
      aria-label="Today's Builder Slip"
      className="rounded-[10px] overflow-hidden flex flex-col"
      style={{ background: "var(--gtp-card)", border: "1px solid var(--gtp-card-border)" }}
    >
      <header
        className="px-3.5 py-3 flex flex-wrap items-baseline gap-x-2 gap-y-1"
        style={{ background: "var(--gtp-card-sunken)", borderBottom: "1px solid var(--vault-rule)" }}
      >
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
        >
          Today&apos;s Builder Slip
        </span>
        <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
          · Paper bankroll · {formatLadderUsd(BANK_BUILDER_BASE)} starting bank ·
          Target: about {formatAmerican(BUILDER_PLUS100_TARGET)}
        </span>
      </header>

      <div className="px-3.5 py-4 flex flex-col gap-3">
        {pick ? (
          <>
            <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
              Drawn from the published suggested pool ({poolDate}
              {poolIsFallback ? " · most recent slate" : ""}). Combined{" "}
              {formatAmerican(pick.combinedAmerican)} — a{" "}
              {formatLadderUsd(BANK_BUILDER_BASE)} paper stake aims for about{" "}
              {formatLadderUsd(BANK_BUILDER_BASE * pick.combinedDecimal)} back
              (~{formatLadderUsd(BANK_BUILDER_BASE * (pick.combinedDecimal - 1))}{" "}
              profit). Results update after games finish — never edited after
              games start.
            </p>
            <ParlayTicketCard
              slip={pick.slip}
              emphasis="featured"
              showStakeFooter
              savedPregame={savedPregame}
              calibrationTable={calibrationTable}
            />
            <RecentFormSupport pick={pick} recentForm={recentForm} />
          </>
        ) : (
          <div
            className="flex flex-col items-center text-center gap-2 py-6"
            style={{ minHeight: 120 }}
          >
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 400 }}>
              No Builder Slip near {formatAmerican(BUILDER_PLUS100_TARGET)} in
              today&apos;s published pool yet.
            </p>
            {/* PR 4: specific, honest eligibility reasons — never a
                "nothing good enough to win" framing. */}
            <ul
              className="flex flex-col gap-1 text-[12px] leading-snug"
              style={{ color: "var(--vault-text-faint)", maxWidth: 400 }}
            >
              {(diagnosis.reasons.length
                ? diagnosis.reasons
                : [
                    `A pick appears once the published pool has a pending, fully-unsettled slip priced close to ${formatAmerican(BUILDER_PLUS100_TARGET)} combined.`,
                  ]
              ).map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
            <Link
              href="/parlay-lab/"
              className="font-mono uppercase tracking-[0.12em] px-3 py-1.5 rounded-full"
              style={{
                color: "var(--vault-gold-bright)",
                border: "1px solid var(--vault-gold-bright)",
                fontSize: 11,
              }}
            >
              Browse Parlay Lab →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

/** Transparent eligibility chips + criteria (PR 4). Every Builder Slip must
 *  pass these — shown so the user sees exactly how a card is chosen. No
 *  win-rate or performance claim. */
function EligibilityPanel() {
  const chips = ["Paper-only", "Published-card pool", "Recent-form review"];
  const criteria = [
    "Official Suggested cards only (modeled sports — no mixed cards)",
    "Pending and fully unsettled only (never a settled slip)",
    `Priced near ${formatAmerican(BUILDER_PLUS100_TARGET)} combined`,
    "Recent-form (L10) shown for transparency — never a win-rate claim",
    "No forced card — an honest empty state when nothing qualifies",
  ];
  return (
    <section
      aria-label="Builder Slip eligibility"
      className="mt-4 rounded-[8px] px-3.5 py-3 flex flex-col gap-2"
      style={{ background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((c) => (
          <span
            key={c}
            className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
            style={{
              color: "var(--vault-text-mute)",
              background: "var(--gtp-card)",
              border: "1px solid var(--vault-rule)",
              fontSize: 9.5,
            }}
          >
            {c}
          </span>
        ))}
      </div>
      <ul
        className="flex flex-col gap-0.5 text-[11.5px] leading-snug"
        style={{ color: "var(--vault-text-faint)", maxWidth: 640 }}
      >
        {criteria.map((c) => (
          <li key={c}>· {c}</li>
        ))}
      </ul>
    </section>
  );
}

/** Recent-form (L10) support for the chosen Builder Slip — a transparent,
 *  per-leg readout of how often the player has recently cleared the line.
 *  Display only; never a win-probability claim; uses recentSeries, not
 *  edgePct/confidence. */
function RecentFormSupport({
  pick,
  recentForm,
}: {
  pick: BuilderSlipSelection;
  recentForm: ReturnType<typeof slipRecentFormSummary> | null;
}) {
  const legs = pick.slip.legs ?? [];
  return (
    <section
      aria-label="Recent-form support"
      className="rounded-[8px] px-3.5 py-3 flex flex-col gap-2"
      style={{ background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}
        >
          Recent-form support
        </span>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          {recentForm && recentForm.legsWithData < recentForm.totalLegs
            ? `${recentForm.legsWithData}/${recentForm.totalLegs} legs have L10 data`
            : "L10 = recent games clearing the line"}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {legs.map((leg, i) => (
          <li
            key={`${leg.playerName}-${leg.market}-${i}`}
            className="flex items-center justify-between gap-2 text-[12px]"
            style={{ color: "var(--vault-text-mute)" }}
          >
            <span className="truncate">
              {leg.playerName}{" "}
              <span style={{ color: "var(--vault-text-faint)" }}>
                · {leg.market} {leg.side} {leg.line ?? "—"}
              </span>
            </span>
            <span
              className="font-mono shrink-0"
              style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
            >
              {legRecentFormLabel(leg)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[10.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
        Recent form is shown for transparency only — it is not a prediction or a
        win-rate claim.
      </p>
    </section>
  );
}

/** Honest no-history state. A durable ladder history is deferred
 *  (§4.2) — until a Builder Slip settles in the public era there is
 *  nothing real to show, and we never invent past runs. */
