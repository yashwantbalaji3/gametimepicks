import type { MlbBoardLean } from "@/lib/types-mlb";
import {
  formatAmericanOdds,
  formatEdgePct,
  mlbMarketLabel,
} from "@/lib/format-mlb";

/**
 * Single-lean row for the MLB board. Works for both pitcher (strikeouts)
 * and batter (hits / total bases / HRR) markets. Confidence tier drives
 * the right-side chip and the rim accent.
 */
interface Props {
  lean: MlbBoardLean;
}

function confidenceMeta(tier: MlbBoardLean["confidence"]): {
  label: string;
  fg: string;
  bg: string;
} {
  switch (tier) {
    case "High":
      return {
        label: "High",
        fg: "var(--vault-success)",
        bg: "rgba(74, 222, 128, 0.08)",
      };
    case "Medium":
      return {
        label: "Medium",
        fg: "var(--vault-gold-bright)",
        bg: "rgba(240, 199, 94, 0.08)",
      };
    case "Low":
      return {
        label: "Low",
        fg: "var(--vault-warn)",
        bg: "rgba(212, 175, 55, 0.06)",
      };
    case "insufficient_data":
      return {
        label: "Sample too small",
        fg: "var(--vault-text-faint)",
        bg: "rgba(255, 255, 255, 0.02)",
      };
    default:
      return {
        label: "Pass",
        fg: "var(--vault-text-mute)",
        bg: "rgba(255, 255, 255, 0.02)",
      };
  }
}

export default function MlbLeanRow({ lean }: Props) {
  const meta = confidenceMeta(lean.confidence);
  const hasProj = lean.projection !== null && lean.confidence !== "insufficient_data";
  const directionalOdds =
    lean.lean === "Over"
      ? formatAmericanOdds(lean.oddsOver)
      : lean.lean === "Under"
        ? formatAmericanOdds(lean.oddsUnder)
        : "—";
  const isAnomaly = (lean.riskFlags || []).includes("r5_model_anomaly");

  return (
    <div
      className="flex flex-wrap items-start gap-3 rounded-[3px] overflow-hidden"
      style={{
        padding: "12px 14px",
        border: "1px solid var(--vault-border)",
        background:
          "linear-gradient(180deg, rgba(14, 21, 48, 0.45) 0%, rgba(7, 11, 26, 0.55) 100%)",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <div className="flex flex-col gap-1 min-w-0 flex-1" style={{ maxWidth: "100%" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>
            {lean.playerName}
          </span>
          <span
            className="font-mono uppercase tracking-[0.12em]"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            {mlbMarketLabel(lean.marketKey)}
          </span>
          {isAnomaly && (
            <span
              className="font-mono uppercase tracking-[0.12em]"
              style={{
                color: "var(--vault-warn)",
                fontSize: 10,
                background: "rgba(212, 175, 55, 0.08)",
                borderRadius: 2,
                padding: "1px 6px",
              }}
            >
              R5 model anomaly
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono" style={{ color: "var(--vault-text-mute)" }}>
          <span>
            {lean.lean === "Pass" || lean.lean === "No Play" ? (
              <span>no play</span>
            ) : (
              <>
                <span style={{ color: "var(--vault-gold-bright)" }}>{lean.lean}</span>{" "}
                <span style={{ color: "var(--vault-text)" }}>{lean.line}</span>
              </>
            )}
          </span>
          <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>·</span>
          <span>
            {hasProj ? (
              <>
                proj <span style={{ color: "var(--vault-text)" }}>{lean.projection}</span>
              </>
            ) : (
              <span>no projection — {meta.label.toLowerCase()}</span>
            )}
          </span>
          <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>·</span>
          <span>{lean.bookmaker}</span>
        </div>
        {lean.reason && (
          <div
            className="text-[11px] leading-snug"
            style={{ color: "var(--vault-text-faint)" }}
          >
            {lean.reason}
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 ml-3 shrink-0">
        <span
          className="font-mono"
          style={{
            color: meta.fg,
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            background: meta.bg,
            borderRadius: 2,
            padding: "2px 8px",
          }}
        >
          {meta.label}
        </span>
        {hasProj && lean.edgePct !== null && (
          <span
            className="font-mono"
            style={{ color: "var(--vault-text)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}
          >
            edge {formatEdgePct(lean.edgePct)}
          </span>
        )}
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
          {directionalOdds}
        </span>
      </div>
    </div>
  );
}
