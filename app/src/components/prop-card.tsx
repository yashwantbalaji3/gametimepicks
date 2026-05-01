/**
 * PropCard — single row on the Model Board.
 *
 * Renders all the salient fields for one player prop:
 *   - matchup line (team @ opp · tipoff)
 *   - player name
 *   - confidence badge
 *   - market + lean direction + line + odds
 *   - projection
 *   - edge pill
 *   - implied probability
 *   - reason string
 *   - status badge if not Pending
 *
 * Pure presentational — no state, no data fetching. Receives a PropLean
 * object and renders it. Filters/sorting live on the board page.
 */
import type { PropLean } from "@/lib/types";
import {
  formatPercent,
  formatOdds,
  formatStat,
  marketLabel,
} from "@/lib/format";
import ConfidenceBadge from "./confidence-badge";
import EdgePill from "./edge-pill";
import StatusBadge from "./status-badge";

interface Props {
  lean: PropLean;
  /** Optional reveal-animation delay class (1-6) */
  delay?: number;
}

export default function PropCard({ lean, delay }: Props) {
  const delayClass = delay ? ` reveal-d${Math.min(delay, 6)}` : "";
  const noPlay = lean.lean === "No Play";
  const oddsForLean = lean.lean === "Under" ? lean.oddsUnder : lean.oddsOver;
  const directionLabel =
    lean.lean === "Over" ? "O" : lean.lean === "Under" ? "U" : "—";

  return (
    <article
      className={`surface p-5 transition-all duration-200 hover:border-[var(--line-strong)] hover:-translate-y-px reveal${delayClass}`}
    >
      {/* Header: matchup + confidence */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[11px] text-[var(--text-faint)] tracking-wider uppercase">
            {lean.team} {lean.homeAway === "Home" ? "vs" : "@"} {lean.opponent}
            {" · "}
            <span className="text-[var(--text-mute)]">{lean.tipoff}</span>
          </div>
          <h3 className="mt-1 font-display text-[20px] font-semibold tracking-tight truncate">
            {lean.playerName}
          </h3>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <ConfidenceBadge confidence={lean.confidence} />
          {lean.status !== "Pending" && (
            <StatusBadge status={lean.status} size="sm" />
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-3 gap-3 font-mono text-[13px]">
        <Stat
          label={marketLabel(lean.market)}
          value={
            noPlay ? `${lean.line}` : `${directionLabel} ${lean.line}`
          }
          sub={noPlay ? "no play" : formatOdds(oddsForLean)}
          mute={noPlay}
        />
        <Stat
          label="projection"
          value={formatStat(lean.projection)}
          sub="model"
        />
        <div>
          <div className="font-mono text-[10px] tracking-wider uppercase text-[var(--text-faint)]">
            edge
          </div>
          <div className="mt-1">
            <EdgePill edgePct={lean.edgePct} size="lg" />
          </div>
          <div className="text-[10px] font-mono text-[var(--text-faint)] mt-1">
            vs {formatPercent(lean.impliedProbability, 0)} implied
          </div>
        </div>
      </div>

      {/* Reason */}
      <p className="mt-4 text-[13px] text-[var(--text-mute)] leading-relaxed border-t border-[var(--border)] pt-3">
        {lean.reason}
      </p>
    </article>
  );
}

function Stat({
  label,
  value,
  sub,
  mute,
}: {
  label: string;
  value: string;
  sub?: string;
  mute?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-wider uppercase text-[var(--text-faint)]">
        {label}
      </div>
      <div
        className="mt-0.5 font-display text-[18px] font-semibold tabular tracking-tight"
        style={mute ? { color: "var(--text-faint)" } : undefined}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] font-mono text-[var(--text-faint)] mt-0.5">
          {sub}
        </div>
      )}
    </div>
  );
}
