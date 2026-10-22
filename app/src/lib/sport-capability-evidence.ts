/**
 * SERVER-ONLY · the evidence behind each sport's capability state (Housekeeping 10-22).
 *
 * These repo paths were the `evidence` field of sport-capability-registry.ts until the client-graph guard found that
 * registry inside client bundles (custom-parlay-builder.tsx → custom-parlay.ts → sport-capabilities.ts reaches it), carrying
 * three data/internal paths — EPL learning, the Ligue 1 walk-forward report, the NFL public card — to every browser
 * that loaded it. The registry keeps the client-safe surface (state, reason, the derived permissions); the audit
 * trail lives here.
 *
 * Import this module ONLY from tests and scripts (scripts/audit-sports.mjs) — never from a "use client" module or
 * anything one imports (lib/client-graph-internal-paths.test.mjs fails if a client graph reaches it).
 *
 * Every state is backed by files here: if you change a sport's state in the registry, change its evidence with it,
 * or sport-capability-registry.test.mjs / sport-capability-evidence.test.mjs will ask you why.
 */

/** sport key → repo paths (relative to the repo root) whose contents justify the registry's `state`. */
export const SPORT_CAPABILITY_EVIDENCE: Readonly<Record<string, ReadonlyArray<string>>> = {
  mlb: [
    "app/public/data/mlb/full-game-simulations/",
    "app/public/data/mlb/predictions/",
    "app/src/lib/mlb/prediction/decision.ts",
    ".github/workflows/mlb-daily-production.yml",
  ],
  nba: [
    "status/nba-first-market-recommendation.json",
    "docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md",
    "app/src/lib/sports/nba/finals-record.mjs",
    "app/public/data/results/lifetime_summary.json",
    "app/scripts/build-market-coverage-matrix.mjs",
  ],
  ufc: [
    "status/ufc-graduation-decision.json",
    "app/public/data/ufc/readiness-latest.json",
    "app/public/data/ufc/ops-status-latest.json",
  ],
  soccer: [
    "app/public/data/world-cup/projection-readiness-latest.json",
    "app/src/lib/market-coverage.ts",
  ],
  nhl: ["app/public/data/nhl/schedule/", "app/src/lib/data-nhl.ts"],
  ipl: ["app/public/data/ipl/schedule/", "app/src/lib/cricket-projection.ts"],
  wnba: ["app/src/lib/event-schedules.ts", "app/src/lib/sports-coverage.ts"],
  mls: ["app/src/lib/event-schedules.ts", "app/public/data/world-cup/projection-readiness-latest.json"],
  epl: [
    "app/public/data/epl/graded-picks.json",
    ".github/workflows/epl-matchweek.yml",
    "app/public/data/parlays/lab-ledger.json",
    "data/internal/research/epl/learning/latest.json",
  ],
  "ligue-1": [
    "app/public/data/soccer/ligue-1/forecasts/latest.json",
    "app/public/data/soccer/ligue-1/results/graded.json",
    "data/internal/research/soccer/ligue-1/reports/walk-forward-v1.json",
    ".github/workflows/soccer-leagues.yml",
  ],
  nfl: [
    "app/public/data/nfl/index.json",
    ".github/workflows/nfl-event-window.yml",
    "app/public/data/nfl/graded-picks.json",
    "data/internal/research/nfl/regular-season-public-card-v1.json",
  ],
};

/** The evidence for a sport (case/whitespace insensitive, like capabilityOf). Unknown → none (fails closed). */
export function evidenceOf(sport: string | null | undefined): ReadonlyArray<string> {
  const key = String(sport ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SPORT_CAPABILITY_EVIDENCE, key) ? SPORT_CAPABILITY_EVIDENCE[key] : [];
}
