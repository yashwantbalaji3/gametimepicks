/**
 * Release C guards (Program 177): the paper-product gate is a CONTRACT in the money path, the NFL
 * evaluation is a real finding rather than an absence, and the machinery that refuses today would
 * genuinely qualify a validated leg.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { evaluateNflProductEligibility, PRODUCT_ELIGIBILITY_STATES } from "./product-eligibility.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const artifact = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/product-eligibility.json"), "utf8"));
const index = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/index.json"), "utf8"));
const accounting = fs.readFileSync(path.join(APP, "src/lib/daily-portfolio/accounting.ts"), "utf8");
const registry = fs.readFileSync(path.join(APP, "src/lib/daily-portfolio/sport-eligibility.ts"), "utf8");

const NOW = "2026-08-14T02:15:02Z";
const baseEvent = (over = {}) => ({
  canonicalEventId: "nfl-1", matchup: "AAA @ BBB", kickoffUtc: "2026-08-14T23:00Z",
  lifecycle: "UPCOMING", state: "EXPERIMENTAL_LEAN", ...over,
});

test("THE MACHINERY WORKS — a validated event qualifies, so today's refusal is the gate, not a stub", () => {
  const refused = evaluateNflProductEligibility({ events: [baseEvent()], nowIso: NOW });
  assert.equal(refused.qualifyingEvents, 0);
  assert.equal(refused.products[0].state, "EVALUATED_NONE_QUALIFY");

  // same evaluator, same call shape, one field different
  const allowed = evaluateNflProductEligibility({ events: [baseEvent({ state: "VALIDATED_PICK" })], nowIso: NOW });
  assert.equal(allowed.qualifyingEvents, 1, "a VALIDATED_PICK event must pass — otherwise the refusal proves nothing");
  assert.equal(allowed.products[0].state, "ELIGIBLE");
  assert.equal(allowed.products[0].eligible, true);
});

test("'we could not look' is never reported as 'nothing qualified'", () => {
  const empty = evaluateNflProductEligibility({ events: [], nowIso: NOW });
  assert.equal(empty.products[0].state, "NO_EVENTS");
  assert.match(empty.products[0].reason, /says nothing about the model/);
  // and a started game is not counted as a failed candidate
  const started = evaluateNflProductEligibility({ events: [baseEvent({ lifecycle: "STARTED" })], nowIso: NOW });
  assert.equal(started.consideredEvents, 0);
  assert.equal(started.products[0].state, "NO_EVENTS");

  // the script refuses outright when the canonical index is missing
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-product-eligibility.mjs"), "utf8");
  assert.match(src, /REFUSED: no canonical NFL index/);
  assert.match(src, /an absence of data about the model/);
});

test("every state is from the closed set and every product carries a stated reason", () => {
  for (const p of artifact.products) {
    assert.ok(PRODUCT_ELIGIBILITY_STATES.includes(p.state), `${p.state} outside the closed set`);
    assert.ok(p.reason && p.reason.length > 30, `${p.product} must explain itself`);
    assert.equal(typeof p.eligible, "boolean");
  }
  assert.equal(artifact.dataClass, "PUBLIC_DERIVED");
  assert.match(artifact.gate, /permitsProductLeg/);
});

test("the Vault keeps its OWN state — this evaluator never re-decides it", () => {
  const vaultRow = artifact.products.find((p) => p.product === "end-zone-vault");
  assert.equal(vaultRow.state, "PRODUCT_GATED");
  const vault = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/end-zone-vault/latest.json"), "utf8"));
  assert.ok(vaultRow.reason.includes(vault.state), "the Vault's own outcome is quoted, not recomputed");
  assert.ok(vaultRow.reason.includes(vault.reason), "including its own reason verbatim");
});

test("THE MONEY PATH enforces the same gate — the omission is now a rule", () => {
  // the sport check runs inside laneEligibility, before the per-leg timing checks
  assert.match(accounting, /legSportEligibility/);
  const fn = accounting.slice(accounting.indexOf("export function laneEligibility"), accounting.indexOf("function whyThisCard"));
  assert.match(fn, /const v = legSportEligibility\(l\)/);
  assert.ok(fn.indexOf("legSportEligibility") < fn.indexOf("has no machine kickoff"),
    "the sport gate is checked before the leg-timing gates");
  // fail-closed: an unregistered sport is refused rather than defaulting to allowed
  assert.match(registry, /an unregistered sport is refused, never allowed by default/);
  assert.match(registry, /"we did not think about it" must not read as "it is fine"/);
});

test("the registry refuses NFL for a stated reason and names what would change it", async () => {
  const { legSportEligibility, SPORT_LEG_RULES, eligibleLegSports } = await import("../../daily-portfolio/sport-eligibility.ts");
  assert.equal(SPORT_LEG_RULES.NFL.eligible, false);
  assert.ok(SPORT_LEG_RULES.NFL.whatWouldQualify.length >= 2);
  assert.match(SPORT_LEG_RULES.NFL.reason, /VALIDATED_PICK/);
  // the eligible set is DERIVED from the registry, never hand-listed
  assert.deepEqual(eligibleLegSports().sort(), ["MLB", "WORLD_CUP"]);
  // absent sport means World Cup, per ModelPick's own contract — existing lanes are unaffected
  assert.equal(legSportEligibility({}).eligible, true);
  assert.equal(legSportEligibility({ sport: "MLB" }).eligible, true);
  assert.equal(legSportEligibility({ sport: "NFL" }).eligible, false);
  const unknown = legSportEligibility({ sport: "curling" });
  assert.equal(unknown.eligible, false);
  assert.equal(unknown.unregistered, true);
});

test("PROTECTED MONEY IS BYTE-IDENTICAL — adding a gate changed no existing lane", () => {
  assert.equal(crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"))).digest("hex"), "affe6b21071f2b3be96bb2774eb347c3");
  assert.equal(crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/bank-builder-locks.json"))).digest("hex"), "cb80473f88f3cb5f67208fa568925295");
});

test("the ledger is append-only and today's entry matches the published artifact", () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/nfl/product-eligibility/ledger.json"), "utf8"));
  const dates = ledger.entries.map((e) => e.date);
  assert.equal(new Set(dates).size, dates.length, "one entry per day — append-only");
  const today = ledger.entries.find((e) => e.date === artifact.generatedAt.slice(0, 10));
  assert.ok(today, "the published artifact's day is recorded");
  assert.equal(today.qualifyingEvents, artifact.qualifyingEvents);
});

test("the evaluation is consistent with the canonical index it consumed", () => {
  const preKickoff = index.events.filter((e) => e.lifecycle === "UPCOMING");
  assert.equal(artifact.consideredEvents, preKickoff.length,
    "every pre-kickoff event in the index was considered — no silent sampling");
  assert.equal(artifact.indexGeneratedAt, index.generatedAt);
});

test("no product language leaks into a refusal", () => {
  const blob = JSON.stringify(artifact);
  for (const bannedKey of ["stake", "payout", "exposure", "combinedOdds", "roi"]) {
    assert.doesNotMatch(blob, new RegExp(`"${bannedKey}"\\s*:`, "i"), `a refusal must not carry a "${bannedKey}" field`);
  }
  for (const banned of ["edge", "lock", "best bet", "guaranteed", "profitable"]) {
    assert.doesNotMatch(blob, new RegExp(`\\b${banned}\\b`, "i"), `must not contain "${banned}"`);
  }
});
