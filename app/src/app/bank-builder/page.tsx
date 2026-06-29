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
import PreviousHits from "@/components/bank-builder/previous-hits";
import DualBankBuilderTeaser from "@/components/bank-builder/dual-bank-builder-teaser";
import { loadDualBankBuilder } from "@/lib/data-dual-bank-builder";
import { crownLadderSummary } from "@/lib/bank-builder/crown-summary";
import BankBuilderV2Panel from "@/components/bank-builder/bank-builder-v2-panel";
import { loadBankBuilderV2 } from "@/lib/data-bank-builder-v2";
import { loadOfficialStepCandidate } from "@/lib/world-cup-flex";
import { loadOfficialPublishedCandidate } from "@/lib/bank-builder-official-candidate";
import OfficialCandidateCard from "@/components/bank-builder/official-candidate-card";
import BankBuilderPreviewPanel from "@/components/parlays/bank-builder-preview-panel";
import DualLadderBoard from "@/components/bank-builder/dual-ladder-board";
import CrossLaneCorrelationBadge from "@/components/bank-builder/cross-lane-correlation-badge";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";
import { loadTodaySlate, currentSlateDate } from "@/lib/parlays/ui-loader";
import { currentEtDate } from "@/lib/freshness";
import { buildPublicDualLadder, type PublicStepStatus } from "@/lib/bank-builder/public-dual-ladder";
import ClimbHero, { type ClimbLane, type ClimbRung } from "@/components/bank-builder/climb-hero";
import fs from "node:fs";
import path from "node:path";
import { getSportIdentity } from "@/lib/sport-identity";
import {
  BANK_BUILDER_BASE,
  BANK_BUILDER_GOAL,
  BANK_BUILDER_LADDER,
  BANK_BUILDER_STEP_COUNT,
  formatLadderUsd,
  formatLadderUsdPrecise,
  resolveLadderStep,
} from "@/lib/bank-builder-ladder";
import {
  loadPublicBankBuilderSummary,
  loadPublicBankBuilderLedger,
} from "@/lib/data-bank-builder";
import { loadStep5TargetStatus } from "@/lib/bank-builder-step5-target";

const BANK = getSportIdentity("bank_builder");

/** Format a ledger ISO date (YYYY-MM-DD) as "Jun 12, 2026" in UTC (date-stable). */
function fmtUtcDate(d: string): string {
  try {
    return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  } catch {
    return d;
  }
}

const usd2 = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

/**
 * Completed $100 → $10K ladders for the ClimbHero proof strip. READ-ONLY: reads the same canonical
 * `mr-dub/banked-ladders.json` that `crownLadderSummary` reads and returns each ladder's REAL `start`/
 * `final`/record verbatim — never recomputes or invents a money figure. Returns [] on any read error
 * (fail-closed → the hero omits the proof rather than showing a fabricated number).
 */
function readCompletedLadders(root: string): Array<{ start: number; final: number; recordLabel: string; pathLabel: string }> {
  try {
    const banked = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "banked-ladders.json"), "utf8"));
    return (banked.ladders ?? [])
      .filter((l: any) => typeof l.final === "number" && Number.isFinite(l.final))
      .map((l: any) => {
        const steps = l.steps ?? [];
        const wins = steps.filter((s: any) => s.result === "won" || s.result === "win").length;
        const losses = steps.filter((s: any) => s.result === "lost" || s.result === "loss").length;
        const start = Number(l.start ?? 100);
        const final = Number(l.final);
        return { start, final, recordLabel: `${wins}–${losses}`, pathLabel: `${usd2(start)} → ${usd2(final)}` };
      });
  } catch {
    return [];
  }
}

/** Map a public-dual-ladder step status → the ClimbHero rung status (a lost step is never surfaced
 *  by the view model, so it presents as "upcoming"; a queued restart presents as "awaiting"). */
const RUNG_STATUS: Record<PublicStepStatus, ClimbRung["status"]> = {
  cleared: "completed",
  active: "active",
  awaiting: "awaiting",
  queued: "awaiting",
  upcoming: "upcoming",
};

const META_TITLE = "Bank Builder · GameTime Picks";
const META_DESCRIPTION =
  "An educational $100 → $10,000 paper-bankroll ladder — one card per step. The current run, today's official card, and previous hits. Paper-only; we do not take real money.";

export const metadata = {
  title: META_TITLE,
  description: META_DESCRIPTION,
  openGraph: { title: META_TITLE, description: META_DESCRIPTION, type: "website", url: "/bank-builder/" },
  twitter: { card: "summary_large_image", title: META_TITLE, description: META_DESCRIPTION },
};

export default function BankBuilderPage() {
  const pubSummary = loadPublicBankBuilderSummary();
  const pubLedger = loadPublicBankBuilderLedger();
  const v2 = loadBankBuilderV2();
  const currentBankroll = pubSummary?.currentBankrollUnits ?? BANK_BUILDER_BASE;
  const rec = pubSummary?.record ?? { wins: 0, losses: 0, pushes: 0 };
  const recordLabel = `${rec.wins}–${rec.losses}${rec.pushes ? `–${rec.pushes}` : ""}`;
  // Crown reached: bankroll has cleared the $10,000 goal (resolveLadderStep → null) with a
  // clean card — the ladder is COMPLETE. We pin the display rung to the final step (not the
  // Step-1 fallback) so labels read $3,500 → $10,000.
  const completed = resolveLadderStep(currentBankroll) === null && rec.losses === 0;
  const activeStep = resolveLadderStep(currentBankroll) ?? BANK_BUILDER_LADDER[BANK_BUILDER_STEP_COUNT - 1];
  // The official candidate is loaded for the ACTIVE rung (stake = full current bankroll,
  // floor = the rung's ladder goal). The loader returns null for stale slates and after a
  // step settles, so a settled card can never re-render as pending — it lives in Previous
  // hits instead.
  // A PUBLISHED candidate artifact (may mix sports) takes precedence over the
  // World-Cup-derived generator; both are pending-only and freshness/step gated.
  const publishedCandidate = loadOfficialPublishedCandidate();
  // Final step (Step 5 · Road to $10K): the brief is explicit that the final card is NOT
  // published yet — it only appears once the model+market gates clear a real slate. So on
  // the final rung we never run the data generator (no invented Step 5 parlay); the page
  // shows the "Step 5 review pending" panel instead.
  const isFinalStep = activeStep.step >= BANK_BUILDER_STEP_COUNT;
  // The owner-authorized final rung is the best real 2-leg card from tonight's slate —
  // NBA Finals + MLB (cross-sport) or two NBA Finals legs. We compute NBA/MLB readiness so
  // the review panel (shown only when no official candidate is published) is honest.
  const step5Target = isFinalStep ? loadStep5TargetStatus() : null;
  const officialStep3 = publishedCandidate || isFinalStep ? null : pubSummary ? loadOfficialStepCandidate(currentBankroll, activeStep.goal) : null;
  const candidateSports = publishedCandidate
    ? Array.from(new Set(publishedCandidate.legs.map((l) => getSportIdentity(l.sport).label))).join(" + ")
    : null;
  const hits = (pubLedger?.entries ?? []).filter((e) => e.result === "win");
  // The most recently cleared step (highest step number) — its real legs + final-result
  // evidence power the celebratory "latest hit" card above the previous-hits grid.
  const latestHit = hits.length ? hits.reduce((a, b) => (b.step > a.step ? b : a)) : null;
  const onTheCrownRun = isFinalStep && rec.losses === 0 && hits.length === BANK_BUILDER_STEP_COUNT - 1;

  const bbPreview = loadTodaySlate().bankBuilderPreview;
  const bbActiveLaunched = bbPreview.status === "launched" || bbPreview.status === "settled";

  // Today's daily portfolio — read only for the live exposure summary that leads the single dual ladder.
  const today = currentSlateDate() ?? currentEtDate();
  const dailyPortfolio = buildDailyPortfolio(path.join(process.cwd(), "public", "data"), new Date().toISOString(), today);
  const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // Cross-lane correlation check — Lane A vs Lane B legs must share no game/player/team to advance
  // independently. Derived from the activated daily portfolio's Bank Builder legs.
  const bbLaneLegs = (lane: "A" | "B") =>
    (dailyPortfolio.cards.find((c) => c.product === "bank-builder" && c.lane === lane)?.legs ?? [])
      .map((l) => ({ matchup: l.matchup, market: l.marketLabel, selection: l.selection, player: l.player ?? null }));

  // ── ClimbHero props — built ONLY from data already loaded above (dailyPortfolio + bbPreview +
  //    crownLadderSummary's artifact). No new model/money computation; values are read verbatim.
  const completedLadders = readCompletedLadders(path.join(process.cwd(), "public", "data"));
  // Public-dual-ladder view models give the rung states (cleared/active/awaiting/upcoming) without ever
  // surfacing a lost step — exactly what the hero needs. The day's Bank Builder card (stake/odds/return/
  // legs) comes from the daily portfolio. Both are already loaded; nothing is recomputed.
  const climbLanes: ClimbLane[] = (["A", "B"] as const)
    .map((letter): ClimbLane | null => {
      const laneId = letter === "A" ? ("lane-a" as const) : ("lane-b" as const);
      const view = buildPublicDualLadder(letter === "A" ? bbPreview.laneA : bbPreview.laneB, laneId);
      if (!view) return null;
      const card = dailyPortfolio.cards.find((c) => c.product === "bank-builder" && c.lane === letter) ?? null;
      const hasCard = !!card && card.legs.length > 0;
      // The active rung is the one carrying today's card; fall back to awaiting, then currentStep.
      const curRung =
        view.steps.find((s) => s.status === "active") ??
        view.steps.find((s) => s.status === "awaiting" || s.status === "queued") ??
        view.steps.find((s) => s.step === view.currentStep) ??
        null;
      const statusTone: ClimbLane["statusTone"] =
        view.currentStatus === "completed" ? "completed"
          : hasCard || view.currentStatus === "active" ? "active"
          : view.currentStatus === "advanced" ? "advanced" : "awaiting";
      const statusLabel =
        view.currentStatus === "completed" ? "🏆 $10K reached"
          : hasCard ? "Active · today's card"
          : view.currentStatus === "active" ? "Active"
          : view.currentStatus === "advanced" ? "Advanced"
          : "Awaiting a qualified card";
      // Cycle # from the lane label ("… lane (cycle 5)") if present — display-only, never fabricated.
      const cycleMatch = /cycle\s+(\d+)/i.exec(view.label === "Lane A" ? (bbPreview.laneA?.label ?? "") : (bbPreview.laneB?.label ?? ""));
      const rungs: ClimbRung[] = view.steps.map((s) => ({
        step: s.step,
        startTarget: s.startTarget,
        goalTarget: s.goalTarget,
        status: RUNG_STATUS[s.status],
      }));
      return {
        id: laneId,
        label: view.label,
        name: null,
        statusLabel,
        statusTone,
        step: curRung?.step ?? view.currentStep ?? null,
        cycle: cycleMatch ? Number(cycleMatch[1]) : null,
        stake: card?.stake ?? null,
        combinedOdds: card?.combinedOdds ?? null,
        potentialReturn: card?.potentialReturn ?? null,
        goalTarget: curRung?.goalTarget ?? null,
        hasCard,
        rungs,
        legs: (card?.legs ?? []).map((l) => ({
          selection: l.selection,
          market: l.marketLabel,
          odds: l.odds,
          kickoff: null, // not in the already-loaded leg shape → omit (fail-closed, never fabricated)
          game: l.matchup,
          why: null,
          player: l.player ?? null,
        })),
        nextKickoff: null,
      };
    })
    .filter((l): l is ClimbLane => l !== null);

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden">
      {/* FLAGSHIP — the "live climb" hero: a plain-English, mobile-first front door to the ladder. It is
          purely presentational (every figure is read verbatim from the data loaded above) and sits ABOVE
          the existing dense ladder components, which remain below unchanged. */}
      <ClimbHero
        currentBankroll={dailyPortfolio.activeBankroll}
        peakBankroll={dailyPortfolio.crownBankroll}
        openExposure={dailyPortfolio.openExposure}
        recordLabel={recordLabel}
        lanes={climbLanes}
        completedLadders={completedLadders}
      />

      {/* PRIMARY — Today's Dual Bank Builder: the SINGLE live two-lane ladder leads the page. It LEADS
          with the live exposure summary, then the dual-lane step rail (current step open by default).
          The completed crown proof is moved below into a collapsed disclosure (historical only). */}
      {bbActiveLaunched ? (
        <section className="gtp-fade-up mb-6" aria-label="Today's Dual Bank Builder">
          <p className="mb-3 font-mono leading-relaxed" style={{ color: "var(--vault-text-mute)", fontSize: 11.5 }}>
            Current paper bankroll {money(dailyPortfolio.activeBankroll)} · Bank Builder open exposure {money(dailyPortfolio.exposure.core)} · available {money(dailyPortfolio.availableBankroll)} · peak paper bankroll {money(dailyPortfolio.crownBankroll)} (separate)
          </p>
          <DualLadderBoard preview={bbPreview} />
          <div className="mt-3"><CrossLaneCorrelationBadge laneA={bbLaneLegs("A")} laneB={bbLaneLegs("B")} /></div>
          <Link href="/mr-dub" className="gtp-card-hover mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3" style={{ border: "1px solid var(--vault-border)", borderTop: "2px solid var(--vault-gold-bright)", background: "rgba(212,175,55,0.06)", textDecoration: "none" }}>
            <span className="text-[13px]" style={{ color: "var(--vault-text)" }}>
              <span style={{ fontWeight: 700 }}>Full paper ledger on Mr. Dub</span> — every win, loss, void, stopped lane &amp; restart. Bank Builder shows active paths &amp; successful ladders; Mr. Dub tracks it all.
            </span>
            <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>Open Mr. Dub →</span>
          </Link>
        </section>
      ) : null}

      {/* Moonshot is now its OWN product at /moonshot (mirrors Bank Builder). It is no longer surfaced
          here — Bank Builder stays focused on the core Dual Bank Builder ladder + crown proof. */}

      {/* SECTION 1 — hero + completed-ladder proof. When the crown is COMPLETED it is historical proof,
          so it is collapsed by default (the ACTIVE daily ladder above is the primary workflow). An
          active/in-progress run stays open. */}
      <details open={!completed} className="gtp-fade-up mt-2 rounded-2xl" style={{ border: completed ? "1px solid var(--vault-border)" : "none" }}>
        <summary className="cursor-pointer list-none px-4 py-3 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
          {completed ? "Completed crown proof · CROWN REACHED · historical (tap to view)" : "Current run proof"}
        </summary>
      <section
        className="gtp-fade-up relative overflow-hidden rounded-2xl px-5 py-6 sm:px-7"
        style={{ border: "1px solid var(--vault-border)", background: "linear-gradient(135deg, rgba(242, 54, 69,0.08), rgba(26, 16, 11,0.25))" }}
      >
        <div aria-hidden className="gtp-field-grid absolute inset-0" style={{ opacity: 0.5 }} />
        <div
          aria-hidden
          className="absolute right-0 top-0 h-40 w-40 translate-x-10 -translate-y-12 rounded-full"
          style={{ background: BANK.gradient, filter: "blur(6px)" }}
        />
        <div className="relative flex items-start gap-3.5">
          <span
            className="gtp-sport-orb shrink-0"
            style={{ width: 46, height: 46, fontSize: 25, marginTop: 2, ["--orb-grad" as string]: BANK.gradient }}
            role="img"
            aria-label={BANK.ballLabel}
          >
            {BANK.icon}
          </span>
          <PageHero
            eyebrow={completed ? "Completed paper ladder · proof" : onTheCrownRun ? "Final step · Road to $10,000" : "Paper ladder · current run"}
            title="Bank Builder"
            subMaxWidth={560}
            sub={completed
              ? `Officially settled ${recordLabel} — the $100 paper ladder reached ${formatLadderUsdPrecise(currentBankroll)} across 5 rungs. Paper-only educational tracking.`
              : `A ${recordLabel} paper run — ${hits.length} steps cleared from $100 toward the $10,000 crown, one card per step. Paper-only; we do not take real money.`}
          />
        </div>

        {completed ? (
          <div className="relative mt-4 flex flex-col gap-1.5">
            <span className="font-display tracking-tight" style={{ color: "var(--gtp-bank-heat)", fontSize: "clamp(27px, 5.6vw, 46px)", fontWeight: 800, lineHeight: 1.0 }}>
              🏆 Road to $10K completed
            </span>
            <span className="font-display tabular tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(20px, 4.2vw, 32px)", fontWeight: 700, lineHeight: 1.04 }}>
              $100 <span style={{ color: "var(--vault-text-faint)" }}>→</span> {formatLadderUsdPrecise(currentBankroll)} · {recordLabel}
            </span>
            <span className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
              Five paper rungs cleared, each officially settled — the final rung hit on NBA Finals Game 5. Over 100× the $100 start. Paper-only educational tracking.
            </span>
          </div>
        ) : onTheCrownRun ? (
          <div className="relative mt-4 flex flex-col gap-1">
            <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(26px, 5.2vw, 40px)", fontWeight: 700, lineHeight: 1.02 }}>
              {recordLabel}. One step from $10K.
            </span>
            <span className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
              The $100 paper ladder is now at {formatLadderUsdPrecise(currentBankroll)}. Final step: {formatLadderUsd(activeStep.start)} → {formatLadderUsd(activeStep.goal)}.
            </span>
          </div>
        ) : null}

        {/* Flagship run strip — every value is the real settled ledger. */}
        <div className="relative mt-4 flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#6EE7A8", background: "rgba(110,231,168,0.12)", border: "1px solid rgba(110,231,168,0.35)" }}>
              {hits.length} wins cleared · {recordLabel}
            </span>
            {hits.map((h) => (
              <span key={h.step} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10.5px]" style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)", background: "rgba(26, 16, 11,0.45)" }}>
                <span aria-hidden>{getSportIdentity(h.sport).icon}</span>
                Step {h.step} · {formatLadderUsdPrecise(h.bankrollAfter)} <span style={{ color: "#6EE7A8" }}>✓</span>
              </span>
            ))}
            <span className="gtp-heat-pulse rounded-full px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--gtp-bank-heat)", background: "var(--gtp-bank-heat-dim)" }}>
              {completed ? "Crown reached · 5 / 5 ✓" : `Step ${activeStep.step} · next decision pending`}
            </span>
          </div>
          {/* $100 → $10,000 progress meter (linear share of the crown). */}
          <div className="flex items-center gap-2.5">
            <span className="font-mono shrink-0 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>$100</span>
            <div className="gtp-meter-track h-2.5 flex-1" role="img" aria-label={`Paper bankroll ${formatLadderUsdPrecise(currentBankroll)} of the $10,000 crown`}>
              <div className="gtp-meter-fill gtp-meter-fill--lava" style={{ width: `${Math.min(100, Math.max(2, (currentBankroll / 10000) * 100))}%` }} />
              <div aria-hidden className="gtp-meter-shimmer" />
            </div>
            <span className="font-mono shrink-0 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>$10,000</span>
          </div>
          <span className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-mute)" }}>
            {formatLadderUsdPrecise(currentBankroll)} — {Math.round((currentBankroll / 10000) * 100)}% of the crown
          </span>
        </div>
      </section>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <BoardStatTile label={completed ? "Final paper bankroll" : "Paper bankroll"} value={formatLadderUsdPrecise(currentBankroll)} sub={completed ? "from $100 · 5 / 5 cleared" : `Step ${activeStep.step} / 5 · current run`} accent="var(--risk-low)" />
        <BoardStatTile label={completed ? "Crown" : "Today's goal"} value={formatLadderUsd(BANK_BUILDER_GOAL)} sub={completed ? "reached · officially settled" : `from ${formatLadderUsd(activeStep.start)} · pending`} accent="var(--sport-soccer)" />
        <BoardStatTile label={completed ? "Final rung" : "Today's card"} value={completed ? "WON" : publishedCandidate || officialStep3 ? "Pending" : "—"} sub={completed ? "NBA Finals Game 5 · settled" : publishedCandidate ? `${candidateSports} · Step ${activeStep.step}` : officialStep3 ? `World Cup · Step ${activeStep.step}` : "none cleared yet"} accent={completed ? "var(--vault-success)" : "var(--risk-longshot)"} />
        <BoardStatTile label="Record" value={recordLabel} sub={completed ? "5 rungs · officially settled" : "settled ladder steps"} accent="var(--vault-gold-bright)" />
      </div>
      </details>

      {/* (Removed the standalone $100→$10K meter — it duplicated the completed-crown hero above and
          the active dual ladder's own per-lane meters. One crown statement, one active ladder.) */}

      {/* When no dual ladder is launched, still show the engine's dry-run / no-qualified preview. */}
      {!bbActiveLaunched ? <div className="mt-6"><BankBuilderPreviewPanel preview={bbPreview} /></div> : null}

      {/* V2 survival-gate evaluation panel — hidden once an active dual ladder is launched
          (no "no qualifying launch yet" box when today's ladder is live). */}
      {v2 && !bbActiveLaunched ? <div className="mt-6"><BankBuilderV2Panel v2={v2} /></div> : null}

      {/* Archived closed test ladder — demoted + collapsed (real outcome preserved, not promoted). */}
      {completed ? (
        <details className="mt-6 rounded-2xl" style={{ border: "1px solid var(--vault-border)", background: "rgba(255,255,255,0.02)" }}>
          <summary className="cursor-pointer px-4 py-3 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
            Archived closed test ladder — the earlier dual-lane test (both lanes lost). Tap to view the real settled legs.
          </summary>
          <div className="px-1 pb-2"><DualBankBuilderTeaser data={loadDualBankBuilder()} crown={crownLadderSummary(path.join(process.cwd(), "public", "data"))} /></div>
        </details>
      ) : null}

      {/* SECTION 2 — the ladder + the day-by-day run plan */}
      <div className="mt-6">
        <BankBuilderTower activeStepNumber={activeStep.step} currentBankroll={currentBankroll} />
      </div>

      <section className="mt-5 rounded-2xl p-5" style={{ border: "1px solid var(--vault-border)", background: "var(--lava-panel)" }} aria-label="Run plan">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--vault-text)" }}>Run plan</h2>
          <span className="text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>Bankroll today is {formatLadderUsdPrecise(currentBankroll)} — targets below are goals, not the current balance.</span>
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
                  border: isActive ? "1px solid rgba(242, 54, 69,0.40)" : "1px solid var(--vault-rule)",
                  background: isActive ? "rgba(242, 54, 69,0.06)" : "rgba(26, 16, 11,0.40)",
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
        <p className="mt-3 text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
          Later steps are planned only if today&apos;s step settles successfully. A loss resets the run to the {formatLadderUsd(BANK_BUILDER_LADDER[0].start)} base. Paper-only educational tracking.
        </p>
      </section>

      {/* SECTION 2.5 — the latest cleared step (hidden when completed; the crown card covers it) */}
      {latestHit && !completed ? (
        <section
          className="gtp-fade-up relative mt-5 overflow-hidden rounded-2xl px-5 py-5"
          style={{ border: "1px solid rgba(110,231,168,0.35)", background: "linear-gradient(135deg, rgba(110,231,168,0.08), rgba(26, 16, 11,0.30))" }}
          aria-label={`Step ${latestHit.step} hit`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "#6EE7A8" }}>
              Step {latestHit.step} hit · {fmtUtcDate(latestHit.date)}
            </span>
            <span className="rounded px-2 py-0.5 text-[11px] font-bold tracking-[0.08em]" style={{ color: "#6EE7A8", background: "rgba(110,231,168,0.15)" }}>WON</span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display tabular tracking-tight" style={{ color: "var(--vault-text)", fontSize: 22, fontWeight: 700 }}>
              {formatLadderUsdPrecise(latestHit.bankrollBefore)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> {formatLadderUsdPrecise(latestHit.bankrollAfter)}
            </span>
            <span className="font-mono text-[12px]" style={{ color: "#6EE7A8" }}>+{formatLadderUsdPrecise(latestHit.profitUnits)}</span>
            {typeof latestHit.combinedAmerican === "number" ? (
              <span className="font-mono text-[11px]" style={{ color: "var(--vault-text-faint)" }}>{latestHit.combinedAmerican >= 0 ? "+" : ""}{latestHit.combinedAmerican}</span>
            ) : null}
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {latestHit.legs.map((l, i) => (
              <li key={i} className="flex items-center gap-2.5 rounded-[8px] px-3 py-2" style={{ background: "rgba(26, 16, 11,0.45)", border: "1px solid var(--vault-rule)" }}>
                <span aria-hidden style={{ color: "#6EE7A8", fontSize: 12 }}>✓</span>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[12.5px] font-semibold truncate" style={{ color: "var(--vault-text)" }}>
                    {l.player ?? l.selection}{l.side && l.line != null ? ` · ${l.side} ${l.line}` : ""}
                  </span>
                  {/* Official final-result evidence — soccer final score / box-score stat. */}
                  <span className="font-mono text-[10.5px] truncate" style={{ color: "var(--vault-text-faint)" }}>
                    {l.finalScore
                      ? `Final · ${l.finalScore}`
                      : typeof l.finalStat === "number"
                        ? `Official box score · ${l.finalStat} ${l.market.replace(/_/g, " ")}`
                        : l.market.replace(/_/g, " ")}
                    {l.bookmaker ? ` · ${l.bookmaker}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {latestHit.officialResultConfirmed ? (
            <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)" }}>
              Settled from official results · paper-only educational tracking
            </p>
          ) : null}
        </section>
      ) : null}

      {/* SECTION 3 — today's official card / the final-step road to $10K.
          (The completed-crown celebration is shown ONCE, in the hero above — not repeated here.) */}
      {completed ? null : publishedCandidate ? (
        <OfficialCandidateCard candidate={publishedCandidate} />
      ) : officialStep3 ? (
        <OfficialStep3CandidateCard candidate={officialStep3} stepNumber={activeStep.step} />
      ) : isFinalStep ? (
        <section
          className="gtp-fade-up relative mt-5 overflow-hidden rounded-2xl px-5 py-5"
          style={{ border: "1px solid var(--vault-border)", background: "linear-gradient(135deg, rgba(225, 29, 42,0.10), rgba(26, 16, 11,0.30))" }}
          aria-label="Road to $10,000"
        >
          <div aria-hidden className="gtp-heat-pulse absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-10 rounded-full" style={{ background: "var(--gtp-bank-lava)", filter: "blur(8px)", opacity: 0.5 }} />
          <span className="relative font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--gtp-bank-heat)" }}>Final step · review pending</span>
          <h2 className="relative mt-1 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(20px, 3.4vw, 28px)", fontWeight: 700 }}>
            Final step: {formatLadderUsd(activeStep.start)} → {formatLadderUsd(activeStep.goal)}
          </h2>
          <p className="relative mt-2 text-[13px]" style={{ color: "var(--vault-text-mute)", maxWidth: 560 }}>
            Target final card: <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{step5Target?.targetLabel ?? "the best real 2-leg card"}</span>. It publishes only when both legs clear real model + market gates — no card is invented to fill the rung.
          </p>

          {/* Per-sport readiness — computed from real artifacts, never fabricated. */}
          {step5Target ? (
            <div className="relative mt-3 flex flex-col gap-2">
              {step5Target.legs.map((leg) => {
                const tone = leg.state === "ready"
                  ? { c: "#6EE7A8", bg: "rgba(110,231,168,0.12)", b: "rgba(110,231,168,0.35)", label: "READY" }
                  : { c: "var(--gtp-bank-heat)", bg: "var(--gtp-bank-heat-dim)", b: "rgba(242, 54, 69,0.32)", label: "PENDING" };
                return (
                  <div key={leg.label} className="rounded-[10px] px-3 py-2.5" style={{ background: "rgba(26, 16, 11, 0.45)", border: "1px solid var(--vault-rule)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold" style={{ color: "var(--vault-text)" }}>{leg.label}</span>
                      <span className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-[0.1em]" style={{ color: tone.c, background: tone.bg, border: `1px solid ${tone.b}` }}>{tone.label}</span>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>{leg.detail}</p>
                  </div>
                );
              })}
              <p className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
                <span className="font-mono uppercase tracking-[0.1em] text-[9.5px]" style={{ color: "var(--gtp-bank-heat)" }}>Next:</span> {step5Target.nextAction}
              </p>
            </div>
          ) : null}

          <Link
            href="/picks"
            className="gtp-cta-lava vault-press relative mt-3 inline-flex rounded-full px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{ textDecoration: "none" }}
          >
            Check final-step candidates →
          </Link>
        </section>
      ) : (
        <section className="mt-5 rounded-2xl px-5 py-4" style={{ border: "1px solid var(--vault-border)", background: "var(--lava-panel)" }} aria-label="Today's card">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--vault-text)" }}>Today&apos;s card</h2>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No official Bank Builder card has cleared today&apos;s gates yet. A card appears only when the slate supports one.</p>
        </section>
      )}

      {/* SECTION 4 — previous hits */}
      <PreviousHits hits={hits} recordLabel={recordLabel} />

      {/* The "next run" is no longer a teaser — the Dual Bank Builder above is LIVE
          (Run #2, Step 1). The old next-ladder teaser was removed to avoid contradicting it. */}

      {/* SECTION 5 — tiny footer */}
      <p className="mt-6 text-center text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        Paper-only educational tracking.{" "}
        <Link href="/learn#bank-builder" className="underline" style={{ color: "var(--vault-text-mute)" }}>How it works →</Link>
      </p>
    </div>
  );
}
