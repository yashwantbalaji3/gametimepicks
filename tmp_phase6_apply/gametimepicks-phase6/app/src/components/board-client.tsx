"use client";

/**
 * BoardClient — interactive board page body.
 *
 * Receives all the leans + schedule from the server page (which reads JSON
 * via fs). This component only handles:
 *   - Filter state (via FilterBar)
 *   - Sorting (via FilterBar's `sort` field)
 *   - Rendering the filtered/sorted list of PropCards
 *   - Empty state when filters exclude everything
 *
 * Pure client interactivity. No data fetching.
 */
import { useMemo, useState } from "react";
import type { PropLean } from "@/lib/types";
import PropCard from "./prop-card";
import FilterBar, {
  DEFAULT_FILTERS,
  type FilterState,
  type SortKey,
} from "./filter-bar";

interface Props {
  leans: PropLean[];
}

export default function BoardClient({ leans }: Props) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const teams = useMemo(() => {
    const set = new Set<string>();
    leans.forEach((l) => {
      if (l.team) set.add(l.team);
      if (l.opponent) set.add(l.opponent);
    });
    return Array.from(set).sort();
  }, [leans]);

  const filtered = useMemo(() => {
    return leans
      .filter((l) => {
        if (filters.market !== "All" && l.market !== filters.market) return false;
        if (filters.confidence !== "All" && l.confidence !== filters.confidence)
          return false;
        if (filters.pickType === "Model Lean" && l.lean === "No Play") return false;
        if (filters.pickType === "No Play" && l.lean !== "No Play") return false;
        if (filters.minEdge > 0 && Math.abs(l.edgePct) < filters.minEdge) return false;
        if (
          filters.team !== "All" &&
          l.team !== filters.team &&
          l.opponent !== filters.team
        )
          return false;
        return true;
      })
      .sort((a, b) => sortFn(filters.sort)(a, b));
  }, [leans, filters]);

  return (
    <>
      <FilterBar
        availableTeams={teams}
        totalCount={leans.length}
        filteredCount={filtered.length}
        onChange={setFilters}
      />

      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((lean, i) => (
            <PropCard key={lean.id} lean={lean} delay={(i % 6) + 1} />
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sort functions
// ---------------------------------------------------------------------------
function sortFn(key: SortKey): (a: PropLean, b: PropLean) => number {
  switch (key) {
    case "edge":
      return (a, b) => Math.abs(b.edgePct) - Math.abs(a.edgePct);
    case "confidence":
      return (a, b) => {
        const order = { High: 0, Medium: 1, Low: 2 } as const;
        const d = order[a.confidence] - order[b.confidence];
        if (d !== 0) return d;
        return Math.abs(b.edgePct) - Math.abs(a.edgePct);
      };
    case "projGap":
      return (a, b) =>
        Math.abs(b.projection - b.line) - Math.abs(a.projection - a.line);
    case "tipoff":
      return (a, b) => {
        // Convert "7:30 PM ET" to minutes-since-midnight for comparison
        const tToMin = (t: string) => {
          const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
          if (!m) return 9999;
          let hh = parseInt(m[1], 10);
          const mm = parseInt(m[2], 10);
          if (m[3].toUpperCase() === "PM" && hh !== 12) hh += 12;
          if (m[3].toUpperCase() === "AM" && hh === 12) hh = 0;
          return hh * 60 + mm;
        };
        return tToMin(a.tipoff) - tToMin(b.tipoff);
      };
  }
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <div className="surface px-6 py-16 text-center">
      <div className="font-mono text-[11px] tracking-wider uppercase text-[var(--text-faint)] mb-3">
        no props match
      </div>
      <h3 className="font-display text-[20px] font-semibold tracking-tight mb-2">
        Nothing to see here.
      </h3>
      <p className="text-[14px] text-[var(--text-mute)] max-w-sm mx-auto leading-relaxed">
        Try widening the market filter, lowering the edge threshold, or
        clearing all filters.
      </p>
    </div>
  );
}
