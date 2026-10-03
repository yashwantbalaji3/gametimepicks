/**
 * NBA forecast receipts — write-once, pre-tip, with provenance (Session 10 · G2 / G4 / G7).
 *
 * Every fixture here is synthetic: no test depends on what the schedule or the committed artifacts say today.
 * The last test reads the committed forecast files only to check they satisfy their own receipts.
 *
 * Run: cd app && npx tsx --test src/lib/sports/nba/forecast-receipt.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  canonicalJson, gamePayloadHash, stampReceipt, receiptIntegrity, planRun, mergeForecastArtifact,
  frozenGameViolations, injurySnapshotProvenance, owedForecastDates, RUN_OUTCOME, INPUT_STATE, INJURY_SNAPSHOT_MAX_AGE_HOURS,
} from "./forecast-receipt.mjs";
import { etDateOf, FAMILIES } from "./experimental-forecast.mjs";

/* ── fixtures ─────────────────────────────────────────────────────────────────────────────────── */
const INPUTS = Object.freeze({ injuries: { state: "CURRENT", generatedAt: "2030-01-10T12:00:00Z", sha256: "a".repeat(64), ageMinutesAtForecast: 60 } });
const game = (id, dateUtc, pHome = 0.6, marginMean = 3.1) => ({
  providerEventId: id, label: "NBA REGULAR SEASON — SHADOW", seasonType: 2, dateUtc,
  home: { abbr: "DET" }, away: { abbr: "BOS" },
  forecast: { modelVersion: "nba-preseason-experimental-v0", inputAsOf: "2030-01-10T13:00:00Z", elo: { pHome: 0.55 }, sim: { pHome, margin: { mean: marginMean, p10: -15, p90: 21 }, total: { mean: 224 } } },
});
const stamp = (g, now = "2030-01-10T13:00:00Z", inputs = INPUTS) => stampReceipt(g, { family: "v0", modelVersion: "nba-preseason-experimental-v0", now, inputs });
const built = (games) => ({ modelVersion: "nba-preseason-experimental-v0", generatedAt: "2030-01-10T13:00:00Z", inputAsOf: "2030-01-10T13:00:00Z", date: "2030-01-10", games, manifest: {} });
const clone = (x) => JSON.parse(JSON.stringify(x));

/* ── hashing ──────────────────────────────────────────────────────────────────────────────────── */
test("canonical JSON is key-order independent (so a reformatted file is not a rewrite)", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } }), canonicalJson({ a: { c: null, d: [2, { x: 2, y: 1 }] }, b: 1 }));
  assert.notEqual(canonicalJson({ a: [1, 2] }), canonicalJson({ a: [2, 1] }), "array order is content");
});

test("a stamped game satisfies its own receipt, before tip", () => {
  const g = stamp(game("1", "2030-01-10T19:00Z"));
  assert.deepEqual(receiptIntegrity(g), { state: "OK" });
  assert.equal(g.receipt.eventId, "1");
  assert.equal(g.receipt.tipUtc, "2030-01-10T19:00Z");
  assert.equal(g.receipt.preTip, true);
  assert.deepEqual(g.receipt.inputs, INPUTS);
  assert.equal(gamePayloadHash(g), g.receipt.payloadSha256);
});

for (const [what, mutate] of [
  ["probability change", (g) => { g.forecast.sim.pHome = 0.61; }],
  ["score-projection change", (g) => { g.forecast.sim.margin.mean = 4.2; }],
  ["input-snapshot change (a later injury capture swapped into the receipt)", (g) => { g.receipt.inputs.injuries.generatedAt = "2030-01-10T18:00:00Z"; }],
  ["post-tip restamp (generatedAt moved past tip)", (g) => { g.receipt.generatedAt = "2030-01-10T19:30:00Z"; }],
  ["event identity change", (g) => { g.providerEventId = "2"; }],
]) {
  test(`MUTATION · ${what} breaks the receipt`, () => {
    const g = stamp(game("1", "2030-01-10T19:00Z"));
    mutate(g);
    assert.equal(receiptIntegrity(g).state, "BROKEN");
  });
}

test("a receipt stamped AFTER tip is broken even when its hash is self-consistent (post-tip forecasts never verify)", () => {
  const g = stamp(game("1", "2030-01-10T19:00Z"), "2030-01-10T19:30:00Z");
  assert.equal(g.receipt.payloadSha256, gamePayloadHash(g), "the hash itself is consistent");
  assert.equal(g.receipt.preTip, false);
  const r = receiptIntegrity(g);
  assert.equal(r.state, "BROKEN");
  assert.match(r.problems.join(" "), /not before tip/);
});

test("a pre-receipt (legacy) game is reported as such, never treated as verified", () => {
  assert.deepEqual(receiptIntegrity(game("1", "2030-01-10T19:00Z")), { state: "LEGACY_NO_RECEIPT" });
});

/* ── G7 write-once merge ──────────────────────────────────────────────────────────────────────── */
test("WRITE-ONCE · a later run can never rewrite a stored game (same event, new numbers)", () => {
  const first = mergeForecastArtifact({ existing: null, built: built([]), stampedGames: [stamp(game("1", "2030-01-10T23:00Z"))], now: "2030-01-10T13:00:00Z", runManifest: {} });
  assert.equal(first.ok, true);
  const frozen = clone(first.artifact.games[0]);
  const rerun = stamp(game("1", "2030-01-10T23:00Z", 0.71, 9.9), "2030-01-10T20:00:00Z", { injuries: { state: "CURRENT", generatedAt: "2030-01-10T19:55:00Z" } });
  const second = mergeForecastArtifact({ existing: first.artifact, built: built([]), stampedGames: [rerun], now: "2030-01-10T20:00:00Z", runManifest: {} });
  assert.equal(second.ok, true);
  assert.deepEqual(second.added, []);
  assert.deepEqual(second.artifact.games, [frozen], "the stored game is byte-identical; the rerun's numbers and inputs are dropped");
  assert.deepEqual(frozenGameViolations({ before: first.artifact, after: second.artifact }), []);
  assert.equal(second.artifact.runs.length, 2, "each run is appended to runs[], never replacing the first");
  assert.equal(second.artifact.generatedAt, first.artifact.generatedAt, "the document's first-run fields never move");
});

test("WRITE-ONCE · a late game is ADDED beside the frozen early one, once (no duplicate on a third run)", () => {
  const a = mergeForecastArtifact({ existing: null, built: built([]), stampedGames: [stamp(game("early", "2030-01-10T19:00Z"))], now: "2030-01-10T12:00:00Z", runManifest: {} });
  const b = mergeForecastArtifact({ existing: a.artifact, built: built([]), stampedGames: [stamp(game("late", "2030-01-11T00:30Z"), "2030-01-10T17:00:00Z")], now: "2030-01-10T17:00:00Z", runManifest: {} });
  assert.deepEqual(b.added, ["late"]);
  const c = mergeForecastArtifact({ existing: b.artifact, built: built([]), stampedGames: [stamp(game("late", "2030-01-11T00:30Z"), "2030-01-10T18:00:00Z")], now: "2030-01-10T18:00:00Z", runManifest: {} });
  assert.deepEqual(c.added, []);
  assert.deepEqual(c.artifact.games.map((g) => g.providerEventId), ["early", "late"]);
});

test("PRE-TIP ONLY · the writer refuses a game whose tip is not after the run instant", () => {
  const r = mergeForecastArtifact({ existing: null, built: built([]), stampedGames: [stamp(game("1", "2030-01-10T19:00Z"), "2030-01-10T19:05:00Z")], now: "2030-01-10T19:05:00Z", runManifest: {} });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /not after the run instant/);
});

test("a stored game that no longer matches its receipt REFUSES the write (never repaired silently)", () => {
  const a = mergeForecastArtifact({ existing: null, built: built([]), stampedGames: [stamp(game("1", "2030-01-10T23:00Z"))], now: "2030-01-10T13:00:00Z", runManifest: {} });
  const tampered = clone(a.artifact);
  tampered.games[0].forecast.sim.pHome = 0.99;
  const r = mergeForecastArtifact({ existing: tampered, built: built([]), stampedGames: [stamp(game("2", "2030-01-10T23:30Z"))], now: "2030-01-10T14:00:00Z", runManifest: {} });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /fails its receipt/);
});

test("a date file never mixes model versions", () => {
  const a = mergeForecastArtifact({ existing: null, built: built([]), stampedGames: [stamp(game("1", "2030-01-10T23:00Z"))], now: "2030-01-10T13:00:00Z", runManifest: {} });
  const r = mergeForecastArtifact({ existing: a.artifact, built: { ...built([]), modelVersion: "nba-preseason-experimental-v1" }, stampedGames: [], now: "2030-01-10T14:00:00Z", runManifest: {} });
  assert.equal(r.ok, false);
});

test("frozenGameViolations catches a rewrite, a removal and a duplicate", () => {
  const before = { games: [stamp(game("1", "2030-01-10T23:00Z")), stamp(game("2", "2030-01-10T23:30Z"))] };
  const rewritten = clone(before); rewritten.games[0].forecast.elo.pHome = 0.5;
  assert.match(frozenGameViolations({ before, after: rewritten }).join(), /event 1 was rewritten/);
  const removed = { games: [before.games[1]] };
  assert.match(frozenGameViolations({ before, after: removed }).join(), /event 1 was removed/);
  const dup = { games: [...before.games, before.games[0]] };
  assert.match(frozenGameViolations({ before, after: dup }).join(), /appears twice/);
  assert.deepEqual(frozenGameViolations({ before, after: { games: [...clone(before.games)].reverse() } }), [], "order alone is not a rewrite");
});

/* ── G2 planning: every game gets a pre-tip opportunity, nothing is forecast late or twice ───────── */
const SCHED = [
  { providerEventId: "early", dateUtc: "2030-01-10T19:00Z" }, // opening-day style 2pm ET tip
  { providerEventId: "late", dateUtc: "2030-01-11T00:30Z" },  // 7:30pm ET, same ET date
  { providerEventId: "late", dateUtc: "2030-01-11T00:30Z" },  // a repeated schedule row
  { providerEventId: "next", dateUtc: "2030-01-11T23:00Z" },  // the next ET date
];

test("planRun · a daily run that arrives after an early tip REFUSES it (never late) and builds the rest", () => {
  const p = planRun({ scheduleRows: SCHED, date: "2030-01-10", etDateOf, existingIds: new Set(), now: "2030-01-10T19:30:00Z" });
  assert.deepEqual(p.build, ["late"]);
  assert.deepEqual(p.outcomes.map((o) => [o.providerEventId, o.outcome]), [["early", RUN_OUTCOME.STARTED_BEFORE_FIRST_FORECAST], ["late", RUN_OUTCOME.ADDED]]);
});

test("planRun · the windowed run forecasts the early game inside its horizon, and leaves later ones for later", () => {
  const p = planRun({ scheduleRows: SCHED, date: "2030-01-10", etDateOf, existingIds: new Set(), now: "2030-01-10T12:00:00Z", horizonHours: 8 });
  assert.deepEqual(p.build, ["early"]);
  assert.equal(p.outcomes.find((o) => o.providerEventId === "late").outcome, RUN_OUTCOME.OUTSIDE_HORIZON);
});

test("planRun · a stored game is ALREADY_FROZEN and is not rebuilt", () => {
  const p = planRun({ scheduleRows: SCHED, date: "2030-01-10", etDateOf, existingIds: new Set(["early", "late"]), now: "2030-01-10T12:00:00Z" });
  assert.deepEqual(p.build, []);
  assert.ok(p.outcomes.every((o) => o.outcome === RUN_OUTCOME.ALREADY_FROZEN));
});

test("owedForecastDates · the early game is owed at T-7h, not after it is stored, never after tip", () => {
  const none = () => new Set();
  assert.deepEqual(owedForecastDates({ scheduleRows: SCHED, etDateOf, storedIdsByDate: none, now: "2030-01-10T12:00:00Z", horizonHours: 8 }), [{ date: "2030-01-10", eventIds: ["early"] }]);
  assert.deepEqual(owedForecastDates({ scheduleRows: SCHED, etDateOf, storedIdsByDate: (d) => new Set(d === "2030-01-10" ? ["early"] : []), now: "2030-01-10T12:00:00Z", horizonHours: 8 }), []);
  assert.deepEqual(owedForecastDates({ scheduleRows: SCHED, etDateOf, storedIdsByDate: none, now: "2030-01-10T19:00:00Z", horizonHours: 8 }), [{ date: "2030-01-10", eventIds: ["late"] }], "tip == now is not owed (it has started)");
  // an ET evening game tipping after midnight UTC belongs to the ET date it is played on
  assert.deepEqual(owedForecastDates({ scheduleRows: SCHED, etDateOf, storedIdsByDate: none, now: "2030-01-10T20:00:00Z", horizonHours: 8 }), [{ date: "2030-01-10", eventIds: ["late"] }]);
});

/* ── G4 injury snapshot provenance ────────────────────────────────────────────────────────────── */
test("injury snapshot: CURRENT within the bound, STALE beyond, MISSING when absent — described, not trusted", () => {
  const now = "2030-01-10T13:00:00Z";
  const cur = injurySnapshotProvenance({ doc: { generatedAt: "2030-01-10T11:00:00Z", entries: [1, 2] }, text: "x", now });
  assert.equal(cur.ok, true); assert.equal(cur.provenance.state, INPUT_STATE.CURRENT); assert.equal(cur.provenance.ageMinutesAtForecast, 120); assert.equal(cur.provenance.entries, 2);
  assert.match(cur.provenance.sha256, /^[0-9a-f]{64}$/);
  const old = injurySnapshotProvenance({ doc: { generatedAt: new Date(Date.parse(now) - (INJURY_SNAPSHOT_MAX_AGE_HOURS + 1) * 3_600_000).toISOString() }, text: "x", now });
  assert.equal(old.provenance.state, INPUT_STATE.STALE);
  assert.equal(injurySnapshotProvenance({ doc: null, text: null, now }).provenance.state, INPUT_STATE.MISSING);
});

test("FAIL CLOSED · an injury snapshot captured AFTER the forecast instant is refused (it could not have been an input)", () => {
  const r = injurySnapshotProvenance({ doc: { generatedAt: "2030-01-10T13:00:01Z" }, text: "x", now: "2030-01-10T13:00:00Z" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /AFTER the forecast instant/);
});

/* ── committed artifacts honour their own receipts ────────────────────────────────────────────── */
test("every committed NBA forecast game either matches its receipt or is a counted pre-receipt legacy game", () => {
  const root = path.resolve(process.cwd(), "..", "data", "internal", "research", "nba");
  let checked = 0;
  for (const fam of Object.values(FAMILIES)) {
    const dir = path.join(root, fam.dir, "forecasts");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const ids = (doc.games ?? []).map((g) => String(g.providerEventId));
      assert.equal(new Set(ids).size, ids.length, `${fam.dir}/${f}: an event appears twice`);
      for (const g of doc.games ?? []) {
        checked += 1;
        const r = receiptIntegrity(g);
        assert.notEqual(r.state, "BROKEN", `${fam.dir}/${f} ${g.providerEventId}: ${JSON.stringify(r.problems)}`);
      }
    }
  }
  assert.ok(checked > 0, "POSITIVE CONTROL: at least one committed forecast game was checked");
});
