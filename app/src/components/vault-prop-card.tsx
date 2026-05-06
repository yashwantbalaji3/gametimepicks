"use client";

/**
 * VaultPropCard — Phase 7B-7 refined card.
 *
 * Cleaner visual hierarchy:
 *   1. HEADER — player name on its own line; matchup + market as quiet
 *      metadata; confidence pill on the right.
 *   2. PICK ROW — 4 cells: pick / line / odds / source.
 *   3. RULE — subtle gold divider.
 *   4. MODEL ROW — 3 cells (proj / edge / implied) for graded rows;
 *      single muted line ("projection unavailable · insufficient data")
 *      for `insufficient_data` / `no_play` rows. No more big "model"
 *      panel for the no-data case.
 *   5. FOOTER — risk-flag chips + reasoning text inline; bookmaker omitted
 *      because it's already in the pick row.
 *
 * All numeric formatters are null-safe (Phase 7B-3.1 invariant). No NaN,
 * no fake +0.0%, no fabricated projections.
 */
import type { PropLean } from "@/lib/types";
import {
  formatPercent,
  formatOdds,
  formatStat,
  marketLabel,
  EM_DASH,
} from "@/lib/format";

interface Props {
  lean: PropLean;
}

export default function VaultPropCard({ lean }: Props) {
  const isPass = lean.lean === "No Play" || lean.lean === "Pass";
  const hasProjection =
    typeof lean.projection === "number" && Number.isFinite(lean.projection);
  const hasModelOutput =
    typeof lean.modelProbability === "number" &&
    Number.isFinite(lean.modelProbability);
  const hasModel = hasProjection || hasModelOutput;

  const pickSide: "OVER" | "UNDER" | null =
    lean.lean === "Over" ? "OVER" : lean.lean === "Under" ? "UNDER" : null;
  const pickOdds = pickSide === "UNDER" ? lean.oddsUnder : lean.oddsOver;
  const hasRiskFlags = (lean.riskFlags?.length ?? 0) > 0;

  return (
    <article
      className="rounded-[3px] p-5 transition-all duration-150"
      style={{
        background: "var(--vault-panel)",
        border: "1px solid var(--vault-border)",
      }}
    >
      {/* ─── HEADER ─── */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className="font-display text-[18px] font-semibold tracking-tight truncate"
            style={{ color: "var(--vault-text)" }}
          >
            {lean.playerName}
          </h3>
          <div
            className="mt-0.5 font-mono text-[10px] tracking-wider uppercase truncate"
            style={{ color: "var(--vault-text-faint)" }}
          >
            <span style={{ color: "var(--vault-text-mute)" }}>
              {lean.team || EM_DASH}
            </span>
            <span> {lean.homeAway === "Home" ? "vs" : "@"} </span>
            <span style={{ color: "var(--vault-text-mute)" }}>
              {lean.opponent || EM_DASH}
            </span>
            <span style={{ color: "var(--vault-text-faint)" }}> · </span>
            <span>{lean.tipoff}</span>
            <span style={{ color: "var(--vault-text-faint)" }}> · </span>
            <span style={{ color: "var(--vault-gold)" }}>
              {marketLabel(lean.market)}
            </span>
            {isPass && (
              <>
                <span style={{ color: "var(--vault-text-faint)" }}> · </span>
                <span>pass</span>
              </>
            )}
          </div>
        </div>
        <ConfidenceTag confidence={lean.confidence} />
      </header>

      {/* ─── PICK ROW ─── */}
      <section className="mt-4 grid grid-cols-4 gap-3">
        <PickCell pickSide={pickSide} />
        <Cell label="line" value={formatStat(lean.line)} />
        <Cell label="odds" value={formatOdds(pickOdds)} />
        <Cell
          label="source"
          value={lean.bookmaker || EM_DASH}
          valueClass="text-[12px]"
          mute
        />
      </section>

      {/* ─── DIVIDER ─── */}
      <div
        className="mt-4 h-px"
        style={{ background: "var(--vault-rule)" }}
      />

      {/* ─── MODEL ROW ─── */}
      {hasModel ? (
        <section className="mt-4 grid grid-cols-3 gap-3">
          <Cell
            label="projection"
            value={formatStat(lean.projection)}
            mute={!hasProjection}
          />
          <div>
            <CellLabel>edge</CellLabel>
            <div className="mt-0.5">
              <EdgeTag edgePct={lean.edgePct} />
            </div>
          </div>
          <Cell
            label={hasModelOutput ? "model · implied" : "implied"}
            value={
              hasModelOutput
                ? `${formatPercent(lean.modelProbability, 0)} / ${formatPercent(lean.impliedProbability, 0)}`
                : formatPercent(lean.impliedProbability, 0)
            }
            valueClass="text-[14px]"
          />
        </section>
      ) : (
        <p
          className="mt-3 font-mono text-[11px] tracking-wider uppercase"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {lean.confidence === "no_play"
            ? "model passed · below threshold"
            : "projection unavailable · insufficient data"}
        </p>
      )}

      {/* ─── FOOTER (reasoning + risk flags) ─── */}
      {(hasRiskFlags || lean.reason) && (
        <footer className="mt-4">
          {hasRiskFlags && (
            <div className="flex flex-wrap gap-1 mb-2">
              {lean.riskFlags!.map((flag) => (
                <Chip key={flag} label={flag.replace(/_/g, " ")} tone="warn" />
              ))}
            </div>
          )}
          {lean.reason && (
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {lean.reason}
            </p>
          )}
        </footer>
      )}
    </article>
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
  sub,
  mute,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  mute?: boolean;
  valueClass?: string;
}) {
  return (
    <div>
      <CellLabel>{label}</CellLabel>
      <div
        className={`mt-0.5 font-display font-semibold tabular tracking-tight ${valueClass ?? "text-[16px]"}`}
        style={{ color: mute ? "var(--vault-text-faint)" : "var(--vault-text)" }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="text-[10px] font-mono mt-0.5"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function PickCell({ pickSide }: { pickSide: "OVER" | "UNDER" | null }) {
  if (pickSide === null) {
    return (
      <div>
        <CellLabel>pick</CellLabel>
        <div
          className="mt-0.5 font-display text-[16px] font-semibold tabular tracking-tight"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {EM_DASH}
        </div>
      </div>
    );
  }
  return (
    <div>
      <CellLabel>pick</CellLabel>
      <div
        className="mt-0.5 font-display text-[16px] font-semibold tracking-tight"
        style={{ color: "var(--vault-gold-bright)" }}
      >
        {pickSide}
      </div>
    </div>
  );
}

function Chip({
  label,
  tone,
}: {
  label: string;
  tone: "mute" | "gold" | "warn";
}) {
  let color = "var(--vault-text-mute)";
  let bg = "var(--vault-panel-elevated)";
  let border = "var(--vault-border)";
  if (tone === "gold") {
    color = "var(--vault-gold-bright)";
    bg = "var(--vault-gold-dim)";
    border = "var(--vault-border-strong)";
  } else if (tone === "warn") {
    color = "var(--vault-warn)";
    bg = "var(--vault-warn-dim)";
    border = "rgba(240, 199, 94, 0.30)";
  }
  return (
    <span
      className="px-2 py-0.5 rounded-[2px] font-mono text-[10px] tracking-wider uppercase"
      style={{
        color,
        background: bg,
        border: `1px solid ${border}`,
      }}
    >
      {label}
    </span>
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

function EdgeTag({ edgePct }: { edgePct: number | null | undefined }) {
  const isFinite = typeof edgePct === "number" && Number.isFinite(edgePct);
  if (!isFinite) {
    return (
      <span
        className="font-mono font-semibold tabular tracking-wider uppercase rounded-[2px] px-2.5 py-0.5 text-[12px]"
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
      className="font-mono font-semibold tabular tracking-wider uppercase rounded-[2px] px-2.5 py-0.5 text-[12px]"
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
