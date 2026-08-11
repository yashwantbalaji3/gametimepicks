/**
 * Shadow-run contract — the guarded bridge from historical research to FUTURE pre-event operation
 * (Program 155 · Release D). PRIVATE. Nothing here generates a pick, a probability, or a public
 * surface; it defines what a legitimate private CURRENT_PRE_EVENT shadow artifact would have to
 * prove, and refuses everything else.
 *
 * THE ONE RULE THAT MATTERS: a historical snapshot replayed today can never be relabelled current.
 * CURRENT_PRE_EVENT demands actual pre-start evidence timestamps against the event's OWN
 * scheduled start — validated here, fail-closed.
 *
 * LIVE-INPUT MATRIX: per sport, every input a real shadow run would need, classified honestly.
 * MISSING/STALE/BLOCKED inputs are named tickets, never silent substitutions — the work board
 * consumes this table so each sport's route to shadow operation is explicit.
 */
import { validateResearchArtifact } from "./artifact-modes.mjs";

export const SHADOW_CONTRACT_VERSION = 1;

export const INPUT_STATES = Object.freeze(["AVAILABLE", "MISSING", "STALE", "BLOCKED_EXTERNAL", "NOT_REQUIRED", "UNSUPPORTED"]);

/**
 * Per-sport live-input truth, committed like the gate assessments: update only with a receipt.
 * "AVAILABLE" cites the mechanism; everything else names what unblocks it.
 */
export const LIVE_INPUT_MATRIX = Object.freeze({
  nfl: {
    schedule: { state: "AVAILABLE", source: "sport-schedules daily capture (cadence receipts 2/2: runs 31396780843 + 31500117960)" },
    priorResults: { state: "AVAILABLE", source: "same scoreboard class the corpus used; forward wiring not yet scheduled" },
    teamStrengthState: { state: "AVAILABLE", source: "Elo state reproducible from corpus + results-to-date (deterministic fit)" },
    injuries: { state: "MISSING", note: "no authorized timestamped source; absence forces wider uncertainty, never invented" },
    odds: { state: "BLOCKED_EXTERNAL", note: "founder-owned CI-key exercise" },
  },
  nba: {
    schedule: { state: "AVAILABLE", source: "sport-schedules daily capture (partial calendar until full publication)" },
    priorResults: { state: "AVAILABLE", source: "scoreboard class proven by the corpus" },
    teamStrengthState: { state: "AVAILABLE", source: "Elo/pace state reproducible deterministically" },
    injuriesLineups: { state: "MISSING", note: "no authorized timestamped source; model card names this gap" },
    odds: { state: "BLOCKED_EXTERNAL", note: "founder-owned CI-key exercise" },
  },
  epl: {
    schedule: { state: "AVAILABLE", source: "380-fixture capture + cadence re-capture" },
    priorResults: { state: "AVAILABLE", source: "current-results adapter (P154) — PRESEASON until Aug 21, then real FTs flow" },
    clubStrengthState: { state: "AVAILABLE", source: "Poisson/Elo state reproducible from research corpus + season results-to-date" },
    lineups: { state: "MISSING", note: "no authorized source; v1 shadow would run team-level only, stated" },
    odds: { state: "BLOCKED_EXTERNAL", note: "founder-owned CI-key exercise (Odds API supports EPL)" },
  },
  ufc: {
    schedule: { state: "AVAILABLE", source: "forward cards/bouts capture (16 cards / 83 bouts; fight-day addition lineage observed live)" },
    priorResults: { state: "AVAILABLE", source: "MMA scoreboard class proven by the corpus (rate-limit-aware fetcher)" },
    fighterStrengthState: { state: "AVAILABLE", source: "abstaining Elo state reproducible; 25.6% coverage limitation carries over" },
    weighInsReplacements: { state: "MISSING", note: "no authorized timestamped source; late replacements force abstention" },
    methodRoundFields: { state: "UNSUPPORTED", note: "winner-only corpus shape; method/round markets cannot be shadowed" },
    odds: { state: "BLOCKED_EXTERNAL", note: "founder-owned CI-key exercise" },
  },
});

/**
 * Validate a would-be CURRENT_PRE_EVENT shadow artifact. Total {ok, errors}. This is deliberately
 * stricter than the research validator: mode must be CURRENT_PRE_EVENT, every evidence timestamp
 * must precede the event's scheduled start, activation must be OFF, and settlement linkage starts
 * PENDING — a shadow prediction is not evaluation-eligible until an official result reconciles.
 */
export function validateShadowRun(a) {
  const base = validateResearchArtifact(a);
  const errors = [...base.errors];
  if (a?.mode !== "CURRENT_PRE_EVENT") errors.push(`shadow runs are CURRENT_PRE_EVENT only — got ${a?.mode} (a replay relabelled current is the exact fraud this contract exists to refuse)`);
  if (!a?.event?.canonicalEventId || !a?.event?.scheduledStartUtc) errors.push("shadow runs bind to ONE scheduled event (canonicalEventId + scheduledStartUtc)");
  if (!Array.isArray(a?.evidence) || a.evidence.length === 0) errors.push("a shadow run lists its evidence inputs with timestamps — an inputless prediction is a guess");
  for (const ev of a?.evidence ?? []) {
    if (!ev.source || !ev.asOfIso) { errors.push(`evidence entry missing source/asOfIso`); continue; }
    if (a?.event?.scheduledStartUtc && Date.parse(ev.asOfIso) >= Date.parse(a.event.scheduledStartUtc)) {
      errors.push(`evidence "${ev.source}" is at/after the scheduled start — generation after start is refused, not discounted`);
    }
  }
  if (a?.generatedAt && a?.event?.scheduledStartUtc && Date.parse(a.generatedAt) >= Date.parse(a.event.scheduledStartUtc)) {
    errors.push("generatedAt is at/after scheduled start — a post-start artifact is not pre-event");
  }
  if (a?.publicActivation !== "OFF") errors.push("publicActivation must be the literal 'OFF' on every shadow artifact");
  if (a?.settlementLinkage !== "PENDING_OFFICIAL_RESULT") errors.push("settlement linkage starts PENDING_OFFICIAL_RESULT — never evaluated early");
  if (a?.evaluationEligible === true) errors.push("a shadow run is NOT evaluation-eligible at generation time — eligibility arrives with the reconciled official result");
  return { ok: errors.length === 0, errors };
}

/** The work board's feed: every non-AVAILABLE input as an explicit ticket seed. */
export function shadowGaps() {
  const gaps = [];
  for (const [sport, inputs] of Object.entries(LIVE_INPUT_MATRIX)) {
    for (const [input, v] of Object.entries(inputs)) {
      if (!INPUT_STATES.includes(v.state)) throw new Error(`${sport}.${input}: invalid state ${v.state}`);
      if (v.state !== "AVAILABLE" && v.state !== "NOT_REQUIRED") {
        gaps.push({ sport, input, state: v.state, note: v.note ?? null });
      }
    }
  }
  return gaps;
}
