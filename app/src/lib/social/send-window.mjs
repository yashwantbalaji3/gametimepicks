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
