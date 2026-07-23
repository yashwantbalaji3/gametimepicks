/**
 * Provider adapters behind the read-only MarketDataAdapter contract (Phase 10). Per docs/EVENT_MARKET_PROVIDER_AUDIT.md,
 * NO provider is INTEGRATION_READY: Kalshi + Polymarket are both LEGAL_REVIEW_REQUIRED (Kalshi needs a written data
 * license; Polymarket's Gamma/CLOB reads are public but a commercial-display ToS confirmation is required). So live
 * integration is DISABLED here: the adapters implement the contract + normalize a fixture, and a live fetch throws a
 * clear error rather than inventing a response or hitting an unpermitted endpoint.
 *
 * READ-ONLY forever: no wallet, no trades, no orders, no balances. No network call is made in this module.
 */
import type { EventMarket, MarketSnapshot, MarketDataAdapter, Platform } from "../types";

export class LiveIntegrationDisabledError extends Error {
  constructor(platform: string, reason: string) {
    super(`live ${platform} integration is DISABLED (${reason}) — using the fixture path; no response is invented`);
    this.name = "LiveIntegrationDisabledError";
  }
}

interface AdapterConfig {
  /** Fixture data keyed by marketId. When live is disabled, reads come from here. */
  fixtures?: { markets?: Record<string, EventMarket>; snapshots?: Record<string, MarketSnapshot> };
  /** Live reads are gated on an explicit legal clearance flag AND (per provider) credentials. Default false. */
  liveEnabled?: boolean;
}

abstract class BaseAdapter implements MarketDataAdapter {
  abstract readonly platform: Platform;
  abstract readonly capabilities: MarketDataAdapter["capabilities"];
  protected abstract readonly liveBlockReason: string;
  constructor(protected cfg: AdapterConfig = {}) {}

  protected get live(): boolean { return this.cfg.liveEnabled === true; }

  async fetchMarket(marketId: string): Promise<EventMarket> {
    if (this.live) throw new LiveIntegrationDisabledError(this.platform, this.liveBlockReason);
    const m = this.cfg.fixtures?.markets?.[marketId];
    if (!m) throw new Error(`no fixture market for ${marketId} on ${this.platform}`);
    return m;
  }
  async fetchSnapshot(marketId: string): Promise<MarketSnapshot> {
    if (this.live) throw new LiveIntegrationDisabledError(this.platform, this.liveBlockReason);
    const s = this.cfg.fixtures?.snapshots?.[marketId];
    if (!s) throw new Error(`no fixture snapshot for ${marketId} on ${this.platform}`);
    return s;
  }
  async listMarkets(): Promise<EventMarket[]> {
    if (this.live) throw new LiveIntegrationDisabledError(this.platform, this.liveBlockReason);
    return Object.values(this.cfg.fixtures?.markets ?? {});
  }
}

/** Polymarket — Gamma (metadata/discovery) + CLOB (prices/history/order-book) are public read-only, but a commercial-
 *  display ToS confirmation is required, so live stays disabled until legal clearance. */
export class PolymarketAdapter extends BaseAdapter {
  readonly platform = "polymarket" as const;
  protected readonly liveBlockReason = "LEGAL_REVIEW_REQUIRED — commercial-display ToS confirmation pending";
  readonly capabilities = { priceHistory: true, orderBook: true, resolutionRules: true, requiresAuth: false, notes: "Gamma + CLOB reads are public/no-auth/non-geoblocked, but a commercial-display ToS confirmation gates live use. UMA-oracle resolution. Read-only." };
}

/** Kalshi — reads are reportedly keyless, but its Data Terms of Use restrict access to personal/non-commercial use;
 *  any public/derivative surface needs prior written consent, so live stays disabled pending a data license. */
export class KalshiAdapter extends BaseAdapter {
  readonly platform = "kalshi" as const;
  protected readonly liveBlockReason = "LEGAL_REVIEW_REQUIRED — Data ToS: written data license needed for any public/derivative use";
  readonly capabilities = { priceHistory: false, orderBook: false, resolutionRules: true, requiresAuth: true, notes: "Regulated exchange. Data ToU limit use to personal/non-commercial; public display needs written consent. Read-only." };
}

/** Registry of the read-only adapters + their (disabled) live status — the single place integration status is declared. */
export const PROVIDER_ADAPTERS = {
  polymarket: { ctor: PolymarketAdapter, integrationStatus: "LEGAL_REVIEW_REQUIRED", liveEnabled: false },
  kalshi: { ctor: KalshiAdapter, integrationStatus: "LEGAL_REVIEW_REQUIRED", liveEnabled: false },
} as const;
