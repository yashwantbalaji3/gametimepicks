/**
 * Phase 15 — NoCurrentSlate.
 *
 * The user-facing state shown when there's no current or upcoming slate
 * available — only past archives. Replaces the previous behavior of
 * silently defaulting to a past date.
 *
 * Design direction:
 *   - Premium, futuristic, "data-grid waiting for input" feel
 *   - Honest about the absence — no fake busyness
 *   - Surfaces the latest archived slate as a clear secondary action
 *   - CSS-only animation (subtle pulse on the status dot)
 *   - Respects prefers-reduced-motion
 */
import Link from "next/link";

interface Props {
  /** Date string of the most recent past slate with content. */
  latestArchivedDate: string | null;
  /** When was the pipeline last run? Surfaces context for "next refresh". */
  lastRefreshDisplay?: string;
}

export default function NoCurrentSlate({
  latestArchivedDate,
  lastRefreshDisplay,
}: Props) {
  return (
    <div className="relative">
      {/* Subtle radial glow behind the card */}
      <div
        className="absolute inset-0 -z-10 opacity-60 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 30%, rgba(52, 211, 153, 0.08), transparent 60%)",
        }}
        aria-hidden
      />

      <div
        className="rounded-[3px] p-8 sm:p-12 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, var(--vault-panel) 0%, var(--vault-panel-elevated) 100%)",
          border: "1px solid var(--vault-border-strong)",
          boxShadow: "0 0 40px rgba(52, 211, 153, 0.05)",
        }}
      >
        {/* Faint grid texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(var(--vault-gold) 1px, transparent 1px), linear-gradient(90deg, var(--vault-gold) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
          aria-hidden
        />

        <div className="relative">
          {/* Status pill */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{
              background: "var(--vault-warn-dim)",
              border: "1px solid var(--vault-border)",
              color: "var(--vault-warn)",
            }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full vault-pulse"
              style={{ background: "var(--vault-warn)" }}
              aria-hidden
            />
            awaiting next slate
          </div>

          {/* Heading */}
          <h2
            className="mt-6 font-display text-[28px] sm:text-[36px] md:text-[44px] tracking-tightest font-semibold leading-[1.05] max-w-3xl"
            style={{ color: "var(--vault-text)" }}
          >
            No current slate available.
          </h2>

          {/* Lead */}
          <p
            className="mt-4 text-[14px] sm:text-[16px] leading-relaxed max-w-2xl"
            style={{ color: "var(--vault-text-mute)" }}
          >
            The next NBA slate hasn&apos;t been generated yet. The model
            board refreshes automatically — check back in a couple hours,
            or sign up below to be notified when the next slate is ready.
          </p>

          {lastRefreshDisplay && (
            <p
              className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em]"
              style={{ color: "var(--vault-text-faint)" }}
            >
              last refresh · {lastRefreshDisplay}
            </p>
          )}

          {/* Archive teaser */}
          {latestArchivedDate && (
            <div
              className="mt-8 rounded-[2px] p-4 sm:p-5 inline-flex flex-wrap items-baseline gap-x-4 gap-y-2"
              style={{
                background: "var(--vault-panel)",
                border: "1px solid var(--vault-border)",
              }}
            >
              <div
                className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
                style={{ color: "var(--vault-gold)" }}
              >
                latest archived slate
              </div>
              <div
                className="font-display text-[16px] font-semibold tracking-tight"
                style={{ color: "var(--vault-text)" }}
              >
                {formatLongDate(latestArchivedDate)}
              </div>
              <Link
                href="/results/"
                className="font-mono text-[11px] uppercase tracking-[0.15em] underline-offset-4 hover:underline transition-colors"
                style={{ color: "var(--vault-gold-bright)" }}
              >
                view in results →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatLongDate(date: string): string {
  // YYYY-MM-DD → "Tue, May 5, 2026" (in ET so day-of-week stays right)
  try {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12)); // noon UTC = stable ET date
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(dt);
  } catch {
    return date;
  }
}
