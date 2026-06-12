/**
 * /today — daily command center. One scan tells the user what's live today: active sports with
 * counts, the top suggested cards (interactive paper stake), and Bank Builder status. Aggregates
 * existing public artifacts only; no internal/debug content. Additive route — does not alter the
 * existing homepage or sport pages.
 */
import Link from "next/link";

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
import { normalizeWcCards, loadDailyMixedCards, type SportSummary } from "@/lib/normalize";
import { loadWorldCupFlexLeg, loadOfficialStepCandidate } from "@/lib/world-cup-flex";
import { loadOfficialPublishedCandidate } from "@/lib/bank-builder-official-candidate";
import OfficialCandidateCard from "@/components/bank-builder/official-candidate-card";
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
  const wcCards = loadWorldCupParlays();
  const wcProj = loadWorldCupProjections();
  const wcPlayers = loadWorldCupPlayerProjections();
  const mlb = getMlbBoardForDate(today);
  // Public ladder summary ($728.76) — the source of truth, not the internal audit summary.
  const bank = loadPublicBankBuilderSummary();

  const wcLive = wcGames > 0 || !!wcProj;
  const mlbLive = (mlb.summary.scheduledGames ?? 0) > 0;
  const activeSports = (wcLive ? 1 : 0) + (mlbLive ? 1 : 0);
  const mixedCards = loadDailyMixedCards();
  const topCards = [...mixedCards, ...normalizeWcCards(wcCards)].slice(0, 4);
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
      {/* Bank Builder spotlight — the flagship run leads the page (casino rebuild:
          the old "What's live today" counts hero carried no decision value). */}
      <section
        className="gtp-fade-up relative overflow-hidden rounded-[14px] px-5 py-5 sm:px-7 sm:py-6"
        style={{
          border: "1px solid rgba(255,122,60,0.35)",
          background:
            "radial-gradient(120% 150% at 0% 0%, rgba(255,122,60,0.10) 0%, transparent 55%)," +
            "linear-gradient(135deg, rgba(26,20,14,0.95) 0%, var(--vault-bg) 70%)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>
            Bank Builder · {dateLabel}
          </span>
          <span className="gtp-heat-pulse rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--gtp-bank-heat)", background: "var(--gtp-bank-heat-dim)" }}>
            Step {bank?.currentProgressionStep ?? "—"} · {publishedCandidate ? "card pending" : "review pending"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(26px,5vw,38px)", fontWeight: 700, lineHeight: 1.05 }}>
            {bankrollLabel ?? "$—"}
          </h1>
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 13 }}>
            {bank ? `${bank.record.wins}–${bank.record.losses} run · Step ${bank.currentProgressionStep} of 5 · next goal $3,500` : "paper ladder"}
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
            Review today&apos;s card →
          </Link>
        </div>
      </section>

      {/* Quick actions — the four primary destinations, above the fold on mobile */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { href: "/games", label: "Games", sub: "Pick tonight's game" },
          { href: "/picks", label: "Picks", sub: "Browse suggested cards" },
          { href: "/build", label: "Build", sub: "Make your own card" },
          { href: "/results", label: "Results", sub: "How the model did" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="vault-glow-hover vault-press rounded-[10px] px-3 py-3.5 flex flex-col gap-0.5"
            style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)", borderTop: "2px solid var(--vault-gold-bright)", textDecoration: "none" }}
          >
            <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>{a.label}</span>
            <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{a.sub}</span>
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

      {/* Yesterday's settled results — official outcomes only */}
      <YesterdaySummary date={yesterday} />

      {/* Official Step-3 World Cup candidate (pending) — or the separate Flex Card when none */}
      {publishedCandidate ? (
        <section>
          <SectionHeader eyebrow={`Bank Builder · Step ${publishedCandidate.step}`} title="Official Step 4 candidate" sub="Pending result — the ladder bankroll only changes after official settlement." />
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
