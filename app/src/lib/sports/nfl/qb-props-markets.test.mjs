/**
 * NFL QB props · markets, statuses and the per-slate dashboard (qb-props-markets.mjs). Synthetic inputs only.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/qb-props-markets.test.mjs
 */
import test from "node:test";
import { APPROVED_PREREG_SHA256 } from "./qb-props-grade.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MARKET_STATUS, QB_CHALLENGERS, QB_MARKETS, QB_MARKET_STATUS, buildDashboard, mayFeedOfficialPicks, qbHistory, qbMarketViews } from "./qb-props-markets.mjs";
import { QB_FAMILIES } from "./qb-props-grade.mjs";

test("three distinct statuses; only VALIDATED_OFFICIAL may feed official picks; every market is FORWARD_EVALUATION (prereg v1.3 approved), none VALIDATED_OFFICIAL", () => {
  assert.deepEqual(Object.values(MARKET_STATUS), ["IMPLEMENTED_EXPERIMENTAL", "FORWARD_EVALUATION", "VALIDATED_OFFICIAL"]);
  assert.deepEqual(Object.values(MARKET_STATUS).map(mayFeedOfficialPicks), [false, false, true]);
  assert.deepEqual(Object.keys(QB_MARKET_STATUS), QB_FAMILIES.map((f) => f.family).sort((a, b) => ["passTd", "passYds", "passCmp", "passAtt", "passInt"].indexOf(a) - ["passTd", "passYds", "passCmp", "passAtt", "passInt"].indexOf(b)));
  for (const s of Object.values(QB_MARKET_STATUS)) { assert.equal(s, MARKET_STATUS.FORWARD_EVALUATION); assert.equal(mayFeedOfficialPicks(s), false); }
  assert.ok(Object.isFrozen(QB_MARKET_STATUS));
});

test("no official-pick code reads the QB props modules (only the research section and the grader do)", () => {
  const hits = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(mjs|ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && /qb-props-(markets|grade|scores)/.test(fs.readFileSync(p, "utf8"))) hits.push(path.relative(process.cwd(), p)); } };
  walk(path.join(process.cwd(), "src"));
  assert.deepEqual(hits.sort(), ["src/components/nfl/qb-props-line.tsx", "src/lib/sports/nfl/qb-props-grade.mjs", "src/lib/sports/nfl/qb-props-history-file.mjs", "src/lib/sports/nfl/qb-props-inputs.mjs", "src/lib/sports/nfl/qb-props-markets.mjs", "src/lib/sports/nfl/qb-props-scores.mjs", "src/lib/sports/nfl/rush-rec-grade.mjs"]);
});

test("five markets from one receipt row: exact run counts give the range and exact chances; without them no chance is invented", () => {
  assert.deepEqual(QB_MARKETS.map((m) => m.market), ["passTd", "passYds", "passCmp", "passAtt", "passInt"]);
  const row = { stats: { passYds: { p10: 1, p50: 2, p90: 3 } }, exactCounts: { passYds: { 190: 2, 230: 5, 260: 3 }, cmp: { 20: 5, 24: 5 }, passAtt: { 30: 5, 34: 5 }, passTd: { 0: 2, 1: 4, 2: 4 }, int: { 0: 7, 1: 3 } } };
  const v = Object.fromEntries(qbMarketViews(row).map((x) => [x.market, x]));
  assert.deepEqual(v.passYds.distribution, { p10: 190, p50: 230, p90: 260, source: "exact run counts" });
  assert.deepEqual(v.passYds.chances, [{ atLeast: 200, p: 0.8 }, { atLeast: 225, p: 0.8 }, { atLeast: 250, p: 0.3 }]);
  assert.deepEqual(v.passTd.chances, [{ atLeast: 1, p: 0.8 }, { atLeast: 2, p: 0.4 }, { atLeast: 3, p: 0 }]);
  assert.deepEqual(v.passInt.chances, [{ atLeast: 1, p: 0.3 }, { atLeast: 2, p: 0 }]);
  assert.deepEqual(v.passCmp.chances, [], "no line is manufactured for completions or attempts");
  const bare = Object.fromEntries(qbMarketViews({ stats: { passYds: { p10: 150, p50: 220, p90: 290 } } }).map((x) => [x.market, x]));
  assert.equal(bare.passYds.chances, null, "quantiles only ⇒ no chance");
  assert.equal(bare.passYds.distribution.source, "receipt quantiles");
  assert.equal(bare.passTd.distribution, null);
});

test("history: actual previous games played strictly before kickoff, most recent first, at most 8", () => {
  const games = Array.from({ length: 12 }, (_, i) => ({ season: 2026, week: i + 1, dateUtc: `2026-09-${String(1 + 2 * i).padStart(2, "0")}T17:00Z`, home: { abbr: "AAA" }, away: { abbr: "BBB" }, players: [{ playerId: "Q", teamAbbr: "AAA", passAtt: i === 3 ? 0 : 30, passCmp: 20, passYds: 100 + i, passTd: 1, passInt: 0 }] }));
  const h = qbHistory(games, "Q", "2026-09-21T17:00Z");
  assert.deepEqual(h.map((x) => x.week), [10, 9, 8, 7, 6, 5, 3, 2], "the game at kickoff (wk 11) and the 0-attempt game (wk 4) are excluded");
  assert.equal(h[0].opponent, "BBB");
});

test("dashboard: status, forward rows, empty challenger slot; the lock follows the gate", () => {
  const counts = { total: { passTd: 4, passYds: 4, passCmp: 4, passAtt: 4, passInt: 4 }, withModelDistribution: { passTd: 1, passYds: 1, passCmp: 1, passAtt: 1, passInt: 1 }, byKickoffDate: { "2026-11-16": { passTd: 4, passYds: 4, passCmp: 4, passAtt: 4, passInt: 4 } } };
  const conf = { n: 4, games: 2, pairedN: 3, progress: "3/300", lookTaken: false, verdict: null, model: { cov80: 0.5 } };
  const ledger = (sha) => ({ inputs: { preregSha256: sha }, confirmatory: Object.fromEntries(["passTd", "passYds", "passCmp", "passAtt", "passInt"].map((m) => [m, conf])) });
  assert.match(buildDashboard({ counts, incumbent: { engine: "e" } }).grading, /^LOCKED/, "no ledger ⇒ locked");
  const open = buildDashboard({ counts, ledger: ledger(APPROVED_PREREG_SHA256[0]), incumbent: { engine: "e" } });
  assert.equal(open.grading, `APPROVED — pre-registration sha256 ${APPROVED_PREREG_SHA256[0]}, approved 2026-11-10T18:55:07Z`);
  assert.deepEqual(open.markets.passInt.confirmatory, { n: 4, games: 2, pairedN: 3, progress: "3/300", lookTaken: false, verdict: null }, "single-look state only; no metric copied");
  const d = buildDashboard({ counts, ledger: ledger("not-approved"), incumbent: { engine: "e" } });
  assert.match(d.grading, /^LOCKED/);
  assert.deepEqual(d.challengers, []);
  assert.equal(QB_CHALLENGERS.length, 0);
  assert.deepEqual(d.markets.passInt, { label: "Interceptions", status: "FORWARD_EVALUATION", mayFeedOfficialPicks: false, forwardRows: 4, withModelDistribution: 1, byKickoffDate: { "2026-11-16": 4 } });
  assert.doesNotMatch(JSON.stringify(d), /"confirmatory"|"(mae|bias|cov80|logLoss|actual|ece)"/, "nothing graded leaks while locked");
});
