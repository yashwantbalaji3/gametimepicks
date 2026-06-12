import Link from "next/link";
import type { MlbBoardLean } from "@/lib/types-mlb";
import {
  formatAmericanOdds,
  formatEdgePct,
  mlbMarketLabel,
} from "@/lib/format-mlb";
import MlbPlayerAvatar from "./mlb-player-avatar";

/**
 * MlbTopLeansStrip — sibling to NBA's Featured Headliners rail.
 *
 * Surfaces the day's best CLEAN model leans so a first-time visitor can
 * see what the model surfaced without scrolling through 15 game sections.
 *
 * Selection rules — strict, no fabrication:
 *   - confidence ∈ {High, Medium}
 *   - projection + edgePct are real numbers
 *   - no r5_model_anomaly riskFlag
 *   - no insufficient_data
 *
 * Sorting — balanced score to avoid over-rewarding extreme edges:
 *   - confidence first (High > Medium)
 *   - then edge capped at 15 pp (clamps so a 25 pp lean doesn't dominate)
 *   - tiebreaker: prefer leans with recentSeries data attached
 *
 * Anchor links: each tile points to `#${lean.id}` which scrolls to the
 * matching lean row in the game sections below. No JS needed — native.
 */
interface Props {
  leans: MlbBoardLean[];
  /** Hard cap on tile count. Defaults to 8. */
  max?: number;
}

const EDGE_CAP_PP = 15;

function score(lean: MlbBoardLean): number {
  const confBoost = lean.confidence === "High" ? 100 : 50;
  const cappedEdge = Math.min(Math.abs(lean.edgePct ?? 0), EDGE_CAP_PP);
  const recentBonus = lean.recentSeries && lean.recentSeries.length > 0 ? 1 : 0;
  return confBoost + cappedEdge + recentBonus;
}

function isCleanCandidate(lean: MlbBoardLean): boolean {
  if (lean.confidence !== "High" && lean.confidence !== "Medium") return false;
  if (lean.projection === null) return false;
  if (lean.edgePct === null || !Number.isFinite(lean.edgePct)) return false;
  if ((lean.riskFlags || []).includes("r5_model_anomaly")) return false;
  return true;
}

export default function MlbTopLeansStrip({ leans, max = 8 }: Props) {
  const clean = leans
    .filter(isCleanCandidate)
    .sort((a, b) => score(b) - score(a))
    .slice(0, max);

  if (clean.length === 0) {
    // Honest empty state — never fabricate a tile.
    return (
      <section
        aria-label="Top clean MLB leans"
        className="mt-2 rounded-[6px] px-4 py-4 text-[12px]"
        style={{
          background: "rgba(26, 16, 11, 0.5)",
          border: "1px solid var(--vault-border)",
          color: "var(--vault-text-mute)",
        }}
      >
        <div
          className="font-mono uppercase tracking-[0.16em] mb-1"
          style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
        >
          top clean leans · pending
        </div>
        No High or Medium clean leans on today&apos;s slate yet. Once prop
        lines post and the model scores them, the day&apos;s best calls
        surface here.
      </section>
    );
  }

  return (
    <section aria-label="Top clean MLB leans" className="mt-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px rgba(240, 199, 94, 0.6)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
          >
            Top clean leans · {clean.length} loaded
          </span>
        </div>
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          High &amp; Medium · no model anomalies
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {clean.map((lean) => {
          const isHigh = lean.confidence === "High";
          return (
            <Link
              key={lean.id}
              href={`#${lean.id}`}
              className="block rounded-[4px] vault-glow-hover"
              style={{
                padding: "10px 12px",
                border: `1px solid ${
                  isHigh
                    ? "rgba(74, 222, 128, 0.30)"
                    : "rgba(240, 199, 94, 0.25)"
                }`,
                background:
                  "linear-gradient(180deg, rgba(14, 21, 48, 0.55) 0%, rgba(26, 16, 11, 0.62) 100%)",
                scrollMarginTop: 80,
              }}
              aria-label={`Jump to ${lean.playerName} ${mlbMarketLabel(lean.marketKey)} ${lean.lean} ${lean.line}`}
            >
              <div className="flex items-center gap-2.5">
                <MlbPlayerAvatar
                  playerId={lean.playerId}
                  playerName={lean.playerName}
                  team={lean.playerTeamAbbr}
                  role={lean.playerRole}
                  size="sm"
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className="text-[13px] truncate"
                    style={{ color: "var(--vault-text)", fontWeight: 600 }}
                  >
                    {lean.playerName}
                  </span>
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.10em]"
                    style={{ color: "var(--vault-text-faint)" }}
                  >
                    {(lean.playerTeamAbbr ?? "—") +
                      " vs " +
                      (lean.opponentAbbr ?? "—")}
                  </span>
                </div>
                <span
                  className="font-mono shrink-0"
                  style={{
                    color: isHigh
                      ? "var(--vault-success)"
                      : "var(--vault-gold-bright)",
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    background: isHigh
                      ? "rgba(74, 222, 128, 0.10)"
                      : "rgba(240, 199, 94, 0.10)",
                    borderRadius: 2,
                    padding: "2px 6px",
                    border: `1px solid ${
                      isHigh
                        ? "rgba(74, 222, 128, 0.30)"
                        : "rgba(240, 199, 94, 0.30)"
                    }`,
                  }}
                >
                  {lean.confidence}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-mono">
                <span style={{ color: "var(--vault-text-mute)" }}>
                  <span
                    style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
                    className="uppercase tracking-[0.12em] mr-1"
                  >
                    {mlbMarketLabel(lean.marketKey)}
                  </span>
                  <span style={{ color: "var(--vault-gold-bright)" }}>
                    {lean.lean}
                  </span>{" "}
                  <span
                    style={{
                      color: "var(--vault-text)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {lean.line}
                  </span>
                </span>
                <span
                  style={{
                    color: "var(--vault-text)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatEdgePct(lean.edgePct)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-mono">
                <span style={{ color: "var(--vault-text-faint)" }}>
                  proj{" "}
                  <span style={{ color: "var(--vault-text-mute)" }}>
                    {lean.projection}
                  </span>
                </span>
                <span style={{ color: "var(--vault-text-faint)" }}>
                  {lean.lean === "Over"
                    ? formatAmericanOdds(lean.oddsOver)
                    : formatAmericanOdds(lean.oddsUnder)}{" "}
                  · {lean.bookmaker}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
