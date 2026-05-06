"use client";

/**
 * VaultBoard — Phase 7B-6.1 surgical render-path fix.
 *
 * The Phase 7B-6 logic was correct (filtered.length and filtered.map used
 * the same array reference) but a stale browser build, a future React
 * reconciliation quirk on duplicate keys, or any other path-of-truth
 * issue could in theory cause the count and the rendered cards to
 * disagree. This file makes that impossible by:
 *
 *   1. Computing exactly ONE final array — `visibleLeans` — and using it
 *      for BOTH the count and the card grid.
 *   2. Defensively re-checking each lean against the active filters at
 *      render time, returning null for any lean that should not be
 *      visible. (In dev mode this also console.warns, so any leakage is
 *      surfaced immediately.)
 *   3. De-duplicating by lean.id before rendering, so a duplicate-key
 *      reconciliation bug cannot drop or stale-render a card.
 *   4. Putting `key={filterSig}` on the grid container so the entire
 *      card grid is reconciled fresh on every filter change. This rules
 *      out any DOM-state stickiness from the previous render.
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
  buildLeanRenderKey,
  gameKeyForLean,
  DEFAULT_FILTERS,
  type FilterState,
} from "@/lib/filter";
import { enrichLeansWithGames } from "@/lib/lean-enrich";
import VaultFilters from "./vault-filters";
import VaultPropCard from "./vault-prop-card";
import VaultStatusStrip from "./vault-status-strip";

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

  // 1. Enrich leans (derive missing team/opponent from gameId).
  const enrichedLeans = useMemo(
    () => enrichLeansWithGames(rawLeans, games),
    [rawLeans, games],
  );

  // 2. Per-game prop counts for the game-selector cards.
  const propCounts = useMemo(() => {
    const counts: Record<string, number> = { All: enrichedLeans.length };
    for (const l of enrichedLeans) {
      const k = gameKeyForLean(l, games);
      if (k) counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }, [enrichedLeans, games]);

  // 3. Available teams (post-enrichment).
  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const l of enrichedLeans) {
      if (l.team) set.add(l.team);
      if (l.opponent) set.add(l.opponent);
    }
    return Array.from(set).sort();
  }, [enrichedLeans]);

  // 4. Confidence tiers actually present.
  const presentConfidences = useMemo<ConfidenceTier[]>(() => {
    const set = new Set<ConfidenceTier>();
    for (const l of enrichedLeans) set.add(l.confidence);
    return Array.from(set);
  }, [enrichedLeans]);

  // ───────────────────────────────────────────────────────────────────
  // 5. THE single final array. Phase 7B-6.1: this is `visibleLeans` —
  //    the only array used for BOTH count display and card rendering.
  //    Computed via the exported `computeVisibleLeans()` function so
  //    the Python filter test mirrors EXACTLY this code path, not a
  //    parallel-but-not-quite-identical reimplementation. Includes
  //    enrichment + filter + sort + duplicate-id dedupe.
  // ───────────────────────────────────────────────────────────────────
  const visibleLeans = useMemo(
    () => computeVisibleLeans(rawLeans, games, filters),
    [rawLeans, games, filters],
  );

  // 6. Filter signature — used to key the card grid so React mounts
  //    fresh DOM nodes on filter change. Belt-and-suspenders against
  //    any reconciliation oddity.
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

  // ───────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────
  const onFiltersChange = (next: FilterState) => setFilters(next);
  const onResetOne = (key: keyof FilterState) =>
    setFilters((f) => ({ ...f, [key]: DEFAULT_FILTERS[key] }));
  const onResetAll = () => setFilters(DEFAULT_FILTERS);

  const dirty = isDirty(filters);
  const activeChips = activeFilterEntries(filters);

  return (
    <div className="vault-board">
      <VaultStatusStrip board={board} totalProps={enrichedLeans.length} />

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
        dirty={dirty}
        activeChips={activeChips}
      />

      {visibleLeans.length === 0 ? (
        <VaultEmptyState dirty={dirty} onResetAll={onResetAll} />
      ) : (
        <div
          key={filterSig}
          className="grid gap-3"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
          }}
        >
          {visibleLeans.map((lean, i) => {
            // Render-time invariant — drops any lean that does NOT
            // satisfy the currently-active filters. Even though
            // applyFilters above should have already filtered these out,
            // this is the user's explicit safety net (Phase 7B-6.1
            // requirement #5): if filters.market === "REB", every
            // rendered card MUST have market === "REB".
            if (!shouldRenderLean(lean, filters, games)) {
              if (process.env.NODE_ENV !== "production") {
                // eslint-disable-next-line no-console
                console.warn(
                  `[VaultBoard] lean ${lean.id} (market=${lean.market}, team=${lean.team}/${lean.opponent}) leaked past applyFilters — filters=`,
                  filters,
                );
              }
              return null;
            }
            return (
              <VaultPropCard
                key={buildLeanRenderKey(lean, i)}
                lean={lean}
                delay={(i % 6) + 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Render-time invariant — defensive duplicate of applyFilters' checks.
// If a lean somehow leaks past the upstream filter, this catches it at the
// last possible moment.
// ---------------------------------------------------------------------------
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
// Empty state — context-aware
// ---------------------------------------------------------------------------
function VaultEmptyState({
  dirty,
  onResetAll,
}: {
  dirty: boolean;
  onResetAll: () => void;
}) {
  if (dirty) {
    return (
      <div
        className="px-6 py-16 text-center rounded-[3px]"
        style={{
          background: "var(--vault-panel)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div
          className="font-mono text-[11px] tracking-wider uppercase mb-3"
          style={{ color: "var(--vault-text-faint)" }}
        >
          no props match these filters
        </div>
        <h3
          className="font-display text-[20px] font-semibold tracking-tight mb-2"
          style={{ color: "var(--vault-text)" }}
        >
          Nothing in the vault for that combination.
        </h3>
        <p
          className="text-[14px] max-w-sm mx-auto leading-relaxed mb-4"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Try a different game, widen the market, lower the edge threshold,
          or reset everything.
        </p>
        <button
          type="button"
          onClick={onResetAll}
          className="font-mono text-[11px] uppercase tracking-wider px-4 py-2 rounded-[2px] transition-colors"
          style={{
            color: "var(--vault-gold-bright)",
            background: "var(--vault-gold-dim)",
            border: "1px solid var(--vault-border-strong)",
          }}
        >
          reset all filters
        </button>
      </div>
    );
  }
  return (
    <div
      className="px-6 py-16 text-center rounded-[3px]"
      style={{
        background: "var(--vault-panel)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div
        className="font-mono text-[11px] tracking-wider uppercase mb-3"
        style={{ color: "var(--vault-text-faint)" }}
      >
        no props for this date
      </div>
      <h3
        className="font-display text-[20px] font-semibold tracking-tight mb-2"
        style={{ color: "var(--vault-text)" }}
      >
        The vault is empty for this date.
      </h3>
      <p
        className="text-[14px] max-w-sm mx-auto leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        Try another date tab, or check back when the next slate generates.
      </p>
    </div>
  );
}
