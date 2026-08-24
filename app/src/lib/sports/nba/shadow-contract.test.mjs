/**
 * NBA shadow-contract guards (Program 198 · Release A2) — the refusals are reachable and the
 * runnable state is NOT, on today's real flags.
 *
 * Run: npx tsx --test src/lib/sports/nba/shadow-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveNbaInputs, nbaShadowRung, NBA_INPUT_STATES } from "./shadow-contract.mjs";
import { NBA_CONTRACT_FLAGS } from "../../nba/identity-contract.ts";

const NOW = "2026-10-20T18:00:00Z";
const healthyInputs = { schedule: "AVAILABLE", strength: "AVAILABLE", lineups: "AVAILABLE", prices: "AVAILABLE" };

test("ON TODAY'S REAL FLAGS the contract refuses before reading anything else", () => {
  const r = nbaShadowRung({ eventStartUtc: "2026-10-21T00:00:00Z", nowIso: NOW, inputs: healthyInputs });
  assert.equal(r.rung, "REFUSED_ACTIVATION_OFF", "activation OFF outranks every other gate — the default is refusal");
  assert.equal(NBA_CONTRACT_FLAGS.approvedForProduction, false, "and the flags this reads are the committed ones");
});

test("post-start refuses even with activation granted — a read after tip is not evidence", () => {
  const flags = { public: true, approvedForProduction: true, publicActivation: true };
  const r = nbaShadowRung({ eventStartUtc: "2026-10-20T17:00:00Z", nowIso: NOW, inputs: healthyInputs, flags });
  assert.equal(r.rung, "REFUSED_POST_START");
});

test("a blocked input names itself — READY_EXCEPT_<CAUSE>, never a default", () => {
  const flags = { public: true, approvedForProduction: true, publicActivation: true };
  const inputs = deriveNbaInputs({
    schedule: { stamp: "2026-10-20T13:00:00Z" },
    strength: { present: true },
    lineupRights: { decided: false, source: null },
    priceAuthorization: { authorized: false },
    nowIso: NOW,
  });
  assert.equal(inputs.lineups, "BLOCKED_EXTERNAL", "an undecided rights question is BLOCKED, not missing and never available");
  assert.equal(inputs.prices, "BLOCKED_EXTERNAL", "no NBA-scoped odds receipt exists; another sport's receipt cannot serve");
  const r = nbaShadowRung({ eventStartUtc: "2026-10-21T00:00:00Z", nowIso: NOW, inputs, flags });
  assert.match(r.rung, /^READY_EXCEPT_/);
  for (const v of Object.values(inputs)) assert.ok(NBA_INPUT_STATES.includes(v));
});

test("CURRENT_PRE_EVENT is reachable only when every real gate opens — the fixture proves the shape, not the state", () => {
  const flags = { public: true, approvedForProduction: true, publicActivation: true };
  const r = nbaShadowRung({ eventStartUtc: "2026-10-21T00:00:00Z", nowIso: NOW, inputs: healthyInputs, flags });
  assert.equal(r.rung, "CURRENT_PRE_EVENT");
  // and the ONLY way this test reached it was by fabricating flags a caller cannot fabricate:
  // the real flags are frozen in the identity contract and asserted OFF above.
});

test("a stale schedule types STALE from its own stamp — absence of freshness is not freshness", () => {
  const inputs = deriveNbaInputs({
    schedule: { stamp: "2026-10-15T13:00:00Z" }, strength: { present: true },
    lineupRights: { decided: true, source: "licensed" }, priceAuthorization: { authorized: true },
    nowIso: NOW,
  });
  assert.equal(inputs.schedule, "STALE");
});
