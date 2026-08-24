/**
 * THE RUNBOOK REGISTRY — one executable operating system, keyed sport × lifecycle stage
 * (Program 198 · Release D).
 *
 * Monitoring grew release by release and each sport's operating knowledge lived in its own
 * workflow comments, lane builders and program memory. This registry is the consolidation: for
 * every sport and every lifecycle lane, WHO runs it (the owning workflow or script), WHEN, what
 * QUIET looks like (a healthy no-change day must never read as an outage), how to RECOVER, and
 * where the receipt lands. NOT_APPLICABLE is stated per cell rather than left blank — a blank is
 * a question, N_A is an answer.
 *
 * The registry is DATA + a validator. /launch renders it beside the closure packets; the guard
 * proves every named workflow/script actually exists (a runbook pointing at a job that is not
 * real is worse than no runbook) and that every sport covers every lane with exactly one entry.
 * It duplicates no status: states live in the packets/receipts; this is the HOW-TO layer.
 */

export const RUNBOOK_VERSION = 1;

/** The lifecycle lanes, in execution order. Every sport answers every lane. */
export const LIFECYCLE_LANES = Object.freeze([
  "schedule", "inputs", "forecasts", "prices", "qualification", "products",
  "lock", "results", "settlement", "learning", "publish", "monitoring",
]);

const NA = (why) => ({ na: true, why });

/**
 * One entry: { runs, when, quiet, recover, receipt } or NA(why).
 * `runs` names workflows (.yml) or scripts (path) — the guard checks existence of each token
 * ending in .yml/.mjs/.sh. Keep strings operational: an operator pastes them, not reads essays.
 */
export const RUNBOOKS = Object.freeze({
  mlb: {
    schedule: { runs: "mlb-daily-production.yml + sport pregame captures", when: "daily 14:15 UTC + capture crons", quiet: "board written for the ET slate date", recover: "workflow_dispatch mlb-daily-production.yml; never hand-edit a board", receipt: "public/data/mlb/boards/<date>.json (own generatedAt)" },
    inputs: { runs: "mlb-pregame-capture.yml + mlb-lineup-refresh.yml", when: "T-24h shell then hourly lineup slots", quiet: "confirmed orders replace probables through the day", recover: "re-dispatch the missed slot; padded games self-heal on the next lineup pass", receipt: "pregame archive + lineup stamps inside the board" },
    forecasts: { runs: "scripts/generate-mlb-full-game-simulations.mjs + scripts/generate-mlb-predictions.mjs", when: "inside daily production + lineup refresh", quiet: "sims+predictions regenerate together (artifactHash pairing)", recover: "regen BOTH with a pinned --now; never re-stamp one alone", receipt: "full-game-simulations/<date>.json + predictions/<date>.json + immutable snapshot" },
    prices: { runs: "scripts/ingest-mlb-team-markets.mjs (inside daily production)", when: "daily, credit-guarded", quiet: "leans present for the slate; credits within budget", recover: "top-up path = generator + whole-slate-pregame ONLY", receipt: "board leans + credit ledger line" },
    qualification: { runs: "publication gate inside board generation", when: "every generation", quiet: "no-play rows are first-class rows", recover: "a refused slate stays refused; investigate the named reason", receipt: "board summary + gate refusals in run log" },
    products: { runs: "daily-products.yml", when: "15:30 UTC", quiet: "typed receipt per lane (NO_PLAY is healthy)", recover: "re-dispatch; receipts are content-idempotent", receipt: "data/internal/products/receipts/<date>.json" },
    lock: { runs: "bank-builder-locks (approved-card pin inside daily flow)", when: "T08:00Z regen boundary", quiet: "locked legs match the approved card", recover: "promote --apply with md5 guard; keep the card the founder APPROVED", receipt: "bank-builder-locks.json" },
    results: { runs: "scripts/fetch-mlb-linescores.mjs (inside nightly-settle.yml)", when: "nightly, 5-day backfill window", quiet: "byte-identical refetch of final dates", recover: "re-run with --dates; refusals keep last-known-good", receipt: "data/internal/mlb/linescores/<date>.json" },
    settlement: { runs: "nightly-settle.yml (the ONE writer)", when: "nightly", quiet: "0 newly settled on an already-settled day", recover: "idempotent re-run; a decided outcome never moves", receipt: "settled ledgers + game-predictions-graded.jsonl" },
    learning: { runs: "prediction-history exporter + calibration layers (inside nightly-settle.yml)", when: "immediately after settlement", quiet: "no-op on an unchanged corpus", recover: "re-run the settle job; raw layers never overwritten", receipt: "calibration artifacts (4 layers)" },
    publish: { runs: "Vercel on push (auto)", when: "every main push the ignoreCommand admits", quiet: "verify:deployment says production serves HEAD", recover: "npm run verify:deployment; wait for the covering build, never repush data to force one", receipt: "out/data/build-info.json on production" },
    monitoring: { runs: "cron-watchdog.yml + scripts/build-admin-status.mjs + scripts/ops/ops_alert wiring", when: "daily 14:30 UTC + per-job failure hooks", quiet: "watchdog OK with zero missed/failing", recover: "follow the alert's named remediation; check admin/status.json first", receipt: "cron-slot-watchdog.json + evidence ledger" },
  },
  epl: {
    schedule: { runs: "sport-schedules.yml (fixtures step) + epl-matchweek.yml", when: "daily 13:00 UTC + cluster crons", quiet: "snapshot-per-capture: unchanged fixture set deletes its own snapshot", recover: "re-dispatch sport-schedules; SOURCE_STALE keeps last-known-good", receipt: "soccer/epl/fixtures snapshots + schedule-cadence.json" },
    inputs: { runs: "scripts/epl/capture-epl-squads.mjs + scripts/epl/capture-epl-espn-players.mjs (inside matchweek)", when: "matchweek cadence", quiet: "squads fresh for the next cluster", recover: "re-dispatch epl-matchweek.yml", receipt: "squad/player artifacts (own stamps)" },
    forecasts: { runs: "scripts/epl/build-epl-forecasts.mjs (inside epl-matchweek.yml)", when: "night-before + matchday slots", quiet: "CURRENT_PRE_EVENT rows with probs + persisted market.noVig", recover: "re-dispatch; hollow rows refuse the whole set", receipt: "forecasts/<date>.json + immutable snapshot-*.json" },
    prices: { runs: "scripts/epl/capture-epl-odds.mjs (priced crons ≤09:00 UTC)", when: "before the day's first kickoff", quiet: "2-credit worst case per run; de-vig across the 3-way set", recover: "dry-run first; the ladder closes itself on stale prices", receipt: "odds captures + authorization ledger" },
    qualification: { runs: "lib/sports/epl/shadow-run.mjs (inside forecast build)", when: "every generation", quiet: "declined fixtures NAMED on the artifact", recover: "a declined fixture stays declined; check the named reason", receipt: "forecast rows' state + declined list" },
    products: { runs: "scripts/epl/build-epl-ladder.mjs (inside epl-matchweek.yml)", when: "matchweek cadence", quiet: "ladder rolls to the first serviceable day; unreachable bands report reached prices", recover: "re-dispatch; selection is market-price-only by guard", receipt: "parlays/risk-ladder-epl/latest.json (state PUBLISHED)" },
    lock: { runs: "forecast-of-record rule (latest pre-kickoff revision)", when: "at each kickoff, by construction", quiet: "post-kickoff regenerations are ignored by graders", recover: "nothing to recover — the rule is applied at grade time", receipt: "graded rows' forecastGeneratedAt < kickoffUtc" },
    results: { runs: "sport-schedules.yml (eplresults step)", when: "daily 13:00 UTC", quiet: "identity-bridged rows; quarantines named", recover: "re-dispatch; refusals keep last-known-good", receipt: "soccer/epl/results/latest.json" },
    settlement: { runs: "epl-settle.yml + epl-matchweek post-kickoff slots (one grader)", when: "nightly 23:00 UTC + cluster slots", quiet: "NOTHING_NEW with declined fixtures named", recover: "grader is append-only + idempotent; BROKEN_JOIN refuses loudly", receipt: "graded-forecasts.jsonl + graded-picks.json" },
    learning: { runs: "scripts/epl/report-epl-learning.mjs (inside epl-settle.yml)", when: "nightly after grading", quiet: "counts equal ledger recount (guard C7 enforces)", recover: "re-run report; C7 fails the /launch build on drift", receipt: "research/epl/learning/latest.json" },
    publish: { runs: "Vercel on push (auto)", when: "every admitted push", quiet: "/epl freshness = forecast artifact's own stamp", recover: "verify:deployment; wait for the covering build", receipt: "built /epl + match pages" },
    monitoring: { runs: "cron-watchdog.yml (daily + 09:30 weekend slots) + scripts/epl/build-epl-lane-status.mjs", when: "daily + matchweek", quiet: "epl-lane.json fresh; watchdog OK", recover: "follow alert remediation; check the lane artifact first", receipt: "admin/epl-lane.json + watchdog artifact" },
  },
  nfl: {
    schedule: { runs: "sport-schedules.yml (nfl step)", when: "daily 13:00 UTC", quiet: "content-idempotent; cadence receipt proves the run", recover: "re-dispatch sport-schedules.yml", receipt: "nfl/schedule/latest.json + schedule-cadence.json" },
    inputs: { runs: "scripts/sports/capture-injuries.mjs + scripts/nfl/capture-nfl-rosters.mjs (inside sport-schedules/nfl jobs)", when: "daily", quiet: "regularSeason matrix verdict READY_WITH_DESIGN_CAPS", recover: "re-dispatch; absence types UNKNOWN, never healthy", receipt: "nfl-lane.json regularSeason block" },
    forecasts: { runs: "nfl-event-window.yml (run-nfl-event-window)", when: "event-window crons", quiet: "revisions freeze pre-kickoff; receipts under forecast-receipts/", recover: "re-dispatch the window; post-start refuses", receipt: "nfl/forecasts + forecast-receipts/<date>/" },
    prices: { runs: "nfl-odds-capture.yml", when: "authorized crons (season-aware keys)", quiet: "ONE bulk call per live key; ledger counts credits", recover: "dry-run; never blind-retry a paid call", receipt: "nfl markets artifact + authorization ledger" },
    qualification: { runs: "lib/sports/nfl/shadow-run.mjs ladder", when: "every forecast build", quiet: "REFUSED/ABSTAIN/READY_EXCEPT states are auditable rows", recover: "nothing to force — the ladder is the policy", receipt: "forecast rows' rung states" },
    products: { runs: "scripts/nfl/build-end-zone-vault.mjs (inside daily-products.yml)", when: "daily 15:30 UTC", quiet: "typed NO_PLAY with reasons (participation/scorer price)", recover: "re-dispatch daily-products; receipts idempotent", receipt: "daily product receipt end-zone-vault row" },
    lock: { runs: "forecast-of-record rule (latest pre-kickoff revision; receipts immutable)", when: "at kickoff, by construction", quiet: "rev files preserved as lineage", recover: "nothing to recover; graders re-check the rule", receipt: "experimental-settlement lineage.revisionChain" },
    results: { runs: "sport-schedules.yml (nflresults step)", when: "daily 13:00 UTC", quiet: "trailing window holds finals + quarantines", recover: "re-dispatch; SOURCE_STALE keeps last-known-good", receipt: "nfl/results/latest.json" },
    settlement: { runs: "scripts/nfl/settle-nfl-experimental.mjs (inside nightly-settle.yml)", when: "nightly", quiet: "cohort-scoped summary; ties void; exactly-once", recover: "idempotent; corrections append lineage", receipt: "experimental-settlement/<date>.json + summary.json" },
    learning: { runs: "cohort summary rebuild (inside the settler)", when: "every settle", quiet: "headline = exactly one season cohort", recover: "re-run settle; cohorts never blend by guard", receipt: "summary.json cohorts block" },
    publish: { runs: "Vercel on push (auto)", when: "every admitted push", quiet: "/nfl derives slate day from index.nextKickoffUtc", recover: "verify:deployment", receipt: "built /nfl + game reports" },
    monitoring: { runs: "cron-watchdog.yml + scripts/nfl/build-nfl-lane-status.mjs", when: "daily + event-window", quiet: "watchdog OK incl. fired-and-failed axis", recover: "follow alert remediation", receipt: "nfl-lane.json + watchdog artifact" },
  },
  ufc: {
    schedule: { runs: "sport-schedules.yml (ufc step) + ufc-fight-week.yml", when: "daily + Tue/Thu/Sat", quiet: "population audit POPULATION_EXACT after every card rebuild", recover: "re-dispatch fight-week; audit exit 2 = investigate the named missing/phantom bouts", receipt: "population/<slateDate>.json + schedule-cadence.json" },
    inputs: { runs: "scripts/ufc/build-ufc-card.mjs (corpus features inside fight-week)", when: "fight-week cadence", quiet: "typed input matrix on the population receipt", recover: "re-dispatch; SPARSE bouts stay named unmodelled", receipt: "population receipt inputMatrix" },
    forecasts: { runs: "scripts/ufc/build-ufc-card.mjs (three model heads)", when: "fight-week cadence", quiet: "every bout MODELLED or UNMODELLED_WITH_REASON", recover: "re-dispatch; source-hash mismatch refuses publish", receipt: "card-latest.json (own generatedAt + modelId)" },
    prices: { runs: "scripts/ufc/capture-ufc-odds.mjs (three priced crons only)", when: "Tue/Thu/Sat 11:00 UTC", quiet: "bulk-only under the 500-credit receipt; dedupe window", recover: "dry-run; refusal keeps the ladder closed on stale prices", receipt: "odds-latest + authorization ledger (9/500)" },
    qualification: { runs: "lab-eligibility gates (inside ladder build)", when: "every ladder build", quiet: "gates computed from disk every run", recover: "a closed stream stays closed until evidence returns", receipt: "ladder artifact gate fields" },
    products: { runs: "scripts/ufc/build-ufc-ladder.mjs (inside fight-week)", when: "fight-week cadence", quiet: "ACTIVE dated ladder while the card is ahead", recover: "re-dispatch; a fought card renders no live ladder", receipt: "parlays/risk-ladder-ufc/latest.json" },
    lock: { runs: "scripts/ufc/capture-ufc-model-vs-market.mjs (pre-fight snapshot)", when: "priced crons pre-card", quiet: "snapshot refuses to write once the card starts", recover: "nothing to recover — immutability is the contract", receipt: "model-vs-market/snapshot-*.json" },
    results: { runs: "scripts/ufc/capture-ufc-results.mjs (sport-schedules + in-job before post-card grading)", when: "daily + post-card 08:00 UTC", quiet: "limit=1000 full-event capture; eventDateUtc keys the join", recover: "re-dispatch; SOURCE_STALE keeps last-known-good", receipt: "ufc/results/latest.json" },
    settlement: { runs: "scripts/ufc/grade-ufc-model-vs-market.mjs (inside ufc-post-card.yml)", when: "daily 08:00 UTC", quiet: "NOTHING_NEW with reconciliation intact (frozen=graded+void+pending)", recover: "append-only; conflicts refuse, never resolve", receipt: "graded.jsonl + summary.json reconciliation" },
    learning: { runs: "cumulative block rebuild (inside the grader, self-healing)", when: "every write", quiet: "cumulative n equals decisive ledger count", recover: "re-run grader; drift self-heals on quiet exits", receipt: "summary.json cumulative" },
    publish: { runs: "Vercel on push (auto)", when: "every admitted push", quiet: "/ufc heading derives from the card's own startUtc", recover: "verify:deployment", receipt: "built /ufc + record region" },
    monitoring: { runs: "cron-watchdog.yml + scripts/ufc/build-ufc-lane-status.mjs", when: "daily + fight-week", quiet: "population POPULATION_EXACT · mvm RECONCILED · lag CLEAR", recover: "follow the named field's remediation", receipt: "admin/ufc-lane.json" },
  },
  nba: {
    schedule: { runs: "sport-schedules.yml (nba step)", when: "daily 13:00 UTC", quiet: "UNCHANGED cadence receipt on quiet off-season days", recover: "re-dispatch sport-schedules.yml", receipt: "nba/schedule/latest.json + schedule-cadence.json" },
    inputs: { runs: "scripts/sports/capture-injuries.mjs (nba feed, inside sport-schedules)", when: "daily", quiet: "off-season feed may be sparse; absence types UNKNOWN", recover: "re-dispatch; lineup source stays BLOCKED_EXTERNAL until the rights decision", receipt: "research/injuries/nba artifacts" },
    forecasts: NA("activation OFF — the shadow contract emits refusals only; no pre-event artifact may exist for the dormant lane"),
    prices: NA("no NBA-scoped odds authorization exists; another sport's receipt cannot serve (adapter + cost guards are built and waiting)"),
    qualification: { runs: "lib/sports/nba/shadow-contract.mjs (fail-closed ladder)", when: "on any future assembly", quiet: "REFUSED_ACTIVATION_OFF is the correct current answer", recover: "nothing to recover — refusal is the designed output", receipt: "shadow-contract tests prove the rungs" },
    products: { runs: "scripts/products/build-daily-product-receipts.mjs (nba-lanes row)", when: "daily 15:30 UTC", quiet: "OFF_SEASON derived from the results capture's own state", recover: "re-dispatch daily-products", receipt: "daily receipt nba-lanes row" },
    lock: NA("nothing to freeze while no forecast may exist; the freeze rule inherits from the shared pattern when activation opens"),
    results: { runs: "scripts/nba/capture-nba-results.mjs (inside sport-schedules)", when: "daily 13:00 UTC", quiet: "OFF_SEASON with zero rows (distinct from NO_RESULTS_YET)", recover: "re-dispatch; failure writes nothing", receipt: "nba/results/latest.json" },
    settlement: { runs: "lib/sports/nba/current-results.mjs contract (wired for the first final)", when: "nightly once finals exist", quiet: "no forward final yet — the first-final watch is armed", recover: "corpus-proven contract; ties quarantine", receipt: "first graded row (October) + watch entry" },
    learning: NA("no graded sample can exist before the first settled final; the cohort pattern (NFL P196-E) is the committed template"),
    publish: { runs: "the /sports NBA section (build-time from the capture)", when: "every build", quiet: "confirmed-events coverage line from the capture itself", recover: "verify /sports renders the honest partial-window line", receipt: "built /sports section" },
    monitoring: { runs: "cron-watchdog.yml (auto via SPORT_OWNERS) + cadence receipt", when: "daily", quiet: "watchdog OK; receipt UNCHANGED", recover: "follow alert remediation", receipt: "watchdog artifact + schedule-cadence.json" },
  },
});

/** Validate shape: every sport × lane exactly once, entries carry the operational fields or NA. */
export function validateRunbooks(registry = RUNBOOKS) {
  const problems = [];
  for (const [sport, lanes] of Object.entries(registry)) {
    for (const lane of LIFECYCLE_LANES) {
      const e = lanes[lane];
      if (!e) { problems.push(`${sport}.${lane}: missing — a blank is a question, N_A is an answer`); continue; }
      if (e.na) { if (!e.why || e.why.length < 20) problems.push(`${sport}.${lane}: NA without a real why`); continue; }
      for (const f of ["runs", "when", "quiet", "recover", "receipt"]) {
        if (!e[f] || e[f].length < 5) problems.push(`${sport}.${lane}.${f}: empty or too thin to operate from`);
      }
    }
    for (const lane of Object.keys(lanes)) {
      if (!LIFECYCLE_LANES.includes(lane)) problems.push(`${sport}.${lane}: not a lifecycle lane`);
    }
  }
  return problems;
}
