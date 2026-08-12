/**
 * Per-event shadow input-completeness classifier (Program 163 · Release F).
 *
 * The purpose is REFUSAL: proving the system declines to operate on incomplete current inputs.
 * The LIVE_INPUT_MATRIX carries each sport's per-input truth with receipts; this classifier binds
 * that truth to ONE scheduled event and adds the temporal gate, producing a deterministic
 * decision with the exact reasons. It cannot fabricate anything: there is no generation path
 * here, only the gate a future generation would have to pass.
 *
 * Hard separations, executable: an input satisfies only ITSELF (injuries never satisfy lineups —
 * the NBA matrix entry encodes the combined input's missing half); odds BLOCKED_EXTERNAL refuses
 * regardless of any historical odds lying around (stale prices are not current prices); a started
 * event refuses everything (post-start evidence never feeds a pre-event artifact); activation
 * must be the literal "OFF" — anything else refuses before inputs are even consulted.
 */
import { LIVE_INPUT_MATRIX } from "./shadow-contract.mjs";

export const INPUT_COMPLETENESS_VERSION = 1;

/** Inputs a bout_winner/match-level shadow would require, per sport. UNSUPPORTED inputs are
 *  NOT_REQUIRED for this scope and listed so the omission is explicit, never silent. */
export const REQUIRED_INPUTS = Object.freeze({
  nfl: ["schedule", "priorResults", "teamStrengthState", "injuries", "odds"],
  nba: ["schedule", "priorResults", "teamStrengthState", "injuriesLineups", "odds"],
  epl: ["schedule", "priorResults", "clubStrengthState", "lineups", "odds"],
  ufc: ["schedule", "priorResults", "fighterStrengthState", "weighInsReplacements", "odds"],
});

/** Classify one event's shadow readiness. Pure; clock and activation are parameters. */
export function classifyEventInputs({ sport, event, nowIso, activation = "OFF" }) {
  const required = REQUIRED_INPUTS[sport];
  if (!required) return { decision: "REFUSED", sport, reasons: [`unknown sport ${sport}`], inputs: [] };
  const reasons = [];

  if (activation !== "OFF") reasons.push(`publicActivation is "${activation}" — shadow work exists only under the literal OFF`);

  const start = Date.parse(event?.scheduledStartUtc ?? "");
  const now = Date.parse(nowIso ?? "");
  if (!event?.providerEventId) reasons.push("event has no provider identity — nothing binds evidence to reality");
  if (!Number.isFinite(start) || !Number.isFinite(now)) reasons.push("event start or clock unparseable — temporal gating is mandatory");
  else if (now >= start) reasons.push(`event started ${event.scheduledStartUtc} — post-start evidence never feeds a pre-event artifact`);

  const matrix = LIVE_INPUT_MATRIX[sport] ?? {};
  const inputs = required.map((key) => {
    const entry = matrix[key];
    const state = entry?.state ?? "MISSING";
    return { input: key, state, evidence: entry?.source ?? entry?.note ?? "no matrix entry — MISSING by default" };
  });
  const unsupported = Object.entries(matrix).filter(([, v]) => v.state === "UNSUPPORTED").map(([k]) => k);

  for (const i of inputs) {
    if (i.state === "AVAILABLE") continue;
    reasons.push(`${i.input} is ${i.state} — ${i.state === "BLOCKED_EXTERNAL" ? "one founder-owned blocker; stale or historical substitutes are refused by definition" : "an input satisfies only itself; nothing substitutes"}`);
  }

  const nonOddsGaps = inputs.filter((i) => i.state !== "AVAILABLE" && i.input !== "odds");
  const oddsBlocked = inputs.some((i) => i.input === "odds" && i.state !== "AVAILABLE");
  const summary = reasons.length === 0 ? "READY" : nonOddsGaps.length === 0 && oddsBlocked && Number.isFinite(start) && now < start && activation === "OFF"
    ? "READY_EXCEPT_ODDS"
    : "MISSING_INPUTS";

  return {
    version: INPUT_COMPLETENESS_VERSION,
    sport,
    providerEventId: event?.providerEventId ?? null,
    decision: reasons.length === 0 ? "ELIGIBLE" : "REFUSED",
    summary,
    reasons,
    inputs,
    notRequired: unsupported.map((k) => ({ input: k, state: "NOT_REQUIRED", evidence: "UNSUPPORTED by the source shape — excluded explicitly, never silently" })),
  };
}
