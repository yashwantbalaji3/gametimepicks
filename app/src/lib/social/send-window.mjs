/**
 * SEND WINDOWS. PURE: no I/O, no clock. A post with a printed quote may go out until the earlier of first start and the
 * oldest printed quote plus the sport's maximum age (NFL 12 hours, NBA 6). A post with no quote runs to first start.
 */
import { etLabel, instant, toIso } from "./social-package.mjs";

export const SEND_MAX_AGE_HOURS = Object.freeze({ nfl: 12, nba: 6 });

/** @param {{ sport:string, firstStartUtc:string, quoteTimes?:string[] }} o */
export function sendWindow({ sport, firstStartUtc, quoteTimes = [] }) {
  const start = instant(firstStartUtc);
  const maxAgeHours = SEND_MAX_AGE_HOURS[sport];
  if (!Number.isFinite(start) || !maxAgeHours) throw new Error(`sendWindow: no rule for ${sport} ${firstStartUtc}`);
  const times = quoteTimes.map(instant).filter(Number.isFinite);
  const oldest = times.length ? Math.min(...times) : null;
  const expiry = oldest == null ? Infinity : oldest + maxAgeHours * 3600000;
  const latest = Math.min(start, expiry);
  return { firstStartUtc: toIso(start), quoteTimeUtc: oldest == null ? null : toIso(oldest), maxAgeHours, latestValidSendUtc: toIso(latest), latestValidSendEt: etLabel(latest), governedBy: expiry < start ? "QUOTE_AGE" : "FIRST_START" };
}

/** The post with its window closed at the latest valid send. */
export function withSendWindow(post, quoteTimes) {
  const sw = sendWindow({ sport: post.sport, firstStartUtc: post.firstStartUtc, quoteTimes });
  const closesAt = sw.latestValidSendUtc;
  return { ...post, sendWindow: sw, window: { ...post.window, closesAt }, freshness: { ...post.freshness, expiresAt: closesAt, rule: `valid until first start, at most ${sw.maxAgeHours} hours after the oldest printed quote` } };
}

/** Hours a priced package needs left before its quote expires: the approval window planned for every package (PD, 2026-11-03). */
export const PRICED_MIN_HOURS_LEFT = 3;

/**
 * A priced package rebuilt from an old quote keeps the old deadline (11-02: every re-export still expired 23:25-23:29Z).
 * Returns the hours left when they are fewer than the minimum, else null; the caller refreshes the quote or ships winner-only.
 */
export function shortPricedWindow({ containsMarketData, window }, asOf, minHours = PRICED_MIN_HOURS_LEFT) {
  if (!containsMarketData || !window?.closesAt) return null;
  const left = (Date.parse(window.closesAt) - Date.parse(asOf)) / 3600000;
  return left < minHours ? Math.round(left * 10) / 10 : null;
}
