/**
 * Per-sport gate assessments — committed evidence, not optimism (Program 144 · Release H).
 *
 * Each entry cites the receipt that justifies its status. UNPROVEN needs no citation — it is the
 * default. These are INTERNAL maturity readings; the public display state is derived separately
 * (lib/home/simulation-hub.mjs) and can be more conservative — UFC is internally SCAFFOLDED (some
 * stages partially proven) while publicly HISTORICAL_ONLY, and both are correct on their own axis.
 *
 * Update an entry only with a new receipt: a merged commit, a green run, a settled backtest.
 */

export const SPORT_ASSESSMENTS = {
  mlb: {
    inSeason: true,
    historicalArchive: true,
    stages: {
      schedule: { status: "PROVEN", evidence: "MLB StatsAPI daily schedule; doubleheader-safe identity {away}-{home}-{date}-{gamePk}" },
      identity: { status: "PROVEN", evidence: "ESPN board ids + midfield headshots through the identity components (Release E guards)" },
      data: { status: "PROVEN", evidence: "daily pipeline inputs; pitcher-workload capture live since Program 096-099" },
      markets: { status: "PROVEN", evidence: "credit-guarded Odds ingestion, de-vig first (~1.069 implied sums, Sprint 046)" },
      model: { status: "PROVEN", evidence: "10k-run simulations from board projections (lib/mlb/full-game)" },
      calibration: { status: "PROVEN", evidence: "preregistered backtests RAN and their truth is recorded: no measurable edge (76fae758), blend w=0 (6fcef8fc); markets demoted to market-context — the calibration stage proves the CLAIM DISCIPLINE, not superiority" },
      qualification: { status: "PROVEN", evidence: "publication gate in board generation (Sprint 043); no-play first-class (Program 140)" },
      products: { status: "PROVEN", evidence: "daily-products.yml scheduled, money-guarded, content-idempotent (Program 140)" },
      publication: { status: "PROVEN", evidence: "product-state contract: freshness from the product's own artifact (Program 140)" },
      settlement: { status: "PROVEN", evidence: "official StatsAPI grading, lineage gate proven live (Sprint 049), one settlement writer" },
      monitoring: { status: "PROVEN", evidence: "evidence ledger + cron watchdog + ops alerting cover the MLB chain (Program 144-A)" },
      owner: { status: "PROVEN", evidence: "automation owns the daily run; founder escalation via ops webhook wiring" },
    },
  },

  nfl: {
    inSeason: false,
    historicalArchive: false,
    stages: {
      // First stage with any evidence (Release B). Everything else UNPROVEN.
      schedule: { status: "PARTIAL", evidence: "Program 148: FIRST REAL CAPTURE — 16 preseason events from the ESPN public scoreboard (espn_scoreboard registry entry, scripts/nfl/capture-nfl-schedule.mjs), rendered on /sports through the Release A contract with zero quarantine (guard: lib/sports/upcoming/adapters.test.mjs). PARTIAL not PROVEN: one manual capture is not a daily cadence" },
    },
  },

  nba: {
    inSeason: false,
    historicalArchive: true,
    stages: {
      schedule: { status: "PARTIAL", evidence: "Program 062-065 adapter is HISTORICAL_ONLY (balldontlie tests fail pre-existing); Release B (Program 148) adds the contract-satisfying upcoming adapter + /sports destination that renders the June probe as STALE + off-season in words" },
      identity: { status: "PARTIAL", evidence: "ESPN athlete ids resolve through PlayerAvatar; team coverage unverified for a full slate" },
      settlement: { status: "PARTIAL", evidence: "the settled archive was graded from official results; no repeatable forward pipeline" },
      calibration: { status: "BLOCKED_EXTERNAL", blocker: "MLB stopping rule (Program 058-061): model R&D suspended after w=0 three times — a new sport model needs the same preregistered bar and a founder decision to invest" },
    },
  },

  epl: {
    inSeason: true,
    historicalArchive: false,
    stages: {
      schedule: { status: "PARTIAL", evidence: "Release B (Program 148): adapter reads the documented soccer/epl fixture schema through the Release A contract with per-row quarantine (guard: lib/sports/upcoming/adapters.test.mjs); fixtures dir holds the schema sample only — the first real capture is Release C" },
      markets: { status: "PARTIAL", evidence: "EPL odds side landed (Program 062-065); settlement-gated, never published" },
      model: { status: "PARTIAL", evidence: "Release C (Program 148): private 4-season research corpus (1,520 matches, 0 quarantined) + three chronologically-evaluated baselines — Elo log loss 0.9991 vs uniform 1.0986 over 1,140 leakage-free predictions (data/internal/research/epl/, guard: epl-research.test.mjs in the soccer lane). These are the BAR a future model must beat, not a model claim; no-vig comparison absent until a real odds capture exists" },
      settlement: { status: "PARTIAL", evidence: "grading CONTRACT designed + guard-tested (lib/sports/epl/settlement-contract.mjs v1, Program 146): FT-only, StatsAPI-lesson quarantines, decisive=W+L, zero-gap reconciliation — source integration still unbuilt" },
    },
  },

  ufc: {
    inSeason: false,             // no covered event scheduled
    historicalArchive: true,
    stages: {
      schedule: { status: "PARTIAL", evidence: "Release B (Program 148): /sports destination renders the honest no-forward-source state; the settled archive is guard-blocked from ever rendering as an upcoming event (lib/sports/upcoming/adapters.test.mjs)" },
      identity: { status: "PARTIAL", evidence: "boutId join made rematch-safe (Program 058-061) after the unsound join finding" },
      settlement: { status: "PARTIAL", evidence: "ONE card settled from official results (2026-06-15); not a repeatable pipeline" },
      model: { status: "UNPROVEN", blocker: "no fight model exists; UFC has never published a prediction" },
    },
  },
};
