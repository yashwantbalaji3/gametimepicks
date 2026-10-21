/**
 * NBA SIMULATION THEATER · POSSESSION BOX SCORE — the simulation outcome panel's numbers. Pure; client-safe.
 *
 * The box score IS the fold of the run's event log (events.mjs foldEvents, the engine's own definition): nothing else
 * writes a player line, so the live box at any moment (fold of the events played so far) and the final box can never
 * disagree. Columns are only what the engine truly models: MIN PTS REB AST 3PM 3PA FGM FGA FTM FTA STL BLK TOV PF.
 *
 * RECONCILIATION (`reconcileBox`), recomputed in the browser from the fold, every check printed:
 *   R1 Σ player PTS = team PTS = final score = Σ linescore periods (both teams)
 *   R2 per player and team: FGM ≤ FGA, 3PM ≤ 3PA, 3PM ≤ FGM, 3PA ≤ FGA, FTM ≤ FTA, PTS = 2·FGM + 3PM + FTM
 *   R3 Σ player minutes = 240 + 25·OT per team (exact, in deciseconds: 5 × (28800 + 3000·OT)); 0 ≤ MIN ≤ game length
 *   R4 no negative or non-integer counting stat; REB = OREB + DREB; AST ≤ FGM (team); STL ≤ opponent TOV;
 *      BLK ≤ opponent missed FGA
 *   R5 untied final; overtime periods = linescore length − 4
 * Comparison with the OFFICIAL forecast (`compareWithOfficial`): per player, this run's whole-number line beside the
 * official v0.1 median (the only player figure the official forecast publishes); fractional vs whole numbers are shown
 * side by side, never rounded into each other. The official numbers come from the official panel's data only.
 */
import { foldEvents } from "../../../sports/nba/research/possession-sim/events.mjs";

export const BOX_COLUMNS = Object.freeze([
  ["min", "MIN"], ["pts", "PTS"], ["reb", "REB"], ["ast", "AST"], ["threePm", "3PM"], ["threePa", "3PA"], ["fgm", "FGM"], ["fga", "FGA"],
  ["ftm", "FTM"], ["fta", "FTA"], ["stl", "STL"], ["blk", "BLK"], ["tov", "TOV"], ["pf", "PF"],
]);
export const COMPARE_FAMILIES = Object.freeze([["minutes", "MIN", "min"], ["pts", "PTS", "pts"], ["reb", "REB", "reb"], ["ast", "AST", "ast"], ["threePm", "3PM", "threePm"]]);

const COUNT_KEYS = ["pts", "fgm", "fga", "threePm", "threePa", "ftm", "fta", "oreb", "dreb", "reb", "ast", "stl", "blk", "tov", "pf"];
const isInt = Number.isInteger;

/** Fold the first n events (n = all by default). `rosters` = [[home ids], [away ids]]. */
export function foldRun(events, rosters, n = events.length) {
  return foldEvents(events.slice(0, n), rosters);
}

/** Display rows: per side, players in roster order, with MIN as decimal minutes (exact deciseconds kept as `ds`). */
export function boxRows(fold, rosters, names) {
  const side = (t) => rosters[t].map((id) => {
    const l = fold.players[t].get(String(id));
    return { providerAthleteId: String(id), name: names.get(String(id)) ?? null, ds: l.ds, min: l.ds / 600, ...Object.fromEntries(COUNT_KEYS.map((k) => [k, l[k]])) };
  });
  const totals = (t) => ({ ds: fold.team[t].ds, min: fold.team[t].ds / 600, ...Object.fromEntries(COUNT_KEYS.map((k) => [k, fold.team[t][k]])), teamRebounds: fold.teamRebounds[t] });
  return { home: side(0), away: side(1), totals: { home: totals(0), away: totals(1) } };
}

/** "34:12" from deciseconds (minutes:seconds, rounded down to the second). */
export const fmtMinutes = (ds) => { const s = Math.floor(ds / 10); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Every reconciliation check, each { id, label, ok, detail }. `ok` overall = all pass. */
export function reconcileBox(fold, run) {
  const checks = [];
  const add = (id, label, ok, detail = "") => checks.push({ id, label, ok: !!ok, detail });
  const ot = fold.overtimePeriods;
  const gameDs = 28800 + 3000 * ot;
  for (let t = 0; t < 2; t += 1) {
    const side = t === 0 ? "home" : "away";
    const lines = [...fold.players[t].values()];
    const sumPts = lines.reduce((s, l) => s + l.pts, 0);
    const sumPeriods = fold.periods[t].reduce((s, x) => s + x, 0);
    add(`R1-${side}`, `${side}: player points = team points = final = quarter sum`, sumPts === fold.team[t].pts && sumPts === fold.final[t] && sumPeriods === fold.final[t] && (run?.final == null || run.final[t] === fold.final[t]), `${sumPts} / ${fold.team[t].pts} / ${fold.final[t]} / ${sumPeriods}`);
    const bad = [];
    for (const l of [...lines, fold.team[t]]) {
      if (!(l.fgm <= l.fga && l.threePm <= l.threePa && l.threePm <= l.fgm && l.threePa <= l.fga && l.ftm <= l.fta && l.pts === 2 * l.fgm + l.threePm + l.ftm)) bad.push(l);
    }
    add(`R2-${side}`, `${side}: makes ≤ attempts, 3PT and FT reconcile (PTS = 2·FGM + 3PM + FTM)`, bad.length === 0, bad.length ? `${bad.length} line(s) fail` : "");
    const sumDs = lines.reduce((s, l) => s + l.ds, 0);
    add(`R3-${side}`, `${side}: minutes sum to ${240 + 25 * ot}${ot ? ` (240 + 25 × ${ot} OT)` : ""}`, sumDs === 5 * gameDs && lines.every((l) => l.ds >= 0 && l.ds <= gameDs), `${(sumDs / 600).toFixed(2)} min`);
    const neg = [...lines, fold.team[t]].filter((l) => COUNT_KEYS.some((k) => !isInt(l[k]) || l[k] < 0) || l.reb !== l.oreb + l.dreb);
    const o = fold.team[1 - t];
    add(`R4-${side}`, `${side}: no impossible values (non-negative integers, REB = OREB + DREB, AST ≤ FGM, STL ≤ opp. TOV, BLK ≤ opp. missed FGA)`, neg.length === 0 && fold.team[t].ast <= fold.team[t].fgm && fold.team[t].stl <= o.tov && fold.team[t].blk <= o.fga - o.fgm, neg.length ? `${neg.length} line(s) fail` : "");
  }
  add("R5", "untied final; overtime only after a tie", fold.final[0] !== fold.final[1] && fold.periods[0].length === 4 + ot && (run?.overtimePeriods == null || run.overtimePeriods === ot), `${fold.final[0]}–${fold.final[1]}, OT ${ot}`);
  return { ok: checks.every((c) => c.ok), checks };
}

/**
 * Per player: this run's value beside the official median, for the families the official forecast publishes.
 * `official.players` = [{ playerId, team: "home"|"away", displayName, medians: { pts, reb, ast, threePm, minutes } }].
 * Players the official forecast has but this run's roster lacks are listed with run = null (never invented).
 */
export function compareWithOfficial(rows, official) {
  const out = [];
  const runLine = new Map([...rows.home, ...rows.away].map((r) => [r.providerAthleteId, r]));
  for (const p of official?.players ?? []) {
    const r = runLine.get(String(p.playerId)) ?? null;
    out.push({
      playerId: String(p.playerId), team: p.team, name: p.displayName ?? r?.name ?? null,
      families: COMPARE_FAMILIES.map(([fam, label, key]) => {
        const off = p.medians?.[fam];
        const run = r ? (key === "min" ? Number((r.ds / 600).toFixed(1)) : r[key]) : null;
        return { family: fam, label, official: typeof off === "number" ? off : null, run, diff: typeof off === "number" && typeof run === "number" ? Number((run - off).toFixed(2)) : null };
      }),
    });
  }
  return out;
}
