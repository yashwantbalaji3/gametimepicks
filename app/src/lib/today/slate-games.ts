/**
 * SLATE GAMES assembler — turns the day's game details into the /today "every game on the slate" board.
 *
 * It does NOT re-implement availability: every per-game tier/label/explanation/action/href comes from the
 * ONE canonical `deriveGameAvailability` contract (./availability), so /today and /mlb can never disagree.
 * This module only assembles the slate: filter to the presented day, drop games that cannot render an
 * honest matchup, GROUP by readiness tier, sort chronologically within each group, and produce a factual
 * (non-predictive) summary line.
 *
 * The point: on a 12-game slate no game is stranded behind a "+N more" link — every rendered game has a
 * clear action — AND the board is organized so a user can pick something useful without a fabricated
 * "top pick". Nothing here invents confidence, ranking, or a simulation.
 */
import {
  deriveGameAvailability,
  AVAILABILITY_ORDER,
  AVAILABILITY_GROUP_HEADING,
  type AvailabilityLevel,
  type GameAvailability,
  type GameAvailabilityInput,
} from "./availability";

/** The slate input = the availability input plus the identity/logo fields the row renders. */
export interface SlateGameDetailInput extends GameAvailabilityInput {
  homeLogo?: string | null;
  awayLogo?: string | null;
  /** Compact canonical prediction line (Sprint 009), e.g. "SF · UNDER 8.5 · LAA +1.5". Null when none. */
  predictionLine?: string | null;
}

/** One rendered board row: the canonical availability + the identity fields needed to draw the matchup. */
export interface SlateGameRow extends GameAvailability {
  slug: string;
  /** Non-null canonical report href (rows that resolve to UNAVAILABLE are dropped, never rendered). */
  href: string;
  sport: string;
  sportLabel: string;
  teams: { home: string; away: string };
  homeLogo: string | null;
  awayLogo: string | null;
  date: string;
  /** Compact canonical prediction line (Sprint 009) — the SAME decision object the Game Report hero uses. */
  predictionLine: string | null;
}

export interface SlateGroup {
  level: AvailabilityLevel;
  heading: string;
  games: SlateGameRow[];
}

export interface SlateSummary {
  total: number;
  counts: Record<AvailabilityLevel, number>;
  /** Factual, non-predictive count line, e.g. "5 games today · 3 simulations ready · 1 model read". */
  text: string;
}

export interface SlateGamesResult {
  /** Flat rows in board order (group order, then chronological within group). */
  games: SlateGameRow[];
  /** Non-empty groups only, richest tier first — empty groups never render a blank heading. */
  groups: SlateGroup[];
  summary: SlateSummary;
  total: number;
  /** How many rendered games carry a genuine ready simulation (kept for back-compat callers). */
  simReadyCount: number;
}

const SPORT_LABEL: Record<string, string> = { world_cup: "World Cup", mlb: "MLB", nba: "NBA", ufc: "UFC" };

/**
 * The explicit fresh-and-complete vs fresh-and-partial readiness line for a CURRENT slate. Stale / no-games
 * states are deliberately left to `SlateLivenessBanner` (the canonical freshness surface) — this never
 * double-speaks them: it returns null unless the slate is the current day AND has games. Purely factual;
 * derived from the availability counts, never a performance claim.
 */
export function slateReadinessNote(
  summary: Pick<SlateSummary, "counts" | "total">,
  slateIsCurrent: boolean,
): string | null {
  if (summary.total === 0) return null; // no board → the liveness banner speaks for a pending/no-games day
  if (!slateIsCurrent) return null; // stale slate → the liveness banner already frames it as the latest available
  const awaiting = summary.counts.report;
  if (awaiting === 0) return "Today's slate is ready — every game has a simulation, model, or market read.";
  return `Today's slate is still filling in — ${awaiting} game${awaiting === 1 ? "" : "s"} awaiting inputs.`;
}

/** The factual per-tier phrase for the summary line (singular/plural handled). */
function summaryPhrase(level: AvailabilityLevel, n: number): string {
  switch (level) {
    case "simulation":
      return `${n} simulation${n === 1 ? "" : "s"} ready`;
    case "model-read":
      return `${n} model read${n === 1 ? "" : "s"}`;
    case "market-read":
      return `${n} market read${n === 1 ? "" : "s"}`;
    case "report":
      return `${n} awaiting inputs`;
    case "unavailable":
      return `${n} unavailable`;
  }
}

/** Chronological within a group: soonest first pitch first; unknown times last; slug tiebreak. */
function byFirstPitch(a: SlateGameRow, b: SlateGameRow): number {
  const ta = a.firstPitchIso ?? "9999-99-99T99:99Z";
  const tb = b.firstPitchIso ?? "9999-99-99T99:99Z";
  return ta.localeCompare(tb) || a.slug.localeCompare(b.slug);
}

/**
 * Assemble the presented slate's board.
 * @param today the presented slate date (YYYY-MM-DD). Only games with `date === today` are returned, so a
 *   stale slate is never rendered as today's. Omit to include all games (unfiltered).
 * @param opts.nowMs real epoch-ms clock, threaded into the availability contract for honest start-state.
 */
export function slateGames(
  details: readonly SlateGameDetailInput[],
  today?: string,
  opts?: { nowMs?: number },
): SlateGamesResult {
  const rows: SlateGameRow[] = [];
  const seen = new Set<string>();

  for (const d of details) {
    if (today != null && d.date !== today) continue; // only the presented slate
    if (!d.slug || seen.has(d.slug)) continue; // slugs are unique; guard accidental dupes

    const availability = deriveGameAvailability(d, { nowMs: opts?.nowMs });
    // A game that can't offer even a fallback report action, or has no honest matchup, is never a board row.
    if (availability.level === "unavailable" || availability.canonicalHref == null || !d.homeTeam || !d.awayTeam) {
      continue;
    }
    seen.add(d.slug);
    rows.push({
      ...availability,
      href: availability.canonicalHref,
      slug: d.slug,
      sport: d.sport,
      sportLabel: (typeof d.sportLabel === "string" && d.sportLabel) || SPORT_LABEL[d.sport] || d.sport.toUpperCase(),
      teams: { home: d.homeTeam, away: d.awayTeam },
      homeLogo: d.homeLogo ?? null,
      awayLogo: d.awayLogo ?? null,
      date: d.date ?? "",
      predictionLine: d.predictionLine ?? null,
    });
  }

  // Group by tier (richest first); chronological within each; drop empty groups.
  const groups: SlateGroup[] = [];
  const counts = { simulation: 0, "model-read": 0, "market-read": 0, report: 0, unavailable: 0 } as Record<AvailabilityLevel, number>;
  for (const level of AVAILABILITY_ORDER) {
    const inTier = rows.filter((r) => r.level === level).sort(byFirstPitch);
    counts[level] = inTier.length;
    if (inTier.length > 0) groups.push({ level, heading: AVAILABILITY_GROUP_HEADING[level], games: inTier });
  }

  const flat = groups.flatMap((g) => g.games);
  const total = flat.length;
  const summaryParts = [`${total} game${total === 1 ? "" : "s"} today`];
  for (const level of AVAILABILITY_ORDER) {
    if (counts[level] > 0) summaryParts.push(summaryPhrase(level, counts[level]));
  }

  return {
    games: flat,
    groups,
    summary: { total, counts, text: summaryParts.join(" · ") },
    total,
    simReadyCount: counts.simulation,
  };
}
