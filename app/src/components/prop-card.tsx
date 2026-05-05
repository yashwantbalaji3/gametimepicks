/**
 * PropCard — single row on the Model Board.
 *
 * Renders all the salient fields for one player prop:
 *   - matchup line (team @ opp · tipoff)
 *   - player name
 *   - confidence badge
 *   - market + lean direction + line + odds
 *   - projection (or "—" if unavailable)
 *   - edge pill (or neutral em-dash pill if unavailable)
 *   - implied probability (always available — derived from odds)
 *   - reason string
 *   - status badge if not Pending
 *
 * Phase 7B-3.1: when projection / modelProbability / edgePct are null
 * (the pipeline emits these for "insufficient_data" and explicit "Pass"
 * rows when player game logs aren't available), the card renders honest
 * placeholders instead of crashing or fabricating values. The line, odds,
 * implied probability, bookmaker, team, and opponent are still shown
 * because those fields come from the sportsbook and are real.
 *
 * Pure presentational — no state, no data fetching.
 */
import type { PropLean } from "@/lib/types";
import {
  formatPercent,
  formatOdds,
  formatStat,
  marketLabel,
  EM_DASH,
} from "@/lib/format";
import ConfidenceBadge from "./confidence-badge";
import EdgePill from "./edge-pill";
import StatusBadge from "./status-badge";
import NewsSignalBadge from "./news-signal-badge";
import DataReliabilityBadge from "./data-reliability-badge";

interface Props {
  lean: PropLean;
  /** Optional reveal-animation delay class (1-6) */
  delay?: number;
}

export default function PropCard({ lean, delay }: Props) {
  const delayClass = delay ? ` reveal-d${Math.min(delay, 6)}` : "";

  // Treat both "No Play" and "Pass" as no-direction states. "Pass" is the
  // pipeline's explicit no-recommendation label for insufficient_data /
  // no_play rows.
  const noPlay = lean.lean === "No Play" || lean.lean === "Pass";

  // No projection at all → render the projection cell as a placeholder
  // and skip the directional Over/Under decoration. This is the structural
  // fix for the toFixed-on-null crash.
  const hasProjection = typeof lean.projection === "number" &&
    Number.isFinite(lean.projection);
  const hasModelOutput = typeof lean.modelProbability === "number" &&
    Number.isFinite(lean.modelProbability);

  const oddsForLean = lean.lean === "Under" ? lean.oddsUnder : lean.oddsOver;
  const directionLabel =
    lean.lean === "Over" ? "O" : lean.lean === "Under" ? "U" : EM_DASH;
  const hasSignals = (lean.newsSignals?.length ?? 0) > 0;

  // Sub-text under the projection cell — be explicit about WHY no projection
  const projectionSub = hasProjection
    ? "model"
    : lean.confidence === "insufficient_data"
      ? "insufficient data"
      : lean.confidence === "no_play"
        ? "pass"
        : "projection unavailable";

  return (
    <article
      className={`surface p-5 transition-all duration-200 hover:border-[var(--line-strong)] hover:-translate-y-px reveal${delayClass}`}
    >
      {/* Header: matchup + confidence */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[11px] text-[var(--text-faint)] tracking-wider uppercase">
            {lean.team || EM_DASH}
            {" "}
            {lean.homeAway === "Home" ? "vs" : "@"}
            {" "}
            {lean.opponent || EM_DASH}
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
            noPlay
              ? formatStat(lean.line)
              : `${directionLabel} ${formatStat(lean.line)}`
          }
          sub={noPlay ? "no play" : formatOdds(oddsForLean)}
          mute={noPlay}
        />
        <Stat
          label="projection"
          value={formatStat(lean.projection)}
          sub={projectionSub}
          mute={!hasProjection}
        />
        <div>
          <div className="font-mono text-[10px] tracking-wider uppercase text-[var(--text-faint)]">
            edge
          </div>
          <div className="mt-1">
            <EdgePill edgePct={lean.edgePct} size="lg" />
          </div>
          <div className="text-[10px] font-mono text-[var(--text-faint)] mt-1">
            {hasModelOutput
              ? `vs ${formatPercent(lean.impliedProbability, 0)} implied`
              : `implied ${formatPercent(lean.impliedProbability, 0)}`}
          </div>
        </div>
      </div>

      {/* Reason */}
      <p className="mt-4 text-[13px] text-[var(--text-mute)] leading-relaxed border-t border-[var(--border)] pt-3">
        {lean.reason}
      </p>

      {/* News signals (manual overrides) */}
      {hasSignals && <NewsSignalBadge signals={lean.newsSignals!} />}

      {/* Data reliability footer */}
      {lean.sourceReliability !== undefined && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between gap-2">
          <DataReliabilityBadge score={lean.sourceReliability} />
          {lean.bookmaker && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
              {lean.bookmaker}
            </span>
          )}
        </div>
      )}
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
