"use client";
/**
 * ParlayLabBuilder — team-first slip picker.
 *
 * Flow:
 *   1. Sport pills (All · NBA · MLB · Mixed)
 *   2. Team pills filtered by sport
 *   3. Player chips filtered by sport + team
 *   4. Three safe risk-level cards (Conservative · Balanced · Star
 *      Power), each with up to 2 visible slips. The Longshot /
 *      "high variance" lane is collapsed behind a "Show high
 *      variance" toggle (PR #110 safety filters A + B).
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
import CustomParlayBuilder from "./custom-parlay-builder";
import SearchableSelect, {
  type SearchableOption,
} from "./searchable-select";
import {
  fallbackToBestUnfilteredSlips,
  filterSlipsBySportTeamPlayer,
  getAvailablePlayersForTeam,
  getAvailableSportsFromSlips,
  getAvailableTeamsFromSlips,
  selectDiverseForDisplay,
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

const ALL_SPORTS: Array<{ key: SuggestedSport; label: string; icon?: string }> = [
  { key: "all", label: "All" },
  { key: "nba", label: "NBA", icon: "🏀" },
  { key: "mlb", label: "MLB", icon: "⚾" },
  { key: "multi", label: "Mixed", icon: "🔀" },
];

const RISK_DISPLAY: Record<
  ParlayRiskProfile,
  { label: string; sub: string; accent: string; icon: string }
> = {
  conservative: {
    label: "Conservative",
    sub: "2 legs · star-driven · lower variance",
    accent: "var(--vault-success)",
    icon: "◆",
  },
  balanced: {
    label: "Balanced",
    sub: "3 legs · star + value mix",
    accent: "var(--vault-gold-bright)",
    icon: "◈",
  },
  aggressive: {
    label: "Longshot · experimental",
    sub: "Up to 4 legs · higher payout · longshot territory",
    accent: "var(--vault-warn)",
    icon: "⟁",
  },
  star_power: {
    label: "Star Power",
    sub: "Recognizable stars · model-ranked",
    accent: "var(--vault-gold-bright)",
    icon: "★",
  },
};

/**
 * Visible-by-default lanes (PR #110 safety filter A).
 * High-variance is moved into a collapsed "Show high variance" toggle
 * so it never appears as a default top card on the homepage.
 */
const SAFE_RISK_ORDER: ParlayRiskProfile[] = [
  "conservative",
  "balanced",
  "star_power",
];

const HIGH_VARIANCE_PROFILE: ParlayRiskProfile = "aggressive";

/**
 * How many visible slips to show per lane. PR #110 filter A drops this
 * from 3 → 2 for the safe lanes because audit (5/25) showed the 3rd
 * alternate routinely lost across Conservative/Balanced/Star Power.
 * High Variance also capped at 2 visible (cap from spec G: "cap
 * aggressive at 4 visible" — we go tighter at 2 to match the rest of
 * the surface).
 */
const VISIBLE_PER_LANE_SAFE = 2;
const VISIBLE_PER_LANE_HV = 2;

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

  // For each risk profile, pick the best slip + up to N alternates
  // (N driven by VISIBLE_PER_LANE_*).
  //
  // We pool slips across optimizer buckets (nba / mlb / multi / all)
  // and pass them through `selectDiverseForDisplay`, which enforces a
  // cross-slip recurrence penalty so the visible cards don't all
  // share the same anchor player. PR #110 filter D also applies a
  // Mixed-sport penalty inside that selector so Conservative/Balanced
  // prefer single-sport slips when possible.
  //
  // PR #110 filter A: safe lanes (Conservative/Balanced/Star Power)
  // are capped at 2 visible per lane (down from 3). High Variance is
  // built separately and rendered behind a "Show high variance"
  // toggle (see `hvCard` below).
  //
  // When the filtered pool is empty for a profile, surface the top
  // unfiltered slip for that sport (clearly labeled as fallback).
  const buildCardForProfile = (
    profile: ParlayRiskProfile,
    limit: number,
  ) => {
    const matched = filtered.filter((s) => s.riskProfile === profile);
    if (matched.length > 0) {
      return {
        profile,
        slips: selectDiverseForDisplay(matched, profile, limit),
        isFallback: false,
      };
    }
    const fb = fallbackToBestUnfilteredSlips(
      pool.filter((s) => s.riskProfile === profile),
      sport,
      1,
    );
    return { profile, slips: fb, isFallback: true };
  };

  const cards = useMemo(
    () =>
      SAFE_RISK_ORDER.map((profile) =>
        buildCardForProfile(profile, VISIBLE_PER_LANE_SAFE),
      ),
    // buildCardForProfile is stable enough — its inputs (filtered,
    // pool, sport) are listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, pool, sport],
  );

  const hvCard = useMemo(
    () => buildCardForProfile(HIGH_VARIANCE_PROFILE, VISIBLE_PER_LANE_HV),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, pool, sport],
  );

  const [showHighVariance, setShowHighVariance] = useState(false);

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

      <ExperimentalDisclaimer />

      <RiskGrid
        cards={cards}
        source={source}
        calibrationTable={calibrationTable}
        filterActive={filterActive}
        onLegClick={setActiveLeg}
      />

      <HighVarianceToggle
        open={showHighVariance}
        onToggle={() => setShowHighVariance((v) => !v)}
        card={hvCard}
        source={source}
        calibrationTable={calibrationTable}
        filterActive={filterActive}
        onLegClick={setActiveLeg}
      />

      <AltLineComingSoon />
      <CustomParlayBuilder snapshot={optimizerPayload ?? null} />
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
          ? "Pick a sport, a team, and the players you care about. The model returns the best slip in each safer lane — Conservative, Balanced, Star Power. High variance is opt-in."
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
  sportOptions: Array<{ key: SuggestedSport; label: string; icon?: string }>;
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
                className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-full inline-flex items-center gap-1.5"
                style={{
                  color: active ? "var(--vault-bg)" : "var(--vault-text-mute)",
                  background: active ? "var(--vault-gold-bright)" : "transparent",
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                {opt.icon ? <span aria-hidden style={{ fontSize: 12 }}>{opt.icon}</span> : null}
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
  const isStarPower = profile === "star_power";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className="inline-flex items-center justify-center shrink-0"
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              color: display.accent,
              background: isStarPower
                ? "linear-gradient(160deg, rgba(240,199,94,0.18), rgba(212,175,55,0.05))"
                : "rgba(7,11,26,0.55)",
              border: `1px solid ${display.accent}`,
              fontSize: 12,
              lineHeight: 1,
              boxShadow: isStarPower
                ? "0 0 14px -2px rgba(240,199,94,0.40)"
                : "none",
            }}
          >
            {display.icon}
          </span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span
              className="font-mono uppercase tracking-[0.14em] sm:tracking-[0.16em]"
              style={{ color: display.accent, fontSize: 10 }}
            >
              {display.label}
            </span>
            <span
              className="font-mono truncate"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              {display.sub}
            </span>
          </div>
        </div>
        {profile === "aggressive" && (
          <span
            className="font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-[3px] shrink-0"
            style={{
              color: "var(--vault-warn)",
              border: "1px solid var(--vault-warn)",
              background: "rgba(7,11,26,0.55)",
              fontSize: 9,
            }}
            title="Longshot lane went 0-14 in the 5/25 audit. Tracked publicly."
          >
            Longshot
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
 * Public-tracking disclaimer banner (PR #110 filter A).
 *
 * After the 5/25 audit (6W-54L-0P-10 pending on 70 unique slips, 10%
 * decisive hit rate) we surface honest "experimental + publicly
 * tracked" copy directly above the lane grid. No win-rate spin, no
 * "guaranteed" / "lock" / "free money" / "can't miss" language —
 * just the truth that these are tracked publicly so users can see
 * for themselves.
 */
function ExperimentalDisclaimer() {
  return (
    <aside
      className="rounded-[8px] p-3 flex items-start gap-3"
      style={{
        background: "rgba(7,11,26,0.45)",
        border: "1px dashed var(--vault-border)",
      }}
      role="note"
    >
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1.2 }}>
        ⚠
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-warn)", fontSize: 10 }}
        >
          Experimental · publicly tracked
        </span>
        <span
          className="text-[12.5px] leading-snug"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Suggested slips are experimental and tracked publicly on the
          Results page. Past performance does not predict future
          results.
        </span>
      </div>
    </aside>
  );
}

/**
 * Collapsible "Show high variance" section (PR #110 filter B).
 *
 * The Longshot lane is hidden by default. Users opt in explicitly —
 * the audit showed Aggressive went 0-14 on 5/25, so it should never
 * present itself as a peer to the safer lanes on first paint.
 */
function HighVarianceToggle({
  open,
  onToggle,
  card,
  source,
  calibrationTable,
  filterActive,
  onLegClick,
}: {
  open: boolean;
  onToggle: () => void;
  card: {
    profile: ParlayRiskProfile;
    slips: ParlaySlip[];
    isFallback: boolean;
  };
  source: "snapshot" | "graded";
  calibrationTable?: CalibrationTable;
  filterActive: boolean;
  onLegClick?: (leg: ParlaySlip["legs"][number]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="self-start font-mono uppercase tracking-[0.16em] px-3 py-1.5 rounded-[6px] inline-flex items-center gap-2"
        style={{
          color: "var(--vault-warn)",
          border: "1px solid var(--vault-warn)",
          background: "rgba(7,11,26,0.55)",
          fontSize: 10,
          cursor: "pointer",
        }}
      >
        <span aria-hidden style={{ fontSize: 12 }}>
          {open ? "▾" : "▸"}
        </span>
        {open ? "Hide" : "Show"} high variance
      </button>
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3 max-w-[420px]">
            <RiskCard
              profile={card.profile}
              slips={card.slips}
              isFallback={card.isFallback}
              source={source}
              calibrationTable={calibrationTable}
              filterActive={filterActive}
              onLegClick={onLegClick}
            />
          </div>
        </div>
      )}
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
