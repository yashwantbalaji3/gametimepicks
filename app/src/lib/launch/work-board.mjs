/**
 * /launch work board — Azure-style tickets DERIVED from receipts (Program 153 · Release E).
 *
 * The board is a PURE FUNCTION of the committed truth (gate assessments + roadmap): no ticket
 * store, no client mutation, no clock. A ticket "closes" the only honest way — the receipt lands
 * in sport-assessments/roadmap, the generator re-runs, and the card disappears or moves. A UI
 * checkbox that could rewrite truth is exactly the failure this design refuses.
 *
 * States: NEW (planned, later horizons) · READY (near-term horizons) · IN_PROGRESS (evidence
 * exists — a PARTIAL stage IS work in flight) · BLOCKED (named blocker) · founder items are a
 * separate queue, never mixed into engineering columns.
 */
import { SPORT_ASSESSMENTS } from "../sports/sport-assessments.mjs";
import { GATE_STAGES } from "../sports/sport-gate.mjs";
import { ROADMAP_30D } from "./completion-matrix.mjs";

export const BOARD_VERSION = 1;
export const BOARD_STATES = Object.freeze(["NEW", "READY", "IN_PROGRESS", "BLOCKED"]);

const STAGE_LABEL = Object.fromEntries(GATE_STAGES.map((s) => [s.id, s.label ?? s.id]));
const programOf = (text) => text?.match(/Program\s+(\d+)/)?.[1] ?? null;

/** Build the full board from committed truth. `assessments`/`roadmap` injectable for tests. */
export function buildWorkBoard({ assessments = SPORT_ASSESSMENTS, roadmap = ROADMAP_30D } = {}) {
  const tickets = [];
  const push = (t) => {
    if (tickets.some((x) => x.id === t.id)) throw new Error(`duplicate ticket id ${t.id} — one underlying issue, one card`);
    if (!BOARD_STATES.includes(t.state)) throw new Error(`invalid state ${t.state}`);
    if (!t.owner || !t.nextAction) throw new Error(`${t.id}: a ticket without owner+nextAction is decoration`);
    tickets.push(t);
  };

  // 1 · Every non-PROVEN evidence-bearing stage is work in flight or blocked — never silent.
  for (const [sport, a] of Object.entries(assessments)) {
    if (sport === "mlb") continue; // the live pipeline's truth lives in the ledger, not on this board
    for (const [stage, s] of Object.entries(a.stages)) {
      if (s.status === "PARTIAL") {
        const cadence = /receipt 1\/2/i.test(s.evidence ?? "");
        push({
          id: `stage-${sport}-${stage}`,
          title: `${sport.toUpperCase()} · prove ${STAGE_LABEL[stage] ?? stage}`,
          sport, department: stage, priority: cadence ? "P0" : "P1",
          owner: "ENGINEERING", state: "IN_PROGRESS",
          sinceProgram: programOf(s.evidence),
          evidence: s.evidence,
          blocker: null,
          nextAction: cadence
            ? "verify the second scheduled sport-schedules run (time-gated), then move the stage from its receipt"
            : `land the receipt that satisfies the ${stage} stage contract`,
          acceptance: GATE_STAGES.find((g) => g.id === stage)?.proof ?? "stage contract satisfied with a linked receipt",
        });
      }
      if (s.status === "BLOCKED_EXTERNAL") {
        push({
          id: `stage-${sport}-${stage}`,
          title: `${sport.toUpperCase()} · ${STAGE_LABEL[stage] ?? stage} blocked`,
          sport, department: stage, priority: "P2",
          owner: /founder/i.test(s.blocker ?? "") ? "FOUNDER" : "ENGINEERING",
          state: "BLOCKED",
          sinceProgram: programOf(s.blocker),
          evidence: null,
          blocker: s.blocker,
          nextAction: "resolve the named blocker; nothing moves without it",
          acceptance: "blocker lifted with a decision or source receipt",
        });
      }
    }
  }

  // 2 · Roadmap items become planned cards by horizon; the roadmap's own pruning contract keeps
  //     shipped work off this board automatically.
  const HORIZON_STATE = { NOW: ["READY", "P0"], DAYS_3_7: ["READY", "P1"], WEEK_2: ["NEW", "P1"], WEEKS_3_4: ["NEW", "P2"], LATER: ["NEW", "P2"] };
  for (const h of roadmap) {
    for (const [i, item] of h.items.entries()) {
      const [state, priority] = HORIZON_STATE[h.horizon];
      push({
        id: `roadmap-${h.horizon}-${i}`,
        title: item.outcome.length > 90 ? item.outcome.slice(0, 87) + "…" : item.outcome,
        sport: item.sport ?? "platform", department: item.department ?? "platform",
        priority, owner: item.owner, state: item.owner === "FOUNDER" ? "BLOCKED" : state,
        sinceProgram: null,
        evidence: item.dependency ? `depends on: ${item.dependency}` : null,
        blocker: item.owner === "FOUNDER" ? "founder decision/action required" : null,
        nextAction: item.owner === "FOUNDER" ? "founder queue — engineering does not stall on this" : `execute toward: ${item.acceptance}`,
        acceptance: item.acceptance,
        horizon: h.horizon,
      });
    }
  }

  const engineering = tickets.filter((t) => t.owner === "ENGINEERING");
  const founder = tickets.filter((t) => t.owner === "FOUNDER");
  const byState = Object.fromEntries(BOARD_STATES.map((s) => [s, engineering.filter((t) => t.state === s)]));
  const prio = { P0: 0, P1: 1, P2: 2 };
  for (const list of Object.values(byState)) list.sort((a, b) => prio[a.priority] - prio[b.priority] || a.id.localeCompare(b.id));

  return {
    version: BOARD_VERSION,
    columns: byState,
    founderQueue: founder.sort((a, b) => prio[a.priority] - prio[b.priority] || a.id.localeCompare(b.id)),
    sprints: {
      today: engineering.filter((t) => t.priority === "P0"),
      current: engineering.filter((t) => t.horizon === "NOW" || t.horizon === "DAYS_3_7" || t.state === "IN_PROGRESS"),
      next: engineering.filter((t) => t.horizon === "WEEK_2"),
      later: engineering.filter((t) => t.horizon === "WEEKS_3_4" || t.horizon === "LATER"),
    },
    counts: { total: tickets.length, engineering: engineering.length, founder: founder.length, blocked: tickets.filter((t) => t.state === "BLOCKED").length },
  };
}
