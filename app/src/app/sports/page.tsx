/**
 * /sports — the sport directory. A non-bettor picks a sport and sees today's live status + counts,
 * then taps into the uniform tabbed sport hub. Uses the shared SportCard + the same public loaders
 * as /today. Schedule-only leagues (NHL/IPL/WNBA) live on /events.
 */
import Link from "next/link";

import { currentEtDate } from "@/lib/freshness";
import { loadWorldCupParlays, loadWorldCupProjections, loadWorldCupPlayerProjections } from "@/lib/world-cup/projections";
import { loadWorldCupSchedule, matchesOnDate } from "@/lib/data-world-cup";
import { getMlbBoardForDate, activeMlbDate } from "@/lib/data-mlb";
import { getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import type { SportSummary } from "@/lib/normalize";
import fs from "node:fs";
import path from "node:path";
import SportCard from "@/components/ui/sport-card";
import SectionHeader from "@/components/section-header";

export const metadata = {
  title: "Sports · GameTime Picks",
  description:
    "Pick a sport — World Cup, MLB, NBA, UFC — to see today's projections, player props, and suggested paper cards. Educational, paper-only.",
};

// `live` means the sport has action TODAY (its slate date == the real ET date), NOT merely that a
// most-recent artifact exists. Without the date gate a stale slate (e.g. the last board from 07-11)
// renders "Live today" on an off day — the stale-as-live bug. Every counter takes `today` and gates on it.
function ufcCounts(today: string): { projections: number; cards: number; live: boolean } {
  try {
    const proj = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "projections-latest.json"), "utf8"));
    const cards = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "suggested-parlays-latest.json"), "utf8"));
    const p = Array.isArray(proj?.projections) ? proj.projections.length : 0;
    const c = Array.isArray(cards?.cards) ? cards.cards.length : 0;
    const eventDate = String(proj?.eventDate ?? proj?.date ?? "").slice(0, 10);
    return { projections: p, cards: c, live: Boolean(proj?.moneylineV1Ready && p > 0 && eventDate === today) };
  } catch {
    return { projections: 0, cards: 0, live: false };
  }
}

function nbaCounts(today: string): { games: number; leans: number; live: boolean } {
  try {
    const dates = getAvailableBoardDates();
    let best = "";
    for (const d of dates) {
      const b = getBoardForDate(d);
      if ((b.leans?.length ?? 0) > 0) best = d;
    }
    const board = best ? getBoardForDate(best) : undefined;
    const leans = board?.leans ?? [];
    const usable = leans.filter((l) => l.lean === "Over" || l.lean === "Under").length;
    return { games: board?.games?.length ?? 0, leans: leans.length, live: usable > 0 && best === today };
  } catch {
    return { games: 0, leans: 0, live: false };
  }
}

export default function SportsPage() {
  const today = currentEtDate();
  loadWorldCupSchedule();
  const wcGames = matchesOnDate(today).length;
  const wcProj = loadWorldCupProjections();
  const wcPlayers = loadWorldCupPlayerProjections();
  const wcCards = loadWorldCupParlays();
  // "live" ⇒ real games TODAY, not just that a most-recent artifact exists. Gate on the slate date == today
  // (the real ET clock) so a 2-day-old slate (07-11 on 07-13) reads "Off today", never "Live today".
  const wcLive = wcGames > 0 || (!!wcProj && String((wcProj as { date?: string }).date ?? "").slice(0, 10) === today);

  const mlbDate = activeMlbDate() ?? today;
  const mlb = getMlbBoardForDate(mlbDate);
  const mlbLive = (mlb.summary.scheduledGames ?? 0) > 0 && mlbDate === today;

  const nba = nbaCounts(today);
  const ufc = ufcCounts(today);

  const summaries: SportSummary[] = [
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
        { label: "Projections", value: mlb.summary.leans ?? 0 },
        { label: "High conf", value: (mlb.summary as { highConfidence?: number }).highConfidence ?? 0 },
        { label: "Slate", value: mlbDate.slice(5) },
      ],
    },
    {
      sport: "nba", label: "NBA", href: "/nba", accent: "#a855f7", live: nba.live,
      stats: [
        { label: "Games", value: nba.games },
        { label: "Projections", value: nba.leans },
        { label: "Plays", value: nba.live ? "yes" : "pending" },
        { label: "Board", value: "Finals" },
      ],
    },
    {
      sport: "ufc", label: "UFC", href: "/ufc", accent: "#ef4444", live: ufc.live,
      stats: [
        { label: "Moneyline", value: ufc.projections },
        { label: "Cards", value: ufc.cards },
        { label: "Props", value: "—" },
        { label: "Scope", value: "ML only" },
      ],
    },
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-7">
      <SectionHeader
        eyebrow={(() => {
          const liveCount = summaries.filter((s) => s.live).length;
          return liveCount > 0 ? `Sports · ${liveCount} live today` : "Sports · no live slate today";
        })()}
        title="Pick a sport"
        sub="Each sport opens a uniform hub: today's games, model projections, player props, and suggested paper cards. Educational, paper-only."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {summaries.map((s) => (
          <SportCard key={s.sport} summary={s} />
        ))}
      </div>
      <div className="rounded-[10px] px-4 py-4 flex items-center justify-between gap-3" style={{ background: "rgba(26, 16, 11,0.45)", border: "1px solid var(--vault-border)" }}>
        <div className="flex flex-col">
          <span style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>More leagues &amp; schedules</span>
          <span style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>NHL, IPL and WNBA schedule-only coverage (no projections yet).</span>
        </div>
        <Link href="/events" className="font-mono uppercase tracking-[0.16em] shrink-0" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
          Schedules →
        </Link>
      </div>
    </div>
  );
}
