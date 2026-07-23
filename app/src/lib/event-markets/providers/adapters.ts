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

/**
 * Per-provider LIVE-ACCESS approval (Phase 15). Live adapters stay DISABLED until EVERY precondition below is met for
 * a provider. This registry is the single source of truth, it is intentionally ALL-FALSE, and the app FAILS CLOSED:
 * a live path calls `assertProviderLiveAllowed` and throws unless fully approved — it never silently proceeds.
 * Flipping `enabled` alone is NOT enough; every legal/operational precondition must also be satisfied.
 */
export interface ProviderApproval {
  /** Master switch — one flag per provider. False until go-live is deliberately, reviewably enabled. */
  enabled: boolean;
  founderApproved: boolean;       // founder sign-off obtained
  tosReviewed: boolean;           // provider / terms-of-service review completed
  attributionDocumented: boolean; // attribution requirements documented
  storagePolicyApproved: boolean; // caching / storage policy approved
  geoLimitsUnderstood: boolean;   // geographic limitations understood
  readOnlyAccepted: boolean;      // no-trading / read-only boundary accepted
}

const DISABLED_APPROVAL: ProviderApproval = {
  enabled: false, founderApproved: false, tosReviewed: false, attributionDocumented: false,
  storagePolicyApproved: false, geoLimitsUnderstood: false, readOnlyAccepted: false,
};

/** Every platform ships fully DISABLED. Changing any value here to permit live access is a deliberate, reviewed act. */
export const PROVIDER_APPROVAL: Record<Platform, ProviderApproval> = {
  polymarket: { ...DISABLED_APPROVAL },
  kalshi: { ...DISABLED_APPROVAL },
  internal_fixture: { ...DISABLED_APPROVAL },
  other: { ...DISABLED_APPROVAL },
};

/** True ONLY when a provider is enabled AND every legal/operational precondition is met. Fail-closed by construction. */
export function isProviderLiveApproved(
  platform: Platform,
  approval: Partial<Record<Platform, ProviderApproval>> = PROVIDER_APPROVAL,
): boolean {
  const a = approval[platform];
  return (
    !!a && a.enabled && a.founderApproved && a.tosReviewed && a.attributionDocumented &&
    a.storagePolicyApproved && a.geoLimitsUnderstood && a.readOnlyAccepted
  );
}

/** Fail-closed gate — throws unless a provider is FULLY approved for live access. Any live code path must call this
 *  before touching a live transport; with the default (all-false) registry it always throws. */
export function assertProviderLiveAllowed(
  platform: Platform,
  approval: Partial<Record<Platform, ProviderApproval>> = PROVIDER_APPROVAL,
): void {
  if (!isProviderLiveApproved(platform, approval)) {
    throw new LiveIntegrationDisabledError(
      platform,
      "not approved for live access — founder + ToS + attribution + storage + geo + read-only preconditions not all satisfied",
    );
  }
}
