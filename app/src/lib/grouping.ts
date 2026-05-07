/**
 * Phase 7C — group flat lean array into player-first cards.
 *
 * Input: an array of PropLean (already filtered + enriched by
 *        computeVisibleLeans).
 * Output: an array of PlayerCard, one per (date, gameId, playerId).
 *
 * Each PlayerCard contains up to three MarketRows (PTS / REB / AST).
 * Within a market row, if multiple bookmakers offered a prop for the
 * same (player, market), they collapse to ONE primary row plus
 * `alternates`. The primary is chosen DETERMINISTICALLY:
 *
 *   1. confidence rank (High > Medium > Low > insufficient_data > no_play)
 *   2. |edgePct| descending
 *   3. bookmaker name ascending (alphabetical)
 *   4. lean.id ascending
 *
 * No row is dropped — `alternates` preserves every other underlying
 * lean for that (player, market). Tests verify this invariant.
 *
 * Cards are sorted by maxAbsEdge desc, then playerName asc.
 */
import type { PropLean, Market, ConfidenceTier } from "./types";

export interface MarketRow {
  market: Market;
  /** The lean chosen to display by default. */
  primary: PropLean;
  /** All other leans for this (cardKey, market) — every bookmaker. */
  alternates: PropLean[];
  /** Unique bookmaker labels across primary + alternates. */
  bookmakers: string[];
  /** True if any alternate has a different line than the primary. */
  hasMultipleLines: boolean;
}

export interface PlayerCard {
  /** `${date}-${gameId}-${playerId}` */
  cardKey: string;
  date: string;
  gameId: string;
  playerId: number;
  playerName: string;
  team: string;
  teamFullName: string;
  opponent: string;
  opponentFullName: string;
  homeAway: "Home" | "Away";
  tipoff: string;
  /** Up to three present markets; absent ones are simply not keyed. */
  rows: Partial<Record<Market, MarketRow>>;
  /** Sum of underlying leans (primary + all alternates) across the card. */
  totalProps: number;
  /** Largest absolute edge among any underlying lean (drives sort). */
  maxAbsEdge: number;
}

const CONFIDENCE_RANK: Record<ConfidenceTier, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  insufficient_data: 3,
  no_play: 4,
};

/**
 * Total-order comparator for choosing the primary lean within a
 * (player, market) group. Same input → same primary, every time.
 */
export function comparePrimaryRank(a: PropLean, b: PropLean): number {
  const ca = CONFIDENCE_RANK[a.confidence] ?? 99;
  const cb = CONFIDENCE_RANK[b.confidence] ?? 99;
  if (ca !== cb) return ca - cb;

  const ea =
    typeof a.edgePct === "number" && Number.isFinite(a.edgePct)
      ? Math.abs(a.edgePct)
      : -1;
  const eb =
    typeof b.edgePct === "number" && Number.isFinite(b.edgePct)
      ? Math.abs(b.edgePct)
      : -1;
  if (ea !== eb) return eb - ea;

  const ba = a.bookmaker || "";
  const bb = b.bookmaker || "";
  if (ba !== bb) return ba.localeCompare(bb);

  return (a.id || "").localeCompare(b.id || "");
}

/**
 * Group an already-filtered lean array into player-first cards.
 * Pure function. Idempotent. No side effects.
 */
/**
 * Phase 12 — defensive cardKey for grouping.
 *
 * The original implementation built `cardKey = ${date}-${gameId}-${playerId}`.
 * That assumes `playerId` is unique per player. In practice, when the daily
 * board generator can't resolve a player via the nba_api schedule provider
 * (e.g. nba_api fails to import, or an alternate roster source is used),
 * leans for those players are emitted with `playerId = 0`. Multiple distinct
 * players in the same game then collide into a single cardKey, which causes
 * `groupLeansIntoPlayerCards` to merge their PTS/REB/AST rows under one
 * card header — silently mis-attributing data.
 *
 * Fix: when `playerId` is invalid (0, NaN, null, undefined), fall back to a
 * normalized player-name slug as the unique component. Valid playerIds keep
 * their existing behavior (no regression on already-correct data).
 *
 * Normalization rules for the fallback:
 *   - lowercase
 *   - strip accents and diacritics (Latin-1 to ASCII)
 *   - replace any non-alphanumeric with '_'
 *   - collapse repeated '_' into one
 *
 * "LeBron James" and "Lebron James" produce the same key; "LeBron James" and
 * "LeBron James Jr." produce different keys (because "_jr" survives
 * normalization). That's the right tradeoff for a public site — false
 * collisions are far worse than false splits.
 */
function normalizePlayerName(name: string | null | undefined): string {
  if (!name) return "_unknown_";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "_unknown_";
}

function buildCardKey(lean: PropLean): string {
  const datePart = lean.date;
  const gamePart = lean.gameId ?? "";
  const pid = lean.playerId;
  const idIsValid =
    typeof pid === "number" && Number.isFinite(pid) && pid > 0;
  const playerPart = idIsValid
    ? `pid:${pid}`
    : `name:${normalizePlayerName(lean.playerName)}`;
  return `${datePart}-${gamePart}-${playerPart}`;
}

export function groupLeansIntoPlayerCards(
  visibleLeans: PropLean[],
): PlayerCard[] {
  // 1) Bucket by (date, gameId, playerId-or-name) — see buildCardKey above
  const byPlayer = new Map<string, PropLean[]>();
  for (const lean of visibleLeans) {
    const cardKey = buildCardKey(lean);
    let bucket = byPlayer.get(cardKey);
    if (!bucket) {
      bucket = [];
      byPlayer.set(cardKey, bucket);
    }
    bucket.push(lean);
  }

  // 2) Build a PlayerCard for each bucket
  const cards: PlayerCard[] = [];
  for (const [cardKey, leans] of byPlayer) {
    if (leans.length === 0) continue;
    const first = leans[0];

    const rows: Partial<Record<Market, MarketRow>> = {};
    for (const market of ["PTS", "REB", "AST"] as const) {
      const marketLeans = leans.filter((l) => l.market === market);
      if (marketLeans.length === 0) continue;

      const sorted = [...marketLeans].sort(comparePrimaryRank);
      const [primary, ...alternates] = sorted;

      const bookSet = new Set<string>();
      if (primary.bookmaker) bookSet.add(primary.bookmaker);
      for (const a of alternates) {
        if (a.bookmaker) bookSet.add(a.bookmaker);
      }

      const hasMultipleLines = alternates.some((a) => a.line !== primary.line);

      rows[market] = {
        market,
        primary,
        alternates,
        bookmakers: Array.from(bookSet),
        hasMultipleLines,
      };
    }

    let maxAbsEdge = 0;
    for (const l of leans) {
      if (typeof l.edgePct === "number" && Number.isFinite(l.edgePct)) {
        const a = Math.abs(l.edgePct);
        if (a > maxAbsEdge) maxAbsEdge = a;
      }
    }

    cards.push({
      cardKey,
      date: first.date,
      gameId: first.gameId ?? "",
      playerId: first.playerId,
      playerName: first.playerName,
      team: first.team,
      teamFullName: first.teamFullName ?? first.team,
      opponent: first.opponent,
      opponentFullName: first.opponentFullName ?? first.opponent,
      homeAway: first.homeAway,
      tipoff: first.tipoff,
      rows,
      totalProps: leans.length,
      maxAbsEdge,
    });
  }

  // 3) Sort cards: maxAbsEdge desc, then playerName asc — total order
  cards.sort((a, b) => {
    if (b.maxAbsEdge !== a.maxAbsEdge) return b.maxAbsEdge - a.maxAbsEdge;
    return a.playerName.localeCompare(b.playerName);
  });

  return cards;
}

/**
 * Sum of underlying leans across all cards. Used by the count display
 * and as a preservation invariant in tests.
 */
export function totalUnderlyingLeans(cards: PlayerCard[]): number {
  let total = 0;
  for (const c of cards) total += c.totalProps;
  return total;
}
