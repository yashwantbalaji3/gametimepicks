/**
 * SIMULATION THEATER · how the NFL run box score treats a simulated player's availability (eligibility@1, the receipt's
 * `playerAvailability`, written by sim-v2/personnel-eligibility.mjs). PURE and import-free: it runs in the client island.
 *   featured   only a player the receipt marks featurable (ELIGIBLE, not questionable, sources agree)
 *   labelled   an unverified player ("availability not verified") or a questionable one keeps his lines with a label
 *   legacy     a receipt without the map keeps the display it always had
 */
export const AVAILABILITY_LABEL = Object.freeze({ UNKNOWN: "availability not verified", NOT_FEATURABLE: "listed questionable or sources disagree" });

/**
 * May the Theater feature this simulated player (touchdown line, any highlight)? A receipt written before availability
 * was recorded carries no map and keeps its existing display (null ⇒ true); with a map, a player it does not list as
 * featurable is not featured. Team lines (OTHER, DEF_ST) are not players.
 */
export const theaterFeaturable = (availability, playerId) => availability == null || playerId === "OTHER" || playerId === "DEF_ST" || availability[playerId]?.featurable === true;
/**
 * The Theater's touchdown line (the run box score's one featured element): scorers it may feature, and how many TDs were
 * scored by simulated players it may not feature (counted, so the line stays true to the run, never named).
 */
export function featuredTdScorers(tdScorers, availability) {
  const featured = [];
  let notFeatured = 0;
  for (const r of tdScorers ?? []) {
    if (theaterFeaturable(availability, r.id)) featured.push(r);
    else notFeatured += Number(r.tds) || 0;
  }
  return { featured, notFeatured };
}
/** The label a Theater row carries, or null. */
export function availabilityLabel(availability, playerId) {
  const a = availability?.[playerId];
  if (!a) return null;
  if (a.state === "UNKNOWN") return AVAILABILITY_LABEL.UNKNOWN;
  if (!a.featurable) return AVAILABILITY_LABEL.NOT_FEATURABLE;
  return null;
}
