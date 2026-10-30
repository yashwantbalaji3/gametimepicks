/**
 * NBA NEXT-SLATE PUBLICATION TRIGGER (founder requirement 2026-10-30). PURE, no I/O, no clock other than `now`.
 *
 * "When the final game of an NBA slate finishes, GameTimePicks should automatically prepare and publish qualified
 * official forecasts for the next NBA date … without waiting for the next afternoon's sportsbook odds capture."
 *
 * Until now the official lane (experimental-public/<date>.json) published only once every game of the slate had a
 * frozen v0.1 receipt, and the window built receipts only for games tipping within 8 h — so the whole slate froze
 * in sport-schedules' daily run (14–17Z). This module answers ONE question for nba-forecast-window: may the NEXT ET
 * slate's v0 + v0.1 receipts be frozen for the whole slate now? The lane publish itself is unchanged (once per slate,
 * HOLD until every game is frozen or tipped, never rewritten — experimental-lane-publish.mjs).
 *
 *   target slate D   the earliest America/New_York date ≥ today (ET) that has an active game and in which no active
 *                    game has tipped yet. A slate already under way is not a target (its lane is the normal path's).
 *   lead cap         D must be today (ET) or tomorrow (ET): a slate days away is never frozen early.
 *   trigger (a)      PREVIOUS_SLATE_FINAL — every game of the calendar day before D (ET; a game is on the date its tip
 *                    falls on in America/New_York, so a final after midnight belongs to the previous slate) is final
 *                    (in the write-once finals record, or STATUS_FINAL* in the schedule) or postponed / cancelled /
 *                    suspended. A prior day with no games never satisfies (a): the fallback governs.
 *   trigger (b)      FALLBACK_CLOCK — `now` ≥ D at FALLBACK_ET (06:00 America/New_York; DST-aware). Covers a late
 *                    final, a delayed provider, a postponement the schedule capture has not seen, incomplete results
 *                    reconciliation, no games the prior date, and a skipped workflow (any later tick still fires).
 *   BUILD            a trigger fired and some active, not-yet-tipped game of D lacks a v0 or v0.1 receipt.
 *   FROZEN           a trigger fired and every such game is already frozen in both — nothing to build; the lane
 *                    publish step is still pointed at D.
 *   HOLD             no trigger yet (reason names the pending prior-slate games and the fallback instant).
 *   NONE             no target slate within the lead cap.
 *
 * Input freshness is NOT relaxed here: the builder still refuses a roster older than ROSTER_MAX_AGE_HOURS, an injury
 * snapshot captured after the forecast instant, and every receipt rule (forecast-receipt.mjs). `inputReadiness`
 * describes the inputs the decider can see so a refusal has a clear reason in the log.
 */

import { INACTIVE_STATUSES } from "./experimental-lane-publish.mjs";

/** The fallback wall-clock time on the slate date, America/New_York. Before noon ET with a 6-hour margin. */
export const FALLBACK_ET = "06:00";
export const NEXT_SLATE_TZ = "America/New_York";
/** Lead cap: the target slate may be at most this many ET calendar days after today (ET). */
export const MAX_LEAD_DAYS = 1;

export const NEXT_SLATE = Object.freeze({ BUILD: "BUILD", FROZEN: "FROZEN", HOLD: "HOLD", NONE: "NONE" });
export const TRIGGER = Object.freeze({ PREVIOUS_SLATE_FINAL: "PREVIOUS_SLATE_FINAL", FALLBACK_CLOCK: "FALLBACK_CLOCK" });

const isFinalStatus = (s) => /^STATUS_FINAL/.test(String(s ?? ""));

/** YYYY-MM-DD plus n calendar days (pure date arithmetic, no time zone). */
export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function wallClockIn(tz, ms) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * The UTC instant of a wall-clock time on a date in `tz` (DST-aware: 06:00 ET is 10:00Z under EDT, 11:00Z under EST).
 * Throws for a wall-clock time that does not exist in that zone (the 02:00–03:00 spring-forward gap).
 */
export function zonedWallClockToUtc(date, hhmm, tz = NEXT_SLATE_TZ) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(hhmm)) throw new Error(`bad wall clock ${date} ${hhmm}`);
  const naive = Date.parse(`${date}T${hhmm}:00Z`);
  for (const offsetH of [-4, -5, -3, -6, 0, -7, -8, -10, 1, 2]) {
    const ms = naive - offsetH * 3_600_000;
    if (wallClockIn(tz, ms) === `${date}T${hhmm}`) return new Date(ms).toISOString().replace(/\.000Z$/, "Z");
  }
  throw new Error(`${date} ${hhmm} does not exist in ${tz}`);
}

/**
 * Every game the decider can see, keyed by ET slate date. Schedule rows carry the status as of their capture; the
 * write-once finals record (results/finals-<season>.json `finals`) is authoritative for "final".
 * @returns {Map<string, Map<string, { tipUtc: string, statusRaw: string|null, final: boolean, inactive: boolean }>>}
 */
export function slatesByEtDate({ scheduleRows, finals, etDateOf }) {
  const out = new Map();
  const finalIds = new Set((finals ?? []).map((f) => String(f?.providerEventId ?? "")).filter(Boolean));
  const put = (date, id, row) => {
    if (!out.has(date)) out.set(date, new Map());
    const prev = out.get(date).get(id);
    out.get(date).set(id, prev ? { ...prev, final: prev.final || row.final, inactive: prev.inactive || row.inactive } : row);
  };
  for (const r of scheduleRows ?? []) {
    if (!r?.providerEventId || !Number.isFinite(Date.parse(r?.dateUtc ?? ""))) continue;
    const id = String(r.providerEventId);
    put(etDateOf(r.dateUtc), id, { tipUtc: r.dateUtc, statusRaw: r.statusRaw ?? null, final: finalIds.has(id) || isFinalStatus(r.statusRaw), inactive: INACTIVE_STATUSES.includes(r.statusRaw) });
  }
  for (const f of finals ?? []) {
    if (!f?.providerEventId) continue;
    const date = Number.isFinite(Date.parse(f?.dateUtc ?? "")) ? etDateOf(f.dateUtc) : f.dateEt;
    if (!date) continue;
    put(date, String(f.providerEventId), { tipUtc: f.dateUtc ?? null, statusRaw: f.statusRaw ?? "STATUS_FINAL", final: true, inactive: false });
  }
  return out;
}

/**
 * @param {object} o
 * @param {object[]} o.scheduleRows         app/public/data/nba/schedule/latest.json rows
 * @param {object[]} o.finals               app/public/data/nba/results/finals-<season>.json `finals`
 * @param {(iso: string) => string} o.etDateOf
 * @param {string} o.now                    ISO instant of this tick
 * @param {(date: string) => Set<string>} o.frozenIds  events of `date` frozen in BOTH v0 and v0.1
 * @param {string} [o.fallbackEt]           HH:MM America/New_York
 */
export function decideNextSlate({ scheduleRows, finals = [], etDateOf, now, frozenIds, fallbackEt = FALLBACK_ET }) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("decideNextSlate: now must be ISO");
  const today = etDateOf(now);
  const slates = slatesByEtDate({ scheduleRows, finals, etDateOf });
  const base = { slate: null, trigger: null, fallbackAt: null, previousDate: null, pendingPrevious: [], owed: [] };

  let slate = null;
  for (const date of [...slates.keys()].filter((d) => d >= today).sort()) {
    const active = [...slates.get(date).values()].filter((g) => !g.inactive && !g.final);
    if (!active.length) continue;
    if (active.some((g) => !(Date.parse(g.tipUtc) > nowMs))) continue; // under way: the normal path's slate
    slate = date;
    break;
  }
  if (!slate) return { ...base, action: NEXT_SLATE.NONE, reason: `no upcoming NBA slate on or after ${today} (ET) without a tipped game` };
  if (slate > addDays(today, MAX_LEAD_DAYS)) return { ...base, action: NEXT_SLATE.NONE, slate, reason: `next slate ${slate} is more than ${MAX_LEAD_DAYS} ET day after ${today} — not frozen early` };

  const previousDate = addDays(slate, -1);
  const fallbackAt = zonedWallClockToUtc(slate, fallbackEt);
  const prev = [...(slates.get(previousDate)?.values() ?? [])];
  const prevIds = [...(slates.get(previousDate)?.keys() ?? [])];
  const pendingPrevious = prevIds.filter((id) => { const g = slates.get(previousDate).get(id); return !g.final && !g.inactive; }).sort();
  const finalFired = prev.length > 0 && pendingPrevious.length === 0;
  const clockFired = nowMs >= Date.parse(fallbackAt);
  const ctx = { ...base, slate, fallbackAt, previousDate, pendingPrevious };

  if (!finalFired && !clockFired) {
    const why = prev.length ? `${pendingPrevious.length} game(s) of ${previousDate} not final yet (${pendingPrevious.join(", ")})` : `no games on ${previousDate}`;
    return { ...ctx, action: NEXT_SLATE.HOLD, reason: `${slate}: ${why}; fallback ${fallbackEt} ET = ${fallbackAt}` };
  }
  const trigger = finalFired ? TRIGGER.PREVIOUS_SLATE_FINAL : TRIGGER.FALLBACK_CLOCK;
  const frozen = frozenIds(slate);
  const owed = [...slates.get(slate).entries()]
    .filter(([id, g]) => !g.inactive && !g.final && Date.parse(g.tipUtc) > nowMs && !frozen.has(id))
    .map(([id]) => id).sort();
  const how = finalFired ? `every game of ${previousDate} is final or inactive` : `fallback ${fallbackEt} ET (${fallbackAt}) reached${prev.length ? ` with ${pendingPrevious.length} game(s) of ${previousDate} not final` : ` (no games on ${previousDate})`}`;
  return owed.length
    ? { ...ctx, action: NEXT_SLATE.BUILD, trigger, owed, reason: `${slate}: ${how} — ${owed.length} game(s) to freeze for the whole slate` }
    : { ...ctx, action: NEXT_SLATE.FROZEN, trigger, owed, reason: `${slate}: ${how} — every game already frozen in v0 and v0.1` };
}

/**
 * What the decider can see of the inputs the builder gates on, labelled by the builder's own thresholds. Describes;
 * withholds nothing (the builder is the gate). A roster older than `rosterRecaptureHours` is re-captured by the
 * window's build step before any roster-gated family reads it.
 */
export function inputReadiness({ now, rosterAsOf, injuriesGeneratedAt, scheduleGeneratedAt, rosterMaxAgeHours, rosterRecaptureHours = 30 }) {
  const age = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? Math.round(((Date.parse(now) - t) / 3_600_000) * 10) / 10 : null; };
  const rosterAge = age(rosterAsOf);
  const roster = rosterAge == null ? "MISSING — the build step captures one; v0.1 refuses if that fails"
    : rosterAge > rosterMaxAgeHours ? `STALE (${rosterAge} h > ${rosterMaxAgeHours} h) — the build step re-captures; v0.1 refuses if that fails`
    : rosterAge > rosterRecaptureHours ? `AGEING (${rosterAge} h > ${rosterRecaptureHours} h) — the build step re-captures first`
    : `CURRENT (${rosterAge} h)`;
  const injAge = age(injuriesGeneratedAt);
  const injuries = `captured by the build step at its own instant (committed snapshot ${injAge == null ? "MISSING" : `${injAge} h old`})`;
  const schedAge = age(scheduleGeneratedAt);
  const schedule = schedAge == null ? "MISSING" : `${schedAge} h old`;
  return { roster, injuries, schedule, rosterAgeHours: rosterAge };
}
