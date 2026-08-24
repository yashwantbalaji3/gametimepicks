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
/*
 * P196 · Release J reset. The previous roadmap still listed "EPL opening day (Aug 21)" as a
 * DAYS_3_7 item after that day had come, gone, and settled eight matches — shipped work removed,
 * horizons re-anchored to the current truth. Engineering execution order is NOT restated here:
 * the closure-packet execution queue (data/internal/launch/closure-packets-v1.json, rendered on
 * this page) is the one dependency-ordered authority, and the NOW item points at it rather than
 * hand-copying entries that would drift by the weekend.
 */
export const ROADMAP_30D = Object.freeze([
  {
    horizon: "NOW",
    items: [
      { outcome: "Work the closure-packet execution queue in dependency order (top of queue: UFC schedule/identity/data stage receipts) — the queue is derived, so shipping a receipt removes its item without anyone editing a list", department: "operations", sport: "multi", owner: "ENGINEERING", dependency: "P196 Release A control plane (live)", effort: "continuous", acceptance: "queue items close via committed receipts; closure packets rebuild with --check green; no hand-edited counts anywhere" },
      { outcome: "Founder Reply Box: answers via docs/FOUNDER_RESPONSE_FORM.md — every shared blocker is engineering-ready; the orchestrator + per-blocker acceptance verifiers consume answers as they arrive", department: "operations", sport: "shared", owner: "FOUNDER", dependency: "P164 packets + P165 form/orchestrator shipped", effort: "one sitting", acceptance: "a valid response file passes validateFounderResponse; each blocker transitions mechanically; CLOSED only on real acceptance receipts" },
    ],
  },
  {
    horizon: "DAYS_3_7",
    items: [
      { outcome: "UFC Aug-29 card operations end to end: pre-card snapshot already captured (6 bouts priced); odds refresh, ladder, freeze, post-card capture+grade (now same-job), cumulative record update — the sample that decides whether the fight model's preregistered pass meant anything", department: "products", sport: "ufc", owner: "ENGINEERING", dependency: "reality (the card is fought Aug 29); pipeline shipped through P196 Release C", effort: "operational", acceptance: "every priced bout grades within a day of the card; the cumulative block includes them; no bout re-reads as pending" },
      { outcome: "EPL matchweek operations: Fulham v Chelsea (Mon) becomes paired match four; pairing accrues automatically per settled priced fixture toward the 30-pair stopping-rule threshold", department: "settlement", sport: "epl", owner: "ENGINEERING", dependency: "reality (fixtures play); chain adjudicated + C7 stale-count guard live (P196 Release D)", effort: "operational", acceptance: "each settled priced fixture appears as a paired row; learning artifact and ledger recount agree (C7 stays green)" },
    ],
  },
  {
    horizon: "WEEK_2",
    items: [
      { outcome: "NFL regular-season boundary verification: on the first September settle, the experimental record's headline flips to the regular-season cohort at its honest small n, preseason keeps its own block, and the preseason model's abstention policy holds on live regular-season slates", department: "model-validation", sport: "nfl", owner: "ENGINEERING", dependency: "cohort separation shipped ahead of the boundary (P196 Release E); reality supplies the games", effort: "S", acceptance: "summary.seasonTypeScope === 'regular-season' with cohorts.preseason unchanged; no blended aggregate anywhere; durability guards green" },
    ],
  },
  {
    horizon: "WEEKS_3_4",
    items: [
      { outcome: "Public-IA responsive sweep (Release H): every public route at 390/768/1280/1440 with the browser matrix, glossary ownership per beginner-facing term, one navigation metadata owner verified against the built export", department: "product-generation", sport: "shared", owner: "ENGINEERING", dependency: "routes stable after the P196 release train", effort: "M", acceptance: "a11y structural 0 findings + browser matrix green across three engines; no page-level horizontal scroll anywhere" },
    ],
  },
  {
    horizon: "LATER",
    items: [
      { outcome: "NBA model investment decision", department: "model-validation", sport: "nba", owner: "FOUNDER", dependency: "the MLB stopping rule applies to new models; schedule/identity/cadence foundations live (P196 Release F)", effort: "decision", acceptance: "BLOCKED_EXTERNAL cleared with a preregistered bar, or the sport formally parked with the registry saying so" },
    ],
  },
]);
