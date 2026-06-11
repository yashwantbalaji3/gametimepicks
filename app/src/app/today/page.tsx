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
import { loadBankBuilderSummary } from "@/lib/data-bank-builder";
import { loadWorldCupSchedule, matchesOnDate } from "@/lib/data-world-cup";
import { normalizeWcCards, loadDailyMixedCards, type SportSummary } from "@/lib/normalize";
import SuggestedCard from "@/components/ui/suggested-card";
import SportCard from "@/components/ui/sport-card";
import SectionHeader from "@/components/section-header";

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
      <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
        {label}
      </span>
    </div>
  );
}

export default function TodayPage() {
  const today = currentEtDate();
  loadWorldCupSchedule(); // warm + ensure data dir
  const wcGames = matchesOnDate(today).length;
  const wcCards = loadWorldCupParlays();
  const wcProj = loadWorldCupProjections();
  const wcPlayers = loadWorldCupPlayerProjections();
  const mlb = getMlbBoardForDate(today);
  const bank = loadBankBuilderSummary();

  const wcLive = wcGames > 0 || !!wcProj;
  const mlbLive = (mlb.summary.scheduledGames ?? 0) > 0;
  const activeSports = (wcLive ? 1 : 0) + (mlbLive ? 1 : 0);
  const mixedCards = loadDailyMixedCards();
  const topCards = [...mixedCards, ...normalizeWcCards(wcCards)].slice(0, 4);
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
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-[14px] px-5 py-6 sm:px-7 sm:py-7"
        style={{
          border: "1px solid var(--vault-border-strong)",
          background:
            "radial-gradient(120% 150% at 0% 0%, rgba(240,199,94,0.10) 0%, transparent 55%)," +
            "linear-gradient(135deg, rgba(22,30,62,0.94) 0%, rgba(11,15,31,0.96) 60%, rgba(7,11,26,0.97) 100%)",
        }}
      >
        <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>
          Today&apos;s board · {dateLabel}
        </span>
        <h1 className="font-display tracking-tight mt-1.5" style={{ color: "var(--vault-text)", fontSize: "clamp(26px,5vw,38px)", fontWeight: 700, lineHeight: 1.05 }}>
          What&apos;s live today
        </h1>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Sports live" value={activeSports} />
          <Stat label="Mixed cards" value={mixedCards.length} />
          <Stat label="WC cards" value={wcCards?.cardCount ?? 0} />
          <Stat label="Bank Builder" value={bank ? `$${bank.currentBankrollUnits}` : "—"} />
        </div>
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
          <SectionHeader eyebrow={`Top cards · ${mixedCards.length} mixed-sport`} title="Suggested paper cards" sub="Mixed-sport + single-sport cards. Enter any stake to see the projected paper return. Educational / paper, not betting advice." />
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

      {/* Bank Builder module */}
      {bank && (
        <section>
          <SectionHeader eyebrow="Bank Builder" title="The paper ladder" sub="$100 → $10,000, one daily pick per rung. Educational, paper-only." />
          <Link
            href="/bank-builder"
            className="rounded-[10px] px-4 py-4 flex items-center justify-between gap-4 vault-glow-hover"
            style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)", textDecoration: "none" }}
          >
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Bankroll" value={`$${bank.currentBankrollUnits}`} />
              <Stat label="Step" value={`${bank.currentProgressionStep} / 5`} />
              <Stat label="Record" value={`${bank.record.wins}-${bank.record.losses}-${bank.record.pushes}`} />
            </div>
            <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>Open →</span>
          </Link>
        </section>
      )}
    </div>
  );
}
