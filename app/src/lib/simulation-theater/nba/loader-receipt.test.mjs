/**
 * NBA theater · loader on the COMMITTED PRIVATE RECEIPT (Cross-Product Prediction Consistency, 2026-10-20): receipt
 * integrity is verified before use, an absent game says "No official forecast receipt for this game yet" (never a
 * fixture in its place), and the default sample is the official representative. Synthetic artifacts in the committed
 * shape are built from the r2 TEST FIXTURE; the committed file itself is checked when this checkout has it.
 * Run: npx tsx --test src/lib/simulation-theater/nba/loader-receipt.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { NBA_COLORS_FILE, NBA_REAL_TEST_FIXTURE_SOURCE, NBA_THEATER_OFFICIAL_SOURCE, NBA_THEATER_SOURCE, lastRunOutcome, loadNbaTheater, nbaRouteEvents, readArtifact, usableNbaEvents, v1ArtifactSource } from "./loader.mjs";
import { defaultSampleIndex } from "./labels.mjs";
import { receiptIntegrity, stampReceipt } from "../../sports/nba/forecast-receipt.mjs";
import { nbaOfficialSnapshot } from "../../consistency/official-snapshot.mjs";
import { officialTargets, runsFromNbaSamples, selectOfficialRepresentative } from "../../consistency/representative.mjs";
import { NO_OFFICIAL_NBA, runRole } from "../representative-labels.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const REAL = readArtifact(REPO, NBA_REAL_TEST_FIXTURE_SOURCE).artifact;
const clone = (x) => JSON.parse(JSON.stringify(x));
const SRC = v1ArtifactSource("2026-10-20");
/** The OFFICIAL source beside it (v0.1 + Elo side), as committed. */
const OFF = readArtifact(REPO, NBA_THEATER_OFFICIAL_SOURCE);
const officialOf = (id, supportingDoc) => nbaOfficialSnapshot(id, { official: { doc: OFF.artifact, path: OFF.file }, supporting: { doc: supportingDoc, path: SRC.path } });

/** The committed shape at its first pre-tip window: one game stamped, the other two logged OUTSIDE_HORIZON. */
function committedShape() {
  const a = clone(REAL);
  a.games = [a.games[0]];
  a.runs = [{ at: "2026-10-20T12:29:28Z", added: [a.games[0].providerEventId], horizonHours: 8, outcomes: [
    { providerEventId: "401909088", outcome: "ADDED", tipUtc: "2026-10-20T19:00Z" },
    { providerEventId: "401909089", outcome: "OUTSIDE_HORIZON", tipUtc: "2026-10-20T23:00Z" },
    { providerEventId: "401909090", outcome: "OUTSIDE_HORIZON", tipUtc: "2026-10-21T01:30Z" },
  ], refused: [], injuries: "CURRENT" }];
  return a;
}
const readOf = (artifact) => ({ file: SRC.path, artifact, provenance: null, sha256: "f".repeat(64), error: null });

test("the r2 test fixture's games carry intact nba-forecast-receipt@1 stamps (the synthetic committed shapes below start valid)", () => {
  for (const g of REAL.games) assert.equal(receiptIntegrity(g).state, "OK", g.providerEventId);
});

test("committed receipt: a stamped game loads, from the receipt (never the fixture), with the official representative as default", () => {
  const a = committedShape();
  const t = loadNbaTheater(REPO, "401909088", { source: SRC, read: readOf(a) });
  assert.equal(t.ok, true, JSON.stringify(t.error));
  assert.equal(t.file, SRC.path);
  assert.equal(t.manifest.provenance, null, "not the dev copy");
  const rep = t.manifest.representative;
  assert.equal(rep.state, "SELECTED");
  const direct = selectOfficialRepresentative(runsFromNbaSamples(a.games[0]), officialTargets(officialOf("401909088", a)));
  assert.equal(rep.officialRunIndex, direct.official.run.runIndex);
  assert.equal(t.manifest.samples[defaultSampleIndex(t.manifest)].runIndex, rep.officialRunIndex, "the theater opens on it");
  assert.equal(rep.official.source, NBA_THEATER_OFFICIAL_SOURCE.path, "measured against the OFFICIAL v0.1 snapshot, not the replayed v1 file");
  assert.equal(rep.official.publication, "PRIVATE");
  for (const s of t.manifest.samples) assert.equal(runRole(t.manifest, s.runIndex).hypothetical, s.runIndex !== rep.officialRunIndex);
  assert.ok(Object.keys(rep.players).length > 10, "official per-player expectations, keyed by providerAthleteId");
});

test("absent game (OUTSIDE_HORIZON at the last run): 'No official forecast receipt for this game yet', no manifest, no fallback", () => {
  const a = committedShape();
  for (const id of ["401909089", "401909090"]) {
    const t = loadNbaTheater(REPO, id, { source: SRC, read: readOf(a) });
    assert.equal(t.ok, false);
    assert.equal(t.manifest, null, "no samples from anywhere else");
    assert.equal(t.error.code, "NO_OFFICIAL_RECEIPT");
    assert.ok(t.error.reason.startsWith(NO_OFFICIAL_NBA), t.error.reason);
    assert.match(t.error.reason, /OUTSIDE_HORIZON/);
  }
  assert.deepEqual(lastRunOutcome(a, "401909089"), { outcome: "OUTSIDE_HORIZON", at: "2026-10-20T12:29:28Z", tipUtc: "2026-10-20T23:00Z" });
  assert.equal(lastRunOutcome(a, "999"), null);
});

test("receipt integrity is verified before use: a tampered payload or a missing stamp fails closed (RECEIPT_INTEGRITY)", () => {
  const tampered = committedShape();
  tampered.games[0].forecast.representativeSamples[0].final.home += 1;
  const t1 = loadNbaTheater(REPO, "401909088", { source: SRC, read: readOf(tampered) });
  assert.equal(t1.ok, false);
  assert.equal(t1.error.code, "RECEIPT_INTEGRITY");
  assert.match(t1.error.reason, /BROKEN: payloadSha256 does not match/);
  const legacy = committedShape();
  delete legacy.games[0].receipt;
  const t2 = loadNbaTheater(REPO, "401909088", { source: SRC, read: readOf(legacy) });
  assert.equal(t2.error.code, "RECEIPT_INTEGRITY");
  assert.match(t2.error.reason, /LEGACY_NO_RECEIPT/);
  // a post-tip stamp is broken too
  const late = committedShape();
  late.games[0] = stampReceipt(late.games[0], { family: "v1", modelVersion: late.games[0].receipt.modelVersion, now: "2026-10-20T19:30:00Z", inputs: late.games[0].receipt.inputs });
  const t3 = loadNbaTheater(REPO, "401909088", { source: SRC, read: readOf(late) });
  assert.equal(t3.error.code, "RECEIPT_INTEGRITY");
  assert.match(t3.error.reason, /not before tip/);
  // the file itself missing
  const none = loadNbaTheater(REPO, "401909088", { source: v1ArtifactSource("1999-01-01") });
  assert.equal(none.error.code, "NO_ARTIFACT");
});

test("route events: the receipt's usable games first, then the slate games its run log names but it does not hold yet", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nba-receipt-"));
  try {
    const file = path.join(root, NBA_THEATER_SOURCE.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(committedShape()));
    fs.mkdirSync(path.dirname(path.join(root, NBA_COLORS_FILE)), { recursive: true });
    fs.copyFileSync(path.join(REPO, NBA_COLORS_FILE), path.join(root, NBA_COLORS_FILE));
    assert.deepEqual(usableNbaEvents(root), ["401909088"]);
    assert.deepEqual(nbaRouteEvents(root), ["401909088", "401909089", "401909090"]);
    assert.equal(loadNbaTheater(root, "401909088").ok, true);
    assert.equal(loadNbaTheater(root, "401909090").error.code, "NO_OFFICIAL_RECEIPT");
    // a broken stamp drops the game from the usable list (it is never rendered from the payload)
    const broken = committedShape();
    broken.games[0].forecast.sim.pHome = 0.99;
    fs.writeFileSync(file, JSON.stringify(broken));
    assert.deepEqual(usableNbaEvents(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/* ── the committed file itself, when this checkout has it (main ≥ a49d5bfaa9) ─────────────────────────────────── */
const committed = readArtifact(REPO);
test("the COMMITTED receipt: every game it holds passes integrity and opens on its official representative", { skip: committed.artifact ? false : `${NBA_THEATER_SOURCE.path} is not in this checkout` }, () => {
  const ids = usableNbaEvents(REPO);
  assert.deepEqual(ids, committed.artifact.games.map((g) => String(g.providerEventId)).filter((id) => ids.includes(id)));
  for (const g of committed.artifact.games) {
    const id = String(g.providerEventId);
    assert.equal(receiptIntegrity(g).state, "OK", id);
    const t = loadNbaTheater(REPO, id);
    assert.equal(t.ok, true, `${id}: ${JSON.stringify(t.error)}`);
    const rep = t.manifest.representative;
    assert.equal(rep.state, "SELECTED", id);
    const direct = selectOfficialRepresentative(runsFromNbaSamples(g), officialTargets(officialOf(id, committed.artifact)));
    assert.equal(rep.officialRunIndex, direct.official.run.runIndex, id);
    console.log(`# NBA ${id}: official representative run #${rep.officialRunIndex} (distance ${rep.distance.toFixed(4)}); what-ifs ${rep.runs.filter((r) => r.hypothetical).map((r) => `#${r.runIndex} ${r.kinds.join("=")} ${r.distance?.toFixed(3)}`).join(", ")}`);
  }
  for (const id of nbaRouteEvents(REPO).filter((x) => !ids.includes(x))) assert.equal(loadNbaTheater(REPO, id).error.code, "NO_OFFICIAL_RECEIPT", id);
});

test("official v0.1 source missing: the runs still play, every one a hypothetical what-if (never promoted to official)", () => {
  const a = committedShape();
  const t = loadNbaTheater(REPO, "401909088", { source: SRC, read: readOf(a), officialRead: { file: NBA_THEATER_OFFICIAL_SOURCE.path, artifact: null, provenance: null, sha256: null, error: { code: "NO_ARTIFACT" } } });
  assert.equal(t.ok, true);
  assert.equal(t.manifest.representative.state, "NO_OFFICIAL");
  assert.ok(t.manifest.representative.runs.every((r) => r.hypothetical));
});
