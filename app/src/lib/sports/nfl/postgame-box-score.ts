/**
 * NFL POSTGAME BOX SCORE — build-time read model (gap 5, 2026-10-23). SERVER ONLY.
 *
 * A settled game page showed the final score and the frozen forecast, never the played game. This reads the SAME
 * official lines the grading pipeline graded against (scripts/nfl/build-nfl-week-reconciliation.mjs keeps them as
 * data/internal/nfl/official-stats/<eventId>.json and the quarter scores as data/internal/nfl/official-periods/), and
 * the graded Official Forecast per player from the public week reconciliation (the rows /results/nfl shows). Nothing
 * is fetched, recomputed or regraded: the forecast numbers, the actuals and the in/out-of-range outcome are the
 * reconciliation's own; this only lines them up per player.
 *
 * Missing is never zero: a forecast player with no line in the official box score reads "—" (did not play), and a
 * game without a FINAL official file renders no box score at all.
 */
import fs from "node:fs";
import path from "node:path";

import { reconciledGames } from "@/lib/sports/nfl/archived-forecast";

const OFFICIAL_STATS_DIR = "data/internal/nfl/official-stats";
const OFFICIAL_PERIODS_DIR = "data/internal/nfl/official-periods";

type Line = { name: string | null; team: string | null; passYds: number; rushYds: number; recYds: number; receptions: number };
type OfficialStats = { state: string; finalScore: { home: number; away: number }; players: Record<string, Line>; scorers: Array<{ playerId: string; creditType: string }>; capturedAt?: string };
type OfficialPeriods = { state: string; periods: { home: number[]; away: number[] } | null; overtime: boolean | null; tie: boolean };
type ReconRow = { name: string; team: string; prop: string; median: number | null; low: number; high: number; actual: number | null; outcome: string };
type ReconTd = { name: string; team: string; probability: number; outcome: string };

export type StatKey = "passYds" | "rushYds" | "receptions" | "recYds";
export const STAT_COLUMNS: ReadonlyArray<{ key: StatKey; prop: string; label: string; short: string }> = [
  { key: "passYds", prop: "player_pass_yds", label: "Passing yards", short: "Pass yds" },
  { key: "rushYds", prop: "player_rush_yds", label: "Rushing yards", short: "Rush yds" },
  { key: "receptions", prop: "player_receptions", label: "Receptions", short: "Rec" },
  { key: "recYds", prop: "player_reception_yds", label: "Receiving yards", short: "Rec yds" },
];

export interface ForecastCell { median: number | null; low: number; high: number; outcome: string }
export interface BoxPlayer {
  name: string;
  /** null ⇒ no line in the official box score (did not play). */
  line: Record<StatKey, number> | null;
  /** The player scored a rushing, receiving, return or recovery touchdown (a thrown one does not count). */
  scored: boolean;
  forecast: Partial<Record<StatKey, ForecastCell>>;
  td: { probability: number; outcome: string } | null;
}
export interface BoxTeam { abbr: string; name: string; final: number; periods: number[] | null; players: BoxPlayer[]; quiet: number; totals: Record<StatKey, number> }
export interface NflPostgame { away: BoxTeam; home: BoxTeam; overtime: boolean | null; capturedAt: string | null; weekLabel: string | null; forecastPlayers: number }

const readRepoJson = <T,>(rel: string): T | null => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", rel), "utf8")) as T; } catch { return null; }
};

const keyOf = (team: string | null | undefined, name: string | null | undefined) => `${team ?? ""}|${String(name ?? "").trim().toLowerCase()}`;

export function loadNflPostgame(eventId: string, teams: { away: { abbr: string; name: string }; home: { abbr: string; name: string } }): NflPostgame | null {
  if (!/^\d+$/.test(eventId)) return null;
  const official = readRepoJson<OfficialStats>(`${OFFICIAL_STATS_DIR}/${eventId}.json`);
  if (official?.state !== "FINAL" || !official.finalScore || !official.players) return null;
  const periods = readRepoJson<OfficialPeriods>(`${OFFICIAL_PERIODS_DIR}/${eventId}.json`);
  const recon = reconciledGames(path.join(process.cwd(), "public", "data")).find((g) => g.game.providerEventId === eventId);
  const game = recon?.game as unknown as { state?: string; players?: ReconRow[]; touchdowns?: ReconTd[] } | undefined;
  const graded = game?.state === "FINAL";

  const scorers = new Set(official.scorers.filter((s) => s.creditType !== "PASS").map((s) => s.playerId));
  /* The reconciliation names players as the pregame board named them; join on (team, name) to the official lines by
     the board's own ESPN id where the board is committed, else by the official line's own name. Exact match only. */
  const board = readRepoJson<{ players?: Array<{ playerId: string; name: string; team: string }> }>(`app/public/data/nfl/player-board/${eventId}.json`);
  const idByKey = new Map<string, string>();
  for (const [id, l] of Object.entries(official.players)) idByKey.set(keyOf(l.team, l.name), id);
  for (const p of board?.players ?? []) {
    const id = String(p.playerId ?? "").replace(/^nfl-athlete-/, "");
    if (id && official.players[id]) idByKey.set(keyOf(p.team, p.name), id);
  }

  const forecastByKey = new Map<string, { name: string; team: string; forecast: BoxPlayer["forecast"]; td: BoxPlayer["td"] }>();
  const entry = (team: string, name: string) => {
    const k = keyOf(team, name);
    if (!forecastByKey.has(k)) forecastByKey.set(k, { name, team, forecast: {}, td: null });
    return forecastByKey.get(k)!;
  };
  if (graded) {
    for (const r of game?.players ?? []) {
      const col = STAT_COLUMNS.find((c) => c.prop === r.prop);
      if (col && Number.isFinite(r.low) && Number.isFinite(r.high)) entry(r.team, r.name).forecast[col.key] = { median: r.median, low: r.low, high: r.high, outcome: r.outcome };
    }
    for (const t of game?.touchdowns ?? []) if (Number.isFinite(t.probability)) entry(t.team, t.name).td = { probability: t.probability, outcome: t.outcome };
  }

  const build = (side: "away" | "home"): BoxTeam => {
    const abbr = teams[side].abbr;
    const players: BoxPlayer[] = [];
    const used = new Set<string>();
    let quiet = 0;
    for (const [id, l] of Object.entries(official.players)) {
      if (l.team !== abbr) continue;
      const k = keyOf(l.team, l.name);
      const f = [...forecastByKey.entries()].find(([fk]) => idByKey.get(fk) === id);
      if (f) used.add(f[0]);
      const line = { passYds: l.passYds ?? 0, rushYds: l.rushYds ?? 0, receptions: l.receptions ?? 0, recYds: l.recYds ?? 0 };
      const active = line.passYds || line.rushYds || line.receptions || line.recYds || scorers.has(id);
      if (!active && !f) { quiet += 1; continue; }
      players.push({ name: f?.[1].name ?? l.name ?? k, line, scored: scorers.has(id), forecast: f?.[1].forecast ?? {}, td: f?.[1].td ?? null });
    }
    for (const [k, f] of forecastByKey) {
      if (f.team !== abbr || used.has(k)) continue;
      players.push({ name: f.name, line: null, scored: false, forecast: f.forecast, td: f.td });
    }
    const vol = (p: BoxPlayer) => (p.line ? p.line.passYds + p.line.rushYds + p.line.recYds : -1);
    players.sort((a, b) => vol(b) - vol(a) || a.name.localeCompare(b.name));
    const totals = { passYds: 0, rushYds: 0, receptions: 0, recYds: 0 };
    for (const p of players) if (p.line) for (const c of STAT_COLUMNS) totals[c.key] += p.line[c.key];
    const per = periods?.state === "FINAL" && periods.periods ? periods.periods[side] : null;
    return { abbr, name: teams[side].name, final: official.finalScore[side], periods: per && per.length ? per : null, players, quiet, totals };
  };

  return {
    away: build("away"),
    home: build("home"),
    overtime: periods?.state === "FINAL" ? periods.overtime : null,
    capturedAt: official.capturedAt ?? null,
    weekLabel: graded ? recon?.weekLabel ?? null : null,
    forecastPlayers: forecastByKey.size,
  };
}
