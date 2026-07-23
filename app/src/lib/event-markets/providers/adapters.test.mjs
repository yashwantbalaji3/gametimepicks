/**
 * Tests for the read-only provider adapters. Live is DISABLED (both providers LEGAL_REVIEW_REQUIRED): fixture reads
 * work + normalize to the contract; a live read throws (never invents a response). Run: npx tsx --test src/lib/event-markets/providers/adapters.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PolymarketAdapter, KalshiAdapter, PROVIDER_ADAPTERS, LiveIntegrationDisabledError } from "./adapters.ts";
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
