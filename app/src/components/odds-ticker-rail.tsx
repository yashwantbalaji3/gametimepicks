/**
 * OddsTickerRail — narrow horizontal ticker strip that scrolls the
 * latest scored slate's strongest projections. Pure presentation;
 * doesn't fabricate or fetch anything — caller passes the cells.
 *
 * The marquee duplicates the entries inline so the loop is seamless.
 * Animation paused on hover and disabled under prefers-reduced-motion
 * via the .gtp-ticker-track / .gtp-ticker-rail CSS rules.
 */
export interface TickerCell {
  playerName: string;
  market: string;
  side: string;
  line: number;
  edgePct: number | null;
  flagged?: boolean;
}

interface Props {
  cells: TickerCell[];
  /** Eyebrow text on the left of the rail (e.g. "MAY 13 BOARD · TOP EDGES"). */
  eyebrow?: string;
}

export default function OddsTickerRail({ cells, eyebrow }: Props) {
  if (cells.length === 0) return null;
  // Duplicate the cells so the CSS marquee translate -50% loops cleanly.
  const doubled = [...cells, ...cells];
  return (
    <div
      className="gtp-ticker-rail"
      role="region"
      aria-label="Top model projections ticker"
    >
      <div className="flex items-stretch">
        {eyebrow && (
          <div
            className="shrink-0 flex items-center px-4"
            style={{
              borderRight: "1px solid var(--vault-rule)",
              background: "rgba(10, 16, 13, 0.6)",
            }}
          >
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full mr-2 gtp-neon-pulse"
              style={{
                background: "var(--vault-gold-bright)",
                boxShadow: "0 0 8px rgba(52, 211, 153, 0.6)",
              }}
            />
            <span
              className="font-mono uppercase"
              style={{
                color: "var(--vault-gold)",
                fontSize: 10,
                letterSpacing: "0.16em",
              }}
            >
              {eyebrow}
            </span>
          </div>
        )}
        <span aria-hidden className="gtp-ticker-chevron">»</span>
        <div className="overflow-hidden flex-1">
          <div className="gtp-ticker-track" aria-hidden>
            {doubled.map((c, i) => (
              <span key={i} className="gtp-ticker-cell">
                <span className="gtp-ticker-player">{c.playerName}</span>
                <span style={{ color: "var(--vault-text-faint)" }}>
                  {c.side} {c.line} {c.market}
                </span>
                {typeof c.edgePct === "number" && Number.isFinite(c.edgePct) && (
                  <span
                    className={
                      c.flagged ? "gtp-ticker-edge-warn" : "gtp-ticker-edge"
                    }
                  >
                    {c.edgePct > 0 ? "+" : ""}
                    {c.edgePct.toFixed(1)}%
                  </span>
                )}
                <span aria-hidden className="gtp-ticker-divider" />
              </span>
            ))}
          </div>
        </div>
        <span aria-hidden className="gtp-ticker-chevron">»</span>
      </div>
    </div>
  );
}
