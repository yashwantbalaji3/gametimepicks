/**
 * CalibrationRoadmap — day-by-day strip showing settled hit rate over
 * time. Honest:
 *   - Each entry's state is one of:
 *       "settled"      — real graded data (hit rate shown)
 *       "pending"      — slate exists, awaiting box scores
 *       "no-slate"     — off-day or no scheduled games
 *   - Never fabricates a trend line.
 *   - Today's slate is highlighted as the "first settled slate" target
 *     when the lifetime settled total is 0.
 *
 * Inputs come from the existing public results data (already
 * sanitized — no PII). When no dates are settled, the strip explicitly
 * communicates that the first settlement will appear here.
 */
import Link from "next/link";

export interface CalibrationDay {
  date: string;
  /** "settled" | "pending" | "no-slate" */
  state: "settled" | "pending" | "no-slate";
  /** 0..1 — only when state === "settled" with decisive picks. */
  hitRate?: number | null;
  /** Display label override; defaults to the date string. */
  label?: string;
  /** Optional decisive count for the hover tooltip. */
  decisive?: number;
  /** Honest descriptor under the date. */
  note?: string;
}

interface Props {
  days: CalibrationDay[];
  /** Total settled days site-wide (drives the "first slate" callout). */
  lifetimeDecisive: number;
  /** Optional link target when the user clicks "view live board". */
  liveBoardHref?: string;
  liveBoardLabel?: string;
}

function fmtHit(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(0)}%`;
}

export default function CalibrationRoadmap({
  days,
  lifetimeDecisive,
  liveBoardHref,
  liveBoardLabel,
}: Props) {
  const anySettled = lifetimeDecisive > 0;

  return (
    <section className="mt-10 reveal">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px rgba(52, 211, 153, 0.6)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            Calibration roadmap · day by day
          </span>
        </div>
        {liveBoardHref && liveBoardLabel && (
          <Link
            href={liveBoardHref}
            className="font-mono tracking-tight"
            style={{ color: "var(--vault-gold)", fontSize: 12 }}
          >
            {liveBoardLabel} →
          </Link>
        )}
      </div>

      {!anySettled && (
        <p
          className="mb-4 text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}
        >
          No slates have been graded yet. The first settled slate lights
          up the leftmost cell — every following date stamps the model's
          hit rate so the day-over-day calibration trend becomes visible
          as it accumulates.
        </p>
      )}

      <div className="gtp-roadmap-strip">
        {days.map((d) => {
          const label = d.label ?? d.date;
          const state = d.state;
          return (
            <div
              key={d.date}
              className="gtp-roadmap-cell"
              data-state={state}
              title={
                state === "settled"
                  ? `${d.date}${
                      typeof d.decisive === "number"
                        ? ` · ${d.decisive} decisive`
                        : ""
                    }`
                  : state === "pending"
                    ? `${d.date} · slate loaded, awaiting box scores`
                    : `${d.date} · no scheduled games`
              }
            >
              <div className="gtp-roadmap-cell-label">{label}</div>
              <div className="gtp-roadmap-cell-value">
                {state === "settled" ? (
                  <span className="gtp-roadmap-value-settled">
                    {fmtHit(d.hitRate)}
                  </span>
                ) : state === "pending" ? (
                  <span className="gtp-roadmap-value-pending">pending</span>
                ) : (
                  <span className="gtp-roadmap-value-empty">—</span>
                )}
              </div>
              {d.note && (
                <div className="gtp-roadmap-cell-note">{d.note}</div>
              )}
            </div>
          );
        })}
      </div>

      <p
        className="mt-4 text-[12px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)", maxWidth: 720 }}
      >
        Hit rate excludes pushes from the denominator and never includes
        No Play leans. Pending entries show the slate exists but is
        waiting on final box scores; off-days show as muted cells.
      </p>
    </section>
  );
}
