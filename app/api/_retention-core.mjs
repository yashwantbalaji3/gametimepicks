/**
 * Analytics retention — which day buckets have outlived the retention window (P256 · Task 4).
 *
 * Pure, so the rule is unit-tested without a store. The collector writes one object per event under
 * `analytics/<YYYY-MM-DD>/<uuid>.json`; a day bucket older than RETENTION_DAYS (founder decision,
 * 2026-09-10: 90 days) is deleted whole. Anything whose path does not parse is KEPT — the job never
 * deletes what it cannot date.
 */
export const RETENTION_DAYS = 90;
export const ANALYTICS_PREFIX = "analytics/";

const DAY = /^analytics\/(\d{4}-\d{2}-\d{2})\/$/;

/** The oldest day bucket still kept, as YYYY-MM-DD (UTC). */
export function retentionCutoff(nowIso, days = RETENTION_DAYS) {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new Error("retentionCutoff: nowIso required");
  return new Date(now - days * 86_400_000).toISOString().slice(0, 10);
}

/** Of the day-bucket folders listed, the ones strictly older than the cutoff. */
export function expiredDayFolders(folders, nowIso, days = RETENTION_DAYS) {
  const cutoff = retentionCutoff(nowIso, days);
  return (folders ?? []).filter((f) => {
    const m = DAY.exec(String(f));
    return m ? m[1] < cutoff : false;
  });
}

/** Only Vercel's own cron may run this: it sends `Authorization: Bearer $CRON_SECRET`. */
export function cronAuthorized(authorizationHeader, secret) {
  return typeof secret === "string" && secret.length >= 16 && authorizationHeader === `Bearer ${secret}`;
}
