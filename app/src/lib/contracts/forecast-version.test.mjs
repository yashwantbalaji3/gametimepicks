/**
 * CONTRACT-001 · every committed `forecast-ledger@1` row projects into the canonical contract without changing
 * historical meaning, and every field the ledger never recorded stays null AND classified.
 *
 * Run: npx tsx --test src/lib/contracts/forecast-version.test.mjs
 *
 * Roadmap acceptance (CONTRACT-001): current MLB/NFL sample forecasts project without changing historical meaning;
 * legacy missing provenance remains null/classified, never fabricated; research models remain isolated.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { projectForecastVersion, projectSettlement, ContractRefusal, CONTRACTS, NULL_REASON } from "./forecast-version.mjs";
import { statusCounts } from "../results/v2/forecast-record.mjs";

const LEDGER = path.join(process.cwd(), "..", "data/internal/forecast-ledger/v1");
const rows = fs.readdirSync(LEDGER).filter((f) => f.endsWith(".jsonl"))
  .flatMap((f) => fs.readFileSync(path.join(LEDGER, f), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)));

test("every committed row projects; identity, values and model fields are unchanged", () => {
  assert.ok(rows.length > 10000, `${rows.length} rows`);
  const sports = new Set();
  for (const r of rows) {
    const f = projectForecastVersion(r);
    sports.add(f.event.sport);
    assert.equal(f.contract, CONTRACTS.forecastVersion);
    assert.equal(f.forecastId, r.forecastId);
    assert.equal(f.event.eventId, r.eventId);
    assert.equal(f.subject.id, r.subjectId);
    assert.equal(f.target.family, r.family);
    assert.equal(f.quantity.probability, r.probability ?? null);
    assert.equal(f.quantity.projection, r.projection ?? null);
    assert.deepEqual(f.quantity.classProbabilities, r.classProbabilities ?? null);
    assert.equal(f.model.version, r.modelVersion ?? null);
    assert.equal(f.timing.ownerTimestamp, r.publishedAt ?? null);
  }
  for (const s of ["MLB", "NFL"]) assert.ok(sports.has(s), `${s} rows project`);
});

test("missing provenance stays null and classified — publication is never inferred from an owner timestamp", () => {
  for (const r of rows) {
    const f = projectForecastVersion(r);
    assert.equal(f.timing.publishedAt, null);
    assert.equal(f.timing.publicationEvidence, null);
    assert.equal(f.nullReasons["timing.publishedAt"], NULL_REASON.NO_PUBLICATION_EVIDENCE);
    for (const k of ["predecessor", "worldReceiptRef", "featureSnapshotRef"]) {
      assert.equal(f[k], null);
      assert.equal(f.nullReasons[k], NULL_REASON.LEGACY_UNRECORDED);
    }
    if (r.modelVersion == null) assert.equal(f.nullReasons["model.version"], NULL_REASON.LEGACY_UNRECORDED);
  }
});

test("the horizon is derived, and every valid public row is pregame", () => {
  const h = new Map();
  for (const r of rows) { const k = projectForecastVersion(r).horizon; h.set(k, (h.get(k) ?? 0) + 1); }
  assert.equal(h.get("INVALID_NOT_PREGAME") ?? 0, 0, "the ledger never holds a row stamped at/after its start");
  assert.ok((h.get("PREGAME") ?? 0) > 10000);
});

test("settlement: pending, void and no-measurement are never decisive; decisive = SETTLED WIN/LOSS exactly", () => {
  let decisive = 0, expected = 0;
  for (const r of rows) {
    const s = projectSettlement(r);
    if (s.decisive) decisive++;
    const dr = r.measurement?.directionalResult;
    if (r.settlement.state === "SETTLED" && (dr === "WIN" || dr === "LOSS")) expected++;
    if (r.settlement.state !== "SETTLED") assert.equal(s.decisive, false, `${r.forecastId} ${r.settlement.state}`);
    if (s.state === "VOID" && s.result != null) assert.equal(s.result, "PUSH", "a void can carry only a push");
    assert.equal(s.corrections.chain, null);
    assert.equal(s.nullReasons["corrections.chain"], NULL_REASON.LEGACY_COUNT_ONLY);
  }
  assert.equal(decisive, expected);
  // Parity with the Results record's own status counts: projection changes no denominator.
  const c = statusCounts(rows);
  assert.equal(rows.filter((r) => projectSettlement(r).state === "PENDING").length, c.pending, "pending rows keep their count");
  assert.equal(c.published + c.withdrawn, rows.length);
});

test("research / shadow / withheld rows never project", () => {
  const base = rows[0];
  for (const status of ["SHADOW", "RESEARCH_ONLY", "WITHHELD", "UNAVAILABLE"]) {
    assert.throws(() => projectForecastVersion({ ...base, publicationStatus: status }), ContractRefusal);
  }
  assert.throws(() => projectForecastVersion({ ...base, schemaVersion: "forecast-ledger@2" }), ContractRefusal);
});
