/**
 * PR `feature/sportsbook-comparison-foundation` (2026-05-29) —
 * pure helper that turns a grouped market (same player, market, side,
 * line; multiple books) into a per-book breakdown the UI can render
 * read-only.
 *
 * Honesty rules:
 *   - Never fabricates a price. If a leg's `oddsForSide` is null we
 *     drop the row.
 *   - Never invents a sportsbook. Only books present in the leans are
 *     surfaced. No affiliate links, no fake "place bet" buttons.
 *   - No scraping. Data is whatever the morning pipeline already
 *     captured from The Odds API.
 *   - "Best of N" is a pure max over American odds.
 *
 * Used by the `/projections` player accordion to render a tiny,
 * always-visible book breakdown beneath each market row whose group
 * has more than one book.
 *
 * Does NOT change optimizer behavior. Does NOT add any external HTTP.
 */

export interface BookOddsRow {
  /** Lowercase canonical bookmaker key (e.g. "draftkings"). */
  bookmaker: string;
  /** Display label (e.g. "DraftKings"). */
  bookmakerLabel: string;
  /** American odds for the model's chosen side, signed. */
  americanOdds: number;
  /** True when this row is the best-of among the input set (i.e. the
   *  highest American odds for the same side). */
  isBest: boolean;
}

export interface BookComparisonInput {
  /** Side the model chose for the group ("Over" / "Under"). Used to
   *  pick `oddsOver` vs `oddsUnder` per lean. */
  side: string;
  /** Each lean in the group. We read `bookmaker` + `oddsOver` /
   *  `oddsUnder`. */
  leans: ReadonlyArray<{
    bookmaker?: string | null;
    oddsOver?: number | null;
    oddsUnder?: number | null;
  }>;
}

/** Map of canonical lowercase keys → human-friendly display labels.
 *  Keep this aligned with `_humanBook` in `projections-experience.tsx`
 *  — both call this helper now, so the canonical map lives here. */
const _BOOK_LABELS: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  caesars: "Caesars",
  pointsbet: "PointsBet",
  bet365: "bet365",
  espnbet: "ESPN BET",
  fanatics: "Fanatics",
  hardrockbet: "Hard Rock Bet",
};

/** Render-ready bookmaker label. Falls back to title-cased input
 *  when the key is unknown so we never display a raw lowercase
 *  identifier. */
export function bookmakerLabel(book: string | null | undefined): string {
  if (typeof book !== "string" || !book.trim()) return "—";
  const k = book.toLowerCase().trim();
  return _BOOK_LABELS[k] ?? book.charAt(0).toUpperCase() + book.slice(1);
}

/** Pure: build a per-book breakdown for the model's chosen side.
 *
 *  Sort order:
 *    1. Bookmakers with a usable price first (in descending
 *       American-odds order — best for the user at the top).
 *    2. Bookmakers without a usable price are dropped — we never
 *       render "—" rows so the comparison stays honest about which
 *       books actually offer this leg.
 *
 *  Dedupe: when the same bookmaker appears more than once in the
 *  input (unlikely but defensive), keep the highest American odds. */
export function buildBookOddsComparison(
  input: BookComparisonInput,
): BookOddsRow[] {
  const side = input.side;
  if (side !== "Over" && side !== "Under") return [];
  const bestPerBook = new Map<string, number>();
  for (const lean of input.leans) {
    const book = typeof lean.bookmaker === "string" ? lean.bookmaker.trim() : "";
    if (!book) continue;
    const raw = side === "Over" ? lean.oddsOver : lean.oddsUnder;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw === 0) continue;
    const key = book.toLowerCase();
    const prev = bestPerBook.get(key);
    if (prev == null || raw > prev) {
      bestPerBook.set(key, raw);
    }
  }
  if (bestPerBook.size === 0) return [];
  const rows: BookOddsRow[] = Array.from(bestPerBook.entries()).map(
    ([bookmaker, americanOdds]) => ({
      bookmaker,
      bookmakerLabel: bookmakerLabel(bookmaker),
      americanOdds,
      isBest: false,
    }),
  );
  // Sort descending — best-for-user first.
  rows.sort((a, b) => b.americanOdds - a.americanOdds);
  // Tag the row(s) sharing the top price as the best. When two books
  // tie at the same price both get the badge — pure data, no hidden
  // preference.
  if (rows.length > 0) {
    const top = rows[0].americanOdds;
    for (const r of rows) {
      if (r.americanOdds === top) r.isBest = true;
    }
  }
  return rows;
}
