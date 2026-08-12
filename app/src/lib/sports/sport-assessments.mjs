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
      schedule: { status: "PARTIAL", evidence: "P148 first capture; CADENCE 2/2: scheduled runs 31396780843 (Aug 10) + 31500117960 (Aug 11) — run 1 proved semantic idempotency (only stamps moved), run 2 committed an intended content change. PARTIAL: reschedule/postponement lineage not yet exercised by reality" },
      data: { status: "PARTIAL", evidence: "Program 151: private research corpus — 1,001 finals across 2023-2025 (272×3 regular-season exact, 7 ties preserved, Pro Bowls quarantined, 21 counted keyless requests, manifest claims retrieval only; guard: lib/sports/research/nfl-research.test.mjs). PARTIAL: historical corpus, not live daily inputs" },
      model: { status: "PARTIAL", evidence: "Program 151: chronological baselines over 569 decisive games — Elo log loss 0.6415 / 64.5% vs coin ln(2)=0.6931 anchor; margin MAE 11.0; 2025 postseason HISTORICAL_REPLAY through the shared harness (10/13, byte-deterministic, evaluationEligible). The BAR a future NFL model must beat, not a model claim; market comparison unavailable and stated. P166-E: the baseline's Elo promoted to a pure cutoff-versioned strength state (params identical, leakage structural — the target game cannot contribute by construction) + real-event input assembly proving READY_EXCEPT_ODDS on the next scheduled game from committed artifacts, post-start refusal included" },
      settlement: { status: "PARTIAL", evidence: "P161: FINAL-only contract (WIN/LOSS/PUSH/VOID, tie=PUSH explicit) validated against ALL 1,001 corpus finals incl. the 7 ties; results capture + id-based adapter deployed and wired into sport-schedules; FIRST REAL FINAL (CAR-ARI 33-30, Aug 7) quarantined for missing schedule lineage because capture began Aug 9 — the lineage rule proven on reality, reconciliation exact. PARTIAL: no final has JOINED yet (first candidates Aug 13+) and no scheduled results-capture receipt exists yet. P163-E: corrections monitor shipped (score-correction/status-regression/disappeared-inside-window all review-gated, append-only receipts per docs/NFL_CORRECTIONS_RUNBOOK.md) + first-join candidates DISCOVERED from artifacts (DET@CIN surfaces for Aug 13 in tests)" },
    },
  },

  nba: {
    inSeason: false,
    historicalArchive: true,
    stages: {
      schedule: { status: "PARTIAL", evidence: "P150 first capture (42 events, stated partial calendar); CADENCE 2/2: scheduled runs 31396780843 (Aug 10) + 31500117960 (Aug 11) — run 2 captured the provider RELEASING more season (42→58 events, seasonTypes 1+2) — the partial-calendar design absorbed real growth correctly. PARTIAL: reschedule lineage unexercised" },
      data: { status: "PARTIAL", evidence: "Program 152: private corpus — 4,179 finals across 2023-24/2024-25/2025-26 (1,230×3 regular EXACT, cup-final own phase, play-in 6×3, both All-Star formats quarantined, 28 counted keyless requests incl. the leap-day the exactly-1230 refusal caught; guard: lib/sports/research/nba-research.test.mjs). PARTIAL: historical, not live daily inputs" },
      model: { status: "PARTIAL", evidence: "Program 152: chronological baselines over 2,643 games — Elo log loss 0.6161 / 65.8% vs coin ln(2) anchor; margin MAE 12.0; 91-game postseason HISTORICAL_REPLAY through the shared harness (54/91, frozen-state conservatism stated, byte-deterministic); model-card-v1 with limitations + activation OFF. The BAR a future NBA model must beat" },
      identity: { status: "PARTIAL", evidence: "ESPN athlete ids resolve through PlayerAvatar; team coverage unverified for a full slate" },
      settlement: { status: "PARTIAL", evidence: "P162: FINAL-only contract (tied finals QUARANTINE — impossible after OT) validated against all 4,179 corpus finals with zero moneyline pushes; keyless capture + id-join adapter (seasonType blend refused, neutral-site preserved, population-exact reconciliation) wired into sport-schedules. First real receipt = honest NO_RESULTS_YET off-season zero-row state; first join window = Oct 3 preseason per the committed schedule. PARTIAL: no forward final graded yet by definition" },
      calibration: { status: "BLOCKED_EXTERNAL", blocker: "MLB stopping rule (Program 058-061): model R&D suspended after w=0 three times — a new sport model needs the same preregistered bar and a founder decision to invest" },
    },
  },

  epl: {
    inSeason: true,
    historicalArchive: false,
    stages: {
      schedule: { status: "PARTIAL", evidence: "P149 first capture (380/380, dual-source membership); CADENCE 2/2: scheduled runs 31396780843 (Aug 10) + 31500117960 (Aug 11) — both runs re-captured 380/380 clean and DISCARDED the unchanged snapshot (snapshot-per-capture idempotency live twice). PARTIAL: postponement lineage unexercised until the season supplies one" },
      markets: { status: "PARTIAL", evidence: "EPL odds side landed (Program 062-065); settlement-gated, never published" },
      model: { status: "PARTIAL", evidence: "Release C (Program 148): private 4-season research corpus (1,520 matches, 0 quarantined) + three chronologically-evaluated baselines — Elo log loss 0.9991 vs uniform 1.0986 over 1,140 leakage-free predictions (data/internal/research/epl/, guard: epl-research.test.mjs in the soccer lane). These are the BAR a future model must beat, not a model claim; no-vig comparison absent until a real odds capture exists" },
      settlement: { status: "PARTIAL", evidence: "Contract v1 validated on a full real season (P151); P154 adds the OPERATIONAL current-results path: capture script + honest PRESEASON/NO_RESULTS_YET/SOURCE_STALE states (fresh stamps, zero fabricated rows), canonical-identity join with exactly-once consumption + total quarantine (guard: epl-current-results.test.mjs), wired into sport-schedules so the first real FT flows without deployment. PARTIAL: first real FT + settlement cadence receipts do not exist yet by definition. P163-J: corrections DETECTION instrument ready before opening day (epl-results-monitor on the shared core — SCORE_CORRECTION review-gated, receipt-before-latest-wins per the runbook). P162-E hardening: kickoff-move/alias-drift/non-final-with-scores/correction/duplicate cases pinned (epl-results-hardening) + corrections runbook committed (docs/EPL_CORRECTIONS_RUNBOOK.md, latest-wins policy + ledger-writer acceptance condition)" },
    },
  },

  ufc: {
    inSeason: true,              // forward cards captured (P150) — next event Aug 11
    historicalArchive: true,
    stages: {
      schedule: { status: "PARTIAL", evidence: "P150 first forward capture; CADENCE 2/2: scheduled runs 31396780843 (Aug 10) + 31500117960 (Aug 11) — run 2 recorded REAL lineage on fight day: one bout ADDED (82→83, stable ids, zero swaps/removals). P162: lineage CLASSIFIER shipped (lib/sports/ufc/lineage — stable-id joins, basis-recorded corner comparison, cancellation only from status, duplicate-id refusal) and reproduces that real addition from the committed captures. P163-D post-card observation: Aug 11→12 diff = 66 bouts/14 events left the forward window (classified REMOVED with the never-inferred-cancellation note — window mechanics), 17 UNCHANGED, ZERO replacements/swaps, zero refusals — a valid no-change lineage receipt. PARTIAL: replacement/cancellation still unobserved by reality; next qualifying window = post-UFC-330 (Aug 15)" },
      identity: { status: "PARTIAL", evidence: "boutId join made rematch-safe (Program 058-061); Program 153 corpus proves id-based fighter identity end-to-end (1,046 fighters, zero name-joins, self-matchup refusal)" },
      settlement: { status: "PARTIAL", evidence: "ONE card settled from official results (2026-06-15). P162-I: repeatable bout_winner contract validated against ALL 1,716 corpus finals — the 25 DRAW_OR_NC bouts are exactly the quarantines (winner-only source cannot split draw from NC, so v1 refuses to guess; zero pushes by construction); method/round refuse as unsupported. P162-J: forward capture + id-join adapter LIVE — first real run captured 12 finals from the Aug 8 card and quarantined ALL for missing lineage (bout captures began Aug 10, forward-only) with reconciliation exact: the lineage rule proven on real data for the third sport. Tonight's card IS in the captures; the first joined finals arrive with the next cadence run. P163-D FIRST JOINED RESULTS (bounded post-card observation, Aug 12 01:54 UTC): all 5 Contender Series finals JOINED with lineage from the committed bout captures and graded through the contract; the 12 pre-capture finals stay quarantined; reconciliation exact (17 = 0 nonFinal + 5 joined + 12 quarantined). P163-I: corrections monitor shipped — OVERTURNED_RESULT (winner flip) and DECISION_CHANGE (decided↔draw/NC churn) review-gated with append-only receipts; tonight's five finals read as exactly five BECAME_FINAL from the committed capture. PARTIAL: scheduled-run receipt still unexercised; no real correction observed" },
      data: { status: "PARTIAL", evidence: "Program 153: private corpus — 1,716 final bouts on 160 cards (Aug 2023–Aug 2026), 25 draw/NC preserved, 0 quarantined; rate-limit receipt in the manifest (burst→400, resumable fetcher at 15s spacing); winner-only field limitation stated (guard: lib/sports/research/ufc-research.test.mjs). PARTIAL: historical, not live" },
      model: { status: "PARTIAL", evidence: "Program 153: abstaining Elo baseline — coverage 25.6% BY DESIGN (in-corpus history only, stated), Elo 0.6791 vs listing-order prior 0.6906 vs coin ln(2) over 289 covered bouts; last-card replay through the shared harness (5/12 covered, abstentions with reasons ON the artifact); model-card-v1 names the weak signal as the finding. The BAR a future fight model must beat; activation OFF" },
    },
  },
};
