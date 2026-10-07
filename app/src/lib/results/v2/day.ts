/**
 * RESULTS V2 · ONE DAY, GAME BY GAME (B-3). Server/build time only.
 *
 * For one ET day, every graded outcome grouped sport → event → row, straight from the canonical owners.
 * Nothing is graded or recomputed here: each outcome, line and actual value is the owner's own.
 *   MLB  game calls  public/data/mlb/results/game-predictions-graded.jsonl   (WIN / LOSS / PUSH)
 *        prop leans  public/data/mlb/results/settled_leans.jsonl            (Win / Loss / Void — RESEARCH)
 *                    forecast of record only (Stage 3B, lib/results/mlb-leans-of-record.mjs): a postponed game's
 *                    re-issued lean is listed once, on the board of record, never on both dates
 *   NFL  winners     lib/sports/graded-pick-owners.mjs (experimental settlement; a tie is a void)
 *        finals      data/internal/nfl/experimental-settlement (grade.actual — the settled score, display only)
 *        ranges      public/data/nfl/reconciliation/<period>.json   (HIT = the final landed INSIDE the
 *                    printed range — a coverage record, never a W–L)
 *   EPL  / UFC       lib/sports/graded-pick-owners.mjs
 */
import fs from "node:fs";
import path from "node:path";

import { makeGradedPickOwners } from "@/lib/sports/graded-pick-owners.mjs";
import { mlbFirstPitches, mlbLeansOfRecord } from "@/lib/results/mlb-leans-of-record.mjs";
import { outcomeFromHit, outcomeFromWord } from "./populations.mjs";

export type V2Outcome = "WIN" | "LOSS" | "PUSH" | "VOID";
export interface DayCall { market: string; pick: string; line: string | null; outcome: V2Outcome | null }
export interface DayProp { player: string; team: string | null; market: string; pick: string; actual: string | null; outcome: V2Outcome | null }
export interface DayRange { player: string; team: string | null; family: string; status: string; range: string; actual: string | null; inside: boolean | null }
export interface DayEvent {
  id: string; sport: "mlb" | "nfl" | "epl" | "ufc"; title: string; final: string | null;
  calls: DayCall[]; props: DayProp[]; ranges: DayRange[];
}

const readJsonl = (p: string): Record<string, any>[] => {
  try { return fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as Record<string, any>[]; } catch { return []; }
};
const readJson = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const etDay = (iso: unknown) => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) ? ET_DAY.format(new Date(t)) : null; };
const MARKET: Record<string, string> = { moneyline: "Winner", run_line: "Run line", total: "Total runs" };
const FAMILY: Record<string, string> = { player_receptions: "Receptions", player_reception_yds: "Receiving yards", player_rush_yds: "Rushing yards", player_pass_yds: "Passing yards" };

let cache: { mlbGames: Record<string, any>[]; mlbProps: Record<string, any>[]; picks: { nfl: any[]; epl: any[]; ufc: any[] } } | null = null;
function sources() {
  if (cache) return cache;
  const app = process.cwd();
  const owners = makeGradedPickOwners({ appDir: app, rootDir: path.resolve(app, "..") });
  const mlbGames = readJsonl(path.join(app, "public/data/mlb/results/game-predictions-graded.jsonl"));
  cache = {
    mlbGames,
    mlbProps: mlbLeansOfRecord(readJsonl(path.join(app, "public/data/mlb/results/settled_leans.jsonl")), { firstPitches: mlbFirstPitches(mlbGames) }).record,
    picks: { nfl: owners.nflPicks() ?? [], epl: owners.eplPicks() ?? [], ufc: owners.ufcPicks() ?? [] },
  };
  return cache;
}

function nflRanges(): Map<string, DayRange[]> {
  const out = new Map<string, DayRange[]>();
  const dir = path.join(process.cwd(), "public/data/nfl/reconciliation");
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d+-\d+\.json$/.test(f)); } catch { return out; }
  for (const f of files) {
    for (const g of readJson(path.join(dir, f))?.games ?? []) {
      const rows: DayRange[] = (g.players ?? []).filter((p: any) => p?.prop && p.status).map((p: any) => ({
        player: String(p.name ?? ""), team: p.team ?? null, family: FAMILY[p.prop] ?? String(p.prop), status: String(p.status),
        range: p.low != null && p.high != null ? `${p.low}–${p.high}` : "—",
        actual: p.actual != null ? String(p.actual) : null,
        inside: p.outcome === "HIT" ? true : p.outcome === "MISS" ? false : null,
      }));
      if (rows.length) out.set(`nfl-${g.providerEventId}`, rows);
    }
  }
  return out;
}

function nflFinals(): Map<string, { home: number; away: number }> {
  const out = new Map<string, { home: number; away: number }>();
  const dir = path.resolve(process.cwd(), "..", "data/internal/nfl/experimental-settlement");
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { return out; }
  for (const f of files) {
    for (const e of readJson(path.join(dir, f))?.events ?? []) {
      const a = e?.grade?.actual;
      if (e?.canonicalEventId && typeof a?.home === "number" && typeof a?.away === "number") out.set(String(e.canonicalEventId), { home: a.home, away: a.away });
    }
  }
  return out;
}

/** "AWAY @ HOME" + a HOME / AWAY side → the team, so a reader sees "DEN", not "HOME". Unknown stays as given. */
const sideTeam = (matchup: string, side: unknown) => {
  const [away, home] = matchup.split(" @ ");
  const s = String(side ?? "").toUpperCase();
  return s === "HOME" && home ? `${home} (home)` : s === "AWAY" && away ? `${away} (away)` : String(side ?? "—");
};

/** Every graded event on `date`, grouped by sport. Empty arrays when a sport graded nothing that day. */
export function resultsDay(date: string): Record<"mlb" | "nfl" | "epl" | "ufc", DayEvent[]> {
  const src = sources();
  const mlb = new Map<string, DayEvent>();
  const mlbEvent = (pk: string, title: string) => {
    if (!mlb.has(pk)) mlb.set(pk, { id: `mlb-${pk}`, sport: "mlb", title, final: null, calls: [], props: [], ranges: [] });
    return mlb.get(pk)!;
  };
  for (const r of src.mlbGames) {
    if (r.date !== date) continue;
    const e = mlbEvent(String(r.gamePk), String(r.matchup ?? r.gamePk));
    if (r.actual && typeof r.actual.homeRuns === "number" && typeof r.actual.awayRuns === "number") {
      const [away, home] = String(r.matchup ?? "").split(" @ ");
      e.final = away && home ? `${away} ${r.actual.awayRuns} – ${r.actual.homeRuns} ${home}` : `${r.actual.awayRuns}–${r.actual.homeRuns}`;
    }
    e.calls.push({ market: MARKET[r.market] ?? String(r.market), pick: String(r.pick ?? ""), line: r.line != null ? String(r.line) : null, outcome: outcomeFromWord(r.outcome) as V2Outcome | null });
  }
  for (const r of src.mlbProps) {
    if (r.date !== date) continue;
    const e = mlbEvent(String(r.gamePk), mlb.get(String(r.gamePk))?.title ?? `${r.playerTeamAbbr ?? "?"} v ${r.opponentAbbr ?? "?"}`);
    e.props.push({ player: String(r.playerName ?? ""), team: r.playerTeamAbbr ?? null, market: String(r.marketLabel ?? r.marketKey ?? ""), pick: `${r.lean} ${r.line}`, actual: r.actual != null ? String(r.actual) : null, outcome: outcomeFromWord(r.outcome) as V2Outcome | null });
  }

  const ranges = nflRanges();
  const finals = nflFinals();
  const nfl: DayEvent[] = src.picks.nfl.filter((p: any) => p.when === date).map((p: any) => {
    const title = String(p.subject ?? p.eventId);
    const f = finals.get(String(p.eventId));
    const [away, home] = title.split(" @ ");
    return {
    id: String(p.eventId), sport: "nfl" as const, title,
    final: f ? (away && home ? `${away} ${f.away} – ${f.home} ${home}` : `${f.away}–${f.home}`) : null,
    calls: [{ market: "Winner", pick: sideTeam(title, p.predicted), line: null, outcome: outcomeFromHit(p.hit) as V2Outcome }],
    props: [], ranges: ranges.get(String(p.eventId)) ?? [],
    };
  });
  const simple = (sport: "epl" | "ufc", market: string, finalWord: string) => src.picks[sport].filter((p: any) => p.when === date).map((p: any) => ({
    id: String(p.eventId), sport, title: String(p.subject ?? p.eventId), final: p.actual != null ? `${finalWord}: ${p.actual}` : null,
    calls: [{ market, pick: String(p.predicted ?? "—"), line: null, outcome: outcomeFromHit(p.hit) as V2Outcome }], props: [], ranges: [],
  }));
  return { mlb: [...mlb.values()], nfl, epl: simple("epl", "Match result", "Result"), ufc: simple("ufc", "Fight winner", "Winner") };
}

/** ET days that have any graded row, newest first — the static params for /results/day/[date]. */
export function resultsDayDates(limit = Infinity): string[] {
  const src = sources();
  const days = new Set<string>();
  for (const r of src.mlbGames) if (typeof r.date === "string") days.add(r.date);
  for (const s of ["nfl", "epl", "ufc"] as const) for (const p of src.picks[s]) if (typeof p.when === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.when)) days.add(p.when);
  for (const r of src.mlbProps) if (typeof r.date === "string") days.add(r.date);
  return [...days].sort().reverse().slice(0, limit);
}
