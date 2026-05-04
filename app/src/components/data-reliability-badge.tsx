interface Props {
  score?: number;
  className?: string;
}

/**
 * DataReliabilityBadge — small badge showing source quality 0-100%.
 *
 * Score = composite of (schedule reliability + odds reliability + max news
 * reliability) / 3. Computed in the pipeline.
 */
export default function DataReliabilityBadge({ score, className = "" }: Props) {
  if (score === undefined || score === null) return null;

  const pct = Math.round(score * 100);
  const tone =
    pct >= 85 ? "var(--lime)" : pct >= 65 ? "var(--amber)" : "var(--rose)";

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px]",
        "font-mono text-[10px] uppercase tracking-wider",
        "border border-[var(--border)]",
        className,
      ].join(" ")}
      style={{ color: tone }}
      title={`Source reliability ${pct}% — composite of schedule, odds, and news source scores`}
    >
      <span
        aria-hidden
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: tone }}
      />
      data {pct}%
    </span>
  );
}
