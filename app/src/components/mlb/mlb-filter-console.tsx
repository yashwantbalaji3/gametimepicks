"use client";

import type { MlbBoardLean } from "@/lib/types-mlb";

/**
 * MlbFilterConsole — sibling to NBA's VaultFilters, scoped to MLB markets.
 *
 * Pure controlled component. Parent owns the state and the filtered lean
 * computation; this component just renders chips and notifies on change.
 *
 * Filters:
 *   - market (All / Strikeouts / Hits / Total Bases)
 *   - confidence (All / High / Medium / Low / Sample too small)
 *   - team (All + present teams)
 *   - sort (Featured / Edge / Projection gap / Game time)
 *   - density (Detailed / Scan)
 *
 * Designed to be readable at 390 px — chips wrap into rows naturally.
 */

export type MlbFilterMarket =
  | "all"
  | "pitcher_strikeouts"
  | "batter_hits"
  | "batter_total_bases";

export type MlbFilterConfidence =
  | "all"
  | "High"
  | "Medium"
  | "Low"
  | "insufficient_data";

export type MlbFilterSort = "featured" | "edge" | "gap" | "tipoff";

export type MlbDensity = "detailed" | "scan";

export interface MlbFilterState {
  market: MlbFilterMarket;
  confidence: MlbFilterConfidence;
  team: string; // "all" or team abbreviation
  sort: MlbFilterSort;
  density: MlbDensity;
}

interface Props {
  state: MlbFilterState;
  teamOptions: string[]; // sorted unique team abbreviations
  onChange: (next: MlbFilterState) => void;
  visibleCount: number;
  totalCount: number;
}

const MARKET_OPTIONS: { value: MlbFilterMarket; label: string }[] = [
  { value: "all", label: "All markets" },
  { value: "pitcher_strikeouts", label: "Pitcher Ks" },
  { value: "batter_hits", label: "Hits" },
  { value: "batter_total_bases", label: "Total Bases" },
];

const CONFIDENCE_OPTIONS: { value: MlbFilterConfidence; label: string }[] = [
  { value: "all", label: "All tiers" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
  { value: "insufficient_data", label: "Sample too small" },
];

const SORT_OPTIONS: { value: MlbFilterSort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "edge", label: "Edge" },
  { value: "gap", label: "Projection gap" },
  { value: "tipoff", label: "Game time" },
];

function chipStyle(active: boolean) {
  return {
    fontSize: 11,
    color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
    background: active
      ? "linear-gradient(180deg, var(--vault-gold-dim) 0%, color-mix(in srgb, var(--vault-accent) 0%, transparent) 90%)"
      : "transparent",
    border: active
      ? "1px solid color-mix(in srgb, var(--vault-accent) 35%, transparent)"
      : "1px solid var(--vault-border)",
  };
}

export default function MlbFilterConsole({
  state,
  teamOptions,
  onChange,
  visibleCount,
  totalCount,
}: Props) {
  const update = <K extends keyof MlbFilterState>(
    key: K,
    value: MlbFilterState[K],
  ) => onChange({ ...state, [key]: value });

  const isDefault =
    state.market === "all" &&
    state.confidence === "all" &&
    state.team === "all" &&
    state.sort === "featured" &&
    state.density === "detailed";

  return (
    <section
      aria-label="MLB filter console"
      className="mt-6 gtp-console-chrome rounded-[6px] p-3 sm:p-4"
      style={{
        background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
        >
          Filters · {visibleCount} of {totalCount} leans
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={() =>
              onChange({
                market: "all",
                confidence: "all",
                team: "all",
                sort: "featured",
                density: "detailed",
              })
            }
            className="font-mono uppercase tracking-[0.14em] rounded-[3px] px-2.5 py-1"
            style={{
              fontSize: 10,
              color: "var(--vault-text-mute)",
              border: "1px solid var(--vault-border)",
              background: "transparent",
            }}
          >
            Reset
          </button>
        )}
      </div>

      <FilterRow label="Market">
        {MARKET_OPTIONS.map((opt) => (
          <ChipButton
            key={opt.value}
            active={state.market === opt.value}
            onClick={() => update("market", opt.value)}
          >
            {opt.label}
          </ChipButton>
        ))}
      </FilterRow>

      <FilterRow label="Confidence">
        {CONFIDENCE_OPTIONS.map((opt) => (
          <ChipButton
            key={opt.value}
            active={state.confidence === opt.value}
            onClick={() => update("confidence", opt.value)}
          >
            {opt.label}
          </ChipButton>
        ))}
      </FilterRow>

      <FilterRow label="Team">
        <ChipButton
          active={state.team === "all"}
          onClick={() => update("team", "all")}
        >
          All teams
        </ChipButton>
        {teamOptions.map((team) => (
          <ChipButton
            key={team}
            active={state.team === team}
            onClick={() => update("team", team)}
          >
            {team}
          </ChipButton>
        ))}
      </FilterRow>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <FilterRow label="Sort">
          {SORT_OPTIONS.map((opt) => (
            <ChipButton
              key={opt.value}
              active={state.sort === opt.value}
              onClick={() => update("sort", opt.value)}
            >
              {opt.label}
            </ChipButton>
          ))}
        </FilterRow>

        <FilterRow label="Density">
          <ChipButton
            active={state.density === "detailed"}
            onClick={() => update("density", "detailed")}
          >
            Detailed
          </ChipButton>
          <ChipButton
            active={state.density === "scan"}
            onClick={() => update("density", "scan")}
          >
            Scan
          </ChipButton>
        </FilterRow>
      </div>
    </section>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 first:mt-0">
      <span
        className="font-mono uppercase tracking-[0.14em] shrink-0"
        style={{
          color: "var(--vault-text-faint)",
          fontSize: 10,
          minWidth: 72,
        }}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="font-mono uppercase tracking-[0.10em] rounded-[3px] px-2.5 py-1 transition-colors"
      style={chipStyle(active)}
    >
      {children}
    </button>
  );
}

/**
 * Pure helper: apply the filter state to a lean array. Exported for the
 * page component to compute filtered lists. Sort is also applied.
 */
export function applyMlbFilters(
  leans: MlbBoardLean[],
  state: MlbFilterState,
): MlbBoardLean[] {
  const filtered = leans.filter((l) => {
    if (state.market !== "all" && l.marketKey !== state.market) return false;
    if (state.confidence !== "all" && l.confidence !== state.confidence)
      return false;
    if (state.team !== "all" && l.playerTeamAbbr !== state.team) return false;
    return true;
  });
  return sortLeans(filtered, state.sort);
}

function tierRank(c: MlbBoardLean["confidence"]): number {
  switch (c) {
    case "High":
      return 0;
    case "Medium":
      return 1;
    case "Low":
      return 2;
    case "insufficient_data":
      return 3;
    default:
      return 4;
  }
}

function sortLeans(
  leans: MlbBoardLean[],
  sort: MlbFilterSort,
): MlbBoardLean[] {
  const out = [...leans];
  switch (sort) {
    case "edge":
      return out.sort(
        (a, b) => Math.abs(b.edgePct ?? -1) - Math.abs(a.edgePct ?? -1),
      );
    case "gap":
      return out.sort((a, b) => {
        const ga =
          a.projection !== null ? Math.abs(a.projection - a.line) : -1;
        const gb =
          b.projection !== null ? Math.abs(b.projection - b.line) : -1;
        return gb - ga;
      });
    case "tipoff":
      return out.sort((a, b) =>
        (a.commenceTime || "").localeCompare(b.commenceTime || ""),
      );
    case "featured":
    default:
      return out.sort((a, b) => {
        const ta = tierRank(a.confidence);
        const tb = tierRank(b.confidence);
        if (ta !== tb) return ta - tb;
        return Math.abs(b.edgePct ?? -1) - Math.abs(a.edgePct ?? -1);
      });
  }
}
