/**
 * Shadow receipt SCHEMA UPGRADE (2026-11-11): an upcoming game whose only receipt for its inputs predates the current
 * receipt schema gets a NEW current-schema receipt beside it (write-once, never a rewrite); a started game is never
 * touched; same schema + unchanged inputs still skips; the receipt of record is the latest one before kickoff.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { existingReceiptIndex, planShadowReceipt, schemaTag } from "../../../../../scripts/nfl/build-nfl-sim-v2-shadow.mjs";
import { compileParams, prepareTeamPlayers } from "./engine.mjs";
import { calibrate, runBatch } from "./simulate.mjs";
import { buildNflSimulationReceipt, SIMULATION_RECEIPT_SCHEMA, validateSimulationReceipt } from "./receipt.mjs";
import { receiptsOfRecord } from "../qb-props-grade.mjs";

const ROOT = path.resolve(process.cwd(), "..");
const compiled = compileParams(JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/sim-v2/drive-params-2015-2025.json"), "utf8")));
const NOW = Date.parse("2031-10-05T12:00:00Z");
const KICK = "2031-10-05T17:00:00Z";
const BASE = "nfl-sim-v2:999:abcdef0123456789";
const plan = (existing, kickoffUtc = KICK) => planShadowReceipt({ eventId: "999", inputHash: "abcdef0123456789", kickoffUtc, nowMs: NOW, existing: new Map(existing) });

test("an upcoming game with an @2 receipt and unchanged inputs gets a new @2.2 receipt under a new id and file", () => {
  assert.equal(SIMULATION_RECEIPT_SCHEMA, "simulation-receipt@2.2");
  const p = plan([[BASE, "simulation-receipt@2"]]);
  assert.equal(p.action, "SCHEMA_UPGRADE");
  assert.equal(p.id, `${BASE}:s2.2`);
  assert.notEqual(p.id, BASE);
  assert.equal(p.fileStem, "999-abcdef0123456789-s2.2");
  assert.equal(p.id.split(":")[2], "abcdef0123456789", "the replay's input-hash segment is unchanged");
  /* @2.1 is older too */
  assert.equal(plan([[BASE, "simulation-receipt@2.1"]]).action, "SCHEMA_UPGRADE");
});

test("a started game is never touched, whatever its receipt schema", () => {
  assert.deepEqual(plan([[BASE, "simulation-receipt@2"]], "2031-10-05T12:00:00Z"), { action: "STARTED" });
  assert.deepEqual(plan([[BASE, "simulation-receipt@2"]], "2031-10-05T11:00:00Z"), { action: "STARTED" });
  /* control: one second before kickoff it is still upcoming */
  assert.equal(plan([[BASE, "simulation-receipt@2"]], "2031-10-05T12:00:01Z").action, "SCHEMA_UPGRADE");
});

test("same schema + unchanged inputs still skips; the upgrade is idempotent; changed inputs are a plain new receipt", () => {
  assert.equal(plan([[BASE, SIMULATION_RECEIPT_SCHEMA]]).action, "UNCHANGED");
  assert.deepEqual(plan([[BASE, "simulation-receipt@2"], [`${BASE}:s2.2`, SIMULATION_RECEIPT_SCHEMA]]), { action: "UNCHANGED", id: `${BASE}:s2.2` });
  const fresh = plan([["nfl-sim-v2:999:0000000000000000", "simulation-receipt@2"]]);
  assert.deepEqual(fresh, { action: "NEW", id: BASE, idSuffix: null, fileStem: "999-abcdef0123456789" });
  assert.equal(schemaTag("simulation-receipt@2.2"), "s2.2");
});

function smallReceipt(idSuffix) {
  const team = (tag) => prepareTeamPlayers({ players: [
    { playerId: `${tag}-qb`, name: "QB", position: "QB", passShare: 1, targetShare: 0, carryShare: 0.15, catchRate: null, ypr: null, ypc: 4.8 },
    { playerId: `${tag}-rb`, name: "RB", position: "RB", passShare: 0, targetShare: 0.2, carryShare: 0.85, catchRate: 0.78, ypr: 7.5, ypc: 4.3 },
    { playerId: `${tag}-wr`, name: "WR", position: "WR", passShare: 0, targetShare: 0.8, carryShare: 0, catchRate: 0.64, ypr: 13.2, ypc: null },
  ] });
  const prep = [team("h"), team("a")];
  const anchors = { home: 24, away: 21, source: "test", modelVersion: { forecastModel: "t" } };
  const calibration = calibrate({ compiled, anchors, baseSeed: "a1b2c3d4", runs: 300 });
  const batch = runBatch({ compiled, thetas: calibration.thetas, players: prep, baseSeed: "a1b2c3d4", runs: 400 });
  return buildNflSimulationReceipt({
    event: { eventId: "999", kickoffUtc: KICK, home: { abbr: "HOM" }, away: { abbr: "AWY" } },
    compiled, paramsRef: { file: "x" }, anchors, calibration, prep, batch, baseSeed: "a1b2c3d4", inputHash: "abcdef0123456789", generatedAt: "2031-10-05T12:00:00Z", inputs: {}, idSuffix,
  });
}

test("history is byte-identical: the upgrade only ADDS a file; a second run writes nothing; the new receipt is of record", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shadow-upgrade-"));
  try {
    /* a real pre-#1302 receipt (schema @2) as history */
    const day = path.join(dir, "2031-10-04");
    fs.mkdirSync(day);
    const old = { ...JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/sim-v2/shadow/2026-11-11/401873052-afcdb0f64da51a69.json"), "utf8")), simulationReceiptId: BASE, eventId: "999", eventStart: KICK, generatedAt: "2031-10-04T01:00:00Z" };
    assert.equal(old.schemaVersion, "simulation-receipt@2");
    const oldFile = path.join(day, "999-abcdef0123456789.json");
    fs.writeFileSync(oldFile, JSON.stringify(old) + "\n");
    const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
    const before = sha(oldFile);

    const p = plan(existingReceiptIndex(dir));
    assert.equal(p.action, "SCHEMA_UPGRADE");
    const receipt = smallReceipt(p.idSuffix);
    const out = path.join(dir, "2031-10-05", `${p.fileStem}.json`);
    fs.mkdirSync(path.dirname(out));
    fs.writeFileSync(out, JSON.stringify(receipt) + "\n", { flag: "wx" });
    assert.throws(() => fs.writeFileSync(out, "{}", { flag: "wx" }), /EEXIST/, "write-once");

    assert.equal(sha(oldFile), before, "the @2 receipt is byte-identical");
    assert.deepEqual(fs.readdirSync(dir).sort(), ["2031-10-04", "2031-10-05"]);
    assert.equal(plan(existingReceiptIndex(dir)).action, "UNCHANGED", "the next hourly run writes nothing");

    const entries = [{ file: "2031-10-04/999-abcdef0123456789.json", receipt: old }, { file: "2031-10-05/999-abcdef0123456789-s2.2.json", receipt }];
    const { records } = receiptsOfRecord(entries, { from: "2031-01-01" });
    assert.equal(records.length, 1);
    assert.equal(records[0].receipt.simulationReceiptId, `${BASE}:s2.2`);
    assert.equal(records[0].receipt.schemaVersion, SIMULATION_RECEIPT_SCHEMA);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("determinism: the upgraded receipt is byte-identical across builds and passes the receipt contract", () => {
  const a = smallReceipt("s2.2");
  const b = smallReceipt("s2.2");
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.simulationReceiptId, `${BASE}:s2.2`);
  assert.deepEqual(validateSimulationReceipt(a), []);
  assert.ok(a.playerStatDistributions.some((p) => p.countPmf?.passTd), "the @2.2 receipt carries count PMFs");
  /* control: without the suffix the id is the plain form */
  assert.equal(smallReceipt(null).simulationReceiptId, BASE);
});
