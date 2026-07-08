/**
 * Paid Sports Data API — provider interface & availability types (Phase 2.6, planning/scaffolding).
 *
 * READ-ONLY, OPTIONAL, GRACEFUL-WHEN-ABSENT. This module is pure types + tiny pure helpers.
 * It NEVER makes a network call, NEVER reads a secret VALUE, and NEVER throws for a missing key.
 *
 * Hard rules encoded here (see docs/PAID_SPORTS_DATA_API_PLAN.md):
 *  - A provider reports "configured" from the mere PRESENCE of an env var NAME — never its value.
 *  - When a provider is unconfigured, its modules are reported `available: false` with a `reason`,
 *    so simulation/report code can render an honest "unavailable" placeholder instead of fabricating.
 *  - Nothing here creates a build dependency on any paid API.
 */

/** Coarse capability areas a paid provider might cover (used only for documentation/mapping). */
export type ProviderCapability =
  | "official_settlement" // official box scores / final results reliability (HIGHEST impact)
  | "player_props" // player-prop lines + player box stats
  | "odds_consensus" // multi-book / consensus pricing
  | "injuries_lineups" // injuries + confirmed starting lineups
  | "soccer_advanced" // xG / shots / corners / cards / first-scorer
  | "historical"; // historical data for calibration/backtests

/** Impact ranking (HIGH → LOW) mirroring the plan doc; lower number = higher priority. */
export const CAPABILITY_IMPACT: Record<ProviderCapability, number> = {
  official_settlement: 1,
  player_props: 2,
  odds_consensus: 3,
  injuries_lineups: 4,
  soccer_advanced: 5,
  historical: 6,
};

/** A named simulation/report "module" and whether the data to power it is available right now. */
export interface ProviderModule {
  /** Stable module identifier, e.g. "score_distribution", "player_prop_volatility". */
  module: string;
  /** True only when the backing provider is configured AND covers this module's capability. */
  available: boolean;
  /** Human-readable reason a module is unavailable (e.g. "provider not configured"). */
  reason?: string;
}

/** Static, non-secret description of a provider — safe to log, render, or serialize. */
export interface ProviderDescription {
  /** Stable provider id (kebab-case), e.g. "official-boxscore". */
  id: string;
  /** Short human label, e.g. "Official box-score API". */
  label: string;
  /** One-line neutral description of the provider CATEGORY (never a purchase recommendation). */
  summary: string;
  /** Capability areas this provider category would cover. */
  capabilities: ProviderCapability[];
  /**
   * The env var NAME (placeholder) whose PRESENCE flips this provider to "configured".
   * This is a NAME only — the value is never read, logged, or committed.
   */
  envKeyName: string;
  /** Whether wiring this provider is optional (always true in this phase). */
  optional: true;
}

/**
 * A read-only, optional sports-data provider.
 *
 * Implementations in this phase are metadata-only: `isConfigured()` checks env-var NAME presence,
 * and `moduleFor()` returns an availability record. No implementation performs I/O.
 */
export interface SportsDataProvider {
  /** Stable provider id (matches `describe().id`). */
  readonly id: string;
  /** Non-secret static description. */
  describe(): ProviderDescription;
  /**
   * True when the provider's env var NAME is present in the environment.
   * Presence only — the value is intentionally never read. Never throws.
   */
  isConfigured(): boolean;
  /**
   * Report whether a named module is available given current configuration.
   * Always returns a record (never throws); unavailable when unconfigured.
   */
  moduleFor(moduleName: string): ProviderModule;
}

/** A graceful "unavailable" result — the shape returned instead of throwing for a missing provider. */
export interface UnavailableResult {
  ok: false;
  available: false;
  /** Which provider was requested (may be an unknown id). */
  providerId: string;
  /** Why the request could not be satisfied. */
  reason: string;
}

/** A successful provider lookup (still no network — this only means the provider is registered). */
export interface AvailableResult {
  ok: true;
  available: boolean;
  providerId: string;
  provider: SportsDataProvider;
}

export type ProviderResult = AvailableResult | UnavailableResult;

// ── tiny pure helpers (no I/O, no throw) ─────────────────────────────────────────────────────────

/**
 * Build a graceful unavailable module record. Never throws.
 * Use in simulation/report code when the backing provider data is missing:
 * render this instead of fabricating a value.
 */
export function unavailableModule(moduleName: string, reason: string): ProviderModule {
  return { module: moduleName, available: false, reason };
}

/** Build an available module record. */
export function availableModule(moduleName: string): ProviderModule {
  return { module: moduleName, available: true };
}

/** Build a graceful unavailable provider result. Never throws. */
export function unavailableResult(providerId: string, reason: string): UnavailableResult {
  return { ok: false, available: false, providerId, reason };
}

/** Sort capabilities by impact (HIGH → LOW). Pure. */
export function byImpact(caps: readonly ProviderCapability[]): ProviderCapability[] {
  return [...caps].sort((a, b) => CAPABILITY_IMPACT[a] - CAPABILITY_IMPACT[b]);
}
