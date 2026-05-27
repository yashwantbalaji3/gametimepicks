/**
 * Compact server-rendered banner that surfaces the latest daily
 * postmortem on /results. Intentionally small — one line of
 * counts + a collapsed list of recommendations (only when warn-level
 * recs exist).
 *
 * Never fabricates: when the audit JSON is absent the parent simply
 * does not render us.
 */
import type {
  DailyAuditPayload,
  DailyAuditPolicySummary,
} from "@/lib/data-daily-audit";

interface Props {
  audit: DailyAuditPayload;
  /** Optional — when present, the banner shows a one-line policy
   *  status (e.g. "Policy window: 1/3 confirming days — no model
   *  demotions active yet."). Never invented; renders nothing when
   *  the policy JSON is absent. */
  policy?: DailyAuditPolicySummary | null;
}

export default function DailyAuditBanner({ audit, policy }: Props) {
  const { date, summary, recommendations, warnings } = audit;
  const warnRecs = recommendations.filter((r) => r.severity === "warn");
  return (
    <section
      aria-label={`Daily audit for ${date}`}
      className="rounded-[8px] p-4 flex flex-col gap-2"
      style={{
        background: "rgba(7,11,26,0.4)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span
            className="font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            Daily model audit · {date}
          </span>
          <span
            className="font-display"
            style={{ color: "var(--vault-text)", fontSize: 14 }}
          >
            {summary.wins}W · {summary.losses}L
            {summary.pushes > 0 ? ` · ${summary.pushes}P` : ""} ·{" "}
            {summary.pending} pending · {(summary.hitRate * 100).toFixed(1)}%
            hit rate
            <span
              className="font-mono"
              style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
            >
              {" "}({summary.totalSlips} slips)
            </span>
          </span>
        </div>
        {warnRecs.length > 0 && (
          <span
            className="font-mono uppercase tracking-[0.14em] px-2 py-1 rounded-full shrink-0"
            style={{
              color: "var(--vault-warn)",
              border: "1px solid var(--vault-warn)",
              fontSize: 10,
            }}
          >
            {warnRecs.length} {warnRecs.length === 1 ? "signal" : "signals"}
          </span>
        )}
      </div>
      {warnRecs.length > 0 && (
        <details>
          <summary
            className="font-mono uppercase tracking-[0.14em] cursor-pointer"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            View signals
          </summary>
          <ul
            className="mt-2 flex flex-col gap-1 text-[12px]"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {warnRecs.map((r) => (
              <li key={r.id} className="flex gap-2 leading-snug">
                <span
                  className="font-mono shrink-0"
                  style={{ color: "var(--vault-warn)", fontSize: 11 }}
                >
                  ⚠
                </span>
                <span>{r.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {policy && (
        <p
          className="text-[11px] leading-snug font-mono"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Policy window: {policy.daysAvailable}/{policy.daysRequired} confirming
          {" "}days
          {policy.confirmed
            ? " — model demotions: " +
              policy.confirmedSignalNames
                .filter((n) => n !== "longshotKeepCollapsed")
                .join(", ")
            : " — no model demotions active yet."}
        </p>
      )}
      {warnings.length > 0 && (
        <p
          className="text-[11px] leading-snug"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {warnings.join(" · ")}
        </p>
      )}
    </section>
  );
}
