"use client";
/**
 * ParlayLabBuilder — team-first slip picker.
 *
 * Flow:
 *   1. Sport pills (All · NBA · MLB · Mixed)
 *   2. Team pills filtered by sport
 *   3. Player chips filtered by sport + team
 *   4. Three risk-level cards (Conservative · Balanced · High variance)
 *      with the best matching optimizer slip plus up to 2 alternates.
 *
 * Honest fallback:
 *   When the filter combination eliminates every slip for a profile,
 *   we DO NOT render an empty card. Instead we render an inline note
 *   ("No clean optimizer slip matches these filters. Showing best
 *   unfiltered suggestions instead.") and surface the top unfiltered
 *   slip for that profile. The user always sees something useful.
 *
 * No fabrication anywhere — every slip rendered comes from an
 * optimizer snapshot or legacy snapshot file on disk.
 */
import { useEffect, useMemo, useState } from "react";
import ParlayTicketCard from "./parlay-ticket-card";
import {
  fallbackToBestUnfilteredSlips,
  filterSlipsBySportTeamPlayer,
  getAvailablePlayersForTeam,
  getAvailableSportsFromSlips,
  getAvailableTeamsFromSlips,
  type ParlayRiskProfile,
  type ParlaySlip,
  type SuggestedSport,
} from "@/lib/parlay-suggested";
import {
  flattenOptimizerSlips,
  optimizerSlipToParlaySlip,
  type OptimizerSnapshot,
  type OptimizerSlip,
} from "@/lib/parlay-optimizer";
import type { CalibrationTable } from "@/lib/confidence-calibration-rules";

interface Props {
  /** Legacy snapshot slips (used as fallback when optimizer is empty). */
  slips: ParlaySlip[];
  /** Date the slips came from (YYYY-MM-DD). */
  date: string;
  source: "snapshot" | "graded";
  isFallback?: boolean;
  calibrationTable?: CalibrationTable;
  /** Optimizer snapshot for the date. Preferred source when populated. */
  optimizerPayload?: OptimizerSnapshot | null;
}

const ALL_SPORTS: Array<{ key: SuggestedSport; label: string }> = [
  { key: "all", label: "All" },
  { key: "nba", label: "NBA" },
  { key: "mlb", label: "MLB" },
  { key: "multi", label: "Mixed" },
];

const RISK_DISPLAY: Record<
  ParlayRiskProfile,
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
    sub: "4–5 legs · longshot territory",
    accent: "var(--vault-warn)",
  },
};

const RISK_ORDER: ParlayRiskProfile[] = [
  "conservative",
  "balanced",
  "aggressive",
];

export default function ParlayLabBuilder({
  slips,
  date,
  source,
  isFallback,
  calibrationTable,
  optimizerPayload = null,
}: Props) {
  // ---- Source pool ---------------------------------------------------
  // Optimizer is the primary source. We expand it into the legacy
  // ParlaySlip shape so all helpers (team/player filters, etc.) reuse
  // one set of utilities. When the optimizer file is empty / missing,
  // we fall back to the legacy snapshot slips.
  const optimizerActive =
    optimizerPayload != null && optimizerPayload.totalSlips > 0;
  const optimizerSlipsMap = useMemo(() => {
    if (!optimizerPayload) return new Map<string, OptimizerSlip>();
    const flat = flattenOptimizerSlips(optimizerPayload);
    return new Map(flat.map((s) => [s.slipId, s] as const));
  }, [optimizerPayload]);

  const pool: ParlaySlip[] = useMemo(() => {
    if (optimizerPayload && optimizerSlipsMap.size > 0) {
      return Array.from(optimizerSlipsMap.values()).map((s) =>
        optimizerSlipToParlaySlip(s, optimizerPayload.date),
      );
    }
    return slips;
  }, [optimizerPayload, optimizerSlipsMap, slips]);

  // ---- Filter state -------------------------------------------------
  const availableSports = useMemo(
    () => getAvailableSportsFromSlips(pool),
    [pool],
  );
  const sportOptions = ALL_SPORTS.filter((s) =>
    availableSports.includes(s.key),
  );
  const [sport, setSport] = useState<SuggestedSport>(
    sportOptions[0]?.key ?? "all",
  );
  const [team, setTeam] = useState<string | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

  // Keep the active sport valid when the underlying pool changes.
  useEffect(() => {
    if (!availableSports.includes(sport)) {
      setSport(availableSports[0] ?? "all");
      setTeam(null);
      setSelectedPlayers([]);
    }
  }, [availableSports, sport]);

  const teamOptions = useMemo(
    () => getAvailableTeamsFromSlips(pool, sport),
    [pool, sport],
  );
  const playerOptions = useMemo(
    () => getAvailablePlayersForTeam(pool, sport, team),
    [pool, sport, team],
  );

  function changeSport(next: SuggestedSport) {
    if (next === sport) return;
    setSport(next);
    setTeam(null);
    setSelectedPlayers([]);
  }

  function changeTeam(next: string | null) {
    if (next === team) return;
    setTeam(next);
    // Drop players whose team is now out of scope.
    const allowed = new Set(
      getAvailablePlayersForTeam(pool, sport, next).map((p) => p.name),
    );
    setSelectedPlayers((prev) => prev.filter((p) => allowed.has(p)));
  }

  function togglePlayer(name: string) {
    setSelectedPlayers((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  }

  function clearTeamAndPlayers() {
    setTeam(null);
    setSelectedPlayers([]);
  }

  // ---- Apply filters -------------------------------------------------
  const filtered = useMemo(
    () =>
      filterSlipsBySportTeamPlayer(pool, {
        sport,
        team,
        playerNames: selectedPlayers,
      }),
    [pool, sport, team, selectedPlayers],
  );

  // For each risk profile, pick the best slip + up to 2 alternates.
  // When the filtered pool is empty for a profile, surface the top
  // unfiltered slip for that sport (clearly labeled as fallback).
  const cards = useMemo(() => {
    function sortByScore(a: ParlaySlip, b: ParlaySlip): number {
      return (b.score ?? 0) - (a.score ?? 0);
    }
    return RISK_ORDER.map((profile) => {
      const matched = filtered
        .filter((s) => s.riskProfile === profile)
        .slice()
        .sort(sortByScore);
      if (matched.length > 0) {
        return {
          profile,
          slips: matched.slice(0, 3),
          isFallback: false,
        };
      }
      // Honest fallback — top unfiltered slip for the active sport.
      const fb = fallbackToBestUnfilteredSlips(
        pool.filter((s) => s.riskProfile === profile),
        sport,
        1,
      );
      return {
        profile,
        slips: fb,
        isFallback: true,
      };
    });
  }, [filtered, pool, sport]);

  const filterActive = team !== null || selectedPlayers.length > 0;

  return (
    <section className="flex flex-col gap-5" aria-label="Parlay Lab builder">
      <BuilderHeader
        date={date}
        source={source}
        isFallback={!!isFallback}
        optimizerActive={optimizerActive}
      />

      <FilterCard
        sport={sport}
        sportOptions={sportOptions}
        onSportChange={changeSport}
        team={team}
        teamOptions={teamOptions}
        onTeamChange={changeTeam}
        playerOptions={playerOptions}
        selectedPlayers={selectedPlayers}
        onTogglePlayer={togglePlayer}
        onClearFilters={clearTeamAndPlayers}
      />

      <RiskGrid
        cards={cards}
        source={source}
        calibrationTable={calibrationTable}
        filterActive={filterActive}
      />

      <BuilderFootnote optimizerActive={optimizerActive} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function BuilderHeader({
  date,
  source,
  isFallback,
  optimizerActive,
}: {
  date: string;
  source: "snapshot" | "graded";
  isFallback: boolean;
  optimizerActive: boolean;
}) {
  const accent =
    source === "graded" ? "var(--vault-success)" : "var(--vault-gold-bright)";
  return (
    <header className="flex flex-col gap-1.5">
      <span
        className="font-mono uppercase tracking-[0.18em] inline-flex items-center gap-2"
        style={{ color: accent, fontSize: 10 }}
      >
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: accent,
            boxShadow:
              source === "graded"
                ? "0 0 6px rgba(74, 222, 128, 0.45)"
                : "0 0 6px rgba(240, 199, 94, 0.45)",
          }}
        />
        Parlay Lab · {date}
        {isFallback ? " · latest available" : ""}
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
        Build around a team or player.
      </h1>
      <p
        className="text-[13.5px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 640 }}
      >
        {optimizerActive
          ? "Pick a sport, a team, and the players you care about. The model returns the best slip at every risk level — Conservative, Balanced, High variance."
          : "Pick a sport, a team, and the players you care about. Slips below come from today's pregame snapshot."}
      </p>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function FilterCard({
  sport,
  sportOptions,
  onSportChange,
  team,
  teamOptions,
  onTeamChange,
  playerOptions,
  selectedPlayers,
  onTogglePlayer,
  onClearFilters,
}: {
  sport: SuggestedSport;
  sportOptions: Array<{ key: SuggestedSport; label: string }>;
  onSportChange: (s: SuggestedSport) => void;
  team: string | null;
  teamOptions: Array<{ team: string; sport: string }>;
  onTeamChange: (t: string | null) => void;
  playerOptions: Array<{ name: string; sport: string; team: string | null }>;
  selectedPlayers: string[];
  onTogglePlayer: (name: string) => void;
  onClearFilters: () => void;
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
        <PillRow>
          {sportOptions.map((opt) => (
            <PillButton
              key={opt.key}
              active={opt.key === sport}
              onClick={() => onSportChange(opt.key)}
              label={opt.label}
            />
          ))}
        </PillRow>
      </FilterRow>

      <FilterRow
        label="Team"
        rightSlot={
          team ? (
            <button
              type="button"
              onClick={() => onTeamChange(null)}
              className="font-mono uppercase tracking-[0.14em]"
              style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
            >
              Any team
            </button>
          ) : null
        }
      >
        {teamOptions.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
            No team metadata for this sport yet.
          </p>
        ) : (
          <PillRow wrap>
            <PillButton
              active={team === null}
              onClick={() => onTeamChange(null)}
              label="Any"
            />
            {teamOptions.map((t) => (
              <PillButton
                key={`${t.sport}-${t.team}`}
                active={team === t.team}
                onClick={() => onTeamChange(t.team)}
                label={t.team}
              />
            ))}
          </PillRow>
        )}
      </FilterRow>

      <FilterRow
        label={`Players (${selectedPlayers.length} selected)`}
        rightSlot={
          selectedPlayers.length > 0 || team ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="font-mono uppercase tracking-[0.14em]"
              style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
            >
              Clear
            </button>
          ) : null
        }
      >
        {playerOptions.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
            {team
              ? `No players on ${team} appear in tonight's slips.`
              : "No players in scope."}
          </p>
        ) : (
          <div
            className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1"
            style={{ scrollbarWidth: "thin" }}
          >
            {playerOptions.map((p) => {
              const active = selectedPlayers.includes(p.name);
              return (
                <button
                  key={`${p.sport}-${p.team ?? "?"}-${p.name}`}
                  type="button"
                  onClick={() => onTogglePlayer(p.name)}
                  aria-pressed={active}
                  className="font-mono uppercase tracking-[0.12em] px-2.5 py-1 rounded-full"
                  style={{
                    color: active ? "var(--vault-bg)" : "var(--vault-text)",
                    background: active
                      ? "var(--vault-gold-bright)"
                      : "rgba(0,0,0,0.3)",
                    border: active
                      ? "1px solid var(--vault-gold-bright)"
                      : "1px solid var(--vault-rule)",
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  {p.name}
                  {p.team ? (
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>{p.team}</span>
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

function PillRow({
  children,
  wrap,
}: {
  children: React.ReactNode;
  wrap?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1 p-1 rounded-full ${wrap ? "flex-wrap" : ""}`}
      style={{
        background: "rgba(0,0,0,0.3)",
        border: "1px solid var(--vault-rule)",
        maxWidth: "100%",
      }}
    >
      {children}
    </div>
  );
}

function PillButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-full"
      style={{
        color: active ? "var(--vault-bg)" : "var(--vault-text-mute)",
        background: active ? "var(--vault-gold-bright)" : "transparent",
        fontSize: 10,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Risk-level result grid
// ---------------------------------------------------------------------------

function RiskGrid({
  cards,
  source,
  calibrationTable,
  filterActive,
}: {
  cards: Array<{
    profile: ParlayRiskProfile;
    slips: ParlaySlip[];
    isFallback: boolean;
  }>;
  source: "snapshot" | "graded";
  calibrationTable?: CalibrationTable;
  filterActive: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {cards.map((card) => (
        <RiskCard
          key={card.profile}
          profile={card.profile}
          slips={card.slips}
          isFallback={card.isFallback}
          source={source}
          calibrationTable={calibrationTable}
          filterActive={filterActive}
        />
      ))}
    </div>
  );
}

function RiskCard({
  profile,
  slips,
  isFallback,
  source,
  calibrationTable,
  filterActive,
}: {
  profile: ParlayRiskProfile;
  slips: ParlaySlip[];
  isFallback: boolean;
  source: "snapshot" | "graded";
  calibrationTable?: CalibrationTable;
  filterActive: boolean;
}) {
  const display = RISK_DISPLAY[profile];
  return (
    <div className="flex flex-col gap-2">
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

      {slips.length === 0 ? (
        <EmptyRiskCard profile={profile} filterActive={filterActive} />
      ) : (
        <>
          {isFallback && filterActive && (
            <FallbackNote profile={profile} />
          )}
          {slips.map((slip, i) => (
            <div key={slip.slipId} className="flex flex-col gap-1">
              {i > 0 && (
                <span
                  className="font-mono uppercase tracking-[0.14em]"
                  style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
                >
                  Alternate {i}
                </span>
              )}
              <ParlayTicketCard
                slip={slip}
                savedPregame={source === "snapshot"}
                calibrationTable={calibrationTable}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function FallbackNote({ profile }: { profile: ParlayRiskProfile }) {
  const label = RISK_DISPLAY[profile].label.toLowerCase();
  return (
    <p
      className="text-[11.5px] leading-snug rounded-[4px] px-2 py-1.5"
      style={{
        color: "var(--vault-text-mute)",
        background: "rgba(7,11,26,0.45)",
        border: "1px dashed var(--vault-border)",
      }}
    >
      No clean {label} slip with these filters. Showing the best
      unfiltered suggestion instead.
    </p>
  );
}

function EmptyRiskCard({
  profile,
  filterActive,
}: {
  profile: ParlayRiskProfile;
  filterActive: boolean;
}) {
  const display = RISK_DISPLAY[profile];
  return (
    <div
      className="rounded-[6px] p-5 flex flex-col gap-2 justify-center items-center text-center"
      style={{
        border: "1px dashed var(--vault-border)",
        background: "rgba(7,11,26,0.4)",
        minHeight: 180,
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
        {filterActive
          ? "These filters left nothing the model could build cleanly. Try a different team or fewer players."
          : "Today's slate doesn't satisfy this risk profile yet — too few eligible legs or correlation caps."}
      </p>
    </div>
  );
}

function BuilderFootnote({ optimizerActive }: { optimizerActive: boolean }) {
  return (
    <aside
      className="rounded-[8px] p-4"
      style={{
        background: "rgba(7,11,26,0.4)",
        border: "1px dashed var(--vault-border)",
      }}
    >
      <p
        className="text-[12.5px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {optimizerActive
          ? "Slips ranked by calibrated edge × confidence × per-market stability − correlation penalty. We never invent slips to fill a card. High-variance slips are labeled honestly."
          : "Slips come from today's pregame snapshot. We never invent slips to fill a card. High-variance slips are labeled honestly."}
      </p>
    </aside>
  );
}
