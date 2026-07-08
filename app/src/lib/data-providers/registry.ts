/**
 * Paid Sports Data API — provider registry (Phase 2.6, planning/scaffolding).
 *
 * Lists candidate provider CATEGORIES and reports each as configured / unconfigured based ONLY on
 * the PRESENCE of an env-var NAME in `process.env`. This module:
 *   - NEVER makes a network call.
 *   - NEVER reads/logs/returns a secret VALUE (only tests `KEY in process.env` / non-empty).
 *   - NEVER throws for a missing provider — `getProvider(id)` on an unknown id returns a graceful
 *     "unavailable" result, and `missingProvider(id)` is a convenience for the same.
 *   - Adds NO build dependency on any paid API. Everything degrades to "unavailable".
 *
 * See docs/PAID_SPORTS_DATA_API_PLAN.md for the ranking, hard rules, and adapter design.
 */

import {
  type ProviderCapability,
  type ProviderDescription,
  type ProviderModule,
  type ProviderResult,
  type SportsDataProvider,
  type UnavailableResult,
  unavailableModule,
  availableModule,
  unavailableResult,
} from "./types";

/**
 * Presence check — TRUE only when the env var NAME exists AND is a non-empty string.
 * Reads only whether a value is set; the value itself is never inspected, logged, or returned.
 */
function envNamePresent(envKeyName: string): boolean {
  const raw = process.env[envKeyName];
  return typeof raw === "string" && raw.trim().length > 0;
}

/** Static, non-secret catalog of candidate provider CATEGORIES (neutral — not purchase advice). */
const PROVIDER_CATALOG: ReadonlyArray<ProviderDescription> = [
  {
    id: "official-boxscore",
    label: "Official box-score API",
    summary:
      "Category: an official/authoritative box-score & final-results feed used to grade settled outcomes reliably.",
    capabilities: ["official_settlement"],
    envKeyName: "SPORTS_DATA_PROVIDER_KEY",
    optional: true,
  },
  {
    id: "player-props",
    label: "Player-props & player box-stats API",
    summary:
      "Category: player-prop lines plus per-player box statistics for populating and grading prop modules.",
    capabilities: ["player_props"],
    envKeyName: "PLAYER_PROPS_PROVIDER_KEY",
    optional: true,
  },
  {
    id: "odds-consensus",
    label: "Odds consensus / multi-book aggregator",
    summary:
      "Category: a multi-book odds aggregator that yields a consensus price rather than a single book.",
    capabilities: ["odds_consensus"],
    envKeyName: "ODDS_CONSENSUS_KEY",
    optional: true,
  },
  {
    id: "injuries-lineups",
    label: "Injuries & confirmed-lineups feed",
    summary:
      "Category: injury designations and confirmed starting lineups to gate props on players who will play.",
    capabilities: ["injuries_lineups"],
    envKeyName: "INJURIES_LINEUPS_KEY",
    optional: true,
  },
  {
    id: "soccer-advanced",
    label: "Soccer advanced-stats API (xG / shots / corners / cards / first-scorer)",
    summary:
      "Category: soccer event/advanced-stat data (xG, shots, corners, cards, first-scorer) for match modules.",
    capabilities: ["soccer_advanced"],
    envKeyName: "SOCCER_STATS_PROVIDER_KEY",
    optional: true,
  },
  {
    id: "historical-calibration",
    label: "Historical dataset for calibration",
    summary:
      "Category: bulk historical results/odds used only for offline model calibration and backtests.",
    capabilities: ["historical"],
    envKeyName: "HISTORICAL_DATA_PROVIDER_KEY",
    optional: true,
  },
];

/** Which module names a given capability powers (documentation/mapping — no fabrication). */
const CAPABILITY_MODULES: Record<ProviderCapability, readonly string[]> = {
  official_settlement: ["official_settlement_grade"],
  player_props: ["player_prop_lines", "player_box_stats", "player_prop_volatility"],
  odds_consensus: ["consensus_price", "line_movement"],
  injuries_lineups: ["injury_impact", "confirmed_lineup"],
  soccer_advanced: ["xg_shots", "corners_cards", "first_scorer"],
  historical: ["calibration_dataset"],
};

/** Build a concrete (metadata-only) provider from a catalog description. No I/O anywhere. */
function makeProvider(desc: ProviderDescription): SportsDataProvider {
  const modulesCovered = new Set<string>(
    desc.capabilities.flatMap((cap) => CAPABILITY_MODULES[cap] ?? []),
  );
  return {
    id: desc.id,
    describe: () => desc,
    isConfigured: () => envNamePresent(desc.envKeyName),
    moduleFor(moduleName: string): ProviderModule {
      if (!modulesCovered.has(moduleName)) {
        return unavailableModule(moduleName, `provider "${desc.id}" does not cover this module`);
      }
      if (!envNamePresent(desc.envKeyName)) {
        return unavailableModule(
          moduleName,
          `provider "${desc.id}" not configured (${desc.envKeyName} unset)`,
        );
      }
      return availableModule(moduleName);
    },
  };
}

/** All registered providers (built once from the static catalog). */
const PROVIDERS: ReadonlyArray<SportsDataProvider> = PROVIDER_CATALOG.map(makeProvider);

const PROVIDER_BY_ID = new Map<string, SportsDataProvider>(PROVIDERS.map((p) => [p.id, p]));

/** List every registered provider (order = catalog order). */
export function listProviders(): ReadonlyArray<SportsDataProvider> {
  return PROVIDERS;
}

/** Non-secret descriptions for every provider (safe to render/serialize/log). */
export function describeProviders(): ReadonlyArray<ProviderDescription> {
  return PROVIDER_CATALOG;
}

/** The env var NAMES this registry inspects (NAMES only — never values). Useful for docs/tests. */
export function knownEnvKeyNames(): ReadonlyArray<string> {
  return PROVIDER_CATALOG.map((d) => d.envKeyName);
}

/**
 * Look up a provider by id.
 * Returns an `AvailableResult` (with `available` reflecting env-name presence) when known,
 * or a graceful `UnavailableResult` when unknown. NEVER throws.
 */
export function getProvider(id: string): ProviderResult {
  const provider = PROVIDER_BY_ID.get(id);
  if (!provider) {
    return unavailableResult(id, `no provider registered with id "${id}"`);
  }
  return { ok: true, available: provider.isConfigured(), providerId: id, provider };
}

/**
 * Graceful "unavailable" path for a missing/unknown or unconfigured provider.
 * Always returns an `UnavailableResult`; NEVER throws. Use this where calling code wants a
 * definitely-unavailable answer (e.g. simulation falling back to a placeholder).
 */
export function missingProvider(id: string): UnavailableResult {
  const provider = PROVIDER_BY_ID.get(id);
  if (!provider) {
    return unavailableResult(id, `no provider registered with id "${id}"`);
  }
  if (!provider.isConfigured()) {
    const { envKeyName } = provider.describe();
    return unavailableResult(id, `provider "${id}" not configured (${envKeyName} unset)`);
  }
  // Registered AND configured — still no live call is made here; the caller decides what to do.
  return unavailableResult(id, `provider "${id}" is configured but no data was requested`);
}

/**
 * Resolve a single simulation/report module across all providers.
 * Returns the first `available: true` match, else a graceful unavailable record naming the module.
 * NEVER throws — simulation code renders the unavailable placeholder instead of fabricating data.
 */
export function resolveModule(moduleName: string): ProviderModule {
  for (const provider of PROVIDERS) {
    const m = provider.moduleFor(moduleName);
    if (m.available) return m;
  }
  return unavailableModule(
    moduleName,
    "no configured provider supplies this module (data unavailable — do not fabricate)",
  );
}
