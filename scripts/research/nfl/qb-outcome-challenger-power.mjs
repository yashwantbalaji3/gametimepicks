#!/usr/bin/env node
/** QB-aware outcome challenger spec v3, sections 1 and 4: stratum counts (weeks 11–18 + postseason, 2018–2025) and the per-game margin-shift RMS used for power. Committed data only; exploratory. */
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath } from "node:url";
const W = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { loadRows } = await import(W + "/scripts/research/nfl/backtest-qb-starter-tier-b.mjs");
const L = await import(W + "/app/src/lib/sports/nfl/qb-starter-projection.mjs");
const F = JSON.parse(fs.readFileSync(W + "/data/internal/research/nfl/reports/player-props-share-level-preregistration.json", "utf8")).frozen;
const scale = 1.25, S = 0.9746;
const prior = JSON.parse(fs.readFileSync(W + "/data/internal/research/nfl/reports/qb-fallback-categories-exploratory.json", "utf8")).tierDPrior;
const { rows, totals } = loadRows();
const state = L.createQbState(F);
const games = new Map(); // gameId → {season, week, type, sides:[{team, nonEst, delta}]}
let i = 0;
while (i < rows.length) {
  const date = rows[i].date; let j = i; while (j < rows.length && rows[j].date === date) j++;
  const day = rows.slice(i, j); const byGame = new Map();
  for (const r of day) { if (r.participation === "UNKNOWN") continue; const k = `${r.gameId}|${r.team}`; if (!byGame.has(k)) byGame.set(k, []); byGame.get(k).push(r); }
  for (const [k, list] of byGame) {
    const Ld = list.filter((r) => r.passAtt > 0).sort((a, b) => b.passAtt - a.passAtt)[0];
    if (!Ld || Ld.season < 2018 || Ld.season > 2025) continue;
    const st = state.players.get(Ld.id);
    const share = st && st.team === Ld.team ? L.clubShare(st, Ld.season, F) : 0;
    const career = st?.careerAtt ?? 0;
    const nonEst = share < 0.75;
    const args = { st: st ?? { games: 0, rates: { comp: [], ypcmp: [] }, clubObs: [] }, team: Ld.team, season: Ld.season, state, F, scale, starterShare: S };
    const proj = career >= 25 ? L.tierBProjection(args) : L.tierDProjection({ ...args, opponent: Ld.opponent, prior });
    const delta = proj.mean - L.leagueStarterProjection(args).mean;
    const g = games.get(Ld.gameId) ?? { season: Ld.season, week: Ld.week, type: Ld.type, sides: [] };
    g.sides.push({ team: Ld.team, nonEst, delta }); games.set(Ld.gameId, g);
  }
  for (const r of day) if (r.participation !== "UNKNOWN") state.fold({ ...r, gameKey: `${r.gameId}|${r.team}` }, totals.get(`${r.gameId}|${r.team}`)?.[0] ?? 0);
  i = j;
}
const G = [...games.values()].filter((g) => g.sides.length === 2);
const late = G.filter((g) => (g.type === "REG" && g.week >= 11) || g.type === "POST");
const bySeason = {};
for (const g of late) { const s = (bySeason[g.season] ??= { games: 0, strat: 0 }); s.games++; if (g.sides.some((x) => x.nonEst)) s.strat++; }
console.log("weeks 11–18 + playoffs per season (games, games with ≥1 non-established starter):", JSON.stringify(bySeason));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const strat = late.map((g) => g.sides.some((x) => x.nonEst));
console.log("late games/season mean", mean(Object.values(bySeason).map((s) => s.games)).toFixed(1), "stratum/season mean", mean(Object.values(bySeason).map((s) => s.strat)).toFixed(1), "min", Math.min(...Object.values(bySeason).map((s) => s.strat)), "max", Math.max(...Object.values(bySeason).map((s) => s.strat)));
const PTS_PER_YD = 0.0625; // league points per drive ÷ yards per drive (≈2.0 / 32), full pass-through (κ=1): an UPPER bound on the shift
const dm = (g) => PTS_PER_YD * ((g.sides[0].delta) - (g.sides[1].delta));
const all = G.map(dm), st = G.filter((g) => g.sides.some((x) => x.nonEst)).map(dm), est = G.filter((g) => !g.sides.some((x) => x.nonEst)).map(dm);
console.log("margin shift δ (pts, κ=1): sd all", sd(all).toFixed(2), "rms all", Math.sqrt(mean(all.map((x) => x * x))).toFixed(2), "| stratum rms", Math.sqrt(mean(st.map((x) => x * x))).toFixed(2), "| established rms", Math.sqrt(mean(est.map((x) => x * x))).toFixed(2), "| share stratum", (st.length / G.length).toFixed(2));
