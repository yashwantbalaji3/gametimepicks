/**
 * NBA PREGAME ROSTER RECAPTURE — should nba-forecast-window re-capture the NBA roster at this tick? PURE.
 *
 * eligibility@1 (lib/availability/eligibility.mjs) trusts a roster for BUILD_MAX_AGE_HOURS (6 h) at build time; the
 * daily capture (sport-schedules, ~17Z) went stale for every build after ~23Z, so every NBA player read "not verified"
 * (founder 11-11, NBA operations). On a slate day (the next untipped game is on today's ET date) the window
 * re-captures (free ESPN, capture-nba-rosters.mjs) when either
 *   STALE_NOW        the committed capture is already ≥ BUILD_MAX_AGE_HOURS old, or
 *   LAST_TIP_COVER   it would be ≥ BUILD_MAX_AGE_HOURS old by the slate's last tip AND a capture now lasts until that
 *                    tip (the last tip is < BUILD_MAX_AGE_HOURS away) — so one evening capture, at the last dependable
 *                    tick, keeps every pregame build of the slate inside the eligibility window, without a capture
 *                    every hour.
 * The threshold is eligibility@1's own constant, imported, never copied; the age is measured on the timestamp
 * eligibility@1 reads (rosterIndex → generatedAt ?? capturedAt ?? asOf). No other constant.
 */
import { BUILD_MAX_AGE_HOURS, rosterIndex } from "../../availability/eligibility.mjs";
import { etDateOf } from "./finals-record.mjs";

export const RECAPTURE_RULE = "nba-roster-pregame-recapture@1";
const H = 3_600_000;
const DONE = /FINAL|POSTPONED|CANCELED|CANCELLED|SUSPENDED/i;

/** The slate in progress: its ET date and last tip, from the next untipped game; null when none is on today's ET date. */
export function slateInProgress(scheduleRows, now) {
  const nowMs = Date.parse(now);
  const upcoming = (scheduleRows ?? []).filter((r) => Number.isFinite(Date.parse(r?.dateUtc)) && Date.parse(r.dateUtc) > nowMs && !DONE.test(String(r.statusRaw ?? "")));
  if (!upcoming.length) return null;
  const first = upcoming.reduce((a, b) => (Date.parse(b.dateUtc) < Date.parse(a.dateUtc) ? b : a));
  const date = etDateOf(first.dateUtc);
  if (date !== etDateOf(now)) return null;
  const lastTipUtc = upcoming.filter((r) => etDateOf(r.dateUtc) === date).map((r) => r.dateUtc).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1);
  return { date, lastTipUtc };
}

/** { due, reason, ageHours, maxAgeHours, slate } for the committed capture at `now`. */
export function rosterRecaptureDecision({ roster, now, scheduleRows }) {
  const nowMs = Date.parse(now ?? "");
  if (!Number.isFinite(nowMs)) throw new Error("rosterRecaptureDecision: now (ISO) required");
  const base = { maxAgeHours: BUILD_MAX_AGE_HOURS, rule: RECAPTURE_RULE };
  const slate = slateInProgress(scheduleRows, now);
  const t = Date.parse(rosterIndex(roster)?.fetchedAt ?? "");
  const ageHours = Number.isFinite(t) ? (nowMs - t) / H : null;
  if (!slate) return { ...base, due: false, reason: "NOT_A_SLATE_DAY", ageHours, slate };
  if (ageHours == null) return { ...base, due: true, reason: "NO_CAPTURE", ageHours, slate };
  if (ageHours < 0) return { ...base, due: false, reason: "CAPTURE_AFTER_NOW", ageHours, slate };
  if (ageHours >= BUILD_MAX_AGE_HOURS) return { ...base, due: true, reason: "STALE_NOW", ageHours, slate };
  const toLastTip = (Date.parse(slate.lastTipUtc) - nowMs) / H;
  if (ageHours + toLastTip >= BUILD_MAX_AGE_HOURS && toLastTip < BUILD_MAX_AGE_HOURS) return { ...base, due: true, reason: "LAST_TIP_COVER", ageHours, slate };
  return { ...base, due: false, reason: "FRESH", ageHours, slate };
}
