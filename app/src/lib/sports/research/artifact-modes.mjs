/**
 * Research-artifact MODES — the strict three-state contract every simulation/model artifact
 * declares (Program 149 · Release 1).
 *
 *   CURRENT_PRE_EVENT — produced from inputs captured before the event, for the live pipeline.
 *                       The ONLY mode a public consumer may ever accept, and even then only when
 *                       the sport's gate stands at LIVE_ELIGIBLE with founder activation.
 *   HISTORICAL_REPLAY — reconstructs a past slate using ONLY information available before its
 *                       cutoff. Advances research/testing stages; can never advance automation,
 *                       public product, or activation.
 *   SYNTHETIC_TEST    — invariant/boundary-case exercise. Lives outside production data, excluded
 *                       mechanically from evaluation aggregates and from the public export.
 *
 * Unknown modes are REFUSED, not coerced — a fourth mode appearing anywhere is a defect the
 * validator turns into a loud error, never a silent pass-through.
 */

export const ARTIFACT_MODES = Object.freeze(["CURRENT_PRE_EVENT", "HISTORICAL_REPLAY", "SYNTHETIC_TEST"]);

/**
 * Validate a research artifact envelope. Total: returns {ok, errors}, never throws, so batch
 * consumers quarantine rather than die.
 */
export function validateResearchArtifact(a) {
  const errors = [];
  const req = (k) => { if (a?.[k] == null || a[k] === "") errors.push(`missing ${k}`); };
  ["schemaVersion", "artifact", "sport", "mode", "generatedAt", "deterministicId", "provenance"].forEach(req);
  if (a?.mode != null && !ARTIFACT_MODES.includes(a.mode)) errors.push(`unknown mode "${a.mode}" — the mode set is closed`);
  if (a?.mode === "HISTORICAL_REPLAY") {
    if (!a.sourceCutoffIso || !Number.isFinite(Date.parse(a.sourceCutoffIso))) errors.push("HISTORICAL_REPLAY requires a parseable sourceCutoffIso");
    if (a.inputsAsOfIso && Number.isFinite(Date.parse(a.inputsAsOfIso)) && Date.parse(a.inputsAsOfIso) > Date.parse(a.sourceCutoffIso)) {
      errors.push("inputsAsOfIso is after sourceCutoffIso — a replay cannot see past its cutoff");
    }
  }
  if (a?.mode === "SYNTHETIC_TEST" && a?.evaluationEligible === true) {
    errors.push("SYNTHETIC_TEST can never be evaluationEligible — synthetic rows poison metrics");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * May a PUBLIC surface consume this artifact? Only CURRENT_PRE_EVENT, only when the sport's gate
 * says LIVE_ELIGIBLE, and only with founder activation — three independent refusals, all stated.
 */
export function publicConsumerAccepts(artifact, { gateState, founderActivated } = {}) {
  const v = validateResearchArtifact(artifact);
  if (!v.ok) return { ok: false, reason: `invalid artifact: ${v.errors[0]}` };
  if (artifact.mode !== "CURRENT_PRE_EVENT") return { ok: false, reason: `mode ${artifact.mode} is research-only — public surfaces accept CURRENT_PRE_EVENT alone` };
  if (gateState !== "LIVE_ELIGIBLE") return { ok: false, reason: `sport gate is ${gateState ?? "UNKNOWN"}, not LIVE_ELIGIBLE` };
  if (founderActivated !== true) return { ok: false, reason: "founder activation absent" };
  return { ok: true, reason: null };
}
