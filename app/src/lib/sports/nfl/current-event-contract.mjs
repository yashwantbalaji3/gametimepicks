/**
 * Current-event artifact contract (Program 171 · Release E).
 *
 * One validator, two consumers: the orchestrator refuses to WRITE an artifact this rejects,
 * and the guard tests refuse to KEEP one. The rules are the program's time and honesty
 * discipline, mechanical:
 *   - private, activation OFF, append-only naming;
 *   - every evidence stamp AND generatedAt strictly precede kickoff (post-start = fraud);
 *   - each market family carries a state from its own closed set;
 *   - a captured market must carry coherent settlement targets (no-vig probs a real
 *     distribution, numeric lines) — and the model read NEVER equals the market read
 *     byte-for-byte (blending is structurally visible).
 */

export const CURRENT_EVENT_CONTRACT_VERSION = 1;

export const TEAM_MODEL_STATES = Object.freeze(["ABSTAIN", "READY_EXCEPT_ODDS", "CURRENT_PRE_EVENT", "REFUSED_POST_START"]);
export const MARKET_STATES = Object.freeze(["CAPTURED_FRESH", "CAPTURED_STALE", "NO_MARKET"]);
export const PROPS_STATES = Object.freeze(["ROLE_UNCERTAIN", "SEE_PROMOTION"]);
export const ATD_STATES = Object.freeze(["MODELLED_NOT_PUBLISHABLE", "PUBLISHABLE_ROWS", "REFUSED"]);

export function validateCurrentEventArtifact(a) {
  const errors = [];
  if (a?.dataClass !== "PRIVATE_RESEARCH") errors.push("dataClass must be PRIVATE_RESEARCH — current artifacts never ship raw");
  if (a?.publicActivation !== "OFF") errors.push("publicActivation must be the literal OFF");
  const kickoff = Date.parse(a?.kickoffUtc ?? "");
  if (!Number.isFinite(kickoff)) errors.push("kickoffUtc missing/unparseable");
  const stamps = [
    ["generatedAt", a?.generatedAt],
    ["schedule", a?.evidence?.schedule?.asOf],
    ["rosters", a?.evidence?.rosters?.asOf],
    ["injuries", a?.evidence?.injuries?.asOf],
    ["odds", a?.evidence?.odds?.asOf],
  ].filter(([, v]) => v != null);
  for (const [name, v] of stamps) {
    const t = Date.parse(v);
    if (!Number.isFinite(t)) errors.push(`${name} stamp unparseable`);
    else if (Number.isFinite(kickoff) && t >= kickoff) errors.push(`${name} stamp ${v} at/after kickoff — a post-start artifact is fraud, not data`);
  }
  const fam = a?.families ?? {};
  if (!TEAM_MODEL_STATES.includes(fam.teamModel?.state)) errors.push(`teamModel state ${fam.teamModel?.state} outside the closed set`);
  if (!MARKET_STATES.includes(fam.market?.state)) errors.push(`market state ${fam.market?.state} outside the closed set`);
  if (!PROPS_STATES.includes(fam.playerProps?.state)) errors.push(`playerProps state ${fam.playerProps?.state} outside the closed set`);
  if (!ATD_STATES.includes(fam.anytimeTd?.state)) errors.push(`anytimeTd state ${fam.anytimeTd?.state} outside the closed set`);
  if ((a?.seasonType ?? 0) === 1) {
    if (fam.teamModel?.state !== "ABSTAIN") errors.push("preseason teamModel must ABSTAIN (the model card's stated policy)");
    if (fam.playerProps?.state !== "ROLE_UNCERTAIN") errors.push("preseason playerProps must be ROLE_UNCERTAIN — a posted line never substitutes for participation");
  }
  if (fam.market?.state?.startsWith("CAPTURED")) {
    const t = a?.settlementTargets;
    if (!t) errors.push("captured market without settlementTargets — nothing to settle exactly once");
    else {
      const { home, away } = t.moneylineNoVig ?? {};
      if (!(home > 0 && home < 1 && away > 0 && away < 1)) errors.push("settlement no-vig probs outside (0,1)");
      else if (Math.abs(home + away - 1) > 1e-3) errors.push(`settlement no-vig probs sum to ${(home + away).toFixed(4)} ≠ 1`);
      if (typeof t.spreadHome !== "number") errors.push("settlement spreadHome missing");
      if (!(t.total > 0)) errors.push("settlement total missing");
      if (!t.capturedAt || Date.parse(t.capturedAt) >= kickoff) errors.push("settlement capture must be strictly pre-kickoff");
    }
    const modelHome = a?.research?.gamesim?.winProbability?.home;
    const marketHome = fam.market?.consensus?.homeWinProbNoVig;
    if (typeof modelHome === "number" && typeof marketHome === "number" && modelHome === marketHome) {
      errors.push("model win prob EQUALS market no-vig — blending (or copying) is structurally forbidden");
    }
  }
  return { ok: errors.length === 0, errors };
}
