"use client";
/**
 * SuggestedParlayCarousel — the parlay-first homepage rail.
 *
 * One horizontally-scrollable rail of `ParlayTicketCard`s filtered by
 * a sport tab (All / NBA / MLB / Mixed). Mobile-first: native
 * scroll-snap touch swiping; desktop adds prev/next chevrons over the
 * scroll container.
 *
 * Honesty contract:
 *   - We never invent a slip. When the active tab has zero slips, we
 *     render an inline empty-state card explaining why (e.g. "no NBA
 *     slips tonight").
 *   - When the data source is a fallback (older snapshot), the rail
 *     surfaces a dated context badge so the reader sees the truth.
 *   - Aggressive slips are always labeled "High Variance" — the
 *     lifetime record (4.5% hit rate, see model_audit) makes the
 *     softer label dishonest.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import ParlayTicketCard from "./parlay-ticket-card";
import PlayerRecentFormDrawer from "./player-recent-form-drawer";
import SearchableSelect, {
  type SearchableOption,
} from "./searchable-select";
import {
  diversifiedAllOrder,
  filterSlipsBySportTeamPlayer,
  getAvailablePlayersForTeam,
  getAvailableTeamsFromSlips,
  groupSuggestedBySport,
  slipContainsSport,
  type ParlayRiskProfile,
  type ParlaySlip,
  type SuggestedSport,
} from "@/lib/parlay-suggested";
import type { CalibrationTable } from "@/lib/confidence-calibration-rules";

interface Props {
  /** Pre-sorted slips that will be re-grouped by sport client-side. */
  slips: ParlaySlip[];
  /** Whichever date the slips came from. Shown in the eyebrow. */
  date: string;
  /** "snapshot" (pregame, saved) or "graded" (post-game, real results). */
  source: "snapshot" | "graded";
  /** True when we walked back to an older date because the requested
   *  one had nothing. UI uses this to surface a "showing latest" pill. */
  isFallback?: boolean;
  /** Calibration table for the ticket cards. Defaults to the empty
   *  table when omitted. */
  calibrationTable?: CalibrationTable;
  /** "optimizer" when the slips came from the new optimizer snapshot;
   *  "snapshot" when they came from the legacy snapshot. Drives the
   *  eyebrow copy so a reader knows which path produced the slip. */
  sourceLabel?: "optimizer" | "snapshot";
}

const SPORT_TABS: Array<{
  key: SuggestedSport;
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "nba", label: "NBA" },
  { key: "mlb", label: "MLB" },
  { key: "multi", label: "Mixed" },
];

export default function SuggestedParlayCarousel({
  slips,
  date,
  source,
  isFallback,
  calibrationTable,
  sourceLabel = "snapshot",
}: Props) {
  const buckets = useMemo(() => groupSuggestedBySport(slips), [slips]);
  const [activeTab, setActiveTab] = useState<SuggestedSport>("all");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [playerFilter, setPlayerFilter] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (buckets.all.length === 0) return;
    if (buckets[activeTab].length === 0) {
      for (const t of ["nba", "mlb", "multi", "all"] as SuggestedSport[]) {
        if (buckets[t].length > 0) {
          setActiveTab(t);
          return;
        }
      }
    }
    scrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Team + player filters reset when the user switches sport.
  useEffect(() => {
    setTeamFilter(null);
    setPlayerFilter(null);
  }, [activeTab]);

  // Drop player when the team changes.
  useEffect(() => {
    setPlayerFilter(null);
  }, [teamFilter]);

  const teamOptions = useMemo<SearchableOption[]>(() => {
    const teams = getAvailableTeamsFromSlips(slips, activeTab);
    return [
      { value: null, label: "All teams" },
      ...teams.map((t) => ({
        value: t.team,
        label: t.team,
        sub: t.sport.toUpperCase(),
        searchText: t.team,
      })),
    ];
  }, [slips, activeTab]);

  const playerOptions = useMemo<SearchableOption[]>(() => {
    const players = getAvailablePlayersForTeam(slips, activeTab, teamFilter);
    return [
      { value: null, label: "All players" },
      ...players.map((p) => ({
        value: p.name,
        label: p.name,
        sub: p.team ? `${p.team} · ${p.sport.toUpperCase()}` : p.sport.toUpperCase(),
        searchText: `${p.name} ${p.team ?? ""}`,
      })),
    ];
  }, [slips, activeTab, teamFilter]);

  const slipsForTab = useMemo(() => {
    const base = activeTab === "all"
      ? diversifiedAllOrder(buckets.all)
      : buckets[activeTab];
    if (!teamFilter && !playerFilter) return base;
    return filterSlipsBySportTeamPlayer(base, {
      sport: activeTab,
      team: teamFilter,
      playerNames: playerFilter ? [playerFilter] : [],
    });
  }, [buckets, activeTab, teamFilter, playerFilter]);

  const totalCount = buckets.all.length;
  const filterActive = teamFilter !== null || playerFilter !== null;
  const nbaLegSlipCount = useMemo(
    () => slips.filter((s) => slipContainsSport(s, "nba")).length,
    [slips],
  );

  return (
    <section
      className="reveal"
      aria-label="Suggested parlays for tonight"
    >
      <CarouselHeader
        date={date}
        source={source}
        isFallback={!!isFallback}
        totalCount={totalCount}
        sourceLabel={sourceLabel}
      />

      <SportTabs
        tabs={SPORT_TABS}
        active={activeTab}
        onChange={setActiveTab}
        countsByKey={{
          all: buckets.all.length,
          nba: buckets.nba.length,
          mlb: buckets.mlb.length,
          multi: buckets.multi.length,
        }}
      />

      {/* NBA-visibility note: when NBA legs exist but no NBA-only slip
          could be built (single NBA game on slate), tell the reader. */}
      {activeTab === "nba" && buckets.nba.length > 0 && (
        <p
          className="mt-2 text-[11px] leading-snug"
          style={{ color: "var(--vault-text-mute)" }}
        >
          NBA legs appear inside {buckets.nba.length} mixed slip
          {buckets.nba.length === 1 ? "" : "s"} below — pure NBA slips
          aren&apos;t possible with one NBA game today.
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SearchableSelect
          label="Team"
          placeholder="All teams"
          value={teamFilter}
          options={teamOptions}
          onChange={setTeamFilter}
          emptyMessage="No teams in this sport"
        />
        <SearchableSelect
          label="Player"
          placeholder="All players"
          value={playerFilter}
          options={playerOptions}
          onChange={setPlayerFilter}
          emptyMessage="No players match"
        />
      </div>

      <div
        ref={scrollRef}
        className="mt-4 flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory scroll-smooth"
        style={{
          scrollbarWidth: "thin",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {slipsForTab.length === 0 ? (
          <EmptyCarouselCard
            sport={activeTab}
            teamFilter={teamFilter}
            playerFilter={playerFilter}
            nbaLegSlipCount={nbaLegSlipCount}
          />
        ) : (
          slipsForTab.map((slip) => (
            <div
              key={slip.slipId}
              className="snap-start shrink-0 w-[88vw] sm:w-[420px] max-w-[420px]"
            >
              <RiskLabeledTicket
                slip={slip}
                source={source}
                calibrationTable={calibrationTable}
              />
            </div>
          ))
        )}
      </div>

      {filterActive && slipsForTab.length === 0 && (
        <p
          className="mt-2 text-[11px] leading-snug"
          style={{ color: "var(--vault-text-mute)" }}
        >
          No clean optimizer slip matched those filters. Try clearing the
          team or player.
        </p>
      )}

      <p
        className="mt-3 text-[11px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Suggested parlays. Built by the model from today&apos;s projections.
        No locks, no guarantees. High-variance slips are labeled.
      </p>
    </section>
  );
}

function CarouselHeader({
  date,
  source,
  isFallback,
  totalCount,
  sourceLabel,
}: {
  date: string;
  source: "snapshot" | "graded";
  isFallback: boolean;
  totalCount: number;
  sourceLabel: "optimizer" | "snapshot";
}) {
  const eyebrowAccent =
    source === "graded"
      ? "var(--vault-success)"
      : "var(--vault-gold-bright)";
  const baseEyebrow =
    sourceLabel === "optimizer"
      ? "Suggested parlays · optimizer"
      : source === "graded"
        ? "Suggested parlays · graded"
        : "Suggested parlays";
  const eyebrow = baseEyebrow;

  return (
    <div className="flex items-center gap-3 mb-2">
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
      <span
        className="font-mono uppercase tracking-[0.18em]"
        style={{ color: eyebrowAccent, fontSize: 10 }}
      >
        {eyebrow}
      </span>
      <span
        className="font-mono"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        {date}
        {isFallback ? " · latest available" : ""}
      </span>
      <span
        className="font-mono"
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
      >
        · {totalCount} slip{totalCount === 1 ? "" : "s"}
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: "var(--vault-rule)" }}
      />
    </div>
  );
}

function SportTabs({
  tabs,
  active,
  onChange,
  countsByKey,
}: {
  tabs: Array<{ key: SuggestedSport; label: string }>;
  active: SuggestedSport;
  onChange: (k: SuggestedSport) => void;
  countsByKey: Record<SuggestedSport, number>;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-full"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-border)",
      }}
      role="tablist"
      aria-label="Filter suggested parlays by sport"
    >
      {tabs.map((t) => {
        const isActive = active === t.key;
        const count = countsByKey[t.key];
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-full transition-colors"
            style={{
              color: isActive ? "var(--vault-bg)" : "var(--vault-text-mute)",
              background: isActive
                ? "var(--vault-gold-bright)"
                : "transparent",
              fontSize: 10,
              cursor: count === 0 && !isActive ? "not-allowed" : "pointer",
              opacity: count === 0 && !isActive ? 0.45 : 1,
            }}
          >
            {t.label}
            <span style={{ marginLeft: 6, opacity: 0.8 }}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function EmptyCarouselCard({
  sport,
  teamFilter,
  playerFilter,
  nbaLegSlipCount,
}: {
  sport: SuggestedSport;
  teamFilter?: string | null;
  playerFilter?: string | null;
  nbaLegSlipCount?: number;
}) {
  let label: string;
  let body: string;
  if (playerFilter || teamFilter) {
    const filterDesc = [
      playerFilter,
      teamFilter,
    ].filter(Boolean).join(" · ");
    label = `No clean slip for ${filterDesc}`;
    body =
      "No optimizer slip features that combination tonight. Try another team/player or clear the filter.";
  } else {
    if (sport === "nba") {
      label = "NBA projections live · no clean NBA-only parlay";
      body =
        nbaLegSlipCount && nbaLegSlipCount > 0
          ? `Today's slate has only one NBA game, so NBA-only parlays can't satisfy our correlation cap. NBA legs appear in ${nbaLegSlipCount} mixed slip${nbaLegSlipCount === 1 ? "" : "s"} on the All tab.`
          : "Projections are live but the slate doesn't satisfy any NBA-only profile (too few games for correlation-safe stacks). Check All.";
    } else if (sport === "mlb") {
      label = "MLB projections live · no clean parlay";
      body =
        "Projections are live but the slate doesn't satisfy any MLB-only profile cleanly. Check All or Mixed.";
    } else if (sport === "multi") {
      label = "No cross-sport slips tonight";
      body = "The model has nothing cross-sport at this filter.";
    } else {
      label = "No suggested parlays tonight";
      body = "The model has nothing to recommend. Never fabricated.";
    }
  }
  return (
    <div
      className="snap-start shrink-0 w-[88vw] sm:w-[420px] max-w-[420px] rounded-[6px] p-6 flex flex-col gap-2 justify-center items-center text-center"
      style={{
        border: "1px dashed var(--vault-border)",
        background: "rgba(7,11,26,0.4)",
        minHeight: 220,
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
      >
        {label}
      </span>
      <p
        className="text-[12px] leading-snug"
        style={{ color: "var(--vault-text-faint)", maxWidth: 320 }}
      >
        {body}
      </p>
    </div>
  );
}

/**
 * Wraps `ParlayTicketCard` with an honest variance label on aggressive
 * slips. The track record makes "aggressive" misleading on its own
 * (4.5% hit rate); "High variance" is what the data actually says.
 */
function RiskLabeledTicket({
  slip,
  source,
  calibrationTable,
}: {
  slip: ParlaySlip;
  source: "snapshot" | "graded";
  calibrationTable?: CalibrationTable;
}) {
  const isAggressive = slip.riskProfile === "aggressive";
  return (
    <div className="relative">
      {isAggressive && <HighVarianceBadge />}
      <ParlayTicketCard
        slip={slip}
        savedPregame={source === "snapshot"}
        calibrationTable={calibrationTable}
      />
    </div>
  );
}

function HighVarianceBadge() {
  return (
    <span
      className="absolute top-2 right-2 z-10 font-mono uppercase tracking-[0.14em] px-2 py-0.5 rounded-[3px]"
      style={{
        color: "var(--vault-warn)",
        border: "1px solid var(--vault-warn)",
        background: "rgba(7,11,26,0.85)",
        fontSize: 9,
      }}
      aria-label="High variance — historically 4.5% hit rate"
      title="Aggressive parlays have hit ~4.5% historically (see About)."
    >
      High variance
    </span>
  );
}

// Local copy to avoid an additional import — keeps the bundle lean.
const _PROFILE_DISPLAY: Record<ParlayRiskProfile, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "High variance",
  star_power: "Star Power",
};
export function profileDisplayLabel(p: ParlayRiskProfile): string {
  return _PROFILE_DISPLAY[p] ?? p;
}
