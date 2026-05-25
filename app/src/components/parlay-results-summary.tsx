/**
 * ParlayResultsSummary — top-of-page tiles for the parlay-first
 * /results page.
 *
 * Renders lifetime + by-profile + by-sport tiles using the
 * optimizer-summary.json shape. Pushes excluded from hit-rate
 * denominator; pending excluded. When a tile has no decisive
 * picks yet, it shows "—" not 0% (0% would imply a measured
 * outcome).
 */
import type {
  OptimizerSummary,
  OptimizerSummaryBucket,
} from "@/lib/parlay-results";

interface Props {
  summary: OptimizerSummary | null;
}

const PROFILE_LABEL: Record<string, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "High variance",
  star_power: "Star Power",
};

const SPORT_LABEL: Record<string, { label: string; icon: string }> = {
  nba: { label: "NBA", icon: "🏀" },
  mlb: { label: "MLB", icon: "⚾" },
  multi: { label: "Mixed", icon: "🔀" },
};

export default function ParlayResultsSummary({ summary }: Props) {
  const lifetime = summary?.lifetime ?? {
    wins: 0,
    losses: 0,
    pushes: 0,
    pending: 0,
    decisive: 0,
    hitRate: null,
  };
  const profiles = summary?.byProfile ?? {};
  const sports = summary?.bySport ?? {};

  return (
    <div className="flex flex-col gap-3">
      {/* Lifetime headline */}
      <div
        className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 rounded-[8px]"
        style={{
          background: "rgba(7,11,26,0.55)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <SummaryTile
          label="Overall"
          bucket={lifetime}
          emphasis
        />
        <SummaryTile
          label={PROFILE_LABEL.conservative}
          bucket={profiles.conservative ?? null}
        />
        <SummaryTile
          label={PROFILE_LABEL.balanced}
          bucket={profiles.balanced ?? null}
        />
        <SummaryTile
          label={PROFILE_LABEL.star_power}
          bucket={profiles.star_power ?? null}
        />
        <SummaryTile
          label={PROFILE_LABEL.aggressive}
          bucket={profiles.aggressive ?? null}
        />
      </div>

      {/* By sport */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-[8px]"
        style={{
          background: "rgba(7,11,26,0.4)",
          border: "1px solid var(--vault-rule)",
        }}
      >
        {(["nba", "mlb", "multi"] as const).map((s) => (
          <SummaryTile
            key={s}
            label={`${SPORT_LABEL[s].icon} ${SPORT_LABEL[s].label}`}
            bucket={sports[s] ?? null}
          />
        ))}
      </div>

      <p
        className="text-[11px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Hit rate = wins ÷ (wins + losses). Pushes and pending slips are
        excluded from the denominator. &quot;Pending&quot; is shown separately so
        you always know how many slips are still in flight.
      </p>
    </div>
  );
}

function SummaryTile({
  label,
  bucket,
  emphasis,
}: {
  label: string;
  bucket: OptimizerSummaryBucket | null;
  emphasis?: boolean;
}) {
  const decisive = bucket?.decisive ?? 0;
  const hitRate = bucket?.hitRate ?? null;
  const value = hitRate != null ? `${(hitRate * 100).toFixed(1)}%` : "—";
  const wins = bucket?.wins ?? 0;
  const losses = bucket?.losses ?? 0;
  const pending = bucket?.pending ?? 0;
  const pushes = bucket?.pushes ?? 0;
  const sub =
    decisive > 0
      ? `${wins}–${losses} on ${decisive} decisive`
      : pending > 0
        ? `${pending} pending`
        : "no graded slips";
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span
        className="font-mono uppercase tracking-[0.16em] truncate"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular truncate"
        style={{
          color: emphasis ? "var(--vault-gold-bright)" : "var(--vault-text)",
          fontSize: emphasis ? 22 : 18,
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        className="font-mono truncate"
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
      >
        {sub}
        {pushes > 0 ? ` · ${pushes} push` : ""}
      </span>
    </div>
  );
}
