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

import { SIM_ANCHOR_TOLERANCE, THEATER_GATE_CODES, compareWithBaseline, runConsistencyAudit, simAnchorCheck, theaterActivationGate } from "./audit.mjs";

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
  const clean = { discrepancies: [], refusals: [], snapshots: [{ sport: "NFL", eventId: "1" }], simAnchors: [{ eventId: "1", anchored: true }] };
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
