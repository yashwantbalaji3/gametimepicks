/**
 * /games — the unified "tonight's games" board across every sport in one place (the explicit ask:
 * tap Games, select across sports, World Cup included — not a separate table). Aggregates today's
 * games from World Cup + MLB + NBA + UFC into one filterable board; each card links into the sport
 * hub + the Build betslip. Public data only.
 */
import { currentEtDate } from "@/lib/freshness";
import { loadWorldCupSchedule, matchesOnDate, teamByName } from "@/lib/data-world-cup";
import { loadWorldCupProjections } from "@/lib/world-cup/projections";
import { getMlbBoardForDate, activeMlbDate } from "@/lib/data-mlb";
import { getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import { formatTipoffEt } from "@/lib/format-mlb";
import { mlbTeamLogoUrl } from "@/lib/player-headshots";
import { normalizeMlbLeans, normalizeNbaLeans } from "@/lib/normalize";
import fs from "node:fs";
import path from "node:path";
import GamesExperience, { type GameRow } from "@/components/games-experience";
import SectionHeader from "@/components/section-header";
import { buildAllGameDetails, gameSlug } from "@/lib/game-detail";

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
  // Fixture detail pages (real data only) — link "View game" + the exact build URL when present.
  const detailMap = new Map(buildAllGameDetails().map((d) => [`${d.sport}/${d.slug}`, d]));

  // World Cup
  loadWorldCupSchedule();
  const wcMatches = matchesOnDate(today);
  void loadWorldCupProjections();
  for (const m of wcMatches) {
    const wcSlug = gameSlug(m.home ?? "", m.away ?? "", today);
    const det = detailMap.get(`world_cup/${wcSlug}`);
    rows.push({
      id: `wc_${m.id}`,
      sport: "world_cup",
      sportLabel: "World Cup",
      matchup: `${m.home} vs ${m.away}`,
      timeLabel: `${m.kickoffLocal ?? ""}${m.venueCity ? " · " + m.venueCity : ""}`.trim(),
      statusLabel: "Today",
      projections: det?.teamProjections.length ?? 0,
      props: det?.playerProps.length ?? 0,
      homeCode: teamByName(m.home ?? "")?.code ?? "",
      awayCode: teamByName(m.away ?? "")?.code ?? "",
      homeLogo: det?.homeLogo ?? null,
      awayLogo: det?.awayLogo ?? null,
      href: "/world-cup?tab=games",
      // Exact-fixture build link when the fixture resolved (real matchId); team-search fallback otherwise.
      buildHref: det?.buildUrl ?? `/build?sport=world_cup&q=${encodeURIComponent(m.home ?? "")}`,
      detailHref: det ? `/games/world-cup/${wcSlug}` : undefined,
    });
  }

  // MLB
  const mlbDate = activeMlbDate() ?? today;
  const mlbBoard = getMlbBoardForDate(mlbDate);
  const mlbByGame = countBy(normalizeMlbLeans(mlbBoard as Parameters<typeof normalizeMlbLeans>[0]), (l) => l.matchId);
  // Bridge gamePk → optimizer gameId (hash) via the leans so "Build from this game" deep-links to
  // exactly that game's legs (build legs key on the hash, board games key on gamePk).
  const mlbGameIdByPk = new Map<string, string>();
  for (const l of (mlbBoard.leans ?? []) as Array<{ gamePk?: number | string; gameId?: string }>) {
    if (l.gamePk != null && l.gameId) mlbGameIdByPk.set(String(l.gamePk), l.gameId);
  }
  for (const g of mlbBoard.games ?? []) {
    const gid = mlbGameIdByPk.get(String(g.gamePk));
    rows.push({
      id: `mlb_${g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`}`,
      sport: "mlb",
      sportLabel: "MLB",
      homeLogo: mlbTeamLogoUrl(g.homeTeamId),
      awayLogo: mlbTeamLogoUrl(g.awayTeamId),
      matchup: `${g.awayTeamAbbr ?? "?"} @ ${g.homeTeamAbbr ?? "?"}`,
      timeLabel: `${formatTipoffEt(g.gameDate)}${g.venue ? " · " + g.venue : ""}`,
      statusLabel: mlbDate === today ? "Today" : mlbDate.slice(5),
      projections: mlbByGame.get(String(g.gamePk)) ?? 0,
      href: "/mlb?tab=games",
      buildHref: gid ? `/build?sport=mlb&game=${encodeURIComponent(gid)}` : "/build?sport=mlb",
      detailHref: detailMap.has(`mlb/${gameSlug(g.awayTeamAbbr ?? "", g.homeTeamAbbr ?? "", mlbDate)}`)
        ? `/games/mlb/${gameSlug(g.awayTeamAbbr ?? "", g.homeTeamAbbr ?? "", mlbDate)}`
        : undefined,
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
      matchup: `${g.awayTeamAbbr ?? "?"} @ ${g.homeTeamAbbr ?? "?"}`,
      timeLabel: nbaDate ? nbaDate.slice(5) : "",
      statusLabel: "Finals",
      projections: nbaByGame.get(String(g.gameId)) ?? 0,
      href: "/nba?tab=games",
      buildHref: g.gameId ? `/build?sport=nba&game=${encodeURIComponent(g.gameId)}` : "/build?sport=nba",
      detailHref: detailMap.has(`nba/${gameSlug(g.awayTeamAbbr ?? "", g.homeTeamAbbr ?? "", nbaDate)}`)
        ? `/games/nba/${gameSlug(g.awayTeamAbbr ?? "", g.homeTeamAbbr ?? "", nbaDate)}`
        : undefined,
    });
  }

  // UFC (one event row) — only when there is a real UPCOMING card. Once the
  // event is officially settled it belongs in /results, not the games board, so
  // a finished card (e.g. UFC 250) never lingers as "Upcoming".
  try {
    let ufcDone = false;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "results-settled-latest.json"), "utf8"));
      ufcDone = s?.status === "final";
    } catch { /* no settlement file → treat as not settled */ }
    const proj = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "projections-latest.json"), "utf8"));
    if (!ufcDone && proj?.moneylineV1Ready && Array.isArray(proj.projections) && proj.projections.length > 0) {
      rows.push({
        id: "ufc_event",
        sport: "ufc",
        sportLabel: "UFC",
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
