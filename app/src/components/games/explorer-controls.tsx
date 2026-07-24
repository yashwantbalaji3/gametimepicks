"use client";

/**
 * ExplorerControls (Sprint 013 · Phase 7) — the filter + sort chrome for the Simulation Explorer, and the
 * client boundary that re-orders the already-derived cards.
 *
 * It receives cards that were built ON THE SERVER from the canonical artifacts and only ever REORDERS or
 * NARROWS them via the pure selectors in lib/mlb/prediction/explorer-filters. It never simulates, predicts,
 * fetches, or invents a value — the worst any control can do is show fewer cards.
 */
import { useMemo, useState } from "react";
import SimulationCard, { type SimulationCardInput } from "@/components/entity/simulation-card";
import {
  applyExplorerView,
  FILTER_LABELS,
  SORT_LABELS,
  type ExplorerFilter,
  type ExplorerSort,
} from "@/lib/mlb/prediction/explorer-filters";

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="font-mono uppercase tracking-[0.08em] rounded-full px-2.5 py-1"
      style={{
        fontSize: 9,
        cursor: "pointer",
        color: active ? "var(--vault-gold)" : "var(--vault-text-mute)",
        background: active ? "rgba(217,164,65,0.12)" : "transparent",
        border: `1px solid ${active ? "rgba(217,164,65,0.45)" : "var(--vault-rule)"}`,
        minHeight: 32,
      }}
    >
      {children}
    </button>
  );
}

export default function ExplorerControls({ cards }: { cards: SimulationCardInput[] }) {
  const [filter, setFilter] = useState<ExplorerFilter>("all");
  const [sort, setSort] = useState<ExplorerSort>("first-pitch");
  const view = useMemo(() => applyExplorerView(cards, filter, sort), [cards, filter, sort]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter simulations">
          {FILTER_LABELS.map((f) => (
            <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</Chip>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Sort simulations">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Sort</span>
          {SORT_LABELS.map((s) => (
            <Chip key={s.key} active={sort === s.key} onClick={() => setSort(s.key)}>{s.label}</Chip>
          ))}
        </div>
      </div>

      <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        Showing {view.length} of {cards.length} simulated games
      </span>

      {view.length === 0 ? (
        <p className="text-[12px] m-0" style={{ color: "var(--vault-text-mute)" }}>
          No simulated game carries the value this filter needs. Nothing is estimated to fill the gap.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {view.map((c) => (
            <SimulationCard key={c.slug} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}
