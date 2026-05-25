"use client";
/**
 * ParlayLabBuilder — simplified, sport-and-player-first slip picker.
 *
 * UX flow:
 *   1. Sport segmented control (All · NBA · MLB · Mixed).
 *   2. Multi-select player chips. Pulled from real legs across the
 *      pregame snapshot.
 *   3. Three risk-level result cards (Conservative · Balanced · High
 *      variance). Each shows the BEST slip matching the current
 *      filters — sourced from the snapshot only. Never invented.
 *
 * Honesty:
 *   - We only filter slips that exist on disk. If no slip matches
 *     a given risk level, that card surfaces an inline empty state.
 *   - Aggressive slips render with a "High variance" label everywhere.
 *   - There is a clear TODO panel acknowledging that true on-demand
 *     optimization (build a slip from scratch around a chosen player)
 *     is not yet implemented — the current build matches against
 *     pregame snapshots only.
 */
import { useMemo, useState } from "react";
import ParlayTicketCard from "./parlay-ticket-card";
import {
  getBestSuggestedByRisk,
  groupSuggestedBySport,
  playersFromSlips,
  type ParlaySlip,
  type SuggestedSport,
} from "@/lib/parlay-suggested";
import type { CalibrationTable } from "@/lib/confidence-calibration-rules";

interface Props {
  /** All slips for the current date — usually the latest snapshot. */
  slips: ParlaySlip[];
  /** Date the slips came from (YYYY-MM-DD). */
  date: string;
  /** "snapshot" (pregame) or "graded" (post-game). */
  source: "snapshot" | "graded";
  /** True when we walked back from the requested date. */
  isFallback?: boolean;
  /** Calibration table for the ticket cards. */
  calibrationTable?: CalibrationTable;
}

const SPORT_OPTIONS: Array<{ key: SuggestedSport; label: string }> = [
  { key: "all", label: "All" },
  { key: "nba", label: "NBA" },
  { key: "mlb", label: "MLB" },
  { key: "multi", label: "Mixed" },
];

const RISK_DISPLAY: Record<
  string,
  { label: string; sub: string; accent: string }
> = {
  conservative: {
    label: "Conservative",
    sub: "2 legs · clean reads",
    accent: "var(--vault-success)",
  },
  balanced: {
    label: "Balanced",
    sub: "3 legs · moderate variance",
    accent: "var(--vault-gold-bright)",
  },
  aggressive: {
    label: "High variance",
    sub: "4-5 legs · longshot territory",
    accent: "var(--vault-warn)",
  },
};

export default function ParlayLabBuilder({
  slips,
  date,
  source,
  isFallback,
  calibrationTable,
}: Props) {
  const [sport, setSport] = useState<SuggestedSport>("all");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

  // Player pool reflects the current sport tab so the chip list isn't
  // overwhelming. When "All" is active, we surface every player.
  const buckets = useMemo(() => groupSuggestedBySport(slips), [slips]);
  const slipsForSport = buckets[sport] ?? [];
  const playerPool = useMemo(
    () => playersFromSlips(slipsForSport),
    [slipsForSport],
  );

  // When sport changes, drop any selected players that no longer
  // exist in the active pool.
  function changeSport(next: SuggestedSport) {
    if (next === sport) return;
    setSport(next);
    setSelectedPlayers((prev) => {
      const allowed = new Set(playersFromSlips(buckets[next] ?? []).map((p) => p.name));
      return prev.filter((p) => allowed.has(p));
    });
  }

  function togglePlayer(name: string) {
    setSelectedPlayers((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  }

  function clearSelections() {
    setSelectedPlayers([]);
  }

  const best = useMemo(
    () =>
      getBestSuggestedByRisk(slips, {
        sport,
        playerNames: selectedPlayers,
      }),
    [slips, sport, selectedPlayers],
  );

  return (
    <section className="flex flex-col gap-5" aria-label="Parlay Lab builder">
      <BuilderHeader date={date} source={source} isFallback={!!isFallback} />

      <FilterBlock
        sport={sport}
        onSportChange={changeSport}
        playerPool={playerPool}
        selectedPlayers={selectedPlayers}
        onTogglePlayer={togglePlayer}
        onClearPlayers={clearSelections}
      />

      <RiskResultGrid
        best={best}
        source={source}
        calibrationTable={calibrationTable}
        anyPlayersSelected={selectedPlayers.length > 0}
      />

      <BuilderTodoCallout />
    </section>
  );
}

function BuilderHeader({
  date,
  source,
  isFallback,
}: {
  date: string;
  source: "snapshot" | "graded";
  isFallback: boolean;
}) {
  const eyebrowAccent =
    source === "graded" ? "var(--vault-success)" : "var(--vault-gold-bright)";
  return (
    <header className="flex flex-col gap-1.5">
      <span
        className="font-mono uppercase tracking-[0.18em] inline-flex items-center gap-2"
        style={{ color: eyebrowAccent, fontSize: 10 }}
      >
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: eyebrowAccent,
            boxShadow:
              source === "graded"
                ? "0 0 6px rgba(74, 222, 128, 0.45)"
                : "0 0 6px rgba(240, 199, 94, 0.45)",
          }}
        />
        Parlay Lab · {source === "graded" ? "graded" : "saved before games"}
      </span>
      <h1
        className="font-display tracking-tight"
        style={{
          color: "var(--vault-text)",
          fontSize: "clamp(24px, 4.5vw, 38px)",
          lineHeight: 1.05,
          letterSpacing: "-0.015em",
          fontWeight: 600,
        }}
      >
        Pick a sport. Pick players. See the best slip at every risk
        level.
      </h1>
      <p
        className="text-[13.5px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 640 }}
      >
        Slips below come from the {date} pregame snapshot
        {isFallback ? " (latest available)" : ""}. We never invent
        legs or rebuild slips on the fly yet — see the note below.
      </p>
    </header>
  );
}

function FilterBlock({
  sport,
  onSportChange,
  playerPool,
  selectedPlayers,
  onTogglePlayer,
  onClearPlayers,
}: {
  sport: SuggestedSport;
  onSportChange: (s: SuggestedSport) => void;
  playerPool: Array<{ name: string; sport: string; team: string | null }>;
  selectedPlayers: string[];
  onTogglePlayer: (name: string) => void;
  onClearPlayers: () => void;
}) {
  return (
    <div
      className="rounded-[8px] px-4 py-4 flex flex-col gap-4"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <FilterRow label="Sport">
        <div
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full"
          style={{
            background: "rgba(0,0,0,0.3)",
            border: "1px solid var(--vault-rule)",
          }}
        >
          {SPORT_OPTIONS.map((opt) => {
            const active = opt.key === sport;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onSportChange(opt.key)}
                className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-full"
                style={{
                  color: active ? "var(--vault-bg)" : "var(--vault-text-mute)",
                  background: active ? "var(--vault-gold-bright)" : "transparent",
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </FilterRow>

      <FilterRow
        label={`Players (${selectedPlayers.length} selected)`}
        rightSlot={
          selectedPlayers.length > 0 ? (
            <button
              type="button"
              onClick={onClearPlayers}
              className="font-mono uppercase tracking-[0.14em]"
              style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
            >
              Clear
            </button>
          ) : null
        }
      >
        {playerPool.length === 0 ? (
          <p
            className="text-[12px]"
            style={{ color: "var(--vault-text-faint)" }}
          >
            No players in scope for this sport yet.
          </p>
        ) : (
          <div
            className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1"
            style={{
              scrollbarWidth: "thin",
            }}
          >
            {playerPool.map((p) => {
              const active = selectedPlayers.includes(p.name);
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => onTogglePlayer(p.name)}
                  className="font-mono uppercase tracking-[0.12em] px-2.5 py-1 rounded-full"
                  style={{
                    color: active
                      ? "var(--vault-bg)"
                      : "var(--vault-text)",
                    background: active
                      ? "var(--vault-gold-bright)"
                      : "rgba(0,0,0,0.3)",
                    border: active
                      ? "1px solid var(--vault-gold-bright)"
                      : "1px solid var(--vault-rule)",
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                  aria-pressed={active}
                >
                  {p.name}
                  {p.team ? (
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>
                      {p.team}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </FilterRow>
    </div>
  );
}

function FilterRow({
  label,
  rightSlot,
  children,
}: {
  label: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {label}
        </span>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

function RiskResultGrid({
  best,
  source,
  calibrationTable,
  anyPlayersSelected,
}: {
  best: Array<{ profile: string; slip: ParlaySlip }>;
  source: "snapshot" | "graded";
  calibrationTable?: CalibrationTable;
  anyPlayersSelected: boolean;
}) {
  const order: Array<"conservative" | "balanced" | "aggressive"> = [
    "conservative",
    "balanced",
    "aggressive",
  ];
  const byProfile = new Map<string, ParlaySlip>(
    best.map((b) => [b.profile, b.slip]),
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {order.map((profile) => {
        const slip = byProfile.get(profile) ?? null;
        const display = RISK_DISPLAY[profile];
        return (
          <div key={profile} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span
                  className="font-mono uppercase tracking-[0.16em]"
                  style={{ color: display.accent, fontSize: 10 }}
                >
                  {display.label}
                </span>
                <span
                  className="font-mono"
                  style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
                >
                  {display.sub}
                </span>
              </div>
              {profile === "aggressive" && (
                <span
                  className="font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-[3px]"
                  style={{
                    color: "var(--vault-warn)",
                    border: "1px solid var(--vault-warn)",
                    background: "rgba(7,11,26,0.55)",
                    fontSize: 9,
                  }}
                  title="Aggressive parlays have hit ~4.5% historically."
                >
                  4.5% hit
                </span>
              )}
            </div>

            {slip ? (
              <ParlayTicketCard
                slip={slip}
                savedPregame={source === "snapshot"}
                calibrationTable={calibrationTable}
              />
            ) : (
              <EmptyRiskCard
                profile={profile}
                anyPlayersSelected={anyPlayersSelected}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function EmptyRiskCard({
  profile,
  anyPlayersSelected,
}: {
  profile: string;
  anyPlayersSelected: boolean;
}) {
  const display = RISK_DISPLAY[profile];
  return (
    <div
      className="rounded-[6px] p-5 flex flex-col gap-2 justify-center items-center text-center"
      style={{
        border: "1px dashed var(--vault-border)",
        background: "rgba(7,11,26,0.4)",
        minHeight: 220,
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: display.accent, fontSize: 10 }}
      >
        No {display.label.toLowerCase()} slip
      </span>
      <p
        className="text-[12px] leading-snug"
        style={{ color: "var(--vault-text-mute)", maxWidth: 260 }}
      >
        {anyPlayersSelected
          ? "None of the saved slips at this risk level include every player you selected. Try removing a player or switching sport."
          : "No saved slip matches this risk level for the current sport. Try a different sport or check back when tonight's snapshot lands."}
      </p>
    </div>
  );
}

function BuilderTodoCallout() {
  return (
    <aside
      className="rounded-[8px] p-4 flex flex-col gap-1.5"
      style={{
        background: "rgba(7,11,26,0.4)",
        border: "1px dashed var(--vault-border)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Coming soon · on-demand slip building
      </span>
      <p
        className="text-[12.5px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        Today the Lab matches your selections against pregame snapshots
        — so you only see slips the model already saved before tipoff.
        On-demand optimization (build a slip from scratch around any
        player) is on the roadmap. We&apos;d rather show you nothing than
        fabricate a slip you can&apos;t verify.
      </p>
    </aside>
  );
}
