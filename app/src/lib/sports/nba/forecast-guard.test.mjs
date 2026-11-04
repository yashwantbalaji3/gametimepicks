/**
 * NBA forecast guard — the RULES (forecast-guard.mjs). Synthetic rows for every rule edge, plus one replay of the
 * committed 2026-11-02 lane against the committed box scores captured before that lane froze (an immutable input set:
 * the guard only reads files captured at or before the lane's generatedAt).
 * Run (from app/): npx tsx --test src/lib/sports/nba/forecast-guard.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  GUARD, READINESS, ROTATION_SIZE, REVIEW_FLAGS, guardReasons, assessPlayer, playerGuard, favouredAvailability, seasonHistory,
  selectSeasonBoxscores, buildForecastGuard, guardSummary, FORECAST_GUARD_SCHEMA, UNDER_REVIEW_TEXT,
} from "./forecast-guard.mjs";
import { readBoxscoreDocs } from "./forecast-guard-build.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");

// ── the constants ARE the betting engine's and the social pack's (nba-guard.mjs @ b5d9e26adc; nba-unified-roster.mjs) ──
test("constants equal the engine's nba-guard.mjs and the social pack's guard (single owner from here on)", () => {
  assert.deepEqual({ ...GUARD }, { minGames: 3, hardMinutes: 42, band: 4 });
  assert.deepEqual({ ...READINESS }, { cap: 48, blockGap: 14.3, review: 41, reviewGap: 8.4, minGames: 3, statShare: 0.25, statFloor: 3 });
  assert.equal(ROTATION_SIZE, 5);
  assert.deepEqual([...REVIEW_FLAGS], ["FAVOURED_ROTATION_OUT", "FAVOURED_ROTATION_R1"]);
  assert.equal(UNDER_REVIEW_TEXT, "Projection under model review");
});

const row = (o = {}) => ({ mu: 30, n: 5, cur: 30, minLo: 26, minHi: 34, ...o });

test("R1: Out / Day-To-Day / Doubtful / Inactive / Suspended at freeze withhold; Questionable and Probable do not", () => {
  for (const s of ["Out", "Day-To-Day", "Doubtful", "Inactive", "Suspension", "Injured Reserve"]) assert.ok(guardReasons(row(), s).includes("R1"), s);
  for (const s of [null, "", "Questionable", "Probable"]) assert.ok(!guardReasons(row(), s).includes("R1"), String(s));
});

test("R2: fewer than 3 played 2026-27 games withholds; exactly 3 does not", () => {
  assert.ok(guardReasons(row({ n: 2 }), null).includes("R2"));
  assert.ok(guardReasons(row({ n: 0, minLo: null, minHi: null }), null).includes("R2"));
  assert.ok(!guardReasons(row({ n: 3 }), null).includes("R2"));
});

test("R3: over 42 expected minutes, or more than 4 outside own [min, max]; the band edges pass", () => {
  assert.ok(guardReasons(row({ mu: 42.1, minHi: 44 }), null).includes("R3"));
  assert.ok(!guardReasons(row({ mu: 42, minHi: 44 }), null).includes("R3"));
  assert.ok(guardReasons(row({ mu: 32.5, minLo: 2, minHi: 5 }), null).includes("R3"), "Cody Williams shape");
  assert.ok(!guardReasons(row({ mu: 38, minHi: 34 }), null).includes("R3"), "max + 4 is inside");
  assert.ok(guardReasons(row({ mu: 38.1, minHi: 34 }), null).includes("R3"));
  assert.ok(!guardReasons(row({ mu: 22, minLo: 26 }), null).includes("R3"), "min − 4 is inside");
  assert.ok(guardReasons(row({ mu: 21.9, minLo: 26 }), null).includes("R3"));
});

test("readiness: blocks, reviews and the per-cell R_STAT rule", () => {
  const base = { mu: 30, n: 5, cur: 30, teamGames: 5, missedLast: false, missedTwo: false, injured: false, medians: { pts: 10, reb: 5, ast: 3 }, recent: { pts: 10, reb: 5, ast: 3 }, lines: null };
  assert.equal(assessPlayer(base).state, "PASS");
  assert.deepEqual(assessPlayer({ ...base, mu: 48, cur: 40 }).reasons.filter((x) => x.startsWith("B_")), ["B_CAP"]);
  assert.ok(assessPlayer({ ...base, mu: 44.4 }).reasons.includes("B_GAP"));
  assert.ok(assessPlayer({ ...base, missedTwo: true }).reasons.includes("B_ELIG"));
  assert.ok(assessPlayer({ ...base, n: 0, recent: null }).reasons.includes("B_ELIG"));
  assert.ok(assessPlayer({ ...base, mu: 41 }).reasons.includes("R_41"));
  assert.ok(assessPlayer({ ...base, mu: 38.5 }).reasons.includes("R_GAP"));
  assert.ok(assessPlayer({ ...base, n: 2 }).reasons.includes("R_THIN"));
  assert.ok(assessPlayer({ ...base, teamGames: 2 }).reasons.includes("R_NO_CURRENT"));
  assert.ok(assessPlayer({ ...base, missedLast: true }).reasons.includes("R_MISSED_1"));
  assert.deepEqual(assessPlayer({ ...base, injured: true }).reasons, ["R_INJ"]);
  // R_STAT: ≥ 3 apart AND ≥ 25 % of the season average, per cell
  const c = assessPlayer({ ...base, medians: { pts: 14, reb: 7, ast: 3 }, recent: { pts: 10, reb: 5, ast: 3 } }).cells;
  assert.deepEqual(c.pts.reasons, ["R_STAT"]);
  assert.deepEqual(c.reb.reasons, [], "2 apart is under the floor");
  assert.deepEqual(c.ast.reasons, []);
});

// box-score fixtures: team A (id 1) and team B (id 2); `mins` per athlete per game
const box = (id, day, mins, { capturedAt = `${day}T15:00:00Z`, phase = 2 } = {}) => ({
  providerEventId: String(id), phase, status: "STATUS_FINAL", boxscoreAvailable: true, dateUtc: `${day}T23:30Z`, capturedAt,
  teams: [{ providerTeamId: "1", abbr: "AAA" }, { providerTeamId: "2", abbr: "BBB" }],
  players: Object.entries(mins).map(([pid, m]) => ({ providerAthleteId: pid, providerTeamId: pid.startsWith("a") ? "1" : "2", didNotPlay: m == null, minutes: m ?? 0, pts: 10, reb: 4, ast: 3 })),
});

test("box-score selection: regular season, final, ET date before the slate, captured at or before the lane froze", () => {
  const docs = [box(1, "2026-10-30", {}), box(2, "2026-10-31", {}, { capturedAt: "2026-11-02T06:30:00Z" }), box(3, "2026-10-29", {}, { phase: 1 }), box(4, "2026-11-01", {})];
  const sel = selectSeasonBoxscores(docs, { date: "2026-11-02", asOf: "2026-11-02T06:00:00Z" });
  assert.deepEqual(sel.map((d) => d.providerEventId), ["1", "4"], "preseason and a capture after the freeze are not inputs");
  assert.deepEqual(selectSeasonBoxscores(docs, { date: "2026-11-01", asOf: "2026-11-02T06:00:00Z" }).map((d) => d.providerEventId), ["1"], "same-day or later games are not inputs");
});

test("playerGuard: blocked / review / pass, and a malformed row is blocked", () => {
  const hist = seasonHistory([box(1, "2026-10-28", { a1: 30, a2: 3 }), box(2, "2026-10-29", { a1: 31, a2: 4 }), box(3, "2026-10-30", { a1: 29, a2: 2 })]).AAA;
  const p = (id, mu, extra = {}) => ({ providerAthleteId: id, expectedMinutes: mu, injuryStatus: null, medians: { pts: 10, reb: 4, ast: 3 }, ...extra });
  assert.equal(playerGuard(p("a1", 30), hist).state, "pass");
  const cody = playerGuard(p("a2", 32.5), hist);
  assert.equal(cody.state, "blocked");
  assert.ok(cody.rules.includes("R3") && cody.rules.includes("B_GAP"));
  assert.equal(playerGuard(p("a1", 30, { injuryStatus: "Day-To-Day" }), hist).state, "blocked");
  assert.equal(playerGuard(p("a1", 30, { injuryStatus: "Questionable" }), hist).state, "review", "R_INJ only");
  assert.equal(playerGuard(p("a9", 20), hist).state, "blocked", "never played for this team");
  assert.ok(playerGuard(p("a1", NaN), hist).rules.includes("SUSPICIOUS_PROJECTION"));
});

test("favoured rotation: the SEASON's top-5 by minutes, Out or not; a rotation player Out or Day-To-Day flags the side", () => {
  const hist = seasonHistory([box(1, "2026-10-28", { a1: 36, a2: 34, a3: 32, a4: 30, a5: 28, a6: 10 })]).AAA;
  const game = { players: { home: [{ providerAthleteId: "a2", injuryStatus: "Day-To-Day", expectedMinutes: 30 }], unavailable: { home: [{ providerAthleteId: "a1", name: "Star", reason: "RULED_OUT", status: "Out" }] } } };
  const a = favouredAvailability(game, "home", hist);
  assert.deepEqual(a.flags, ["FAVOURED_ROTATION_OUT", "FAVOURED_ROTATION_R1"]);
  assert.deepEqual(a.rotation.map((r) => r.playerId), ["a1", "a2", "a3", "a4", "a5"]);
  const none = favouredAvailability({ players: { home: [], unavailable: { home: [{ providerAthleteId: "a6", reason: "RULED_OUT" }] } } }, "home", hist);
  assert.deepEqual(none.flags, [], "a bench player out is not a rotation flag");
  assert.deepEqual(favouredAvailability({ players: { home: [] } }, "home", null).flags, ["ROTATION_FROM_LANE"]);
});

test("buildForecastGuard is a pure function of its inputs (no wall clock) and covers every published row", () => {
  const lane = { date: "2026-11-02", generatedAt: "2026-11-02T06:00:00Z", games: [{ providerEventId: "9", receipt: { payloadSha256: "x" }, home: { abbr: "AAA" }, away: { abbr: "BBB" }, elo: { state: "FAVOURED", favoured: "AAA" },
    players: { home: [{ providerAthleteId: "a1", expectedMinutes: 30, injuryStatus: null, medians: { pts: 10, reb: 4, ast: 3 } }], away: [{ providerAthleteId: "b1", expectedMinutes: 30, injuryStatus: null, medians: { pts: 10, reb: 4, ast: 3 } }] } }] };
  const docs = [box(1, "2026-10-28", { a1: 30, b1: 30 }), box(2, "2026-10-29", { a1: 30, b1: 30 }), box(3, "2026-10-30", { a1: 30, b1: 30 })];
  const a = buildForecastGuard({ lane, boxscores: docs });
  assert.equal(JSON.stringify(a), JSON.stringify(buildForecastGuard({ lane, boxscores: [...docs].reverse() })));
  assert.equal(a.schema, FORECAST_GUARD_SCHEMA);
  assert.equal(a.asOf, lane.generatedAt);
  assert.deepEqual(Object.keys(a.games[0].players).sort(), ["a1", "b1"]);
  assert.equal(guardSummary(a).pass, 2);
});

// ── replay: the committed 2026-11-02 lane (the audit's slate) ───────────────────────────────────────────────────────
test("2026-11-02 replay: Cody Williams and SGA are withheld; the genuine MIN players are not", () => {
  const lane = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nba/experimental-public/2026-11-02.json"), "utf8"));
  const doc = buildForecastGuard({ lane, boxscores: readBoxscoreDocs(REPO).docs });
  const by = new Map();
  for (const g of lane.games) for (const s of ["away", "home"]) for (const p of g.players[s]) by.set(p.name, doc.games.find((x) => x.providerEventId === g.providerEventId).players[p.providerAthleteId]);
  assert.equal(by.get("Cody Williams").state, "blocked");
  assert.ok(by.get("Cody Williams").rules.includes("R3"));
  assert.equal(by.get("Shai Gilgeous-Alexander").state, "blocked");
  assert.equal(by.get("Jonathan Kuminga").state, "pass");
  const s = guardSummary(doc);
  assert.equal(s.players, 296);
  // every committed box score this replay may read was captured before 2026-11-02T05:58:41Z, so the counts are frozen
  assert.deepEqual({ blocked: s.blocked, review: s.review, cellOnly: s.cellOnly, favouredReview: s.favouredReview }, { blocked: 115, review: 8, cellOnly: 57, favouredReview: 8 });
});

// ── the builder (scripts/nba/build-nba-forecast-guard.mjs, the same function the lane publish step calls) ──────────
test("builder: plain node (no tsx), deterministic bytes, write-once (a differing file is refused, never rewritten)", async () => {
  const { spawnSync } = await import("node:child_process");
  const os = await import("node:os");
  const { buildGuardFromRepo } = await import("./forecast-guard-build.mjs");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "fguard-build-"));
  const run = () => spawnSync(process.execPath, ["scripts/nba/build-nba-forecast-guard.mjs", "--date", "2026-11-02", "--write", "--out", out], { cwd: APP, encoding: "utf8" });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /guard=WROTE\n$/);
  const lane = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nba/experimental-public/2026-11-02.json"), "utf8"));
  const text = fs.readFileSync(path.join(out, "2026-11-02.json"), "utf8");
  assert.equal(text, `${JSON.stringify(buildGuardFromRepo(REPO, lane), null, 1)}\n`, "the publish step and the script write the same bytes");
  assert.match(run().stdout, /guard=NOOP\n$/);
  fs.writeFileSync(path.join(out, "2026-11-02.json"), text.replace("2026-11-02T05:58:41Z", "2026-11-02T05:58:42Z"));
  const third = run();
  assert.equal(third.status, 1);
  assert.match(third.stdout, /guard=REFUSED\n$/);
});

test("pages never read box scores: the page-side guard read names no internal path", () => {
  const code = fs.readFileSync(path.join(APP, "src/lib/sports/nba/forecast-guard-files.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /data\/internal|forecast-guard-build|boxscore/i);
});

test("content digest: the builder's document verifies; any edit, a missing digest or another schema does not", async () => {
  const { buildGuardFromRepo } = await import("./forecast-guard-build.mjs");
  const { verifyGuardDoc } = await import("./forecast-guard-files.mjs");
  const lane = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nba/experimental-public/2026-11-02.json"), "utf8"));
  const doc = JSON.parse(JSON.stringify(buildGuardFromRepo(REPO, lane)));
  assert.deepEqual(verifyGuardDoc(doc), []);
  const g = doc.games[0]; const id = Object.keys(g.players)[0];
  const edited = JSON.parse(JSON.stringify(doc)); edited.games[0].players[id].state = edited.games[0].players[id].state === "pass" ? "blocked" : "pass";
  assert.deepEqual(verifyGuardDoc(edited), ["digest does not match the content"]);
  const { digest, ...bare } = doc; void digest;
  assert.deepEqual(verifyGuardDoc(bare), ["no digest"]);
  assert.ok(verifyGuardDoc({ ...doc, schema: "x" }).length > 0);
});
