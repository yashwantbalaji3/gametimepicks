/**
 * ELIGIBILITY (eligibility@1, PD contract 2026-11-09, ~/gtp-evidence/eligibility-contract-v1.md). PURE: no I/O, no clock.
 * Interim mirror of the shared contract until forecast-guard's module lands at this same path; the rules are the contract's:
 *   R1 a long-term designation (IR, PUP, Suspension, season-ending) persists until an explicit activation signal (the feed
 *      says Active after it); no time-based expiry.
 *   R2 absence from the injury feed is not health: ELIGIBLE only when the roster independently says active.
 *   R3 two sources; when they disagree the answer is UNKNOWN with both stamps.
 *   R4 each source stamp at most 6 h old at build (60 min at approval/send, `maxAgeMinutes`); stale ⇒ UNKNOWN.
 *   R6 Questionable / day-to-day designations stay ELIGIBLE but are never featured (`featurable: false`).
 * Player-featuring products publish ELIGIBLE + featurable only: UNKNOWN fails closed.
 */
export const CONTRACT_VERSION = "eligibility@1";
export const ELIGIBILITY_STATE = Object.freeze({ ELIGIBLE: "ELIGIBLE", INELIGIBLE: "INELIGIBLE", UNKNOWN: "UNKNOWN" });
export const BUILD_MAX_AGE_MINUTES = 360;
export const SEND_MAX_AGE_MINUTES = 60;

const BLOCKING = /^(out|injured reserve|ir\b|pup|physically unable|suspen|inactive|not on roster|released|reserve|did not report|non-football)/i;
const LONG_TERM = /^(injured reserve|ir\b|pup|physically unable|suspen|reserve|non-football|out for season|season)/i;
const FLAGGED = /^(questionable|day-to-day|probable|game-time)/i;
const ACTIVE = /^active$/i;
const S = ELIGIBILITY_STATE;

const ms = (iso) => Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
const stampOf = (doc) => doc?.sourceAsOf ?? doc?.generatedAt ?? null;
const rosterPlayer = (roster, playerId) => {
  for (const t of roster?.teams ?? []) for (const p of t.players ?? []) if (String(p.id) === String(playerId)) return { team: t.teamAbbr ?? null, status: p.status?.type ?? null };
  return null;
};

/**
 * @param {{ sport:string, playerId:string, teamId?:string, asOf:string, injuries:{generatedAt?:string, sourceAsOf?:string, entries:any[]}|null,
 *   roster:{generatedAt?:string, sourceAsOf?:string, teams:any[]}|null, history?:{status:string, statedAt:string}[], maxAgeMinutes?:number }} o
 */
export function resolveEligibility({ sport, playerId, teamId = null, asOf, injuries, roster, history = [], maxAgeMinutes = BUILD_MAX_AGE_MINUTES }) {
  const id = String(playerId);
  const entry = (injuries?.entries ?? []).filter((e) => String(e.athleteId) === id).sort((a, b) => ms(b.statedAt) - ms(a.statedAt))[0] ?? null;
  const onRoster = roster ? rosterPlayer(roster, id) : null;
  const sources = {
    injuries: { status: entry?.status ?? null, statedAt: entry?.statedAt ?? null, fetchedAt: stampOf(injuries) },
    roster: { status: onRoster?.status ?? null, team: onRoster?.team ?? null, fetchedAt: stampOf(roster) },
  };
  const out = (state, reasons, featurable = state === S.ELIGIBLE) => ({ sport, playerId: id, teamId, state, reasons, featurable, sources, contractVersion: CONTRACT_VERSION });
  const reasons = [];
  // R4 freshness first: a stale or missing source can prove nothing either way.
  const at = ms(asOf);
  for (const [k, doc] of [["injuries", injuries], ["roster", roster]]) {
    const t = ms(stampOf(doc));
    if (!doc || !Number.isFinite(t)) reasons.push(`R4_NO_${k.toUpperCase()}_SOURCE`);
    else if (at - t > maxAgeMinutes * 60_000) reasons.push(`R4_STALE_${k.toUpperCase()}`);
  }
  // A blocking designation in the feed wins outright, fresh or not.
  if (entry && BLOCKING.test(entry.status)) return out(S.INELIGIBLE, [`BLOCKING_${entry.status.toUpperCase().replace(/\W+/g, "_")}`, ...reasons]);
  if (roster && Number.isFinite(ms(stampOf(roster))) && !onRoster) return out(S.INELIGIBLE, ["NOT_ON_ROSTER", ...reasons]);
  // R1: the latest long-term designation stands until the feed says Active after it.
  const lastLong = [...history, ...(entry ? [entry] : [])].filter((h) => LONG_TERM.test(h.status)).sort((a, b) => ms(b.statedAt) - ms(a.statedAt))[0];
  if (lastLong && !(entry && ACTIVE.test(entry.status) && ms(entry.statedAt) > ms(lastLong.statedAt))) return out(S.INELIGIBLE, ["R1_LONG_TERM_NOT_CLEARED", ...reasons]);
  if (reasons.length) return out(S.UNKNOWN, reasons);
  const rosterActive = onRoster?.status === "active";
  if (entry && ACTIVE.test(entry.status)) return rosterActive ? out(S.ELIGIBLE, []) : out(S.UNKNOWN, ["R3_SOURCES_DISAGREE"]);
  if (entry && FLAGGED.test(entry.status)) return rosterActive || onRoster?.status === "day-to-day" ? out(S.ELIGIBLE, ["R6_QUESTIONABLE"], false) : out(S.UNKNOWN, ["R3_SOURCES_DISAGREE"]);
  if (entry) return out(S.UNKNOWN, [`UNRECOGNISED_STATUS_${String(entry.status).toUpperCase().replace(/\W+/g, "_")}`]);
  // R2: absent from the feed ⇒ only the roster can say active.
  return rosterActive ? out(S.ELIGIBLE, []) : out(S.UNKNOWN, ["R2_ABSENT_ROSTER_NOT_ACTIVE"]);
}
