/**
 * ONE PUBLIC SLUG PER GAME — and one rule that decides it.
 *
 * A slug of team-pair + date is not unique: a doubleheader plays the same pair on the same day
 * twice. `game-detail.ts` has always known this and disambiguates with the stable gamePk, so
 * `/games/mlb/<base>-<gamePk>/` is the page that exists on a doubleheader day and `<base>` is not.
 *
 * The full-game board adapter did not know it. It built `${away}-vs-${home}-${date}` directly, so
 * the simulation artifact — and the predictions artifact derived from it, and every `href` and slate
 * story built off that — carried the COLLIDING base for both halves. Observed on 2026-08-29:
 * seventeen prediction rows over fifteen distinct slugs, `bos-vs-nyy-2026-08-29` and
 * `az-vs-sf-2026-08-29` each naming two different games. Two consequences, both real:
 *
 *   • those links point at a base slug that is not a built page on exactly the days it collides;
 *   • anything joining by slug silently picks whichever twin comes first, which is how a slate story
 *     about one game came to read its probability off the other.
 *
 * Two copies of a rule are two chances to be wrong together — the lesson `slate-anchor` records in
 * almost these words — so the rule lives here and both sides call it.
 *
 * Pure, order-preserving, and identical to the previous behaviour for every non-colliding game:
 * a game whose base is unique keeps its base slug, so no existing URL changes.
 */

/**
 * Lowercased, punctuation-free, diacritic-folded token — byte-identical to `game-detail.ts`'s
 * `slugify`, which this rule replaces. The folding matters: World Cup names carry accents, and two
 * different normalisations would mint two different slugs for one game.
 */
const token = (s: string) =>
  (String(s ?? "") || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "?";

/** The team-pair + date slug, before any disambiguation. */
export function baseGameSlug(away: string, home: string, date: string): string {
  return `${token(away)}-vs-${token(home)}-${date}`;
}

export type SlugInput = {
  away: string;
  home: string;
  date: string;
  /** The stable public id for this game (gamePk / gameId). Without one a collision cannot be split. */
  key: string | number | null | undefined;
};

/**
 * Assign one unique public slug per game, in input order.
 *
 * A base shared by more than one game is suffixed with that game's own stable key. A colliding game
 * with NO key keeps the base: it cannot be told from its twin, and inventing a suffix would mint an
 * identity rather than report one. Callers that must not serve an ambiguous page check
 * `collidingWithoutKey` and refuse.
 */
export function assignPublicGameSlugs(games: readonly SlugInput[]): {
  slugs: string[];
  baseSlugs: string[];
  collidingWithoutKey: number[];
} {
  const baseSlugs = games.map((g) => baseGameSlug(g.away, g.home, g.date));

  const counts = new Map<string, number>();
  for (const base of baseSlugs) counts.set(base, (counts.get(base) ?? 0) + 1);

  const collidingWithoutKey: number[] = [];
  const slugs = baseSlugs.map((base, i) => {
    if ((counts.get(base) ?? 0) <= 1) return base;
    const key = games[i].key == null ? "" : String(games[i].key);
    if (!key) {
      collidingWithoutKey.push(i);
      return base;
    }
    return `${base}-${key}`;
  });

  return { slugs, baseSlugs, collidingWithoutKey };
}
