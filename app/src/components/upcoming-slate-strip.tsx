import Link from "next/link";

/**
 * Compact "next-7-days" strip for sport overview pages. Renders each
 * future date as a small tile with the game count + status line. The
 * tile is a Link to the sport's Board route so users can drill in. If
 * a date has zero games, the tile reads as an off-day rather than
 * leaving a giant empty panel.
 *
 * Honest by default: never claims projections exist. Tile copy says
 * "lines pending" when the caller indicates the slate is schedule-only.
 */
export interface UpcomingSlateDay {
  /** YYYY-MM-DD */
  date: string;
  /** Number of games scheduled on this date. */
  gameCount: number;
  /** Short label e.g. "Sun · May 17". */
  label: string;
  /** Compact teaser text shown under the label — match-up preview if 1
   *  game, count + first matchup if 2+, "no games scheduled" if 0. */
  teaser: string;
  /**
   * Status the page wants to surface:
   *   "live"     — projections / leans are live on this date
   *   "pending"  — schedule loaded but lines not posted (projections coming soon)
   *   "off-day"  — no games scheduled
   */
  status: "live" | "pending" | "off-day";
}

export default function UpcomingSlateStrip({
  title,
  days,
  boardHrefBase,
  emptyMessage,
}: {
  title: string;
  days: UpcomingSlateDay[];
  /** Link target for tiles with games — anchored to the sport board */
  boardHrefBase: string;
  emptyMessage?: string;
}) {
  if (days.length === 0) {
    return (
      <section className="mt-10">
        <h2
          className="font-mono uppercase tracking-[0.16em] mb-3"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          {title}
        </h2>
        <div
          className="rounded-[6px] px-4 py-5 text-[13px]"
          style={{
            background: "rgba(11, 18, 14, 0.55)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
          }}
        >
          {emptyMessage ??
            "Schedule warming up. Check back when the next slate posts."}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <h2
        className="font-mono uppercase tracking-[0.16em] mb-3"
        style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
      >
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {days.map((d) => {
          const interactive = d.gameCount > 0;
          const accent =
            d.status === "live"
              ? "var(--vault-success)"
              : d.status === "pending"
                ? "var(--vault-gold-bright)"
                : "var(--vault-text-faint)";
          const note =
            d.status === "live"
              ? "projections live"
              : d.status === "pending"
                ? "lines pending"
                : "off-day";
          const body = (
            <div
              className="flex flex-col gap-1 rounded-[3px]"
              style={{
                padding: "10px 14px",
                border: `1px solid ${
                  interactive ? "var(--vault-border)" : "var(--vault-rule)"
                }`,
                background: interactive
                  ? "rgba(11, 18, 14, 0.45)"
                  : "rgba(11, 18, 14, 0.30)",
                minHeight: 88,
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  style={{
                    color: "var(--vault-text)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {d.label}
                </span>
                <span
                  className="font-mono"
                  style={{ color: accent, fontSize: 10 }}
                >
                  {d.gameCount > 0 ? d.gameCount : "—"}
                </span>
              </div>
              <span
                style={{
                  color: "var(--vault-text-mute)",
                  fontSize: 11,
                  lineHeight: 1.35,
                }}
              >
                {d.teaser}
              </span>
              <span
                className="font-mono uppercase tracking-[0.14em]"
                style={{
                  color: accent,
                  fontSize: 10,
                  marginTop: "auto",
                }}
              >
                · {note}
              </span>
            </div>
          );
          if (interactive) {
            return (
              <Link
                key={d.date}
                href={`${boardHrefBase}/${d.date}`}
                className="vault-glow-hover"
                style={{ textDecoration: "none", color: "inherit" }}
                aria-label={`View ${d.label} slate`}
              >
                {body}
              </Link>
            );
          }
          return <div key={d.date}>{body}</div>;
        })}
      </div>
    </section>
  );
}
