/**
 * FIXTURES — event-market snapshot-archive samples. Entirely SYNTHETIC and clearly labelled: not live, not public,
 * not a prediction. `source: "internal_fixture"` on every record. These drive the snapshot-archive dry-run + its
 * tests without any network access or fabricated live data.
 *
 * The series is three point-in-time captures of ONE fixture market so the archive's forward-only ordering + index can
 * be exercised. The final capture is deliberately SPARSE (volume + liquidity unknown → `null`, no `bidAsk`) to prove
 * missing fields are preserved honestly, never faked.
 */
import type { MarketSnapshot } from "../types";

const FIXTURE_ARCHIVE_MARKET_ID = "fixture:event-snapshot-archive-demo";

/** T1 — full snapshot: prices + bid/ask + volume + liquidity all present. */
export const FIXTURE_SNAPSHOT_T1: MarketSnapshot = {
  marketId: FIXTURE_ARCHIVE_MARKET_ID,
  capturedAt: "2026-07-22T12:00:00Z",
  outcomePrices: { yes: 0.61, no: 0.39 },
  bidAsk: { yes: { bid: 0.6, ask: 0.62 }, no: { bid: 0.38, ask: 0.4 } },
  volume: 88000,
  liquidity: 21000,
  source: "internal_fixture",
};

/** T2 — a later capture of the same market (prices drift; still fully populated). */
export const FIXTURE_SNAPSHOT_T2: MarketSnapshot = {
  marketId: FIXTURE_ARCHIVE_MARKET_ID,
  capturedAt: "2026-07-22T15:30:00Z",
  outcomePrices: { yes: 0.58, no: 0.42 },
  bidAsk: { yes: { bid: 0.57, ask: 0.59 }, no: { bid: 0.41, ask: 0.43 } },
  volume: 94000,
  liquidity: 20500,
  source: "internal_fixture",
};

/** T3 — SPARSE capture: volume + liquidity unknown (null, never faked to 0) and no bidAsk field at all. */
export const FIXTURE_SNAPSHOT_SPARSE: MarketSnapshot = {
  marketId: FIXTURE_ARCHIVE_MARKET_ID,
  capturedAt: "2026-07-22T18:30:00Z",
  outcomePrices: { yes: 0.64, no: 0.36 },
  volume: null,
  liquidity: null,
  source: "internal_fixture",
};

/** The ordered fixture series (T1 → T2 → T3-sparse). */
export const FIXTURE_SNAPSHOT_SERIES: MarketSnapshot[] = [FIXTURE_SNAPSHOT_T1, FIXTURE_SNAPSHOT_T2, FIXTURE_SNAPSHOT_SPARSE];

export { FIXTURE_ARCHIVE_MARKET_ID };
