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
import PlayerRecentFormDrawer from "./player-recent-form-drawer";
import SearchableSelect, {
  type SearchableOption,
} from "./searchable-select";
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
    sub: "2 legs · star-driven · lower variance",
    accent: "var(--vault-success)",
  },
  balanced: {
    label: "Balanced",
    sub: "3 legs · star + value mix",
    accent: "var(--vault-gold-bright)",
  },
  aggressive: {
    label: "High variance",
    sub: "4–5 legs · higher payout · longshot territory",
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
  const [player, setPlayer] = useState<string | null>(null);

  // Keep the active sport valid when the underlying pool changes.
  useEffect(() => {
    if (!availableSports.includes(sport)) {
      setSport(availableSports[0] ?? "all");
      setTeam(null);
      setPlayer(null);
    }
  }, [availableSports, sport]);

  const teamSelectOptions = useMemo<SearchableOption[]>(() => {
    const teams = getAvailableTeamsFromSlips(pool, sport);
    return [
      { value: null, label: "All teams" },
      ...teams.map((t) => ({
        value: t.team,
        label: t.team,
        sub: t.sport.toUpperCase(),
        searchText: t.team,
      })),
    ];
  }, [pool, sport]);

  const playerSelectOptions = useMemo<SearchableOption[]>(() => {
    const players = getAvailablePlayersForTeam(pool, sport, team);
    return [
      { value: null, label: "All players" },
      ...players.map((p) => ({
        value: p.name,
        label: p.name,
        sub: p.team ? `${p.team} · ${p.sport.toUpperCase()}` : p.sport.toUpperCase(),
        searchText: `${p.name} ${p.team ?? ""}`,
      })),
    ];
  }, [pool, sport, team]);

  function changeSport(next: SuggestedSport) {
    if (next === sport) return;
    setSport(next);
    setTeam(null);
    setPlayer(null);
  }

  function changeTeam(next: string | null) {
    if (next === team) return;
    setTeam(next);
    setPlayer(null);
  }

  function changePlayer(next: string | null) {
    if (next === player) return;
    setPlayer(next);
  }

  // ---- Apply filters -------------------------------------------------
  const filtered = useMemo(
    () =>
      filterSlipsBySportTeamPlayer(pool, {
        sport,
        team,
        playerNames: player ? [player] : [],
      }),
    [pool, sport, team, player],
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

  const filterActive = team !== null || player !== null;

  // Recent-form drawer state — tracks the clicked leg.
  const [activeLeg, setActiveLeg] = useState<ParlaySlip["legs"][number] | null>(null);

  return (
    <section className="flex flex-col gap-5" aria-label="Parlay Lab builder">
      <BuilderHeader
        date={date}
        source={source}
        isFallback={!!isFallback}
        optimizerActive={optimizerActive}
      />

      <LabFilters
        sport={sport}
        sportOptions={sportOptions}
        onSportChange={changeSport}
        team={team}
        teamOptions={teamSelectOptions}
        onTeamChange={changeTeam}
        player={player}
        playerOptions={playerSelectOptions}
        onPlayerChange={changePlayer}
      />

      <RiskGrid
        cards={cards}
        source={source}
        calibrationTable={calibrationTable}
        filterActive={filterActive}
        onLegClick={setActiveLeg}
      />

      <AltLineComingSoon />
      <BuilderFootnote optimizerActive={optimizerActive} />
      <PlayerRecentFormDrawer leg={activeLeg} onClose={() => setActiveLeg(null)} />
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

function LabFilters({
  sport,
  sportOptions,
  onSportChange,
  team,
  teamOptions,
  onTeamChange,
  player,
  playerOptions,
  onPlayerChange,
}: {
  sport: SuggestedSport;
  sportOptions: Array<{ key: SuggestedSport; label: string }>;
  onSportChange: (s: SuggestedSport) => void;
  team: string | null;
  teamOptions: SearchableOption[];
  onTeamChange: (t: string | null) => void;
  player: string | null;
  playerOptions: SearchableOption[];
  onPlayerChange: (p: string | null) => void;
}) {
  return (
    <div
      className="rounded-[8px] px-4 py-4 flex flex-col gap-4"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div className="flex flex-col gap-2">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          Sport
        </span>
        <div
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full self-start"
          style={{
            background: "rgba(0,0,0,0.3)",
            border: "1px solid var(--vault-rule)",
          }}
        >
          {sportOptions.map((opt) => {
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
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SearchableSelect
          label="Team"
          placeholder="All teams"
          value={team}
          options={teamOptions}
          onChange={onTeamChange}
          emptyMessage="No teams in this sport"
        />
        <SearchableSelect
          label="Player"
          placeholder="All players"
          value={player}
          options={playerOptions}
          onChange={onPlayerChange}
          emptyMessage="No players match"
        />
      </div>
    </div>
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
  onLegClick,
}: {
  cards: Array<{
    profile: ParlayRiskProfile;
    slips: ParlaySlip[];
    isFallback: boolean;
  }>;
  source: "snapshot" | "graded";
  calibrationTable?: CalibrationTable;
  filterActive: boolean;
  onLegClick?: (leg: ParlaySlip["legs"][number]) => void;
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
          onLegClick={onLegClick}
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
  onLegClick,
}: {
  profile: ParlayRiskProfile;
  slips: ParlaySlip[];
  isFallback: boolean;
  source: "snapshot" | "graded";
  calibrationTable?: CalibrationTable;
  filterActive: boolean;
  onLegClick?: (leg: ParlaySlip["legs"][number]) => void;
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
                onLegClick={onLegClick}
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

/**
 * Small placeholder card surfacing the upcoming alt-line lane. Honest
 * copy — we don't ship the lane until alt-line coverage is reliable.
 * See `docs/ALT_LINE_PARLAY_PLAN.md`.
 */
function AltLineComingSoon() {
  return (
    <aside
      className="rounded-[8px] p-3 flex items-center gap-3"
      style={{
        background: "rgba(7,11,26,0.4)",
        border: "1px dashed var(--vault-border)",
      }}
    >
      <span
        aria-hidden
        style={{ fontSize: 18 }}
      >
        🎯
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          Alt-line parlays · coming soon
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
        >
          Lower-variance slips built on alternate lines. We need
          richer alt-line coverage from the books first — no
          fabricated slips.
        </span>
      </div>
    </aside>
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
