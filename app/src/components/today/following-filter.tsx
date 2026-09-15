"use client";
/**
 * FollowingFilter (P323) — "only teams I follow" on the day's slate. The slate is server-rendered once for
 * everyone; this control narrows it in the reader's browser by toggling the rows that carry a followed team
 * (each row is marked with its two team names). It appears only for a reader who follows at least one team,
 * never hides a row silently (the count says what is shown), and never touches a stronger model signal — the
 * ranked reads above the slate are untouched.
 */
import { useEffect, useMemo, useState } from "react";
import { useFollowedTeams } from "@/lib/follow/follow-store";
import { readSinkConfig, resolveSink, track } from "@/lib/analytics/sink";
import { SCHEMA_VERSION } from "@/lib/analytics/event-contract";
import { currentEtDate } from "@/lib/freshness";

export const FOLLOW_ROW_ATTR = "data-teams";

export default function FollowingFilter() {
  const { teams, ready } = useFollowedTeams();
  const [on, setOn] = useState(false);
  const [shown, setShown] = useState<{ matched: number; total: number } | null>(null);
  const sink = useMemo(() => resolveSink(readSinkConfig()), []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const rows = Array.from(document.querySelectorAll<HTMLElement>(`[${FOLLOW_ROW_ATTR}]`));
    let matched = 0;
    for (const row of rows) {
      const names = (row.getAttribute(FOLLOW_ROW_ATTR) ?? "").split("|");
      const mine = names.some((n) => teams.includes(n));
      if (mine) matched += 1;
      row.hidden = on && !mine;
    }
    setShown({ matched, total: rows.length });
    return () => { for (const row of rows) row.hidden = false; };
  }, [on, teams]);

  if (!ready || !teams.length) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter the slate by the teams you follow">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => { const next = !on; setOn(next); if (next) track({ event: "following_filter_used", schemaVersion: SCHEMA_VERSION, dayBucket: currentEtDate(), surface: "daily_hub" }, sink); }}
        className="font-mono uppercase tracking-[0.08em]"
        style={{ minHeight: 36, padding: "0 12px", borderRadius: 999, border: `1px solid ${on ? "var(--vault-border-active)" : "var(--vault-rule)"}`, background: on ? "var(--vault-panel-elevated)" : "transparent", color: on ? "var(--vault-text)" : "var(--vault-text-mute)", fontSize: 9.5, cursor: "pointer" }}
      >
        {on ? "★ Only teams I follow" : "☆ Only teams I follow"}
      </button>
      {shown ? (
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }} aria-live="polite">
          {on ? `${shown.matched} of ${shown.total} games have a team you follow${shown.matched === 0 ? " — none today, so nothing is shown" : ""}` : `${shown.matched} of ${shown.total} games have a team you follow`}
        </span>
      ) : null}
    </div>
  );
}
