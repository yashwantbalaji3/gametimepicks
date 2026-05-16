import type { MlbBoardLean } from "@/lib/types-mlb";
import {
  formatAmericanOdds,
  formatEdgePct,
  mlbMarketLabel,
} from "@/lib/format-mlb";
import MlbPlayerAvatar from "./mlb-player-avatar";

/**
 * Single-lean row for the MLB board. Sibling to the NBA vault-player-card
 * — but trimmed because MLB markets are one-line (line + projection + edge)
 * rather than the 3-market grid NBA needs.
 *
 * Layout (vertical stack at any width — predictable on 390 px and 1280 px):
 *   Row 1:  [avatar] [name + team vs opp · role]         [conf chip]
 *   Row 2:  [market · Over 1.5 · proj 1.5]               [edge +9.8%]
 *   Row 3:  [reason text]                                [odds · book]
 */
interface Props {
  lean: MlbBoardLean;
}

function confidenceMeta(tier: MlbBoardLean["confidence"]): {
  label: string;
  fg: string;
  bg: string;
  rim: string;
} {
  switch (tier) {
    case "High":
      return {
        label: "High",
        fg: "var(--vault-success)",
        bg: "rgba(74, 222, 128, 0.10)",
        rim: "rgba(74, 222, 128, 0.35)",
      };
    case "Medium":
      return {
        label: "Medium",
        fg: "var(--vault-gold-bright)",
        bg: "rgba(240, 199, 94, 0.10)",
        rim: "rgba(240, 199, 94, 0.30)",
      };
    case "Low":
      return {
        label: "Low",
        fg: "var(--vault-warn)",
        bg: "rgba(212, 175, 55, 0.06)",
        rim: "rgba(212, 175, 55, 0.18)",
      };
    case "insufficient_data":
      return {
        label: "Sample too small",
        fg: "var(--vault-text-faint)",
        bg: "rgba(255, 255, 255, 0.02)",
        rim: "rgba(255, 255, 255, 0.05)",
      };
    default:
      return {
        label: "Pass",
        fg: "var(--vault-text-mute)",
        bg: "rgba(255, 255, 255, 0.02)",
        rim: "rgba(255, 255, 255, 0.05)",
      };
  }
}

export default function MlbLeanRow({ lean }: Props) {
  const meta = confidenceMeta(lean.confidence);
  const hasProj =
    lean.projection !== null && lean.confidence !== "insufficient_data";
  const directionalOdds =
    lean.lean === "Over"
      ? formatAmericanOdds(lean.oddsOver)
      : lean.lean === "Under"
        ? formatAmericanOdds(lean.oddsUnder)
        : "—";
  const isAnomaly = (lean.riskFlags || []).includes("r5_model_anomaly");

  const teamAbbr = lean.playerTeamAbbr ?? "—";
  const oppAbbr = lean.opponentAbbr ?? "—";

  return (
    <div
      className="flex flex-col gap-2 rounded-[4px] overflow-hidden"
      style={{
        padding: "12px 14px",
        border: `1px solid ${meta.rim}`,
        background:
          "linear-gradient(180deg, rgba(14, 21, 48, 0.55) 0%, rgba(7, 11, 26, 0.62) 100%)",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      {/* Row 1: identity cluster + confidence chip */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <MlbPlayerAvatar
            playerId={lean.playerId}
            playerName={lean.playerName}
            team={lean.playerTeamAbbr}
            role={lean.playerRole}
            size="md"
          />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                style={{
                  color: "var(--vault-text)",
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: 1.2,
                }}
              >
                {lean.playerName}
              </span>
              {isAnomaly && (
                <span
                  className="font-mono uppercase tracking-[0.12em]"
                  style={{
                    color: "var(--vault-warn)",
                    fontSize: 9,
                    background: "rgba(212, 175, 55, 0.10)",
                    borderRadius: 2,
                    padding: "1px 6px",
                    border: "1px solid rgba(212, 175, 55, 0.30)",
                  }}
                >
                  R5 anomaly
                </span>
              )}
            </div>
            <div
              className="flex items-center gap-2 text-[11px] font-mono"
              style={{ color: "var(--vault-text-mute)" }}
            >
              <span>{teamAbbr}</span>
              <span style={{ color: "var(--vault-text-faint)" }}>vs</span>
              <span>{oppAbbr}</span>
              <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>
                ·
              </span>
              <span
                className="uppercase tracking-[0.12em]"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {lean.playerRole === "pitcher" ? "Pitcher" : "Batter"}
              </span>
            </div>
          </div>
        </div>
        <span
          className="font-mono shrink-0"
          style={{
            color: meta.fg,
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            background: meta.bg,
            borderRadius: 2,
            padding: "3px 8px",
            border: `1px solid ${meta.rim}`,
            whiteSpace: "nowrap",
          }}
        >
          {meta.label}
        </span>
      </div>

      {/* Row 2: market line + edge */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div
          className="flex items-baseline gap-2 flex-wrap min-w-0"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <span
            className="font-mono uppercase tracking-[0.12em]"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            {mlbMarketLabel(lean.marketKey)}
          </span>
          {lean.lean === "Pass" || lean.lean === "No Play" ? (
            <span
              className="font-mono text-[12px]"
              style={{ color: "var(--vault-text-mute)" }}
            >
              no play
            </span>
          ) : (
            <span
              className="font-mono text-[13px]"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              <span style={{ color: "var(--vault-gold-bright)" }}>
                {lean.lean}
              </span>{" "}
              <span style={{ color: "var(--vault-text)" }}>{lean.line}</span>
            </span>
          )}
          {hasProj ? (
            <span
              className="font-mono text-[11px]"
              style={{
                color: "var(--vault-text-mute)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              proj{" "}
              <span style={{ color: "var(--vault-text)" }}>
                {lean.projection}
              </span>
            </span>
          ) : (
            <span
              className="font-mono text-[11px]"
              style={{ color: "var(--vault-text-faint)" }}
            >
              no projection
            </span>
          )}
        </div>
        {hasProj && lean.edgePct !== null && (
          <span
            className="font-mono shrink-0"
            style={{
              color: "var(--vault-text)",
              fontSize: 13,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            edge {formatEdgePct(lean.edgePct)}
          </span>
        )}
      </div>

      {/* Row 3: reason text + odds + bookmaker. Reason can be empty. */}
      {(lean.reason || lean.lean !== "Pass") && (
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div
            className="text-[11px] leading-snug min-w-0"
            style={{ color: "var(--vault-text-faint)", maxWidth: "100%" }}
          >
            {lean.reason}
          </div>
          <div
            className="font-mono shrink-0"
            style={{
              color: "var(--vault-text-faint)",
              fontSize: 11,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {directionalOdds} · {lean.bookmaker}
          </div>
        </div>
      )}
    </div>
  );
}
