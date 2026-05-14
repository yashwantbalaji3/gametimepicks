"use client";

/**
 * VaultPlayerCard — premium board surface.
 *
 * One card per (date, gameId, playerId). Inside, up to three market
 * rows (PTS / REB / AST). Each market row presents:
 *   - the sportsbook pick (OVER/UNDER + line + odds)
 *   - the model projection paired visually with the line
 *   - the resulting edge and implied probability
 *   - bookmaker info, risk flags, and the model's reason
 *
 * Underlying alternates are preserved in the data — this component only
 * collapses them visually. The confidence pill at the top reflects the
 * BEST confidence among present markets so one High row brings the card
 * up to High overall.
 *
 * Extreme edges (>= 25%) paired with a suspicious_edge risk flag render
 * the edge in a calmer "model anomaly" treatment rather than gold so the
 * card never reads as "guaranteed money".
 */
import type { Market, ConfidenceTier } from "@/lib/types";
import type { PlayerCard, MarketRow } from "@/lib/grouping";
import {
  formatPercent,
  formatOdds,
  formatStat,
  marketLabel,
  EM_DASH,
} from "@/lib/format";
import PlayerCardTrends from "./player-card-trends";
import { useState } from "react";

interface Props {
  card: PlayerCard;
}

const CONFIDENCE_RANK: Record<ConfidenceTier, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  insufficient_data: 3,
  no_play: 4,
};

const CONFIDENCE_PILL: Record<
  string,
  { fg: string; bg: string; border: string; label: string }
> = {
  High: {
    fg: "var(--vault-gold-bright)",
    bg: "var(--vault-gold-dim)",
    border: "var(--vault-border-strong)",
    label: "High confidence",
  },
  Medium: {
    fg: "var(--vault-warn)",
    bg: "var(--vault-warn-dim)",
    border: "rgba(240, 199, 94, 0.30)",
    label: "Medium",
  },
  Low: {
    fg: "var(--vault-text-mute)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "Low",
  },
  insufficient_data: {
    fg: "var(--vault-text-faint)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "Not enough data",
  },
  no_play: {
    fg: "var(--vault-text-faint)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "Pass",
  },
};

const MARKET_ORDER: Market[] = ["PTS", "REB", "AST"];

// Friendlier labels for guardrail-emitted riskFlags. Anything not in
// this map falls back to underscore-to-space.
const RISK_FLAG_LABEL: Record<string, string> = {
  suspicious_edge: "Model anomaly",
  news_risk_flag: "News risk",
  news_remove: "Removed by news",
  news_manual_review: "Manual review",
};

function riskFlagLabel(flag: string): string {
  return RISK_FLAG_LABEL[flag] ?? flag.replace(/_/g, " ");
}

const SUSPICIOUS_EDGE_PCT = 25;

export default function VaultPlayerCard({ card }: Props) {
  // Trend panel — default collapsed; opens on click. Preserves
  // aria-expanded / aria-controls relationship.
  const [trendsOpen, setTrendsOpen] = useState(false);

  // Best confidence across present markets → header pill.
  let bestConfidence: ConfidenceTier = "no_play";
  let bestRank = 99;
  for (const m of MARKET_ORDER) {
    const row = card.rows[m];
    if (!row) continue;
    const r = CONFIDENCE_RANK[row.primary.confidence] ?? 99;
    if (r < bestRank) {
      bestRank = r;
      bestConfidence = row.primary.confidence;
    }
  }

  const matchupArrow = card.homeAway === "Home" ? "vs" : "at";
  const presentRows = MARKET_ORDER.map((m) => card.rows[m]).filter(
    (r): r is MarketRow => Boolean(r),
  );

  return (
    <article
      className="vault-deluxe-card p-5 sm:p-6"
      aria-label={`${card.playerName} — ${card.team} ${matchupArrow} ${card.opponent}`}
    >
      {/* ─── HEADER ─── */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className="font-display font-semibold tracking-tight truncate"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(18px, 2.4vw, 22px)",
              lineHeight: 1.15,
            }}
          >
            {card.playerName}
          </h3>
          <p
            className="mt-1 text-[13px] leading-snug truncate"
            style={{ color: "var(--vault-text-mute)" }}
          >
            <span style={{ color: "var(--vault-text)" }}>
              {card.team || EM_DASH}
            </span>{" "}
            <span style={{ color: "var(--vault-text-faint)" }}>
              {matchupArrow}
            </span>{" "}
            <span style={{ color: "var(--vault-text)" }}>
              {card.opponent || EM_DASH}
            </span>
            <span style={{ color: "var(--vault-text-faint)" }}> · </span>
            <span>{card.tipoff}</span>
          </p>
        </div>
        <ConfidenceTag confidence={bestConfidence} />
      </header>

      {/* ─── MARKET ROWS ─── */}
      <div className="mt-4">
        {presentRows.map((row, idx) => (
          <div key={row.market}>
            {idx > 0 && (
              <div
                className="my-4 h-px"
                style={{ background: "var(--vault-rule)" }}
              />
            )}
            <MarketRowView row={row} />
          </div>
        ))}
      </div>

      {/* ─── TRENDS TOGGLE + PANEL ─── */}
      <div
        className="mt-5 pt-4"
        style={{ borderTop: "1px solid var(--vault-rule)" }}
      >
        <button
          type="button"
          onClick={() => setTrendsOpen((v) => !v)}
          aria-expanded={trendsOpen}
          aria-controls={`trends-${card.cardKey}`}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[3px] transition-colors focus:outline-none focus-visible:ring-1"
          style={{
            background: trendsOpen
              ? "var(--vault-gold-dim)"
              : "transparent",
            color: trendsOpen
              ? "var(--vault-gold-bright)"
              : "var(--vault-text-mute)",
            border: `1px solid ${trendsOpen ? "var(--vault-border-strong)" : "var(--vault-rule)"}`,
          }}
        >
          <span className="text-[12px] font-medium tracking-tight">
            {trendsOpen ? "Hide last 10 trends" : "Show last 10 trends"}
          </span>
          <span
            className="font-mono text-[12px] leading-none transition-transform"
            style={{
              transform: trendsOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
            aria-hidden="true"
          >
            ▾
          </span>
        </button>

        {trendsOpen && (
          <div id={`trends-${card.cardKey}`} className="mt-3">
            <PlayerCardTrends card={card} />
          </div>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// One market row inside the card
// ---------------------------------------------------------------------------
function MarketRowView({ row }: { row: MarketRow }) {
  const lean = row.primary;
  const isPass = lean.lean === "No Play" || lean.lean === "Pass";
  const hasProjection =
    typeof lean.projection === "number" && Number.isFinite(lean.projection);
  const pickSide: "OVER" | "UNDER" | null =
    lean.lean === "Over" ? "OVER" : lean.lean === "Under" ? "UNDER" : null;
  const pickOdds = pickSide === "UNDER" ? lean.oddsUnder : lean.oddsOver;
  const altCount = row.alternates.length;
  const hasRiskFlags = (lean.riskFlags?.length ?? 0) > 0;
  const isSuspicious = Boolean(
    lean.riskFlags?.includes("suspicious_edge"),
  );
  const reasonText = lean.reason;
  const hasFiniteEdge =
    typeof lean.edgePct === "number" && Number.isFinite(lean.edgePct);
  const dampedEdge =
    hasFiniteEdge && Math.abs(lean.edgePct as number) >= SUSPICIOUS_EDGE_PCT;

  return (
    <section>
      {/* TOP — market label + pick badge */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="text-[13px] font-medium tracking-tight"
            style={{ color: "var(--vault-gold-bright)" }}
          >
            {marketLabel(row.market)}
          </span>
          {isPass && (
            <span
              className="text-[11px] tracking-tight"
              style={{ color: "var(--vault-text-faint)" }}
            >
              · model passes
            </span>
          )}
        </div>
        <PickBadge
          pickSide={pickSide}
          line={lean.line}
          odds={pickOdds}
        />
      </div>

      {/* HERO — projection vs line + edge */}
      {hasProjection ? (
        <div className="mt-3">
          <ProjectionLineRow
            projection={lean.projection as number}
            line={lean.line ?? null}
            pickSide={pickSide}
            edgePct={lean.edgePct ?? null}
            dampedEdge={dampedEdge}
            suspicious={isSuspicious}
          />
        </div>
      ) : (
        <p
          className="mt-3 text-[12px]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {lean.confidence === "no_play"
            ? "Model passes — below edge threshold."
            : "Projection unavailable — not enough recent log data."}
        </p>
      )}

      {/* META — implied · bookmaker · books · lines vary */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 text-[11px]">
        {hasFiniteEdge && (
          <span style={{ color: "var(--vault-text-faint)" }}>
            Implied{" "}
            <span
              className="tabular"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {formatPercent(lean.impliedProbability, 0)}
            </span>
          </span>
        )}
        <span style={{ color: "var(--vault-text-faint)" }}>
          {lean.bookmaker || EM_DASH}
        </span>
        {altCount > 0 && (
          <span
            className="px-1.5 py-0.5 rounded-[2px] text-[10px] tracking-tight"
            style={{
              color: "var(--vault-gold-bright)",
              background: "var(--vault-gold-dim)",
              border: "1px solid var(--vault-border-strong)",
            }}
            title={`Also offered by: ${row.bookmakers
              .filter((b) => b !== lean.bookmaker)
              .join(", ")}`}
          >
            +{altCount} {altCount === 1 ? "book" : "books"}
          </span>
        )}
        {row.hasMultipleLines && (
          <span style={{ color: "var(--vault-text-faint)" }}>
            · lines vary
          </span>
        )}
      </div>

      {/* RISK FLAGS — calm pill row */}
      {hasRiskFlags && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lean.riskFlags!.map((flag) => (
            <span
              key={flag}
              className="px-2 py-0.5 rounded-[3px] text-[10px] tracking-tight"
              style={{
                color: "var(--vault-warn)",
                background: "var(--vault-warn-dim)",
                border: "1px solid rgba(240, 199, 94, 0.30)",
              }}
            >
              {riskFlagLabel(flag)}
            </span>
          ))}
        </div>
      )}

      {/* REASON */}
      {reasonText && (
        <p
          className="mt-2 text-[12px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {reasonText}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Projection vs line visual — the new hero element of each market row.
// Renders the line on the left and the projection on the right (or vice
// versa) with a small directional bar between, so the gap is readable at
// a glance.
// ---------------------------------------------------------------------------
function ProjectionLineRow({
  projection,
  line,
  pickSide,
  edgePct,
  dampedEdge,
  suspicious,
}: {
  projection: number;
  line: number | null;
  pickSide: "OVER" | "UNDER" | null;
  edgePct: number | null;
  dampedEdge: boolean;
  suspicious: boolean;
}) {
  const projAboveLine = line != null ? projection > line : false;
  const direction: "above" | "below" | "equal" = (() => {
    if (line == null) return "equal";
    if (projection > line + 0.05) return "above";
    if (projection < line - 0.05) return "below";
    return "equal";
  })();

  // For the visual indicator we cap the rendered gap at ±50% of the line
  // value. Above 50% the bar fills the side completely; we don't try to
  // show "this is a 200% edge" visually since that scale is the whole point
  // of the model anomaly chip.
  let fillPct = 0;
  if (line != null && line > 0) {
    const ratio = Math.abs((projection - line) / line);
    fillPct = Math.max(0, Math.min(1, ratio / 0.5)) * 100;
  }

  return (
    <div>
      {/* Top row: labels + values */}
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div
            className="text-[10px] tracking-wide uppercase"
            style={{ color: "var(--vault-text-faint)" }}
          >
            Sportsbook line
          </div>
          <div
            className="mt-0.5 font-display font-semibold tabular tracking-tight"
            style={{
              color: "var(--vault-text-mute)",
              fontSize: "clamp(18px, 2.2vw, 22px)",
              lineHeight: 1.1,
            }}
          >
            {line != null ? formatStat(line) : EM_DASH}
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-[10px] tracking-wide uppercase"
            style={{ color: "var(--vault-text-faint)" }}
          >
            Model projection
          </div>
          <div
            className="mt-0.5 font-display font-semibold tabular tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(20px, 2.6vw, 26px)",
              lineHeight: 1.1,
            }}
          >
            {formatStat(projection)}
          </div>
        </div>
      </div>

      {/* Visual track + edge tag */}
      <div className="mt-2 flex items-center gap-3">
        <ProjectionVsLineTrack
          direction={direction}
          fillPct={fillPct}
          suspicious={suspicious}
        />
        <EdgeTag
          edgePct={edgePct}
          dampedEdge={dampedEdge}
          suspicious={suspicious}
        />
      </div>

      {/* Plain-English summary line */}
      <p
        className="mt-1.5 text-[11px]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {summaryLine({ direction, projection, line, pickSide })}
      </p>
    </div>
  );
}

function summaryLine({
  direction,
  projection,
  line,
  pickSide,
}: {
  direction: "above" | "below" | "equal";
  projection: number;
  line: number | null;
  pickSide: "OVER" | "UNDER" | null;
}): string {
  if (line == null || direction === "equal") {
    return "Projection sits on the line.";
  }
  const diff = Math.abs(projection - line).toFixed(1);
  const projTxt = formatStat(projection);
  const lineTxt = formatStat(line);
  if (direction === "above") {
    if (pickSide === "OVER")
      return `Model: ${projTxt} vs line ${lineTxt} — ${diff} above the line.`;
    return `Model: ${projTxt} vs line ${lineTxt} — ${diff} above; pick declined.`;
  }
  if (pickSide === "UNDER")
    return `Model: ${projTxt} vs line ${lineTxt} — ${diff} below the line.`;
  return `Model: ${projTxt} vs line ${lineTxt} — ${diff} below; pick declined.`;
}

// Horizontal track. Line is a tick mark in the middle; the fill bar
// extends from the middle toward the projection side, capped at the edge.
function ProjectionVsLineTrack({
  direction,
  fillPct,
  suspicious,
}: {
  direction: "above" | "below" | "equal";
  fillPct: number;
  suspicious: boolean;
}) {
  const fillColor = suspicious
    ? "var(--vault-warn)"
    : direction === "equal"
    ? "var(--vault-text-faint)"
    : "var(--vault-gold)";

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="relative flex-1 h-1.5 rounded-full overflow-hidden"
      style={{ background: "var(--vault-panel-elevated)" }}
    >
      {/* center tick */}
      <span
        className="absolute top-0 bottom-0 w-px"
        style={{
          left: "50%",
          background: "var(--vault-border-strong)",
          transform: "translateX(-0.5px)",
        }}
      />
      {/* fill */}
      {direction !== "equal" && fillPct > 0 && (
        <span
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            background: fillColor,
            left: direction === "below" ? `calc(50% - ${fillPct / 2}%)` : "50%",
            width: `${fillPct / 2}%`,
            opacity: 0.85,
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function PickBadge({
  pickSide,
  line,
  odds,
}: {
  pickSide: "OVER" | "UNDER" | null;
  line: number | null | undefined;
  odds: number | null | undefined;
}) {
  if (pickSide === null) {
    return (
      <span
        className="font-mono text-[11px] tabular tracking-wide"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {EM_DASH} {formatStat(line)}
      </span>
    );
  }
  const arrow = pickSide === "OVER" ? "↑" : "↓";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] tabular tracking-wide whitespace-nowrap"
      style={{
        color: "var(--vault-gold-bright)",
        background: "var(--vault-gold-dim)",
        border: "1px solid var(--vault-border-strong)",
      }}
    >
      <span aria-hidden="true">{arrow}</span>
      <span className="font-semibold">{pickSide}</span>
      <span style={{ color: "var(--vault-text)" }}>{formatStat(line)}</span>
      <span style={{ color: "var(--vault-text-mute)" }}>
        {formatOdds(odds)}
      </span>
    </span>
  );
}

function ConfidenceTag({ confidence }: { confidence: string }) {
  const cfg = CONFIDENCE_PILL[confidence] ?? CONFIDENCE_PILL.Low;
  return (
    <span
      className="vault-pill"
      style={{
        ["--pill-fg" as string]: cfg.fg,
        ["--pill-bg" as string]: cfg.bg,
        ["--pill-border" as string]: cfg.border,
      }}
    >
      {cfg.label}
    </span>
  );
}

function EdgeTag({
  edgePct,
  dampedEdge,
  suspicious,
}: {
  edgePct: number | null | undefined;
  dampedEdge: boolean;
  suspicious: boolean;
}) {
  const isFinite = typeof edgePct === "number" && Number.isFinite(edgePct);
  if (!isFinite) {
    return (
      <span
        className="font-mono font-semibold tabular tracking-wider rounded-[3px] px-2 py-0.5 text-[11px] whitespace-nowrap"
        style={{
          color: "var(--vault-text-faint)",
          background: "var(--vault-panel-elevated)",
          border: "1px solid var(--vault-border)",
        }}
      >
        {EM_DASH}
      </span>
    );
  }
  const sign = edgePct > 0 ? "+" : "";

  // Suspicious extreme edge → warn-tone treatment, not gold. This pairs
  // with the "Model anomaly" chip below the row so the card never reads
  // as "guaranteed money" no matter how large the headline number.
  if (dampedEdge && suspicious) {
    return (
      <span
        className="font-mono font-semibold tabular tracking-wider rounded-[3px] px-2 py-0.5 text-[11px] whitespace-nowrap"
        style={{
          color: "var(--vault-warn)",
          background: "var(--vault-warn-dim)",
          border: "1px solid rgba(240, 199, 94, 0.30)",
        }}
        title="Edge above 25% — visually capped because the model flagged this as an anomaly."
      >
        {sign}
        {edgePct.toFixed(1)}%
      </span>
    );
  }

  const positive = edgePct >= 0;
  return (
    <span
      className="font-mono font-semibold tabular tracking-wider rounded-[3px] px-2 py-0.5 text-[11px] whitespace-nowrap"
      style={{
        color: positive ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
        background: positive ? "var(--vault-gold-dim)" : "var(--vault-panel-elevated)",
        border: `1px solid ${
          positive ? "var(--vault-border-strong)" : "var(--vault-border)"
        }`,
      }}
    >
      {sign}
      {edgePct.toFixed(1)}%
    </span>
  );
}
