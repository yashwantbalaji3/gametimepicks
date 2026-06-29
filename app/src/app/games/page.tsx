/**
 * /games — the unified "tonight's games" board across every sport in one place (the explicit ask:
 * tap Games, select across sports, World Cup included — not a separate table). Aggregates today's
 * games from World Cup + MLB + NBA + UFC into one filterable board; each card links into the sport
 * hub + the Build betslip. Public data only.
 */
import { currentEtDate } from "@/lib/freshness";
import { teamByName } from "@/lib/data-world-cup";
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
import Link from "next/link";
import { loadRoundOf32Board } from "@/lib/world-cup/round-of-32";

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

  // World Cup — driven by the CANONICAL projection-backed game details (same source as /world-cup and
  // the game-detail pages): real team names, real kickoff, the exact game-detail slug. The bracket
  // schedule carries PLACEHOLDER teams for knockout fixtures (home/away null), so using it produced
  // "undefined vs undefined" — it must NOT power the matchup label. Started/finished games are excluded.
  const wcProj = loadWorldCupProjections();
  const wcKickoff = new Map<string, string>();
  for (const m of wcProj?.matches ?? []) if (m.matchId != null && m.kickoffUtc) wcKickoff.set(String(m.matchId), m.kickoffUtc);
  const nowMs = Date.now();
  for (const d of detailMap.values()) {
    if (d.sport !== "world_cup") continue;
    const ko = d.matchId != null ? wcKickoff.get(String(d.matchId)) : null;
    if (ko && Date.parse(ko) <= nowMs) continue; // never list a started/finished game as active
    const etTime = ko
      ? new Date(ko).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }) + " ET"
      : "";
    rows.push({
      id: `wc_${d.matchId ?? d.slug}`,
      sport: "world_cup",
      sportLabel: "World Cup",
      matchup: d.title || `${d.homeTeam} vs ${d.awayTeam}`,
      timeLabel: etTime,
      statusLabel: "Upcoming",
      projections: d.teamProjections.length,
      props: d.playerProps.length,
      homeCode: teamByName(d.homeTeam ?? "")?.code ?? "",
      awayCode: teamByName(d.awayTeam ?? "")?.code ?? "",
      homeLogo: d.homeLogo ?? null,
      awayLogo: d.awayLogo ?? null,
      href: "/world-cup?tab=games",
      buildHref: d.buildUrl ?? `/build?sport=world_cup&game=${encodeURIComponent(String(d.matchId ?? ""))}`,
      detailHref: `/games/world-cup/${d.slug}`,
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

  // World Cup · Round of 32 — links to the dedicated de-vigged knockout board (every R32 game).
  const r32Board = loadRoundOf32Board();

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <SectionHeader
        eyebrow={`Games · ${rows.length} across ${activeSports} sport${activeSports === 1 ? "" : "s"}`}
        title="Tonight's games"
        sub="Every sport's games in one board — filter by sport, then jump into projections or build a card. Educational, paper-only."
      />
      {r32Board ? (
        <Link
          href="/world-cup/round-of-32"
          className="block rounded-[10px] px-4 py-3.5 vault-glow-hover"
          style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid var(--vault-gold-bright)", borderLeft: "3px solid var(--vault-gold-bright)", textDecoration: "none" }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>World Cup · Round of 32 Board</span>
              <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14.5, fontWeight: 700 }}>
                {r32Board.gameCount} knockout games · model ML / totals / props through {r32Board.horizonEt}
              </span>
            </div>
            <span className="font-mono uppercase tracking-[0.1em] shrink-0" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>Open →</span>
          </div>
        </Link>
      ) : null}
      <GamesExperience games={rows} />
    </div>
  );
}
