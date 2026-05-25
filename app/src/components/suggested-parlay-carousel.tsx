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
import {
  filterSlipsBySportTeamPlayer,
  getAvailableTeamsFromSlips,
  groupSuggestedBySport,
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
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Default to the most populous tab so the rail never opens empty
  // when "All" has slips but a specific sport happens to be 0.
  useEffect(() => {
    if (buckets.all.length === 0) return;
    if (buckets[activeTab].length === 0) {
      // Find a non-empty tab — prefer NBA > MLB > Mixed > All.
      for (const t of ["nba", "mlb", "multi", "all"] as SuggestedSport[]) {
        if (buckets[t].length > 0) {
          setActiveTab(t);
          return;
        }
      }
    }
    // Reset scroll position when the active tab changes so the user
    // always starts at the first (best-ranked) card.
    scrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Team filter resets whenever the user switches sport.
  useEffect(() => {
    setTeamFilter(null);
  }, [activeTab]);

  const teamsForTab = useMemo(
    () => getAvailableTeamsFromSlips(slips, activeTab),
    [slips, activeTab],
  );

  const slipsForTab = useMemo(() => {
    const base = buckets[activeTab];
    if (!teamFilter) return base;
    return filterSlipsBySportTeamPlayer(base, {
      sport: activeTab,
      team: teamFilter,
    });
  }, [buckets, activeTab, teamFilter]);

  const totalCount = buckets.all.length;

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

      {teamsForTab.length > 1 && (
        <TeamChipRow
          teams={teamsForTab.map((t) => t.team)}
          activeTeam={teamFilter}
          onChange={setTeamFilter}
        />
      )}

      <div
        ref={scrollRef}
        className="mt-4 flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory scroll-smooth"
        style={{
          scrollbarWidth: "thin",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {slipsForTab.length === 0 ? (
          <EmptyCarouselCard sport={activeTab} teamFilter={teamFilter} />
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

function TeamChipRow({
  teams,
  activeTeam,
  onChange,
}: {
  teams: string[];
  activeTeam: string | null;
  onChange: (t: string | null) => void;
}) {
  return (
    <div
      className="mt-3 flex flex-wrap gap-1.5 items-center"
      aria-label="Filter by team"
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        Team
      </span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
        style={{
          color:
            activeTeam === null ? "var(--vault-bg)" : "var(--vault-text-mute)",
          background:
            activeTeam === null ? "var(--vault-gold-bright)" : "transparent",
          border: "1px solid var(--vault-rule)",
          fontSize: 9,
          cursor: "pointer",
        }}
        aria-pressed={activeTeam === null}
      >
        Any
      </button>
      {teams.map((t) => {
        const active = activeTeam === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(active ? null : t)}
            className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
            style={{
              color: active ? "var(--vault-bg)" : "var(--vault-text-mute)",
              background: active ? "var(--vault-gold-bright)" : "transparent",
              border: "1px solid var(--vault-rule)",
              fontSize: 9,
              cursor: "pointer",
            }}
            aria-pressed={active}
          >
            {t}
          </button>
        );
      })}
    </div>
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
}: {
  sport: SuggestedSport;
  teamFilter?: string | null;
}) {
  let label: string;
  let body: string;
  if (teamFilter) {
    label = `No clean ${sport === "all" ? "" : sport.toUpperCase() + " "}slip for ${teamFilter}`;
    body =
      "No optimizer slip features this team tonight. Try a different team or clear the filter.";
  } else {
    label =
      sport === "nba"
        ? "NBA projections live · no clean parlay yet"
        : sport === "mlb"
          ? "MLB projections live · no clean parlay yet"
          : sport === "multi"
            ? "No cross-sport slips tonight"
            : "No suggested parlays tonight";
    body =
      sport === "nba" || sport === "mlb"
        ? "Projections for this sport are live, but the slate doesn't satisfy any profile cleanly (e.g. too few games for correlation-safe stacks). Check the All or Mixed tabs."
        : "The model has nothing to recommend at this filter. The rail stays empty — never fabricated.";
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
};
export function profileDisplayLabel(p: ParlayRiskProfile): string {
  return _PROFILE_DISPLAY[p] ?? p;
}
