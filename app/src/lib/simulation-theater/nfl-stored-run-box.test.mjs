/**
 * NFL player boxes STORED in the sim-v2 receipt (`representativeRunBoxes`, nfl-representative-run-boxes@1).
 *
 *   PRODUCER     buildNflSimulationReceipt (the shadow build's receipt writer) records every representative run's box:
 *                deterministic (same seed / inputs → byte-identical receipt), one box per distinct run index, each
 *                equal to the box nflRunBoxScore folds from that run's play log, and sha256 over { pack, refusals }.
 *   RECONCILE    every stored box reconciles to the stored run's drives and final score (reconcileRunBox), and to its
 *                period scores; a tampered pack (sha), box (re-hashed) or drive path refuses that run, typed.
 *   PAGE         a receipt carrying the field renders the player box for the shown run; a receipt without it (every
 *                receipt committed before the field existed — never rewritten) renders "Player box score unavailable
 *                for this run". No public route imports the re-derivation module (sim-v2/player-run.mjs).
 *
 * Run: cd app && npx tsx --test src/lib/simulation-theater/nfl-stored-run-box.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";

globalThis.React = React;
// the public section imports its stylesheet (Next handles it); a no-op loader lets the test render it
createRequire(import.meta.url).extensions[".css"] = (m) => { m.exports = {}; };
const E = await import("../sports/nfl/sim-v2/engine.mjs");
const { calibrate, runBatch } = await import("../sports/nfl/sim-v2/simulate.mjs");
const { buildNflSimulationReceipt, validateSimulationReceipt } = await import("../sports/nfl/sim-v2/receipt.mjs");
const { readShadowReceipts, simulationOfRecord } = await import("../sports/nfl/sim-v2/public-receipt.mjs");
const P = await import("../sports/nfl/sim-v2/player-run.mjs");
const B = await import("./nfl-run-box-score.mjs");
const S = await import("./nfl-stored-run-box.mjs");
const { adaptReceipt } = await import("./adapter-nfl-sim-v2.mjs");
const { BoxScoreForRun } = await import("../../components/simulation-theater/BoxScoreTable.tsx");
const { default: PublicTheaterSection } = await import("../../components/simulation-theater/PublicTheaterSection.tsx");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const EVENT = "401873030";
const SHADOW = readShadowReceipts(REPO);
const committed = simulationOfRecord(SHADOW, EVENT).receipt;

/** The shadow build's recipe on the committed inputs, with a small batch (the producer's own functions). */
function produce({ runs = 800, generatedAt = "2026-10-25T12:00:00Z" } = {}) {
  const r = committed;
  const ti = P.nflSimTeamInputs(REPO, EVENT, r.home.abbr, r.away.abbr);
  assert.ok(ti, "committed role shares / injuries / rosters");
  const prep = ti.inputs.map(E.prepareTeamPlayers);
  const compiled = P.compiledFor(REPO, r);
  assert.ok(compiled, "committed params match the receipt's sha256");
  const anchors = { home: r.calibration.anchors.home, away: r.calibration.anchors.away, source: "test", modelVersion: { forecastModel: "t" } };
  const baseSeed = r.baseSeed;
  const calibration = calibrate({ compiled, anchors, baseSeed, runs: 300 });
  const batch = runBatch({ compiled, thetas: calibration.thetas, players: prep, baseSeed, runs });
  const receipt = buildNflSimulationReceipt({
    event: { eventId: EVENT, kickoffUtc: r.eventStart, home: r.home, away: r.away },
    compiled, paramsRef: r.params, anchors, calibration, prep, batch, baseSeed, inputHash: "fixture", generatedAt, inputs: {},
  });
  return { receipt, prep, compiled, teams: { home: { abbr: r.home.abbr }, away: { abbr: r.away.abbr } } };
}
const FIX = produce();
const fixture = FIX.receipt;
const withoutField = (() => { const { [S.RUN_BOX_RECORD_FIELD]: _drop, ...rest } = fixture; return rest; })();

test("producer: the receipt records every representative run's box, deterministically (same seed / inputs → identical bytes)", () => {
  const rec = fixture[S.RUN_BOX_RECORD_FIELD];
  assert.ok(rec, "field present");
  assert.equal(rec.schemaVersion, S.RUN_BOX_RECORD_SCHEMA);
  assert.equal(rec.encoding, B.RUN_BOX_PACK_VERSION);
  assert.equal(rec.boxVersion, B.RUN_BOX_VERSION);
  assert.match(rec.sha256, /^[0-9a-f]{64}$/);
  assert.equal(rec.sha256, S.runBoxRecordSha(rec.pack, rec.refusals));
  assert.deepEqual(rec.refusals, {}, "no representative run failed its box at production");
  const idx = [...new Set(fixture.representativeRuns.map((x) => x.runIndex))].sort((a, b) => a - b);
  assert.deepEqual(rec.pack.r.map((x) => x[0]), idx, "one box per distinct run index, ascending");
  assert.deepEqual(validateSimulationReceipt(fixture), []);
  // byte-identical on a second production with the same seed and inputs (generatedAt is the only clock)
  const again = produce().receipt;
  assert.equal(JSON.stringify(again), JSON.stringify(fixture));
  // the field is inside the hashed body: changing it changes artifactHash
  const later = produce({ generatedAt: "2026-10-26T12:00:00Z" }).receipt;
  assert.equal(later.artifactHash, fixture.artifactHash, "generatedAt is excluded from artifactHash");
  assert.equal(JSON.stringify(later[S.RUN_BOX_RECORD_FIELD]), JSON.stringify(rec));
});

test("producer: each stored box equals the box folded from that run's play log (engine cross-checked) and reconciles to its stored drives", () => {
  const stored = B.unpackRunBoxes(fixture[S.RUN_BOX_RECORD_FIELD].pack);
  for (const rep of fixture.representativeRuns) {
    const rec = P.simulateRunRecord({ compiled: FIX.compiled, thetas: fixture.calibration.thetas, prep: FIX.prep, baseSeed: fixture.baseSeed, runIndex: rep.runIndex, teams: FIX.teams });
    assert.deepEqual(rec.drives, rep.drives, `run ${rep.runIndex}: same run`);
    assert.equal(JSON.stringify(stored[rep.runIndex]), JSON.stringify(B.nflRunBoxScore(rec)), `run ${rep.runIndex}: stored box = folded box`);
    const box = stored[rep.runIndex];
    B.reconcileRunBox(box, { drives: rep.drives, final: rep.final });
    for (const s of ["home", "away"]) assert.equal(box[s].team.points, rep.quarters[s].reduce((a, b) => a + b, 0), `run ${rep.runIndex} ${s}: = stored points by period`);
  }
  const read = S.storedRunBoxes(fixture);
  assert.equal(read.error, null);
  assert.deepEqual(read.refusals, {});
  assert.equal(Object.keys(read.boxes).length, new Set(fixture.representativeRuns.map((x) => x.runIndex)).size);
});

test("producer script writes the field through buildNflSimulationReceipt with the run's players", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-sim-v2-shadow.mjs"), "utf8");
  assert.match(src, /buildNflSimulationReceipt\(\{[\s\S]*?\bprep\b[\s\S]*?\}\)/, "the shadow build passes prep (players) to the receipt builder");
});

test("reader fails closed: no field, wrong schema, sha mismatch, tampered box, tampered drives", () => {
  const none = S.storedRunBoxes(withoutField);
  assert.equal(none.error.code, "NOT_RECORDED");
  assert.deepEqual(none.boxes, {});
  // every committed receipt predates the field: all read as NOT_RECORDED, none rewritten
  for (const e of SHADOW.filter((x) => !(S.RUN_BOX_RECORD_FIELD in x.receipt)).slice(0, 20)) assert.equal(S.storedRunBoxes(e.receipt).error.code, "NOT_RECORDED");

  const rec = fixture[S.RUN_BOX_RECORD_FIELD];
  assert.equal(S.storedRunBoxes({ ...fixture, [S.RUN_BOX_RECORD_FIELD]: { ...rec, schemaVersion: "x@9" } }).error.code, "RECORD_SCHEMA");
  const packEdit = structuredClone(rec.pack);
  packEdit.r[0][1] += 1; // home final
  assert.equal(S.storedRunBoxes({ ...fixture, [S.RUN_BOX_RECORD_FIELD]: { ...rec, pack: packEdit } }).error.code, "SHA_MISMATCH");

  // a box edited AND re-hashed still fails its reconciliation to the stored drives
  const boxes = B.unpackRunBoxes(rec.pack);
  const k = Object.keys(boxes)[0];
  const side = boxes[k].home.rushing.length ? "home" : "away";
  boxes[k][side].rushing[0].rushYds += 5;
  const pack2 = B.packRunBoxes(boxes);
  const res = S.storedRunBoxes({ ...fixture, [S.RUN_BOX_RECORD_FIELD]: { ...rec, pack: pack2, sha256: S.runBoxRecordSha(pack2, rec.refusals) } });
  assert.equal(res.boxes[k], undefined);
  assert.equal(res.refusals[k].code, "RUSH");

  // the stored drives moved (e.g. a TD drive relabelled): the box no longer reconciles
  const reps = structuredClone(fixture.representativeRuns);
  const d = reps[0].drives.find((x) => x.result === "TD");
  d.result = "FG";
  const res2 = S.storedRunBoxes({ ...fixture, representativeRuns: reps });
  assert.ok(res2.refusals[String(reps[0].runIndex)], "refused");
  assert.equal(res2.boxes[String(reps[0].runIndex)], undefined);
});

// ── page ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("page: a receipt carrying the field renders the player box; one without it renders the unavailable state", () => {
  const a = adaptReceipt(fixture, { file: "fixture" });
  assert.ok(a.ok, "fixture adapts");
  const sample = a.manifest.samples[0];
  const ready = renderToStaticMarkup(React.createElement(BoxScoreForRun, { manifest: a.manifest, sample, runBoxes: S.storedRunBoxes(fixture) }));
  assert.match(ready, new RegExp(`data-strb-state="ready" data-strb-run="${sample.runIndex}"`));
  assert.match(ready, /data-strb-player=/);
  const bare = renderToStaticMarkup(React.createElement(BoxScoreForRun, { manifest: a.manifest, sample, runBoxes: S.storedRunBoxes(withoutField) }));
  assert.match(bare, /data-strb-state="unavailable"/);
  assert.match(bare, /data-strb-error="NOT_RECORDED"/);
  assert.ok(bare.includes(B.RUN_BOX_UNAVAILABLE));
  assert.ok(!/data-strb-player/.test(bare), "no player numbers without a stored box");

  // the public section end to end (reads only the receipt it is handed + the official snapshot it already read)
  const sec = (receipt) => renderToStaticMarkup(React.createElement(PublicTheaterSection, { rec: { eventId: EVENT, file: "fixture", receipt, showable: true, refusals: [] } }));
  const h1 = sec(fixture);
  assert.match(h1, /data-stp-state="ready"/);
  assert.match(h1, /data-strb-state="ready"/);
  const h2 = sec(withoutField);
  assert.match(h2, /data-stp-state="ready"/);
  assert.match(h2, /data-strb-state="unavailable"/);
  assert.ok(!/data-strb-player/.test(h2));
});

test("no public route or component imports the re-derivation module (it reads role shares / injuries)", () => {
  const roots = ["src/app", "src/components"].map((d) => path.join(APP, d));
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(tsx?|mjs)$/.test(f.name) && !f.name.includes(".test.") && /sim-v2\/player-run/.test(fs.readFileSync(p, "utf8"))) offenders.push(path.relative(APP, p));
    }
  };
  roots.forEach(walk);
  assert.deepEqual(offenders, []);
});
