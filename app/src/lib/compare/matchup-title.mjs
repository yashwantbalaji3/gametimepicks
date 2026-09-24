/**
 * A MATCHUP TITLE THAT NAMES ITS GAME (v1.8 · UX-1).
 *
 * Every matchup `<title>` read `"{away} at {home} matchup history and team stats | GameTimePicks"`, so the
 * 93 committed MLB matchups collapsed to **38 distinct titles — 88 pages sharing one with another page**.
 * Each has its own correct canonical URL, so these are not canonical duplicates; they are distinct games a
 * reader cannot tell apart from a browser tab, a search result or a shared link.
 *
 * THE PAGE BODY WAS NEVER AMBIGUOUS. The line directly under the `h1` already renders
 * `formatKickoff(startUtc)` — date and time in ET. So the `h1` is deliberately left alone: repeating the
 * date in it would duplicate the line beneath it. Only the title is fixed, because only the title travels
 * away from the page.
 *
 * WHY THE ET DATE AND NOT THE UTC ONE. Slicing `startUtc` to ten characters looks like a date and is not:
 * an 8:10 PM ET first pitch is the NEXT UTC day, so twelve pairs of ordinary games appeared to be same-day
 * collisions. Measured: teams alone 38 distinct of 93 · teams + UTC date 81 · **teams + ET date 92**.
 *
 * WHICH LEAVES EXACTLY ONE REAL DOUBLEHEADER — Tampa Bay Rays at New York Yankees, Sep 22 2026
 * (`823543`, `823494`). A date genuinely cannot separate those, so they take a game number, ordered by
 * start time. The suffix appears ONLY when a key is actually shared: a game number on a game that has no
 * sibling would be a claim about a second game that does not exist.
 */

/**
 * Titles for every matchup of one sport, keyed by gameId.
 *
 * Built for the whole set at once because "is this key shared?" is not answerable one entry at a time —
 * the same reason the collision was invisible until all 93 were counted together.
 *
 * @param {Array<{gameId: string, startUtc: string|null}>} entries
 * @param {(e: any) => string} describe   "{away} at {home}" for an entry — the caller owns the entry shape
 * @param {(startUtc: string|null) => string} formatDate  the page's own ET day formatter
 * @returns {Map<string, string>} gameId → title (without the site suffix)
 */
export function matchupTitles(entries, describe, formatDate) {
  const byKey = new Map();
  for (const e of entries) {
    const key = `${describe(e)}|${formatDate(e.startUtc)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(e);
  }
  const out = new Map();
  for (const [, group] of byKey) {
    /* Stable order so Game 1 is the earlier game on every rebuild — a title that reshuffles between
       builds is its own kind of wrong. gameId breaks a tie only if two starts are identical. */
    const ordered = [...group].sort((a, b) =>
      String(a.startUtc ?? "").localeCompare(String(b.startUtc ?? "")) || String(a.gameId).localeCompare(String(b.gameId)));
    ordered.forEach((e, i) => {
      const base = `${describe(e)}, ${formatDate(e.startUtc)}`;
      out.set(String(e.gameId), ordered.length > 1 ? `${base} · Game ${i + 1}` : base);
    });
  }
  return out;
}
