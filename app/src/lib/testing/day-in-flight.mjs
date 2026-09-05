/**
 * IS TODAY'S PRODUCTION STILL IN FLIGHT? — one owner for a class that has now bitten three guards.
 *
 * Program 233 · Release A. Three separate tests have gone red not because anything was broken but
 * because they ran while the day was still being built:
 *
 *   · the explorer projection asserted legs were omitted, on an overnight slate of 32 (below the cap)
 *   · the same guard asserted a "Legs (N)" heading, on an overnight slate of 0
 *   · cross-surface agreement asserted MLB market intelligence at 11:20 ET, before the producer ran
 *
 * Each was fixed in place, and the class kept returning. A guard that fails when the product is
 * RIGHT gets deleted by whoever is on call, and the real claim goes with it — so this makes "the day
 * is not finished yet" a first-class, checkable state rather than a comment in three files.
 *
 * IT IS NOT A SKIP SWITCH. The deadline is what makes it honest: before the producer's deadline an
 * absent artifact is expected and the caller states that; PAST the deadline the artifact is genuinely
 * missing and the caller must fail. Silence before a deadline is a fact; silence after one is an
 * incident, and this draws that line in exactly one place.
 *
 * The deadlines are measured, not aspirational. GitHub's queue on this repository routinely delays
 * scheduled jobs by two to three hours — `mlb-daily-production` is scheduled 14:15 UTC and its last
 * four runs landed 17:00, 17:37, 17:10 and 17:52 UTC. A deadline set at the cron hour would fail
 * every morning for a system that is working exactly as designed.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Producers whose artifacts guards depend on: the scheduled hour plus the grace observed drift
 * requires. Stated here so a reader sees the assumption instead of inferring it from a magic number.
 */
export const PRODUCER_DEADLINES = Object.freeze({
  /** mlb-daily-production — cron 14:15Z; observed landings 17:00–17:54Z. */
  "mlb-daily-production": { cronUtcHour: 14, graceHours: 5 },
  /** daily-products — cron 15:30Z; observed landings ~18:40Z. */
  "daily-products": { cronUtcHour: 15, graceHours: 5 },
});

/** True when `date`'s artifact is legitimately absent because its producer is not yet late. */
export function withinProducerGrace({ date, producer, nowUtcMs = Date.now() }) {
  const d = PRODUCER_DEADLINES[producer];
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, day] = date.split("-").map(Number);
  const deadline = Date.UTC(y, m - 1, day, d.cronUtcHour) + d.graceHours * 3600_000;
  return nowUtcMs <= deadline;
}

/** The newest date for which `dir` holds a dated artifact. */
export function newestArtifactDate(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().pop()?.slice(0, 10) ?? null;
  } catch { return null; }
}

/**
 * Decide what a guard should do about a date whose artifact is absent.
 *
 * `inFlight: true` means the producer is not yet late — the caller states the reason and returns.
 * `inFlight: false` with `present: false` means it IS late, and the caller must fail with that
 * sentence: at that point the absence is the finding.
 */
export function artifactAbsence({ appDir, relDir, date, producer, nowUtcMs = Date.now() }) {
  const present = fs.existsSync(path.join(appDir, relDir, `${date}.json`));
  if (present) return { inFlight: false, present: true, reason: null };
  const grace = withinProducerGrace({ date, producer, nowUtcMs });
  return {
    inFlight: grace,
    present: false,
    reason: grace
      ? `${relDir}/${date}.json is not built yet — ${producer} is not past its deadline`
      : `${relDir}/${date}.json is MISSING and ${producer} is past its deadline`,
  };
}
