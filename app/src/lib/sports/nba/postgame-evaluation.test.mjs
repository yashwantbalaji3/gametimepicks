/**
 * NBA postgame evaluation — real 10-20 data, synthetic edge cases, wording rules, immutability, and the CLI's
 * dry-run / no-repo-write contract.
 * Run (from app/): npx tsx --test src/lib/sports/nba/postgame-evaluation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  buildPostgameEvaluation, postgameMarkdown, pairedBootstrap, GAME_STATE, MODEL_GAME_STATE, PLAYER_STATE, COMPARISON_STATE,
  PROMOTION_STATE, ROLE, MODELS, MIN_COMPARISON_N, HELD_EVENTS,
} from "./postgame-evaluation.mjs";
import { gradeForecastGame } from "./experimental-forecast.mjs";
import { validationMetrics } from "./grader-metrics.mjs";
import { DATE, synthGame, synthDoc, synthFinal, synthRecord, synthBox, deepFreeze } from "./__fixtures__/postgame-fixtures.mjs";
import { loadInputs } from "../../../../scripts/nba/nba-postgame-evaluation.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const CLI = path.join(APP, "scripts", "nba", "nba-postgame-evaluation.mjs");
const REAL_DATE = "2026-10-20";
const REAL_IDS = ["401909088", "401909089", "401909090"];
const BANNED = /\bbeats?\b|\boutperform/i;
const model = (r, id) => r.models.find((m) => m.id === id);

/* ───────────── real data: the committed 10-20 finals and frozen forecasts ───────────── */

test("real 10-20: three regular-season finals graded against the frozen pre-tip forecasts", () => {
  const inp = loadInputs(REAL_DATE);
  const r = buildPostgameEvaluation({ date: REAL_DATE, generatedAt: "2026-10-21T12:00:00Z", ...inp });
  assert.deepEqual(r.games.map((g) => g.providerEventId), REAL_IDS);
  assert.ok(r.games.every((g) => g.state === GAME_STATE.GRADED));
  // Official side = Elo's frozen side (all three HOME); actual winners from the finals record.
  assert.deepEqual(r.games.map((g) => [g.official.winnerSide, g.actual.winnerSide, g.officialResult]),
    [["HOME", "HOME", "MATCHED"], ["HOME", "AWAY", "MISSED"], ["HOME", "AWAY", "MISSED"]]);
  assert.deepEqual(r.summary.officialSide, { matched: 1, of: 3 });
  for (const g of r.games) {
    assert.ok(Date.parse(g.frozenAt) < Date.parse(g.tipUtc), `${g.providerEventId} frozen before tip`);
    for (const m of MODELS.filter((x) => x.family)) assert.equal(g.models[m.id].receipt, "OK", `${m.id} receipt verified`);
  }
  // Per-model winner scores (lower is better) — pinned from write-once inputs.
  assert.deepEqual(model(r, "elo").winner, { n: 3, brier: 0.3559, logLoss: 0.9382, head: "elo" });
  assert.deepEqual(model(r, "v0.1").winner, { n: 3, brier: 0.1584, logLoss: 0.5043, head: "sim" });
  assert.deepEqual(model(r, "v1").winner, { n: 3, brier: 0.3355, logLoss: 0.8839, head: "sim" });
  assert.equal(model(r, "possession-sim-v0").state, "NO_COMMITTED_FORECAST");
  // The numbers are grader-metrics' own: re-derive Elo from gradeForecastGame + validationMetrics directly.
  const fin = inp.finalsRecord.finals;
  const direct = validationMetrics(inp.forecasts["v0.1"].games.map((g) => {
    const f = fin.find((x) => x.providerEventId === g.providerEventId);
    return gradeForecastGame(g, { ftHome: f.ftHome, ftAway: f.ftAway }, null);
  }));
  assert.equal(direct.winner.elo.brier, model(r, "elo").winner.brier);
  assert.equal(direct.winner.elo.logLoss, model(r, "elo").winner.logLoss);
  assert.equal(direct.winner.sim.logLoss, model(r, "v0.1").winner.logLoss);
  // n = 3: no comparison, no ranking words.
  assert.equal(r.summary.sample.state, COMPARISON_STATE.INSUFFICIENT_SAMPLE);
  assert.match(r.summary.sample.text, /supports no model comparison/);
  assert.ok(r.comparisons.every((c) => c.state === COMPARISON_STATE.INSUFFICIENT_SAMPLE && c.logLoss === null));
  assert.doesNotMatch(JSON.stringify(r) + postgameMarkdown(r), BANNED);
  // Player families: PENDING_BOXSCORE for each game whose box score is not committed (slate-safe: a later commit grades it).
  for (const id of REAL_IDS) {
    const committed = inp.boxscoreOf(id) != null;
    const st = r.games.find((g) => g.providerEventId === id).models["v0.1"].players.state;
    assert.equal(st, committed ? PLAYER_STATE.GRADED : PLAYER_STATE.PENDING_BOXSCORE, id);
  }
  if (REAL_IDS.every((id) => inp.boxscoreOf(id) == null)) {
    const p = model(r, "v0.1").players;
    assert.equal(p.state, PLAYER_STATE.PENDING_BOXSCORE);
    assert.deepEqual(p.pendingGames, REAL_IDS);
    for (const f of Object.values(p.families)) { assert.equal(f.state, PLAYER_STATE.PENDING_BOXSCORE); assert.equal(f.n, null); assert.equal(f.mae, null); }
  }
  // Roles: Elo + v0.1 official, v1 supporting, the rest research only.
  assert.deepEqual(r.models.map((m) => [m.id, m.role]), [["elo", ROLE.OFFICIAL], ["v0.1", ROLE.OFFICIAL], ["v1", ROLE.SUPPORTING], ["v0.2", ROLE.RESEARCH_ONLY], ["v0", ROLE.RESEARCH_ONLY], ["possession-sim-v0", ROLE.RESEARCH_ONLY]]);
  assert.equal(r.promotion.decidedHere, false);
  // The committed promotion record (grader v2) is read: it holds no promotion or rollback.
  assert.equal(r.promotion.source, "data/internal/research/nba/promotion-record.json");
  assert.equal(r.promotion.state, PROMOTION_STATE.NO_PROMOTIONS_RECORDED);
  assert.deepEqual(r.promotion.violations, []);
});

test("withheld: no team score, margin or total number reaches the report", () => {
  const r = buildPostgameEvaluation({ date: REAL_DATE, ...loadInputs(REAL_DATE) });
  const s = JSON.stringify(r);
  for (const k of ["marginErr", "totalErr", "homeErr", "marginAbsErr", "totalAbsErr", "projectedScore", "intervals", "\"margin\":{", "\"total\":{"]) assert.ok(!s.includes(k), k);
  assert.match(r.withheld.teamScores, /^WITHHELD/);
  assert.match(r.withheld.margin, /^WITHHELD/);
  assert.match(r.withheld.total, /^WITHHELD/);
});

/* ───────────── synthetic ───────────── */

function slate(n, { pElo = 0.6, simFor = () => 0.55, v1For = null, homeWins = () => true, boxes = false } = {}) {
  const ids = Array.from({ length: n }, (_, i) => String(900000 + i));
  const games = (fam, pSimOf) => ids.map((id, i) => synthGame({ id, family: fam, pElo, pSim: pSimOf(i) }));
  const forecasts = { "v0.1": synthDoc("v0.1", games("v0.1", simFor)) };
  if (v1For) forecasts.v1 = synthDoc("v1", games("v1", v1For));
  const rec = synthRecord(ids.map((id, i) => synthFinal(id, { homeWins: homeWins(i) })));
  const box = boxes ? Object.fromEntries(ids.map((id) => [id, synthBox(id)])) : {};
  return { date: DATE, forecasts, finalsRecord: rec, boxscoreOf: (id) => box[id] ?? null };
}

test("n-caveat: fewer than 30 graded games → no comparison; at 30, an interval and a direction only when it excludes 0", () => {
  const small = buildPostgameEvaluation(slate(3, { v1For: () => 0.9 }));
  assert.equal(small.summary.sample.state, COMPARISON_STATE.INSUFFICIENT_SAMPLE);
  assert.match(small.summary.sample.text, /3 graded games: the sample supports no model comparison \(fewer than 30\)/);
  assert.ok(small.comparisons.every((c) => c.state === COMPARISON_STATE.INSUFFICIENT_SAMPLE));

  const just = buildPostgameEvaluation(slate(MIN_COMPARISON_N - 1, { v1For: () => 0.9 }));
  assert.equal(just.comparisons.find((c) => c.model === "v1").state, COMPARISON_STATE.INSUFFICIENT_SAMPLE);

  // 30 games, home always wins: v1 at 0.9 has lower loss than Elo at 0.6 in every game → interval excludes 0.
  const big = buildPostgameEvaluation(slate(MIN_COMPARISON_N, { v1For: () => 0.9 }));
  const c = big.comparisons.find((x) => x.model === "v1");
  assert.equal(c.state, COMPARISON_STATE.COMPUTED);
  assert.equal(c.n, 30);
  assert.equal(c.logLoss.direction, "MODEL_LOWER");
  assert.ok(c.logLoss.ci95[1] < 0);
  assert.match(c.text, /lower for v1 coherent simulation \(95% interval .* excludes 0\)/);

  // Mixed outcomes with equal-and-opposite errors: the interval includes 0 → "not established", no direction.
  const mixed = buildPostgameEvaluation(slate(40, { v1For: (i) => (i % 2 ? 0.75 : 0.45), homeWins: (i) => i % 2 === 0 }));
  const m = mixed.comparisons.find((x) => x.model === "v1");
  assert.equal(m.state, COMPARISON_STATE.COMPUTED);
  for (const k of ["logLoss", "brier"]) if (m[k].direction === "NOT_ESTABLISHED") assert.ok(m[k].ci95[0] <= 0 && m[k].ci95[1] >= 0);
  for (const r of [small, just, big, mixed]) assert.doesNotMatch(JSON.stringify(r) + postgameMarkdown(r), BANNED);
});

test("pairedBootstrap: deterministic, no interval below 2 values", () => {
  assert.deepEqual(pairedBootstrap([0.1, -0.2, 0.05, 0.3]), pairedBootstrap([0.1, -0.2, 0.05, 0.3]));
  assert.equal(pairedBootstrap([0.1]).lo, null);
});

test("HELD: 401901822 and any final under review are excluded with an explicit HELD reason", () => {
  const ids = ["401901822", "900001", "900002"];
  const forecasts = { "v0.1": synthDoc("v0.1", ids.map((id) => synthGame({ id }))) };
  const rec = synthRecord(ids.map((id) => synthFinal(id)), [{ providerEventId: "900002", recorded: {}, observed: {}, note: "review" }]);
  const r = buildPostgameEvaluation({ date: DATE, forecasts, finalsRecord: rec });
  const held = r.games.filter((g) => g.state === GAME_STATE.HELD);
  assert.deepEqual(held.map((g) => g.providerEventId).sort(), ["401901822", "900002"]);
  assert.equal(held.find((g) => g.providerEventId === "401901822").reason, HELD_EVENTS["401901822"]);
  assert.ok(held.every((g) => /^HELD/.test(g.reason) && g.actual === null && Object.values(g.models).every((m) => m.state === MODEL_GAME_STATE.NOT_GRADED)));
  assert.equal(r.summary.held, 2);
  assert.equal(r.summary.graded, 1);
  assert.equal(model(r, "elo").winner.n, 1);
});

test("PENDING_BOXSCORE: never zero, never dropped; partial and full grading use grader-metrics' families", () => {
  const ids = ["900001", "900002"];
  const forecasts = { "v0.1": synthDoc("v0.1", ids.map((id) => synthGame({ id }))) };
  const rec = synthRecord(ids.map((id) => synthFinal(id)));
  const none = buildPostgameEvaluation({ date: DATE, forecasts, finalsRecord: rec });
  const p0 = model(none, "v0.1").players;
  assert.equal(p0.state, PLAYER_STATE.PENDING_BOXSCORE);
  assert.deepEqual(p0.pendingGames, ids);
  for (const f of Object.values(p0.families)) assert.deepEqual([f.state, f.n, f.mae, f.coverage80], [PLAYER_STATE.PENDING_BOXSCORE, null, null, null]);
  assert.equal(model(none, "elo").players.state, PLAYER_STATE.NOT_APPLICABLE);

  const one = buildPostgameEvaluation({ date: DATE, forecasts, finalsRecord: rec, boxscoreOf: (id) => (id === "900001" ? synthBox(id) : null) });
  const p1 = model(one, "v0.1").players;
  assert.equal(p1.state, PLAYER_STATE.PARTIAL);
  assert.deepEqual(p1.pendingGames, ["900002"]);
  assert.equal(p1.families.pts.n, 2);
  assert.equal(p1.families.pts.mae, 4.5); // |18 − 21| and |18 − 12| → mean 4.5 (grader-metrics unconditional MAE)
  assert.equal(p1.families.pts.coverage80, 0.5);
  assert.equal(one.games[1].models["v0.1"].players.state, PLAYER_STATE.PENDING_BOXSCORE);

  // A box score that is not final is pending, not graded.
  const notFinal = buildPostgameEvaluation({ date: DATE, forecasts, finalsRecord: rec, boxscoreOf: (id) => synthBox(id, { status: "STATUS_IN_PROGRESS" }) });
  assert.equal(model(notFinal, "v0.1").players.state, PLAYER_STATE.PENDING_BOXSCORE);
  assert.match(notFinal.games[0].models["v0.1"].players.reason, /not final/);

  const all = buildPostgameEvaluation({ date: DATE, forecasts, finalsRecord: rec, boxscoreOf: (id) => synthBox(id) });
  assert.equal(model(all, "v0.1").players.state, PLAYER_STATE.GRADED);
  assert.equal(model(all, "v0.1").players.families.pts.n, 4);
});

test("frozen-after-tip refusal: an official forecast frozen at/after tip is REFUSED and scores nothing", () => {
  const tip = `${DATE}T23:00Z`;
  const ids = ["900001", "900002", "900003"];
  const v01 = ids.map((id, i) => synthGame({ id, tip, frozenAt: i === 0 ? `${DATE}T23:00:00Z` : null }));
  // v1 frozen after the ACTUAL start, which the finals record shows 20 minutes earlier than the receipt tip.
  const v1 = ids.map((id, i) => synthGame({ id, tip, family: "v1", frozenAt: i === 1 ? `${DATE}T22:50:00Z` : null }));
  const rec = synthRecord(ids.map((id, i) => synthFinal(id, { dateUtc: i === 1 ? `${DATE}T22:40Z` : tip })));
  const r = buildPostgameEvaluation({ date: DATE, forecasts: { "v0.1": synthDoc("v0.1", v01), v1: synthDoc("v1", v1) }, finalsRecord: rec });
  assert.equal(r.games[0].state, GAME_STATE.REFUSED_FROZEN_AFTER_TIP);
  assert.match(r.games[0].reason, /not before tip/);
  assert.equal(r.games[0].models.elo.state, MODEL_GAME_STATE.FROZEN_AFTER_TIP);
  assert.equal(r.games[1].models.v1.state, MODEL_GAME_STATE.FROZEN_AFTER_TIP);
  assert.equal(r.games[1].models.v1.tipUtc, `${DATE}T22:40Z`);
  assert.equal(model(r, "elo").winner.n, 2);
  assert.equal(model(r, "v1").winner.n, 2);
  // v1's own 900001 forecast was frozen in time, so it is scored; the paired comparison still needs both graded.
  assert.deepEqual(model(r, "v1").refused.map((x) => x.providerEventId), ["900002"]);
  assert.deepEqual(model(r, "elo").refused.map((x) => x.providerEventId), ["900001"]);
  assert.equal(r.comparisons.find((c) => c.model === "v1").n, 1);
  assert.equal(r.summary.refusedFrozenAfterTip, 1);
  // A broken receipt (checked by the CLI with node:crypto) is refused as well.
  const broken = buildPostgameEvaluation({ date: DATE, forecasts: { "v0.1": synthDoc("v0.1", [synthGame({ id: "900009" })]) }, finalsRecord: synthRecord([synthFinal("900009")]), receiptStates: { "v0.1": { "900009": "BROKEN" } } });
  assert.equal(broken.games[0].state, GAME_STATE.REFUSED_RECEIPT);
});

test("pending final and identity mismatch are explicit states", () => {
  const forecasts = { "v0.1": synthDoc("v0.1", [synthGame({ id: "900001" }), synthGame({ id: "900002" })]) };
  const swapped = synthFinal("900002", { home: { abbr: "BOS", providerTeamId: "2" }, away: { abbr: "DET", providerTeamId: "8" } });
  const r = buildPostgameEvaluation({ date: DATE, forecasts, finalsRecord: synthRecord([swapped]) });
  assert.equal(r.games[0].state, GAME_STATE.PENDING_FINAL);
  assert.equal(r.games[1].state, GAME_STATE.REFUSED_IDENTITY);
  assert.equal(r.summary.graded, 0);
  assert.equal(model(r, "elo").winner.n, 0);
  assert.equal(model(r, "elo").winner.brier, null);
});

test("a family document in the wrong slot is refused, not graded", () => {
  const r = buildPostgameEvaluation({ date: DATE, forecasts: { "v0.1": synthDoc("v1", [synthGame({ id: "900001", family: "v1" })]) }, finalsRecord: synthRecord([synthFinal("900001")]) });
  assert.equal(r.inputs.forecasts["v0.1"].state, "REFUSED");
  assert.equal(r.games.length, 0);
});

test("immutability: frozen inputs are untouched, the report is deep-frozen and deterministic", () => {
  const inp = slate(4, { v1For: () => 0.7, boxes: true });
  const before = JSON.stringify(inp);
  deepFreeze(inp.forecasts); deepFreeze(inp.finalsRecord);
  const a = buildPostgameEvaluation({ ...inp, generatedAt: "2026-11-03T12:00:00Z" });
  const b = buildPostgameEvaluation({ ...inp, generatedAt: "2026-11-03T12:00:00Z" });
  assert.equal(JSON.stringify(inp), before);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const frozenDeep = (o) => !o || typeof o !== "object" || (Object.isFrozen(o) && Object.values(o).every(frozenDeep));
  assert.ok(frozenDeep(a));
  assert.throws(() => { "use strict"; a.games[0].state = "X"; });
});

test("promotion: read from the record, never decided — a recorded promotion does not change roles here", () => {
  const base = slate(2);
  assert.equal(buildPostgameEvaluation(base).promotion.state, PROMOTION_STATE.NO_RECORD_COMMITTED);
  const empty = { artifact: "nba-promotion-record", records: [] };
  assert.equal(buildPostgameEvaluation({ ...base, promotionRecord: empty }).promotion.state, PROMOTION_STATE.NO_PROMOTIONS_RECORDED);
  const rec = { artifact: "nba-promotion-record", records: [{ seq: 1, kind: "PROMOTION", family: "v1", market: "winner", date: DATE, approver: "synthetic human" }] };
  const r = buildPostgameEvaluation({ ...base, promotionRecord: rec });
  assert.equal(r.promotion.state, PROMOTION_STATE.RECORDED);
  assert.equal(r.promotion.decidedHere, false);
  // The owner's guard flags this synthetic record (no evaluator evidence, no metrics) — reported, not acted on.
  assert.ok(r.promotion.violations.length > 0);
  assert.equal(model(r, "v1").role, ROLE.SUPPORTING);
  assert.equal(buildPostgameEvaluation({ ...base, promotionRecord: { records: [] } }).promotion.state, PROMOTION_STATE.UNRECOGNISED_RECORD);
});

/* ───────────── CLI ───────────── */

const gitData = () => spawnSync("git", ["status", "--porcelain", "--", "data", "app/public/data"], { cwd: REPO, encoding: "utf8" }).stdout;

test("CLI: dry run prints JSON + Markdown, writes no repo data, refuses --out inside data, writes only --out", () => {
  const before = gitData();
  const dry = spawnSync(process.execPath, [CLI, "--date", REAL_DATE, "--now", "2026-10-21T12:00:00Z"], { cwd: APP, encoding: "utf8" });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /"schema": "nba-postgame-evaluation@1"/);
  assert.match(dry.stdout, /# NBA postgame evaluation · 2026-10-20/);
  assert.match(dry.stderr, /dry run — nothing written/);
  const refused = spawnSync(process.execPath, [CLI, "--date", REAL_DATE, "--out", path.join(REPO, "data", "internal", "x.json")], { cwd: APP, encoding: "utf8" });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /REFUSED: --out/);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nba-postgame-"));
  const out = path.join(tmp, "r.json");
  const wrote = spawnSync(process.execPath, [CLI, "--date", REAL_DATE, "--now", "2026-10-21T12:00:00Z", "--out", out], { cwd: APP, encoding: "utf8" });
  assert.equal(wrote.status, 0, wrote.stderr);
  assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).date, REAL_DATE);
  assert.equal(spawnSync(process.execPath, [CLI], { cwd: APP, encoding: "utf8" }).status, 1);
  assert.equal(gitData(), before);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("CLI and module make no network call", () => {
  for (const f of [CLI, path.join(APP, "src", "lib", "sports", "nba", "postgame-evaluation.mjs")]) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /\bfetch\s*\(|https?:\/\/|node:https?|node:net/, f);
  }
});
