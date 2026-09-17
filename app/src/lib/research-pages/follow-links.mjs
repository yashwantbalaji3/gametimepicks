/**
 * RESEARCH LINKS FOR FOLLOWED ENTITIES (v1.3) — pure.
 *
 * /following and similar device-state pages only know canonical ids after load, so they receive a COMPACT map of
 * which followable ids have a research page: `{ "nfl-athlete": { "4035671": "keenan-allen" }, … }`. Grouping by
 * the id prefix keeps ~800 entries to a few tens of KB. Resolution is exact: the id's prefix and numeric tail must
 * both match, otherwise there is no link.
 */

/** Followable kinds (the Follow owner's supported set) → research route prefix. */
export const FOLLOW_RESEARCH_PREFIX = Object.freeze({
  "mlb-team": "/teams/mlb/",
  "nfl-team": "/teams/nfl/",
  "nfl-athlete": "/players/nfl/",
});

/**
 * @param {Array<{ id: string, slug: string }>} entries research index entries
 * @returns {Record<string, Record<string, string>>}
 */
export function compactFollowResearchMap(entries) {
  /** @type {Record<string, Record<string, string>>} */
  const out = {};
  for (const e of [...entries].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const m = /^(mlb-team|nfl-team|nfl-athlete)-(\d+)$/.exec(e.id);
    if (!m) continue;
    (out[m[1]] ??= {})[m[2]] = e.slug;
  }
  return out;
}

/** Exact id → research path, or null. */
export function followResearchHref(map, id) {
  const m = /^(mlb-team|nfl-team|nfl-athlete)-(\d+)$/.exec(String(id ?? ""));
  const slug = m ? map?.[m[1]]?.[m[2]] : undefined;
  return m && typeof slug === "string" ? `${FOLLOW_RESEARCH_PREFIX[m[1]]}${slug}/` : null;
}
