"use client";

/**
 * VaultPropCard — Phase 7B-6.
 *
 * Vault-themed prop card. Structured into clear sections:
 *   1. HEADER — matchup, tipoff, confidence pill, status
 *   2. PLAYER — name, market chip, "pass" chip if no recommendation
 *   3. PICK — side / line / odds / bookmaker
 *   4. MODEL — projection / edge / model vs implied
 *              OR "Projection unavailable" panel for insufficient_data
 *   5. CONTEXT — risk-flag chips + reasoning text
 *   6. FOOTER — bookmaker source label + reliability
 *
 * All numeric formatters are null-safe (Phase 7B-3.1 invariant).
 * No fake projections, no NaN, no "+0.0%".
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
  delay?: number;
}

export default function VaultPropCard({ lean, delay }: Props) {
  const delayClass = delay ? ` reveal-d${Math.min(delay, 6)}` : "";

  const isPass = lean.lean === "No Play" || lean.lean === "Pass";
  const hasProjection =
    typeof lean.projection === "number" && Number.isFinite(lean.projection);
  const hasModelOutput =
    typeof lean.modelProbability === "number" &&
    Number.isFinite(lean.modelProbability);

  const pickSide: "OVER" | "UNDER" | null =
    lean.lean === "Over" ? "OVER" : lean.lean === "Under" ? "UNDER" : null;
  const pickOdds = pickSide === "UNDER" ? lean.oddsUnder : lean.oddsOver;

  const projectionSub = hasProjection
    ? "model"
    : lean.confidence === "insufficient_data"
      ? "insufficient data"
      : lean.confidence === "no_play"
        ? "passed"
        : "unavailable";

  const hasRiskFlags = (lean.riskFlags?.length ?? 0) > 0;

  return (
    <article
      className={`rounded-[3px] p-5 transition-all duration-200 reveal${delayClass}`}
      style={{
        background: "var(--vault-panel)",
        border: "1px solid var(--vault-border)",
      }}
    >
      {/* HEADER */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="font-mono text-[10px] tracking-wider uppercase flex items-center gap-1.5 flex-wrap"
            style={{ color: "var(--vault-text-faint)" }}
          >
            <span style={{ color: "var(--vault-text-mute)" }}>
              {lean.team || EM_DASH}
            </span>
            <span style={{ color: "var(--vault-text-faint)" }}>
              {lean.homeAway === "Home" ? "vs" : "@"}
            </span>
            <span style={{ color: "var(--vault-text-mute)" }}>
              {lean.opponent || EM_DASH}
            </span>
            <span style={{ color: "var(--vault-text-faint)" }}>·</span>
            <span style={{ color: "var(--vault-text-faint)" }}>{lean.tipoff}</span>
          </div>
          <h3
            className="mt-1.5 font-display text-[19px] font-semibold tracking-tight truncate"
            style={{ color: "var(--vault-text)" }}
          >
            {lean.playerName}
          </h3>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <Chip label={marketLabel(lean.market)} tone="mute" />
            {isPass && <Chip label="pass" tone="mute" />}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <ConfidenceTag confidence={lean.confidence} />
        </div>
      </header>

      {/* PICK */}
      <section className="mt-4 grid grid-cols-3 gap-3">
        <PickCell pickSide={pickSide} />
        <Cell label="line" value={formatStat(lean.line)} />
        <Cell label="odds" value={formatOdds(pickOdds)} sub={lean.bookmaker} />
      </section>

      {/* MODEL */}
      {hasProjection || hasModelOutput ? (
        <section
          className="mt-4 pt-4 grid grid-cols-3 gap-3"
          style={{ borderTop: "1px solid var(--vault-border)" }}
        >
          <Cell
            label="projection"
            value={formatStat(lean.projection)}
            sub={projectionSub}
            mute={!hasProjection}
          />
          <div>
            <CellLabel>edge</CellLabel>
            <div className="mt-1.5">
              <EdgeTag edgePct={lean.edgePct} />
            </div>
            <div
              className="text-[10px] font-mono mt-1.5"
              style={{ color: "var(--vault-text-faint)" }}
            >
              {hasModelOutput
                ? `${formatPercent(lean.modelProbability, 0)} model`
                : "model output unavailable"}
            </div>
          </div>
          <Cell
            label="implied"
            value={formatPercent(lean.impliedProbability, 0)}
            sub={hasModelOutput ? "vs model" : "from odds"}
          />
        </section>
      ) : (
        <InsufficientPanel confidence={lean.confidence} />
      )}

      {/* CONTEXT */}
      {(hasRiskFlags || lean.reason) && (
        <section
          className="mt-4 pt-4"
          style={{ borderTop: "1px solid var(--vault-border)" }}
        >
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
        </section>
      )}

      {/* FOOTER */}
      {lean.bookmaker && (
        <footer
          className="mt-3 pt-3"
          style={{ borderTop: "1px solid var(--vault-border)" }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-wider"
            style={{ color: "var(--vault-text-faint)" }}
          >
            source · {lean.bookmaker}
          </span>
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
      className="font-mono text-[10px] tracking-wider uppercase"
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
}: {
  label: string;
  value: string;
  sub?: string;
  mute?: boolean;
}) {
  return (
    <div>
      <CellLabel>{label}</CellLabel>
      <div
        className="mt-0.5 font-display text-[18px] font-semibold tabular tracking-tight"
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
          className="mt-0.5 font-display text-[18px] font-semibold tabular tracking-tight"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {EM_DASH}
        </div>
        <div
          className="text-[10px] font-mono mt-0.5"
          style={{ color: "var(--vault-text-faint)" }}
        >
          no pick
        </div>
      </div>
    );
  }
  // Both Over and Under render in gold — the lean direction is shown via
  // the OVER/UNDER text, not via positive/negative coloring.
  return (
    <div>
      <CellLabel>pick</CellLabel>
      <div
        className="mt-0.5 font-display text-[18px] font-semibold tracking-tight"
        style={{ color: "var(--vault-gold-bright)" }}
      >
        {pickSide}
      </div>
      <div
        className="text-[10px] font-mono mt-0.5"
        style={{ color: "var(--vault-text-faint)" }}
      >
        model lean
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
      className="px-2 py-1 rounded-[2px] font-mono text-[10px] tracking-wider uppercase"
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
        className="font-mono font-semibold tabular tracking-wider uppercase rounded-[2px] px-3 py-1 text-[13px]"
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
  // Gold for positive, muted for negative — clearly distinguishable
  // without using anything that could be misread as betting hype.
  const positive = edgePct >= 0;
  const sign = edgePct > 0 ? "+" : "";
  return (
    <span
      className="font-mono font-semibold tabular tracking-wider uppercase rounded-[2px] px-3 py-1 text-[13px]"
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

function InsufficientPanel({ confidence }: { confidence: string }) {
  const headline =
    confidence === "no_play"
      ? "Model passed on this prop"
      : "Projection unavailable";
  const detail =
    confidence === "no_play"
      ? "Below the model's edge threshold or flagged for risk."
      : "Player game logs were not available for this run, so no projection or edge was computed. The line and odds above are real sportsbook data.";

  return (
    <section
      className="mt-4 pt-4 flex items-start gap-3"
      style={{ borderTop: "1px solid var(--vault-border)" }}
    >
      <div
        className="font-mono text-[9px] tracking-wider uppercase mt-0.5 shrink-0"
        style={{ color: "var(--vault-text-faint)" }}
      >
        model
      </div>
      <div className="flex-1">
        <div
          className="font-display text-[14px] font-semibold tracking-tight"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {headline}
        </div>
        <div
          className="mt-1 text-[12px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {detail}
        </div>
      </div>
    </section>
  );
}
