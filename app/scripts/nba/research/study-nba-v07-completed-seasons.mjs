/**
 * The completed-season design study behind the v0.7 candidate. NBA REGULAR SEASON — CANDIDATE (NOT ARMED) · PRIVATE_RESEARCH.
 *
 * Reads corpus box scores of 2023-24 to 2025-26 only. It reads no 2026-27 game, no receipt, no roster and no injury feed,
 * and it scores nothing on a seen game. The fit module throws on any other season. Prints to stdout; writes nothing.
 *
 *   npx tsx scripts/nba/research/study-nba-v07-completed-seasons.mjs
 *
 * Sections:
 *   1. Play rate by state, each season and pooled, and the out-of-sample check of a multiplier against a direct cell rate.
 *   2. Under-full lift by role band, and the additive lift.
 *   3. Normalisation forms, fitted on one season and scored on the other.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitAdditiveLift, proportionalLiftSlope, qOfRow, seasonRows, sidesOf, stateTable } from "../../../src/lib/sports/nba/minutes-model-v07-fit.mjs";
import { STATES } from "../../../src/lib/sports/nba/minutes-model-v07-state.mjs";
import { boundedWaterFill, CONSTANTS } from "../../../src/lib/sports/nba/minutes-model-v07.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(HERE, "..", "..", "..", "..", "data", "internal", "research", "nba", "boxscores");
const docs = fs.readdirSync(DIR).filter((f) => /^\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
const P = { priorGames: CONSTANTS.PRIOR_GAMES.value, transferPriorGames: CONSTANTS.TRANSFER_PRIOR_GAMES.value };
const TOP = CONSTANTS.TOP_ROTATION_MINUTES.value;
const R = { 2025: seasonRows(docs, { season: 2025, ...P }), 2026: seasonRows(docs, { season: 2026, ...P }) };
const pooled = [...R[2025], ...R[2026]];
const mean = (f, xs) => (xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : NaN);
const y = (r) => (r.played ? 1 : 0);
const f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3), f4 = (x) => x.toFixed(4);

console.log("# v0.7 completed-season study. No 2026-27 game is read.\n");
console.log("## 1. Play rate by state (rows with a role)");
for (const [n, rows] of [["2024-25", R[2025]], ["2025-26", R[2026]], ["pooled", pooled]]) {
  const t = stateTable(rows);
  console.log(n, JSON.stringify(t.rates.ALL));
  if (n === "pooled") console.log("cells", JSON.stringify(t.cells.ALL));
}
console.log("\n### Multiplier on the base rate against a direct cell rate. Fit on one season, scored on the other, first 20 team games");
for (const [tr, te] of [[2025, 2026], [2026, 2025]]) {
  const t = stateTable(R[tr]);
  const mult = (r) => Math.min(1, r.base * (t.multipliers.ALL[r.state] ?? 1));
  const cell = qOfRow(t.rates.ALL);
  const test = R[te].filter((r) => r.k < 20);
  console.log(`fit ${tr} score ${te}: Brier multiplier ${f4(mean((r) => (mult(r) - y(r)) ** 2, test))}, cell ${f4(mean((r) => (cell(r) - y(r)) ** 2, test))}`);
  for (const s of [STATES.MISSED_1_COACH, STATES.MISSED_1_OTHER, STATES.MISSED_2PLUS_COACH, STATES.MISSED_2PLUS_OTHER, STATES.NO_APPEARANCE]) {
    const xs = test.filter((r) => r.state === s);
    console.log(`  ${s} n ${xs.length}: observed ${f3(mean(y, xs))}, mean q multiplier ${f3(mean(mult, xs))}, mean q cell ${f3(mean(cell, xs))}`);
  }
}

console.log("\n## 2. Under-full lift (the Out stand-in uses hindsight; see the fit module). Slope 1 = a correct uniform factor");
const q = qOfRow(stateTable(pooled).rates.ALL);
const bands = [[30, Infinity], [24, 30], [12, 24], [-Infinity, 12]];
for (const [n, rows] of [["2024-25", R[2025]], ["2025-26", R[2026]]]) {
  const S = sidesOf(rows, { q });
  console.log(n, `sides ${S.length}, under-full ${S.filter((s) => s.f > 1).length}:`, bands.map(([lo, hi]) => `[${lo}, ${hi}) ${JSON.stringify(proportionalLiftSlope(S, { lo, hi }))}`).join("  "));
}
const allSides = sidesOf(pooled, { q });
console.log("pooled additive lift by top line:", [26, 28, 30, 32, 34].map((t) => `${t}: ${fitAdditiveLift(allSides, { topRotationMinutes: t }).liftMinutes}`).join(", "));
console.log("frozen top line:", JSON.stringify(fitAdditiveLift(allSides, { topRotationMinutes: TOP })));

console.log("\n## 3. Normalisation forms. Fit on one season, scored on the other. MAE/bias on played rows, first 20 team games");
const over = (ro, qs) => boundedWaterFill(ro.map((x) => x ** 1.25), qs, ro, 240).minutes;
for (const [tr, te] of [[2025, 2026], [2026, 2025]]) {
  const qq = qOfRow(stateTable(R[tr]).rates.ALL);
  const trainSides = sidesOf(R[tr], { q: qq });
  const L = fitAdditiveLift(trainSides, { topRotationMinutes: TOP }).liftMinutes;
  let xy = 0, xx = 0;
  for (const s of trainSides) { if (!(s.f > 1)) continue; for (const r of s.list) if (r.played && r.role < TOP) { const x = (s.f - 1) * r.role; xy += x * (r.minutes - r.role); xx += x * x; } }
  const share = xy / xx;
  const forms = {
    "no lift": (ro) => ro,
    "bounded lift to own mean + 1 SD, 41 ceiling (SD = 0.3 × role)": (ro, f, qs) => boundedWaterFill(ro, qs, ro.map((x) => Math.max(x, Math.min(41, 1.3 * x))), 240).minutes,
    [`proportional share ${f3(share)} under the top line`]: (ro, f) => ro.map((x) => (x < TOP ? Math.min(TOP, x + share * (f - 1) * x) : x)),
    [`additive ${L} under the top line`]: (ro, f) => ro.map((x) => (x < TOP ? Math.min(TOP, x + L * (f - 1)) : x)),
  };
  const test = sidesOf(R[te], { q: qq, firstTeamGames: 20 });
  for (const [n, fn] of Object.entries(forms)) {
    const acc = [];
    let un = 0;
    for (const s of test) {
      const ro = s.list.map((r) => r.role), qs = s.list.map(qq);
      const mm = s.S > 240 ? over(ro, qs) : fn(ro, s.f, qs);
      un += Math.max(0, 240 - mm.reduce((a, x, i) => a + x * qs[i], 0));
      s.list.forEach((r, i) => { if (r.played) acc.push({ e: mm[i] - r.minutes, role: r.role, st: r.starter }); });
    }
    const line = (xs) => `${f3(mean((x) => Math.abs(x.e), xs))}/${f2(mean((x) => x.e, xs))}`;
    console.log(`fit ${tr} score ${te}, ${n}: all ${line(acc)}; role ≥ 30 ${line(acc.filter((x) => x.role >= 30))}; role < 30 ${line(acc.filter((x) => x.role < 30))}; starters ${line(acc.filter((x) => x.st))}; bench ${line(acc.filter((x) => !x.st))}; unallocated ${f2(un / test.length)}`);
  }
}
