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
      { outcome: "Founder Reply Box: seven answers via docs/FOUNDER_RESPONSE_FORM.md — every shared blocker is engineering-ready; the read-only orchestrator + per-blocker acceptance verifiers consume answers as they arrive (the shared-blocker registry on this page is the ONE authority; former per-item founder roadmap entries are deduplicated into it)", department: "operations", sport: "shared", owner: "FOUNDER", dependency: "P164 packets + P165 form/orchestrator shipped; injuries capture landed P162-H with run receipts", effort: "one sitting", acceptance: "a valid response file passes validateFounderResponse; each blocker transitions mechanically; CLOSED only on real acceptance receipts" },
    ],
  },
  {
    horizon: "DAYS_3_7",
    items: [
      { outcome: "EPL opening-day operational execution (Aug 21): run the corrections-runbook first-FT checklist against the deployed path, baseline the results monitor on the first real captures, and record the settlement-stage receipt", department: "settlement", sport: "epl", owner: "ENGINEERING", dependency: "reality (league play starts); runbook + monitor shipped P162-E/P163-J", effort: "S", acceptance: "PRESEASON→RESULTS flips via the scheduled capture with canonical join, zero unexplained quarantines, and the checklist's five steps recorded" },
    ],
  },
  {
    horizon: "WEEK_2",
    items: [
      { outcome: "Post-answer acceptance wave: as founder responses land, run each blocker's acceptance verifier (support build-check, analytics consent/production smoke, odds canary receipt validation, admin unauthenticated-deny verifier) and transition registry states via reviewed commits — never from choices alone", department: "operations", sport: "shared", owner: "ENGINEERING", dependency: "the Founder Reply Box (NOW item)", effort: "S per blocker", acceptance: "each transitioned blocker cites its real acceptance receipt; CLOSED states carry receipts, not declarations" },
    ],
  },
  {
    horizon: "WEEKS_3_4",
    items: [
      { outcome: "Beta go/no-go execution IF prerequisites close: synthetic access + revocation tests, roster count/hash receipt (no identities), onboarding gated on the approved legal version — invitations generate only when the prerequisite gate is green", department: "user-validation", sport: "shared", owner: "ENGINEERING", dependency: "support + legal + analytics acceptance receipts (WEEK_2 wave)", effort: "M", acceptance: "invitationPrerequisites().ready === true from REAL states; go/no-go output produced; nothing sent without founder approval" },
    ],
  },
  {
    horizon: "LATER",
    items: [
      { outcome: "NBA model investment decision", department: "model-validation", sport: "nba", owner: "FOUNDER", dependency: "the MLB stopping rule applies to new models", effort: "decision", acceptance: "BLOCKED_EXTERNAL cleared or the sport formally parked" },
    ],
  },
]);
