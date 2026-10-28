/**
 * W9 · audit row 14 (2026-10-28): search sent "Bukayo Saka" to a match page (/epl/match/liverpool-v-arsenal-…) when his
 * own page, /players/epl/bukayo-saka/, exists. A player row opens the player's page when the committed research
 * registry has one, joined by the EXACT provider id (the projections' ESPN athlete id ↔ the registry's
 * `epl-athlete-<id>`), never by name: the 10-28 projections carry two different players named Saka. The match stays in
 * the row's hint text. A player the registry does not hold keeps the match page that names him.
 */

/** id → page path for every EPL player the research registry generates a page for. */
export function eplPlayerPageIndex(researchIndex) {
  const out = new Map();
  if (!researchIndex || researchIndex.schemaVersion !== 1) return out;
  for (const e of researchIndex.entries ?? []) {
    if (e?.sport !== "EPL" || e?.kind !== "player" || typeof e.path !== "string" || typeof e.id !== "string") continue;
    out.set(e.id, e.path);
  }
  return out;
}

/** Where an EPL projection player row should open: their own page when one exists, else the match page. */
export function eplPlayerHref(player, fixtureSlug, pages) {
  const id = player?.playerId == null ? "" : String(player.playerId).trim();
  return (id && pages.get(`epl-athlete-${id}`)) || `/epl/match/${fixtureSlug}/`;
}
