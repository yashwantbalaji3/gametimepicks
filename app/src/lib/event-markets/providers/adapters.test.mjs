/**
 * Tests for the read-only provider adapters. Live is DISABLED (both providers LEGAL_REVIEW_REQUIRED): fixture reads
 * work + normalize to the contract; a live read throws (never invents a response). Run: npx tsx --test src/lib/event-markets/providers/adapters.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PolymarketAdapter, KalshiAdapter, PROVIDER_ADAPTERS, LiveIntegrationDisabledError, PROVIDER_APPROVAL, isProviderLiveApproved, assertProviderLiveAllowed } from "./adapters.ts";
import { FIXTURE_MARKET, FIXTURE_SNAPSHOT } from "../fixtures/star-player-next-team.ts";

const fixtures = { markets: { [FIXTURE_MARKET.marketId]: { ...FIXTURE_MARKET, platform: "polymarket" } }, snapshots: { [FIXTURE_SNAPSHOT.marketId]: { ...FIXTURE_SNAPSHOT, source: "polymarket" } } };

test("1 · fixture read returns a normalized EventMarket (no network, no fabricated fields)", async () => {
  const a = new PolymarketAdapter({ fixtures });
  const m = await a.fetchMarket(FIXTURE_MARKET.marketId);
  assert.equal(m.marketId, FIXTURE_MARKET.marketId);
  assert.equal(m.platform, "polymarket");
  const s = await a.fetchSnapshot(FIXTURE_SNAPSHOT.marketId);
  assert.ok("outcomePrices" in s && "capturedAt" in s);
});

test("2 · a LIVE read is DISABLED and throws (never invents a response)", async () => {
  const a = new PolymarketAdapter({ fixtures, liveEnabled: true });
  await assert.rejects(() => a.fetchMarket(FIXTURE_MARKET.marketId), LiveIntegrationDisabledError);
});

test("3 · Kalshi is read-only + requires a data license (live disabled)", async () => {
  const a = new KalshiAdapter({ liveEnabled: true });
  await assert.rejects(() => a.fetchSnapshot("x"), /LEGAL_REVIEW_REQUIRED/);
  assert.equal(a.capabilities.requiresAuth, true);
  assert.equal(a.capabilities.orderBook, false);
});

test("4 · a missing fixture is an honest error, not a fabricated market", async () => {
  const a = new PolymarketAdapter({ fixtures: {} });
  await assert.rejects(() => a.fetchMarket("nope"), /no fixture market/);
});

test("5 · the registry declares BOTH providers LEGAL_REVIEW_REQUIRED with liveEnabled=false", () => {
  for (const [name, cfg] of Object.entries(PROVIDER_ADAPTERS)) {
    assert.equal(cfg.integrationStatus, "LEGAL_REVIEW_REQUIRED", `${name} is not INTEGRATION_READY`);
    assert.equal(cfg.liveEnabled, false, `${name} live must be disabled`);
  }
});

test("6 · capabilities honestly declare read-only + no fabricated conversions", () => {
  const p = new PolymarketAdapter();
  assert.match(p.capabilities.notes, /read-only/i);
  assert.equal(p.capabilities.requiresAuth, false, "Polymarket public reads are keyless");
});

test("7 · PROVIDER_APPROVAL ships every provider fully DISABLED (enabled + all 6 preconditions false)", () => {
  for (const [name, a] of Object.entries(PROVIDER_APPROVAL)) {
    for (const [k, v] of Object.entries(a)) assert.equal(v, false, `${name}.${k} must ship false`);
  }
});

test("8 · fail-closed: the default registry approves NO provider for live access; assertProviderLiveAllowed throws", () => {
  assert.equal(isProviderLiveApproved("polymarket"), false);
  assert.equal(isProviderLiveApproved("kalshi"), false);
  assert.throws(() => assertProviderLiveAllowed("polymarket"), LiveIntegrationDisabledError);
  assert.throws(() => assertProviderLiveAllowed("kalshi"), LiveIntegrationDisabledError);
});

test("9 · flipping `enabled` alone is NOT enough — a partial approval still fails closed", () => {
  const partial = { polymarket: { enabled: true, founderApproved: true, tosReviewed: true, attributionDocumented: true, storagePolicyApproved: true, geoLimitsUnderstood: true, readOnlyAccepted: false }, kalshi: PROVIDER_APPROVAL.kalshi };
  assert.equal(isProviderLiveApproved("polymarket", partial), false, "missing read-only acceptance ⇒ not approved");
  assert.throws(() => assertProviderLiveAllowed("polymarket", partial), LiveIntegrationDisabledError);
  // enabled:false but every condition met ⇒ still not approved (the master switch is off)
  const switchOff = { ...partial, polymarket: { ...partial.polymarket, readOnlyAccepted: true, enabled: false } };
  assert.equal(isProviderLiveApproved("polymarket", switchOff), false, "enabled:false ⇒ not approved even with all conditions met");
});

test("10 · the gate is SATISFIABLE (not permanently broken): a fully-approved provider passes", () => {
  const full = { polymarket: { enabled: true, founderApproved: true, tosReviewed: true, attributionDocumented: true, storagePolicyApproved: true, geoLimitsUnderstood: true, readOnlyAccepted: true }, kalshi: PROVIDER_APPROVAL.kalshi };
  assert.equal(isProviderLiveApproved("polymarket", full), true);
  assert.doesNotThrow(() => assertProviderLiveAllowed("polymarket", full));
});
