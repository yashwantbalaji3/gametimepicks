/**
 * Lineup-evidence contract — vocabulary + fail-closed classifier (Program 163 · Release B).
 *
 * THE DECISION THIS ENCODES (docs/NBA_LINEUP_SOURCE_EVALUATION.md): no evaluated free source
 * provides an OFFICIAL pre-start NBA lineup. ESPN's box-score starters are REAL and id-carrying —
 * but they materialize at tip-off, which makes them POST_START evidence: settlement-grade for
 * retrospective verification, PERMANENTLY INELIGIBLE for shadow generation. Rather than let that
 * distinction live in prose, this contract makes it executable: every piece of would-be lineup
 * evidence is classified into a closed vocabulary, and shadow eligibility is a function that
 * refuses everything except an explicitly sourced official lineup whose timestamp precedes the
 * scheduled start.
 *
 * The charter's separations, as code: injuries evidence can NEVER satisfy lineups; a roster is
 * not a lineup; a projection is not official; absence is UNKNOWN, never availability.
 */

export const LINEUP_CONTRACT_VERSION = 1;

/** Closed evidence classes. Anything unlisted is UNKNOWN. */
export const LINEUP_EVIDENCE_CLASSES = Object.freeze([
  "OFFICIAL_LINEUP",      // explicitly sourced official pregame lineup — the only shadow-eligible class
  "PROJECTED_LINEUP",     // depth charts, beat projections — research metadata, never official
  "ROSTER",               // team membership — not a lineup at all
  "POST_START_STARTERS",  // box-score starter flags — real, official, and too late by definition
  "INJURY_REPORT",        // availability evidence — a different input; can never satisfy lineups
  "UNKNOWN",              // absent, unparseable, or unclassified — never treated as available
]);

/**
 * Classify one piece of would-be lineup evidence. Pure and total.
 * @param {{ kind?: string, sourceAsOf?: string|null, scheduledStartUtc?: string|null, officialLabel?: boolean }} e
 */
export function classifyLineupEvidence(e) {
  if (!e || typeof e !== "object") return { class: "UNKNOWN", reason: "no evidence supplied — absence is UNKNOWN, never availability" };
  const kind = e.kind ?? "";
  if (kind === "injury_report") return { class: "INJURY_REPORT", reason: "availability evidence is a separate input — injuries can never satisfy lineups" };
  if (kind === "roster") return { class: "ROSTER", reason: "membership is not a lineup" };
  if (kind === "depth_chart" || kind === "projection") return { class: "PROJECTED_LINEUP", reason: "projected, not official — research metadata only" };
  if (kind === "boxscore_starters") return { class: "POST_START_STARTERS", reason: "box-score starters materialize at tip-off — settlement-grade, never pre-start" };
  if (kind === "official_lineup") {
    if (e.officialLabel !== true) return { class: "UNKNOWN", reason: "claims official without an explicit source label — unproven claims classify as UNKNOWN" };
    return { class: "OFFICIAL_LINEUP", reason: "explicitly sourced official pregame lineup" };
  }
  return { class: "UNKNOWN", reason: `unclassified evidence kind "${kind}" — never guessed into a class` };
}

/**
 * The shadow gate: eligible ONLY for OFFICIAL_LINEUP whose sourceAsOf provably precedes the
 * scheduled start. Everything else refuses with the exact reason.
 */
export function lineupShadowEligibility(e) {
  const c = classifyLineupEvidence(e);
  if (c.class !== "OFFICIAL_LINEUP") {
    return { eligible: false, class: c.class, reason: c.reason };
  }
  const asOf = Date.parse(e.sourceAsOf ?? "");
  const start = Date.parse(e.scheduledStartUtc ?? "");
  if (!Number.isFinite(asOf) || !Number.isFinite(start)) {
    return { eligible: false, class: c.class, reason: "official lineup without provable timestamps — temporal evidence is mandatory" };
  }
  if (asOf >= start) {
    return { eligible: false, class: c.class, reason: `sourceAsOf ${e.sourceAsOf} is not before scheduledStart ${e.scheduledStartUtc} — post-start evidence never feeds a pre-event artifact` };
  }
  return { eligible: true, class: c.class, reason: "official and provably pre-start" };
}
