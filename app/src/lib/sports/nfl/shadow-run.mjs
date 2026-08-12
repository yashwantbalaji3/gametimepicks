/**
 * NFL shadow-run workflow (Program 167 · Release E) — the guarded path from real inputs to a
 * private CURRENT_PRE_EVENT artifact, or to an equally-first-class refusal. PRIVATE.
 *
 * DECISION LADDER (first hit wins — every rung is an auditable answer, never an error):
 *   REFUSED_POST_START     assembly clock at/after kickoff — a post-start "prediction" is fraud
 *   ABSTAIN                the model's own policy refuses (preseason, unresolved identity)
 *   READY_EXCEPT_ODDS      every input but a fresh authorized odds snapshot is present — the
 *                          charter's named pre-authorization end state; NO probabilities emitted
 *   CURRENT_PRE_EVENT      all inputs qualify pre-start → the full artifact, validated by
 *                          validateShadowRun, publicActivation OFF, settlement PENDING
 *
 * Model and market stay two fields that never touch: `model` comes from predictNflV1 (no odds
 * parameter exists), `market` is the no-vig read of the supplied snapshot. Nothing blends them.
 */
import { assembleNflEvent } from "./event-assembly.mjs";
import { predictNflV1, strengthStateAt } from "./model-v1.mjs";
import { validateShadowRun } from "../research/shadow-contract.mjs";
import { noVigTwoWay } from "../odds/snapshot-contract.mjs";

export const NFL_SHADOW_VERSION = 1;

/**
 * @param {object} p
 * @param {object} p.event             committed schedule row (providerEventId, dateUtc, home/away, seasonType)
 * @param {string} p.nowIso            the run clock — always a parameter
 * @param {Array}  p.strengthRows      merged finals (corpus + current results), cutoff-filtered by the state builder
 * @param {object} p.fit               fitNflV1 output (frozen training-window heads)
 * @param {object|null} p.injuriesArtifact
 * @param {object|null} p.oddsSnapshot  a fresh AUTHORIZED capture: { capturedAt, rows: [{ bookmaker, marketType:"h2h", outcomes, sourceAsOf }] } or null
 * @param {number} [p.oddsFreshnessHours]
 */
export function runNflShadow({ event, nowIso, strengthRows, fit, injuriesArtifact = null, oddsSnapshot = null, oddsFreshnessHours = 6 }) {
  const kickoff = Date.parse(event?.dateUtc ?? "");
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("runNflShadow: nowIso required");
  const base = { version: NFL_SHADOW_VERSION, providerEventId: event?.providerEventId ?? null, kickoffUtc: event?.dateUtc ?? null, ranAt: nowIso };

  if (!Number.isFinite(kickoff) || now >= kickoff) {
    return { ...base, state: "REFUSED_POST_START", reason: "run clock is at/after scheduled kickoff (or kickoff unparseable) — generation after start is refused, not discounted" };
  }

  // Model policy runs BEFORE input completeness: a preseason event abstains no matter how
  // complete its inputs are, and the abstention must say so in the model's own words.
  const strengthState = strengthStateAt({ rows: strengthRows ?? [], cutoffIso: nowIso });
  const modelOut = predictNflV1({ fit, strengthState, event });
  const assembly = assembleNflEvent({ event, nowIso, strengthRows: strengthRows ?? [], injuriesArtifact });
  if (modelOut.state === "ABSTAIN") {
    return { ...base, state: "ABSTAIN", reason: modelOut.reason, assembly: { decision: assembly.decision, evidence: assembly.evidence }, publicActivation: "OFF" };
  }

  // Odds gate: fresh, pre-start, authorized snapshot required for a CURRENT artifact.
  const capAt = Date.parse(oddsSnapshot?.capturedAt ?? "");
  const oddsFresh = Number.isFinite(capAt) && capAt < kickoff && (now - capAt) / 3_600_000 <= oddsFreshnessHours && capAt <= now;
  const h2h = (oddsSnapshot?.rows ?? []).filter((r) => r.marketType === "h2h");
  if (!oddsFresh || h2h.length === 0) {
    return {
      ...base,
      state: "READY_EXCEPT_ODDS",
      reason: oddsSnapshot ? "odds snapshot missing/stale/post-start or carries no h2h rows — probabilities are withheld until a fresh authorized market exists" : "no authorized odds snapshot supplied — the charter's pre-authorization end state; probabilities are withheld, not approximated",
      assembly: { decision: assembly.decision, summary: assembly.summary, evidence: assembly.evidence },
      publicActivation: "OFF",
    };
  }

  // Market read: every bookmaker's h2h de-vigged independently; refusals recorded.
  const market = { bookmakers: [], quarantined: [] };
  for (const row of h2h) {
    const nv = noVigTwoWay(row.outcomes ?? []);
    if (nv.ok) market.bookmakers.push({ bookmaker: row.bookmaker, impliedSum: nv.impliedSum, noVig: nv.noVig, sourceAsOf: row.sourceAsOf ?? oddsSnapshot.capturedAt });
    else market.quarantined.push({ bookmaker: row.bookmaker, reason: nv.reason });
  }
  if (market.bookmakers.length === 0) {
    return { ...base, state: "READY_EXCEPT_ODDS", reason: `every supplied h2h row refused de-vig (${market.quarantined.map((q) => q.reason).join("; ")}) — a corrupt market never qualifies`, assembly: { decision: assembly.decision, evidence: assembly.evidence }, publicActivation: "OFF" };
  }

  const artifact = {
    schemaVersion: 1,
    artifact: "nfl-shadow-run",
    sport: "nfl",
    mode: "CURRENT_PRE_EVENT",
    generatedAt: nowIso,
    deterministicId: `${event.providerEventId}:${fit.modelId}:${nowIso}`,
    event: { canonicalEventId: `nfl-${event.providerEventId}`, providerEventId: event.providerEventId, scheduledStartUtc: event.dateUtc, matchup: assembly.matchup },
    evidence: [
      { source: "schedule capture (committed row)", asOfIso: event.capturedAt ?? oddsSnapshot.capturedAt },
      { source: "strength state (cutoff-versioned)", asOfIso: nowIso <= event.dateUtc ? nowIso : event.dateUtc },
      ...(injuriesArtifact ? [{ source: "injuries capture", asOfIso: injuriesArtifact.sourceAsOf ?? injuriesArtifact.generatedAt }] : []),
      { source: "odds snapshot (authorized)", asOfIso: oddsSnapshot.capturedAt },
    ],
    model: modelOut,
    market,
    qualification: { inputDecision: assembly.decision, oddsFresh: true, freshnessBoundHours: oddsFreshnessHours },
    publicActivation: "OFF",
    settlementLinkage: "PENDING_OFFICIAL_RESULT",
    evaluationEligible: false,
    provenance: `nfl shadow-run v${NFL_SHADOW_VERSION}: ${fit.modelId} over cutoff strength state (${strengthState.gamesFolded} finals < ${nowIso}); market from authorized snapshot ${oddsSnapshot.capturedAt} (${market.bookmakers.length} bookmaker(s) de-vigged, ${market.quarantined.length} refused)`,
  };
  const check = validateShadowRun(artifact);
  if (!check.ok) {
    return { ...base, state: "ABSTAIN", reason: `shadow validation refused: ${check.errors.join("; ")}`, publicActivation: "OFF" };
  }
  return { ...base, state: "CURRENT_PRE_EVENT", artifact };
}
