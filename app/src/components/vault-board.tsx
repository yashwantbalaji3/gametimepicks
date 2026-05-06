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
  buildLeanRenderKey,
  gameKeyForLean,
  DEFAULT_FILTERS,
  type FilterState,
} from "@/lib/filter";
import { enrichLeansWithGames } from "@/lib/lean-enrich";
import VaultFilters from "./vault-filters";
import VaultPropCard from "./vault-prop-card";

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
        dirty={dirty}
        activeChips={activeChips}
      />

      {visibleLeans.length === 0 ? (
        <VaultEmptyState dirty={dirty} onResetAll={onResetAll} />
      ) : (
        <>
          <SectionHeading
            count={visibleLeans.length}
            total={enrichedLeans.length}
          />
          <div
            key={filterSig}
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
            }}
          >
            {visibleLeans.map((lean, i) => {
              // Render-time invariant — drops + warns on any leak.
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
                />
              );
            })}
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
// Section heading above the card grid — quiet, gold rule + label
// ---------------------------------------------------------------------------
function SectionHeading({ count, total }: { count: number; total: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
        style={{ color: "var(--vault-gold)" }}
      >
        model board
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: "var(--vault-rule)" }}
      />
      <span
        className="font-mono text-[10px] uppercase tracking-wider shrink-0"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {count} {count === 1 ? "prop" : "props"}
        {count !== total && (
          <>
            {" "}
            <span style={{ color: "var(--vault-text-faint)", opacity: 0.6 }}>
              of {total}
            </span>
          </>
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
