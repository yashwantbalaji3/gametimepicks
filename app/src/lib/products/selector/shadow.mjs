/**
 * Forward-shadow bookkeeping for the preregistered selectors (v1.7 Phase H) — pure functions shared by
 * the daily builder, the nightly grader and the historical replay, so one grading rule and one ladder
 * rule exist.
 *
 *   gradeCardFromLinescores  — official linescore rows → won / lost / push / pending (pending is never a loss)
 *   advancePosition          — the ladder rule: won carries the real payout (skipping cleared rungs),
 *                              lost restarts at seed, push holds; clearing the final goal completes
 *   policyMetrics            — the preregistered metrics over a policy's lane-days
 *   adoptionGate             — the preregistered forward gate, evaluated against the control
 */
import { LADDERS, POLICIES } from "./policies.mjs";

export const SHADOW_POLICIES = Object.freeze({ "bank-builder": { control: "BB-LEGACY", shadow: ["BB-C1", "BB-C2b"] }, moonshot: { control: "MS-LEGACY", shadow: ["MS-C1", "MS-C4"] } });
export const ADOPTION_MIN_DECIDED = 20;

export function gradeLegFromLinescores(leg, rows) {
  const g = (rows ?? []).find((x) => String(x.gamePk) === String(leg.eventId));
  if (!g || !g.isFinal || !Number.isFinite(g.homeRuns) || !Number.isFinite(g.awayRuns)) return "pending";
  const home = g.homeRuns, away = g.awayRuns;
  if (leg.marketKey === "mlb_moneyline") return (leg.side === "home" ? home > away : away > home) ? "won" : "lost";
  if (leg.marketKey === "mlb_run_line") { const m = leg.side === "home" ? home - away + leg.line : away - home + leg.line; return m > 0 ? "won" : m < 0 ? "lost" : "push"; }
  if (leg.marketKey === "mlb_total_runs") { const t = home + away; if (t === leg.line) return "push"; return (leg.side === "over" ? t > leg.line : t < leg.line) ? "won" : "lost"; }
  return "pending"; // an ungradeable market stays pending — never guessed
}

export function gradeCardFromLinescores(card, rows) {
  const legs = card.legs.map((l) => gradeLegFromLinescores(l, rows));
  if (legs.includes("lost")) return { status: "lost", legs };
  if (legs.includes("pending")) return { status: "pending", legs };
  if (legs.every((x) => x === "push")) return { status: "push", legs };
  return { status: "won", legs };
}

/**
 * The decimal a card actually settles at: a pushed leg pays 1.0 (its price is removed), a won leg pays its
 * own price. Before the v1.7 shadow-integrity audit (docs/V17_SHADOW_INTEGRITY_AUDIT.md, I5) a card that
 * won with one pushed leg carried the FULL published decimal, overstating the payout the ladder rolled on.
 * Legs without a per-leg grade are treated as won (the published decimal), so callers that only know the
 * card status keep the old behaviour.
 */
export function settledDecimal(legs, legGrades) {
  if (!Array.isArray(legs) || !Array.isArray(legGrades) || legs.length !== legGrades.length) return null;
  let d = 1;
  for (let i = 0; i < legs.length; i++) {
    if (legGrades[i] === "push") continue;
    const a = legs[i]?.american; if (!Number.isFinite(a)) return null;
    d *= a >= 100 ? 1 + a / 100 : 1 + 100 / -a;
  }
  return +d.toFixed(4);
}

export function advancePosition(policyName, pos, status, card) {
  const policy = POLICIES[policyName]; const ladder = LADDERS[policy.ladder];
  if (status === "won") {
    const payout = +(card.stake * card.decimal).toFixed(2);
    if (payout >= ladder[ladder.length - 1][1]) return { step: 1, stake: policy.seed, completed: true };
    let step = pos.step; while (step < ladder.length && payout >= ladder[step][0]) step++;
    return { step, stake: payout, completed: false };
  }
  if (status === "lost") return { step: 1, stake: policy.seed, completed: false };
  return { step: pos.step, stake: pos.stake, completed: false };
}

/** @param rows lane-day rows: { status, step, jointP, american, completed, reason } */
export function policyMetrics(rows) {
  const placed = rows.filter((r) => r.status !== "NO_QUALIFYING_PLAY"), decided = placed.filter((r) => ["won", "lost", "push"].includes(r.status));
  const won = decided.filter((r) => r.status === "won").length, lost = decided.filter((r) => r.status === "lost").length, push = decided.length - won - lost;
  const byStep = {}; for (const r of decided) { byStep[r.step] ??= { won: 0, lost: 0, push: 0 }; byStep[r.step][r.status]++; }
  const noPlay = {}; for (const r of rows) if (r.status === "NO_QUALIFYING_PLAY") noPlay[r.reason] = (noPlay[r.reason] ?? 0) + 1;
  const jp = decided.filter((r) => typeof r.jointP === "number");
  const n = won + lost, survival = n ? won / n : null;
  return {
    laneDays: rows.length, placed: placed.length, decided: decided.length, pending: placed.length - decided.length, won, lost, push,
    survivalPerStep: survival == null ? null : +survival.toFixed(3), survivalSe: n ? +Math.sqrt(Math.max(survival * (1 - survival), 1e-9) / n).toFixed(3) : null,
    byStep, completions: placed.filter((r) => r.completed).length, furthestStep: Math.max(0, ...placed.map((r) => r.step)),
    noPlayLaneDays: rows.length - placed.length, noPlayByReason: noPlay, publicationRate: rows.length ? +(placed.length / rows.length).toFixed(3) : null,
    expectedWinsUnderPublishedP: +jp.reduce((a, r) => a + r.jointP, 0).toFixed(2), meanJointP: jp.length ? +(jp.reduce((a, r) => a + r.jointP, 0) / jp.length).toFixed(3) : null,
  };
}

/**
 * The preregistered adoption gate (docs/V17_SELECTOR_PREREGISTRATION.md §6): ≥ 20 decided lane-days for the
 * shadow policy, survival ≥ control's, publication on ≥ 50% of the control's placed days, no guard failures.
 * Returns a decision with every input it used; it never adopts on its own.
 */
export function adoptionGate({ shadow, control, guardFailures = 0 }) {
  const reasons = [];
  if ((shadow.decided ?? 0) < ADOPTION_MIN_DECIDED) reasons.push(`decided ${shadow.decided ?? 0} < ${ADOPTION_MIN_DECIDED}`);
  if (shadow.survivalPerStep == null || control.survivalPerStep == null) reasons.push("survival not measurable yet");
  else if (shadow.survivalPerStep < control.survivalPerStep) reasons.push(`survival ${shadow.survivalPerStep} < control ${control.survivalPerStep}`);
  if ((control.placed ?? 0) > 0 && (shadow.placed ?? 0) < 0.5 * control.placed) reasons.push(`published ${shadow.placed} < 50% of control's ${control.placed}`);
  if (guardFailures > 0) reasons.push(`${guardFailures} guard failure(s)`);
  return { state: reasons.length ? "NOT_YET" : "ELIGIBLE_FOR_ADOPTION_RECEIPT", reasons, measured: { shadowDecided: shadow.decided ?? 0, shadowSurvival: shadow.survivalPerStep, controlSurvival: control.survivalPerStep, shadowPlaced: shadow.placed ?? 0, controlPlaced: control.placed ?? 0 }, note: "ELIGIBLE means the founder may write the adoption receipt; nothing changes on its own." };
}
