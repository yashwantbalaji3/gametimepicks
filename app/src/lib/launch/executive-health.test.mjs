/**
 * Release J guards (Program 172): the executive strip is derived, fail-closed, worst-first, and
 * cannot be made green by an absent artifact.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildExecutiveHealth, HEALTH_STATES } from "./executive-health.mjs";

const NOW = "2026-08-13T13:30:00Z";
const ET = "2026-08-13";
const base = {
  nowIso: NOW, etDate: ET,
  adminStatus: { slate: { mlbSlate: ET, mlbGames: 9 } },
  productReceipt: { products: [
    { product: "bank-builder", state: "ACTIVE", reason: "one lane qualified", card: [{ id: "x" }] },
    { product: "moonshot", state: "NO_PLAY", reason: "evaluation completed and nothing met policy" },
    { product: "end-zone-vault", state: "NO_PLAY", reason: "held" },
  ] },
  nflLane: { cadence: { state: "PROVEN", detail: "terminal receipts" }, credits: { state: "AUTHORIZED", programSpend: 12, ceiling: 3000, remainingProgram: 2988 } },
  nflStatus: { teamSimulation: { state: "LIVE", headline: "live", nextGate: null } },
  settlementReceipt: { date: ET, accounting: { reconciles: true, settled: 3, pending: 0 } },
  buildInfo: { builtAt: "2026-08-13T12:00:00Z" },
};

test("nine lanes, every state inside the closed set, each carrying its evidence path", () => {
  const h = buildExecutiveHealth(base);
  assert.equal(h.lanes.length, 9);
  for (const l of h.lanes) {
    assert.ok(HEALTH_STATES.includes(l.state));
    assert.ok(l.evidence && l.evidence.length > 5, `${l.id} must name the artifact that proves it`);
  }
  // this fixture holds two products, so worst-of is HOLDING — a legitimate hold is not "green",
  // and pretending otherwise is exactly the overstatement the strip exists to prevent
  assert.equal(h.overall, "HOLDING");
  const allActive = buildExecutiveHealth({
    ...base,
    productReceipt: { products: base.productReceipt.products.map((p) => ({ ...p, state: "ACTIVE", card: [{ id: "x" }] })) },
  });
  assert.equal(allActive.overall, "HEALTHY", "only an all-running day is green");
});

test("ABSENT EVIDENCE IS UNKNOWN — never green, never a silent zero", () => {
  const h = buildExecutiveHealth({ nowIso: NOW, etDate: ET });
  const byId = Object.fromEntries(h.lanes.map((l) => [l.id, l]));
  for (const id of ["mlb-daily", "bank-builder", "moonshot", "vault", "nfl-daily", "settlement", "public-site", "credits"]) {
    assert.equal(byId[id].state, "UNKNOWN", `${id} must be UNKNOWN with no artifact`);
  }
  assert.equal(h.overall, "UNKNOWN");
});

test("worst-of overall — one incident is never averaged away by eight greens", () => {
  const h = buildExecutiveHealth({
    ...base,
    settlementReceipt: { date: ET, accounting: { reconciles: false } },
  });
  assert.equal(h.overall, "INCIDENT");
  assert.equal(h.ordered[0].id, "settlement", "the worst lane sorts first, never buried");
});

test("a stale slate is DEGRADED and says what it waits on", () => {
  const h = buildExecutiveHealth({ ...base, adminStatus: { slate: { mlbSlate: "2026-08-12", mlbGames: 15 } } });
  const mlb = h.lanes.find((l) => l.id === "mlb-daily");
  assert.equal(mlb.state, "DEGRADED");
  assert.match(mlb.detail, /has not published yet/);
  assert.ok(mlb.nextAction, "a degraded lane names the next action");
});

test("INPUTS_MISSING degrades a product; NO_PLAY only holds it", () => {
  const h = buildExecutiveHealth({
    ...base,
    productReceipt: { products: [
      { product: "bank-builder", state: "INPUTS_MISSING", reason: "no board" },
      { product: "moonshot", state: "NO_PLAY", reason: "nothing met policy" },
      { product: "end-zone-vault", state: "INCIDENT", reason: "boom" },
    ] },
  });
  const by = Object.fromEntries(h.lanes.map((l) => [l.id, l.state]));
  assert.equal(by["bank-builder"], "DEGRADED", "a missing slate is an operational problem");
  assert.equal(by.moonshot, "HOLDING", "a real no-play is not a failure");
  assert.equal(by.vault, "INCIDENT");
  assert.equal(h.overall, "INCIDENT");
});

test("credits go BLOCKED_EXTERNAL at the ceiling, and a stale export degrades the site", () => {
  const spent = buildExecutiveHealth({ ...base, nflLane: { ...base.nflLane, credits: { state: "AUTHORIZED", programSpend: 3000, ceiling: 3000, remainingProgram: 0 } } });
  assert.equal(spent.lanes.find((l) => l.id === "credits").state, "BLOCKED_EXTERNAL");
  const old = buildExecutiveHealth({ ...base, buildInfo: { builtAt: "2026-08-11T00:00:00Z" } });
  assert.equal(old.lanes.find((l) => l.id === "public-site").state, "DEGRADED");
});

test("the strip is pure — it reads no files itself, so /launch owns loading", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/launch/executive-health.mjs"), "utf8");
  assert.doesNotMatch(src, /readFileSync|node:fs|require\(/, "a pure function over already-loaded artifacts");
});
