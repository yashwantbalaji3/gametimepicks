import type { MlbBucket, MlbComparisonReport } from "@/lib/types-mlb-results";
import { mlbMarketLabel } from "@/lib/format-mlb";

/**
 * MlbResultsBreakdown — three bucket grids (market / confidence / game).
 * Pure presentation; no fabrication. When a bucket has 0 decisive picks
 * the hitRate cell shows "—" instead of "0%" so users don't mis-read
 * empty buckets as 0-for-N performance.
 */
interface Props {
  report: MlbComparisonReport;
}

function formatPercent(p: number | null): string {
  if (p === null || p === undefined) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

function sortBuckets(
  buckets: Record<string, MlbBucket>,
  preferredOrder?: string[],
): MlbBucket[] {
  const entries = Object.values(buckets);
  if (preferredOrder) {
    return entries.sort((a, b) => {
      const ia = preferredOrder.indexOf(a.label);
      const ib = preferredOrder.indexOf(b.label);
      if (ia === -1 && ib === -1) return b.total - a.total;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }
  return entries.sort((a, b) => b.total - a.total);
}

const MARKET_ORDER = [
  "pitcher_strikeouts",
  "batter_hits",
  "batter_total_bases",
];

const CONFIDENCE_ORDER = ["High", "Medium", "Low", "insufficient_data"];

export default function MlbResultsBreakdown({ report }: Props) {
  const markets = sortBuckets(report.byMarket, MARKET_ORDER);
  const confs = sortBuckets(report.byConfidence, CONFIDENCE_ORDER);
  // Per-game sorted by tipoff (gameDate) when present
  const games = Object.values(report.byGame).sort((a, b) =>
    (a.gameDate || "").localeCompare(b.gameDate || ""),
  );

  return (
    <section className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <BucketCard
        title="By market"
        buckets={markets}
        labelFmt={(k) => mlbMarketLabel(k)}
      />
      <BucketCard title="By confidence" buckets={confs} />
      <BucketCard
        title="By game"
        buckets={games}
        full
        labelFmt={(_, b) => b.matchup ?? b.label}
      />
    </section>
  );
}

function BucketCard({
  title,
  buckets,
  full,
  labelFmt,
}: {
  title: string;
  buckets: MlbBucket[];
  full?: boolean;
  labelFmt?: (label: string, b: MlbBucket) => string;
}) {
  return (
    <div
      className={`rounded-[6px] ${full ? "lg:col-span-2" : ""}`}
      style={{
        background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div
        className="px-4 py-3 font-mono uppercase tracking-[0.16em]"
        style={{
          color: "var(--vault-gold-bright)",
          fontSize: 10,
          borderBottom: "1px solid var(--vault-border)",
        }}
      >
        {title}
      </div>
      <ul className="flex flex-col list-none p-0 m-0">
        {buckets.length === 0 && (
          <li
            className="px-4 py-3 text-[12px]"
            style={{ color: "var(--vault-text-faint)" }}
          >
            No data yet.
          </li>
        )}
        {buckets.map((b) => {
          const label = labelFmt ? labelFmt(b.label, b) : b.label;
          return (
            <li
              key={b.label}
              className="flex items-center justify-between gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid var(--vault-rule)" }}
            >
              <span
                className="text-[13px] truncate min-w-0"
                style={{ color: "var(--vault-text)" }}
              >
                {label}
              </span>
              <div
                className="flex items-center gap-4 font-mono shrink-0"
                style={{
                  color: "var(--vault-text-mute)",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 12,
                }}
              >
                <span>
                  {b.wins}–{b.losses}
                  {b.pushes > 0 ? `–${b.pushes}P` : ""}
                </span>
                <span style={{ color: "var(--vault-text-faint)" }}>
                  · {b.total} dec
                </span>
                <span
                  className="font-display font-semibold"
                  style={{
                    color:
                      b.hitRate !== null && b.hitRate >= 0.5
                        ? "var(--vault-success)"
                        : "var(--vault-warn)",
                    fontSize: 14,
                    minWidth: 56,
                    textAlign: "right",
                  }}
                >
                  {formatPercent(b.hitRate)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
