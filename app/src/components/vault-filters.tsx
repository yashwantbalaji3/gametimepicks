"use client";

/**
 * VaultFilters — Phase 7B-6.
 *
 * Self-contained filter UI: game-selector cards, secondary filter
 * controls, and the active-filter chip strip. ALL controlled. No
 * internal state. No useEffect. Each input writes the new FilterState
 * via onFiltersChange. Single update path; cannot get out of sync.
 *
 * Visual: Gametime Vault — gold accents on active state, navy panels.
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
  dirty,
  activeChips,
}: Props) {
  // Single typed setter that the rest of this file uses.
  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onFiltersChange({ ...filters, [key]: value });

  // Show "no data" / "pass" only if the slate has them.
  const confidenceOptions = useMemo<("All" | ConfidenceTier)[]>(() => {
    const opts: ("All" | ConfidenceTier)[] = ["All", "High", "Medium", "Low"];
    if (presentConfidences.includes("insufficient_data")) opts.push("insufficient_data");
    if (presentConfidences.includes("no_play")) opts.push("no_play");
    return opts;
  }, [presentConfidences]);

  return (
    <>
      {/* Game selector — prominent cards */}
      {games.length > 0 && (
        <GameSelector
          games={games}
          propCounts={propCounts}
          selected={filters.gameKey}
          onSelect={(k) => update("gameKey", k)}
        />
      )}

      {/* Filter panel */}
      <div
        className="rounded-[4px] mb-4 p-4"
        style={{
          background: "var(--vault-panel)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
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

          <Slider
            label="min edge"
            value={filters.minEdge}
            onChange={(v) => update("minEdge", v)}
          />

          <Dropdown
            label="sort"
            value={filters.sort}
            options={["edge", "confidence", "projGap", "tipoff"]}
            renderLabel={(v) => SORT_LABELS[v as SortKey] ?? v}
            onSelect={(v) => update("sort", v as SortKey)}
          />
        </div>

        <div
          className="mt-4 pt-3 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--vault-border)" }}
        >
          <span
            className="font-mono text-[11px] uppercase tracking-wider"
            style={{ color: "var(--vault-text-faint)" }}
          >
            showing{" "}
            <span
              className="tabular"
              style={{ color: "var(--vault-gold-bright)" }}
            >
              {filteredCount}
            </span>
            <span style={{ color: "var(--vault-text-faint)" }}>
              {" "}
              of {totalCount}
            </span>
          </span>
          {dirty && (
            <button
              type="button"
              onClick={onResetAll}
              className="font-mono text-[10px] uppercase tracking-wider transition-colors"
              style={{ color: "var(--vault-gold)" }}
            >
              reset all ✕
            </button>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {dirty && (
        <div
          className="rounded-[4px] mb-4 px-3 py-2 flex flex-wrap items-center gap-2"
          style={{
            background: "var(--vault-panel)",
            border: "1px solid var(--vault-border)",
          }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-wider mr-1"
            style={{ color: "var(--vault-text-faint)" }}
          >
            active
          </span>
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
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// GameSelector — prominent game cards
// ---------------------------------------------------------------------------
function GameSelector({
  games,
  propCounts,
  selected,
  onSelect,
}: {
  games: ScheduleGame[];
  propCounts: Record<string, number>;
  selected: string;
  onSelect: (k: string) => void;
}) {
  const allCount = propCounts["All"] ?? 0;

  return (
    <div className="mb-5">
      <div
        className="font-mono text-[10px] uppercase tracking-wider mb-2"
        style={{ color: "var(--vault-gold)" }}
      >
        select game
      </div>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`,
        }}
      >
        <GameCard
          isAll
          isSelected={selected === "All"}
          onClick={() => onSelect("All")}
          away="All"
          home=""
          tipoff=""
          propCount={allCount}
        />
        {games.map((g) => {
          const k = `${g.awayTeamAbbr}@${g.homeTeamAbbr}`;
          return (
            <GameCard
              key={k}
              isSelected={selected === k}
              onClick={() => onSelect(k)}
              away={g.awayTeamAbbr}
              home={g.homeTeamAbbr}
              tipoff={g.tipoff}
              propCount={propCounts[k] ?? 0}
            />
          );
        })}
      </div>
    </div>
  );
}

function GameCard({
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
      className="text-left p-3 rounded-[3px] transition-all duration-150"
      style={{
        background: isSelected
          ? "var(--vault-panel-elevated)"
          : "var(--vault-panel)",
        border: `1px solid ${
          isSelected
            ? "var(--vault-border-active)"
            : "var(--vault-border)"
        }`,
        boxShadow: isSelected
          ? "inset 0 0 0 1px var(--vault-gold), 0 0 12px var(--vault-gold-glow)"
          : "none",
      }}
    >
      {isAll ? (
        <>
          <div
            className="font-display font-semibold text-[15px] tracking-tight"
            style={{
              color: isSelected
                ? "var(--vault-gold-bright)"
                : "var(--vault-text)",
            }}
          >
            All games
          </div>
          <div
            className="mt-1.5 font-mono text-[10px] uppercase tracking-wider"
            style={{ color: "var(--vault-text-faint)" }}
          >
            {propCount} {propCount === 1 ? "prop" : "props"}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-display font-semibold text-[15px] tracking-tight tabular"
              style={{
                color: isSelected
                  ? "var(--vault-gold-bright)"
                  : "var(--vault-text)",
              }}
            >
              {away}
            </span>
            <span
              className="font-mono text-[10px] uppercase"
              style={{ color: "var(--vault-text-faint)" }}
            >
              @
            </span>
            <span
              className="font-display font-semibold text-[15px] tracking-tight tabular"
              style={{
                color: isSelected
                  ? "var(--vault-gold-bright)"
                  : "var(--vault-text)",
              }}
            >
              {home}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 mt-1.5">
            {tipoff && (
              <span
                className="font-mono text-[10px] uppercase tracking-wider"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {tipoff}
              </span>
            )}
            <span
              className="font-mono text-[10px] uppercase tracking-wider"
              style={{ color: "var(--vault-text-faint)" }}
            >
              {propCount} {propCount === 1 ? "prop" : "props"}
            </span>
          </div>
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Segmented (chip-style toggle row)
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
        className="font-mono text-[10px] uppercase tracking-wider"
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
              className="px-2.5 py-1 rounded-[2px] font-mono text-[11px] tracking-wider uppercase transition-colors"
              style={{
                color: active ? "var(--vault-bg)" : "var(--vault-text-mute)",
                background: active ? "var(--vault-gold)" : "var(--vault-panel-elevated)",
                border: `1px solid ${
                  active ? "var(--vault-gold)" : "var(--vault-border)"
                }`,
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
// Dropdown (select)
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
        className="font-mono text-[10px] uppercase tracking-wider"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
          onSelect(e.target.value)
        }
        className="rounded-[2px] px-2.5 py-1 font-mono text-[11px] tracking-wider uppercase transition-colors min-w-[110px] focus:outline-none"
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
// Slider (min edge)
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
    <div className="flex flex-col gap-1.5 min-w-[160px]">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="font-mono text-[10px] uppercase tracking-wider"
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
