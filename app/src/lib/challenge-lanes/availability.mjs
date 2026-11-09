/**
 * CHALLENGE LANES · LEG AVAILABILITY (eligibility contract v1, ~/gtp-evidence/eligibility-contract-v1.md). PURE.
 * One fail-closed rule shared by step-search.mjs and levels.mjs: a player leg is a basis only when its availability
 * record says ELIGIBLE from fresh sources. A missing record, a missing or stale stamp, or disagreeing sources is UNKNOWN,
 * and UNKNOWN is not eligible.
 *
 * Until app/src/lib/availability/eligibility.mjs (resolveEligibility, contractVersion "eligibility@1") lands on main,
 * mirrorEligibility mirrors its rules R2 (absence is not health), R3 (two sources), R4 (freshness) and R6 (questionable
 * excluded from legs); R1 (long-term persistence) needs designation history and is the shared module's job.
 * R5: an NFL leg whose game forecast is BLIND_TO_STARTING_QB_ABSENCE is not a leg basis.
 */
export const CONTRACT_VERSION = "eligibility@1";
export const MIRROR_VERSION = "eligibility@1-mirror";
export const MAX_SOURCE_AGE_MS = 6 * 60 * 60 * 1000;
const BLOCKING = /^(OUT|INJURED_RESERVE|IR|PUP|SUSPENSION|SUSPENDED|INACTIVE|DOUBTFUL|NOT_ON_ROSTER|RELEASED)$/;
const QUESTIONABLE = /^(QUESTIONABLE|DAY_TO_DAY|GAME_TIME_DECISION)$/;
const norm = (s) => (s == null ? null : String(s).toUpperCase().replace(/[- ]/g, "_"));
const fresh = (at, asOf, maxAgeMs) => at != null && Number.isFinite(Date.parse(at)) && Date.parse(asOf) - Date.parse(at) <= maxAgeMs && Date.parse(at) <= Date.parse(asOf) + 60_000;

/**
 * @param {{ injuryStatus: string|null, injuriesFetchedAt: string|null, rosterStatus: string|null, rosterFetchedAt: string|null, asOf: string }} p
 *   injuryStatus null = the player is absent from a feed that was fetched at injuriesFetchedAt.
 *   rosterStatus: the roster feed's status for the player ("active", "day-to-day", "released", …); null = no roster record.
 */
export function mirrorEligibility({ injuryStatus = null, injuriesFetchedAt = null, rosterStatus = null, rosterFetchedAt = null, asOf, maxAgeMs = MAX_SOURCE_AGE_MS }) {
  const inj = norm(injuryStatus); const ros = norm(rosterStatus); const reasons = [];
  const sources = { injuries: { status: injuryStatus, fetchedAt: injuriesFetchedAt }, roster: { status: rosterStatus, fetchedAt: rosterFetchedAt } };
  const out = (state) => ({ state, reasons, sources, contractVersion: MIRROR_VERSION });
  if (!fresh(injuriesFetchedAt, asOf, maxAgeMs)) reasons.push("R4_INJURIES_STALE_OR_MISSING");
  if (!fresh(rosterFetchedAt, asOf, maxAgeMs)) reasons.push("R4_ROSTER_STALE_OR_MISSING");
  if (inj && BLOCKING.test(inj)) { reasons.push(`BLOCKING_DESIGNATION ${inj}`); return out("INELIGIBLE"); }
  if (ros && /^(RELEASED|NOT_ON_ROSTER|INACTIVE|SUSPENDED|INJURED_RESERVE|OUT)$/.test(ros)) { reasons.push(`ROSTER ${ros}`); return out("INELIGIBLE"); }
  if (reasons.length) return out("UNKNOWN");
  if (ros == null) { reasons.push("R2_NO_ROSTER_RECORD"); return out("UNKNOWN"); }
  if (ros !== "ACTIVE") { reasons.push(inj === "ACTIVE" ? `R3_SOURCES_DISAGREE injuries ACTIVE vs roster ${ros}` : `ROSTER ${ros}`); return out(inj === "ACTIVE" ? "UNKNOWN" : "INELIGIBLE"); }
  if (inj && QUESTIONABLE.test(inj)) { reasons.push(`R6_QUESTIONABLE ${inj}`); return out("ELIGIBLE"); }
  if (inj && !/^(ACTIVE|PROBABLE)$/.test(inj)) { reasons.push(`UNRECOGNISED_STATUS ${inj}`); return out("UNKNOWN"); }
  return out("ELIGIBLE");
}

/**
 * The one leg rule. Returns refusal strings (empty = the leg may be a basis).
 * leg.availability: { state, reasons?, sources:{ injuries:{fetchedAt}, roster:{fetchedAt} }, contractVersion } from
 * resolveEligibility (eligibility@1) or mirrorEligibility. leg.teamInputs?.state: the game forecast's team-inputs state.
 */
export function legBasisRefusals(leg, { now, maxAgeMs = MAX_SOURCE_AGE_MS } = {}) {
  const key = leg.legId ?? leg.key ?? "leg"; const r = [];
  if (leg.sport === "nfl" && (leg.teamInputs?.state === "BLIND_TO_STARTING_QB_ABSENCE" || leg.forecastFlags?.includes?.("BLIND_TO_STARTING_QB_ABSENCE")))
    r.push(`R5_QB_BLIND_FORECAST ${key}: game forecast is BLIND_TO_STARTING_QB_ABSENCE; not a leg basis`);
  if (leg.family === "winner") return r;
  const a = leg.availability;
  if (!a || ![CONTRACT_VERSION, MIRROR_VERSION].includes(a.contractVersion)) { r.push(`C_AVAILABILITY_UNKNOWN ${key}: no eligibility@1 record`); return r; }
  if (a.state !== "ELIGIBLE") { r.push(`C_AVAILABILITY_${a.state === "INELIGIBLE" ? "INELIGIBLE" : "UNKNOWN"} ${key}: ${(a.reasons ?? []).join("; ") || a.state}`); return r; }
  const s = a.sources ?? {};
  if (!fresh(s.injuries?.fetchedAt, now, maxAgeMs) || !fresh(s.roster?.fetchedAt, now, maxAgeMs)) r.push(`C_AVAILABILITY_UNKNOWN ${key}: source stamp stale or missing at ${now}`);
  if ((a.reasons ?? []).some((x) => String(x).startsWith("R6_"))) r.push(`C_AVAILABILITY_QUESTIONABLE ${key}: ${a.reasons.join("; ")}; excluded from legs unless confirmed active`);
  return r;
}
