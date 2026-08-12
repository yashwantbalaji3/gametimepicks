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
import { shadowGaps } from "../sports/research/shadow-contract.mjs";
import { REALITY_GATED_WATCHES } from "./watches.mjs";

export const BOARD_VERSION = 1;
export const BOARD_STATES = Object.freeze(["NEW", "READY", "IN_PROGRESS", "BLOCKED", "REALITY_GATED"]);

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
        const cadence = /receipt 1\/2|CADENCE 1\/2/i.test(s.evidence ?? "");
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

  // 2 · Shadow-readiness gaps (Program 156 · Release B): one stable ticket per underlying gap.
  //     The odds gap is ONE founder blocker spanning every sport — merged to a single card, never
  //     four duplicates. Everything else is per-sport engineering acquisition work. Tickets close
  //     the only honest way: the LIVE_INPUT_MATRIX entry flips with a receipt and the generator
  //     re-runs.
  const gaps = shadowGaps();
  const oddsSports = gaps.filter((g) => g.input === "odds").map((g) => g.sport);
  if (oddsSports.length) {
    push({
      id: "shadow-all-odds",
      title: `Shadow inputs · odds capture (${oddsSports.join("/")}) — founder CI-key exercise`,
      sport: oddsSports.join("/"), department: "shadow-readiness", priority: "P1",
      owner: "FOUNDER", state: "BLOCKED",
      sinceProgram: "155", evidence: null,
      blocker: "odds is BLOCKED_EXTERNAL in every sport's live-input matrix — ONE founder action, owned by blocker-odds on the Founder Action Sheet (this card is a pointer, not a second authority)",
      nextAction: "answer blocker-odds via docs/FOUNDER_RESPONSE_FORM.md — engineering does not stall on this",
      acceptance: "a guarded odds capture receipt exists and the matrix entries flip to AVAILABLE",
    });
  }
  for (const g of gaps.filter((x) => x.input !== "odds")) {
    push({
      id: `shadow-${g.sport}-${g.input}`,
      title: `${g.sport.toUpperCase()} · shadow input: ${g.input} (${g.state})`,
      sport: g.sport, department: "shadow-readiness",
      priority: g.state === "UNSUPPORTED" ? "P2" : "P1",
      owner: "ENGINEERING",
      state: g.state === "UNSUPPORTED" ? "NEW" : "READY",
      sinceProgram: "155", evidence: null,
      blocker: g.state === "UNSUPPORTED" ? g.note : null,
      nextAction: g.note ?? "acquire an authorized timestamped source or record the abstention policy",
      acceptance: "LIVE_INPUT_MATRIX entry flips to AVAILABLE with a source receipt (or NOT_REQUIRED with a stated policy)",
    });
  }

  // 2b · Reality-gated watches (Program 162 · Release C): work whose next receipt only reality
  //      can supply. Their own state so a time-gated observation never reads as a stalled card,
  //      and never enters today's sprint — the countdown view lives beside the board.
  for (const w of REALITY_GATED_WATCHES) {
    push({
      id: w.id,
      title: w.title,
      sport: w.sport, department: "observation", priority: "P2",
      owner: "ENGINEERING", state: "REALITY_GATED",
      sinceProgram: "162", evidence: `productive before then: ${w.productiveBefore}`,
      blocker: null,
      nextAction: `observe at ${w.observeAtUtc}: ${w.evidenceToInspect}`,
      acceptance: "the named real-world evidence lands in a committed artifact and the stage records it",
    });
  }

  // 3 · Roadmap items become planned cards by horizon; the roadmap's own pruning contract keeps
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
