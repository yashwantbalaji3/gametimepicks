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
  getAvailablePlayersForTeam,
  getAvailableSportsFromSlips,
  getAvailableTeamsFromSlips,
  selectDiverseForDisplay,
  type ParlayRiskProfile,
  type ParlaySlip,
  type SuggestedSport,
} from "@/lib/parlay-suggested";
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
import type { RiskSectionKey } from "@/lib/parlay-risk-sections";
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
  const filterActive = team !== null || player !== null || sport !== "all";

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
    if (team == null && player == null) return sportSections;
    const out: Partial<Record<RiskSectionKey, ParlaySlip[]>> = {};
    for (const [k, arr] of Object.entries(sportSections) as Array<
      [RiskSectionKey, ParlaySlip[]]
    >) {
      out[k] = filterSlipsBySportTeamPlayer(arr, {
        sport,
        team,
        playerNames: player ? [player] : [],
      });
    }
    return out;
  }, [sportSections, sport, team, player]);

  return (
    <section className="flex flex-col gap-5" aria-label="Parlay Lab builder">
      <BuilderHeader
        mode={mode}
        date={date}
        source={source}
        isFallback={!!isFallback}
        optimizerActive={optimizerActive}
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
          player={player}
          playerOptions={playerSelectOptions}
          onPlayerChange={changePlayer}
          onClearAll={() => {
            setSport(sportOptions[0]?.key ?? "all");
            setTeam(null);
            setPlayer(null);
          }}
        />
      )}

      {mode === "suggested" && (
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
        />
      )}

      {mode === "build" && (
        <BuildYourOwnMode optimizerPayload={optimizerPayload ?? null} />
      )}

      {mode === "bankroll" && (
        <BankrollMode slips={bankrollPoolSlips} />
      )}

      <BuilderFootnote optimizerActive={optimizerActive} mode={mode} />
      <PlayerRecentFormDrawer leg={activeLeg} onClose={() => setActiveLeg(null)} />
    </section>
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
}: {
  mode: ParlayLabMode;
  date: string;
  source: "snapshot" | "graded";
  isFallback: boolean;
  optimizerActive: boolean;
}) {
  void source; void isFallback; void date;
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
  return (
    <header className="flex flex-col gap-2">
      <h1
        className="font-display tracking-tight"
        style={{
          color: "var(--vault-text)",
          fontSize: "clamp(26px, 5vw, 40px)",
          lineHeight: 1.05,
          letterSpacing: "-0.015em",
          fontWeight: 600,
        }}
      >
        {title}
      </h1>
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
  onClearAll,
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
  onClearAll: () => void;
}) {
  const defaultSport = sportOptions[0]?.key ?? "all";
  const anyFilterActive = team !== null || player !== null || sport !== defaultSport;
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
      <div className="flex flex-1 min-w-[180px] gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
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
        <div className="flex-1 min-w-0">
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
