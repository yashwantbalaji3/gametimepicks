/**
 * MLB-003 / MLB-004 · data-quality validation of the captured box scores (2024, 2025, 2026). Read-only.
 *
 *   node docs/research/mlb/mlb-003-004/validate-boxscore-history.mjs
 *
 * Per game:
 *   - batting vs opposing pitching (PA vs BF, runs, strikeouts, hits, walks, HR);
 *   - exactly one starter per team;
 *   - IP ↔ outs ("6.1" = 19);
 *   - K ≤ BF; no duplicate player within a team; every line carries a playerId;
 *   - at least 24 defensive outs (the team that did not bat in the 9th may record 24);
 *   - final runs against the independently captured StatsAPI linescores, where that file has the game
 *     (2024–2025: data/internal/mlb/linescores-history; it is read here only as a cross-check of the capture,
 *     never as a model input).
 * Writes boxscore-validation.json beside this file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../..");
const SOURCES = [
  ["2024", path.join(REPO, "data/internal/mlb/boxscore-outcomes-history/2024")],
  ["2025", path.join(REPO, "data/internal/mlb/boxscore-outcomes-history/2025")],
  ["2026", path.join(REPO, "data/internal/mlb/boxscore-outcomes")],
];
const LINESCORES = path.join(REPO, "data/internal/mlb/linescores-history");

function linescoreFinals(season) {
  const dir = path.join(LINESCORES, season);
  const finals = new Map();
  if (!fs.existsSync(dir)) return finals;
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith(".json")) { try { const j = JSON.parse(fs.readFileSync(p, "utf8")); const games = Array.isArray(j) ? j : j.games ?? (j.gamePk ? [j] : []); for (const g of games) { const pk = g.gamePk ?? g.game_pk; const a = g.away?.runs ?? g.awayRuns ?? g.away_runs ?? g.teams?.away?.runs ?? g.linescore?.teams?.away?.runs; const h = g.home?.runs ?? g.homeRuns ?? g.home_runs ?? g.teams?.home?.runs ?? g.linescore?.teams?.home?.runs; if (pk != null && Number.isFinite(a) && Number.isFinite(h)) finals.set(pk, { away: a, home: h }); } } catch { /* skip unreadable */ } } } };
  walk(dir);
  return finals;
}
const outsOf = (ip) => { if (ip == null) return null; const [w, f] = String(ip).split("."); return Number(w) * 3 + Number(f ?? 0); };

const report = { generatedAt: new Date().toISOString(), seasons: {} };
for (const [season, dir] of SOURCES) {
  const finals = linescoreFinals(season);
  const issues = {}; const examples = {};
  const flag = (k, ex) => { issues[k] = (issues[k] ?? 0) + 1; if (!examples[k]) examples[k] = ex; };
  let games = 0; let lines = 0; let crossChecked = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
    const day = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const byGame = new Map();
    for (const r of day.rows) { const a = byGame.get(r.gamePk) ?? []; a.push(r); byGame.set(r.gamePk, a); lines += 1; }
    for (const [pk, rows] of byGame) {
      games += 1;
      const side = { away: rows.filter((r) => r.side === "away"), home: rows.filter((r) => r.side === "home") };
      const tot = {};
      for (const s of ["away", "home"]) {
        const bat = side[s].filter((r) => r.batting).map((r) => r.batting);
        const pit = side[s].filter((r) => r.pitching).map((r) => r.pitching);
        const sum = (a, k) => a.reduce((x, y) => x + (y[k] ?? 0), 0);
        tot[s] = { pa: sum(bat, "pa"), r: sum(bat, "r"), so: sum(bat, "so"), h: sum(bat, "h"), bb: sum(bat, "bb"), hr: sum(bat, "hr"), bf: sum(pit, "bf"), rAllowed: sum(pit, "r"), kP: sum(pit, "so"), hAllowed: sum(pit, "h"), bbAllowed: sum(pit, "bb"), hrAllowed: sum(pit, "hr"), outs: sum(pit, "outs") };
        const starters = pit.filter((p) => p.started).length;
        if (starters !== 1) flag(`starters!=1`, { date: day.date, pk, side: s, starters });
        for (const p of pit) {
          if (p.so > p.bf) flag("K>BF", { date: day.date, pk });
          const o = outsOf(p.ip); if (o != null && p.outs != null && o !== p.outs) flag("IP!=outs", { date: day.date, pk, ip: p.ip, outs: p.outs });
        }
        const ids = side[s].map((r) => r.playerId);
        if (ids.some((x) => x == null)) flag("missing playerId", { date: day.date, pk });
        if (new Set(ids).size !== ids.length) flag("duplicate player", { date: day.date, pk, side: s });
      }
      for (const [b, p] of [["away", "home"], ["home", "away"]]) {
        const B = tot[b]; const P = tot[p];
        if (B.pa !== P.bf) flag("PA!=opposing BF", { date: day.date, pk, pa: B.pa, bf: P.bf });
        if (B.r !== P.rAllowed) flag("R!=opposing R", { date: day.date, pk, r: B.r, allowed: P.rAllowed });
        if (B.so !== P.kP) flag("K!=opposing K", { date: day.date, pk });
        if (B.h !== P.hAllowed) flag("H!=opposing H", { date: day.date, pk });
        if (B.hr !== P.hrAllowed) flag("HR!=opposing HR", { date: day.date, pk });
        if (B.bb !== P.bbAllowed) flag("BB!=opposing BB", { date: day.date, pk });
      }
      const meta = (day.games ?? []).find((g) => g.gamePk === pk);
      const early = meta?.detailedState === "Completed Early";
      for (const s of ["away", "home"]) if (!early && tot[s].outs < 24) flag("defensive outs<24 (not Completed Early)", { date: day.date, pk, side: s, outs: tot[s].outs });
      if (tot.away.r === tot.home.r) flag("tie", { date: day.date, pk });
      const fin = finals.get(pk);
      if (fin) { crossChecked += 1; if (fin.away !== tot.away.r || fin.home !== tot.home.r) flag("runs != linescore final", { date: day.date, pk, box: [tot.away.r, tot.home.r], linescore: [fin.away, fin.home] }); }
    }
  }
  report.seasons[season] = { games, playerLines: lines, linescoreFinalsAvailable: finals.size, crossChecked, issues, examples };
}
fs.writeFileSync(path.join(HERE, "boxscore-validation.json"), JSON.stringify(report, null, 1) + "\n");
for (const [s, o] of Object.entries(report.seasons)) console.log(`${s}: ${o.games} games, ${o.playerLines} lines, cross-checked vs linescores ${o.crossChecked}/${o.linescoreFinalsAvailable}; issues ${JSON.stringify(o.issues)}`);
