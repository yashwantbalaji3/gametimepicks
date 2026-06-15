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
import { normalizeWcCards, normalizeOptimizerSlips, loadDailyMixedCards, type SportSummary } from "@/lib/normalize";
import { getSuggestedParlaysForDate } from "@/lib/data-parlays";
import FlagBadge from "@/components/flag-badge";
import { loadWorldCupFlexLeg, loadOfficialStepCandidate } from "@/lib/world-cup-flex";
import { loadOfficialPublishedCandidate } from "@/lib/bank-builder-official-candidate";
import OfficialCandidateCard from "@/components/bank-builder/official-candidate-card";
import UfcExpandedFightCards from "@/components/ufc/expanded-fight-cards";
import SuggestedCard from "@/components/ui/suggested-card";
import SportCard from "@/components/ui/sport-card";
import WorldCupFlexCard from "@/components/bank-builder/world-cup-flex-card";
import OfficialStep3CandidateCard from "@/components/bank-builder/official-step3-candidate";
import SectionHeader from "@/components/section-header";
import YesterdaySummary from "@/components/yesterday-summary";

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
  const today = currentEtDate();
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
  // Bank Builder completed → bankroll cleared the $10,000 crown with a clean run.
  const bankCompleted = bank ? resolveLadderStep(bank.currentBankrollUnits) === null && bank.record.losses === 0 : false;

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
  // Today's Focus = World Cup fixtures (today-dated, odds-backed limited-data projections).
  const wcFocus: WcFocusMatch[] = (wcProj?.matches ?? [])
    .filter((m) => typeof m.americanOdds === "number" && !!m.pickLabel)
    .slice(0, 6)
    .map((m) => ({
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeCode: m.homeCode ?? null,
      awayCode: m.awayCode ?? null,
      pickLabel: m.pickLabel,
      americanOdds: m.americanOdds as number,
      confidence: m.confidence ?? "limited",
      outcomes: (m.outcomes ?? []).map((o) => ({
        label: o.label,
        side: o.side,
        modelProbability: o.modelProbability,
        americanOdds: o.americanOdds ?? 0,
      })),
    }));
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
  const bankrollLabel = bank
    ? `$${bank.currentBankrollUnits.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;
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
        { label: "Games", value: wcGames },
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

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-8">
      {/* ── Today's Focus: World Cup — leads the page for the next few weeks ── */}
      <TodaysFocusWorldCup matches={wcFocus} games={wcGames} dateLabel={dateLabel} />

      {/* ── Today's MLB suggested parlays (after the World Cup focus) ── */}
      {mlbCards.length > 0 ? (
        <section>
          <SectionHeader
            eyebrow={`MLB · ${dateLabel}`}
            title="Today's MLB suggested parlays"
            sub="Curated odds-backed paper cards from tonight's slate — enter any stake for the projected return."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mlbCards.map((c) => (
              <SuggestedCard key={c.id} card={c} />
            ))}
          </div>
          <div className="mt-3">
            <Link href="/picks" className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
              All suggested parlays →
            </Link>
          </div>
        </section>
      ) : null}

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

      {/* Bank Builder — the completed Road to $10K recap (was the flagship active run). */}
      <section
        className="gtp-fade-up relative overflow-hidden rounded-[14px] px-5 py-5 sm:px-7 sm:py-6"
        style={{
          border: "1px solid rgba(242, 54, 69,0.35)",
          background:
            "radial-gradient(120% 150% at 0% 0%, rgba(242, 54, 69,0.10) 0%, transparent 55%)," +
            "linear-gradient(135deg, rgba(26,20,14,0.95) 0%, var(--vault-bg) 70%)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>
            Bank Builder · {dateLabel}
          </span>
          <span className="gtp-heat-pulse rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: bankCompleted ? "var(--vault-success)" : "var(--gtp-bank-heat)", background: bankCompleted ? "rgba(110,231,168,0.14)" : "var(--gtp-bank-heat-dim)" }}>
            {bankCompleted ? "Road to $10K · completed" : `Step ${bank?.currentProgressionStep ?? "—"} · ${publishedCandidate ? "card pending" : "review pending"}`}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(26px,5vw,38px)", fontWeight: 700, lineHeight: 1.05 }}>
            {bankCompleted ? `$100 → ${bankrollLabel}` : bankrollLabel ?? "$—"}
          </h2>
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 13 }}>
            {bank
              ? bankCompleted
                ? `${bank.record.wins}–${bank.record.losses} · Road to $10K completed · 5 rungs settled`
                : `${bank.record.wins}–${bank.record.losses} run · Step ${bank.currentProgressionStep} of 5`
              : "paper ladder"}
          </span>
        </div>
        {publishedCandidate ? (
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
            Today&apos;s card: {publishedCandidate.legs.map((l) => l.label).join(" + ")} ·{" "}
            <span style={{ color: "var(--vault-text)" }}>{publishedCandidate.combinedAmericanOdds > 0 ? "+" : ""}{publishedCandidate.combinedAmericanOdds}</span> · projected paper return{" "}
            <span style={{ color: "var(--vault-success)" }}>${publishedCandidate.projectedReturn.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span> · pending
          </p>
        ) : null}
        {/* $100 → $10,000 heat meter (real linear share of the crown). */}
        <div className="mt-3 flex items-center gap-2.5">
          <span className="font-mono shrink-0 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>$100</span>
          <div className="gtp-meter-track h-2.5 flex-1" role="img" aria-label={`Paper bankroll ${bankrollLabel ?? ""} of the $10,000 crown`}>
            <div className="gtp-meter-fill gtp-meter-fill--lava" style={{ width: `${Math.min(100, Math.max(2, ((bank?.currentBankrollUnits ?? 100) / 10000) * 100))}%` }} />
            <div aria-hidden className="gtp-meter-shimmer" />
          </div>
          <span className="font-mono shrink-0 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>$10,000</span>
        </div>
        <div className="mt-3">
          <Link href="/bank-builder" className="vault-press inline-flex rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ background: "var(--gtp-bank-lava)", color: "#1A0E06", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
            {bankCompleted ? "View the completed run →" : "Review today’s card →"}
          </Link>
        </div>
      </section>

      {/* Quick actions — the four primary destinations, above the fold on mobile */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { href: "/games", label: "Games", sub: "Pick tonight's game" },
          { href: "/picks", label: "Parlay Lab", sub: "Curated suggested cards" },
          { href: "/build", label: "Build", sub: "Make your own card" },
          { href: "/results", label: "Results", sub: "How the model did" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="vault-glow-hover vault-press rounded-[10px] px-3 py-3.5 flex flex-col gap-0.5"
            style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)", borderTop: "2px solid var(--gtp-bank-heat)", textDecoration: "none" }}
          >
            <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>{a.label}</span>
            <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{a.sub}</span>
          </Link>
        ))}
      </section>

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

      {/* UFC settled recap — once final, it lives in the results zone, not leading the page. */}
      {ufcSettled ? (
        <section
          className="gtp-fade-up relative overflow-hidden rounded-[12px] px-5 py-4"
          style={{ border: "1px solid var(--vault-border)", background: "rgba(26, 16, 11,0.45)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>
              UFC · officially settled
            </span>
            <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--vault-success)", background: "rgba(110,231,168,0.14)" }}>
              Settled · final
            </span>
          </div>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--vault-text-mute)", maxWidth: 640 }}>
            <span style={{ color: "var(--vault-text)" }}>{ufcSched?.eventName ?? "UFC Freedom 250"}</span> — moneyline model went{" "}
            <span style={{ color: "var(--vault-success)" }}>{ufcSettlement?.moneyline?.record ?? "6-1"}</span> ({ufcSettlement?.moneyline?.accuracyPct ?? 86}%). Suggested cards 0–4 — a card-concentration lesson, not a model-signal one. Paper-only educational tracking.
          </p>
          <div className="mt-2.5">
            <Link href="/results" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
              View UFC 250 results →
            </Link>
          </div>
        </section>
      ) : null}

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
  pickLabel: string;
  americanOdds: number;
  confidence: string;
  outcomes: Array<{ label: string; side: string; modelProbability: number; americanOdds: number }>;
};

function TodaysFocusWorldCup({
  matches,
  games,
}: {
  matches: WcFocusMatch[];
  games: number;
  dateLabel: string;
}) {
  const hasProj = matches.length > 0;
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
        {games > 0 ? `${games} World Cup ${games === 1 ? "match" : "matches"} today` : "World Cup"}
      </h1>
      <p className="relative mt-1.5 text-[13px]" style={{ color: "var(--vault-text-mute)", maxWidth: 660 }}>
        {hasProj
          ? "Market-implied projections from The Odds API (3-way moneyline, de-vigged). Limited data — no team/player stat layer yet. Paper-only, educational."
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
                <span className="shrink-0 font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>
                  {m.pickLabel} {m.americanOdds > 0 ? "+" : ""}{m.americanOdds}
                </span>
              </summary>
              <div className="px-3.5 pb-3 flex flex-col gap-1">
                {m.outcomes.map((o, j) => (
                  <div key={j} className="flex items-center justify-between font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>
                    <span>{o.label}</span>
                    <span className="tabular">{Math.round(o.modelProbability * 100)}% · {o.americanOdds > 0 ? "+" : ""}{o.americanOdds}</span>
                  </div>
                ))}
                <span className="mt-1 font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                  market-implied · {m.confidence} · limited data
                </span>
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
