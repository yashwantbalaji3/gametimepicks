/**
 * Simulation Theater · official representative wiring (Cross-Product Prediction Consistency, 2026-10-20): official
 * targets from the official snapshot, selection over the STORED runs that validated, dedupe of shared runs, what-if
 * labels, fail closed without an official forecast, and the real NFL record of 401873008.
 * Run: npx tsx --test src/lib/simulation-theater/official-representative.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { REP_STATE, dedupeRuns, nflOfficial, snapshotOrRefusal, withNbaRepresentative, withNflRepresentative } from "./official-representative.mjs";
import { NO_OFFICIAL_NBA, NO_OFFICIAL_NFL, OFFICIAL_RUN_TITLE, RECONCILIATION_NOTE, WHAT_IF_BANNER, WHAT_IF_TAG, officialRunIndex, officialRunLine, runRole, teamComparison, whatIfLine } from "./representative-labels.mjs";
import { loadTheater, nflTheaterOfficial, readNflOfficialInputs } from "./loader.mjs";
import { defaultChip, defaultSample, publicTheaterLoad } from "./public-theater.mjs";
import { packTheater, unpackTheater } from "./theater-pack.mjs";
import { readShadowReceipts, simulationOfRecord } from "../sports/nfl/sim-v2/public-receipt.mjs";
import { forecastOfRecord } from "../forecast-ledger/adapters/nfl.mjs";
import { officialTargets, runsFromNflSimReceipt, selectOfficialRepresentative } from "../consistency/representative.mjs";
import { nbaOfficialSnapshot } from "../consistency/official-snapshot.mjs";
import { NBA_ID, nbaArtifact, nflBoard, nflReceipt, receiptsOf, NFL_ID } from "../consistency/__fixtures__/synthetic.mjs";

const REPO = path.resolve(process.cwd(), "..");

// official (synthetic): home ≈ 23.8, away ≈ 20.4, margin 3.4, total 44.2
const official = nflOfficial(NFL_ID, { receipts: receiptsOf(nflReceipt()), playerBoard: { doc: nflBoard() } });
const simReceipt = {
  representativeRuns: [
    { kind: "MEDIAN_LIKE", runIndex: 40, final: { home: 27, away: 17, overtime: false } },
    { kind: "HIGH_SCORING", runIndex: 7, final: { home: 34, away: 31, overtime: false } },
    { kind: "LOW_SCORING", runIndex: 12, final: { home: 24, away: 20, overtime: false } },
    { kind: "UPSET", runIndex: 3, final: { home: 17, away: 24, overtime: true } },
    { kind: "OVERTIME", runIndex: 3, final: { home: 17, away: 24, overtime: true } }, // shared run: UPSET = OVERTIME
  ],
};
const chips = (avail = {}) => [
  { runIndex: 40, sampleIndex: 0, kinds: ["MEDIAN_LIKE"], available: avail[40] ?? true },
  { runIndex: 7, sampleIndex: 1, kinds: ["HIGH_SCORING"], available: avail[7] ?? true },
  { runIndex: 12, sampleIndex: 2, kinds: ["LOW_SCORING"], available: avail[12] ?? true },
  { runIndex: 3, sampleIndex: 3, kinds: ["UPSET", "OVERTIME"], available: avail[3] ?? true },
];
const teams = { home: { abbr: "HOM" }, away: { abbr: "AWY" } };

test("targets come from the OFFICIAL snapshot and the default is the stored run nearest it (not the engine's median-like pick)", () => {
  assert.equal(official.refusal, null);
  const m = withNflRepresentative({ chips: chips() }, simReceipt, official);
  const rep = m.representative;
  assert.equal(rep.state, REP_STATE.SELECTED);
  assert.equal(rep.officialRunIndex, 12, "24–20 is nearest the official 23.8–20.4 / 3.4 / 44.2");
  assert.equal(rep.snapshotId, official.snapshot.snapshotId);
  // the same answer as the shared selector on the same inputs (wiring adds nothing)
  const direct = selectOfficialRepresentative(runsFromNflSimReceipt(simReceipt), officialTargets(official.snapshot));
  assert.equal(direct.official.run.runIndex, rep.officialRunIndex);
  assert.equal(rep.distance, direct.distance);
  assert.equal(officialRunIndex(m), 12);
  assert.deepEqual(rep.official.projectedScore, { home: 24, away: 20, convention: "scores-derived-from-total-and-margin-v1" });
  assert.equal(rep.official.pHome, 0.62);
  assert.equal(rep.official.team.margin.expected, 3.4);
  assert.equal(rep.official.team.total.expected, 44.2);
  assert.equal(rep.players, null, "NFL player lines are not modeled by the drive engine: no player expectations attached");
  assert.equal(JSON.parse(JSON.stringify(rep)).officialRunIndex, 12, "plain JSON");
});

test("a run stored under two kinds is ONE run with ONE role; only validated runs may be the default", () => {
  assert.deepEqual(dedupeRuns(runsFromNflSimReceipt(simReceipt)).map((r) => [r.runIndex, r.kinds]), [[40, ["MEDIAN_LIKE"]], [7, ["HIGH_SCORING"]], [12, ["LOW_SCORING"]], [3, ["UPSET", "OVERTIME"]]]);
  const rep = withNflRepresentative({ chips: chips() }, simReceipt, official).representative;
  assert.equal(rep.runs.length, 4);
  assert.equal(rep.runs.filter((r) => r.runIndex === 3).length, 1);
  for (const r of rep.runs) {
    assert.equal(r.hypothetical, r.runIndex !== 12);
    assert.equal(r.role, r.runIndex === 12 ? "OFFICIAL_REPRESENTATIVE" : "WHAT_IF");
    assert.ok(Number.isFinite(r.distance));
  }
  // the nearest run failed validation in the Theater → the next nearest valid run is the default, never the broken one
  const m2 = withNflRepresentative({ chips: chips({ 12: false }) }, simReceipt, official);
  assert.notEqual(m2.representative.officialRunIndex, 12);
  assert.equal(m2.representative.runs.find((r) => r.runIndex === 12).role, "WHAT_IF");
});

test("no official forecast ⇒ NO_OFFICIAL with the typed refusal, and every run is a hypothetical what-if", () => {
  const refused = nflOfficial(NFL_ID, { receipts: [], playerBoard: { doc: nflBoard() } });
  assert.equal(refused.snapshot, null);
  assert.equal(refused.refusal.code, "NO_PRE_LOCK_RECORD");
  const m = withNflRepresentative({ chips: chips() }, simReceipt, refused);
  assert.equal(m.representative.state, REP_STATE.NO_OFFICIAL);
  assert.equal(m.representative.officialRunIndex, null);
  assert.equal(officialRunIndex(m), null);
  assert.ok(m.representative.runs.every((r) => r.hypothetical && r.role === "WHAT_IF"));
  for (const c of chips()) assert.equal(runRole(m, c.runIndex).hypothetical, true);
  assert.deepEqual(teamComparison(m, { home: 24, away: 20 }, teams), [], "no official expectation is invented");
  // a non-refusal error is a bug and propagates
  assert.throws(() => snapshotOrRefusal(() => { throw new TypeError("a bug, not a refusal"); }), TypeError);
});

test("labels: the official line names the rule and distance; EVERY what-if text says hypothetical", () => {
  const m = withNflRepresentative({ chips: chips() }, simReceipt, official);
  const off = runRole(m, 12, "Low-scoring");
  assert.equal(off.hypothetical, false);
  assert.equal(off.tag, OFFICIAL_RUN_TITLE);
  assert.match(off.line, /^Official representative simulation · closest stored run to the official forecast · distance \d+\.\d{2}$/);
  assert.equal(officialRunLine(m.representative), off.line);
  for (const [idx, kind] of [[40, "Median-like"], [7, "High-scoring"], [3, "Upset · also the first overtime run"]]) {
    const r = runRole(m, idx, kind);
    assert.equal(r.hypothetical, true);
    assert.equal(r.line, `${WHAT_IF_TAG} · ${kind}`, "keeps its kind");
    assert.match(r.line, /hypothetical/i);
    assert.match(r.tag, /hypothetical/i);
  }
  assert.match(whatIfLine(null), /hypothetical/i);
  assert.equal(WHAT_IF_BANNER, "Hypothetical scenario — not the forecast");
  assert.equal(RECONCILIATION_NOTE, "Official expectations are averages and can be fractional; a simulated game produces whole numbers.");
  assert.equal(NO_OFFICIAL_NBA, "No official forecast receipt for this game yet");
  assert.match(NO_OFFICIAL_NFL, /^No official forecast/);
});

test("reconciliation: fractional official expectations beside whole-number results, never rounded into each other", () => {
  const m = withNflRepresentative({ chips: chips() }, simReceipt, official);
  const rows = teamComparison(m, { home: 24, away: 20 }, teams);
  assert.deepEqual(rows.map((r) => r.term), ["away", "home", "margin", "total"]);
  const home = rows.find((r) => r.term === "home");
  assert.equal(home.official, (44.2 + 3.4) / 2);
  assert.equal(home.run, 24);
  assert.equal(home.diff, 24 - (44.2 + 3.4) / 2);
  assert.ok(!Number.isInteger(home.official));
  assert.equal(rows.find((r) => r.term === "total").median, 44, "the official median is shown beside the mean where stored");
  const rec = m.representative.reconciliation.find((r) => r.term === "home");
  assert.equal(rec.officialExpectation, home.official);
  assert.equal(rec.simulatedGame, 24);
});

test("NBA: player expectations join by providerAthleteId only and carry the conditional-on-playing basis", () => {
  const a = nbaArtifact();
  const game = a.games[0];
  game.forecast.representativeSamples = [
    { runIndex: 5, label: "typical", final: { home: 112, away: 109 }, players: { home: [{ providerAthleteId: "11", name: "Same Name", pts: 24 }], away: [] } },
    { runIndex: 9, label: "high", final: { home: 130, away: 126 }, players: { home: [{ providerAthleteId: "11", name: "Same Name", pts: 40 }], away: [] } },
  ];
  // the stamp no longer matches once samples are added: the official snapshot REFUSES a broken receipt
  const broken = { snapshot: null, refusal: null };
  try { nbaOfficialSnapshot(NBA_ID, a); } catch (e) { broken.refusal = e.code; }
  assert.equal(broken.refusal, "RECEIPT_INTEGRITY");
  const manifest = { samples: [{ runIndex: 5, validation: { ok: true } }, { runIndex: 9, validation: { ok: true } }] };
  const fresh = nbaArtifact();
  const snap = nbaOfficialSnapshot(NBA_ID, fresh);
  const m = withNbaRepresentative(manifest, game, { snapshot: snap, refusal: null });
  assert.equal(m.representative.officialRunIndex, 5);
  assert.deepEqual(m.representative.players["11"], { families: { pts: { expected: 24.2, median: 24 } }, playRate: 0.97, conditioning: "CONDITIONAL_ON_PLAYING" });
  assert.equal(m.representative.players["Same Name"], undefined, "never keyed by name");
  const refusedM = withNbaRepresentative(manifest, game, { snapshot: null, refusal: { code: "RECEIPT_INTEGRITY", message: "x" } });
  assert.equal(refusedM.representative.state, REP_STATE.NO_OFFICIAL);
  assert.ok(refusedM.representative.runs.every((r) => r.hypothetical));
});

/* ── the real committed NFL record (derived from disk, never pinned) ─────────────────────────────────────────────── */
const ID = "401873008";
const inputs = readNflOfficialInputs(REPO, ID);
const hasNfl = inputs.receipts.length > 0 && inputs.playerBoard && simulationOfRecord(readShadowReceipts(REPO), ID);

test("NFL 401873008: the theater opens on the official representative, measured against the forecast of record", { skip: hasNfl ? false : "no committed NFL sources in this checkout" }, () => {
  const t = loadTheater(REPO, ID);
  assert.equal(t.ok, true);
  const rep = t.manifest.representative;
  assert.equal(rep.state, REP_STATE.SELECTED);
  const rec = forecastOfRecord(inputs.receipts).get(ID);
  assert.equal(rep.official.source, rec.file, "the official target is the forecast of record");
  const s = rec.receipt.forecastSummary;
  assert.equal(rep.official.pHome, s.winProbability.homeUnrounded ?? s.winProbability.home);
  assert.equal(rep.official.projectedScore.home, s.projectedScore.home);
  assert.equal(rep.official.team.margin.expected, s.distribution.marginMean);
  assert.equal(rep.official.team.total.expected, s.distribution.totalMean);
  // default chip = the official representative, a validated stored run of THIS receipt
  const chip = defaultChip(t.manifest);
  assert.equal(chip.runIndex, rep.officialRunIndex);
  assert.ok(chip.available);
  assert.equal(defaultSample(t.manifest).runIndex, rep.officialRunIndex);
  // and it is the nearest of the stored runs by the shared rule (recomputed here from the receipt itself)
  const simRec = simulationOfRecord(readShadowReceipts(REPO), ID);
  const direct = selectOfficialRepresentative(runsFromNflSimReceipt(simRec.receipt).filter((r) => t.manifest.chips.some((c) => c.available && c.runIndex === r.runIndex)), officialTargets(nflTheaterOfficial(REPO, ID).snapshot));
  assert.equal(direct.official.run.runIndex, rep.officialRunIndex);
  assert.ok(rep.runs.filter((r) => r.runIndex !== rep.officialRunIndex).every((r) => r.hypothetical));
  console.log(`# NFL ${ID}: official representative run #${rep.officialRunIndex} (distance ${rep.distance.toFixed(4)}, within tolerance: ${rep.withinTolerance}); what-ifs ${rep.runs.filter((r) => r.hypothetical).map((r) => `#${r.runIndex} ${r.kinds.join("=")} ${r.distance?.toFixed(3)}`).join(", ")}`);
});

test("NFL: the public section's load attaches the same block; the pack carries it losslessly", { skip: hasNfl ? false : "no committed NFL sources in this checkout" }, () => {
  const rec = simulationOfRecord(readShadowReceipts(REPO), ID);
  const pub = publicTheaterLoad(rec, nflTheaterOfficial(REPO, ID));
  const dev = loadTheater(REPO, ID);
  assert.deepEqual(pub.manifest.representative, dev.manifest.representative);
  const back = unpackTheater(packTheater(dev.manifest));
  assert.equal(JSON.stringify(back), JSON.stringify(dev.manifest));
  // without an official forecast the public load labels every run a what-if (no silent default)
  const none = publicTheaterLoad(rec);
  assert.equal(none.manifest.representative.state, REP_STATE.NO_OFFICIAL);
  assert.equal(officialRunIndex(none.manifest), null);
});
