/**
 * LIVE HUB V2 — FOUNDATION (shared, sport-agnostic view model). PURE: no I/O, no clock unless passed in.
 *
 * Founder directive (2026-10-14): one professional live experience across Football, Basketball, Baseball,
 * Soccer and MMA, built as reusable interface architecture BEFORE any new data-dependent behaviour is switched
 * on. This module is that architecture's contract. It does not fetch, does not decide lifecycle (the existing
 * owner `lib/live/lifecycle.mjs` does) and does not track forecasts (the existing owner
 * `lib/live/featured-forecasts.mjs` does). It translates their answers into one view every sport shares.
 *
 * THE RULES IT ENFORCES
 *   - A sport is TRACKED only when a validated adapter exists AND its rollout flag is on. Today that is NFL and
 *     MLB (ESPN / MLB StatsAPI gateways). NBA, soccer and UFC have no validated live adapter: their events are
 *     DATA_UNAVAILABLE for live state and never shown as tracked.
 *   - Progress text is built only from fields the feed actually supplied. Missing fields → null, never a guess.
 *   - A final is FINAL_PROVISIONAL until canonical settlement exists (FINAL_CANONICAL). Postponed and cancelled
 *     never become finals.
 *   - Top forecasts are never padded: if two qualify, two are returned.
 *   - Nothing here can change a frozen pregame forecast; it only reads the values it is handed.
 */

/** The eight states the founder directive names, in the reader's order of urgency. */
export const LIVE_V2_STATUS = Object.freeze({
  PREGAME: "PREGAME",
  LIVE: "LIVE",
  DELAYED: "DELAYED",
  FINAL_PROVISIONAL: "FINAL_PROVISIONAL",
  FINAL_CANONICAL: "FINAL_CANONICAL",
  POSTPONED: "POSTPONED",
  CANCELLED: "CANCELLED",
  DATA_UNAVAILABLE: "DATA_UNAVAILABLE",
});

export const LIVE_V2_LABEL = Object.freeze({
  PREGAME: "Upcoming",
  LIVE: "Live",
  DELAYED: "Live · feed delayed",
  FINAL_PROVISIONAL: "Final · grading pending",
  FINAL_CANONICAL: "Final",
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
  DATA_UNAVAILABLE: "Live data unavailable",
});

/**
 * Lifecycle owner state (lib/live/lifecycle.mjs `derivePresentationState().state`) → V2 status.
 * An unknown or refused feed is DATA_UNAVAILABLE — never PREGAME, which would claim the event has not started.
 */
export function statusFromLifecycle(state) {
  switch (state) {
    case "PRE": return LIVE_V2_STATUS.PREGAME;
    case "LIVE": return LIVE_V2_STATUS.LIVE;
    case "DELAYED": return LIVE_V2_STATUS.DELAYED;
    case "FINAL_PENDING_SETTLEMENT": return LIVE_V2_STATUS.FINAL_PROVISIONAL;
    case "SETTLED": return LIVE_V2_STATUS.FINAL_CANONICAL;
    case "POSTPONED": return LIVE_V2_STATUS.POSTPONED;
    case "CANCELLED": return LIVE_V2_STATUS.CANCELLED;
    default: return LIVE_V2_STATUS.DATA_UNAVAILABLE;
  }
}

/**
 * What each sport's live path can VERIFY today. `adapter` names the gateway that exists; `fields` are the only
 * progress fields that adapter supplies. A sport with `adapter: null` is never tracked live, whatever its flag.
 */
export const LIVE_V2_CAPABILITY = Object.freeze({
  nfl: { label: "Football · NFL", adapter: "espn-nfl", fields: ["quarter", "clock", "score"], reason: null },
  mlb: { label: "Baseball · MLB", adapter: "mlb-statsapi", fields: ["inning", "half", "outs", "score"], reason: null },
  nba: { label: "Basketball · NBA", adapter: null, fields: [], reason: "No validated NBA live feed yet — schedule only." },
  soccer: { label: "Soccer · Premier League", adapter: null, fields: [], reason: "No validated soccer live feed yet — fixtures and pregame forecasts only." },
  ufc: { label: "MMA · UFC", adapter: null, fields: [], reason: "UFC live tracking stays off until it is validated on real cards." },
});

/** Is this sport tracked live right now? Needs an adapter AND the rollout flag (passed in by the caller). */
export function isTracked(sport, flagOn) {
  return Boolean(LIVE_V2_CAPABILITY[sport]?.adapter) && flagOn === true;
}

/**
 * The status a reader may be shown. An untracked sport cannot be LIVE, DELAYED or a provisional final on this
 * site — we have no validated feed saying so — so those become DATA_UNAVAILABLE. Schedule facts (PREGAME),
 * postponements/cancellations and canonical finals come from schedules and official results, not the live
 * feed, so they stand. Grouping and the card both read this, so they cannot disagree.
 */
export function effectiveStatus(status, tracked) {
  if (tracked) return status;
  return status === LIVE_V2_STATUS.PREGAME || status === LIVE_V2_STATUS.POSTPONED || status === LIVE_V2_STATUS.CANCELLED || status === LIVE_V2_STATUS.FINAL_CANONICAL
    ? status : LIVE_V2_STATUS.DATA_UNAVAILABLE;
}

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const posInt = (v) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The progress line for an event IN PROGRESS, from verified fields only. Returns null when the event is not
 * live, the sport is not tracked, or the fields are absent — the card then shows nothing rather than a guess.
 *
 * @param {string} sport  nfl | nba | mlb | soccer | ufc
 * @param {object|null} p  { quarter, clock, inning, half: "top"|"bottom", outs, minute, phase, round }
 * @param {string} status  a LIVE_V2_STATUS
 */
export function progressLine(sport, p, status) {
  if (status !== LIVE_V2_STATUS.LIVE && status !== LIVE_V2_STATUS.DELAYED) return null;
  if (!p) return null;
  switch (sport) {
    case "nfl":
    case "nba": {
      const q = posInt(p.quarter), c = str(p.clock);
      if (q && c) return `${q > 4 ? (q === 5 ? "OT" : `${q - 4}OT`) : `Q${q}`} · ${c}`;
      return str(p.label);
    }
    case "mlb": {
      const i = posInt(p.inning);
      const h = p.half === "top" ? "Top" : p.half === "bottom" ? "Bottom" : null;
      if (!i || !h) return null;
      const outs = Number.isInteger(p.outs) && p.outs >= 0 && p.outs <= 3 ? ` · ${p.outs} out${p.outs === 1 ? "" : "s"}` : "";
      return `${h} ${ordinal(i)}${outs}`;
    }
    case "soccer": {
      if (p.phase === "HALFTIME") return "Half-time";
      const m = posInt(p.minute);
      return m ? `${m}'` : null;
    }
    case "ufc": {
      const r = posInt(p.round);
      return r ? `Round ${r}` : null;
    }
    default:
      return null;
  }
}

/** UFC result line — only from OFFICIAL fields; a method is printed only when the official source names one. */
export function ufcResultLine(result) {
  const winner = str(result?.winner);
  if (!winner || result?.official !== true) return null;
  const method = str(result.method);
  const round = posInt(result.round);
  return [`${winner} won`, method, round ? `R${round}` : null].filter(Boolean).join(" · ");
}

const startMs = (e) => { const v = Date.parse(e?.startUtc ?? ""); return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY; };
const isFinalStatus = (s) => s === LIVE_V2_STATUS.FINAL_PROVISIONAL || s === LIVE_V2_STATUS.FINAL_CANONICAL;

export const LIVE_V2_GROUP = Object.freeze(["Live now", "Upcoming", "Recently finished", "Earlier finals", "Postponed or cancelled", "Live data unavailable"]);

/** Which reading-order bucket an event belongs to (index into LIVE_V2_GROUP). */
export function bucketOf(e, nowMs, { recentHours = 24 } = {}) {
  if (e.status === LIVE_V2_STATUS.LIVE || e.status === LIVE_V2_STATUS.DELAYED) return 0;
  if (e.status === LIVE_V2_STATUS.PREGAME) return 1;
  if (isFinalStatus(e.status)) return Number.isFinite(startMs(e)) && nowMs - startMs(e) <= recentHours * 3_600_000 ? 2 : 3;
  if (e.status === LIVE_V2_STATUS.POSTPONED || e.status === LIVE_V2_STATUS.CANCELLED) return 4;
  return 5;
}

/**
 * The reading order: live now → upcoming (soonest first) → recently finished (newest first, within
 * `recentHours`) → earlier finals → postponed/cancelled → unavailable. Stable; pure; `nowMs` is passed in.
 */
export function orderEvents(events, nowMs, opts) {
  return (events ?? [])
    .map((e, i) => ({ e, i, b: bucketOf(e, nowMs, opts) }))
    .sort((a, b) => a.b - b.b
      || (a.b === 1 ? startMs(a.e) - startMs(b.e) : a.b === 2 || a.b === 3 ? startMs(b.e) - startMs(a.e) : 0)
      || a.i - b.i)
    .map((x) => x.e);
}

/** Events grouped in reading order: [{ label, events }] with empty groups omitted. */
export function groupEvents(events, nowMs, opts) {
  const groups = LIVE_V2_GROUP.map((label) => ({ label, events: [] }));
  for (const e of orderEvents(events, nowMs, opts)) groups[bucketOf(e, nowMs, opts)].events.push(e);
  return groups.filter((g) => g.events.length > 0);
}

/**
 * Frozen-line progress for ONE forecast against verified live data.
 *
 *   over  — "needs N more" while live; reached when current clears the line.
 *   under — never "won" before the end: it can only be "on track" (room left) or "over the line".
 *
 * `current: null` (not verified) → status "NOT_MEASURED" and no remaining figure — never a computed guess.
 * The frozen `line` is read, never altered.
 */
export function forecastProgress({ line, side, current, status }) {
  const finalish = status === LIVE_V2_STATUS.FINAL_PROVISIONAL || status === LIVE_V2_STATUS.FINAL_CANONICAL;
  if (typeof line !== "number" || !Number.isFinite(line) || (side !== "over" && side !== "under")) return { state: "NO_LINE", remaining: null };
  if (typeof current !== "number" || !Number.isFinite(current)) return { state: "NOT_MEASURED", remaining: null };
  const clear = Math.floor(line) + 1; // the smallest whole value strictly above the line
  if (side === "over") {
    if (current >= clear) return { state: finalish ? (status === LIVE_V2_STATUS.FINAL_CANONICAL ? "SETTLED_HIT" : "REACHED_AWAITING_SETTLEMENT") : "REACHED_AWAITING_SETTLEMENT", remaining: 0 };
    if (finalish) return { state: status === LIVE_V2_STATUS.FINAL_CANONICAL ? "SETTLED_MISS" : "FINAL_SHORT_AWAITING_SETTLEMENT", remaining: clear - current };
    return { state: "IN_PROGRESS", remaining: clear - current };
  }
  // under: the outcome is only known at the end.
  if (current > line) return { state: finalish && status === LIVE_V2_STATUS.FINAL_CANONICAL ? "SETTLED_MISS" : "OVER_THE_LINE", remaining: null };
  if (finalish) return { state: status === LIVE_V2_STATUS.FINAL_CANONICAL ? "SETTLED_HIT" : "UNDER_AT_FINAL_AWAITING_SETTLEMENT", remaining: null };
  return { state: "ON_TRACK_UNTIL_FINAL", remaining: null, room: Math.floor(line) - current };
}

/** Up to `max` qualifying forecasts, in the order given. Never padded; [] means "show the empty state". */
export function topForecasts(rows, { max = 5, qualifies = () => true } = {}) {
  return (Array.isArray(rows) ? rows : []).filter(qualifies).slice(0, Math.max(0, max));
}
