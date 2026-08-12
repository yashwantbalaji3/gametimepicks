/**
 * All-sport prediction factory — shared ORCHESTRATION contract, sport-specific SEMANTICS
 * (Program 167 · Release H). PRIVATE.
 *
 * What is unified: the pipeline stage vocabulary, the adapter manifest every sport must declare,
 * the model-output VARIANT schemas, and ONE readiness registry whose six axes are INDEPENDENT
 * and never collapse into a single score. What is deliberately NOT unified: model math, outcome
 * taxonomies, markets, qualification thresholds — forcing every sport into one sport's
 * assumptions is the failure mode this module exists to refuse.
 *
 * MLB RULE: the manifest DESCRIBES the existing live pipeline; nothing here wraps, re-routes, or
 * recomputes any MLB artifact. MLB participates as read-only truth.
 *
 * CROSS-SPORT RANKING BAN: no export returns sports ordered by any model metric — log losses
 * from different outcome spaces are incommensurable, and a function that ranked them would be
 * used. The registry is keyed, never sorted by quality.
 */
import fs from "node:fs";
import path from "node:path";

import { MARKET_SCOPE } from "./odds/market-scope.mjs";
import { LIVE_INPUT_MATRIX } from "./research/shadow-contract.mjs";

export const FACTORY_VERSION = 1;

/** The shared pipeline vocabulary — stages, not scores. Every sport names owners per stage. */
export const PIPELINE_STAGES = Object.freeze([
  "event_discovery", "identity", "live_inputs", "odds", "cutoff_features",
  "model_simulation", "calibration", "qualification", "private_shadow",
  "official_result", "settlement_quarantine", "monitoring",
]);

/** Model-output variants — the closed set. A sport declares exactly one. */
export const OUTPUT_VARIANTS = Object.freeze({
  MLB_EXISTING: "the live MLB pipeline's own shapes — described, never re-validated here",
  BINARY_WINNER_MARGIN_TOTAL: "two-way win probs + margin/total distributions with quantiles (NFL, NBA)",
  BINARY_WINNER_ABSTAIN: "two-way win probs with first-class abstention states (UFC)",
  THREE_WAY_SCORE_TOTAL: "1X2 probs + exact-score matrix + total-goals distribution (EPL)",
});

/** Validate one model output against its declared variant. Total {ok, errors}. */
export function validateModelOutput(variant, out) {
  const errors = [];
  const isProb = (p) => typeof p === "number" && p >= 0 && p <= 1;
  const orderedQuantiles = (q) => q && ["p10", "p25", "p50", "p75", "p90"].every((k) => typeof q[k] === "number") && q.p10 <= q.p25 && q.p25 <= q.p50 && q.p50 <= q.p75 && q.p75 <= q.p90;
  switch (variant) {
    case "BINARY_WINNER_MARGIN_TOTAL": {
      if (out?.state === "ABSTAIN") { if (!out.reason) errors.push("abstention without a reason"); break; }
      const p = out?.probs ?? {};
      const [a, b] = Object.values(p);
      if (Object.keys(p).length !== 2 || !isProb(a) || !isProb(b) || Math.abs(a + b - 1) > 1e-6) errors.push("binary probs must be two probabilities summing to 1");
      if (!orderedQuantiles(out?.margin?.quantiles)) errors.push("margin quantiles missing or unordered");
      if (!orderedQuantiles(out?.total?.quantiles)) errors.push("total quantiles missing or unordered");
      break;
    }
    case "BINARY_WINNER_ABSTAIN": {
      if (out?.state === "ABSTAIN") { if (!out.rule || !out.reason) errors.push("abstention must carry rule + reason"); break; }
      if (out?.state !== "PREDICTED") { errors.push(`state must be PREDICTED or ABSTAIN, got ${out?.state}`); break; }
      const p = out?.probs ?? {};
      if (!isProb(p.red) || !isProb(p.blue) || Math.abs(p.red + p.blue - 1) > 1e-6) errors.push("red/blue probs must sum to 1");
      break;
    }
    case "THREE_WAY_SCORE_TOTAL": {
      const p = out?.probs ?? out?.oneXTwo ?? {};
      const vals = [p.home, p.draw, p.away];
      if (!vals.every(isProb) || Math.abs(vals.reduce((s, x) => s + x, 0) - 1) > 1e-6) errors.push("home/draw/away must be three probabilities summing to 1 — the draw is never folded away");
      if (!out?.totals || !Number.isFinite(out.totals.expected)) errors.push("total-goals expectation missing");
      if (!Array.isArray(out?.topScorelines) || out.topScorelines.length === 0) errors.push("exact-score head missing");
      break;
    }
    case "MLB_EXISTING":
      errors.push("MLB outputs are validated by the live pipeline's own guards — this validator refuses to duplicate them");
      break;
    default:
      errors.push(`unknown variant ${variant} — the variant set is closed`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Adapter manifests — one declaration per sport. Paths are repo-relative receipts a reader can
 * open; nothing here is a score. publicActivation is OFF everywhere non-MLB by charter.
 */
export const SPORT_ADAPTER_MANIFESTS = Object.freeze({
  mlb: {
    outputVariant: "MLB_EXISTING",
    outcomeTaxonomy: "moneyline/run-line/totals + player props (live pipeline)",
    markets: "own credit-guarded daily pipeline (not MARKET_SCOPE-governed)",
    inputs: { note: "the live pipeline's own capture chain — described, not re-declared" },
    modelCard: "the committed MLB calibration-status module (all modeled markets demoted to market-context — the committed truth)",
    replayReport: "data/internal/research + docs (Sprints 046-057: no measurable advantage vs the market; research-terminal direction)",
    qualificationPolicy: "existing publication gate + identity ratchet",
    settlement: "nightly-settle (THE one writer) from MLB StatsAPI officials",
    automationOwner: "daily-refresh / nightly-settle / auto-refresh workflows",
    publicActivation: "LIVE (the only 12/12 sport)",
  },
  nfl: {
    outputVariant: "BINARY_WINNER_MARGIN_TOTAL",
    outcomeTaxonomy: "two-way winner + margin/total distributions (ties push at settlement)",
    markets: MARKET_SCOPE.nfl,
    inputs: { required: ["schedule", "teamStrengthState"], optional: ["injuries"], blocked: ["odds"], policy: "preseason ABSTAINS always (model card v1)" },
    modelCard: "data/internal/research/nfl/model-card-v1.json",
    replayReport: "data/internal/research/nfl/reports/model-v1-evaluation.json",
    qualificationPolicy: "shadow ladder: REFUSED_POST_START > ABSTAIN > READY_EXCEPT_ODDS > CURRENT_PRE_EVENT (lib/sports/nfl/shadow-run.mjs)",
    settlement: "lib/sports/nfl/settlement-contract.mjs (1,001-final corpus, explicit tie PUSH)",
    automationOwner: "sport-schedules cadence (13:00 UTC)",
    publicActivation: "OFF",
  },
  ufc: {
    outputVariant: "BINARY_WINNER_ABSTAIN",
    outcomeTaxonomy: "two-way winner; draw/NC quarantine at settlement; method/round UNSUPPORTED",
    markets: MARKET_SCOPE.ufc,
    inputs: { required: ["schedule", "fighterStrengthState", "cardCertainty(lineage)"], missing: ["weighInsReplacements"], blocked: ["odds"], policy: "lineage instability always abstains" },
    modelCard: "data/internal/research/ufc/model-card-v2.json",
    replayReport: "data/internal/research/ufc/reports/model-v1-evaluation.json",
    qualificationPolicy: "per-bout ladder with CARD_UNCERTAIN gate (lib/sports/ufc/shadow-run.mjs)",
    settlement: "lib/sports/ufc/settlement-contract.mjs (winner-only; draw/NC → review states)",
    automationOwner: "sport-schedules cadence + ufc results capture",
    publicActivation: "OFF",
  },
  epl: {
    outputVariant: "THREE_WAY_SCORE_TOTAL",
    outcomeTaxonomy: "1X2 + exact score + total goals; FT-only settlement",
    markets: MARKET_SCOPE.epl,
    inputs: { required: ["fixtures", "clubStrengthState"], notRequired: ["lineups (NOT_REQUIRED_FOR_TEAM_V1, model-card rule)"], blocked: ["odds"], policy: "unknown club abstains; promoted clubs cold-start via committed list" },
    modelCard: "data/internal/research/epl/model-card-v1.json",
    replayReport: "data/internal/research/epl/reports/model-v1-evaluation.json",
    qualificationPolicy: "fixture ladder with three-way-only market gate (lib/sports/epl/shadow-run.mjs)",
    settlement: "lib/sports/epl/settlement-contract.mjs (FT-only; corrections runbook)",
    automationOwner: "sport-schedules cadence (fixtures + results steps)",
    publicActivation: "OFF",
  },
  nba: {
    outputVariant: "BINARY_WINNER_MARGIN_TOTAL",
    outcomeTaxonomy: "two-way winner + margin/total distributions (same variant as NFL — factory compatibility, not a model)",
    markets: MARKET_SCOPE.nba,
    inputs: { available: ["schedule", "priorResults", "teamStrengthState"], missing: ["injuriesLineups (founder rights decision)"], blocked: ["odds"], policy: "maintenance-only until the calendar approaches" },
    modelCard: null,
    replayReport: null,
    qualificationPolicy: "inherits the shared ladder vocabulary; no engine exists yet by design",
    settlement: "results-monitor core proven; settlement contract pending an engine",
    automationOwner: "sport-schedules cadence",
    publicActivation: "OFF",
  },
});

const AXES = Object.freeze(["CONTRACT_READY", "REPLAY_VALIDATED", "SHADOW_READY", "CURRENT_SHADOW_PROVEN", "SETTLEMENT_PROVEN", "PUBLIC_ELIGIBLE"]);
export const READINESS_AXES = AXES;

const exists = (rel) => { try { return fs.existsSync(path.join(process.cwd(), "..", rel)); } catch { return false; } };
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", rel), "utf8")); } catch { return null; } };

/**
 * ONE readiness registry, consumed verbatim by /launch. Six INDEPENDENT axes per sport, each
 * {state, receipt|reason}. Axes never merge; nothing sorts sports by metric. Deterministic given
 * the repository state (receipts are committed artifacts, not clocks).
 */
export function deriveReadinessRegistry() {
  const registry = {};
  for (const [sport, m] of Object.entries(SPORT_ADAPTER_MANIFESTS)) {
    const axes = {};
    if (sport === "mlb") {
      axes.CONTRACT_READY = { state: true, receipt: "live pipeline guards (run_all_tests) — described, not re-proven here" };
      axes.REPLAY_VALIDATED = { state: true, receipt: m.replayReport };
      axes.SHADOW_READY = { state: true, receipt: "the live pipeline IS the shadow path grown up" };
      axes.CURRENT_SHADOW_PROVEN = { state: true, receipt: "daily pregame artifacts (append-only board patches)" };
      axes.SETTLEMENT_PROVEN = { state: true, receipt: "nightly-settle ledger (19-14 protected history)" };
      axes.PUBLIC_ELIGIBLE = { state: true, receipt: "the only 12/12 LIVE_ELIGIBLE sport (sport gate)" };
    } else {
      const hasEngine = !!m.modelCard;
      axes.CONTRACT_READY = {
        state: true,
        receipt: sport === "nba"
          ? "schedule/results/research contracts + variant compatibility test (factory) — no engine, by design"
          : `shadow ladder + settlement contract + unit suites (lib/sports/${sport}/)`,
      };
      const report = m.replayReport ? readJson(m.replayReport) : null;
      axes.REPLAY_VALIDATED = report
        ? { state: true, receipt: `${m.replayReport} (${report.metrics?.model?.n ?? "?"} scored)` }
        : { state: false, reason: hasEngine ? "replay report missing" : "no engine exists yet by design (maintenance-only)" };
      axes.SHADOW_READY = (() => {
        if (sport === "nfl") return { state: true, receipt: "READY_EXCEPT_ODDS proven on the real next event (P166-E assembly + P167-E ladder tests over committed artifacts)" };
        if (sport === "ufc") return exists("data/internal/research/ufc/reports/ufc330-preflight.json")
          ? { state: true, receipt: "data/internal/research/ufc/reports/ufc330-preflight.json (11 READY_EXCEPT_ODDS + 1 ABSTAIN across the real card)" }
          : { state: false, reason: "no preflight artifact" };
        if (sport === "epl") return { state: true, receipt: "all 10 matchweek-1 fixtures READY_EXCEPT_ODDS from the committed 380-fixture capture (shadow-run tests)" };
        return { state: false, reason: "no real input assembly exercised — engine deferred" };
      })();
      axes.CURRENT_SHADOW_PROVEN = { state: false, reason: "no CURRENT_PRE_EVENT artifact exists — impossible without an authorized odds snapshot (AUTHORIZATION_REQUIRED), and a backfill can never substitute" };
      axes.SETTLEMENT_PROVEN = { state: false, reason: `settlement CONTRACT validated (${m.settlement}) but no shadow artifact has settled through it — the axis flips on the first real shadow→official-result join` };
      axes.PUBLIC_ELIGIBLE = { state: false, reason: "publicActivation OFF by charter; requires the twelve-stage gate AND a separate founder activation decision" };
    }
    registry[sport] = { outputVariant: m.outputVariant, axes };
  }
  return { version: FACTORY_VERSION, axes: AXES, sports: registry, crossSportRanking: "BANNED — outcome spaces are incommensurable; the registry is keyed, never sorted by quality" };
}
