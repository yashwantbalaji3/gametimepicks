/**
 * Today board — the operator's daily loop over the SAME derived truth (Program 167 · Release B).
 *
 * Five phases — OBSERVE → VERIFY → BUILD → RELEASE → CLOSE — grouping the work board's cards and
 * the reality-gated watches into the order an operator actually works a day. This is PRESENTATION
 * over `buildWorkBoard()` + `withCountdown()`: no new ticket store, no new ids, no clock of its
 * own. Every card here IS a board card (same id); the mapping is STRUCTURAL (state-driven), never
 * keyword-sniffing:
 *
 *   OBSERVE  ← state REALITY_GATED   (time-gated inspections; due/overdue first)
 *   VERIFY   ← state IN_PROGRESS     (evidence exists — verify the receipt, advance the stage)
 *   BUILD    ← state READY | NEW     (unblocked engineering, near horizons first)
 *   RELEASE  ← no card class exists for "staged but unshipped" by design — a static export cannot
 *              see a dirty tree. The phase renders the release DISCIPLINE and points at Release
 *              History for shipped receipts; it never invents cards.
 *   CLOSE    ← state BLOCKED         (moves only when the named blocker/receipt lands) + the
 *              founder queue count (pointer — the queue itself stays its own section)
 *
 * `topActions(n)` is the "what do I do first" list: overdue watches, then due watches, then P0
 * cards, then P1 in-flight — each with its exact next action. Deterministic given (board, clock).
 */
import { buildWorkBoard } from "./work-board.mjs";
import { withCountdown } from "./watches.mjs";

export const TODAY_BOARD_VERSION = 1;

export const PHASES = Object.freeze([
  { id: "OBSERVE", title: "Observe", question: "Which reality-gated receipts opened their window?" },
  { id: "VERIFY", title: "Verify", question: "Which in-flight receipts must be verified and advanced?" },
  { id: "BUILD", title: "Build", question: "What unblocked engineering ships next?" },
  { id: "RELEASE", title: "Release", question: "Is every finished slice through the full gate?" },
  { id: "CLOSE", title: "Close", question: "What closes only when a named receipt or decision lands?" },
]);

const HORIZON_RANK = { NOW: 0, DAYS_3_7: 1, WEEK_2: 2, WEEKS_3_4: 3, LATER: 4 };
const PRIO_RANK = { P0: 0, P1: 1, P2: 2 };

/**
 * Build the five-phase view. Pure: board and clock are parameters (defaults = committed truth).
 * @param {{ board?: ReturnType<typeof buildWorkBoard>, nowIso?: string }} [opts]
 */
export function buildTodayBoard({ board = buildWorkBoard(), nowIso } = {}) {
  if (!nowIso) throw new Error("buildTodayBoard: nowIso required — the clock is always a parameter");
  const watches = withCountdown(nowIso);
  const byWatchId = new Map(watches.map((w) => [w.id, w]));

  const engineering = Object.values(board.columns).flat();
  const observe = (board.columns.REALITY_GATED ?? [])
    .map((t) => ({ ...t, watch: byWatchId.get(t.id) ?? null }))
    .sort((a, b) => {
      const wa = a.watch, wb = b.watch;
      if (!!wb?.overdue !== !!wa?.overdue) return wb?.overdue ? 1 : -1;
      if (!!wb?.due !== !!wa?.due) return wb?.due ? 1 : -1;
      return (wa?.hoursUntil ?? Infinity) - (wb?.hoursUntil ?? Infinity);
    });
  const verify = [...(board.columns.IN_PROGRESS ?? [])];
  const build = [...(board.columns.READY ?? []), ...(board.columns.NEW ?? [])].sort(
    (a, b) =>
      (HORIZON_RANK[a.horizon] ?? 9) - (HORIZON_RANK[b.horizon] ?? 9) ||
      PRIO_RANK[a.priority] - PRIO_RANK[b.priority] ||
      a.id.localeCompare(b.id),
  );
  const close = [...(board.columns.BLOCKED ?? [])];

  // Exactly-once invariant: every engineering card lands in exactly one phase.
  const placed = observe.length + verify.length + build.length + close.length;
  if (placed !== engineering.length) {
    throw new Error(`today-board dropped or duplicated cards: placed ${placed} of ${engineering.length}`);
  }

  return {
    version: TODAY_BOARD_VERSION,
    nowIso,
    phases: [
      { ...PHASES[0], cards: observe },
      { ...PHASES[1], cards: verify },
      { ...PHASES[2], cards: build },
      {
        ...PHASES[3],
        cards: [],
        standing:
          "Ship each finished slice through the full gate (focused tests → typecheck → build → diff review → secret scan → push → deployed verification). Shipped receipts live in Release History — this artifact cannot see an uncommitted tree, so it never claims one.",
      },
      { ...PHASES[4], cards: close, founderQueueCount: board.founderQueue.length },
    ],
  };
}

/**
 * The ordered "do this first" list with exact next actions. Deterministic given (board, clock).
 * @param {{ board?: ReturnType<typeof buildWorkBoard>, nowIso?: string, limit?: number }} [opts]
 */
export function topActions({ board = buildWorkBoard(), nowIso, limit = 3 } = {}) {
  const t = buildTodayBoard({ board, nowIso });
  const [observe, verify, buildPhase, , close] = t.phases;
  const dueWatches = observe.cards.filter((c) => c.watch?.due);
  const ranked = [
    ...dueWatches.filter((c) => c.watch?.overdue),
    ...dueWatches.filter((c) => !c.watch?.overdue),
    ...[...verify.cards, ...buildPhase.cards, ...close.cards].sort(
      (a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.id.localeCompare(b.id),
    ),
  ];
  return ranked.slice(0, limit).map((c) => ({
    id: c.id,
    phase: c.watch ? "OBSERVE" : c.state === "IN_PROGRESS" ? "VERIFY" : c.state === "BLOCKED" ? "CLOSE" : "BUILD",
    priority: c.priority,
    title: c.title,
    nextAction: c.nextAction,
    acceptance: c.acceptance,
  }));
}
