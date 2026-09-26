/**
 * P698 — DOES THE LEARNING POLICY DO WHAT IT SAYS IT DID?
 *
 * THE FINDING THIS ENCODES. `optimizer/<date>.json` publishes `learningPolicyApplied: true` beside
 * warnings in its own words:
 *
 *   "confidence non-predictive (spread 4.6pts) — excluded from ranking"
 *   "edge signal is INVERTED at high values — edge capped, not used to promote"
 *
 * Measured against the same file's 371 rows on 2026-09-26, neither holds. `confidenceComponent` is
 * 0.21 for Low and 0.455 for Medium/High — a 0.245 spread on a legScore range of 0.35–1.22 — and
 * `edgeComponent` rises monotonically with `edgePct` to its 0.30 cap. Capping bounds how much a
 * signal promotes; it does not stop it promoting, and a signal the same policy calls INVERTED
 * should not carry a positive weight at any cap.
 *
 * A policy that measures a signal as harmful, states it removed it, and did not, is worse than one
 * that never measured it — the warning reads as a fix. This is the vacuous-guard shape applied to
 * a model policy rather than to a test, and it is why the check lives in the artifact rather than
 * in a review.
 *
 * WHAT THIS IS NOT. It does not decide whether a signal SHOULD be excluded — that is the learning
 * policy's job and a model question. It only asks whether the artifact's own claim matches the
 * artifact's own numbers. A claim nobody made cannot fail here.
 *
 * ⚠ THE SIGNAL MAP IS EXPLICIT, NOT A REGEX OVER PROSE. A loose match on warning text is how this
 * check would quietly stop matching when the wording changes. A warning that names no known signal
 * is reported as UNPARSED and counted — never skipped.
 */

/** signal name → the score component it must control, and the raw field it is derived from. */
export const SIGNAL_COMPONENTS = Object.freeze({
  confidence: { component: "confidenceComponent", raw: "confidence" },
  edge: { component: "edgeComponent", raw: "edgePct" },
  recent10: { component: "recent10Bonus", raw: "recent10Count" },
  star: { component: "starBoost", raw: "starTier" },
});

/** The treatments a warning can claim, and what each one forbids. */
export const CLAIMED = Object.freeze({
  EXCLUDED: "the component must be identical on every leg",
  NOT_PROMOTING: "the component must not increase with the raw signal",
});

export const VERDICTS = Object.freeze(["HONOURED", "CLAIMED_EXCLUDED_BUT_CONTRIBUTES", "CLAIMED_NEUTRAL_BUT_PROMOTES", "NO_COMPONENT", "UNPARSED"]);

/** Which signal a warning is about, and what it claims — explicit phrases only. */
export function readWarning(text) {
  const t = String(text ?? "").toLowerCase();
  const signal = Object.keys(SIGNAL_COMPONENTS).find((s) => t.includes(s));
  if (!signal) return { signal: null, claim: null, text };
  /* "excluded from ranking" is the strong claim; "not used to promote" is the weak one. A warning
     that only reports a measurement ("is inverted") claims nothing and is not held to anything. */
  const claim = t.includes("excluded from ranking") || t.includes("excluded from the ranking")
    ? "EXCLUDED"
    : t.includes("not used to promote")
      ? "NOT_PROMOTING"
      : null;
  return { signal, claim, text };
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * @param policyWarnings the artifact's own `learningPolicy.policyWarnings`
 * @param legs           the artifact's own `legPool.legs`, each with `scoreBreakdown`
 */
export function auditPolicyApplication({ policyWarnings = [], legs = [] }) {
  const rows = [];
  for (const raw of policyWarnings) {
    const { signal, claim, text } = readWarning(raw);
    if (!signal) { rows.push({ text, signal: null, claim: null, verdict: "UNPARSED", detail: "no known signal named in the warning" }); continue; }
    if (!claim) continue; // a measurement without a claim is not a promise
    const { component, raw: rawField } = SIGNAL_COMPONENTS[signal];
    const pairs = legs
      .map((l) => [l?.[rawField], num(l?.scoreBreakdown?.[component])])
      .filter(([, c]) => c !== null);
    if (!pairs.length) { rows.push({ text, signal, claim, verdict: "NO_COMPONENT", detail: `no leg carries scoreBreakdown.${component}` }); continue; }

    const values = [...new Set(pairs.map(([, c]) => c))];
    if (claim === "EXCLUDED") {
      rows.push(values.length === 1
        ? { text, signal, claim, verdict: "HONOURED", detail: `${component} is ${values[0]} on all ${pairs.length} legs` }
        : { text, signal, claim, verdict: "CLAIMED_EXCLUDED_BUT_CONTRIBUTES", detail: `${component} takes ${values.length} distinct values across ${pairs.length} legs (spread ${(Math.max(...values) - Math.min(...values)).toFixed(4)})`, spread: Math.max(...values) - Math.min(...values) });
      continue;
    }
    /* NOT_PROMOTING: sort by the raw signal and ask whether the component ever rises with it.
       A flat or decreasing component honours the claim; a cap does not, because a capped term
       still promotes everything below the cap. */
    const numericPairs = pairs.map(([r, c]) => [num(r), c]).filter(([r]) => r !== null).sort((a, b) => a[0] - b[0]);
    if (numericPairs.length < 2) { rows.push({ text, signal, claim, verdict: "NO_COMPONENT", detail: `fewer than two legs carry a numeric ${rawField}` }); continue; }
    const rises = numericPairs.at(-1)[1] > numericPairs[0][1];
    rows.push(rises
      ? { text, signal, claim, verdict: "CLAIMED_NEUTRAL_BUT_PROMOTES", detail: `${component} rises from ${numericPairs[0][1]} at ${rawField}=${numericPairs[0][0]} to ${numericPairs.at(-1)[1]} at ${rawField}=${numericPairs.at(-1)[0]}` }
      : { text, signal, claim, verdict: "HONOURED", detail: `${component} does not increase with ${rawField}` });
  }
  const broken = rows.filter((r) => r.verdict === "CLAIMED_EXCLUDED_BUT_CONTRIBUTES" || r.verdict === "CLAIMED_NEUTRAL_BUT_PROMOTES");
  return {
    rows,
    honoured: rows.filter((r) => r.verdict === "HONOURED").length,
    broken: broken.length,
    unparsed: rows.filter((r) => r.verdict === "UNPARSED").length,
    state: broken.length ? "CLAIM_NOT_HONOURED" : rows.length ? "HONOURED" : "NO_CLAIMS",
  };
}
