/**
 * MlbProjectionGap — tiny horizontal "line vs projection" bar.
 *
 * Sibling to NBA's ProjectionVsLineTrack but standalone so it can render
 * inside a lean row without pulling all of vault-player-card. The center
 * tick is the sportsbook line; the fill extends toward the projection.
 * Width is capped so a 5-point gap doesn't dominate a 0.5-line market.
 *
 * Honest fallbacks:
 *   - projection null → renders a muted "—" placeholder
 *   - projection == line → renders the center tick only (no fill)
 */
interface Props {
  line: number;
  projection: number | null;
  sigma?: number | null;
  /** Max visual gap as a fraction of half the bar. Default caps at ~25%
   *  of the half-width, which matches NBA's track behavior for clarity. */
  maxFraction?: number;
  width?: number;
  height?: number;
}

export default function MlbProjectionGap({
  line,
  projection,
  sigma,
  maxFraction = 1.0,
  width = 96,
  height = 8,
}: Props) {
  if (projection === null || projection === undefined) {
    return (
      <span
        className="inline-block rounded-full align-middle"
        style={{
          width,
          height,
          background: "var(--vault-panel-elevated)",
          opacity: 0.5,
        }}
        role="presentation"
        aria-hidden="true"
      />
    );
  }

  const gap = projection - line;
  // Cap the visual fill: use the larger of sigma (≈ one stdev) or |gap|
  // as the "scale" so the fill never reaches the edge of the bar unless
  // the gap is truly extreme.
  const scaleBase = Math.max(Math.abs(gap), sigma ?? 1.0, 0.5);
  const fillFraction = Math.min(Math.abs(gap) / (scaleBase * 2), 0.5);
  // maxFraction is a 0..1 multiplier on the half-width.
  const cappedFraction = Math.min(fillFraction, 0.5 * maxFraction);

  const fillPct = cappedFraction * 100;
  const direction = gap > 0 ? "above" : gap < 0 ? "below" : "equal";

  const fillColor =
    direction === "above"
      ? "var(--vault-success)"
      : direction === "below"
        ? "var(--vault-warn)"
        : "var(--vault-text-faint)";

  return (
    <span
      role="img"
      aria-label={
        direction === "equal"
          ? `projection equals line ${line}`
          : `projection ${projection} ${direction} line ${line} by ${Math.abs(
              gap,
            ).toFixed(2)}`
      }
      className="inline-block align-middle"
      style={{ width, height, position: "relative" }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: "var(--vault-panel-elevated)" }}
      />
      {/* Center tick — the sportsbook line */}
      <span
        className="absolute top-0 bottom-0"
        style={{
          left: "50%",
          width: 1,
          background: "var(--vault-border-strong)",
          transform: "translateX(-0.5px)",
        }}
      />
      {/* Fill — extends from center toward the projection */}
      {direction !== "equal" && fillPct > 0 && (
        <span
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            background: fillColor,
            left: direction === "below" ? `calc(50% - ${fillPct}%)` : "50%",
            width: `${fillPct}%`,
            opacity: 0.85,
          }}
        />
      )}
    </span>
  );
}
