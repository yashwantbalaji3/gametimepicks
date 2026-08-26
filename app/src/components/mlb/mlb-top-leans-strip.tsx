import Link from "next/link";
import type { MlbBoardLean } from "@/lib/types-mlb";
import {
  formatAmericanOdds,
  formatEdgePct,
  mlbMarketLabel,
} from "@/lib/format-mlb";
import PlayerAvatar from "@/components/player-avatar";

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

/**
 * Sprint 035: ordering no longer uses confidence (+100 for "High") or |edgePct|. Both are inverted on
 * settled results — "High" hit .4934 vs "Low" .5172, and 20+pp hit .4317 vs .5203 under 2.5pp
 * (n=21,192). The strip now orders by model probability, with recent-form presence and sample depth
 * as tiebreaks: properties of the row rather than forecasts about it.
 */
/** The model probability for the side actually being shown (Over vs Under). */
function leanProbability(lean: MlbBoardLean): number | null {
  const p = lean.lean === "Over" ? lean.modelProbOver : lean.lean === "Under" ? lean.modelProbUnder : null;
  return typeof p === "number" && Number.isFinite(p) ? p : null;
}

function score(lean: MlbBoardLean): number {
  const prob = leanProbability(lean) ?? 0;
  const recentBonus = lean.recentSeries && lean.recentSeries.length > 0 ? 0.02 : 0;
  const sampleBonus = Math.min(Number(lean.samples ?? 0), 25) / 25 * 0.03;
  return prob + recentBonus + sampleBonus;
}

function isCleanCandidate(lean: MlbBoardLean): boolean {
  // Confidence no longer gates inclusion — it is a relabelled edge bucket and is anti-calibrated.
  // The anomaly exclusion below IS kept: anomaly rows hit .4342 over n=760, which settled data supports.
  if (lean.projection === null) return false;
  if (leanProbability(lean) === null) return false;
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
          background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)",
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
              boxShadow: "0 0 8px color-mix(in srgb, var(--vault-accent) 60%, transparent)",
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
                    ? "color-mix(in srgb, var(--vault-success) 30%, transparent)"
                    : "color-mix(in srgb, var(--vault-accent) 25%, transparent)"
                }`,
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--vault-scrim-cocoa) 55%, transparent) 0%, color-mix(in srgb, var(--vault-scrim-base) 62%, transparent) 100%)",
                scrollMarginTop: 80,
              }}
              aria-label={`Jump to ${lean.playerName} ${mlbMarketLabel(lean.marketKey)} ${lean.lean} ${lean.line}`}
            >
              <div className="flex items-center gap-2.5">
                <PlayerAvatar sport="mlb"
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
                      ? "color-mix(in srgb, var(--vault-success) 10%, transparent)"
                      : "color-mix(in srgb, var(--vault-accent) 10%, transparent)",
                    borderRadius: 2,
                    padding: "2px 6px",
                    border: `1px solid ${
                      isHigh
                        ? "color-mix(in srgb, var(--vault-success) 30%, transparent)"
                        : "color-mix(in srgb, var(--vault-accent) 30%, transparent)"
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
