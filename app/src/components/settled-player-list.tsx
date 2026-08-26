/**
 * SettledPlayerList — renders the player-by-player audit accordions
 * for a given slate. Used as the first-paint surface on
 * `/results/nba` and `/results/mlb`.
 *
 * Replaces the horizontally-scrolling 8-column SettledGameDetail
 * table on first paint. The raw per-game table remains accessible
 * via the "Full per-game audit table" disclosure below.
 *
 * Mobile-first:
 *   - one card per player
 *   - no horizontal scroll
 *   - chips wrap compactly
 *   - ✅ / ❌ / — icons visible without depending on color
 */
import type { SettledLean } from "@/lib/settlement-data";
import {
  groupSettledLeansByPlayer,
  sortPlayerResultsForDisplay,
} from "@/lib/settled-player-summary";
import SettledPlayerAccordion from "./settled-player-accordion";

interface Props {
  rows: SettledLean[];
  sport: "nba" | "mlb";
  /** Optional set of lowercased player names to surface first. */
  featured?: ReadonlySet<string>;
  /** Optional matchup label lookup keyed by gameId. */
  matchupLabels?: Record<string, string | null>;
  /** Empty-state copy override. */
  emptyCopy?: string;
}

export default function SettledPlayerList({
  rows,
  sport,
  featured,
  matchupLabels,
  emptyCopy,
}: Props) {
  const grouped = sortPlayerResultsForDisplay(
    groupSettledLeansByPlayer(rows),
    { featured },
  );
  if (grouped.length === 0) {
    return (
      <p
        className="rounded-[6px] px-4 py-4 text-[13px]"
        style={{
          color: "var(--vault-text-mute)",
          border: "1px dashed var(--vault-border)",
          background: "color-mix(in srgb, var(--vault-scrim-base) 40%, transparent)",
        }}
      >
        {emptyCopy ??
          "No settled picks for this date yet. Grades land here once the games finish and the box score posts."}
      </p>
    );
  }
  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-2 gap-2.5"
      aria-label={`Player-by-player ${sport.toUpperCase()} audit`}
    >
      {grouped.map((p) => (
        <SettledPlayerAccordion
          key={p.player}
          player={p}
          sport={sport}
          matchupLabel={p.gameId ? matchupLabels?.[p.gameId] ?? null : null}
        />
      ))}
    </div>
  );
}
