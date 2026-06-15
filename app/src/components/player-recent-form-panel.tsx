"use client";

/**
 * PlayerRecentFormPanel — Parlay Lab "player dossier".
 *
 * Rendered when the user selects a player in Selected Players mode. Pulls
 * everything from the already-loaded `leans` array for that player — no
 * extra fetches, no fabrication. If `recent10` is missing for a market
 * the panel shows an honest empty state for that market only.
 *
 * Casino dossier styling lives in globals.css (`.gtp-player-dossier`).
 *
 * Composes:
 *   - PlayerAvatar (with .gtp-player-spotlight ring for the hero shot)
 *   - getPlayoffContext (game chip + round label)
 *   - VaultSparkline (existing recent-10 SVG sparkline)
 *
 * Accessibility:
 *   - Market chips are real buttons with aria-pressed
 *   - The sparkline supplies its own ariaLabel
 *   - All decorative elements aria-hidden
 *   - Sparkline glow respects prefers-reduced-motion
 */
import { useMemo, useState } from "react";
import type { PropLean, Market } from "@/lib/types";
import PlayerAvatar from "./player-avatar";
import VaultSparkline from "./vault-sparkline";
import { getPlayoffContext } from "./playoff-context";
import { confidenceLabel } from "@/lib/confidence-labels";

interface Props {
  /** All loaded leans across the visible slate (not just this player). */
  leans: PropLean[];
  /** Player to render. */
  playerName: string;
  /** Optional: other selected players, for the mini tab strip. */
  otherSelectedPlayers?: string[];
  /** Callback when the user picks a different selected player to view. */
  onSwitchPlayer?: (playerName: string) => void;
}

const MARKET_ORDER: Market[] = ["PTS", "REB", "AST"];

const MARKET_LABEL: Record<Market, string> = {
  PTS: "Points",
  REB: "Rebounds",
  AST: "Assists",
};

function avg(vals: number[]): number {
  if (vals.length === 0) return 0;
  let sum = 0;
  for (const v of vals) sum += v;
  return sum / vals.length;
}

function formatStat(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function PlayerRecentFormPanel({
  leans,
  playerName,
  otherSelectedPlayers,
  onSwitchPlayer,
}: Props) {
  // All loaded leans for this exact player. The picker keys are normalized
  // by player name, so a case-sensitive match is fine here.
  const playerLeans = useMemo(
    () => leans.filter((l) => l.playerName === playerName),
    [leans, playerName],
  );

  // Markets the player has on the board (PTS / REB / AST), in fixed order.
  const availableMarkets: Market[] = useMemo(() => {
    const present = new Set<Market>();
    for (const l of playerLeans) {
      const m = l.market as Market | undefined;
      if (m && MARKET_ORDER.includes(m)) present.add(m);
    }
    return MARKET_ORDER.filter((m) => present.has(m));
  }, [playerLeans]);

  // Best-edge market for the player — clean preferred — used as the
  // default selected market.
  const defaultMarket: Market | null = useMemo(() => {
    if (availableMarkets.length === 0) return null;
    const isClean = (l: PropLean) =>
      !(l.riskFlags ?? []).includes("suspicious_edge");
    let bestClean: { market: Market; edge: number } | null = null;
    let bestAny: { market: Market; edge: number } | null = null;
    for (const m of availableMarkets) {
      const row = playerLeans.find((l) => l.market === m);
      if (!row) continue;
      const e = Math.abs(row.edgePct ?? 0);
      if (isClean(row) && (!bestClean || e > bestClean.edge)) {
        bestClean = { market: m, edge: e };
      }
      if (!bestAny || e > bestAny.edge) bestAny = { market: m, edge: e };
    }
    return (bestClean ?? bestAny)?.market ?? availableMarkets[0];
  }, [availableMarkets, playerLeans]);

  const [activeMarket, setActiveMarket] = useState<Market | null>(defaultMarket);
  // If the player changes (parent re-mounts the component via `key`),
  // default market re-runs. As a safety, fall back to first available
  // when the active market isn't in the player's market list.
  const effectiveMarket: Market | null =
    activeMarket && availableMarkets.includes(activeMarket)
      ? activeMarket
      : defaultMarket;

  // Identity row for the dossier header.
  const anyLean = playerLeans[0];
  const team = anyLean?.team ?? "";
  const opponent = anyLean?.opponent ?? "";
  const homeAway = anyLean?.homeAway ?? "";
  const tipoff = anyLean?.tipoff ?? "";
  const playerId = anyLean?.playerId ?? undefined;
  const gameId = anyLean?.gameId ?? undefined;
  const playoff = getPlayoffContext(
    gameId,
    homeAway === "Home" ? opponent : team,
    homeAway === "Home" ? team : opponent,
  );
  const matchupArrow = homeAway === "Home" ? "vs" : "at";

  // The active market's primary lean (best edge) — we use the first
  // matching lean which the lean ordering normally already prioritizes.
  const activeLean = useMemo(() => {
    if (!effectiveMarket) return null;
    const rows = playerLeans
      .filter((l) => l.market === effectiveMarket)
      .sort(
        (a, b) => Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0),
      );
    return rows[0] ?? null;
  }, [effectiveMarket, playerLeans]);

  const recent10: number[] | undefined = Array.isArray(activeLean?.recent10)
    ? (activeLean!.recent10 as number[])
    : undefined;
  const hasRecent = !!recent10 && recent10.length > 0;
  const last5 = hasRecent ? recent10!.slice(-5) : [];
  const last10 = hasRecent ? recent10! : [];

  // Defensive: panel renders nothing if we have neither identity nor a
  // market to surface.
  if (!anyLean || availableMarkets.length === 0) {
    return (
      <div className="gtp-player-dossier" aria-label="Player dossier — no data">
        <div className="flex items-center gap-3">
          <PlayerAvatar
            playerId={playerId}
            playerName={playerName}
            team={team || undefined}
            size="md"
          />
          <div>
            <h3
              className="font-display font-semibold tracking-tight"
              style={{ color: "var(--vault-text)", fontSize: 18 }}
            >
              {playerName}
            </h3>
            <p
              className="mt-1 font-mono"
              style={{
                color: "var(--vault-text-faint)",
                fontSize: 11,
                letterSpacing: "0.04em",
              }}
            >
              No loaded model leans for this player on this slate.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const refLine =
    typeof activeLean?.line === "number" && Number.isFinite(activeLean.line)
      ? (activeLean.line as number)
      : undefined;
  const isAnomaly = (activeLean?.riskFlags ?? []).includes("suspicious_edge");
  const isNoPlay =
    activeLean?.lean === "No Play" || activeLean?.lean === "Pass";

  return (
    <div className="gtp-player-dossier" aria-label={`${playerName} dossier`}>
      {/* Eyebrow + (optional) player switcher */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px rgba(242, 54, 69, 0.6)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            Player dossier · recent form
          </span>
        </div>
        {otherSelectedPlayers && otherSelectedPlayers.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="font-mono"
              style={{
                fontSize: 10,
                color: "var(--vault-text-faint)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              viewing
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: 11,
                color: "var(--vault-gold-bright)",
                background: "var(--vault-gold-dim)",
                border: "1px solid var(--vault-border-strong)",
                borderRadius: 3,
                padding: "2px 6px",
              }}
            >
              {playerName.split(" ").slice(-1)[0]}
            </span>
            {otherSelectedPlayers.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onSwitchPlayer?.(p)}
                className="font-mono transition-colors"
                style={{
                  fontSize: 11,
                  color: "var(--vault-text-mute)",
                  background: "transparent",
                  border: "1px solid var(--vault-border)",
                  borderRadius: 3,
                  padding: "2px 6px",
                }}
              >
                {p.split(" ").slice(-1)[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Identity row */}
      <div className="flex items-start gap-4">
        <span className="gtp-player-spotlight">
          <PlayerAvatar
            playerId={playerId}
            playerName={playerName}
            team={team || undefined}
            size="lg"
          />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="font-display font-semibold tracking-tight truncate"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(20px, 2.6vw, 26px)",
              lineHeight: 1.1,
            }}
          >
            {playerName}
          </h3>
          <p
            className="mt-1 text-[13px] leading-snug truncate"
            style={{ color: "var(--vault-text-mute)" }}
          >
            <span style={{ color: "var(--vault-text)" }}>{team || "—"}</span>{" "}
            <span style={{ color: "var(--vault-text-faint)" }}>
              {matchupArrow}
            </span>{" "}
            <span style={{ color: "var(--vault-text)" }}>
              {opponent || "—"}
            </span>
            {tipoff && (
              <>
                <span style={{ color: "var(--vault-text-faint)" }}> · </span>
                <span>{tipoff}</span>
              </>
            )}
          </p>
          {playoff.isPlayoffs && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="gtp-game-chip">{playoff.gameLabel}</span>
              <span
                className="font-mono"
                style={{
                  fontSize: 10,
                  color: "var(--vault-text-faint)",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                {playoff.roundLabelCompact}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Market chips */}
      <div className="mt-5">
        <div
          className="font-mono mb-2"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--vault-text-faint)",
          }}
        >
          markets loaded
        </div>
        <div className="flex flex-wrap gap-1.5">
          {availableMarkets.map((m) => {
            const isActive = m === effectiveMarket;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setActiveMarket(m)}
                aria-pressed={isActive}
                className="px-3 py-1 rounded-[3px] font-mono text-[11px] tabular tracking-wide transition-colors"
                style={{
                  background: isActive
                    ? "var(--vault-gold-dim)"
                    : "var(--vault-panel)",
                  border: `1px solid ${
                    isActive ? "var(--vault-gold)" : "var(--vault-border)"
                  }`,
                  color: isActive
                    ? "var(--vault-gold-bright)"
                    : "var(--vault-text-mute)",
                }}
              >
                {MARKET_LABEL[m]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active-market detail */}
      {activeLean && effectiveMarket && (
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
            <div className="font-display tracking-tight">
              <span
                style={{
                  color: "var(--vault-text-mute)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.04em",
                  marginRight: 6,
                  textTransform: "uppercase",
                }}
              >
                {MARKET_LABEL[effectiveMarket]}
              </span>
              <span
                style={{ color: "var(--vault-text)", fontSize: 14 }}
              >
                {activeLean.lean}
              </span>{" "}
              <span
                style={{
                  color: "var(--vault-gold-bright)",
                  fontSize: 18,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  marginLeft: 4,
                }}
              >
                {refLine ?? "—"}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {typeof activeLean.edgePct === "number" && (
                <span
                  className="font-mono font-semibold tabular tracking-wider rounded-[3px] px-2 py-0.5 text-[11px]"
                  style={
                    isAnomaly
                      ? {
                          color: "var(--vault-warn)",
                          background: "var(--vault-warn-dim)",
                          border: "1px solid rgba(242, 54, 69, 0.30)",
                        }
                      : {
                          color: "var(--vault-gold-bright)",
                          background: "var(--vault-gold-dim)",
                          border: "1px solid var(--vault-border-strong)",
                        }
                  }
                >
                  {activeLean.edgePct > 0 ? "+" : ""}
                  {activeLean.edgePct.toFixed(1)}%
                </span>
              )}
              <span
                className="font-mono text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-[3px]"
                style={
                  activeLean.confidence === "High"
                    ? {
                        color: "var(--vault-gold-bright)",
                        background: "var(--vault-gold-dim)",
                        border: "1px solid var(--vault-border-strong)",
                      }
                    : activeLean.confidence === "Medium"
                      ? {
                          color: "var(--vault-warn)",
                          background: "var(--vault-warn-dim)",
                          border: "1px solid rgba(242, 54, 69, 0.30)",
                        }
                      : {
                          color: "var(--vault-text-mute)",
                          background: "var(--vault-panel-elevated)",
                          border: "1px solid var(--vault-border)",
                        }
                }
              >
                {confidenceLabel(activeLean.confidence)}
              </span>
              {isAnomaly && (
                <span
                  className="font-mono text-[10px] tracking-wider uppercase"
                  style={{ color: "var(--vault-warn)" }}
                >
                  model anomaly
                </span>
              )}
              {isNoPlay && (
                <span
                  className="font-mono text-[10px] tracking-wider uppercase"
                  style={{ color: "var(--vault-text-faint)" }}
                >
                  no play
                </span>
              )}
            </div>
          </div>

          {/* Graph + averages */}
          <div className="gtp-dossier-graph mt-3 px-4 py-4 rounded-[4px]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex-1 min-w-[180px] flex items-center justify-center">
                <span aria-hidden className="gtp-dossier-graph-glow">
                  <VaultSparkline
                    values={recent10}
                    refLine={refLine}
                    width={260}
                    height={64}
                    ariaLabel={`${playerName} ${effectiveMarket} last 10 games`}
                  />
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 min-w-[140px]">
                <Stat
                  label="last 5"
                  value={hasRecent ? formatStat(avg(last5)) : "—"}
                />
                <Stat
                  label="last 10"
                  value={hasRecent ? formatStat(avg(last10)) : "—"}
                />
                <Stat
                  label="projection"
                  value={
                    typeof activeLean.projection === "number"
                      ? formatStat(activeLean.projection)
                      : "—"
                  }
                  accent="gold"
                />
                <Stat
                  label="line"
                  value={refLine !== undefined ? formatStat(refLine) : "—"}
                />
              </div>
            </div>
            <p
              className="mt-3 font-mono text-[10px] tracking-[0.14em] uppercase"
              style={{ color: "var(--vault-text-faint)" }}
            >
              recent 10 games · oldest → newest · {hasRecent
                ? `${last10.length} games loaded`
                : "no recent log data"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "gold";
}) {
  const color =
    accent === "gold" ? "var(--vault-gold-bright)" : "var(--vault-text)";
  return (
    <div>
      <div
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--vault-text-faint)",
        }}
      >
        {label}
      </div>
      <div
        className="font-display font-semibold tabular tracking-tight"
        style={{ fontSize: 18, color, lineHeight: 1.1 }}
      >
        {value}
      </div>
    </div>
  );
}
