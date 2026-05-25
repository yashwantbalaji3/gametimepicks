"use client";
/**
 * PlayerRecentFormDrawer — modal/sheet that opens when a parlay leg
 * is tapped.
 *
 * Honest data contract:
 *   - We render ONLY data already on the leg (recentSeries — up to 10
 *     numeric values for the relevant market). The pipeline persists
 *     these on every optimizer snapshot.
 *   - We never invent a game log or fabricate dates/opponents.
 *   - When recentSeries is missing, we render a clean fallback note.
 *   - When recentSeries is short (e.g. only a few values) we show what
 *     we have and label the count honestly.
 *
 * UX rules:
 *   - Esc closes; backdrop click closes.
 *   - Mobile: bottom-sheet style (full width, bottom-anchored).
 *   - Desktop: centered modal with max-width.
 *   - Focus trap is light-touch (focuses the close button on open).
 */
import { useEffect, useMemo, useRef } from "react";
import type { ParlayLeg } from "@/lib/parlay-suggested";

interface Props {
  leg: ParlayLeg | null;
  onClose: () => void;
}

export default function PlayerRecentFormDrawer({ leg, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!leg) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Lock body scroll while modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [leg, onClose]);

  if (!leg) return null;

  const series = leg.recentSeries ?? [];
  // We render up to 5 most-recent values prominently; if more exist
  // we still surface the average over all available values.
  const recent5 = series.slice(0, 5);
  const recentAvg =
    series.length > 0
      ? series.reduce((sum, v) => sum + v, 0) / series.length
      : null;
  const stat = formatMarketLabel(leg.sport, leg.market, leg.marketLabel);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Recent form for ${leg.playerName}`}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.65)" }}
      />
      {/* Sheet / modal */}
      <div
        className="relative w-full sm:max-w-md sm:rounded-[10px] rounded-t-[14px] overflow-hidden"
        style={{
          background: "rgba(7,11,26,0.97)",
          border: "1px solid var(--vault-border)",
          maxHeight: "85vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-start justify-between gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--vault-rule)" }}
        >
          <div className="flex flex-col min-w-0">
            <span
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-gold)", fontSize: 10 }}
            >
              Recent form · {leg.sport.toUpperCase()}
            </span>
            <span
              className="font-display tracking-tight"
              style={{
                color: "var(--vault-text)",
                fontSize: 18,
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              {leg.playerName}
              {leg.team ? (
                <span
                  style={{
                    marginLeft: 8,
                    color: "var(--vault-text-mute)",
                    fontWeight: 400,
                    fontSize: 13,
                  }}
                >
                  {leg.team}
                  {leg.opponent ? ` vs ${leg.opponent}` : ""}
                </span>
              ) : null}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="shrink-0 font-mono uppercase tracking-[0.14em] px-2 py-1 rounded-[4px]"
            style={{
              color: "var(--vault-text-mute)",
              border: "1px solid var(--vault-rule)",
              fontSize: 10,
              cursor: "pointer",
            }}
            aria-label="Close"
          >
            Close
          </button>
        </header>

        <div className="px-4 py-3 flex flex-col gap-3 overflow-y-auto">
          <PickSummary leg={leg} stat={stat} />
          {recent5.length > 0 ? (
            <RecentList
              values={recent5}
              statLabel={stat}
              line={leg.line}
            />
          ) : (
            <FallbackNote />
          )}
          {recentAvg !== null && (
            <p
              className="font-mono"
              style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
            >
              Recent average · {stat} {recentAvg.toFixed(2)} on last{" "}
              {series.length} {series.length === 1 ? "game" : "games"} on record
            </p>
          )}
          <p
            className="text-[11px] leading-relaxed"
            style={{ color: "var(--vault-text-faint)" }}
          >
            Game-by-game stat history. We don&apos;t fabricate logs — when
            data is unavailable we say so. Opponents and dates aren&apos;t
            attached to each row yet (roadmap).
          </p>
        </div>
      </div>
    </div>
  );
}

function PickSummary({ leg, stat }: { leg: ParlayLeg; stat: string }) {
  return (
    <div
      className="px-3 py-2.5 rounded-[6px] flex flex-col gap-1"
      style={{
        background: "rgba(0,0,0,0.35)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Pick
      </span>
      <span
        className="font-display"
        style={{
          color: "var(--vault-text)",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {stat} {leg.side}{" "}
        {leg.line != null ? leg.line.toFixed(1) : "—"}
      </span>
      {leg.projection != null && leg.edgePct != null && (
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
        >
          Model {stat} {leg.projection.toFixed(2)} · edge {leg.edgePct.toFixed(1)}pp
        </span>
      )}
    </div>
  );
}

function RecentList({
  values,
  statLabel,
  line,
}: {
  values: number[];
  statLabel: string;
  line: number | null;
}) {
  // Compare each game to the line so the user sees which would have
  // hit. Honest — no fake context, just stat vs line.
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Last {values.length} {values.length === 1 ? "game" : "games"} · {statLabel}
      </span>
      <ol className="flex flex-col gap-1">
        {values.map((v, i) => {
          const cleared = line != null ? v > line : null;
          return (
            <li
              key={i}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[4px]"
              style={{
                background: "rgba(0,0,0,0.25)",
                border: "1px solid var(--vault-rule)",
              }}
            >
              <span
                className="font-mono uppercase tracking-[0.14em]"
                style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
              >
                G−{i + 1}
              </span>
              <span
                className="font-display tabular"
                style={{
                  color: "var(--vault-text)",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {Number.isInteger(v) ? v.toString() : v.toFixed(1)}
              </span>
              <span
                className="font-mono uppercase tracking-[0.12em]"
                style={{
                  color:
                    cleared === true
                      ? "var(--vault-success)"
                      : cleared === false
                        ? "var(--vault-warn)"
                        : "var(--vault-text-faint)",
                  fontSize: 9,
                  minWidth: 36,
                  textAlign: "right",
                }}
              >
                {cleared === true ? "Over" : cleared === false ? "Under" : "—"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FallbackNote() {
  return (
    <p
      className="text-[12px] leading-snug px-2.5 py-2 rounded-[4px]"
      style={{
        color: "var(--vault-text-mute)",
        background: "rgba(0,0,0,0.25)",
        border: "1px dashed var(--vault-border)",
      }}
    >
      Game-by-game log unavailable for this leg. We don&apos;t fabricate
      rows when the underlying recent-form data is missing.
    </p>
  );
}

function formatMarketLabel(
  sport: string,
  market: string,
  marketLabel: string | null | undefined,
): string {
  if (marketLabel && marketLabel !== market) return marketLabel;
  const s = (sport || "").toLowerCase();
  const m = (market || "").toLowerCase();
  if (s === "nba") {
    if (m === "pts") return "PTS";
    if (m === "reb") return "REB";
    if (m === "ast") return "AST";
  }
  if (s === "mlb") {
    if (m === "batter_hits") return "Hits";
    if (m === "batter_total_bases") return "Total Bases";
    if (m === "pitcher_strikeouts") return "K";
    if (m === "batter_hits_runs_rbis") return "H+R+RBI";
  }
  return market || "Stat";
}
