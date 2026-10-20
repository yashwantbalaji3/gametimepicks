/**
 * The consistency audit over COMMITTED artifacts, pinned against known-discrepancies.json.
 *
 *   · a NEW discrepancy (or a higher count) whose sources are unchanged since the pin FAILS — code changes cannot
 *     introduce an inconsistency silently;
 *   · one whose data sources changed since the pin is reported as data drift (a data commit is not a code
 *     regression; re-pin with `npx tsx scripts/consistency/audit-prediction-consistency.mjs --write-baseline`);
 *   · code paths (static findings) never count as drift.
 *
 * Run: npx tsx --test src/lib/consistency/audit.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NBA_SIM_ANCHOR_TOLERANCE, NBA_THEATER_GATE_POLICY, NBA_THEATER_GATE_POLICY_IN_FORCE, SIM_ANCHOR_TOLERANCE, THEATER_GATE_CODES, compareWithBaseline, nbaSimAnchorCheck, runConsistencyAudit, simAnchorCheck, theaterActivationGate } from "./audit.mjs";
import { nbaOfficialSnapshot } from "./official-snapshot.mjs";
import { NBA_ID, nbaArtifact, nbaSources } from "./__fixtures__/synthetic.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const baseline = JSON.parse(fs.readFileSync(path.join(here, "known-discrepancies.json"), "utf8"));
const audit = runConsistencyAudit({ repoRoot });
const unchanged = (p) => baseline.manifest[p] != null && baseline.manifest[p] === audit.manifest[p];

test("no NEW discrepancy beyond the pinned baseline (sources unchanged)", (t) => {
  const cmp = compareWithBaseline(audit, baseline);
  if (cmp.drift.length) t.diagnostic(`data drift (re-pin when reviewed): ${cmp.drift.length} — e.g. ${cmp.drift.slice(0, 3).map((d) => d.fingerprint).join(" · ")}`);
  if (cmp.resolved.length) t.diagnostic(`resolved since the pin: ${cmp.resolved.length}`);
  assert.deepEqual(cmp.newStrict.map((d) => d.fingerprint), [], "new discrepancies");
  assert.deepEqual(cmp.grown.map((d) => `${d.fingerprint} ${d.pinnedCount}→${d.count}`), [], "grown discrepancies");
});

test("baseline classes: a NEW event of a KNOWN class is drift; a NEW class always fails; a known event regresses", () => {
  const fp = (code, sport, event, surface, subject, family, field) => [code, sport, event, surface, subject, family, field].join("|");
  const known = fp("MODEL_VERSION_MIX", "NBA", "401909088", "nba-top-board.default-family", "401909088", "v0.1", "DEFAULT_BOARD_FAMILY");
  const base = { manifest: { "data/x.json": "aaa" }, entries: [{ f: known, n: 1, s: [0] }] };
  const rec = (f, sources = ["data/x.json"]) => ({ fingerprint: f, count: 1, sources });
  const audit = (ds, manifest = { "data/x.json": "aaa" }) => ({ discrepancies: ds, manifest });

  // today's next slate: same class, an event the pin has never seen ⇒ drift, not failure (sources unchanged even)
  const nextSlate = fp("MODEL_VERSION_MIX", "NBA", "401909089", "nba-top-board.default-family", "401909089", "v0.1", "DEFAULT_BOARD_FAMILY");
  let c = compareWithBaseline(audit([rec(known), rec(nextSlate)]), base);
  assert.deepEqual(c.newStrict, []);
  assert.equal(c.drift.length, 1);
  assert.equal(c.drift[0].driftReason, "NEW_EVENT_KNOWN_CLASS");

  // a NEW class fails — on a new event, on a known event, and even when its data changed
  const newClassNewEvent = fp("LEAN_CONTRADICTION", "NBA", "401909090", "nba-top-board", "p1", "pts", "lean");
  const newClassKnownEvent = fp("SCENARIO_LEAK", "NBA", "401909088", "nba-top-board", "p1", "pts", "value");
  c = compareWithBaseline(audit([rec(known), rec(newClassNewEvent), rec(newClassKnownEvent)], { "data/x.json": "CHANGED" }), base);
  assert.deepEqual(c.newStrict.map((d) => d.fingerprint).sort(), [newClassKnownEvent, newClassNewEvent].sort());
  assert.deepEqual(c.drift, []);

  // a known class on an ALREADY-baselined event with a new subject: a regression (fails) unless its data changed
  const regression = fp("MODEL_VERSION_MIX", "NBA", "401909088", "nba-top-board.default-family", "other", "v0.1", "DEFAULT_BOARD_FAMILY");
  c = compareWithBaseline(audit([rec(known), rec(regression)]), base);
  assert.deepEqual(c.newStrict.map((d) => d.fingerprint), [regression]);
  c = compareWithBaseline(audit([rec(known), rec(regression)], { "data/x.json": "CHANGED" }), base);
  assert.deepEqual(c.newStrict, []);
  assert.equal(c.drift.length, 1);

  // a grown count on a pinned fingerprint still fails when its data is unchanged
  c = compareWithBaseline(audit([{ ...rec(known), count: 3 }]), base);
  assert.equal(c.grown.length, 1);
});

test("every record names its code, source and correction", () => {
  for (const d of audit.discrepancies) {
    assert.ok(d.code && d.severity && d.surface && d.fingerprint, d.fingerprint);
    assert.ok(Array.isArray(d.sources) && d.sources.length, `${d.fingerprint} has no source`);
    assert.ok(typeof d.correction === "string" && d.correction.length > 10, `${d.fingerprint} has no correction`);
  }
});

test("NFL 401873008: the Theater gate is closed, and closed for the founder's reasons", (t) => {
  const g = theaterActivationGate("NFL", "401873008", { audit });
  assert.equal(g.open, false);
  for (const b of g.blockers) {
    const ok = THEATER_GATE_CODES.includes(b.code) || b.code === "PROJECTION_MISMATCH" || b.code === "NO_OFFICIAL_SNAPSHOT" || b.code === "NO_SIM_RECEIPT_OF_RECORD";
    assert.ok(ok, `unexpected blocker ${b.fingerprint}`);
    if (b.code === "PROJECTION_MISMATCH" && !b.static) assert.match(b.surface, /^(simulation-theater|nfl-simulation-v2)/);
  }
  const anchor = audit.simAnchors.find((a) => a.eventId === "401873008");
  if (!anchor || !unchanged(anchor.simPath)) { t.diagnostic("401873008 sim receipt changed since the pin — exact-number assertions skipped"); return; }
  assert.equal(anchor.anchored, false);
  const p = anchor.terms.find((x) => x.term === "pHome");
  assert.equal(p.simulated, 0.7441);
  assert.ok(Math.abs(p.official - 0.8053) < 0.0001);
  assert.ok(g.blockers.some((b) => b.surface === "simulation-theater.anchor"));
});

test("theaterActivationGate logic on a synthetic audit: open only when the event is clean and anchored", () => {
  const clean = { discrepancies: [], refusals: [], snapshots: [{ sport: "NFL", eventId: "1" }], simAnchors: [{ sport: "NFL", eventId: "1", anchored: true }] };
  assert.equal(theaterActivationGate("nfl", "1", { audit: clean }).open, true);
  assert.equal(theaterActivationGate("nfl", "1", { audit: { ...clean, simAnchors: [] } }).blockers[0].code, "NO_SIM_RECEIPT_OF_RECORD");
  assert.equal(theaterActivationGate("nfl", "2", { audit: clean }).open, false);
  const leak = { ...clean, discrepancies: [{ code: "SCENARIO_LEAK", sport: "NFL", eventId: "1", surface: "parlay", fingerprint: "x" }, { code: "PROJECTION_MISMATCH", sport: "NFL", eventId: "1", surface: "nfl-weekly-boards", fingerprint: "y" }] };
  assert.deepEqual(theaterActivationGate("NFL", "1", { audit: leak }).blockers.map((b) => b.fingerprint), ["x"], "only gate-relevant records block");
});

test("sim anchoring tolerance: |ΔpHome| ≤ 0.02 and |Δ margin/total p50| ≤ 0.5", () => {
  const snap = { game: { pHome: 0.8053, margin: { median: 9 }, total: { median: 50 } } };
  assert.equal(simAnchorCheck(snap, { winProbability: { home: 0.79 }, margin: { p50: 9 }, total: { p50: 50 } }).anchored, true);
  const r = simAnchorCheck(snap, { winProbability: { home: 0.7441 }, margin: { p50: 9 }, total: { p50: 49 } });
  assert.equal(r.anchored, false);
  assert.deepEqual(r.failed.map((f) => f.term), ["pHome", "totalP50"]);
  assert.deepEqual(SIM_ANCHOR_TOLERANCE, { pHome: 0.02, marginP50: 0.5, totalP50: 0.5 });
});

test("NBA stays PRIVATE in every snapshot; the audit is read-only", () => {
  for (const s of audit.snapshots.filter((x) => x.sport === "NBA")) assert.equal(s.publication, "PRIVATE");
  for (const f of ["audit.mjs", "static-scan.mjs", "checks.mjs", "official-snapshot.mjs", "market-evaluator.mjs", "representative.mjs"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(here, f), "utf8"), /\b(writeFileSync|writeFile|appendFile|mkdirSync|rmSync|unlinkSync)\b/, f);
  }
});

test("NBA anchor: v1 must favour the Elo side, sit within the pHome tolerance, and match v0.1 player means", () => {
  const snap = nbaOfficialSnapshot(NBA_ID, nbaSources());
  const v1 = nbaArtifact().games[0];
  const r = nbaSimAnchorCheck(snap, v1);
  assert.equal(r.terms.find((t) => t.term === "side").pass, true);
  assert.equal(r.terms.find((t) => t.term === "pHome").pass, false, "0.57 vs Elo 0.60 is outside 0.02");
  assert.equal(r.anchored, false);
  assert.equal(r.toleranceApproved, false, "NBA tolerances await founder approval");
  const upset = { ...v1, forecast: { ...v1.forecast, sim: { ...v1.forecast.sim, pHome: 0.4 } } };
  assert.equal(nbaSimAnchorCheck(snap, upset).terms.find((t) => t.term === "side").pass, false);
  assert.equal(nbaSimAnchorCheck(snap, null).anchored, false);
  assert.equal(NBA_SIM_ANCHOR_TOLERANCE.pHome, SIM_ANCHOR_TOLERANCE.pHome);
});

test("NBA Theater gate: closed without a supporting run, when unanchored, and while the tolerance is unapproved", () => {
  const base = { discrepancies: [], refusals: [], snapshots: [{ sport: "NBA", eventId: "7" }] };
  assert.deepEqual(theaterActivationGate("nba", "7", { audit: { ...base, simAnchors: [] } }).blockers.map((b) => b.code), ["NO_SUPPORTING_SIMULATION"]);
  const unanchored = theaterActivationGate("nba", "7", { audit: { ...base, simAnchors: [{ sport: "NBA", eventId: "7", anchored: false, toleranceApproved: false, failed: [{ term: "pHome" }], tolerance: NBA_SIM_ANCHOR_TOLERANCE }] } });
  assert.deepEqual(unanchored.blockers.map((b) => b.code).sort(), ["ANCHOR_TOLERANCE_UNAPPROVED", "SIM_NOT_ANCHORED"]);
  const approved = theaterActivationGate("nba", "7", { audit: { ...base, simAnchors: [{ sport: "NBA", eventId: "7", anchored: true, toleranceApproved: true, failed: [], tolerance: NBA_SIM_ANCHOR_TOLERANCE }] } });
  assert.equal(approved.open, true);
  assert.equal(theaterActivationGate("nfl", "7", { audit: { ...base, snapshots: [{ sport: "NFL", eventId: "7" }], simAnchors: [{ sport: "NBA", eventId: "7", anchored: true }] } }).blockers[0].code, "NO_SIM_RECEIPT_OF_RECORD", "an NBA anchor never opens an NFL gate");
});

test("real 2026-10-20 slate: the official NBA snapshot is v0.1 + Elo, the lane matches it, and the Theater gate stays closed", () => {
  const nba = audit.snapshots.filter((x) => x.sport === "NBA");
  assert.equal(nba.length, 3);
  for (const s of nba) {
    assert.match(s.modelVersions.players.pts, /^nba-preseason-experimental-v0\.1@/);
    assert.ok(s.sources.some((x) => x.role === "SUPPORTING_SIMULATION" && /^nba-sim-v1-coherent@/.test(x.modelVersion)));
  }
  const laneFindings = audit.discrepancies.filter((d) => d.sport === "NBA" && d.surface === "nba-public-lane");
  assert.deepEqual(laneFindings, [], "the public lane prints exactly the official snapshot");
  for (const s of nba) assert.equal(theaterActivationGate("nba", s.eventId, { audit }).open, false);
});

test("NBA gate policy: ANCHORED is in force; LABELLED_SUPPORTING_RUNS is prepared — evaluable, never open while not adopted", () => {
  assert.equal(NBA_THEATER_GATE_POLICY_IN_FORCE, NBA_THEATER_GATE_POLICY.ANCHORED);
  const base = { discrepancies: [], refusals: [], snapshots: [{ sport: "NBA", eventId: "7" }] };
  const unanchored = { ...base, simAnchors: [{ sport: "NBA", eventId: "7", anchored: false, toleranceApproved: false, failed: [{ term: "pHome" }], tolerance: NBA_SIM_ANCHOR_TOLERANCE }] };
  const alt = theaterActivationGate("nba", "7", { audit: unanchored, nbaPolicy: NBA_THEATER_GATE_POLICY.LABELLED_SUPPORTING_RUNS });
  assert.deepEqual(alt.blockers.map((b) => b.code), ["GATE_POLICY_NOT_IN_FORCE"], "no anchor is required under the alternative — only its adoption is missing");
  // the default-run selection is not a gate under labelled runs; box-score / leak / version-mix still are
  const withDefault = { ...unanchored, discrepancies: [{ code: "PROJECTION_MISMATCH", sport: "NBA", eventId: "7", surface: "simulation-theater.default", fingerprint: "d" }, { code: "BOX_SCORE_INCONSISTENT", sport: "NBA", eventId: "7", surface: "simulation-theater.runs", fingerprint: "b" }] };
  assert.deepEqual(theaterActivationGate("nba", "7", { audit: withDefault, nbaPolicy: NBA_THEATER_GATE_POLICY.LABELLED_SUPPORTING_RUNS }).blockers.map((b) => b.fingerprint ?? b.code).sort(), ["POLICY|NBA|7", "b"]);
  assert.ok(theaterActivationGate("nba", "7", { audit: withDefault }).blockers.some((b) => b.fingerprint === "d"), "under ANCHORED the default run still gates");
  const noSim = theaterActivationGate("nba", "7", { audit: { ...base, simAnchors: [] }, nbaPolicy: NBA_THEATER_GATE_POLICY.LABELLED_SUPPORTING_RUNS });
  assert.equal(noSim.blockers[0].code, "NO_SUPPORTING_SIMULATION");
});
