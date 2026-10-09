/**
 * NCAAF-005 forward shadow capture — pure pieces (docs/ncaaf/FORWARD_CAPTURE_PROTOCOL.md). PRIVATE_RESEARCH.
 *
 *   pregameRow       a SCHEDULED provider event → a corpus-shaped row without outcomes, or a refusal
 *   marketFromEvent  the provider's pregame line exactly as shown, plus a VERIFIED signed home spread (or null)
 *   receiptPath      the write-once location of one forecast receipt
 *   forecastOfRecord the last receipt captured before kickoff, never one at/after it
 *
 * Everything here describes what was KNOWN AT CAPTURE TIME; nothing is recomputed later.
 */
import { slateDateEt } from "./corpus.mjs";

/** Minimum lead between capture and kickoff for a forecast to be written. */
export const MIN_LEAD_MINUTES = 10;

const divisionOf = (id, m) => (m.fbs.has(id) ? "FBS" : m.fcs.has(id) ? "FCS" : "NON_D1");
const ORDER = { FBS: 0, FCS: 1, NON_D1: 2 };

/**
 * `event` = a normalised espn-events row; `membership` = { fbs:Set, fcs:Set } of provider team ids.
 * → { row } (outcome fields absent) or { refused, eventId }.
 */
export function pregameRow(event, membership, capturedAt) {
  const eventId = event.providerEventId;
  if (event.statusRaw !== "STATUS_SCHEDULED") return { refused: `NOT_SCHEDULED_${event.statusRaw}`, eventId };
  if (event.kickoffTimeKnown !== true) return { refused: "KICKOFF_TIME_TBD", eventId };
  const start = Date.parse(event.startUtc ?? ""), cap = Date.parse(capturedAt);
  if (!Number.isFinite(start)) return { refused: "MISSING_START_TIME", eventId };
  if (!Number.isFinite(cap)) throw new Error("pregameRow: capturedAt must be an ISO instant");
  if (start - cap < MIN_LEAD_MINUTES * 60_000) return { refused: "KICKOFF_TOO_CLOSE_OR_PAST", eventId };
  const hd = divisionOf(event.home.providerTeamId, membership), ad = divisionOf(event.away.providerTeamId, membership);
  return {
    row: {
      eventId, season: event.season, seasonType: event.seasonType, week: event.week, startUtc: event.startUtc,
      slateDate: slateDateEt(event.startUtc),
      homeTeamId: event.home.teamId, awayTeamId: event.away.teamId,
      homeConferenceId: event.home.providerConferenceId, awayConferenceId: event.away.providerConferenceId,
      homeDivision: hd, awayDivision: ad, pairing: [hd, ad].sort((a, b) => ORDER[a] - ORDER[b]).join("-"),
      neutralSite: event.neutralSite, conferenceGame: event.conferenceGame,
    },
  };
}

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * The first provider odds item on a raw scoreboard event, recorded verbatim, plus a signed home spread that is
 * only filled when the text ("ABBR -3.5" / "EVEN") names one of the two teams AND agrees with the numeric
 * field. Disagreement or an unknown abbreviation → homeSpread null with a reason (never guessed).
 * Convention: homeSpread < 0 means the home team is favoured (home −3.5 ⇒ home must win by 4+).
 */
export function marketFromEvent(rawEvent, capturedAt) {
  const comp = rawEvent?.competitions?.[0];
  const o = comp?.odds?.[0];
  if (!o) return null;
  const home = comp.competitors.find((c) => c.homeAway === "home"), away = comp.competitors.find((c) => c.homeAway === "away");
  const ha = home?.team?.abbreviation, aa = away?.team?.abbreviation;
  const details = typeof o.details === "string" ? o.details.trim() : null;
  let homeSpread = null, spreadCheck = "UNPARSED";
  if (details && /^even$/i.test(details)) { homeSpread = 0; spreadCheck = "EVEN"; }
  else if (details) {
    const m = /^(\S+)\s+([+-]?\d+(?:\.\d+)?)$/.exec(details);
    if (m) {
      const line = Number(m[2]);
      if (m[1] === ha) homeSpread = line;
      else if (m[1] === aa) homeSpread = -line;
      else spreadCheck = "ABBREVIATION_MATCHES_NEITHER_TEAM";
      if (homeSpread !== null) {
        const s = num(o.spread);
        // The numeric field must describe the same line, either as the home spread or as its magnitude.
        spreadCheck = s === null ? "TEXT_ONLY" : s === homeSpread ? "AGREES_HOME_SIGNED" : Math.abs(s) === Math.abs(homeSpread) ? "AGREES_MAGNITUDE_ONLY" : "DISAGREES";
        if (spreadCheck === "DISAGREES") homeSpread = null;
      }
    }
  }
  return {
    provider: o.provider?.name ?? null,
    capturedAt,
    details,
    spreadField: num(o.spread),
    overUnder: num(o.overUnder),
    homeMoneyline: num(o.homeTeamOdds?.moneyLine),
    awayMoneyline: num(o.awayTeamOdds?.moneyLine),
    homeFavorite: typeof o.homeTeamOdds?.favorite === "boolean" ? o.homeTeamOdds.favorite : null,
    homeSpread,
    spreadCheck,
  };
}

/** `forecasts/<season>/<slateDate>/<eventId>/<capturedAt compact>.json` */
export function receiptPath(season, slateDate, eventId, capturedAt) {
  const compact = capturedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `forecasts/${season}/${slateDate}/${eventId}/${compact}.json`;
}

/**
 * Forecast of record = the receipt with the latest capturedAt strictly before the kickoff the receipt itself
 * recorded AND before `kickoffUtc` (the final provider start time, if known). A receipt captured at/after
 * either is never of record.
 */
export function forecastOfRecord(receipts, kickoffUtc = null) {
  const k = kickoffUtc ? Date.parse(kickoffUtc) : Infinity;
  const ok = receipts.filter((r) => Date.parse(r.capturedAt) < Date.parse(r.event.startUtcAtCapture) && Date.parse(r.capturedAt) < k);
  return ok.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)).at(-1) ?? null;
}
