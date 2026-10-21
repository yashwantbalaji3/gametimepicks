/**
 * NBA product leg adapter. Run (from app/): npx tsx --test src/lib/products/nba/nba-leg.test.mjs
 *
 * Synthetic inputs are TEST FIXTURES (./__fixtures__/permissive.mjs): no real NBA price exists, so every price below
 * is invented and labelled. Test (a) runs the adapter over every committed v0.1 game with the REAL registry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LEAN, evaluateMarket } from "../../consistency/market-evaluator.mjs";
import { NBA_PLAYER_FAMILIES, SnapshotRefusal, nbaOfficialSnapshot } from "../../consistency/official-snapshot.mjs";
import { canEnterPredictionProducts, capabilityState } from "../../sport-capability-registry.ts";
import { HANDOFF, NBA_LEG_SCHEMA, PROVENANCE, REFUSAL, nbaLegFromEvaluation } from "./nba-leg.mjs";
import { NBA_PRODUCT_TIERS, RISK_OVERCLAIM, TIER_REASON, tierView } from "./product-tiers.mjs";
import { CURRENT_POLICY } from "../selection-policy.mjs";
import { CAPTURED_AT, NOW, PERMISSIVE_REGISTRY, PRICE, TEST_FIXTURE, evaluate, permissiveSnapshot, realShapeSnapshot, verificationFor } from "./__fixtures__/permissive.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const V01_DIR = path.join(REPO, "data", "internal", "research", "nba", "experimental-v0.1", "forecasts");

test("TEST FIXTURE label is present on every synthetic input", () => {
  assert.match(TEST_FIXTURE, /TEST FIXTURE/);
  assert.match(PERMISSIVE_REGISTRY.source, /TEST_FIXTURE/);
  assert.match(verificationFor(evaluate(permissiveSnapshot())).label, /TEST FIXTURE/);
});

test("(a) today: every real NBA evaluation refuses — real registry, every committed v0.1 game, player and family", () => {
  assert.equal(canEnterPredictionProducts("nba"), false, "precondition: the registry keeps NBA out of products");
  const files = fs.readdirSync(V01_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  assert.ok(files.length > 0, "committed v0.1 forecast files exist");
  // TEST FIXTURE prices: a balanced pair and two skewed pairs, so some evaluations carry a lean.
  const prices = [{ book: "draftkings", overAmerican: -110, underAmerican: -110 }, { book: "draftkings", overAmerican: 120, underAmerican: -145 }, { book: "draftkings", overAmerican: -145, underAmerican: 120 }];
  let evaluations = 0, withLean = 0, snapshots = 0, refusedSnapshots = 0;
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(V01_DIR, f), "utf8"));
    for (const g of doc.games ?? []) {
      let s;
      try { s = nbaOfficialSnapshot(g.providerEventId, { official: { doc, path: `data/internal/research/nba/experimental-v0.1/forecasts/${f}` } }); } catch (e) {
        if (e instanceof SnapshotRefusal) { refusedSnapshots += 1; continue; }
        throw e;
      }
      snapshots += 1;
      assert.equal(s.capability.canEnterPredictionProducts, false);
      const genMs = Date.parse(s.generatedAt);
      const now = new Date(genMs + 60_000).toISOString();
      const capturedAt = new Date(genMs + 30_000).toISOString();
      for (const p of s.players) {
        for (const family of NBA_PLAYER_FAMILIES) {
          const fam = p.families[family];
          if (!fam) continue;
          const line = Math.floor(fam.median) + 0.5;
          for (const price of prices) {
            const e = evaluateMarket({ snapshot: s, playerId: p.playerId, family, line, book: price.book, overAmerican: price.overAmerican, underAmerican: price.underAmerican, capturedAt, now });
            evaluations += 1;
            if (e.lean !== LEAN.NONE) withLean += 1;
            const r = nbaLegFromEvaluation({ evaluation: e, snapshot: s, verification: verificationFor(e, { price }) });
            assert.equal(r.ok, false, `${s.eventId}/${p.playerId}/${family} must refuse`);
            assert.ok(r.refusal.reasons.includes(REFUSAL.REGISTRY_NOT_PRODUCT_ELIGIBLE));
            assert.ok(r.refusal.reasons.includes(REFUSAL.EVALUATION_NOT_QUALIFIED));
            assert.ok(r.refusal.reasons.includes(REFUSAL.SNAPSHOT_NOT_PUBLIC));
            assert.ok(r.refusal.reasons.includes(REFUSAL.SNAPSHOT_CAPABILITY_CLOSED));
            assert.ok(r.refusal.evaluatorReasons.includes("SPORT_NOT_PRODUCT_ELIGIBLE"));
            assert.equal(r.leg, undefined);
          }
        }
      }
    }
  }
  assert.ok(snapshots > 0 && evaluations > 100, `real coverage: ${snapshots} snapshots, ${evaluations} evaluations (${refusedSnapshots} games refused at the snapshot)`);
  assert.ok(withLean > 0, "some real evaluations carry a visible lean — and still refuse");
});

test("(a) the refusal lists EVERY reason, not the first", () => {
  const r = nbaLegFromEvaluation({ evaluation: null, snapshot: null, verification: null });
  assert.equal(r.ok, false);
  for (const code of [REFUSAL.REGISTRY_NOT_PRODUCT_ELIGIBLE, REFUSAL.NO_EVALUATION, REFUSAL.NO_SNAPSHOT, REFUSAL.NO_VERIFICATION]) assert.ok(r.refusal.reasons.includes(code), code);
  const s = realShapeSnapshot();
  const e = evaluate(s);
  const all = nbaLegFromEvaluation({ evaluation: e, snapshot: s, verification: null });
  assert.deepEqual(all.refusal.reasons.slice().sort(), [REFUSAL.EVALUATION_NOT_QUALIFIED, REFUSAL.NO_VERIFICATION, REFUSAL.REGISTRY_NOT_PRODUCT_ELIGIBLE, REFUSAL.SNAPSHOT_CAPABILITY_CLOSED, REFUSAL.SNAPSHOT_NOT_PUBLIC].sort());
  assert.equal(all.refusal.registry.source, "sport-capability-registry");
  assert.equal(all.refusal.registry.state, capabilityState("nba"));
});

test("(a) even a fully permissive snapshot + verification refuses under the REAL registry", () => {
  const s = permissiveSnapshot();
  const e = evaluate(s);
  assert.equal(e.eligibility.qualified, true, "fixture sanity: the synthetic evaluation is qualified");
  const r = nbaLegFromEvaluation({ evaluation: e, snapshot: s, verification: verificationFor(e) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.refusal.reasons, [REFUSAL.REGISTRY_NOT_PRODUCT_ELIGIBLE]);
});

test("(b) permissive TEST FIXTURE registry + price: the leg carries the evaluator's numbers EXACTLY", () => {
  const s = permissiveSnapshot();
  const e = evaluate(s);
  assert.equal(e.lean, LEAN.OVER);
  const r = nbaLegFromEvaluation({ evaluation: e, snapshot: s, verification: verificationFor(e), registry: PERMISSIVE_REGISTRY });
  assert.equal(r.ok, true, JSON.stringify(r.refusal));
  const leg = r.leg;
  assert.equal(leg.schema, NBA_LEG_SCHEMA);
  assert.equal(leg.provenance, PROVENANCE.TEST_FIXTURE, "an injected registry can never yield an OFFICIAL leg");
  // verbatim — Object.is, never "close to"
  for (const k of ["pOver", "pUnder", "pPush"]) assert.ok(Object.is(leg[k], e[k]), `${k}: ${leg[k]} vs ${e[k]}`);
  assert.deepEqual(leg.ev, e.ev);
  assert.ok(Object.is(leg.ev.over, e.ev.over) && Object.is(leg.ev.under, e.ev.under));
  assert.deepEqual(leg.edge, e.edge);
  assert.deepEqual(leg.implied, e.implied);
  assert.deepEqual(leg.decisive, e.decisive);
  assert.equal(leg.side, e.lean);
  // required identity / stamps
  assert.equal(leg.snapshotId, s.snapshotId);
  assert.equal(leg.eventId, s.eventId);
  assert.equal(leg.providerAthleteId, "11");
  assert.equal(leg.family, "pts");
  assert.equal(leg.line, 23.5);
  assert.equal(leg.book, PRICE.book);
  assert.equal(leg.capturedAt, CAPTURED_AT);
  assert.equal(leg.modelVersion, e.modelVersion);
  assert.equal(leg.frozenAt, s.frozenAt);
  assert.equal(leg.evaluator.identityKey, e.identity.key);
  assert.equal(leg.price.sideAmerican, PRICE.overAmerican);
  assert.ok(Object.isFrozen(leg) && Object.isFrozen(leg.ev));
  // no link, operator name only
  assert.equal(leg.handoff.status, HANDOFF.status);
  assert.equal(leg.handoff.link, null);
  assert.equal(leg.handoff.operatorName, "DraftKings");
  // mutating the evaluation afterwards cannot reach the leg (it is a copy, not a view)
  const e2 = structuredClone(e); e2.pOver = 0.01;
  assert.notEqual(leg.pOver, e2.pOver);
});

test("(b) every gate refuses on its own: verification identity, price parity, link, authorization, range, family", () => {
  const s = permissiveSnapshot();
  const e = evaluate(s);
  const run = (verification, evaluation = e) => nbaLegFromEvaluation({ evaluation, snapshot: s, verification, registry: PERMISSIVE_REGISTRY });
  const one = (r) => (r.ok ? [] : r.refusal.reasons);
  assert.deepEqual(one(run(verificationFor(e, { book: "fanduel" }))), [REFUSAL.VERIFICATION_IDENTITY_MISMATCH]);
  assert.deepEqual(one(run(verificationFor(e, { overAmerican: 115 }))), [REFUSAL.VERIFICATION_PRICE_MISMATCH]);
  assert.deepEqual(one(run(verificationFor(e, { deepLink: "dksb://sportsbook/bet?x=1" }))), [REFUSAL.LINK_PRESENT]);
  assert.deepEqual(one(run(verificationFor(e, { note: "https://sportsbook.example/slip" }))), [REFUSAL.LINK_PRESENT]);
  assert.deepEqual(one(run(verificationFor(e, { authorizationReceiptRef: null }))), [REFUSAL.NO_AUTHORIZATION_RECEIPT]);
  assert.deepEqual(one(run(verificationFor(e, { operatorVerified: false }))), [REFUSAL.OPERATOR_NOT_VERIFIED]);
  assert.deepEqual(one(run(verificationFor(e, { sport: "nfl" }))), [REFUSAL.VERIFICATION_NOT_NBA]);
  // a qualified lean at a price outside LEG_BOUNDS (+400) refuses at the adapter
  const longPrice = { book: "draftkings", overAmerican: 450, underAmerican: -700 };
  const eLong = evaluate(s, { price: longPrice });
  assert.equal(eLong.eligibility.qualified, true, "fixture sanity: the evaluator qualifies the long price");
  assert.ok(one(run(verificationFor(eLong, { price: longPrice }), eLong)).includes(REFUSAL.PRICE_OUT_OF_RANGE));
  // minutes is in the snapshot but is not a product market
  const eMin = evaluate(s, { family: "minutes", line: 30.5, price: { book: "draftkings", overAmerican: 110, underAmerican: -130 } });
  assert.ok(one(run(verificationFor(eMin), eMin)).includes(REFUSAL.FAMILY_NOT_PRODUCT_MARKET));
  // a below-threshold (unqualified) evaluation never becomes a leg, whatever the gates say
  const flat = evaluate(s, { price: { book: "draftkings", overAmerican: -110, underAmerican: -110 } });
  assert.equal(flat.eligibility.qualified, false, "fixture sanity: −110/−110 is below the lean threshold");
  assert.ok(one(run(verificationFor(flat, { price: { book: "draftkings", overAmerican: -110, underAmerican: -110 } }), flat)).includes(REFUSAL.EVALUATION_NOT_QUALIFIED));
  // a snapshot that is not the one evaluated refuses
  const other = realShapeSnapshot();
  const r = nbaLegFromEvaluation({ evaluation: e, snapshot: other, verification: verificationFor(e), registry: PERMISSIVE_REGISTRY });
  assert.ok(r.refusal.reasons.includes(REFUSAL.SNAPSHOT_ID_MISMATCH));
});

test("(c) one identity, one lean: Bank Builder and Moonshot / Longshot tiers differ only in qualification and payout", () => {
  const s = permissiveSnapshot();
  const e = evaluate(s);
  const { leg } = nbaLegFromEvaluation({ evaluation: e, snapshot: s, verification: verificationFor(e), registry: PERMISSIVE_REGISTRY });
  const settles = () => true; // TEST FIXTURE: no NBA player-prop settlement path exists today
  const bb = tierView(leg, "bank-builder", { now: NOW, settles });
  const longshot = tierView(leg, "parlay-lab-longshot", { now: NOW, settles });
  const moon = tierView(leg, "moonshot", { now: NOW, settles });
  for (const v of [bb, longshot, moon]) {
    assert.equal(v.leg, leg, "every tier holds the SAME frozen leg object");
    assert.equal(v.leg.side, e.lean);
    assert.ok(Object.is(v.leg.pOver, e.pOver) && Object.is(v.leg.pUnder, e.pUnder) && Object.is(v.leg.pPush, e.pPush));
    assert.deepEqual(v.leg.ev, e.ev);
  }
  assert.equal(bb.qualification.qualified, true);
  assert.equal(longshot.qualification.qualified, true);
  // Moonshot's frozen policy is team-markets-only: it refuses at qualification, showing the same lean.
  assert.deepEqual([...moon.qualification.reasons], [TIER_REASON.TEAM_MARKETS_ONLY]);
  assert.notEqual(bb.payout, longshot.payout);
  // the only keys a tier adds are tier metadata
  assert.deepEqual(Object.keys(bb).sort(), ["leg", "payout", "product", "qualification", "relativeRisk", "tier"]);
  // and with today's settlement contract (team markets only) no tier qualifies a player leg
  for (const id of Object.keys(NBA_PRODUCT_TIERS)) assert.ok(tierView(leg, id, { now: NOW }).qualification.reasons.includes(TIER_REASON.NO_SETTLEMENT_PATH), id);
});

test("(c) tier timing: a leg is refused once inside the 30-minute cutoff or once its price is stale", () => {
  const s = permissiveSnapshot();
  const e = evaluate(s);
  const { leg } = nbaLegFromEvaluation({ evaluation: e, snapshot: s, verification: verificationFor(e), registry: PERMISSIVE_REGISTRY });
  const settles = () => true;
  const lockMs = Date.parse(leg.eventLockAt);
  assert.equal(lockMs, Date.parse(s.lockAt) - 30 * 60 * 1000);
  assert.ok(tierView(leg, "parlay-lab-low", { now: new Date(lockMs).toISOString(), settles }).qualification.reasons.includes(TIER_REASON.LOCKED));
  const stale = new Date(Date.parse(CAPTURED_AT) + 12 * 3600_000 + 1).toISOString();
  assert.ok(tierView(leg, "parlay-lab-low", { now: stale, settles }).qualification.reasons.includes(TIER_REASON.PRICE_STALE));
});

test("product-risk metadata is relative, never 'safe' / 'guaranteed'", () => {
  for (const [id, t] of Object.entries(NBA_PRODUCT_TIERS)) {
    for (const text of [t.relativeRisk, t.payout, t.note ?? ""]) {
      assert.doesNotMatch(text, RISK_OVERCLAIM, `${id}: ${text}`);
    }
    assert.match(t.relativeRisk, /relative risk|lose/i, `${id} describes risk relative to the other tiers`);
    assert.match(t.relativeRisk, /lose/i, `${id} says cards lose`);
  }
  assert.match("a safe leg", RISK_OVERCLAIM);
  assert.match("guaranteed winner", RISK_OVERCLAIM);
});

/* ── review findings (2026-10-21) ─────────────────────────────────────────────────────────────────────────────────── */
test("an injected registry that NAMES itself the real one still yields a TEST_FIXTURE leg (provenance by identity)", () => {
  const s = permissiveSnapshot(); const e = evaluate(s);
  const impostor = { ...PERMISSIVE_REGISTRY, source: "sport-capability-registry" };
  const r = nbaLegFromEvaluation({ evaluation: e, snapshot: s, verification: verificationFor(e), registry: impostor });
  assert.equal(r.ok, true);
  assert.equal(r.leg.provenance, PROVENANCE.TEST_FIXTURE);
  assert.match(r.leg.registry.source, /^INJECTED\(/);
});

test("an edited copy of a sealed snapshot is refused (SNAPSHOT_SEAL_BROKEN)", () => {
  const s = permissiveSnapshot(); const e = evaluate(s);
  const forged = { ...s, frozenAt: "2026-01-01T00:00:00.000Z" }; // same snapshotId, different body
  const r = nbaLegFromEvaluation({ evaluation: e, snapshot: forged, verification: verificationFor(e), registry: PERMISSIVE_REGISTRY });
  assert.equal(r.ok, false);
  assert.ok(r.refusal.reasons.includes(REFUSAL.SNAPSHOT_SEAL_BROKEN));
});

test("Moonshot's tier view describes the policy Moonshot runs today, never the retired @1 design", () => {
  assert.equal(NBA_PRODUCT_TIERS.moonshot.policy, CURRENT_POLICY.moonshot);
  assert.doesNotMatch(NBA_PRODUCT_TIERS.moonshot.payout, /\+700|3–5-leg/);
  assert.doesNotMatch(`${NBA_PRODUCT_TIERS.moonshot.payout} ${NBA_PRODUCT_TIERS.moonshot.relativeRisk}`, RISK_OVERCLAIM);
});
