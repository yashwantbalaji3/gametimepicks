/**
 * Morning trigger — should the settlement chain be started now? (P256 · reliable 8 AM ET)
 *
 * GitHub's scheduler is the chain's weakest link: on 2026-09-11 the first nightly-settle started
 * 4h22m late and cron-watchdog plus the three morning backstops never started at all. This is the
 * decision a Vercel cron makes before starting nightly-settle through GitHub's API — which chains
 * morning-projections → mlb-daily-production → daily-products exactly as a scheduled run does.
 *
 * Pure, so the rule is unit-tested without a network. It starts the chain ONLY when no nightly-settle
 * run for today (ET) has succeeded, is queued, or is running — a second settlement on the same day is
 * never started by this path. Anything it cannot read is treated as "do not start" (fail closed).
 */
export const TRIGGER_WORKFLOW = "nightly-settle.yml";
export const TRIGGER_REPO = "yashwantbalaji3/gametimepicks";
export const TRIGGER_TOKEN_ENV = "GTP_DISPATCH_TOKEN";

/** YYYY-MM-DD for an instant in America/New_York. */
export function etDate(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw new Error("etDate: iso required");
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

/**
 * @param {Array<{status:string, conclusion:string|null, created_at:string}>|null} runs  newest first, from GitHub
 * @param {string} nowIso
 * @returns {{dispatch:boolean, reason:string}}
 */
export function decideMorningTrigger(runs, nowIso) {
  if (!Array.isArray(runs)) return { dispatch: false, reason: "could not read today's runs — not starting (fail closed)" };
  const today = etDate(nowIso);
  const todays = runs.filter((r) => { try { return etDate(r.created_at) === today; } catch { return false; } });
  if (todays.some((r) => r.status === "completed" && r.conclusion === "success"))
    return { dispatch: false, reason: `nightly-settle already succeeded today (${today} ET)` };
  if (todays.some((r) => r.status === "queued" || r.status === "in_progress" || r.status === "waiting" || r.status === "pending"))
    return { dispatch: false, reason: `nightly-settle is already queued or running (${today} ET)` };
  return { dispatch: true, reason: `no successful nightly-settle yet today (${today} ET) — starting the chain` };
}
