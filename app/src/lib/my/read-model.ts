/**
 * MY GAMETIME — build-time READ MODEL (v1.1.3). SERVER ONLY.
 *
 * ⚠ PUBLIC PRODUCT DATA ONLY. This is exported into a static page that is byte-identical for every
 * reader, so it contains no preference of anyone's. The browser filters it by what THAT browser follows.
 * A reader's follow list is never sent anywhere to produce this.
 *
 * ⚠ NOT A SECOND TRUTH OWNER. Every row is a thin projection of an artifact that already exists, keyed
 * by canonical ids so the client can join exactly. Nothing is graded, forecast, or settled here.
 *
 * ⚠ NO PRESENT-TENSE CLAIMS. Rows carry a scheduled start or a result time — facts — and never an
 * "upcoming" or "has started" flag. Which games are upcoming is decided on the READER's clock by the
 * selectors, so a static page cannot age into a lie (Phase 6).
 *
 * Owners reused:
 *   MLB schedule   mlb/statsapi-schedule/<date>.json        (away/home StatsAPI id — exact)
 *   NFL schedule   nfl/schedule/latest.json                 (providerTeamId — exact)
 *   MLB results    mlb/results/game-predictions-graded.jsonl  (settlement owner; gamePk → schedule ids)
 *   NFL results    lib/sports/nfl/current-results.mjs       (the FINAL-only settlement adapter)
 *   NFL players    nfl/player-board/<event>.json            (PUBLISHED families only, read per board)
 *   links          gameHrefByMatchId (MLB) · /nfl/game/[id] only where that page is generated (NFL)
 */
import fs from "node:fs";
import path from "node:path";

import { currentEtDate } from "@/lib/freshness";
import { gameHrefByMatchId } from "@/lib/game-detail";
import { projectMlbForecast } from "@/lib/live/forecast-join.mjs";
import { loadCurrentNflResults } from "@/lib/sports/nfl/current-results.mjs";
import { archivedEventIds } from "@/lib/sports/nfl/archived-forecast";
import { unionFrozenForecasts } from "@/lib/sports/nfl/public-forecast-union.mjs";
import { LEDGER_URLS, parseLedger } from "@/lib/saved/results.mjs";
import { compactLedgers } from "@/lib/my/saved-settlements.mjs";
import { buildSavedRouteManifest, type SavedRouteManifest } from "@/lib/saved/saved-routes";

export interface MyGame {
  sport: "MLB" | "NFL";
  gameId: string;
  startUtc: string | null;
  homeId: string | null;
  awayId: string | null;
  homeName: string;
  awayName: string;
  href: string | null;
  /** MLB per-team frozen run bands where a publishable simulation exists (never a combined total). */
  forecast: { runs: { home: { rangeLow: number; rangeHigh: number }; away: { rangeLow: number; rangeHigh: number } } } | null;
}

export interface MyResult {
  sport: "MLB" | "NFL";
  gameId: string;
  /**
   * When the GAME was played (MLB first pitch, NFL kickoff) — the date a reader sees on the card. Never the
   * grading time: a Sep 15 game graded after midnight is still a Sep 15 result.
   */
  resultAt: string | null;
  homeId: string | null;
  awayId: string | null;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  href: string | null;
}

export interface MyPlayerRow {
  playerId: string;
  name: string;
  team: string;
  kickoffUtc: string | null;
  matchup: string;
  href: string | null;
  /** PUBLISHED families only, each as its frozen p10–median–p90. */
  markets: Array<{ key: string; label: string; median: number; p10: number; p90: number }>;
}

export interface MyReadModel {
  etDate: string;
  /** v1.1.4.1: exported routes the Saved destination resolver checks (lib/saved/saved-routes). */
  savedRoutes: SavedRouteManifest;
  upcoming: MyGame[];
  results: MyResult[];
  /** Coverage receipts: how many source rows could not be joined to canonical ids. */
  coverage: { upcomingUnidentified: number; resultsUnidentified: number; nflResultsState: string };
}

const DATA = () => path.join(process.cwd(), "public/data");
const readJson = (rel: string): any => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA(), rel), "utf8"));
  } catch {
    return null;
  }
};

/** Integer id → canonical ref id, or null. Numeric ids only: a name is never turned into an id here. */
const mlbId = (raw: unknown) => (raw !== undefined && raw !== null && /^\d+$/.test(String(raw)) ? `mlb-team-${raw}` : null);
const nflId = (raw: unknown) => (raw !== undefined && raw !== null && /^\d+$/.test(String(raw)) ? `nfl-team-${raw}` : null);

/** Keep a forecast only when BOTH sides carry numeric bands — a half-published band is not shown. */
function bandsOf(proj: any): MyGame["forecast"] {
  const side = (x: any) =>
    x && typeof x.rangeLow === "number" && typeof x.rangeHigh === "number" ? { rangeLow: x.rangeLow, rangeHigh: x.rangeHigh } : null;
  const home = side(proj?.runs?.home);
  const away = side(proj?.runs?.away);
  return home && away ? { runs: { home, away } } : null;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** NFL event ids that actually have a generated `/nfl/game/[id]` page — the same rule as that route. */
function nflPageIds(): Set<string> {
  const live = unionFrozenForecasts(readJson("nfl/forecasts/latest.json"), readJson("nfl/forecasts/frozen-latest.json"));
  const ids = new Set<string>(((live?.forecasts ?? []) as Array<{ providerEventId?: string }>).map((f) => String(f.providerEventId)));
  try {
    // Same root the /nfl/game route passes (its DATA_ROOT) — passing the repo root silently found nothing.
    for (const id of archivedEventIds(DATA())) ids.add(String(id));
  } catch {
    /* no archive in this tree — links degrade to none rather than to a 404 */
  }
  return ids;
}

/** Every StatsAPI schedule capture, keyed by gamePk (used for Up Next AND to give graded rows their ids). */
function mlbScheduleByGamePk(): Map<string, { date: string; startUtc: string | null; homeId: string | null; awayId: string | null; homeName: string; awayName: string }> {
  const out = new Map();
  const dir = path.join(DATA(), "mlb/statsapi-schedule");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return out;
  }
  for (const f of files) {
    const j = readJson(`mlb/statsapi-schedule/${f}`);
    for (const g of j?.games ?? []) {
      if (g?.gamePk === undefined) continue;
      out.set(String(g.gamePk), {
        date: String(j?.date ?? f.replace(/\.json$/, "")),
        startUtc: typeof g.gameDate === "string" ? g.gameDate : null,
        homeId: mlbId(g?.home?.id),
        awayId: mlbId(g?.away?.id),
        homeName: String(g?.home?.name ?? ""),
        awayName: String(g?.away?.name ?? ""),
      });
    }
  }
  return out;
}

export function buildMyReadModel({ nowIso }: { nowIso?: string } = {}): MyReadModel {
  const etDate = currentEtDate(nowIso ? new Date(nowIso) : undefined);
  const upcoming: MyGame[] = [];
  const results: MyResult[] = [];
  let upcomingUnidentified = 0;
  let resultsUnidentified = 0;

  /* ── MLB: Up Next from the schedule, today onward (the reader's clock trims further). ── */
  const mlbSched = mlbScheduleByGamePk();
  const todaysSims = new Map<string, any>();
  for (const g of readJson(`mlb/full-game-simulations/${etDate}.json`)?.games ?? []) {
    if (g?.gamePk !== undefined) todaysSims.set(String(g.gamePk), g);
  }
  for (const [gamePk, s] of mlbSched) {
    if (s.date < etDate) continue;
    if (!s.homeId && !s.awayId) { upcomingUnidentified++; continue; }
    const proj = todaysSims.has(gamePk) ? projectMlbForecast(todaysSims.get(gamePk)) : null;
    upcoming.push({
      sport: "MLB", gameId: gamePk, startUtc: s.startUtc,
      homeId: s.homeId, awayId: s.awayId, homeName: s.homeName, awayName: s.awayName,
      href: gameHrefByMatchId("mlb", gamePk),
      // projectMlbForecast omits totalRuns — MLB totals are PAUSED, so a combined total cannot travel here.
      forecast: bandsOf(proj),
    });
  }

  /* ── NFL: Up Next from the schedule capture. ── */
  const pageIds = nflPageIds();
  for (const r of readJson("nfl/schedule/latest.json")?.rows ?? []) {
    if (!r?.providerEventId) continue;
    const homeId = nflId(r?.home?.providerTeamId);
    const awayId = nflId(r?.away?.providerTeamId);
    if (!homeId && !awayId) { upcomingUnidentified++; continue; }
    upcoming.push({
      sport: "NFL", gameId: String(r.providerEventId), startUtc: typeof r.dateUtc === "string" ? r.dateUtc : null,
      homeId, awayId, homeName: String(r?.home?.name ?? ""), awayName: String(r?.away?.name ?? ""),
      href: pageIds.has(String(r.providerEventId)) ? `/nfl/game/${r.providerEventId}/` : null,
      forecast: null,
    });
  }

  /* ── MLB results: the settlement owner's graded rows, most recent three graded dates. ── */
  const gradedByGame = new Map<string, { date: string; firstPitchUtc: string | null; home: number; away: number }>();
  try {
    const raw = fs.readFileSync(path.join(DATA(), "mlb/results/game-predictions-graded.jsonl"), "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let row: any;
      try { row = JSON.parse(line); } catch { continue; }
      const a = row?.actual;
      if (row?.gamePk === undefined || !Number.isInteger(a?.homeRuns) || !Number.isInteger(a?.awayRuns)) continue;
      // Many rows per game (one per market) share one actual result; the first is enough.
      if (!gradedByGame.has(String(row.gamePk))) {
        gradedByGame.set(String(row.gamePk), { date: String(row.date), firstPitchUtc: typeof row.firstPitchUtc === "string" ? row.firstPitchUtc : null, home: a.homeRuns, away: a.awayRuns });
      }
    }
  } catch {
    /* no graded artifact in this tree — MLB results degrade to none */
  }
  const recentDates = [...new Set([...gradedByGame.values()].map((g) => g.date))].sort().slice(-3);
  for (const [gamePk, g] of gradedByGame) {
    if (!recentDates.includes(g.date)) continue;
    const s = mlbSched.get(gamePk);
    if (!s || (!s.homeId && !s.awayId)) { resultsUnidentified++; continue; } // no ids ⇒ not guessed from the matchup string
    results.push({
      sport: "MLB", gameId: gamePk, // Game time, not grading time. Without a first pitch, noon ET on the game's own ET date keeps the label on that date.
      resultAt: g.firstPitchUtc ?? `${g.date}T16:00:00Z`,
      homeId: s.homeId, awayId: s.awayId, homeName: s.homeName, awayName: s.awayName,
      homeScore: g.home, awayScore: g.away, href: null, // past games have no page on today's board
    });
  }

  /* ── NFL results: WHICH results are canonical comes from the settlement adapter; the numeric team ids
        come from the capture rows joined by PROVIDER EVENT ID — never via the abbreviation. ── */
  const nfl: any = (loadCurrentNflResults as (o: { nowIso: string }) => any)({ nowIso: nowIso ?? new Date().toISOString() });
  const idsByEvent = new Map<string, { homeId: string | null; awayId: string | null }>();
  for (const rel of ["nfl/results/latest.json", "nfl/schedule/latest.json"]) {
    for (const r of readJson(rel)?.rows ?? []) {
      if (r?.providerEventId && !idsByEvent.has(String(r.providerEventId))) {
        idsByEvent.set(String(r.providerEventId), { homeId: nflId(r?.home?.providerTeamId), awayId: nflId(r?.away?.providerTeamId) });
      }
    }
  }
  for (const r of nfl.results ?? []) {
    const ids = idsByEvent.get(String(r.providerEventId));
    if (!ids || (!ids.homeId && !ids.awayId)) { resultsUnidentified++; continue; }
    results.push({
      sport: "NFL", gameId: String(r.providerEventId), resultAt: r.dateUtc ?? null,
      homeId: ids.homeId, awayId: ids.awayId, homeName: String(r.homeName ?? ""), awayName: String(r.awayName ?? ""),
      homeScore: r.ftHome, awayScore: r.ftAway,
      href: pageIds.has(String(r.providerEventId)) ? `/nfl/game/${r.providerEventId}/` : null,
    });
  }

  return {
    etDate,
    savedRoutes: buildSavedRouteManifest(),
    upcoming,
    results,
    coverage: { upcomingUnidentified, resultsUnidentified, nflResultsState: String(nfl.state) },
  };
}

/**
 * Followed-player rows — delivered SEPARATELY as /data/my/nfl-players.json (see that route).
 *
 * Measured: inline, these were 108 KB of a 142 KB page payload, sent to every reader although only a
 * reader who follows an NFL player can use a single row. The client fetches the file only in that case.
 */
export function buildMyPlayerRows(): MyPlayerRow[] {
  const pageIds = nflPageIds();
  const players: MyPlayerRow[] = [];
  for (const b of readJson("nfl/player-board/latest.json")?.boards ?? []) {
    const board = readJson(`nfl/player-board/${b.providerEventId}.json`);
    if (!board) continue;
    const published = Object.entries(board.families ?? {})
      .filter(([, fam]: [string, any]) => fam?.state === "PUBLISHED")
      .map(([key, fam]: [string, any]) => ({ key, label: String(fam.label ?? key) }));
    for (const p of board.players ?? []) {
      if (typeof p?.playerId !== "string" || !/^nfl-athlete-\d+$/.test(p.playerId)) continue;
      const markets = published
        .map(({ key, label }) => {
          const m = p.markets?.[key];
          // A range family only: probability families (anytime TD) are not rendered as a range here.
          if (!m || typeof m.median !== "number" || typeof m.p10 !== "number" || typeof m.p90 !== "number") return null;
          return { key, label, median: round1(m.median), p10: round1(m.p10), p90: round1(m.p90) };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);
      players.push({
        playerId: p.playerId, name: String(p.name ?? ""), team: String(p.team ?? ""),
        kickoffUtc: board.kickoffUtc ?? null, matchup: String(board.matchup ?? b.matchup ?? ""),
        href: pageIds.has(String(b.providerEventId)) ? `/nfl/game/${b.providerEventId}/` : null,
        markets,
      });
    }
  }

  return players;
}

/**
 * The Saved owner's four ledgers, compacted for My GameTime (v1.1.4 · saved-settlements.mjs). The SAME files
 * /saved fetches (LEDGER_URLS), parsed by the Saved owner's own parser — a missing ledger degrades to no rows,
 * which resolveResult reads as "not graded yet", never as a loss.
 */
export function buildMySavedSettlements() {
  const read = (kind: keyof typeof LEDGER_URLS) => {
    try {
      return parseLedger(kind, fs.readFileSync(path.join(process.cwd(), "public", LEDGER_URLS[kind]), "utf8")) as any[];
    } catch {
      return [];
    }
  };
  return compactLedgers({ mlbGames: read("mlbGames"), nfl: read("nfl"), epl: read("epl"), ufc: read("ufc") });
}
