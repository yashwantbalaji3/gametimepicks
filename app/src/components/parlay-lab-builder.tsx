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
import RiskSectionSpread from "./risk-section-spread";
import { BuildMyCardProvider } from "./build-my-card-context";
import SelectedSlipsTray from "./selected-slips-tray";
import PlayerRecentFormDrawer from "./player-recent-form-drawer";
import CustomParlayBuilder from "./custom-parlay-builder";
import CustomParlayGenerator from "./custom-parlay-generator";
import BankrollPlanPanel from "./bankroll-plan-panel";
import ParlayLabModeTabs, {
  type ParlayLabMode,
} from "./parlay-lab-mode-tabs";
import PoolAvailabilityNote from "./pool-availability-note";
import {
  classifyPoolAvailability,
  shouldRenderAvailabilityNote,
  type PoolAvailability,
} from "@/lib/pool-availability";
import SearchableSelect, {
  type SearchableOption,
} from "./searchable-select";
import {
  fallbackToBestUnfilteredSlips,
  filterSlipsBySportTeamPlayer,
  getAvailableGamesFromSlips,
  getAvailablePlayersForTeam,
  getAvailableSportsFromSlips,
  getAvailableTeamsFromSlips,
  selectDiverseForDisplay,
  slipContainsGame,
  type ParlayRiskProfile,
  type ParlaySlip,
  type SectionEmptyAction,
  type SuggestedSport,
} from "@/lib/parlay-suggested";
import type { SectionAlternatives } from "./risk-section-spread";
import {
  HIGH_VARIANCE_DEFAULT_OPEN,
  HIGH_VARIANCE_PROFILE,
  SAFE_RISK_ORDER,
  VISIBLE_PER_LANE_HV,
  VISIBLE_PER_LANE_SAFE,
  isAllowedOfficialSlip,
} from "@/lib/parlay-display-config";
import {
  flattenOptimizerSlips,
  optimizerSlipToParlaySlip,
  type OptimizerSnapshot,
  type OptimizerSlip,
} from "@/lib/parlay-optimizer";
import {
  countDisplaySlips,
  type RiskSectionKey,
} from "@/lib/parlay-risk-sections";
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
  /**
   * Rendered inside a page that already supplies its own H1 hero
   * (the homepage). When true the builder suppresses its own
   * Suggested-mode title — which would otherwise duplicate the page
   * hero — and demotes the Build/Bankroll-mode titles to an `<h2>` so
   * the page keeps a single H1. On the standalone `/parlay-lab` route
   * this stays false and the builder owns the page H1 as before.
   */
  embedded?: boolean;
}

const ALL_SPORTS: Array<{ key: SuggestedSport; label: string; icon?: string }> = [
  { key: "all", label: "All" },
  { key: "nba", label: "NBA", icon: "🏀" },
  { key: "mlb", label: "MLB", icon: "⚾" },
  { key: "multi", label: "Mixed", icon: "🔀" },
];

/** UI-only sport bucket label for the lane header. Mirrors the
 *  bucket derivation that ParlayTicketCard uses for non-spread
 *  surfaces; centralised here so all lanes in the spread agree on
 *  one label. Null for the "All" tab — the lane header still has
 *  the slate-date + Official + slip-count chips. */
function bucketLabelForSport(s: SuggestedSport): string | null {
  if (s === "nba") return "NBA-only";
  if (s === "mlb") return "MLB-only";
  if (s === "multi") return "Mixed";
  return null;
}

// Lane caps + ordering live in `@/lib/parlay-display-config` so the
// constants can be unit-tested without booting a JSX renderer.

export default function ParlayLabBuilder({
  slips,
  date,
  source,
  isFallback,
  calibrationTable,
  optimizerPayload = null,
  embedded = false,
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
  const [game, setGame] = useState<string | null>(null);
  const [player, setPlayer] = useState<string | null>(null);

  // Keep the active sport valid when the underlying pool changes.
  useEffect(() => {
    if (!availableSports.includes(sport)) {
      setSport(availableSports[0] ?? "all");
      setTeam(null);
      setGame(null);
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

  const gameSelectOptions = useMemo<SearchableOption[]>(() => {
    const games = getAvailableGamesFromSlips(pool, sport);
    return [
      { value: null, label: "All games" },
      ...games.map((g) => ({
        value: g.key,
        label: g.label,
        sub: g.sport.toUpperCase(),
        searchText: g.label,
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
    setGame(null);
    setPlayer(null);
  }

  function changeTeam(next: string | null) {
    if (next === team) return;
    setTeam(next);
    setPlayer(null);
  }

  function changeGame(next: string | null) {
    if (next === game) return;
    setGame(next);
  }

  function changePlayer(next: string | null) {
    if (next === player) return;
    setPlayer(next);
  }

  // Switch the sport tab while OPTIONALLY preserving the active game
  // filter. `changeSport` always resets the game (a different sport has
  // different games), but the empty-section "Show Mixed with this game"
  // quick action needs to keep the game when crossing NBA → Mixed/All.
  // Team + player are always cleared on a sport switch (sport-scoped).
  function switchSportKeepGame(next: SuggestedSport, keepGame: boolean) {
    setSport(next);
    setTeam(null);
    setPlayer(null);
    if (!keepGame) setGame(null);
  }

  // Interpret an empty-section quick action emitted by RiskSectionSpread.
  function handleEmptyAction(action: SectionEmptyAction) {
    switch (action.kind) {
      case "switch-mixed":
      case "switch-all":
        if (action.targetSport) {
          switchSportKeepGame(action.targetSport, action.keepGame);
        }
        break;
      case "clear-game":
        setGame(null);
        break;
      case "clear-sport":
        setSport(sportOptions[0]?.key ?? "all");
        setTeam(null);
        setGame(null);
        setPlayer(null);
        break;
    }
  }

  // ---- Apply filters -------------------------------------------------
  const filtered = useMemo(
    () =>
      filterSlipsBySportTeamPlayer(pool, {
        sport,
        team,
        gameKey: game,
        playerNames: player ? [player] : [],
      }),
    [pool, sport, team, game, player],
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
    // PR #110 filter G: hide 5+ leg slips from official suggestions.
    // Backend already caps newly-generated snapshots at 4 legs; this
    // is a safety belt for legacy snapshot files. Custom Builder
    // remains untouched — users can still build risky combos there.
    const matched = filtered
      .filter((s) => s.riskProfile === profile)
      .filter(isAllowedOfficialSlip);
    if (matched.length > 0) {
      return {
        profile,
        slips: selectDiverseForDisplay(matched, profile, limit),
        isFallback: false,
      };
    }
    const fb = fallbackToBestUnfilteredSlips(
      pool.filter((s) => s.riskProfile === profile).filter(isAllowedOfficialSlip),
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

  // PR #114: sport pills now count as active filters so the
  // empty-state copy below switches into sport-aware mode when
  // the user picks NBA / MLB / Mixed and gets nothing back.
  const filterActive =
    team !== null || game !== null || player !== null || sport !== "all";

  // Recent-form drawer state — tracks the clicked leg.
  const [activeLeg, setActiveLeg] = useState<ParlaySlip["legs"][number] | null>(null);

  // PR `feature/parlay-lab-mode-tabs-bankroll` (2026-05-28) — top-level
  // mode switcher. Suggested is the default mode and renders the
  // official lane spreads. Build Your Own surfaces the custom-builder
  // tools clearly framed as "not officially tracked." Bankroll Plan is
  // a planning aid layered on top of the same officially-suggested
  // slips. Filters stay applied for Suggested and Bankroll modes (so
  // the pool is consistent); Build Your Own runs against the full
  // optimizer snapshot.
  const [mode, setMode] = useState<ParlayLabMode>("suggested");

  // Pool of suggested slips used by the Bankroll Plan — same filter
  // pool as Suggested mode, with the safe-lane visibility cap removed
  // so the bankroll allocator can pick across more than just the
  // top-N visible cards. The cap was an editorial decision for the
  // 3-column grid; the bankroll allocator is its own surface.
  const bankrollPoolSlips = useMemo<ParlaySlip[]>(() => {
    return filtered.filter(isAllowedOfficialSlip);
  }, [filtered]);

  // PR `feature/nba-pool-availability-note` (2026-05-28): classify each
  // sport pool. When `sourcePools.nbaCount > 0` but every NBA lean was
  // dropped (R1 guardrail), the user otherwise sees only MLB without
  // explanation. PoolAvailabilityNote surfaces the honest cause.
  const poolAvailability: PoolAvailability = useMemo(
    () => classifyPoolAvailability(optimizerPayload ?? null),
    [optimizerPayload],
  );

  // PR `fix/public-risk-range-leg-counts` (2026-05-28) — pre-bucketed
  // public risk sections from the snapshot, filtered to the active
  // sport tab. When the snapshot predates this PR (no
  // `publicRiskSections` key), this stays undefined and RiskSectionSpread
  // falls back to its client-side classifier over the visible slips.
  const sportSections: Partial<Record<RiskSectionKey, ParlaySlip[]>> | undefined =
    useMemo(() => {
      const psr = optimizerPayload?.publicRiskSections;
      if (!psr) return undefined;
      const sportKey = (sport === "all" ? "all" : sport) as
        | "all"
        | "nba"
        | "mlb"
        | "multi";
      const sectionKeys: RiskSectionKey[] = ["low", "medium", "high", "longshot"];
      const out: Partial<Record<RiskSectionKey, ParlaySlip[]>> = {};
      for (const key of sectionKeys) {
        const slipsForSection = psr[key]?.[sportKey] ?? [];
        // The Suggested mode also filters by team / player via the
        // sport-aware Lab filters. When a team or player filter is
        // active we drop server-bucketed sections and let the
        // client-side classifier handle the user's narrowed pool —
        // otherwise the publicRiskSections (which is sport-only) would
        // show slips that ignore the user's team/player choice.
        out[key] = slipsForSection.map((s) =>
          optimizerSlipToParlaySlip(s, optimizerPayload!.date),
        );
      }
      return out;
    }, [optimizerPayload, sport]);

  // When team or player is active we must honor that filter — the
  // server-bucketed sections are sport-only, so apply the team/player
  // filter on top of them. If the result starves a section, the
  // honest empty-state copy renders.
  const teamPlayerFiltered = useMemo<
    Partial<Record<RiskSectionKey, ParlaySlip[]>> | undefined
  >(() => {
    if (!sportSections) return undefined;
    if (team == null && game == null && player == null) return sportSections;
    const out: Partial<Record<RiskSectionKey, ParlaySlip[]>> = {};
    for (const [k, arr] of Object.entries(sportSections) as Array<
      [RiskSectionKey, ParlaySlip[]]
    >) {
      out[k] = filterSlipsBySportTeamPlayer(arr, {
        sport,
        team,
        gameKey: game,
        playerNames: player ? [player] : [],
      });
    }
    return out;
  }, [sportSections, sport, team, game, player]);

  // Per-section availability of the Mixed / All lanes, honoring the
  // active game filter. Drives the empty-section quick actions so a
  // "Show Mixed with this game" button is only offered when that lane
  // genuinely carries this section for that game. Lane selection is
  // fixed (multi / all) and independent of the active sport tab — the
  // switch action will move the user to that tab. Team/player are NOT
  // applied here because switching sport clears them.
  const sectionAlternatives = useMemo<SectionAlternatives | undefined>(() => {
    const psr = optimizerPayload?.publicRiskSections;
    if (!psr) return undefined;
    const sectionKeys: RiskSectionKey[] = ["low", "medium", "high", "longshot"];
    const laneHasContent = (
      lane: "multi" | "all",
      key: RiskSectionKey,
    ): boolean => {
      const raw = psr[key]?.[lane] ?? [];
      if (raw.length === 0) return false;
      if (game == null) return true;
      return raw
        .map((s) => optimizerSlipToParlaySlip(s, optimizerPayload!.date))
        .some((s) => slipContainsGame(s, game));
    };
    const out: SectionAlternatives = {};
    for (const key of sectionKeys) {
      out[key] = {
        mixed: laneHasContent("multi", key),
        all: laneHasContent("all", key),
      };
    }
    return out;
  }, [optimizerPayload, game]);

  // Honest cross-lane hint for the summary line (runbook req 1): when the
  // user is on a single-sport tab and Mixed/All lanes carry that sport's
  // legs for the active game, surface that those lanes exist rather than
  // implying the single-sport tab is the whole story.
  const crossLaneHint = useMemo<string | null>(() => {
    if (sport !== "nba" && sport !== "mlb") return null;
    if (!sectionAlternatives) return null;
    const anyMixed = Object.values(sectionAlternatives).some((a) => a?.mixed);
    const anyAll = Object.values(sectionAlternatives).some((a) => a?.all);
    if (!anyMixed && !anyAll) return null;
    const sportLabel = sport === "nba" ? "NBA" : "MLB";
    const scope = game ? "this game" : "today's slate";
    if (anyMixed) {
      return `Mixed parlays with ${sportLabel} legs are also available for ${scope}.`;
    }
    return `The All tab carries more ${sportLabel} parlays for ${scope}.`;
  }, [sport, sectionAlternatives, game]);

  // ---- "Showing N parlays" summary ----------------------------------
  // The count is derived from the SAME buckets RiskSectionSpread renders
  // (getDisplaySectionBuckets via countDisplaySlips), so the headline
  // number can never disagree with the cards actually on screen. The
  // server-bucketed `teamPlayerFiltered` sections win when present;
  // otherwise we fall back to re-bucketing the visible slips.
  const suggestedDisplaySlips = useMemo<ParlaySlip[]>(
    () => [...cards.flatMap((c) => c.slips), ...hvCard.slips],
    [cards, hvCard],
  );
  const displayedSlipCount = useMemo(
    () =>
      countDisplaySlips({
        sections: teamPlayerFiltered,
        slips: suggestedDisplaySlips,
      }),
    [teamPlayerFiltered, suggestedDisplaySlips],
  );
  const filterContextLabel = useMemo(() => {
    const gameLabel = game
      ? gameSelectOptions.find((o) => o.value === game)?.label ?? null
      : null;
    return buildFilterContextLabel({ sport, team, gameLabel, player });
  }, [sport, team, game, gameSelectOptions, player]);

  return (
    // PR `feature/build-my-card-selected-slips` — the provider holds the
    // ephemeral "Build My Card" selection (in-memory only). It wraps the
    // whole builder so the selection survives mode switches, but the
    // selection affordance + tray are only wired into Suggested mode.
    <BuildMyCardProvider>
    <section className="flex flex-col gap-5" aria-label="Parlay Lab builder">
      <BuilderHeader
        mode={mode}
        date={date}
        source={source}
        isFallback={!!isFallback}
        optimizerActive={optimizerActive}
        embedded={embedded}
      />

      <ParlayLabModeTabs active={mode} onChange={setMode} />

      {/* Filters live above all modes EXCEPT Build Your Own — the
          custom builder + generator have their own pickers and the
          shared sport/team/player toolbar is noise there. */}
      {mode !== "build" && (
        <LabFilters
          sport={sport}
          sportOptions={sportOptions}
          onSportChange={changeSport}
          team={team}
          teamOptions={teamSelectOptions}
          onTeamChange={changeTeam}
          game={game}
          gameOptions={gameSelectOptions}
          onGameChange={changeGame}
          player={player}
          playerOptions={playerSelectOptions}
          onPlayerChange={changePlayer}
          onClearAll={() => {
            setSport(sportOptions[0]?.key ?? "all");
            setTeam(null);
            setGame(null);
            setPlayer(null);
          }}
        />
      )}

      {mode === "suggested" && (
        <>
          <FilterSummaryLine
            count={displayedSlipCount}
            context={filterContextLabel}
            hint={crossLaneHint}
          />
          <SuggestedMode
            cards={cards}
            hvCard={hvCard}
            date={date}
            isFallback={!!isFallback}
            sport={sport}
            filterActive={filterActive}
            source={source}
            calibrationTable={calibrationTable}
            onLegClick={setActiveLeg}
            poolAvailability={poolAvailability}
            sections={teamPlayerFiltered}
            game={game}
            sectionAlternatives={sectionAlternatives}
            onEmptyAction={handleEmptyAction}
            selectable
          />
        </>
      )}

      {mode === "build" && (
        <BuildYourOwnMode optimizerPayload={optimizerPayload ?? null} />
      )}

      {mode === "bankroll" && (
        <BankrollMode slips={bankrollPoolSlips} />
      )}

      <BuilderFootnote optimizerActive={optimizerActive} mode={mode} />
      <PlayerRecentFormDrawer leg={activeLeg} onClose={() => setActiveLeg(null)} />

      {/* Selected Slips tray — only surfaced in Suggested mode, where the
          selection toggles live. The selection itself persists in the
          provider across mode switches. */}
      {mode === "suggested" && <SelectedSlipsTray />}
    </section>
    </BuildMyCardProvider>
  );
}

// ---------------------------------------------------------------------------
// Mode-specific sections
// ---------------------------------------------------------------------------

function SuggestedMode({
  cards,
  hvCard,
  date,
  isFallback,
  sport,
  filterActive,
  source,
  calibrationTable,
  onLegClick,
  poolAvailability,
  sections,
  game,
  sectionAlternatives,
  onEmptyAction,
  selectable = false,
}: {
  cards: Array<{
    profile: ParlayRiskProfile;
    slips: ParlaySlip[];
    isFallback: boolean;
  }>;
  hvCard: {
    profile: ParlayRiskProfile;
    slips: ParlaySlip[];
    isFallback: boolean;
  };
  date: string;
  isFallback: boolean;
  sport: SuggestedSport;
  filterActive: boolean;
  source: "snapshot" | "graded";
  calibrationTable?: CalibrationTable;
  onLegClick: (leg: ParlaySlip["legs"][number]) => void;
  poolAvailability: PoolAvailability;
  /** Server-bucketed public risk sections, already filtered to the
   *  active sport (and team/player). Undefined when the snapshot
   *  predates the server-side selector — RiskSectionSpread falls back
   *  to its client-side classifier in that case. */
  sections?: Partial<Record<RiskSectionKey, ParlaySlip[]>>;
  /** Active game key (or null) for empty-state quick-action copy. */
  game?: string | null;
  /** Per-section Mixed/All lane availability for empty-state actions. */
  sectionAlternatives?: SectionAlternatives;
  /** Empty-section quick-action handler. */
  onEmptyAction?: (action: SectionEmptyAction) => void;
  /** When true, each ticket card renders the opt-in "Add to my card"
   *  toggle and reads/writes the BuildMyCard selection context. */
  selectable?: boolean;
}) {
  // PR `feature/parlay-risk-section-simplification` (2026-05-28) —
  // replaced the four per-profile <LaneSpread>s plus the Swing toggle
  // with a single <RiskSectionSpread> that groups every visible slip
  // by combined-odds-derived risk section (Low / Medium / High /
  // Longshot). Internal profile names (Anchor / Core / Spotlight /
  // Swing) are kept in the optimizer payload + Bankroll Plan
  // allocator, but the public Suggested mode no longer surfaces them.
  // The previous SectionEyebrow + AltLineComingSoon callouts are
  // dropped — the slate strip + each section header carry the same
  // context with much less internal-jargon copy.
  void filterActive; // soft-handled by RiskSectionSpread's empty state
  void date;
  void isFallback;
  const allSlips: ParlaySlip[] = [
    ...cards.flatMap((c) => c.slips),
    ...hvCard.slips,
  ];
  return (
    <>
      {shouldRenderAvailabilityNote(poolAvailability) && (
        <PoolAvailabilityNote availability={poolAvailability} />
      )}
      <RiskSectionSpread
        slips={allSlips}
        sections={sections}
        sport={sport}
        source={source}
        calibrationTable={calibrationTable}
        onLegClick={onLegClick}
        game={game}
        sectionAlternatives={sectionAlternatives}
        onEmptyAction={onEmptyAction}
        selectable={selectable}
      />
    </>
  );
}

function BuildYourOwnMode({
  optimizerPayload,
}: {
  optimizerPayload: OptimizerSnapshot | null;
}) {
  return (
    <>
      <SectionEyebrow
        tone="custom"
        label="Build your own · not officially tracked"
        sub="Custom slips here are exploratory. They are not included in the public hit-rate that /results tracks."
      />
      <CustomParlayGenerator snapshot={optimizerPayload} />
      <CustomParlayBuilder snapshot={optimizerPayload} />
    </>
  );
}

function BankrollMode({ slips }: { slips: ParlaySlip[] }) {
  return (
    <>
      <SectionEyebrow
        tone="custom"
        label="Bankroll plan · educational"
        sub="Set a bankroll and a risk preference. The planner distributes it across today's model-ranked slips. Stakes are editable; payouts are projections, not guarantees."
      />
      <BankrollPlanPanel slips={slips} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Section eyebrow — small mono label that separates Official / Custom /
// Manual blocks visually without adding a heavy headline. Tone keys the
// accent colour so the official block reads success-green and the
// custom blocks read muted-mute. PR #125.
// ---------------------------------------------------------------------------

function SectionEyebrow({
  tone,
  label,
  sub,
}: {
  tone: "official" | "custom";
  label: string;
  sub?: string;
}) {
  const accent =
    tone === "official"
      ? "var(--vault-success)"
      : "var(--vault-text-mute)";
  return (
    // PR #4 — more vertical breathing room between sections, stronger
    // eyebrow typography, sub copy bumped 12→13 to read clearly on the
    // hybrid theme's light canvas.
    <header className="flex flex-col gap-1.5 mt-6 sm:mt-8">
      <span
        className="font-mono uppercase tracking-[0.16em] inline-flex items-center gap-2.5"
        style={{ color: accent, fontSize: 12, lineHeight: 1.2 }}
      >
        <span
          aria-hidden
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: accent }}
        />
        {label}
      </span>
      {sub && (
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)", maxWidth: 680 }}
        >
          {sub}
        </p>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function BuilderHeader({
  mode,
  date,
  source,
  isFallback,
  optimizerActive,
  embedded,
}: {
  mode: ParlayLabMode;
  date: string;
  source: "snapshot" | "graded";
  isFallback: boolean;
  optimizerActive: boolean;
  /** When the builder is embedded under a page that already owns the
   *  H1 hero (the homepage), the Suggested-mode title is suppressed
   *  (it would duplicate the hero) and the remaining titles render as
   *  an `<h2>` so the page keeps a single H1. */
  embedded?: boolean;
}) {
  void source; void isFallback; void date;
  // On the homepage the page hero already says "Today's best suggested
  // parlays.", so rendering the builder's own Suggested title here
  // would duplicate it. Suppress it; Build/Bankroll modes still get a
  // contextual section title (as an <h2>).
  if (embedded && mode === "suggested") return null;
  const title =
    mode === "build"
      ? "Build your own."
      : mode === "bankroll"
        ? "Plan your bankroll."
        : "Today's suggested parlays.";
  const subcopy =
    mode === "build"
      ? "Generate custom slips or compose them by hand from the same leg pool. Custom slips are exploratory — they do not count toward the public hit-rate."
      : mode === "bankroll"
        ? "Set a bankroll, pick a risk preference, and the planner suggests stake sizes across today's model-ranked slips. Educational — not financial advice."
        : optimizerActive
          ? "Model-ranked parlays grouped by combined odds — Low Risk, Medium Risk, High Risk, Longshot. Saved before games and graded after."
          : "Pregame snapshots saved before games, graded after.";
  const Heading = embedded ? "h2" : "h1";
  return (
    <header className="flex flex-col gap-2">
      <Heading
        className="font-display tracking-tight"
        style={{
          color: "var(--vault-text)",
          fontSize: embedded ? "clamp(20px, 4vw, 30px)" : "clamp(26px, 5vw, 40px)",
          lineHeight: 1.05,
          letterSpacing: "-0.015em",
          fontWeight: 600,
        }}
      >
        {title}
      </Heading>
      <p
        className="text-[14px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 680 }}
      >
        {subcopy}
      </p>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Filter summary
// ---------------------------------------------------------------------------

/** Compose the "· NBA · NYM · Aaron Judge" context suffix from the
 *  active filters. Returns null when nothing beyond the default "All"
 *  sport is selected, so the summary reads a clean "Showing N parlays". */
function buildFilterContextLabel({
  sport,
  team,
  gameLabel,
  player,
}: {
  sport: SuggestedSport;
  team: string | null;
  gameLabel: string | null;
  player: string | null;
}): string | null {
  const parts: string[] = [];
  if (sport === "nba") parts.push("NBA");
  else if (sport === "mlb") parts.push("MLB");
  else if (sport === "multi") parts.push("Mixed");
  if (team) parts.push(team);
  if (gameLabel) parts.push(gameLabel);
  if (player) parts.push(player);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * One-line orientation summary above the risk sections: "Showing N
 * parlays" plus the active-filter context. `count` is the exact number
 * of cards rendered below (shared bucket source), so the line is always
 * truthful — including "Showing 0 parlays · NYM" when a filter starves
 * the pool, which pairs with the per-section empty states. `aria-live`
 * announces the new count to screen readers as filters change.
 */
function FilterSummaryLine({
  count,
  context,
  hint,
}: {
  count: number;
  context: string | null;
  /** Optional honest cross-lane hint (e.g. "Mixed parlays with NBA legs
   *  are also available.") rendered as a quiet second line. */
  hint?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 -mt-1">
      <p
        className="font-mono text-[12px]"
        style={{ color: "var(--vault-text-mute)" }}
        aria-live="polite"
      >
        Showing{" "}
        <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>
          {count}
        </span>{" "}
        {count === 1 ? "parlay" : "parlays"}
        {context ? (
          <>
            {" "}
            · <span style={{ color: "var(--vault-text)" }}>{context}</span>
          </>
        ) : null}
      </p>
      {hint ? (
        <p
          className="text-[11.5px] leading-snug"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {hint}
        </p>
      ) : null}
    </div>
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
  game,
  gameOptions,
  onGameChange,
  player,
  playerOptions,
  onPlayerChange,
  onClearAll,
}: {
  sport: SuggestedSport;
  sportOptions: Array<{ key: SuggestedSport; label: string; icon?: string }>;
  onSportChange: (s: SuggestedSport) => void;
  team: string | null;
  teamOptions: SearchableOption[];
  onTeamChange: (t: string | null) => void;
  game: string | null;
  gameOptions: SearchableOption[];
  onGameChange: (g: string | null) => void;
  player: string | null;
  playerOptions: SearchableOption[];
  onPlayerChange: (p: string | null) => void;
  onClearAll: () => void;
}) {
  const defaultSport = sportOptions[0]?.key ?? "all";
  const anyFilterActive =
    team !== null || game !== null || player !== null || sport !== defaultSport;
  return (
    // PR `feature/parlay-lab-filter-rail-polish` (2026-05-28):
    // collapsed the previous 3-row, ~150px filter card into a single
    // inline toolbar (~56px on desktop, ~104px on mobile).  Sport
    // pills are the primary control; Team/Player searchable selects
    // sit inline with no redundant "TEAM"/"PLAYER" eyebrows above
    // them — the placeholders ("All teams"/"All players") are the
    // labels.  A `Clear` chip appears only when the user has set a
    // non-default filter.
    <div
      aria-label="Parlay Lab filters"
      role="toolbar"
      className="rounded-[8px] px-3 py-2 flex flex-wrap items-center gap-2 sm:gap-3"
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div
        className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full"
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
              aria-pressed={active}
              className="font-mono uppercase tracking-[0.14em] px-2.5 py-1 rounded-full inline-flex items-center gap-1.5"
              style={{
                color: active ? "var(--vault-bg)" : "var(--vault-text-mute)",
                background: active ? "var(--vault-gold-bright)" : "transparent",
                fontSize: 10,
                cursor: "pointer",
                fontWeight: active ? 600 : 500,
              }}
            >
              {opt.icon ? <span aria-hidden style={{ fontSize: 12 }}>{opt.icon}</span> : null}
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-1 min-w-[180px] flex-wrap gap-2 sm:gap-3">
        <div className="flex-1 min-w-[140px]">
          <SearchableSelect
            label="Team filter"
            placeholder="All teams"
            value={team}
            options={teamOptions}
            onChange={onTeamChange}
            emptyMessage="No teams in this sport"
            compact
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <SearchableSelect
            label="Game filter"
            placeholder="All games"
            value={game}
            options={gameOptions}
            onChange={onGameChange}
            emptyMessage="No games in this sport"
            compact
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <SearchableSelect
            label="Player filter"
            placeholder="All players"
            value={player}
            options={playerOptions}
            onChange={onPlayerChange}
            emptyMessage="No players match"
            compact
          />
        </div>
      </div>
      {anyFilterActive && (
        <button
          type="button"
          onClick={onClearAll}
          aria-label="Clear all filters"
          className="font-mono uppercase tracking-[0.14em] px-2.5 py-1 rounded-full"
          style={{
            color: "var(--vault-text-mute)",
            background: "transparent",
            border: "1px solid var(--vault-rule)",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          Clear
        </button>
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
        background: "var(--gtp-card)",
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

function BuilderFootnote({
  optimizerActive,
  mode,
}: {
  optimizerActive: boolean;
  mode: ParlayLabMode;
}) {
  // Footnote describes the official suggested-slip scoring math — only
  // relevant when the user is looking at the official lanes.
  if (mode !== "suggested") return null;
  return (
    <aside
      className="rounded-[8px] p-4"
      style={{
        background: "var(--gtp-card)",
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
