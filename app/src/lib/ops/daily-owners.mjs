/**
 * THE EXPECTED-WORK GRAPH — what should have happened today, and whether it did.
 *
 * WHY THIS EXISTS
 * ---------------
 * Four sessions in a row opened on a scheduled run that never happened, and three of the four were
 * invisible until a human opened an artifact by hand:
 *
 *   2026-08-27  five workflows in one UTC band received no events; the site said "not published yet"
 *   2026-08-28  nightly-settle's two slots dropped; yesterday's cards sat unsettled
 *   2026-08-28  sport-schedules dropped; the NFL injury feed aged past its 24h bound
 *   2026-08-28  mlb-daily-production never fired; the board advertised 15 games beside empty markets
 *
 * Every existing detector asks the wrong question. `cron-slot-watchdog` asks GitHub which runs
 * exist — useful, but it cannot see a slot that produced no run object at all, and it is itself a
 * single scheduled job that sat inside the dead band on Aug 27. `publication-slo` asks whether one
 * artifact exists, which caught MLB's board and nothing else.
 *
 * THE QUESTION THAT ACTUALLY WORKS is: for each owner, is there a RECEIPT — a dated artifact that
 * could only exist if the work ran — and is it late? That is answerable with no reference to
 * workflows whatsoever, which is precisely why it survives a cron that never fired. This module
 * therefore never consults a run list, and a guard pins that.
 *
 * WHAT A RECEIPT IS
 * -----------------
 * An artifact the owner alone produces, carrying a timestamp. Not a heartbeat (which reports its own
 * health), not a workflow conclusion (which can be green with nothing written — this repository has
 * seen that too). The artifact is the work.
 *
 * Pure. Every input is passed in, so the guards can drive a dropped cron, a stale source and a
 * healthy day without a clock, a filesystem or a network.
 */

/** The closed vocabulary. Workflow state is deliberately absent — this layer never asks about runs. */
export const OWNER_STATES = [
  "HEALTHY",        // a receipt exists for the product date and is not stale
  "NOT_DUE",        // the deadline has not arrived
  "DUE",            // deadline passed, inside grace, still no receipt
  "STALE",          // a receipt exists but is older than the owner tolerates
  "INCIDENT",       // deadline + grace passed with no receipt — nothing ran and nothing was written
  "NO_WORK",        // nothing was expected today (no events, off-season)
  "REALITY_GATED",  // blocked on an external event that has not happened
  "UNKNOWN",        // the owner's own inputs could not be established; never green
];

/**
 * The owners. `receipt` names the artifact that proves the work happened; `dueFrom` says how the
 * deadline is derived.
 *
 *   "earliest-start"  — from the day's first event, minus `leadMinutes`. The honest deadline for
 *                       anything that must exist before play begins.
 *   "clock"           — a fixed UTC time, for work with no event to anchor to (settlement of a day
 *                       that is already over). Stated as a fallback, not pretended to be derived.
 */
export const DAILY_OWNERS = Object.freeze([
  {
    id: "mlb-board",
    label: "MLB board (projections)",
    workflow: "morning-projections",
    dependsOn: [],
    receipt: { path: (d) => `mlb/boards/${d}.json`, requires: "leans" },
    dueFrom: "earliest-start",
    leadMinutes: 90,
    graceMinutes: 30,
    sport: "mlb",
  },
  {
    id: "mlb-markets",
    label: "MLB team markets + player props",
    workflow: "mlb-daily-production",
    dependsOn: ["mlb-board"],
    receipt: { path: (d) => `mlb/team-markets/${d}.json` },
    dueFrom: "earliest-start",
    leadMinutes: 60,
    graceMinutes: 30,
    sport: "mlb",
  },
  {
    id: "mlb-simulations",
    label: "MLB game simulations",
    workflow: "mlb-daily-production",
    dependsOn: ["mlb-board"],
    receipt: { path: (d) => `mlb/game-simulations/${d}.json` },
    dueFrom: "earliest-start",
    leadMinutes: 60,
    graceMinutes: 30,
    sport: "mlb",
  },
  {
    id: "risk-ladder",
    label: "Suggested-card risk ladder",
    workflow: "daily-products",
    dependsOn: ["mlb-markets"],
    receipt: { path: (d) => `parlays/risk-ladder/${d}.json` },
    dueFrom: "earliest-start",
    leadMinutes: 45,
    graceMinutes: 45,
    sport: "mlb",
  },
  {
    id: "settlement",
    label: "Nightly settlement (previous day)",
    workflow: "nightly-settle",
    dependsOn: [],
    // Settles YESTERDAY, so its receipt is keyed to the previous product date.
    receipt: { path: (d, prev) => `parlays/lab-settled/${prev}.json` },
    // No event to anchor to: the day it settles is already over. 12:00 UTC is late enough that every
    // West-Coast game has finished and early enough that the record is right before the new day's
    // product is built on it.
    dueFrom: "clock",
    dueUtcHour: 12,
    graceMinutes: 120,
    sport: null,
  },
  {
    id: "schedules",
    /*
     * P224: labelled "all sports" while its receipt reads ONLY the NFL capture — so a dead MLB, EPL
     * or UFC schedule lane would have been reported as a healthy all-sports capture. The label now
     * says what is actually checked; the sibling per-sport owners below cover the rest.
     */
    label: "Schedule capture (NFL) + injury capture",
    workflow: "sport-schedules",
    dependsOn: [],
    receipt: { path: () => `nfl/schedule/latest.json`, maxAgeHours: 24 },
    dueFrom: "clock",
    dueUtcHour: 13,
    graceMinutes: 90,
    sport: null,
  },

  /* ── P224 · Release D — the sports the six original owners never covered ────────────────────── */

  {
    id: "nfl-index",
    label: "NFL canonical index",
    workflow: "nfl-event-window",
    dependsOn: [],
    /*
     * Re-derived on EVERY window including empty ones, so it is a true daily receipt even in a quiet
     * NFL week — which is exactly when the index used to freeze a day behind and nobody noticed.
     */
    receipt: { path: () => `nfl/index.json`, maxAgeHours: 26 },
    dueFrom: "clock",
    dueUtcHour: 15, // the 15:00Z window; the 14:30Z and 21:00Z runs are extra chances, not the deadline
    graceMinutes: 120,
    sport: null, // NFL having no games today is not a reason for the index to go unbuilt
  },
  {
    id: "nfl-products",
    label: "NFL product eligibility + run receipts",
    workflow: "nfl-event-window",
    dependsOn: ["nfl-index"],
    /*
     * A quiet window still produces these: they refuse with "no pre-kickoff NFL event was available
     * to evaluate" rather than going unwritten. That refusal IS the receipt that the lane ran.
     */
    receipt: { path: () => `nfl/product-receipts.json`, maxAgeHours: 26 },
    dueFrom: "clock",
    dueUtcHour: 15,
    graceMinutes: 150,
    sport: null,
  },
  {
    id: "ufc-card",
    label: "UFC card + model read",
    workflow: "ufc-fight-week",
    dependsOn: [],
    /*
     * ufc-fight-week fires Tue/Thu/Sat at 11:00Z and Sun/Mon/Wed/Fri at 13:00Z — between them every
     * weekday is covered, so this is a daily receipt with the later of the two hours as its deadline.
     */
    receipt: { path: () => `ufc/card-latest.json`, maxAgeHours: 30 },
    dueFrom: "clock",
    dueUtcHour: 13,
    graceMinutes: 180,
    sport: null,
  },
  {
    id: "ufc-lane",
    label: "UFC lane status",
    workflow: "ufc-fight-week",
    dependsOn: ["ufc-card"],
    receipt: { path: () => `admin/ufc-lane.json`, maxAgeHours: 30 },
    dueFrom: "clock",
    dueUtcHour: 13,
    graceMinutes: 180,
    sport: null,
  },
  {
    id: "epl-lane",
    label: "EPL lane status",
    workflow: "epl-matchweek",
    dependsOn: [],
    receipt: { path: () => `admin/epl-lane.json`, maxAgeHours: 30 },
    /*
     * THU–SUN ONLY. epl-matchweek runs at 21:00Z on Thursday, Friday, Saturday and Sunday, each
     * ahead of the following day's fixtures. Monday to Wednesday it does not run, and asking for a
     * receipt on those days would open three false incidents a week.
     */
    runsOnUtcDays: [0, 4, 5, 6],
    dueFrom: "clock",
    dueUtcHour: 21,
    graceMinutes: 150,
    sport: null,
  },
  {
    id: "offered-window",
    label: "Offered-window matrix (all sports)",
    workflow: "nightly-settle",
    dependsOn: [],
    /*
     * P225 · Release C. The matrix is the authority every other surface consumes, so its own absence
     * has to be detectable the same way any other owner's is — from a missing durable receipt, never
     * from a workflow run object. It is date-partitioned, so the receipt is simply today's file.
     */
    receipt: { path: (d) => `ops/offered-window.json`, maxAgeHours: 26 },
    dueFrom: "clock",
    dueUtcHour: 12,
    graceMinutes: 150,
    sport: null,
  },
]);

const MIN = 60_000;

/** ISO → epoch ms, or NaN. Never throws. */
const ms = (iso) => Date.parse(iso ?? "");

/** The previous calendar date, YYYY-MM-DD. */
export function previousDate(date) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * When an owner is due.
 *
 * Returns null when it cannot be established — an owner whose deadline is unknown is UNKNOWN, never
 * healthy. Guessing a deadline would let a dropped run pass as not-yet-due forever.
 */
export function dueAt(owner, { earliestStartMs, date }) {
  if (owner.dueFrom === "earliest-start") {
    if (!Number.isFinite(earliestStartMs)) return null;
    return earliestStartMs - (owner.leadMinutes ?? 0) * MIN;
  }
  if (owner.dueFrom === "clock") {
    const t = Date.parse(`${date}T${String(owner.dueUtcHour).padStart(2, "0")}:00:00Z`);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/**
 * Evaluate one owner against its receipt.
 *
 * @param {object}  owner
 * @param {object}  ctx
 * @param {number}  ctx.nowMs
 * @param {string}  ctx.date            product date, YYYY-MM-DD
 * @param {number}  ctx.earliestStartMs first event of the day, or NaN when there are none
 * @param {number|null} ctx.scheduledCount events scheduled today; 0 means nothing was expected,
 *                                       null means we could not establish it
 * @param {object|null} ctx.receipt     `{ generatedAt, hasContent }` or null when absent
 */
export function evaluateOwner(owner, ctx) {
  const { nowMs, date, earliestStartMs, scheduledCount, receipt } = ctx;

  /*
   * NOT EVERY OWNER RUNS EVERY DAY, and pretending otherwise manufactures incidents.
   *
   * `epl-matchweek` fires Thursday through Sunday only. Given a daily expectation it would open an
   * incident every Monday, Tuesday and Wednesday — a detector that cries wolf three days in seven
   * teaches its reader to ignore it, which is the same outcome as having no detector at all.
   *
   * A cadence is a property of the owner, so it is declared on the owner. An owner without
   * `runsOnUtcDays` runs daily, which is what the original six do.
   */
  if (Array.isArray(owner.runsOnUtcDays)) {
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (!owner.runsOnUtcDays.includes(dow)) {
      return {
        id: owner.id,
        state: "NOT_DUE",
        reason: `${owner.workflow} does not run on this weekday (runs UTC days ${owner.runsOnUtcDays.join(", ")})`,
        dueAtIso: null,
      };
    }
  }

  // Not knowing whether work was expected is not the same as knowing none was. An owner whose own
  // inputs are unreadable is UNKNOWN, and UNKNOWN is never green.
  if (scheduledCount === null || scheduledCount === undefined) {
    return { id: owner.id, state: "UNKNOWN", reason: "the day's schedule could not be established for this owner", dueAtIso: null };
  }
  if (scheduledCount === 0 && owner.sport) {
    return { id: owner.id, state: "NO_WORK", reason: `no ${owner.sport.toUpperCase()} events scheduled for ${date}`, dueAtIso: null };
  }

  const due = dueAt(owner, { earliestStartMs, date });
  const dueAtIso = due === null ? null : new Date(due).toISOString();

  if (receipt && receipt.hasContent !== false) {
    const age = nowMs - ms(receipt.generatedAt);
    const maxAge = owner.receipt.maxAgeHours;
    if (maxAge != null && Number.isFinite(age) && age > maxAge * 3600_000) {
      return {
        id: owner.id,
        state: "STALE",
        reason: `receipt is ${(age / 3600_000).toFixed(1)}h old against a ${maxAge}h bound`,
        dueAtIso,
        receiptAt: receipt.generatedAt,
      };
    }
    return { id: owner.id, state: "HEALTHY", reason: "receipt present", dueAtIso, receiptAt: receipt.generatedAt };
  }

  // No receipt from here down.
  if (due === null) {
    return { id: owner.id, state: "UNKNOWN", reason: "no receipt, and no deadline could be derived — absence cannot be judged", dueAtIso: null };
  }
  if (nowMs < due) {
    return { id: owner.id, state: "NOT_DUE", reason: `not due until ${dueAtIso}`, dueAtIso };
  }
  const graceEnd = due + (owner.graceMinutes ?? 0) * MIN;
  if (nowMs < graceEnd) {
    return { id: owner.id, state: "DUE", reason: `past ${dueAtIso}, inside grace`, dueAtIso };
  }
  /*
   * THE STATE THAT MATTERS. Nothing produced the receipt and the deadline plus grace has passed —
   * regardless of whether any workflow run exists, succeeded, failed or was ever created. That last
   * clause is the whole point: on 2026-08-27 five owners had no run object at all, so every
   * run-based detector saw a quiet, healthy repository.
   */
  return {
    id: owner.id,
    state: "INCIDENT",
    reason: `no receipt for ${date}; due ${dueAtIso} plus ${owner.graceMinutes ?? 0}m grace has passed`,
    dueAtIso,
  };
}

/** Severity order for the roll-up. Worst-of, never an average. */
export const SEVERITY = ["HEALTHY", "NO_WORK", "NOT_DUE", "REALITY_GATED", "DUE", "STALE", "INCIDENT", "UNKNOWN"];

export function worstOf(states) {
  let worst = "HEALTHY";
  for (const s of states) if (SEVERITY.indexOf(s) > SEVERITY.indexOf(worst)) worst = s;
  return worst;
}

/**
 * Evaluate the whole graph.
 *
 * An owner whose dependency is already an INCIDENT is reported as BLOCKED_UPSTREAM in its detail but
 * keeps its own state: the risk ladder genuinely has no receipt whether or not the markets ran, and
 * flattening it to "someone else's fault" is how one root cause hides four real gaps.
 */
export function evaluateAll(ctx) {
  const byId = new Map();
  const rows = DAILY_OWNERS.map((o) => {
    const r = evaluateOwner(o, {
      ...ctx,
      receipt: ctx.receipts?.[o.id] ?? null,
      scheduledCount: o.sport ? ctx.scheduledBySport?.[o.sport] ?? null : ctx.scheduledCountOverall ?? 1,
      earliestStartMs: o.sport ? ctx.earliestStartBySport?.[o.sport] ?? NaN : ctx.earliestStartMs ?? NaN,
    });
    byId.set(o.id, r);
    return { ...r, label: o.label, workflow: o.workflow, dependsOn: o.dependsOn };
  });
  for (const row of rows) {
    const broken = row.dependsOn.filter((d) => byId.get(d)?.state === "INCIDENT" || byId.get(d)?.state === "UNKNOWN");
    if (broken.length) row.blockedUpstream = broken;
  }
  return { rows, state: worstOf(rows.map((r) => r.state)) };
}
