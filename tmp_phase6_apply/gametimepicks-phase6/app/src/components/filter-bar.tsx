"use client";

/**
 * FilterBar — client-side filters and sort for the Model Board.
 *
 * Owns its own state. Calls `onChange` with the current filter snapshot
 * whenever something changes; the parent page re-renders the lean list
 * accordingly.
 *
 * Filters:
 *   - market:      All / PTS / REB / AST
 *   - confidence:  All / High / Medium / Low
 *   - pickType:    All / Model Lean / No Play
 *   - minEdge:     0..10 slider (percentage points; absolute value)
 *   - team:        All / one of available teams
 *
 * Sort:
 *   - edge       (default; descending by abs value)
 *   - confidence (High → Low; ties broken by edge)
 *   - projGap    (|projection - line|, descending)
 *   - tipoff     (earliest first, alphabetical fallback)
 *
 * Uses minimal Tailwind, mobile-first. Buttons are pill segments.
 */
import { useMemo, useState, useEffect, type ChangeEvent } from "react";
import type { Market, ConfidenceTier } from "@/lib/types";

export type SortKey = "edge" | "confidence" | "projGap" | "tipoff";

export interface FilterState {
  market: "All" | Market;
  confidence: "All" | ConfidenceTier;
  pickType: "All" | "Model Lean" | "No Play";
  minEdge: number;        // absolute pp; 0 means show everything
  team: string;           // "All" or team abbr
  sort: SortKey;
}

export const DEFAULT_FILTERS: FilterState = {
  market: "All",
  confidence: "All",
  pickType: "All",
  minEdge: 0,
  team: "All",
  sort: "edge",
};

interface Props {
  /** All teams found on the board (for the team filter dropdown) */
  availableTeams: string[];
  /** Total number of leans before filtering — used for the count display */
  totalCount: number;
  /** Current filtered count — used for the count display */
  filteredCount: number;
  /** Called whenever filters change */
  onChange: (state: FilterState) => void;
}

export default function FilterBar({
  availableTeams,
  totalCount,
  filteredCount,
  onChange,
}: Props) {
  const [state, setState] = useState<FilterState>(DEFAULT_FILTERS);

  useEffect(() => {
    onChange(state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const dirty = useMemo(() => {
    return (
      state.market !== "All" ||
      state.confidence !== "All" ||
      state.pickType !== "All" ||
      state.minEdge > 0 ||
      state.team !== "All" ||
      state.sort !== "edge"
    );
  }, [state]);

  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="surface p-4 md:p-5 mb-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Segmented
          label="market"
          value={state.market}
          onChange={(v) => update("market", v as FilterState["market"])}
          options={["All", "PTS", "REB", "AST"]}
        />

        <Segmented
          label="confidence"
          value={state.confidence}
          onChange={(v) => update("confidence", v as FilterState["confidence"])}
          options={["All", "High", "Medium", "Low"]}
        />

        <Segmented
          label="type"
          value={state.pickType}
          onChange={(v) => update("pickType", v as FilterState["pickType"])}
          options={["All", "Model Lean", "No Play"]}
        />

        {availableTeams.length > 0 && (
          <Dropdown
            label="team"
            value={state.team}
            onChange={(v) => update("team", v)}
            options={["All", ...availableTeams]}
          />
        )}

        <Slider
          label="min edge"
          value={state.minEdge}
          onChange={(v) => update("minEdge", v)}
        />

        <Dropdown
          label="sort"
          value={state.sort}
          onChange={(v) => update("sort", v as SortKey)}
          options={["edge", "confidence", "projGap", "tipoff"]}
          renderLabel={(v) =>
            ({
              edge: "Edge",
              confidence: "Confidence",
              projGap: "Projection Gap",
              tipoff: "Tipoff",
            }[v as SortKey] || v)
          }
        />
      </div>

      <div className="mt-4 pt-3 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
          showing {filteredCount} of {totalCount}{" "}
          {totalCount === 1 ? "prop" : "props"}
        </span>
        {dirty && (
          <button
            onClick={() => setState(DEFAULT_FILTERS)}
            className="font-mono text-[11px] uppercase tracking-wider text-[var(--lime)] hover:opacity-80 transition-opacity"
          >
            clear filters ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={`px-2.5 py-1 rounded-[2px] font-mono text-[11px] tracking-wider uppercase transition-colors ${
                active
                  ? "bg-[var(--lime)] text-[var(--bg)]"
                  : "bg-[var(--surface-elevated)] text-[var(--text-mute)] hover:text-[var(--text)] border border-[var(--border)]"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Dropdown({
  label,
  value,
  onChange,
  options,
  renderLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  renderLabel?: (v: string) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-[2px] px-2.5 py-1 font-mono text-[11px] tracking-wider uppercase text-[var(--text)] hover:border-[var(--border-strong)] focus:outline-none focus:border-[var(--lime)] transition-colors min-w-[100px]"
      >
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-[var(--surface)]">
            {renderLabel ? renderLabel(opt) : opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-[160px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
          {label}
        </span>
        <span className="font-mono text-[11px] text-[var(--lime)] tabular">
          {value === 0 ? "any" : `${value.toFixed(1)}pp+`}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={0.5}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--lime)] cursor-pointer"
      />
    </div>
  );
}
