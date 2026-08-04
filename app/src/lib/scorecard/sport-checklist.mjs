/**
 * Sport-by-sport completion checklist (Program 128-133 §13).
 *
 * Same calculator, same status scale. Categories a sport genuinely does not require are
 * NOT_APPLICABLE (excluded), not zero — otherwise an archive is punished for not being live.
 */

const CATEGORY_WEIGHTS = {
  schedule: 5,
  odds: 5,
  simulation: 4,
  prediction: 4,
  publicSurface: 5,
  settlement: 5,
  lineage: 4,
  automation: 4,
};

const cat = (key, status, evidence, evidenceFresh = true) => ({
  item: key,
  weight: CATEGORY_WEIGHTS[key],
  status,
  evidence,
  evidenceFresh,
});

export const SPORTS = [
  {
    name: "MLB",
    launchState: "LIVE_PARTIAL",
    note: "Daily operating sport. PARTIAL only because one Aug 3 game's books never posted.",
    categories: [
      cat("schedule", "DONE_PRODUCTION_PROVEN", "MLB StatsAPI; 8-game Aug 3 slate resolved with identity"),
      cat("odds", "DONE_PRODUCTION_PROVEN", "Odds API; 7/8 covered, credit-guarded, cache provenance honest"),
      cat("simulation", "DONE_PRODUCTION_PROVEN", "player sims 7/7 covered; full-game 8/8 with honest unavailable"),
      cat("prediction", "DONE_PRODUCTION_PROVEN", "predictions artifact current; research contract from settled ledger"),
      cat("publicSurface", "DONE_PRODUCTION_PROVEN", "/today, /markets, 8 game reports, /results all verified live"),
      cat("settlement", "DONE_VALIDATED", "canonical writer proven on Jul 31; Aug 3 settles tonight"),
      cat("lineage", "IN_PROGRESS", "native stamping 211/211, but settled-row PROVEN_STAMPED still 0/299"),
      cat("automation", "DONE_PRODUCTION_PROVEN", "generation, top-up, watchdog, settle all ran unattended Aug 3"),
    ],
  },
  {
    name: "NBA",
    launchState: "DESIGN_ONLY",
    note: "Offseason. Adapter code exists; promotion state HISTORICAL_ONLY.",
    categories: [
      cat("schedule", "DONE_VALIDATED", "ESPN scoreboard provider active as fallback source", false),
      cat("odds", "DESIGNED_ONLY", "Odds API path exists; nba-market-probe dispatch-only, last run 2026-06-10", false),
      cat("simulation", "NOT_STARTED", "no NBA simulation engine", false),
      cat("prediction", "NOT_STARTED", "no NBA prediction population", false),
      cat("publicSurface", "NOT_STARTED", "not publicly promoted", false),
      cat("settlement", "DESIGNED_ONLY", "settlement adapter code present, never exercised forward", false),
      cat("lineage", "NOT_STARTED", "no NBA rows to stamp", false),
      cat("automation", "DESIGNED_ONLY", "workflows exist but dormant", false),
    ],
  },
  {
    name: "EPL / Soccer",
    launchState: "BLOCKED",
    note: "Odds side wired; settlement blocked on an unmade provider decision.",
    categories: [
      cat("schedule", "DONE_VALIDATED", "API-Football fixtures available", false),
      cat("odds", "DONE_VALIDATED", "1X2 preview odds path wired", false),
      cat("simulation", "DESIGNED_ONLY", "internal FIFA-Poisson engine exists, deliberately not public", false),
      cat("prediction", "NOT_STARTED", "no public EPL prediction population", false),
      cat("publicSurface", "NOT_STARTED", "not promoted", false),
      cat("settlement", "BLOCKED_EXTERNAL", "EPL_RESULTS_PROVIDER_DECISION_PACKAGE.md awaiting founder decision", false),
      cat("lineage", "NOT_STARTED", "nothing settled to stamp", false),
      cat("automation", "DESIGNED_ONLY", "dispatch-only workflows", false),
    ],
  },
  {
    name: "UFC",
    launchState: "ARCHIVED",
    note: "Settled archive is the intended finished state; forward cards are NOT a goal.",
    categories: [
      cat("schedule", "ARCHIVED_COMPLETE", "archive complete for the covered cards", false),
      cat("odds", "ARCHIVED_COMPLETE", "historical captures retained", false),
      cat("simulation", "NOT_APPLICABLE", "no simulation product was ever in scope for the archive"),
      cat("prediction", "NOT_APPLICABLE", "archive is a record, not a prediction surface"),
      cat("publicSurface", "ARCHIVED_COMPLETE", "/ufc renders the settled archive", false),
      cat("settlement", "ARCHIVED_COMPLETE", "record settled; boutId join adjudicated unsound for FUTURE cards only", false),
      cat("lineage", "NOT_APPLICABLE", "legacy rows predate the stamping contract"),
      cat("automation", "NOT_APPLICABLE", "dormant by design; no forward cards planned"),
    ],
  },
  {
    name: "World Cup",
    launchState: "ARCHIVED",
    note: "Closed as a destination; archive/proof only.",
    categories: [
      cat("schedule", "ARCHIVED_COMPLETE", "tournament complete", false),
      cat("odds", "ARCHIVED_COMPLETE", "historical", false),
      cat("simulation", "NOT_APPLICABLE", "retired"),
      cat("prediction", "NOT_APPLICABLE", "retired"),
      cat("publicSurface", "ARCHIVED_COMPLETE", "closeout guard test enforces archive-only", false),
      cat("settlement", "ARCHIVED_COMPLETE", "settled", false),
      cat("lineage", "NOT_APPLICABLE", "legacy"),
      cat("automation", "NOT_APPLICABLE", "dormant by design"),
    ],
  },
];
