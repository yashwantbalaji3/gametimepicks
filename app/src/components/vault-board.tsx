"use client";

/**
 * VaultBoard — Phase 7B-7.
 *
 * Single self-contained client component that owns ALL filter state for
 * the active date. State architecture from 7B-6.2 is preserved verbatim:
 *   - useState<FilterState>
 *   - computeVisibleLeans() for the single derived render array
 *   - buildLeanRenderKey() for unique React keys
 *   - shouldRenderLean() defensive render-time invariant
 *
 * Phase 7B-7 changes are visual only:
 *   - REMOVED the duplicate VaultStatusStrip hero (the page-level hero
 *     in /board/page.tsx already shows date + source badges; rendering
 *     a second hero made the page feel "stacked box after box")
 *   - The unified VaultFilters control panel handles game selection,
 *     filtering, count, and active chips — replacing three separate
 *     stacked boxes.
 *   - Empty states refined for cleaner reading
 */
import { useMemo, useState } from "react";
import type {
  BoardData,
  ScheduleGame,
  PropLean,
  ConfidenceTier,
} from "@/lib/types";
import {
  isDirty,
  activeFilterEntries,
  computeVisibleLeans,
  gameKeyForLean,
  DEFAULT_FILTERS,
  type FilterState,
} from "@/lib/filter";
import { enrichLeansWithGames } from "@/lib/lean-enrich";
import { groupLeansIntoPlayerCards } from "@/lib/grouping";
import VaultFilters from "./vault-filters";
import VaultPlayerCard from "./vault-player-card";
import FeaturedHeadliners from "./featured-headliners";

interface Props {
  board: BoardData;
}

export default function VaultBoard({ board }: Props) {
  const games: ScheduleGame[] = board.games ?? [];
  const rawLeans: PropLean[] = board.leans ?? [];

  // ───────────────────────────────────────────────────────────────────
  // SINGLE source of truth for filter state.
  // ───────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // Derivations the control panel needs for its dropdowns.
  const enrichedLeans = useMemo(
    () => enrichLeansWithGames(rawLeans, games),
    [rawLeans, games],
  );

  const propCounts = useMemo(() => {
    const counts: Record<string, number> = { All: enrichedLeans.length };
    for (const l of enrichedLeans) {
      const k = gameKeyForLean(l, games);
      if (k) counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }, [enrichedLeans, games]);

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const l of enrichedLeans) {
      if (l.team) set.add(l.team);
      if (l.opponent) set.add(l.opponent);
    }
    return Array.from(set).sort();
  }, [enrichedLeans]);

  const presentConfidences = useMemo<ConfidenceTier[]>(() => {
    const set = new Set<ConfidenceTier>();
    for (const l of enrichedLeans) set.add(l.confidence);
    return Array.from(set);
  }, [enrichedLeans]);

  // THE single derived array. Phase 7B-6.2: no dedupe; preserves all rows.
  const visibleLeans = useMemo(
    () => computeVisibleLeans(rawLeans, games, filters),
    [rawLeans, games, filters],
  );

  // Phase 7C — group into player cards. Render-time invariant runs first
  // (drops + warns on any leak) so a leaked lean can never form a card.
  //
  // PR — after grouping, apply a "Featured" ordering by default so the
  // grid surfaces star players + high-volume / High-confidence cards
  // before generic role-player anomalies. The lib-level grouping orders
  // by maxAbsEdge desc; this UI-level resort overrides that for the
  // default view. When the user actively narrows filters (dirty=true),
  // we respect their intent and keep the edge-desc ordering so a search
  // for "top edges" still works.
  const playerCards = useMemo(() => {
    const safe = visibleLeans.filter((lean) => {
      if (!shouldRenderLean(lean, filters, games)) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn(
            `[VaultBoard] lean ${lean.id} (market=${lean.market}, team=${lean.team}/${lean.opponent}) leaked past applyFilters — filters=`,
            filters,
          );
        }
        return false;
      }
      return true;
    });
    const cards = groupLeansIntoPlayerCards(safe);
    if (isDirty(filters)) return cards;
    return cards.slice().sort(compareFeatured);
  }, [visibleLeans, filters, games]);

  // Filter signature for the grid container key — forces fresh React
  // reconciliation on every filter change.
  const filterSig = useMemo(() => {
    return [
      filters.gameKey,
      filters.market,
      filters.team,
      filters.confidence,
      filters.pickType,
      filters.minEdge,
      filters.sort,
    ].join("|");
  }, [filters]);

  // Handlers — all funnel through one setter on the single state.
  const onFiltersChange = (next: FilterState) => setFilters(next);
  const onResetOne = (key: keyof FilterState) =>
    setFilters((f) => ({ ...f, [key]: DEFAULT_FILTERS[key] }));
  const onResetAll = () => setFilters(DEFAULT_FILTERS);

  const dirty = isDirty(filters);
  const activeChips = activeFilterEntries(filters);

  return (
    <div className="vault-board">
      <VaultFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        onResetOne={onResetOne}
        onResetAll={onResetAll}
        games={games}
        propCounts={propCounts}
        availableTeams={teams}
        presentConfidences={presentConfidences}
        totalCount={enrichedLeans.length}
        filteredCount={visibleLeans.length}
        playerCount={playerCards.length}
        dirty={dirty}
        activeChips={activeChips}
      />

      {visibleLeans.length === 0 ? (
        <VaultEmptyState dirty={dirty} onResetAll={onResetAll} />
      ) : (
        <>
          {/* Iteration 4: Featured Headliners is now a compact rail of
              anchor-link tiles, not full duplicate cards. The full
              VaultPlayerCard still appears once in the main grid below;
              the rail tile jumps to the matching anchor (#card-XXX).
              Section hides while filters are dirty so it never blocks
              browsing. */}
          {!dirty &&
            (() => {
              const slateTeams = new Set<string>();
              for (const g of games) {
                if (g.homeTeamAbbr) slateTeams.add(g.homeTeamAbbr);
                if (g.awayTeamAbbr) slateTeams.add(g.awayTeamAbbr);
              }
              return (
                <FeaturedHeadliners
                  playerCards={playerCards}
                  slateTeams={slateTeams}
                />
              );
            })()}

          {!dirty && (
            <div className="mb-3 flex">
              <span
                className="gtp-featured-chip"
                title="Featured order applied to the default view"
              >
                <span className="gtp-featured-chip-eyebrow">Featured order</span>
                <span>
                  star priority · confidence · projection volume · capped edge
                </span>
              </span>
            </div>
          )}
          <SectionHeading
            playerCount={playerCards.length}
            propCount={visibleLeans.length}
            totalProps={enrichedLeans.length}
            allView={!dirty}
          />
          <div
            key={filterSig}
            className="grid gap-3"
            style={{
              gridTemplateColumns:
                "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
            }}
          >
            {playerCards.map((card) => (
              <VaultPlayerCard key={card.cardKey} card={card} />
            ))}
          </div>

          <ResponsibleUseFooter />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Render-time invariant — same logic as applyFilters; defensive duplicate.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Featured ordering — applied to the default (non-dirty) board view so the
// grid leads with star players, high-volume cards, and clean High-confidence
// signal instead of role-player anomalies. The Headliner Rail above the
// grid already pins compact star tiles; this sort makes their full cards
// the first thing the user sees in the grid below the rail.
//
// Score components (higher = ranks earlier):
//   • Star priority — curated list, top of the order
//   • Confidence weight — High > Medium > Low > insufficient_data/no_play
//   • Total projection volume — sum of primary-market projections; higher
//     volume players (more PTS / REB / AST) outrank one-trick lines
//   • Edge magnitude — small tiebreaker; capped so a 43% R5 anomaly never
//     leapfrogs a clean 12% High
// Anomalies (suspicious_edge) get a small deboost so they're visible but
// not dominant.
// ---------------------------------------------------------------------------
const FEATURED_STAR_PRIORITY: string[] = [
  "Anthony Edwards",
  "Victor Wembanyama",
  "Donovan Mitchell",
  "Cade Cunningham",
  "James Harden",
  "Evan Mobley",
  "Jarrett Allen",
  "Jalen Duren",
  "Julius Randle",
  "Rudy Gobert",
  "De'Aaron Fox",
  "Stephon Castle",
];

// Sprint 035: confidence weighting removed — the tier is a relabelled edge bucket and is inverted
// on settled results (High .4934 vs Low .5172, n=21,192). Kept as a neutral constant so the
// featured score keeps its shape while no tier outranks another.
const FEATURED_CONFIDENCE_WEIGHT: Record<string, number> = { High: 1, Medium: 1, Low: 1 };

function featuredScore(card: import("@/lib/grouping").PlayerCard): number {
  // Star boost — top of the curated list scores ~1200, last scores ~100.
  const starIdx = FEATURED_STAR_PRIORITY.indexOf(card.playerName);
  const starBoost =
    starIdx === -1 ? 0 : 100 * (FEATURED_STAR_PRIORITY.length - starIdx);

  // Aggregate per-market: confidence weight, projection volume, edge,
  // anomaly penalty. Walk all market rows.
  let confSum = 0;
  let projSum = 0;
  let edgeContribution = 0;
  let anomalyPenalty = 0;
  for (const m of ["PTS", "REB", "AST"] as const) {
    const row = card.rows[m];
    if (!row) continue;
    const lean = row.primary;
    confSum += FEATURED_CONFIDENCE_WEIGHT[lean.confidence] ?? 0;
    if (typeof lean.projection === "number" && Number.isFinite(lean.projection)) {
      projSum += lean.projection;
    }
    if (typeof lean.edgePct === "number" && Number.isFinite(lean.edgePct)) {
      // Cap edge contribution at 20% so extreme anomaly edges can't
      // dominate. A 40% anomaly contributes the same 20 as a clean 20%.
      edgeContribution += Math.min(20, Math.abs(lean.edgePct));
    }
    if ((lean.riskFlags ?? []).includes("suspicious_edge")) {
      anomalyPenalty += 15;
    }
  }

  return starBoost + confSum * 20 + projSum * 1.5 + edgeContribution - anomalyPenalty;
}

function compareFeatured(
  a: import("@/lib/grouping").PlayerCard,
  b: import("@/lib/grouping").PlayerCard,
): number {
  const sb = featuredScore(b);
  const sa = featuredScore(a);
  if (sb !== sa) return sb - sa;
  return a.playerName.localeCompare(b.playerName);
}

function shouldRenderLean(
  lean: PropLean,
  filters: FilterState,
  games: ScheduleGame[],
): boolean {
  if (filters.market !== "All" && lean.market !== filters.market) return false;
  if (
    filters.confidence !== "All" &&
    lean.confidence !== filters.confidence
  ) {
    return false;
  }
  const noPlay = lean.lean === "No Play" || lean.lean === "Pass";
  if (filters.pickType === "Model Lean" && noPlay) return false;
  if (filters.pickType === "No Play" && !noPlay) return false;
  if (filters.minEdge > 0) {
    if (typeof lean.edgePct !== "number" || !Number.isFinite(lean.edgePct)) {
      return false;
    }
    if (Math.abs(lean.edgePct) < filters.minEdge) return false;
  }
  if (
    filters.team !== "All" &&
    lean.team !== filters.team &&
    lean.opponent !== filters.team
  ) {
    return false;
  }
  if (filters.gameKey !== "All") {
    const k = gameKeyForLean(lean, games);
    if (k !== filters.gameKey) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Section heading above the card grid — quiet gold rule + "X players · Y props"
// ---------------------------------------------------------------------------
function SectionHeading({
  playerCount,
  propCount,
  totalProps,
  allView,
}: {
  playerCount: number;
  propCount: number;
  totalProps: number;
  /** When true, the headliner strip is visible above — use a clearer
   *  separator ("All projections") so the user knows they're past the
   *  star section. */
  allView?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
        style={{ color: "var(--vault-gold)" }}
      >
        {allView ? "All projections · model board" : "Model board"}
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: "var(--vault-rule)" }}
      />
      <span
        className="font-mono text-[10px] uppercase tracking-wider shrink-0"
        style={{ color: "var(--vault-text-faint)" }}
      >
        <span style={{ color: "var(--vault-text-mute)" }}>{playerCount}</span>{" "}
        {playerCount === 1 ? "player" : "players"}
        <span style={{ color: "var(--vault-text-faint)", opacity: 0.6 }}> · </span>
        <span style={{ color: "var(--vault-text-mute)" }}>{propCount}</span>{" "}
        {propCount === 1 ? "prop" : "props"}
        {propCount !== totalProps && (
          <span style={{ color: "var(--vault-text-faint)", opacity: 0.6 }}>
            {" "}of {totalProps}
          </span>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state — context-aware, intentional, less "panic box"
// ---------------------------------------------------------------------------
function VaultEmptyState({
  dirty,
  onResetAll,
}: {
  dirty: boolean;
  onResetAll: () => void;
}) {
  return (
    <div
      className="px-6 py-20 text-center rounded-[3px]"
      style={{
        border: "1px dashed var(--vault-border)",
        background: "transparent",
      }}
    >
      <div
        className="font-mono text-[10px] tracking-[0.18em] uppercase mb-4"
        style={{ color: "var(--vault-gold)" }}
      >
        {dirty ? "no matches" : "the vault is empty"}
      </div>
      <h3
        className="font-display text-[22px] font-semibold tracking-tight"
        style={{ color: "var(--vault-text)" }}
      >
        {dirty
          ? "Nothing matches these filters."
          : "No props on the board for this date."}
      </h3>
      <p
        className="mt-2 mx-auto max-w-md text-[14px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {dirty
          ? "Try a different game, widen the market filter, or reset everything."
          : "Try another date tab, or check back when the next slate generates."}
      </p>
      {dirty && (
        <button
          type="button"
          onClick={onResetAll}
          className="mt-5 font-mono text-[11px] uppercase tracking-wider px-4 py-2 rounded-[2px] transition-colors"
          style={{
            color: "var(--vault-gold-bright)",
            background: "var(--vault-gold-dim)",
            border: "1px solid var(--vault-border-strong)",
          }}
        >
          reset all filters
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiet footer — replaces the responsible-use line that used to live in
// the duplicate VaultStatusStrip hero.
// ---------------------------------------------------------------------------
function ResponsibleUseFooter() {
  return (
    <div
      className="mt-10 pt-5 text-center font-mono text-[10px] tracking-[0.18em] uppercase"
      style={{
        color: "var(--vault-text-faint)",
        borderTop: "1px solid var(--vault-rule)",
      }}
    >
      analytics · educational use only · not betting advice
    </div>
  );
}
