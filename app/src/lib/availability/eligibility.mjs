/**
 * ELIGIBILITY CONTRACT v1 (`eligibility@1`; PD 2026-11-09, ~/gtp-evidence/eligibility-contract-v1.md). PURE, no I/O.
 *
 * WHY. INC-2026-11-08-01: De'Von Achane, on season-ending Injured Reserve since 2026-09-28, was published as an anytime-TD
 * candidate on 11-08. ESPN's injuries feed is a capped rolling list; the 336 h carry let his IR lapse on 10-12, and every
 * consumer read "absent from the feed" as "available". The roster capture still said "day-to-day" and nothing read it.
 *
 * ONE ANSWER per (player, team, instant) from TWO sources — the injuries capture and the roster capture:
 *   ELIGIBLE    positive evidence: no blocking designation (or an explicit "Active") AND on the team's active roster
 *   INELIGIBLE  a blocking designation (Out, IR, Suspension; Doubtful for a starter), a long-term designation not yet
 *               cleared, or not on the team's freshly captured roster (released / waived)
 *   UNKNOWN     a missing record, a stale source, or sources that disagree — NOT publishable (fail closed)
 *
 * RULES (contract numbering):
 *   R1 a long-term designation (IR, Suspension) holds until an explicit activation: the feed lists the player again, or —
 *      only for a CARRIED designation the feed no longer lists — a roster capture after the designation says "active".
 *      A designation the feed currently lists is never overruled by the roster: ESPN rosters say "active" for most Out
 *      players (181 of 189 on 2026-11-09).
 *   R2 absence from the injuries feed is not health: it is ELIGIBLE only when the roster independently says active.
 *   R3 the sources disagree ⇒ UNKNOWN, with both stamps recorded.
 *   R4 each source stamp at most `maxAgeHours` old at `asOf` (6 h at build; callers pass 1 at approval/send), and never
 *      stamped after `asOf`. Stale ⇒ UNKNOWN. Positive evidence of ineligibility still wins: an Out is never softened.
 *   R6 Questionable / Doubtful / Day-To-Day: not blocked, flagged QUESTIONABLE (featured products exclude flagged rows).
 *   R3a (founder 2026-11-09, decision 1): a FRESH injuries feed that explicitly says "Active" while the roster says
 *      "day-to-day" is modelled internally (ELIGIBLE) with the disagreement recorded as the SOURCES_DISAGREE flag, and is
 *      never FEATURED (Top Boards, recommended parlays, Bank Builder / Moonshot, social) until the sources agree.
 *      Every other disagreement (practice squad, news, …) stays UNKNOWN.
 *   R7 marketSignal(): a featured player with no sportsbook market where peers have one ⇒ MARKET_ABSENT.
 *   (R5, starters vs QB-blind team forecasts, is a game-level rule for the publishing side; `starter` here only makes a
 *   Doubtful starter INELIGIBLE.)
 *
 * Every consumer records { state, contractVersion, sources } beside its output so approval/send can re-resolve against
 * fresh sources and compare.
 */
import { isBlockingStatus, isLongTermStatus } from "../sports/injuries/contract.mjs";
import { activationAfter } from "./transactions.mjs";

export const CONTRACT_VERSION = "eligibility@1";
export const ELIGIBILITY_STATES = Object.freeze(["ELIGIBLE", "INELIGIBLE", "UNKNOWN"]);
/** R4: the build-time freshness window. Approval / send pass SEND_MAX_AGE_HOURS. */
export const BUILD_MAX_AGE_HOURS = 6;
export const SEND_MAX_AGE_HOURS = 1;

const QUESTIONABLE = /^(questionable|doubtful|day-to-day)$/i;
const DOUBTFUL = /^doubtful$/i;
const ms = (iso) => { const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")); return Number.isFinite(t) ? t : null; };

/** A roster capture in either shape (NFL public capture, NBA research capture), reduced to what the contract reads. */
export function rosterIndex(roster) {
  if (!roster || !Array.isArray(roster.teams)) return null;
  const fetchedAt = roster.generatedAt ?? roster.capturedAt ?? roster.asOf ?? null;
  const teams = new Set();
  const players = new Map();
  for (const t of roster.teams) {
    const teamId = t?.providerTeamId != null ? String(t.providerTeamId) : null;
    if (!teamId || (t.state && t.state !== "CAPTURED") || !Array.isArray(t.players)) continue;
    teams.add(teamId);
    for (const p of t.players) {
      const id = p?.id ?? p?.providerAthleteId;
      if (id == null) continue;
      const type = p?.status?.type ?? p?.rosterStatusType ?? null;
      players.set(String(id), { teamId, status: typeof type === "string" ? type.toLowerCase() : null });
    }
  }
  return { fetchedAt, teams, players };
}

/**
 * @param {{ sport?: "nfl"|"nba", playerId: string|number, teamId?: string|number|null, asOf: string,
 *   injuries: { generatedAt: string, entries: object[] } | null, roster: object | null,
 *   maxAgeHours?: number, starter?: boolean }} a
 * @returns {{ state: "ELIGIBLE"|"INELIGIBLE"|"UNKNOWN", reasons: string[], flags: string[],
 *   sources: { injuries: { status: string|null, statedAt: string|null, fetchedAt: string|null }, roster: { status: string|null, fetchedAt: string|null } },
 *   contractVersion: string }}
 */
export function resolveEligibility({ sport = "nfl", playerId, teamId = null, asOf, injuries, roster, maxAgeHours = BUILD_MAX_AGE_HOURS, starter = false, activations = [] }) {
  const at = ms(asOf);
  if (at == null) throw new TypeError("resolveEligibility: asOf must be an ISO instant");
  const id = String(playerId ?? "").replace(/^nfl-athlete-/, "");
  const team = teamId == null ? null : String(teamId);
  const reasons = [];
  const flags = [];
  const unknown = [];

  // ── the two sources and their stamps (R4) ──
  const injAt = injuries?.generatedAt ?? null;
  const entries = Array.isArray(injuries?.entries) ? injuries.entries : null;
  const entry = entries ? entries.filter((e) => String(e?.athleteId) === id).sort((a, b) => (ms(b.statedAt) ?? 0) - (ms(a.statedAt) ?? 0))[0] ?? null : null;
  const ros = rosterIndex(roster);
  const rec = ros?.players.get(id) ?? null;
  const sources = {
    injuries: { status: entry?.status ?? null, statedAt: entry?.statedAt ?? null, fetchedAt: injAt },
    roster: { status: rec?.status ?? null, fetchedAt: ros?.fetchedAt ?? null },
  };
  const fresh = (stamp) => { const t = ms(stamp); return t != null && t <= at && at - t <= maxAgeHours * 3.6e6; };
  if (!entries) unknown.push("INJURIES_SOURCE_MISSING");
  else if (!fresh(injAt)) unknown.push("INJURIES_STALE");
  if (!ros) unknown.push("ROSTER_SOURCE_MISSING");
  else if (!fresh(ros.fetchedAt)) unknown.push("ROSTER_STALE");

  const done = (state) => ({ state, reasons: [...new Set(reasons)], flags, sources, contractVersion: CONTRACT_VERSION });

  // ── designations (R1, blocking, R6) — positive evidence of ineligibility wins over every unknown ──
  let status = entry?.status ?? null;
  if (status && isLongTermStatus(status, sport)) {
    const activated = entry.carriedForward === true && rec?.status === "active" && (!team || rec.teamId === team)
      && ms(entry.statedAt) != null && ms(ros?.fetchedAt) > ms(entry.statedAt) && fresh(ros.fetchedAt);
    // founder decision 4: a verified transaction activation dated after the designation (and at or before asOf) ends it
    const tx = entry.carriedForward === true ? activationAfter((activations ?? []).filter((a) => ms(a.date) != null && ms(a.date) <= at), id, entry.statedAt) : null;
    if (!activated && !tx) { reasons.push("LONG_TERM_DESIGNATION"); return done("INELIGIBLE"); }
    reasons.push(activated ? "ACTIVATED_BY_ROSTER" : "ACTIVATED_BY_TRANSACTION");
    status = null; // the designation has ended: from here the player is judged as one the feed does not list (R2)
  } else if (status && isBlockingStatus(status, sport)) {
    reasons.push("BLOCKING_DESIGNATION");
    return done("INELIGIBLE");
  } else if (status && QUESTIONABLE.test(status)) {
    if (starter && DOUBTFUL.test(status)) { reasons.push("DOUBTFUL_STARTER"); return done("INELIGIBLE"); }
    flags.push("QUESTIONABLE");
  }

  // ── the roster (R2 / R3) ──
  if (ros && team && ros.teams.has(team) && !rec && fresh(ros.fetchedAt)) { reasons.push("NOT_ON_ROSTER"); return done("INELIGIBLE"); }
  if (unknown.length) { reasons.push(...unknown); return done("UNKNOWN"); }
  if (!rec) { reasons.push("NO_ROSTER_RECORD"); return done("UNKNOWN"); }
  if (team && rec.teamId !== team) { reasons.push("ROSTER_TEAM_MISMATCH"); return done("UNKNOWN"); }
  const questionable = flags.includes("QUESTIONABLE");
  if (status && /^active$/i.test(status) && rec.status === "day-to-day") {
    reasons.push("FEED_ACTIVE_ROSTER_DAY_TO_DAY");
    flags.push("SOURCES_DISAGREE");
    return done("ELIGIBLE");
  }
  if (rec.status === "active" || (questionable && rec.status === "day-to-day")) {
    if (!status && !reasons.length) reasons.push("ROSTER_ACTIVE");
    return done("ELIGIBLE");
  }
  reasons.push(status ? "SOURCES_DISAGREE" : "ROSTER_NOT_ACTIVE");
  return done("UNKNOWN");
}

/**
 * R5 (game level): a forecast whose team model is blind to a starting quarterback's absence (team-input-coherence.mjs,
 * teamInputs.state BLIND_TO_STARTING_QB_ABSENCE) is not publishable as a social post or a challenge-leg basis; a game with
 * no team-input record is unknown, and unknown is not publishable either (JAX @ BAL, BUF @ MIN, 2026-11).
 * @param {{ teamInputs: { state: string } | null | undefined }} forecast
 */
export function gameEligibility(forecast) {
  const state = forecast?.teamInputs?.state ?? null;
  if (state === "BLIND_TO_STARTING_QB_ABSENCE") return { publishable: false, reasons: ["R5_QB_BLIND"], contractVersion: CONTRACT_VERSION };
  if (state == null || state === "UNKNOWN") return { publishable: false, reasons: ["R5_TEAM_INPUTS_UNKNOWN"], contractVersion: CONTRACT_VERSION };
  return { publishable: true, reasons: [], contractVersion: CONTRACT_VERSION };
}

/**
 * Flags that keep an ELIGIBLE player off every FEATURED surface (Top Boards, recommended parlays, Bank Builder / Moonshot,
 * social) while he is still modelled: R6 and the founder's R3a disagreement.
 */
export const NOT_FEATURABLE_FLAGS = Object.freeze(["QUESTIONABLE", "SOURCES_DISAGREE"]);
/** May a surface FEATURE this player? Only an ELIGIBLE record with none of the not-featurable flags. */
export const featurable = (record) => record?.state === "ELIGIBLE" && !(record.flags ?? []).some((f) => NOT_FEATURABLE_FLAGS.includes(f));

/** R7: the market signal for a featured player. */
export function marketSignal({ playerHasMarket, peersWithMarket = 0 }) {
  return !playerHasMarket && peersWithMarket > 0 ? ["MARKET_ABSENT"] : [];
}

/** Reader words for each state and reason — a public page prints these, never the codes. */
export const ELIGIBILITY_STATE_TEXT = Object.freeze({ ELIGIBLE: "cleared to play", INELIGIBLE: "not eligible to play", UNKNOWN: "availability not confirmed" });
export const ELIGIBILITY_REASON_TEXT = Object.freeze({
  LONG_TERM_DESIGNATION: "on injured reserve or suspended, with no activation since",
  BLOCKING_DESIGNATION: "ruled out on the injury report",
  DOUBTFUL_STARTER: "a starter listed doubtful",
  NOT_ON_ROSTER: "no longer on the team's roster",
  ACTIVATED_BY_ROSTER: "activated on the roster",
  ACTIVATED_BY_TRANSACTION: "activated or reinstated in a recorded transaction",
  ROSTER_ACTIVE: "on the active roster",
  INJURIES_SOURCE_MISSING: "no injury report on record",
  INJURIES_STALE: "the injury report is out of date",
  ROSTER_SOURCE_MISSING: "no roster on record",
  ROSTER_STALE: "the roster is out of date",
  NO_ROSTER_RECORD: "not on any captured roster",
  ROSTER_TEAM_MISMATCH: "listed on another team's roster",
  SOURCES_DISAGREE: "the injury report and the roster disagree",
  FEED_ACTIVE_ROSTER_DAY_TO_DAY: "listed active on the injury report but day-to-day on the roster — modelled, not featured until they agree",
  ROSTER_NOT_ACTIVE: "not on the active roster (practice squad or injury list)",
});
/** One plain sentence for a resolution: "availability not confirmed: the injury report and the roster disagree". */
export const eligibilityText = (r) => `${ELIGIBILITY_STATE_TEXT[r.state] ?? "availability not confirmed"}${r.reasons?.length ? `: ${r.reasons.map((c) => ELIGIBILITY_REASON_TEXT[c] ?? "unconfirmed").join("; ")}` : ""}`;

/** The compact record every consumer stores beside its output. */
export const eligibilityRecord = (r) => ({ state: r.state, reasons: r.reasons, ...(r.flags?.length ? { flags: r.flags } : {}), contractVersion: r.contractVersion, sources: r.sources });
