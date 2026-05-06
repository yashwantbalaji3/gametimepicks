"use client";

/**
 * VaultFilters — Phase 7B-7 unified control panel.
 *
 * Replaces the three separate stacked boxes (GameSelector grid +
 * FilterBar panel + ActiveChips bar) with ONE panel divided into three
 * vertical sections by subtle gold rule lines:
 *
 *   1. Game pills row — primary navigator
 *   2. Filter rows — market & type segmented + secondary controls
 *   3. Footer — count, active filter chips, reset all
 *
 * Pure controlled component — no internal state, no effects. Receives
 * filters + handlers and renders. Single update path through
 * onFiltersChange.
 */
import { useMemo, type ChangeEvent } from "react";
import type { ScheduleGame, ConfidenceTier, Market } from "@/lib/types";
import type {
  FilterState,
  SortKey,
  ActiveFilterEntry,
} from "@/lib/filter";

const CONFIDENCE_LABELS: Record<string, string> = {
  All: "All",
  High: "High",
  Medium: "Medium",
  Low: "Low",
  insufficient_data: "no data",
  no_play: "pass",
};

const SORT_LABELS: Record<SortKey, string> = {
  edge: "Edge",
  confidence: "Confidence",
  projGap: "Projection Gap",
  tipoff: "Tipoff",
};

interface Props {
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  onResetOne: (key: keyof FilterState) => void;
  onResetAll: () => void;
  games: ScheduleGame[];
  propCounts: Record<string, number>;
  availableTeams: string[];
  presentConfidences: ConfidenceTier[];
  totalCount: number;
  filteredCount: number;
  /** Phase 7C — number of player cards on screen after grouping. */
  playerCount: number;
  dirty: boolean;
  activeChips: ActiveFilterEntry[];
}

export default function VaultFilters({
  filters,
  onFiltersChange,
  onResetOne,
  onResetAll,
  games,
  propCounts,
  availableTeams,
  presentConfidences,
  totalCount,
  filteredCount,
  playerCount,
  dirty,
  activeChips,
}: Props) {
  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onFiltersChange({ ...filters, [key]: value });

  const confidenceOptions = useMemo<("All" | ConfidenceTier)[]>(() => {
    const opts: ("All" | ConfidenceTier)[] = ["All", "High", "Medium", "Low"];
    if (presentConfidences.includes("insufficient_data")) opts.push("insufficient_data");
    if (presentConfidences.includes("no_play")) opts.push("no_play");
    return opts;
  }, [presentConfidences]);

  return (
    <div
      className="rounded-[4px] mb-6 overflow-hidden"
      style={{
        background: "var(--vault-panel)",
        border: "1px solid var(--vault-border)",
        boxShadow: "var(--vault-shadow-soft)",
      }}
    >
      {/* ─── Section 1: Game pills (primary navigator) ─── */}
      {games.length > 0 && (
        <div className="px-4 sm:px-5 py-4">
          <SectionLabel>game</SectionLabel>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <GamePill
              isAll
              isSelected={filters.gameKey === "All"}
              onClick={() => update("gameKey", "All")}
              away="All games"
              home=""
              tipoff=""
              propCount={propCounts["All"] ?? 0}
            />
            {games.map((g) => {
              const k = `${g.awayTeamAbbr}@${g.homeTeamAbbr}`;
              return (
                <GamePill
                  key={k}
                  isSelected={filters.gameKey === k}
                  onClick={() => update("gameKey", k)}
                  away={g.awayTeamAbbr}
                  home={g.homeTeamAbbr}
                  tipoff={g.tipoff}
                  propCount={propCounts[k] ?? 0}
                />
              );
            })}
          </div>
        </div>
      )}

      <Rule />

      {/* ─── Section 2: Filter controls ─── */}
      <div className="px-4 sm:px-5 py-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <Segmented
            label="market"
            value={filters.market}
            options={["All", "PTS", "REB", "AST"]}
            onSelect={(v) => update("market", v as "All" | Market)}
          />

          <Segmented
            label="type"
            value={filters.pickType}
            options={["All", "Model Lean", "No Play"]}
            onSelect={(v) =>
              update("pickType", v as "All" | "Model Lean" | "No Play")
            }
          />

          <Dropdown
            label="confidence"
            value={filters.confidence}
            options={confidenceOptions}
            renderLabel={(v) => CONFIDENCE_LABELS[v] ?? v}
            onSelect={(v) => update("confidence", v as "All" | ConfidenceTier)}
          />

          {availableTeams.length > 0 && (
            <Dropdown
              label="team"
              value={filters.team}
              options={["All", ...availableTeams]}
              onSelect={(v) => update("team", v)}
            />
          )}

          <Dropdown
            label="sort"
            value={filters.sort}
            options={["edge", "confidence", "projGap", "tipoff"]}
            renderLabel={(v) => SORT_LABELS[v as SortKey] ?? v}
            onSelect={(v) => update("sort", v as SortKey)}
          />

          <Slider
            label="min edge"
            value={filters.minEdge}
            onChange={(v) => update("minEdge", v)}
          />
        </div>
      </div>

      <Rule />

      {/* ─── Section 3: Footer — count + active chips + reset all ─── */}
      <div className="px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap">
        <span
          className="font-mono text-[11px] uppercase tracking-wider shrink-0"
          style={{ color: "var(--vault-text-faint)" }}
        >
          <span
            className="tabular text-[13px] font-semibold"
            style={{ color: "var(--vault-gold-bright)" }}
          >
            {playerCount}
          </span>{" "}
          {playerCount === 1 ? "player" : "players"}
          <span style={{ color: "var(--vault-text-faint)", opacity: 0.5 }}>
            {" · "}
          </span>
          <span
            className="tabular text-[13px] font-semibold"
            style={{ color: "var(--vault-gold-bright)" }}
          >
            {filteredCount}
          </span>{" "}
          {filteredCount === 1 ? "prop" : "props"}
          {filteredCount !== totalCount && (
            <>
              {" "}
              <span style={{ color: "var(--vault-text-faint)", opacity: 0.6 }}>
                of {totalCount}
              </span>
            </>
          )}
        </span>

        {dirty && (
          <>
            <div
              className="h-3 w-px"
              style={{ background: "var(--vault-rule)" }}
            />
            <div className="flex flex-wrap items-center gap-1.5 flex-1">
              {activeChips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onResetOne(c.key)}
                  aria-label={`Remove filter: ${c.label}`}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] font-mono text-[10px] tracking-wider uppercase transition-colors"
                  style={{
                    color: "var(--vault-gold-bright)",
                    background: "var(--vault-gold-dim)",
                    border: "1px solid var(--vault-border-strong)",
                  }}
                >
                  <span>{c.label}</span>
                  <span aria-hidden style={{ opacity: 0.7 }}>
                    ✕
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onResetAll}
              className="font-mono text-[10px] uppercase tracking-wider transition-colors shrink-0 hover:opacity-80"
              style={{ color: "var(--vault-gold)" }}
            >
              reset all
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionLabel — quiet gold section header inside the panel
// ---------------------------------------------------------------------------
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[0.18em]"
      style={{ color: "var(--vault-gold)" }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Rule — internal section divider
// ---------------------------------------------------------------------------
function Rule() {
  return <div className="h-px" style={{ background: "var(--vault-rule)" }} />;
}

// ---------------------------------------------------------------------------
// GamePill — primary game navigator chip
// ---------------------------------------------------------------------------
function GamePill({
  isAll = false,
  isSelected,
  onClick,
  away,
  home,
  tipoff,
  propCount,
}: {
  isAll?: boolean;
  isSelected: boolean;
  onClick: () => void;
  away: string;
  home: string;
  tipoff: string;
  propCount: number;
}) {
  const aria = isAll
    ? `All games: ${propCount} props`
    : `${away} at ${home}, ${propCount} props${tipoff ? ", tipoff " + tipoff : ""}`;

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={aria}
      onClick={onClick}
      className="px-3.5 py-2 rounded-[3px] transition-all duration-150 text-left focus:outline-none"
      style={{
        background: isSelected
          ? "var(--vault-gold-dim)"
          : "var(--vault-panel-elevated)",
        border: `1px solid ${
          isSelected ? "var(--vault-border-active)" : "var(--vault-border)"
        }`,
      }}
    >
      {isAll ? (
        <div className="flex items-baseline gap-2">
          <span
            className="font-display font-semibold text-[13px] tracking-tight"
            style={{
              color: isSelected
                ? "var(--vault-gold-bright)"
                : "var(--vault-text)",
            }}
          >
            All games
          </span>
          <span
            className="font-mono text-[10px] tabular"
            style={{ color: "var(--vault-text-faint)" }}
          >
            {propCount}
          </span>
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          <span
            className="font-display font-semibold text-[13px] tracking-tight tabular"
            style={{
              color: isSelected
                ? "var(--vault-gold-bright)"
                : "var(--vault-text)",
            }}
          >
            {away}
          </span>
          <span
            className="font-mono text-[10px]"
            style={{ color: "var(--vault-text-faint)" }}
          >
            @
          </span>
          <span
            className="font-display font-semibold text-[13px] tracking-tight tabular"
            style={{
              color: isSelected
                ? "var(--vault-gold-bright)"
                : "var(--vault-text)",
            }}
          >
            {home}
          </span>
          {tipoff && (
            <span
              className="font-mono text-[10px] tracking-wider"
              style={{ color: "var(--vault-text-faint)" }}
            >
              · {tipoff}
            </span>
          )}
          <span
            className="font-mono text-[10px] tabular ml-1"
            style={{ color: "var(--vault-text-faint)" }}
          >
            {propCount}
          </span>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Segmented — chip-style toggle row
// ---------------------------------------------------------------------------
function Segmented({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(opt)}
              className="px-2.5 py-1 rounded-[2px] font-mono text-[11px] tracking-wider uppercase transition-colors focus:outline-none"
              style={{
                color: active ? "var(--vault-bg)" : "var(--vault-text-mute)",
                background: active
                  ? "var(--vault-gold)"
                  : "var(--vault-panel-elevated)",
                border: `1px solid ${
                  active ? "var(--vault-gold)" : "var(--vault-border)"
                }`,
                fontWeight: active ? 600 : 500,
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dropdown
// ---------------------------------------------------------------------------
function Dropdown({
  label,
  value,
  options,
  onSelect,
  renderLabel,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  renderLabel?: (v: string) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onSelect(e.target.value)}
        className="rounded-[2px] px-2.5 py-1 font-mono text-[11px] tracking-wider uppercase transition-colors min-w-[110px] focus:outline-none cursor-pointer"
        style={{
          color: "var(--vault-text)",
          background: "var(--vault-panel-elevated)",
          border: "1px solid var(--vault-border)",
        }}
      >
        {options.map((opt) => (
          <option
            key={opt}
            value={opt}
            style={{ background: "var(--vault-panel)", color: "var(--vault-text)" }}
          >
            {renderLabel ? renderLabel(opt) : opt}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slider — min edge
// ---------------------------------------------------------------------------
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
    <div className="flex flex-col gap-1.5 w-full sm:w-auto sm:min-w-[170px]">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {label}
        </span>
        <span
          className="font-mono text-[11px] tabular"
          style={{ color: "var(--vault-gold-bright)" }}
        >
          {value === 0 ? "any" : `${value.toFixed(1)}pp+`}
        </span>
      </div>
      <input
        type="range"
        aria-label={`Minimum edge: ${value} percentage points`}
        min={0}
        max={10}
        step={0.5}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange(parseFloat(e.target.value))
        }
        className="w-full cursor-pointer"
        style={{ accentColor: "var(--vault-gold)" }}
      />
    </div>
  );
}
