/**
 * /games — the unified "tonight's games" board across every sport in one place (the explicit ask:
 * tap Games, select across sports, World Cup included — not a separate table). Aggregates today's
 * games from World Cup + MLB + NBA + UFC into one filterable board; each card links into the sport
 * hub + the Build betslip. Public data only.
 */
import { currentEtDate } from "@/lib/freshness";
import { loadWorldCupSchedule, matchesOnDate } from "@/lib/data-world-cup";
import { loadWorldCupProjections } from "@/lib/world-cup/projections";
import { getMlbBoardForDate, activeMlbDate } from "@/lib/data-mlb";
import { getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import { formatTipoffEt } from "@/lib/format-mlb";
import { normalizeMlbLeans, normalizeNbaLeans } from "@/lib/normalize";
import fs from "node:fs";
import path from "node:path";
import GamesExperience, { type GameRow } from "@/components/games-experience";
import SectionHeader from "@/components/section-header";

export const metadata = {
  title: "Games · GameTime Picks",
  description:
    "Tonight's games across every sport — World Cup, MLB, NBA, UFC — in one board. Filter by sport, then jump into projections, props, or build a card. Educational, paper-only.",
};

function countBy<T>(items: T[], key: (t: T) => string | number | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k == null) continue;
    m.set(String(k), (m.get(String(k)) ?? 0) + 1);
  }
  return m;
}

export default function GamesPage() {
  const today = currentEtDate();
  const rows: GameRow[] = [];

  // World Cup
  loadWorldCupSchedule();
  const wcMatches = matchesOnDate(today);
  void loadWorldCupProjections();
  for (const m of wcMatches) {
    rows.push({
      id: `wc_${m.id}`,
      sport: "world_cup",
      sportLabel: "World Cup",
      accent: "var(--vault-gold-bright)",
      matchup: `${m.home} vs ${m.away}`,
      timeLabel: `${m.kickoffLocal ?? ""}${m.venueCity ? " · " + m.venueCity : ""}`.trim(),
      statusLabel: "Today",
      projections: 0,
      href: "/world-cup?tab=games",
      buildHref: `/build?sport=world_cup&q=${encodeURIComponent(m.home ?? "")}`,
    });
  }

  // MLB
  const mlbDate = activeMlbDate() ?? today;
  const mlbBoard = getMlbBoardForDate(mlbDate);
  const mlbByGame = countBy(normalizeMlbLeans(mlbBoard as Parameters<typeof normalizeMlbLeans>[0]), (l) => l.matchId);
  for (const g of mlbBoard.games ?? []) {
    rows.push({
      id: `mlb_${g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`}`,
      sport: "mlb",
      sportLabel: "MLB",
      accent: "#3b82f6",
      matchup: `${g.awayTeamAbbr ?? "?"} @ ${g.homeTeamAbbr ?? "?"}`,
      timeLabel: `${formatTipoffEt(g.gameDate)}${g.venue ? " · " + g.venue : ""}`,
      statusLabel: mlbDate === today ? "Today" : mlbDate.slice(5),
      projections: mlbByGame.get(String(g.gamePk)) ?? 0,
      href: "/mlb?tab=games",
      buildHref: "/build?sport=mlb",
    });
  }

  // NBA (latest slate with leans)
  let nbaDate = "";
  for (const d of getAvailableBoardDates()) if ((getBoardForDate(d).leans?.length ?? 0) > 0) nbaDate = d;
  const nbaBoard = nbaDate ? getBoardForDate(nbaDate) : undefined;
  const nbaByGame = countBy(normalizeNbaLeans(nbaBoard as Parameters<typeof normalizeNbaLeans>[0]), (l) => l.matchId);
  for (const g of nbaBoard?.games ?? []) {
    rows.push({
      id: `nba_${g.gameId}`,
      sport: "nba",
      sportLabel: "NBA",
      accent: "#a855f7",
      matchup: `${g.awayTeamAbbr ?? "?"} @ ${g.homeTeamAbbr ?? "?"}`,
      timeLabel: nbaDate ? nbaDate.slice(5) : "",
      statusLabel: "Finals",
      projections: nbaByGame.get(String(g.gameId)) ?? 0,
      href: "/nba?tab=games",
      buildHref: "/build?sport=nba",
    });
  }

  // UFC (one event row)
  try {
    const proj = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "projections-latest.json"), "utf8"));
    if (proj?.moneylineV1Ready && Array.isArray(proj.projections) && proj.projections.length > 0) {
      rows.push({
        id: "ufc_event",
        sport: "ufc",
        sportLabel: "UFC",
        accent: "#ef4444",
        matchup: proj.eventName ?? "Next UFC card",
        timeLabel: "Moneyline model",
        statusLabel: "Upcoming",
        projections: proj.projections.length,
        href: "/ufc?tab=fight-card",
        buildHref: "/picks",
      });
    }
  } catch {
    /* no-op */
  }

  const activeSports = new Set(rows.map((r) => r.sport)).size;

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <SectionHeader
        eyebrow={`Games · ${rows.length} across ${activeSports} sport${activeSports === 1 ? "" : "s"}`}
        title="Tonight's games"
        sub="Every sport's games in one board — filter by sport, then jump into projections or build a card. Educational, paper-only."
      />
      <GamesExperience games={rows} />
    </div>
  );
}
