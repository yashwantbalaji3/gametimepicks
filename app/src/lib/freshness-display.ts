/**
 * Freshness DISPLAY layer — turns a slate/artifact date + "today" into the ONE honest badge a user reads:
 * "Live today" / "Latest slate · 2 days ago (awaiting refresh)" / "Upcoming · tomorrow".
 *
 * Built entirely on the existing pure engine in ./freshness (classifySlate + daysOldVs), so there is no
 * duplicated date math and NO new Python-port obligation (freshness.ts core stays in sync with
 * pipeline/freshness.py; this UI-only layer does not). Pure + synchronous → fully unit-testable.
 *
 * The whole site is a static export, so the build clock freezes at deploy time. The truth fix is to feed
 * this the REAL browser date (via <FreshnessBadge>, which re-computes in a useEffect after hydration) rather
 * than the frozen build date — so a July-1 slate viewed on July-5 reads "Latest slate · 4 days ago", never
 * a false "today".
 */
import { classifySlate, daysOldVs, type SlateFreshness } from "./freshness";

export type FreshnessTone = "live" | "recent" | "stale" | "future" | "muted";

export interface FreshnessDisplay {
  state: SlateFreshness;
  tone: FreshnessTone;
  /** The short badge text — "Live today" / "Latest slate · 3 days ago" / "Upcoming · tomorrow". */
  text: string;
  /** Longer honest copy shown when the slate is genuinely behind (≥2 days) — else null. */
  warning: string | null;
  /** Days between the slate date and today (≥0 past, <0 future, NaN when no data). */
  ageDays: number;
}

/**
 * Compute the freshness badge for a slate date relative to `today`. `today` MUST be the real current ET
 * date for the label to be truthful — server render passes the build-date guess, the client badge re-runs
 * this with the browser clock after hydration.
 */
export function freshnessDisplay(
  slateDate: string | null | undefined,
  today: string,
  opts?: { noun?: string },
): FreshnessDisplay {
  const noun = opts?.noun ?? "slate";
  const state = classifySlate(slateDate, today);

  if (state === "no_data" || !slateDate) {
    return { state: "no_data", tone: "muted", text: `No current ${noun}`, warning: null, ageDays: NaN };
  }

  const ageDays = daysOldVs(slateDate, today);

  if (state === "current") {
    return { state, tone: "live", text: "Live today", warning: null, ageDays: 0 };
  }

  if (state === "future") {
    const text = ageDays === -1 ? "Upcoming · tomorrow" : `Upcoming · ${slateDate}`;
    return { state, tone: "future", text, warning: null, ageDays };
  }

  // "previous" — the slate is behind today. One day back is soft; two-plus is a genuine "awaiting refresh".
  const ago = ageDays === 1 ? "yesterday" : `${ageDays} days ago`;
  const stale = ageDays >= 2;
  return {
    state,
    tone: stale ? "stale" : "recent",
    text: `Latest ${noun} · ${ago}`,
    warning: stale
      ? `A newer ${noun} hasn't been generated yet — showing the most recent available (${slateDate}). Nothing here is live for today.`
      : null,
    ageDays,
  };
}
