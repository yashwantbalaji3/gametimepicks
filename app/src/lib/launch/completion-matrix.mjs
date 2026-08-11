/**
 * Department × Sport completion matrix + the 30-day roadmap (Program 145 · corrective release).
 *
 * THE MATRIX IS DERIVED, NEVER TYPED. Every percentage is proven-stages / total-stages from the
 * twelve-stage sport gate, with the stage list itself as the receipt — there is no way to nudge a
 * cell without changing a committed assessment that a guard forces to carry evidence. The founder's
 * standing rule applies: no unsupported completion percentages, so a cell with zero applicable
 * stages renders N_A rather than 0% or 100%.
 *
 * THE ROADMAP IS COMMITTED DATA under this module so /launch renders horizons from one reviewed
 * structure instead of prose in a report. Items reference their release/blocker lineage; DONE items
 * are pruned rather than accumulated.
 */
import { GATE_STAGES } from "../sports/sport-gate.mjs";

export const MATRIX_VERSION = 1;

/**
 * Gate stages grouped into the operating departments the founder's matrix asks for. Every stage
 * appears in exactly one bucket (a guard enforces the partition), so bucket percentages always sum
 * from disjoint evidence.
 */
export const DEPARTMENT_BUCKETS = Object.freeze([
  { id: "data-ingestion", name: "Schedule & data ingestion", stages: ["schedule", "data", "markets"] },
  { id: "identity-assets", name: "Identity & assets", stages: ["identity"] },
  { id: "model-validation", name: "Model & validation", stages: ["model", "calibration", "qualification"] },
  { id: "product-generation", name: "Product generation & publication", stages: ["products", "publication"] },
  { id: "settlement", name: "Settlement & records", stages: ["settlement"] },
  { id: "operations", name: "Operations & ownership", stages: ["monitoring", "owner"] },
]);

/**
 * One sport column: per-bucket {proven, total, pct, stages[]}. `pct` is null when no stage in the
 * bucket applies — rendered as N_A, never as a number.
 */
export function sportColumn(assessment) {
  /** @type {Record<string, {proven:number,total:number,pct:number|null,stages:Array<{id:string,status:string,evidence:string|null,blocker:string|null}>}>} */
  const col = {};
  for (const bucket of DEPARTMENT_BUCKETS) {
    const stages = bucket.stages.map((id) => ({
      id,
      status: assessment.stages[id]?.status ?? "UNPROVEN",
      evidence: assessment.stages[id]?.evidence ?? null,
      blocker: assessment.stages[id]?.blocker ?? null,
    }));
    const proven = stages.filter((s) => s.status === "PROVEN").length;
    col[bucket.id] = {
      proven,
      total: stages.length,
      pct: stages.length === 0 ? null : Math.round((proven / stages.length) * 100),
      stages,
    };
  }
  return col;
}

/** The full matrix: sports × department buckets, straight from committed assessments. */
export function buildCompletionMatrix(sportAssessments) {
  const sports = Object.keys(sportAssessments);
  /** @type {Record<string, ReturnType<typeof sportColumn>>} */
  const matrix = {};
  for (const sport of sports) matrix[sport] = sportColumn(sportAssessments[sport]);
  return { version: MATRIX_VERSION, buckets: DEPARTMENT_BUCKETS, sports, matrix };
}

/**
 * The 30-day roadmap. Horizons per the operating program; every item carries owner, dependency and
 * an acceptance test, because an item nobody can check off is a wish, not a plan. Sources: the
 * Program 144 blocker register and the founder gates. Completed work is REMOVED, not struck through.
 */
export const ROADMAP_30D = Object.freeze([
  {
    horizon: "NOW",
    items: [
      { outcome: "NFL/NBA injuries capture CONTRACT per the accepted evaluation (docs/INJURY_SOURCE_EVALUATION.md): URL-derived athlete id validated against identity components, unknown statuses quarantine, absence maps to UNKNOWN never healthy, stale feed widens uncertainty", department: "data", sport: "nfl/nba", owner: "ENGINEERING", dependency: "evaluation ACCEPTED with two named conditions (P162-F)", effort: "M", acceptance: "contract module + real-sample fixtures + stale-behavior test green; matrix entries stay MISSING until a capture lands through it" },
    ],
  },
  {
    horizon: "DAYS_3_7",
    items: [
      { outcome: "Support channel live end-to-end", department: "operations", sport: "shared", owner: "FOUNDER", dependency: "GTP_SUPPORT_* values in Vercel", effort: "XS-founder", acceptance: "real message sent from the footer entry and received; gate PARTIAL→PASS" },
      { outcome: "Analytics activated for the beta cohort", department: "operations", sport: "shared", owner: "FOUNDER", dependency: "NEXT_PUBLIC_ANALYTICS_* + collector flag (privacy already signed §7)", effort: "S-founder", acceptance: "staging network-payload inspection then PRODUCTION_ENABLED on the activation ladder" },
    ],
  },
  {
    horizon: "WEEK_2",
    items: [
      { outcome: "Legal §3 business decisions answered; adviser consultation booked", department: "business-legal", sport: "shared", owner: "FOUNDER", dependency: null, effort: "S-founder", acceptance: "entity/jurisdiction/geography/age/audience recorded in LEGAL_CONTENT_MAP" },
      { outcome: "UFC results-shape design against registered sources: winner + red/blue identity + no-contest/draw/overturned semantics, card-and-bout separation, exact reconciliation — method/round stays UNSUPPORTED rather than fabricated", department: "settlement", sport: "ufc", owner: "ENGINEERING", dependency: "lineage classifier shipped P162-D; corpus proves the source class (P153)", effort: "M", acceptance: "result shapes contract-tested against real corpus rows; unsupported fields refuse; no live grading until a real card settles through it" },
    ],
  },
  {
    horizon: "WEEKS_3_4",
    items: [
      { outcome: "Private beta runs per the cohort contract", department: "user-validation", sport: "shared", owner: "FOUNDER", dependency: "support live + legal disclosed", effort: "M-founder", acceptance: "go/no-go checklist signed; 8 testers; stop conditions armed" },
    ],
  },
  {
    horizon: "LATER",
    items: [
      { outcome: "NBA model investment decision", department: "model-validation", sport: "nba", owner: "FOUNDER", dependency: "the MLB stopping rule applies to new models", effort: "decision", acceptance: "BLOCKED_EXTERNAL cleared or the sport formally parked" },
    ],
  },
]);
