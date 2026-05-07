"use client";

/**
 * PlayerCardTrends — expandable last-10 trend panel.
 *
 * Rendered inside <VaultPlayerCard> when the user clicks "Show last 10
 * trends". Pure presentational; uses the same VaultSparkline component
 * already shipped in Phase 8.4.1 / viewer-ready.
 *
 * Behavior:
 *   - Iterates over PTS / REB / AST in fixed order
 *   - For each market the player has a row for:
 *       - Shows market label + trend direction indicator (↑ / ↓ / —)
 *       - Renders compact sparkline + latest stat value
 *       - If recent10 is missing or empty, shows "insufficient data"
 *   - Markets the player does NOT have a prop for are simply omitted
 *     (we don't fabricate trend data for missing markets)
 *
 * Honest framing: never invents values. When recent10 is unavailable,
 * the row reads "no recent log data" — that's the truth. When the
 * pipeline emits recent10 (via attach_recent10), the row lights up.
 */
import type { Market } from "@/lib/types";
import type { PlayerCard } from "@/lib/grouping";
import VaultSparkline from "./vault-sparkline";

const MARKET_ORDER: Market[] = ["PTS", "REB", "AST"];

const MARKET_LABEL: Record<Market, string> = {
  PTS: "Points",
  REB: "Rebounds",
  AST: "Assists",
};

interface Props {
  card: PlayerCard;
}

export default function PlayerCardTrends({ card }: Props) {
  const availableMarkets = MARKET_ORDER.filter((m) => card.rows[m]);

  if (availableMarkets.length === 0) {
    // Defensive — should never happen because the card itself wouldn't render
    return (
      <div
        className="font-mono text-[10px] tracking-wider uppercase"
        style={{ color: "var(--vault-text-faint)" }}
      >
        no trend data
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {availableMarkets.map((market) => {
        const row = card.rows[market];
        if (!row) return null;
        const lean = row.primary;
        const values = lean.recent10;
        const hasData = Array.isArray(values) && values.length >= 2;

        const refLine =
          typeof lean.line === "number" && Number.isFinite(lean.line)
            ? lean.line
            : undefined;

        const last = hasData ? values![values!.length - 1] : undefined;
        const first = hasData ? values![0] : undefined;
        const trend: "up" | "down" | "flat" | "none" = !hasData
          ? "none"
          : last! > first!
            ? "up"
            : last! < first!
              ? "down"
              : "flat";

        return (
          <div
            key={market}
            className="flex items-center gap-3 px-2.5 py-2 rounded-[2px]"
            style={{
              background: "var(--vault-panel-elevated)",
              border: "1px solid var(--vault-border)",
            }}
          >
            {/* Market label + direction indicator */}
            <div className="shrink-0 w-[88px] sm:w-[100px]">
              <div
                className="font-mono text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "var(--vault-gold)" }}
              >
                {MARKET_LABEL[market]}
              </div>
              <div className="mt-0.5">
                <TrendIndicator trend={trend} hasData={hasData} />
              </div>
            </div>

            {/* Sparkline */}
            <div className="flex-1 min-w-0 flex justify-center">
              {hasData ? (
                <VaultSparkline
                  values={values}
                  refLine={refLine}
                  width={120}
                  height={36}
                  ariaLabel={`${lean.playerName} ${market} last 10`}
                />
              ) : (
                <span
                  className="font-mono text-[10px] tracking-wider uppercase"
                  style={{ color: "var(--vault-text-faint)" }}
                >
                  no recent log data
                </span>
              )}
            </div>

            {/* Latest value + line reference */}
            <div className="shrink-0 text-right w-[64px] sm:w-[72px]">
              {hasData ? (
                <>
                  <div
                    className="font-display font-semibold tabular text-[15px] sm:text-[16px] leading-none"
                    style={{ color: "var(--vault-text)" }}
                  >
                    {Number.isInteger(last) ? last : last!.toFixed(1)}
                  </div>
                  <div
                    className="mt-0.5 font-mono text-[9px] tracking-wider uppercase"
                    style={{ color: "var(--vault-text-faint)" }}
                  >
                    {refLine !== undefined ? `line ${refLine}` : "latest"}
                  </div>
                </>
              ) : (
                <div
                  className="font-display tabular text-[15px] sm:text-[16px] leading-none"
                  style={{ color: "var(--vault-text-faint)" }}
                >
                  —
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrendIndicator({
  trend,
  hasData,
}: {
  trend: "up" | "down" | "flat" | "none";
  hasData: boolean;
}) {
  if (!hasData) {
    return (
      <span
        className="font-mono text-[10px] tracking-wider uppercase"
        style={{ color: "var(--vault-text-faint)" }}
      >
        — no data
      </span>
    );
  }
  if (trend === "up") {
    return (
      <span
        className="font-mono text-[10px] tracking-wider uppercase"
        style={{ color: "var(--vault-gold-bright)" }}
      >
        ↑ trending up
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span
        className="font-mono text-[10px] tracking-wider uppercase"
        style={{ color: "var(--vault-text-mute)" }}
      >
        ↓ trending down
      </span>
    );
  }
  return (
    <span
      className="font-mono text-[10px] tracking-wider uppercase"
      style={{ color: "var(--vault-text-mute)" }}
    >
      — flat
    </span>
  );
}
