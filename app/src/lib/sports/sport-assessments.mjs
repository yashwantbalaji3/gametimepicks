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
      schedule: { status: "PARTIAL", evidence: "Program 148: FIRST REAL CAPTURE — 16 preseason events from the ESPN public scoreboard (espn_scoreboard registry entry, scripts/nfl/capture-nfl-schedule.mjs), rendered on /sports through the Release A contract with zero quarantine (guard: lib/sports/upcoming/adapters.test.mjs). PARTIAL not PROVEN: one manual capture is not a daily cadence" },
      data: { status: "PARTIAL", evidence: "Program 151: private research corpus — 1,001 finals across 2023-2025 (272×3 regular-season exact, 7 ties preserved, Pro Bowls quarantined, 21 counted keyless requests, manifest claims retrieval only; guard: lib/sports/research/nfl-research.test.mjs). PARTIAL: historical corpus, not live daily inputs" },
      model: { status: "PARTIAL", evidence: "Program 151: chronological baselines over 569 decisive games — Elo log loss 0.6415 / 64.5% vs coin ln(2)=0.6931 anchor; margin MAE 11.0; 2025 postseason HISTORICAL_REPLAY through the shared harness (10/13, byte-deterministic, evaluationEligible). The BAR a future NFL model must beat, not a model claim; market comparison unavailable and stated" },
    },
  },

  nba: {
    inSeason: false,
    historicalArchive: true,
    stages: {
      schedule: { status: "PARTIAL", evidence: "Program 150: FRESH capture of the 42 confirmed 2026-27 events (preseason, 3 neutral-site) from the ESPN public scoreboard, rendered on /sports as a stated partial calendar — never the season (guard: lib/sports/upcoming/adapters.test.mjs). The stale June probe is display-retired. PARTIAL: no cadence yet, full-season publication pending" },
      identity: { status: "PARTIAL", evidence: "ESPN athlete ids resolve through PlayerAvatar; team coverage unverified for a full slate" },
      settlement: { status: "PARTIAL", evidence: "the settled archive was graded from official results; no repeatable forward pipeline" },
      calibration: { status: "BLOCKED_EXTERNAL", blocker: "MLB stopping rule (Program 058-061): model R&D suspended after w=0 three times — a new sport model needs the same preregistered bar and a founder decision to invest" },
    },
  },

  epl: {
    inSeason: true,
    historicalArchive: false,
    stages: {
      schedule: { status: "PARTIAL", evidence: "Program 149: FIRST REAL CAPTURE — all 380 2026-27 fixtures (20/20 clubs, membership dual-source-verified: ESPN eng.1 × openfootball, receipts docs/EPL_SOURCE_DECISION.md), validated by the lane's own validateFixtureArtifact, rendered on /sports as a bounded stated window (guard: lib/sports/upcoming/adapters.test.mjs). PARTIAL not PROVEN: one manual capture is not a refresh cadence and postponement lineage is unexercised" },
      markets: { status: "PARTIAL", evidence: "EPL odds side landed (Program 062-065); settlement-gated, never published" },
      model: { status: "PARTIAL", evidence: "Release C (Program 148): private 4-season research corpus (1,520 matches, 0 quarantined) + three chronologically-evaluated baselines — Elo log loss 0.9991 vs uniform 1.0986 over 1,140 leakage-free predictions (data/internal/research/epl/, guard: epl-research.test.mjs in the soccer lane). These are the BAR a future model must beat, not a model claim; no-vig comparison absent until a real odds capture exists" },
      settlement: { status: "PARTIAL", evidence: "Contract v1 (P146) now validated against a FULL REAL SEASON (P151): all 380 2025-26 results grade with zero voids, mirrored slate reconciles decisive=W+L exactly, draws explicit; deterministic provider-id join proven 380/380 on 2023-24 with reverse fixtures separated by kickoff (guard: epl-settlement-validation.test.mjs, soccer lane). PARTIAL: no live current-season results feed wired yet" },
    },
  },

  ufc: {
    inSeason: true,              // forward cards captured (P150) — next event Aug 11
    historicalArchive: true,
    stages: {
      schedule: { status: "PARTIAL", evidence: "Program 150: FIRST FORWARD CAPTURE — 16 cards / 82 named bouts (ESPN MMA scoreboard), bouts rendered through the contract red/blue scheme with card context; settled archive stays a separate store, guard-blocked from rendering as upcoming (lib/sports/upcoming/adapters.test.mjs). PARTIAL: no cadence, replacement/cancellation lineage unexercised" },
      identity: { status: "PARTIAL", evidence: "boutId join made rematch-safe (Program 058-061) after the unsound join finding" },
      settlement: { status: "PARTIAL", evidence: "ONE card settled from official results (2026-06-15); not a repeatable pipeline" },
      model: { status: "UNPROVEN", blocker: "no fight model exists; UFC has never published a prediction" },
    },
  },
};
