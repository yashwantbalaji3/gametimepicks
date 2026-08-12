/**
 * UFC shadow-run workflow (Program 167 · Release F) — per-BOUT decision ladder from committed
 * captures to a private CURRENT_PRE_EVENT winner artifact, or an equally-first-class refusal.
 *
 * LADDER (first hit wins; every rung is auditable):
 *   REFUSED_POST_START   run clock at/after bout start
 *   ABSTAIN(CARD)        card certainty insufficient: the newest two captures disagree about the
 *                        bout (REPLACEMENT / BOTH_CORNERS_CHANGED / CORNER_SWAP / CANCELLED /
 *                        POSTPONED / WEIGHT_CLASS_CHANGE), the bout is missing from the newest
 *                        capture, or the newest capture is older than the freshness bound.
 *                        Weigh-in/replacement facts have NO authorized timestamped source
 *                        (LIVE_INPUT_MATRIX: MISSING) — so lineage stability across captures is
 *                        the ONLY card-certainty evidence, and instability always abstains.
 *   ABSTAIN(MODEL)       the model's own rules (IDENTITY / SPARSE / IDLE)
 *   READY_EXCEPT_ODDS    model would predict; no fresh authorized two-way market exists —
 *                        NO probabilities are emitted on this rung
 *   CURRENT_PRE_EVENT    all inputs qualify pre-start → validateShadowRun-clean artifact,
 *                        publicActivation OFF, settlement PENDING_OFFICIAL_RESULT
 */
import { classifyUfcLineage } from "./lineage.mjs";
import { predictUfcV1 } from "./model-v1.mjs";
import { validateShadowRun } from "../research/shadow-contract.mjs";
import { noVigTwoWay } from "../odds/snapshot-contract.mjs";

export const UFC_SHADOW_VERSION = 1;
const CARD_FRESHNESS_HOURS = 48;

/** Card-certainty check for one bout across the newest two captures. */
export function boutCardCertainty({ providerBoutId, prevCapture, nextCapture, nowIso }) {
  const now = Date.parse(nowIso ?? "");
  const capAt = Date.parse(nextCapture?.generatedAt ?? "");
  if (!Number.isFinite(capAt) || !Number.isFinite(now)) return { certain: false, reason: "capture or run clock unparseable" };
  const ageH = (now - capAt) / 3_600_000;
  if (ageH > CARD_FRESHNESS_HOURS) return { certain: false, reason: `newest capture is ${ageH.toFixed(1)}h old — beyond the ${CARD_FRESHNESS_HOURS}h card-certainty bound` };
  const inNext = (nextCapture?.bouts ?? []).some((b) => b.providerBoutId === providerBoutId);
  if (!inNext) return { certain: false, reason: "bout absent from the newest capture — removal is the observation; cancellation is not inferred, and neither is presence" };
  if (!prevCapture) return { certain: false, reason: "only one capture exists — lineage needs two committed points" };
  const lineage = classifyUfcLineage(prevCapture, nextCapture);
  const boutChanges = lineage.changes.filter((c) => c.providerBoutId === providerBoutId && c.class !== "UNCHANGED" && c.class !== "STATUS_CHANGE" && c.class !== "ADDED");
  if (boutChanges.length > 0) {
    return { certain: false, reason: `lineage instability: ${boutChanges.map((c) => c.class).join(", ")} between the newest two captures — with weigh-in/replacement facts MISSING (no authorized source), instability always abstains`, changes: boutChanges };
  }
  const addedNow = lineage.changes.some((c) => c.providerBoutId === providerBoutId && c.class === "ADDED");
  if (addedNow) return { certain: false, reason: "bout first appeared in the newest capture — one observation is not stability; the next capture must confirm it" };
  return { certain: true, reason: `bout UNCHANGED across captures ${lineage.prevGeneratedAt} → ${lineage.nextGeneratedAt}, newest ${ageH.toFixed(1)}h old`, capAgeHours: Number(ageH.toFixed(1)) };
}

/**
 * @param {object} p
 * @param {object} p.bout          committed bout row (providerBoutId, eventProviderId, red/blue, dateUtc)
 * @param {string} p.nowIso
 * @param {object} p.fit           fitUfcV1 output
 * @param {object} p.prevCapture   second-newest committed schedule capture
 * @param {object} p.nextCapture   newest committed schedule capture
 * @param {object|null} p.oddsSnapshot  fresh AUTHORIZED capture with two-way h2h rows for this bout, or null
 * @param {number} [p.oddsFreshnessHours]
 */
export function runUfcShadow({ bout, nowIso, fit, prevCapture, nextCapture, oddsSnapshot = null, oddsFreshnessHours = 6 }) {
  const start = Date.parse(bout?.dateUtc ?? "");
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("runUfcShadow: nowIso required");
  const base = { version: UFC_SHADOW_VERSION, providerBoutId: bout?.providerBoutId ?? null, matchup: bout ? `${bout.red} vs ${bout.blue}` : null, startUtc: bout?.dateUtc ?? null, ranAt: nowIso };

  if (!Number.isFinite(start) || now >= start) {
    return { ...base, state: "REFUSED_POST_START", reason: "run clock at/after bout start (or start unparseable) — post-start generation is refused" };
  }

  const certainty = boutCardCertainty({ providerBoutId: bout.providerBoutId, prevCapture, nextCapture, nowIso });
  if (!certainty.certain) {
    return { ...base, state: "ABSTAIN", rule: "CARD_UNCERTAIN", reason: certainty.reason, publicActivation: "OFF" };
  }

  const model = predictUfcV1({ fit, bout, boutIso: bout.dateUtc });
  if (model.state === "ABSTAIN") {
    return { ...base, state: "ABSTAIN", rule: model.rule, reason: model.reason, cardCertainty: certainty.reason, publicActivation: "OFF" };
  }

  const capAt = Date.parse(oddsSnapshot?.capturedAt ?? "");
  const oddsFresh = Number.isFinite(capAt) && capAt < start && capAt <= now && (now - capAt) / 3_600_000 <= oddsFreshnessHours;
  const h2h = (oddsSnapshot?.rows ?? []).filter((r) => r.marketType === "h2h" && r.providerBoutId === bout.providerBoutId);
  if (!oddsFresh || h2h.length === 0) {
    return {
      ...base,
      state: "READY_EXCEPT_ODDS",
      reason: oddsSnapshot ? "odds snapshot stale/post-start or carries no h2h rows for this bout — probabilities withheld" : "no authorized odds snapshot — the pre-authorization end state; probabilities withheld, not approximated",
      cardCertainty: certainty.reason,
      publicActivation: "OFF",
    };
  }

  const market = { bookmakers: [], quarantined: [] };
  for (const row of h2h) {
    const nv = noVigTwoWay(row.outcomes ?? []);
    if (nv.ok) market.bookmakers.push({ bookmaker: row.bookmaker, impliedSum: nv.impliedSum, noVig: nv.noVig, sourceAsOf: row.sourceAsOf ?? oddsSnapshot.capturedAt });
    else market.quarantined.push({ bookmaker: row.bookmaker, reason: nv.reason });
  }
  if (market.bookmakers.length === 0) {
    return { ...base, state: "READY_EXCEPT_ODDS", reason: `every h2h row refused de-vig (${market.quarantined.map((q) => q.reason).join("; ")})`, cardCertainty: certainty.reason, publicActivation: "OFF" };
  }

  const artifact = {
    schemaVersion: 1,
    artifact: "ufc-shadow-run",
    sport: "ufc",
    mode: "CURRENT_PRE_EVENT",
    generatedAt: nowIso,
    deterministicId: `${bout.providerBoutId}:${fit.modelId}:${nowIso}`,
    event: { canonicalEventId: `ufc-${bout.eventProviderId}-${bout.providerBoutId}`, providerBoutId: bout.providerBoutId, providerCardId: bout.eventProviderId, scheduledStartUtc: bout.dateUtc, matchup: `${bout.red} vs ${bout.blue}`, weightClass: bout.weightClass ?? null },
    evidence: [
      { source: `schedule captures (lineage-stable pair, newest ${certainty.capAgeHours}h old)`, asOfIso: nextCapture.generatedAt },
      { source: "fighter strength state (corpus fold)", asOfIso: nextCapture.generatedAt },
      { source: "odds snapshot (authorized)", asOfIso: oddsSnapshot.capturedAt },
    ],
    model,
    market,
    qualification: { cardCertainty: certainty.reason, oddsFresh: true, freshnessBoundHours: oddsFreshnessHours, weighInEvidence: "MISSING by matrix — stability across captures is the only card evidence; stated, not substituted" },
    publicActivation: "OFF",
    settlementLinkage: "PENDING_OFFICIAL_RESULT",
    evaluationEligible: false,
    provenance: `ufc shadow-run v${UFC_SHADOW_VERSION}: ${fit.modelId} (${fit.foldedBouts} corpus bouts folded); market from authorized snapshot ${oddsSnapshot.capturedAt} (${market.bookmakers.length} bookmaker(s), ${market.quarantined.length} refused)`,
  };
  const check = validateShadowRun(artifact);
  if (!check.ok) return { ...base, state: "ABSTAIN", rule: "VALIDATION", reason: `shadow validation refused: ${check.errors.join("; ")}`, publicActivation: "OFF" };
  return { ...base, state: "CURRENT_PRE_EVENT", artifact };
}
