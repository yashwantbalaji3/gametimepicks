/**
 * /today — daily command center. One scan tells the user what's live today: active sports with
 * counts, the top suggested cards (interactive paper stake), and Bank Builder status. Aggregates
 * existing public artifacts only; no internal/debug content. Additive route — does not alter the
 * existing homepage or sport pages.
 */
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";

import { currentEtDate } from "@/lib/freshness";
import {
  loadWorldCupParlays,
  loadWorldCupProjections,
  loadWorldCupPlayerProjections,
} from "@/lib/world-cup/projections";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import { loadPublicBankBuilderSummary } from "@/lib/data-bank-builder";
import { resolveLadderStep } from "@/lib/bank-builder-ladder";
import { loadWorldCupSchedule, matchesOnDate } from "@/lib/data-world-cup";
import { gameSlug } from "@/lib/game-detail";
import { normTeamName } from "@/lib/world-cup/market-outlook";
import PlayerAvatar from "@/components/ui/player-avatar";
import { normalizeWcCards, normalizeOptimizerSlips, loadDailyMixedCards, type SportSummary } from "@/lib/normalize";
import { getSuggestedParlaysForDate } from "@/lib/data-parlays";
import FlagBadge from "@/components/flag-badge";
import { loadWorldCupFlexLeg, loadOfficialStepCandidate } from "@/lib/world-cup-flex";
import { loadOfficialPublishedCandidate } from "@/lib/bank-builder-official-candidate";
import { loadDualBankBuilder } from "@/lib/data-dual-bank-builder";
import { loadBankBuilderV2 } from "@/lib/data-bank-builder-v2";
import { crownLadderSummary } from "@/lib/bank-builder/crown-summary";
import BankBuilderStatusRail from "@/components/bank-builder/bank-builder-status-rail";
import AchievementBanner from "@/components/achievement-banner";
import MrDubTodayCard from "@/components/mr-dub/mr-dub-today-card";
import ParlaysExplorer from "@/components/parlays/parlays-explorer";
// (DualBankBuilderTeaser now renders only on /bank-builder; Today uses the compact status rail.)
import OfficialCandidateCard from "@/components/bank-builder/official-candidate-card";
import UfcExpandedFightCards from "@/components/ufc/expanded-fight-cards";
import SuggestedCard from "@/components/ui/suggested-card";
import SportCard from "@/components/ui/sport-card";
import WorldCupFlexCard from "@/components/bank-builder/world-cup-flex-card";
import OfficialStep3CandidateCard from "@/components/bank-builder/official-step3-candidate";
import SectionHeader from "@/components/section-header";
import YesterdaySummary from "@/components/yesterday-summary";
import { loadTodaySlate, currentSlateDate } from "@/lib/parlays/ui-loader";
import { loadMoonshotLane } from "@/lib/moonshot/moonshot-lane";
import { buildCoverageMatrix } from "@/lib/parlays/coverage-matrix";
import WorldCupSpecialsBox from "@/components/world-cup/world-cup-specials-box";
import ProductLanesLadder from "@/components/ladders/product-lanes-ladder";
import HomerNukesBoard from "@/components/mlb/homer-nukes-board";
import { loadHomerNukes } from "@/lib/mlb/homer-nukes";
import { loadWorldCupSpecials } from "@/lib/world-cup/world-cup-specials";
import EgyptNzSameGame, { loadNzEgyptMarkets } from "@/components/world-cup/egypt-nz-same-game";
import { loadModelQualifiedProps } from "@/lib/world-cup/model-qualified-props";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";

export const metadata = {
  title: "Today · GameTime Picks",
  description:
    "Today's board — what's live across World Cup, MLB and more: projections, player props, and suggested paper cards. Educational, paper-only.",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 700 }}>
        {value}
      </span>
      <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
        {label}
      </span>
    </div>
  );
}

export default function TodayPage() {
  // Frame the page on the slate the product is presenting (the latest generated slate). When an
  // overnight job has produced today's slate this equals the wall clock; when it hasn't, we show the
  // latest available slate (e.g. June 20) coherently rather than a wall-clock "today" with no data.
  const today = currentSlateDate() ?? currentEtDate();
  // Yesterday (ET) — drives the settled-results strip; UTC-noon math avoids off-by-one.
  const yesterday = new Date(new Date(`${today}T12:00:00Z`).getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  loadWorldCupSchedule(); // warm + ensure data dir
  const wcGames = matchesOnDate(today).length;
  // Soccer is credential-gated (API_FOOTBALL_KEY). Without a fresh pull for
  // `today` the projections / player props / cards are stale, so they must NOT
  // surface as live analytics — fail closed (only data dated today counts).
  const wcCardsRaw = loadWorldCupParlays();
  const wcProjRaw = loadWorldCupProjections();
  const wcPlayersRaw = loadWorldCupPlayerProjections();
  const wcCards = wcCardsRaw && wcCardsRaw.date === today ? wcCardsRaw : null;
  const wcProj = wcProjRaw && wcProjRaw.date === today ? wcProjRaw : null;
  const wcPlayers = wcPlayersRaw && wcPlayersRaw.date === today ? wcPlayersRaw : null;
  const mlb = getMlbBoardForDate(today);
  // Public ladder summary — the source of truth, not the internal audit summary.
  const bank = loadPublicBankBuilderSummary();

  // UFC — tonight's featured slate (real ESPN MMA card + V1 moneyline model). Read the same
  // public artifacts /ufc reads; only treat as live when the model is ready with real projections.
  type UfcSched = { eventName?: string; eventDate?: string; fightCount?: number; isRealCard?: boolean; venue?: string };
  type UfcProj = { moneylineV1Ready?: boolean; moneylineValidated?: boolean; projections?: unknown[] };
  type UfcParlays = { cards?: unknown[] };
  const loadUfc = <T,>(name: string, fb: T): T => {
    try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", name), "utf8")) as T; } catch { return fb; }
  };
  const ufcSettlement = loadUfc<{ status?: string; moneyline?: { record?: string; accuracyPct?: number } } | null>("results-settled-latest.json", null);
  const ufcSettled = ufcSettlement?.status === "final";
  const ufcSched = loadUfc<UfcSched | null>("schedule-latest.json", null);
  const ufcProj = loadUfc<UfcProj | null>("projections-latest.json", null);
  const ufcParlays = loadUfc<UfcParlays | null>("suggested-parlays-latest.json", null);
  const ufcExpanded = loadUfc<{ projections?: unknown[] } | null>("expanded-projections-latest.json", null);
  const ufcFights = (ufcExpanded?.projections ?? []) as Parameters<typeof UfcExpandedFightCards>[0]["fights"];
  const ufcProjCount = ufcProj?.projections?.length ?? 0;
  const ufcCardCount = ufcParlays?.cards?.length ?? 0;
  const ufcLive = Boolean(ufcSched?.isRealCard && ufcProj?.moneylineV1Ready && ufcProjCount > 0);
  const ufcDateLabel = ufcSched?.eventDate
    ? new Date(ufcSched.eventDate).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", timeZoneName: "short" })
    : null;

  // "Live" soccer requires FRESH (today-dated) credentialed projections — a stale
  // schedule alone does not make the sport live (fail closed without the API key).
  const wcLive = !!wcProj;
  const mlbLive = (mlb.summary.scheduledGames ?? 0) > 0;
  const activeSports = (wcLive ? 1 : 0) + (mlbLive ? 1 : 0);
  // Active "Top cards" are TODAY's only — stale daily-mixed / World Cup artifacts are gated out.
  const mixedCards = loadDailyMixedCards(today);
  const freshWcCards = wcCards; // already gated to today-dated parlays above (else null)
  const topCards = [...mixedCards, ...normalizeWcCards(freshWcCards)].slice(0, 4);
  // Homepage MLB suggested parlays — top curated odds-backed cards from today's snapshot.
  const mlbCards = normalizeOptimizerSlips(
    getSuggestedParlaysForDate(today)?.slips ?? null,
    { sportFilter: "mlb", date: today },
  ).slice(0, 4);
  // Combined, de-duped suggested-card pool for the filterable Today section (WC + mixed + MLB).
  // Dual Bank Builder — the latest dual run (settled Run #2) + the V2 survival-gate evaluation.
  const dualBank = loadDualBankBuilder();
  const v2 = loadBankBuilderV2();
  // Today's Focus = World Cup fixtures. The projections artifact now carries MANY
  // markets per fixture (moneyline / double chance / totals / btts / dnb); the focus
  // strip is keyed on the 3-way moneyline (one per fixture) and attaches a double-chance
  // + total-goals line for the dropdown.
  const wcAll = wcProj?.matches ?? [];
  const wcByMatch = (mid: number | string, market: string) =>
    wcAll.find((m) => m.matchId === mid && m.market === market);
  // Top player prop per fixture — joins the player-props artifact by team (it keys on the Odds
  // event id, not the schedule matchId). Anytime-goalscorer preferred, else highest model prob.
  const wcProps = wcPlayers?.matches ?? [];
  const topPropFor = (home: string, away: string): WcFocusMatch["topPlayerProp"] => {
    const teams = new Set([normTeamName(home), normTeamName(away)]);
    const cands = wcProps.filter((p) => p.player?.team && teams.has(normTeamName(p.player.team)));
    if (!cands.length) return null;
    cands.sort((a, b) => {
      const ag = a.market === "player_goal_scorer_anytime" ? 1 : 0;
      const bg = b.market === "player_goal_scorer_anytime" ? 1 : 0;
      if (ag !== bg) return bg - ag;
      return (b.modelProbability ?? 0) - (a.modelProbability ?? 0);
    });
    const p = cands[0];
    const label = p.market === "player_goal_scorer_anytime" ? "Anytime goalscorer" : `${p.pick} ${p.line ?? ""}`.trim();
    return { name: p.player.name, team: p.player.team, photo: p.player.photo ?? null,
             label, odds: p.americanOdds ?? 0, prob: p.modelProbability ?? 0 };
  };
  const wcFocus: WcFocusMatch[] = wcAll
    .filter((m) => m.market === "moneyline_90" && typeof m.americanOdds === "number" && !!m.pickLabel)
    .slice(0, 6)
    .map((m) => {
      const dc = wcByMatch(m.matchId, "double_chance");
      const tot = wcByMatch(m.matchId, "match_total_goals");
      return {
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeCode: m.homeCode ?? null,
        awayCode: m.awayCode ?? null,
        slug: gameSlug(m.homeTeam, m.awayTeam, today),
        started: m.kickoffUtc ? new Date(m.kickoffUtc).getTime() <= Date.now() : false,
        pickLabel: m.pickLabel,
        americanOdds: m.americanOdds as number,
        confidence: m.confidence ?? "limited",
        outcomes: (m.outcomes ?? []).map((o) => ({
          label: o.label,
          side: o.side,
          modelProbability: o.modelProbability,
          americanOdds: o.americanOdds ?? 0,
        })),
        doubleChance: dc ? { pick: dc.pickLabel, odds: dc.americanOdds ?? 0, prob: dc.modelProbability } : null,
        totalGoals: tot ? { pick: tot.pickLabel, odds: tot.americanOdds ?? 0, prob: tot.modelProbability } : null,
        topPlayerProp: topPropFor(m.homeTeam, m.awayTeam),
        group: m.group ?? null,
        homeForm: m.homeForm?.formString ?? null,
        awayForm: m.awayForm?.formString ?? null,
      };
    });
  // The official candidate is loaded for the ACTIVE rung (stake = full bankroll, floor =
  // the rung's ladder goal), matching /bank-builder. The loader's slate-freshness gate
  // returns null for stale (already-played) slates, so a settled step can never
  // re-render as a pending card. The spotlight Flex Card only shows alongside a live slate
  // when no official card cleared.
  const activeRung = bank ? resolveLadderStep(bank.currentBankrollUnits) : null;
  const publishedCandidate = loadOfficialPublishedCandidate();
  const officialStep3 =
    publishedCandidate ? null : bank && activeRung ? loadOfficialStepCandidate(bank.currentBankrollUnits, activeRung.goal) : null;
  const flexLeg = publishedCandidate || officialStep3 ? null : loadWorldCupFlexLeg();
  // Crown ladder summary — the ONE source for the completed $100 → $10K figures (no hardcoded literals).
  const crown = crownLadderSummary(path.join(process.cwd(), "public", "data"));
  const bankrollLabel = bank
    ? `$${bank.currentBankrollUnits.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : (crown?.finalLabel ?? null);
  const sportSummaries: SportSummary[] = [
    {
      sport: "ufc", label: "UFC", href: "/ufc", accent: "var(--gtp-bank-heat)", live: ufcLive && !ufcSettled,
      stats: [
        { label: "Fights", value: ufcSched?.fightCount ?? 0 },
        { label: "Projections", value: ufcProjCount },
        { label: "Cards", value: ufcCardCount },
        { label: "Market", value: "ML" },
      ],
    },
    {
      sport: "world_cup", label: "World Cup", href: "/world-cup", accent: "var(--vault-gold-bright)", live: wcLive,
      stats: [
        { label: "Games", value: wcProj?.matchCount ?? wcFocus.length },
        { label: "Projections", value: wcProj?.projectionCount ?? 0 },
        { label: "Player props", value: wcPlayers?.projectionCount ?? 0 },
        { label: "Cards", value: wcCards?.cardCount ?? 0 },
      ],
    },
    {
      sport: "mlb", label: "MLB", href: "/mlb", accent: "#3b82f6", live: mlbLive,
      stats: [
        { label: "Games", value: mlb.summary.scheduledGames ?? 0 },
        { label: "Leans", value: mlb.summary.leans ?? 0 },
        { label: "High conf", value: (mlb.summary as { highConfidence?: number }).highConfidence ?? 0 },
        { label: "Slate", value: today.slice(5) },
      ],
    },
  ];
  const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  // World Cup Specials — homepage-only feature box (5 Moonshot-style WC-only paper longshots). Read
  // the committed snapshot; fail closed when it is for a stale slate (never surface yesterday's cards).
  const wcSpecialsRaw = loadWorldCupSpecials();
  const wcSpecials = wcSpecialsRaw && wcSpecialsRaw.date === today ? wcSpecialsRaw : null;
  // Egypt vs New Zealand — same-game ideas from the real matchId-40 markets (kickoff-gated, archived
  // after kickoff). Only for the today-dated slate so a stale projections file is never surfaced.
  const nzEgyptMarkets = loadNzEgyptMarkets(today);

  const engineSlate = loadTodaySlate();
  const engineSportsLive = engineSlate.sports.filter((s) => s.eligibleCount > 0);
  const engineSuggested = engineSlate.allSuggested.length;
  const bbPreview = engineSlate.bankBuilderPreview;
  const bbSettled = bbPreview.status === "settled";
  const bbLadder = bbPreview.isLadder;
  const bbStep = bbPreview.currentStep;
  // Lanes that have cleared Step 1 WON (ladder), else lanes whose single step settled won.
  const bbLanesCleared = [bbPreview.laneA, bbPreview.laneB].filter(Boolean)
    .filter((l) => l!.steps.length ? l!.steps.some((s) => s.status === "settled" && s.result === "won") : l!.result === "won").length;

  // ── June 23 readiness summary (compact module strip) ─────────────────────────
  const modelProps = loadModelQualifiedProps(path.join(process.cwd(), "public", "data"), new Date().toISOString(), today);
  const dailyPortfolio = buildDailyPortfolio(path.join(process.cwd(), "public", "data"), new Date().toISOString(), today);
  // Authoritative core money state (ledger-built) for the Mr. Dub readiness module.
  let coreWins = bbLanesCleared; let coreLosses = 0;
  try {
    const pf = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "mr-dub", "portfolio.json"), "utf8"));
    coreWins = pf.record?.wins ?? coreWins; coreLosses = pf.record?.losses ?? 0;
  } catch { /* fail closed → derived defaults */ }
  // The two flagship ladders that LEAD the page (owner restructure): the Bank Builder and Moonshot
  // lane cards (Lane A/B step rail + the current rung's legs, with team logos + player portraits).
  const bankBuilderLadder = dailyPortfolio.cards.filter((c) => c.product === "bank-builder");
  const moonshotLadder = dailyPortfolio.cards.filter((c) => c.product === "moonshot");
  // Homer Nukes — the daily MLB home-run parlay (data-gated; honest empty until MLB props post).
  const homerNukes = loadHomerNukes(path.join(process.cwd(), "public", "data"), today);
  // The "what's live" strip is a STATUS board for the surfaces NOT in the flagship highlight above.
  // Bank Builder, Moonshot and World Cup Specials ARE the highlight (rendered as full ladders/parlays
  // right above), so they are intentionally omitted here — no destination is duplicated as a status card.
  const readinessModules: { label: string; value: string; sub: string; href: string }[] = [
    { label: "Mr. Dub", value: `${coreWins}-${coreLosses}`, sub: "official settlement record", href: "/results" },
    { label: "World Cup", value: `${wcFocus.length} games`, sub: "model picks table", href: "/world-cup?tab=model-picks" },
    { label: "Model Player Props", value: `${modelProps.qualifiedCount} picks`, sub: `${modelProps.evaluatedCount} markets evaluated`, href: "/world-cup?tab=player-props" },
    { label: "Parlay Lab", value: `${engineSuggested} cards`, sub: "model-qualified legs", href: "/picks" },
    { label: "MLB", value: mlbLive ? `${mlb.summary.scheduledGames} games` : "No board", sub: mlbLive ? "board live" : "odds not posted yet", href: "/mlb" },
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-8">
      {/* 0 — Track-record social proof (2× $100→$10K completed). Factual, read from the canonical ledger. */}
      <AchievementBanner />
      {/* 1 — THE FLAGSHIP HIGHLIGHT: the three core paper products — Bank Builder, Moonshot, World Cup
            Specials — in order. They are the homepage's lead section. The quick-jump flashcards link only
            to these three (every other destination lives in the top/side nav, so no duplication), then the
            full ladders/boards render below in the same order. (Homer Nukes retired 2026-06-30.) */}
      <section aria-label="Flagship products" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>Today&apos;s flagship products</h2>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Bank Builder · Moonshot · World Cup Specials — paper-only</span>
        </div>

        {/* Quick-jump flashcards — ONLY the four flagship products (the top/side nav covers everything
            else: Results, Methodology, Games, etc.), so nothing is duplicated. */}
        <nav aria-label="Flagship quick links" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            { href: "/bank-builder", label: "Bank Builder", sub: "Dual ladder" },
            { href: "/moonshot", label: "Moonshot", sub: "Daily longshots" },
            { href: "/world-cup-specials", label: "WC Specials", sub: "Suggested parlays" },
          ].map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="vault-glow-hover vault-press rounded-[12px] px-3 py-3.5 flex flex-col items-center justify-center text-center gap-0.5"
              style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)", borderTop: "2px solid var(--gtp-bank-heat)", textDecoration: "none" }}
            >
              <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>{a.label}</span>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{a.sub}</span>
            </Link>
          ))}
        </nav>

        {/* PRIORITY #1: Bank Builder ladders (step rail + current rung legs, team logos + player portraits). */}
        {bankBuilderLadder.length > 0 && (
          <div aria-label="Bank Builder ladders" className="flex flex-col gap-2">
            <ProductLanesLadder productLabel="Bank Builder" product="bank-builder" lanes={bankBuilderLadder} accent="gold" />
            <Link href="/bank-builder" className="self-start font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
              Open the full Bank Builder ladder →
            </Link>
          </div>
        )}

        {/* PRIORITY #2: Moonshot — independent daily longshot cards (NOT a ladder), higher-volatility. */}
        {moonshotLadder.length > 0 && (
          <div aria-label="Moonshot cards" className="flex flex-col gap-2">
            <ProductLanesLadder productLabel="Moonshot" product="moonshot" lanes={moonshotLadder} accent="violet" />
            <Link href="/moonshot" className="self-start font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
              Open the full Moonshot board →
            </Link>
          </div>
        )}

        {/* PRIORITY #3: World Cup exclusive parlays. Gated to today; fails closed on a stale slate. */}
        {wcSpecials && <WorldCupSpecialsBox data={wcSpecials} />}
        {/* Homer Nukes retired 2026-06-30 — removed from the flagship row (registry status "retired"). */}
      </section>

      {/* 1.4 — June 23 readiness strip: one glance at every live surface (Bank Builder, World Cup,
            model player props, Parlay Lab, Moonshot, Specials), each a tap-through. Paper-only. */}
      <section aria-label={`${dateLabel} readiness`}>
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{dateLabel} — what&apos;s live</h2>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>paper-only</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {readinessModules.map((m) => (
            <Link
              key={m.label}
              href={m.href}
              className="vault-glow-hover vault-press rounded-[12px] px-3 py-3 flex flex-col gap-1"
              style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)", textDecoration: "none" }}
            >
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{m.label}</span>
              <span className="font-display tracking-tight" style={{ color: "var(--vault-gold-bright)", fontSize: 15, fontWeight: 700 }}>{m.value}</span>
              <span style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>{m.sub}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* 1.5 — Today's paper portfolio: Mr. Dub's 4 candidate lanes (Bank Builder A/B + Moonshot A/B).
            Derived, candidate-only (no exposure placed). Crown shown separately on /mr-dub. */}
      <Link
        href="/mr-dub"
        className="vault-glow-hover vault-press rounded-[14px] px-5 py-4 flex flex-col gap-2.5"
        style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)", borderTop: "2px solid var(--vault-gold-bright)", textDecoration: "none" }}
      >
        <div className="flex items-center justify-between">
          <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>Today&apos;s paper portfolio</span>
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Open Mr. Dub →</span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 font-mono" style={{ fontSize: 11.5 }}>
          {dailyPortfolio.anyActive ? (
            <span style={{ color: "var(--vault-text-mute)" }}>
              {dailyPortfolio.cards.filter((c) => c.status === "active").length} active lanes <span style={{ color: "var(--vault-text-faint)" }}>(Bank Builder A/B · Moonshot A/B)</span>
            </span>
          ) : (
            <span style={{ color: "var(--vault-text-mute)" }}>{dailyPortfolio.cards.length} candidate lanes <span style={{ color: "var(--vault-text-faint)" }}>(Bank Builder A/B · Moonshot A/B)</span></span>
          )}
          <span style={{ color: "var(--vault-text-mute)" }}>open exposure <span style={{ color: dailyPortfolio.anyActive ? "var(--vault-success)" : "var(--vault-text)" }}>${dailyPortfolio.openExposure.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
          <span style={{ color: "var(--vault-text-mute)" }}>available <span style={{ color: "var(--vault-text)" }}>${dailyPortfolio.availableBankroll.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
          <span style={{ color: "var(--vault-text-faint)" }}>crown ${dailyPortfolio.crownBankroll.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (historical)</span>
        </div>
        <span style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
          {dailyPortfolio.anyActive
            ? "Active paper lanes — open exposure at risk; active bankroll and crown unchanged until settlement. Paper-only."
            : "Candidate lanes place no exposure until activated — active bankroll and crown unchanged. Paper-only."}
        </span>
      </Link>

      {/* 1.6 — Model picks ready: user-facing summary of today's model-ranked cards → Parlay Lab.
            (Internal "methodology engine / STEP n LIVE / lanes cleared" language moved off the
            dashboard; Bank Builder status lives in its own rail below and on /methodology.) */}
      {engineSlate.available && (
        <Link
          href="/picks"
          className="vault-glow-hover vault-press rounded-[14px] px-5 py-4 flex flex-col gap-3"
          style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)", borderTop: "2px solid var(--gtp-bank-heat)", textDecoration: "none" }}
        >
          <div className="flex items-center justify-between">
            <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>Today&apos;s model picks</span>
            <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Open Parlay Lab →</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {engineSlate.sports.map((s) => (
              <span key={s.sport} className="rounded-full px-2.5 py-1 font-mono text-[11px]"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-border)", color: s.eligibleCount > 0 ? "var(--vault-text)" : "var(--vault-text-faint)" }}>
                {s.sport === "WORLD_CUP" ? "World Cup" : s.sport}{s.eligibleCount > 0 ? ` · ${s.eligibleCount} legs` : " · none today"}
              </span>
            ))}
          </div>
          <div className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
            {engineSuggested} model-ranked parlay{engineSuggested === 1 ? "" : "s"} across {engineSportsLive.length} sport{engineSportsLive.length === 1 ? "" : "s"} — tap to open the Parlay Lab. Paper-only.
          </div>
        </Link>
      )}

      {/* 2 — Today's Focus: World Cup */}
      <TodaysFocusWorldCup matches={wcFocus} games={wcGames} dateLabel={dateLabel} />

      {/* 2.6 — Egypt vs New Zealand same-game ideas (real markets only, no fabricated SGP price). */}
      {nzEgyptMarkets ? <EgyptNzSameGame data={nzEgyptMarkets} /> : null}

      {/* 3 — Bank Builder: compact run-timeline status (Run #1 completed · #2 closed · #3 V2 gate) */}
      <BankBuilderStatusRail
        run1Bankroll={bankrollLabel ?? undefined}
        run1Record={bank ? `${bank.record.wins}–${bank.record.losses}` : (crown?.recordLabel ?? undefined)}
        dual={dualBank}
        v2={v2}
        activeLaunched={bbPreview.status === "launched" || bbPreview.status === "settled"}
        activeSettled={bbSettled}
        activeLadderStep={bbLadder ? bbStep : undefined}
        lanesWon={bbLanesCleared}
        lanesTotal={2}
      />

      {/* 3.5 — Mr. Dub paper portfolio at a glance (current bankroll, latest P/L, exposure, record). */}
      <div className="mt-3"><MrDubTodayCard /></div>

      {/* 4 — Suggested parlays — canonical methodology engine (World Cup + Mixed + MLB, by risk,
            with per-leg model + last-5 drawers). Same data as /parlays and /picks. */}
      <section className="gtp-fade-up">
        <SectionHeader eyebrow={`Suggested parlays · ${dateLabel}`} title="Today's suggested cards" sub="Engine-built across World Cup, MLB and Mixed — by risk, leakage-validated, pre-event. Tap any leg for model + last-5 detail. Paper-only." />
        <div className="mt-3"><ParlaysExplorer slate={engineSlate} coverage={buildCoverageMatrix(engineSlate, loadMoonshotLane(), new Date().toISOString())} /></div>
      </section>

      {/* UFC — only LEADS on a live UFC day; once settled it moves to the results recap below. */}
      {!ufcSettled && ufcSched?.isRealCard ? (
        <section
          className="gtp-fade-up relative overflow-hidden rounded-[14px] px-5 py-5 sm:px-7 sm:py-6"
          style={{
            border: "1px solid var(--lava-border-strong)",
            background:
              "radial-gradient(120% 150% at 100% 0%, rgba(225, 29, 42,0.13) 0%, transparent 55%)," +
              "linear-gradient(135deg, rgba(26,20,14,0.95) 0%, var(--vault-bg) 70%)",
          }}
        >
          <div aria-hidden className="gtp-heat-pulse absolute right-0 top-0 h-40 w-40 translate-x-10 -translate-y-12 rounded-full" style={{ background: "var(--gtp-bank-lava)", filter: "blur(9px)", opacity: 0.42 }} />
          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>
              {ufcSettled ? "UFC · officially settled" : "Tonight’s featured slate · UFC"}
            </span>
            <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: ufcSettled || ufcLive ? "var(--vault-success)" : "var(--gtp-bank-heat)", background: ufcSettled || ufcLive ? "rgba(110,231,168,0.14)" : "var(--gtp-bank-heat-dim)" }}>
              {ufcSettled ? "Settled · final" : ufcLive ? "Moneyline V1 live" : "Fight card preview"}
            </span>
          </div>
          <h1 className="relative mt-2 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(22px,4.6vw,34px)", fontWeight: 700, lineHeight: 1.04 }}>
            {ufcSched.eventName}
          </h1>
          <p className="relative mt-1.5 text-[13px]" style={{ color: "var(--vault-text-mute)", maxWidth: 640 }}>
            {ufcSettled
              ? `Officially settled — moneyline model went ${ufcSettlement?.moneyline?.record ?? ""} (${ufcSettlement?.moneyline?.accuracyPct ?? 0}%). Full fight results + projection grades on the UFC page. Paper-only educational tracking.`
              : `${ufcSched.fightCount ?? 0} fights${ufcSched.venue ? ` · ${ufcSched.venue}` : ""}${ufcDateLabel ? ` · ${ufcDateLabel}` : ""}. ${ufcLive ? `${ufcProjCount} model-reviewed moneyline projections + ${ufcCardCount} suggested paper cards.` : "Real fight card + sportsbook lines."} Moneyline-only · model in validation · paper-only educational tracking.`}
          </p>
          <div className="relative mt-3 flex flex-wrap gap-2">
            <Link href="/ufc" className="vault-press inline-flex rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ background: "var(--gtp-bank-lava)", color: "#1A0E06", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
              {ufcSettled ? "View UFC 250 results →" : "Open UFC fight card →"}
            </Link>
            <Link href={ufcSettled ? "/results" : "/picks"} className="vault-press inline-flex rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
              {ufcSettled ? "Results" : "Suggested cards"}
            </Link>
          </div>
          {ufcFights.length && !ufcSettled ? (
            <div className="relative mt-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)" }}>Tap a fight — moneyline + model-only distance/rounds/method</span>
              <div className="mt-2">
                <UfcExpandedFightCards fights={ufcFights} />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Sport cards */}
      <section>
        <SectionHeader eyebrow="Active sports" title="Jump into a sport" sub="Counts are today's live data. Tap a card to open the full sport board." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sportSummaries.map((s) => (
            <SportCard key={s.sport} summary={s} />
          ))}
        </div>
      </section>

      {/* Top cards with interactive stake */}
      {topCards.length > 0 && (
        <section>
          <SectionHeader eyebrow={`Top cards · ${mixedCards.length} mixed-sport`} title="Suggested paper cards" sub="Mixed-sport + single-sport cards — enter any stake to see the projected paper return." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {topCards.map((c) => (
              <SuggestedCard key={c.id} card={c} />
            ))}
          </div>
          <div className="mt-3">
            <Link href="/picks" className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
              All suggested cards →
            </Link>
          </div>
        </section>
      )}

      {/* Settled UFC (06-15) is history — it lives in /results, never as an active Today card. */}

      {/* Yesterday's settled results — official outcomes only */}
      <YesterdaySummary date={yesterday} />

      {/* Official Step-3 World Cup candidate (pending) — or the separate Flex Card when none */}
      {publishedCandidate ? (
        <section>
          <SectionHeader eyebrow={`Bank Builder · Step ${publishedCandidate.step}`} title={`Official Step ${publishedCandidate.step} candidate`} sub="Pending result — the ladder bankroll only changes after official settlement." />
          <OfficialCandidateCard candidate={publishedCandidate} />
        </section>
      ) : officialStep3 ? (
        <section>
          <SectionHeader eyebrow={`Bank Builder · Step ${activeRung?.step ?? "—"}`} title="Official World Cup candidate" sub="Pending result — paper-only. The ladder bankroll only changes after the matches settle." />
          <OfficialStep3CandidateCard candidate={officialStep3} stepNumber={activeRung?.step ?? 3} />
        </section>
      ) : flexLeg ? (
        <section>
          <WorldCupFlexCard leg={flexLeg} exampleStake={bank?.currentBankrollUnits ?? 728.76} />
        </section>
      ) : null}
      {/* Trust cue — how the model works */}
      <p className="text-center text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        Every number is a real model or market value — settled from official results.{" "}
        <Link href="/learn" className="underline" style={{ color: "var(--vault-text-mute)" }}>How it works</Link>
        {" · "}
        <Link href="/methodology" className="underline" style={{ color: "var(--vault-text-mute)" }}>Methodology</Link>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today's Focus: World Cup — the lead command-center section. Odds-backed,
// limited-data (no API-Football stat layer). Flags by real ISO code; honest
// data-state when projections are unavailable. <details> = deeper-projection
// dropdown per fixture (3-way de-vig). No fabricated stats.
// ---------------------------------------------------------------------------
type WcFocusMatch = {
  homeTeam: string;
  awayTeam: string;
  homeCode?: string | null;
  awayCode?: string | null;
  slug: string;
  started: boolean;
  pickLabel: string;
  americanOdds: number;
  confidence: string;
  outcomes: Array<{ label: string; side: string; modelProbability: number; americanOdds: number }>;
  doubleChance?: { pick: string; odds: number; prob: number } | null;
  totalGoals?: { pick: string; odds: number; prob: number } | null;
  topPlayerProp?: { name: string; team: string; photo: string | null; label: string; odds: number; prob: number } | null;
  group?: string | null;
  homeForm?: string | null;
  awayForm?: string | null;
};

/** Recent-form row — team name + last-5 W/D/L pills (W green · L crimson · D muted). */
function FormRow({ team, form }: { team: string; form: string }) {
  const color = (r: string) =>
    r === "W" ? "var(--vault-success)" : r === "L" ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)";
  return (
    <div className="flex items-center justify-between gap-2" style={{ fontSize: 11 }}>
      <span className="font-mono truncate" style={{ color: "var(--vault-text-mute)" }}>{team}</span>
      <span className="flex gap-0.5 shrink-0">
        {form.split("").map((r, i) => (
          <span key={i} className="inline-flex items-center justify-center font-mono font-bold"
            style={{ width: 13, height: 13, fontSize: 8.5, borderRadius: 3, color: "#120A07",
              background: r === "D" ? "var(--vault-text-faint)" : color(r) }}>
            {r}
          </span>
        ))}
      </span>
    </div>
  );
}

function TodaysFocusWorldCup({
  matches,
  games,
}: {
  matches: WcFocusMatch[];
  games: number;
  dateLabel: string;
}) {
  const hasProj = matches.length > 0;
  const inFocus = matches.length; // games actually in focus (odds-backed projections), not the raw schedule count
  const upcoming = matches.filter((m) => !m.started).length; // still pregame (kickoff ahead)
  return (
    <section
      className="gtp-fade-up relative overflow-hidden rounded-[14px] px-5 py-5 sm:px-7 sm:py-6"
      style={{
        border: "1px solid var(--lava-border-strong)",
        background:
          "radial-gradient(120% 150% at 0% 0%, rgba(225, 29, 42,0.13) 0%, transparent 55%)," +
          "linear-gradient(135deg, rgba(26,20,14,0.95) 0%, var(--vault-bg) 70%)",
      }}
    >
      <div aria-hidden className="gtp-heat-pulse absolute right-0 top-0 h-40 w-40 translate-x-10 -translate-y-12 rounded-full" style={{ background: "var(--gtp-bank-lava)", filter: "blur(9px)", opacity: 0.4 }} />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>
          Today&apos;s focus · World Cup
        </span>
        <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: hasProj ? "var(--vault-success)" : "var(--vault-text-faint)", background: hasProj ? "rgba(110,231,168,0.14)" : "rgba(255,255,255,0.04)" }}>
          {hasProj ? "Odds-backed · limited data" : games > 0 ? "Projections unavailable" : "No matches today"}
        </span>
      </div>
      <h1 className="relative mt-2 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(22px,4.6vw,34px)", fontWeight: 700, lineHeight: 1.04 }}>
        {hasProj
          ? (upcoming > 0 && upcoming < inFocus
              ? `${upcoming} upcoming · ${inFocus} World Cup games in focus`
              : `${inFocus} World Cup ${inFocus === 1 ? "game" : "games"} in focus`)
          : "World Cup"}
      </h1>
      <p className="relative mt-1.5 text-[13px]" style={{ color: "var(--vault-text-mute)", maxWidth: 660 }}>
        {hasProj
          ? "Prices from The Odds API (3-way moneyline + double chance + totals, de-vigged); recent form & group from API-Football. Tap a match for the full read. Paper-only, educational."
          : games > 0
            ? "Today's fixtures are scheduled, but odds-backed projections are unavailable right now. Paper-only, educational."
            : "No World Cup matches on today's slate."}
      </p>
      {hasProj ? (
        <div className="relative mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {matches.map((m, i) => (
            <details key={i} className="group rounded-[10px]" style={{ background: "rgba(12,8,6,0.55)", border: "1px solid var(--vault-rule)" }}>
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-3.5 py-3 list-none">
                <span className="flex items-center gap-2 min-w-0">
                  <FlagBadge code={m.homeCode || m.homeTeam.slice(0, 2)} size="sm" />
                  <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>v</span>
                  <FlagBadge code={m.awayCode || m.awayTeam.slice(0, 2)} size="sm" />
                  <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 13 }}>{m.homeTeam} v {m.awayTeam}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {m.started ? (
                    <span className="rounded-full px-1.5 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ fontSize: 7.5, color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.05)" }}>started</span>
                  ) : null}
                  <span className="font-mono tabular" style={{ color: m.started ? "var(--vault-text-faint)" : "var(--vault-text)", fontSize: 12.5 }}>
                    {m.pickLabel} {m.americanOdds > 0 ? "+" : ""}{m.americanOdds}
                  </span>
                </span>
              </summary>
              <div className="px-3.5 pb-3 flex flex-col gap-1">
                <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>3-way (home · draw · away)</span>
                {m.outcomes.map((o, j) => (
                  <div key={j} className="flex items-center justify-between font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>
                    <span>{o.label}</span>
                    <span className="tabular">{Math.round(o.modelProbability * 100)}% · {o.americanOdds > 0 ? "+" : ""}{o.americanOdds}</span>
                  </div>
                ))}
                {m.doubleChance ? (
                  <div className="mt-1 flex items-center justify-between font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>
                    <span><span style={{ color: "var(--vault-text-faint)" }}>Double chance:</span> {m.doubleChance.pick}</span>
                    <span className="tabular">{Math.round(m.doubleChance.prob * 100)}% · {m.doubleChance.odds > 0 ? "+" : ""}{m.doubleChance.odds}</span>
                  </div>
                ) : null}
                {m.totalGoals ? (
                  <div className="flex items-center justify-between font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>
                    <span><span style={{ color: "var(--vault-text-faint)" }}>Total goals:</span> {m.totalGoals.pick}</span>
                    <span className="tabular">{Math.round(m.totalGoals.prob * 100)}% · {m.totalGoals.odds > 0 ? "+" : ""}{m.totalGoals.odds}</span>
                  </div>
                ) : null}
                {m.topPlayerProp ? (
                  <div className="mt-1.5 flex items-center justify-between gap-2 rounded-[8px] px-2 py-1.5" style={{ background: "rgba(212,175,55,0.06)" }}>
                    <span className="flex items-center gap-2 min-w-0">
                      <PlayerAvatar name={m.topPlayerProp.name} photo={m.topPlayerProp.photo} size={26} />
                      <span className="flex flex-col min-w-0">
                        <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 11.5 }}>{m.topPlayerProp.name}</span>
                        <span className="truncate font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{m.topPlayerProp.label}</span>
                      </span>
                    </span>
                    <span className="shrink-0 font-mono tabular" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
                      {Math.round(m.topPlayerProp.prob * 100)}% · {m.topPlayerProp.odds > 0 ? "+" : ""}{m.topPlayerProp.odds}
                    </span>
                  </div>
                ) : null}
                {m.homeForm || m.awayForm ? (
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>recent form · last 5 (API-Football)</span>
                    {m.homeForm ? <FormRow team={m.homeTeam} form={m.homeForm} /> : null}
                    {m.awayForm ? <FormRow team={m.awayTeam} form={m.awayForm} /> : null}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link href={`/games/world-cup/${m.slug}`} className="vault-press inline-flex rounded-full px-3 py-1 font-mono uppercase tracking-[0.1em]" style={{ background: "var(--gtp-bank-lava)", color: "#1A0E06", fontSize: 9.5, fontWeight: 700, textDecoration: "none" }}>
                    View game →
                  </Link>
                  <Link href={`/build?sport=world_cup`} className="vault-press inline-flex rounded-full px-3 py-1 font-mono uppercase tracking-[0.1em]" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)", fontSize: 9.5, fontWeight: 700, textDecoration: "none" }}>
                    Build
                  </Link>
                  <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                    {m.confidence}{m.group ? ` · ${m.group}` : ""}
                  </span>
                </div>
              </div>
            </details>
          ))}
        </div>
      ) : null}
      <div className="relative mt-4 flex flex-wrap gap-2">
        <Link href="/world-cup" className="vault-press inline-flex rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ background: "var(--gtp-bank-lava)", color: "#1A0E06", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
          View projections &amp; cards →
        </Link>
        <Link href="/games" className="vault-press inline-flex rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
          All games
        </Link>
      </div>
    </section>
  );
}
