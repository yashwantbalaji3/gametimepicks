"use client";

/**
 * VaultPlayerCard — Phase 7C player-first card.
 *
 * One card per (date, gameId, playerId). Inside, up to three market
 * rows (PTS / REB / AST). Each market row shows the primary lean's
 * pick / line / odds / projection / edge / confidence, with a compact
 * "+N books" indicator when multiple bookmakers offered the prop.
 *
 * Underlying alternates are PRESERVED in the data — this component
 * only collapses them visually. Tests verify nothing is dropped.
 *
 * Confidence pill at the top right reflects the BEST confidence among
 * the markets in the card (so a player with one High and two no_play
 * rows still reads as High overall).
 */
import type { Market, ConfidenceTier, PropLean } from "@/lib/types";
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

const CONFIDENCE_CFG: Record<
  string,
  { color: string; bg: string; border: string; label: string }
> = {
  High: {
    color: "var(--vault-gold-bright)",
    bg: "var(--vault-gold-dim)",
    border: "var(--vault-border-strong)",
    label: "High",
  },
  Medium: {
    color: "var(--vault-warn)",
    bg: "var(--vault-warn-dim)",
    border: "rgba(240, 199, 94, 0.30)",
    label: "Medium",
  },
  Low: {
    color: "var(--vault-text-mute)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "Low",
  },
  insufficient_data: {
    color: "var(--vault-text-faint)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "no data",
  },
  no_play: {
    color: "var(--vault-text-faint)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "pass",
  },
};

const MARKET_ORDER: Market[] = ["PTS", "REB", "AST"];

// PR 19: friendlier labels for guardrail-emitted riskFlags. Anything not in
// this map falls back to the existing underscore-to-space transform.
const RISK_FLAG_LABEL: Record<string, string> = {
  suspicious_edge: "model anomaly",
};

function riskFlagLabel(flag: string): string {
  return RISK_FLAG_LABEL[flag] ?? flag.replace(/_/g, " ");
}

export default function VaultPlayerCard({ card }: Props) {
  // Phase 9: trend panel expand state. Default collapsed; user opts in
  // by clicking "Show last 10 trends".
  const [trendsOpen, setTrendsOpen] = useState(false);

  // Compute the best confidence across present markets for the header pill.
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

  return (
    <article
      className="vault-card-elevated rounded-[3px] p-4 sm:p-5"
      style={{
        background: "var(--vault-panel)",
      }}
    >
      {/* ─── HEADER ─── */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className="font-display text-[17px] sm:text-[18px] font-semibold tracking-tight truncate"
            style={{ color: "var(--vault-text)" }}
          >
            {card.playerName}
          </h3>
          <div
            className="mt-0.5 font-mono text-[10px] tracking-wider uppercase truncate"
            style={{ color: "var(--vault-text-faint)" }}
          >
            <span style={{ color: "var(--vault-text-mute)" }}>
              {card.team || EM_DASH}
            </span>
            <span> {card.homeAway === "Home" ? "vs" : "@"} </span>
            <span style={{ color: "var(--vault-text-mute)" }}>
              {card.opponent || EM_DASH}
            </span>
            <span style={{ color: "var(--vault-text-faint)" }}> · </span>
            <span>{card.tipoff}</span>
          </div>
        </div>
        <ConfidenceTag confidence={bestConfidence} />
      </header>

      {/* ─── MARKET ROWS ─── */}
      <div className="mt-3">
        {MARKET_ORDER.map((m, idx) => {
          const row = card.rows[m];
          if (!row) return null;
          return (
            <div key={m}>
              {idx > 0 && (
                <div
                  className="my-3 h-px"
                  style={{ background: "var(--vault-rule)" }}
                />
              )}
              <MarketRowView row={row} />
            </div>
          );
        })}
      </div>

      {/* ─── TRENDS TOGGLE + PANEL (Phase 9) ─── */}
      <div
        className="mt-4 pt-3"
        style={{ borderTop: "1px solid var(--vault-rule)" }}
      >
        <button
          type="button"
          onClick={() => setTrendsOpen((v) => !v)}
          aria-expanded={trendsOpen}
          aria-controls={`trends-${card.cardKey}`}
          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-[2px] transition-colors focus:outline-none focus-visible:ring-1"
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
          <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
            {trendsOpen ? "hide last 10 trends" : "show last 10 trends"}
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
  const reasonText = lean.reason;
  const hasRiskFlags = (lean.riskFlags?.length ?? 0) > 0;

  return (
    <section>
      {/* Top — market label + pick + line + odds */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="font-mono text-[11px] uppercase tracking-[0.18em] shrink-0"
            style={{ color: "var(--vault-gold)" }}
          >
            {marketLabel(row.market)}
          </span>
          {isPass && (
            <span
              className="font-mono text-[10px] tracking-wider uppercase"
              style={{ color: "var(--vault-text-faint)" }}
            >
              · pass
            </span>
          )}
        </div>
        <PickInline
          pickSide={pickSide}
          line={lean.line}
          odds={pickOdds}
        />
      </div>

      {/* Mid — projection / edge / implied (or insufficient line) */}
      {hasProjection ? (
        <div className="mt-2 grid grid-cols-3 gap-3">
          <Cell
            label="projection"
            value={formatStat(lean.projection)}
          />
          <div>
            <CellLabel>edge</CellLabel>
            <div className="mt-0.5">
              <EdgeTag edgePct={lean.edgePct} />
            </div>
          </div>
          <Cell
            label="implied"
            value={formatPercent(lean.impliedProbability, 0)}
            valueClass="text-[14px]"
          />
        </div>
      ) : (
        <p
          className="mt-2 font-mono text-[10px] tracking-wider uppercase"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {lean.confidence === "no_play"
            ? "model passed · below threshold"
            : "projection unavailable · insufficient data"}
        </p>
      )}

      {/* Bottom — bookmaker + "+N books" + reason + risk flags */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className="font-mono text-[10px] tracking-wider uppercase"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {lean.bookmaker || EM_DASH}
        </span>
        {altCount > 0 && (
          <span
            className="px-1.5 py-0.5 rounded-[2px] font-mono text-[9px] tracking-wider uppercase"
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
          <span
            className="font-mono text-[9px] tracking-wider uppercase"
            style={{ color: "var(--vault-text-faint)" }}
          >
            · lines vary
          </span>
        )}
      </div>

      {hasRiskFlags && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {lean.riskFlags!.map((flag) => (
            <span
              key={flag}
              className="px-1.5 py-0.5 rounded-[2px] font-mono text-[9px] tracking-wider uppercase"
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

      {reasonText && (
        <p
          className="mt-1.5 text-[11px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {reasonText}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-mono text-[10px] tracking-[0.18em] uppercase"
      style={{ color: "var(--vault-text-faint)" }}
    >
      {children}
    </div>
  );
}

function Cell({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <CellLabel>{label}</CellLabel>
      <div
        className={`mt-0.5 font-display font-semibold tabular tracking-tight ${valueClass ?? "text-[15px]"}`}
        style={{ color: "var(--vault-text)" }}
      >
        {value}
      </div>
    </div>
  );
}

function PickInline({
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
      <div
        className="font-mono text-[11px] tabular tracking-wider"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {EM_DASH} {formatStat(line)}{" "}
        <span style={{ color: "var(--vault-text-faint)", opacity: 0.6 }}>
          {formatOdds(odds)}
        </span>
      </div>
    );
  }
  return (
    <div className="font-mono text-[12px] tabular tracking-wider whitespace-nowrap">
      <span
        className="font-semibold"
        style={{ color: "var(--vault-gold-bright)" }}
      >
        {pickSide}
      </span>{" "}
      <span style={{ color: "var(--vault-text)" }}>{formatStat(line)}</span>{" "}
      <span style={{ color: "var(--vault-text-mute)" }}>
        {formatOdds(odds)}
      </span>
    </div>
  );
}

function ConfidenceTag({ confidence }: { confidence: string }) {
  const cfg = CONFIDENCE_CFG[confidence] ?? CONFIDENCE_CFG.Low;
  return (
    <span
      className="px-2 py-1 rounded-[2px] font-mono text-[10px] tracking-wider uppercase shrink-0"
      style={{
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {cfg.label}
    </span>
  );
}

function EdgeTag({ edgePct }: { edgePct: number | null | undefined }) {
  const isFinite = typeof edgePct === "number" && Number.isFinite(edgePct);
  if (!isFinite) {
    return (
      <span
        className="font-mono font-semibold tabular tracking-wider uppercase rounded-[2px] px-2 py-0.5 text-[11px]"
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
  const positive = edgePct >= 0;
  const sign = edgePct > 0 ? "+" : "";
  return (
    <span
      className="font-mono font-semibold tabular tracking-wider uppercase rounded-[2px] px-2 py-0.5 text-[11px]"
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
