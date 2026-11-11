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

/**
 * STARTING QB (PD 2026-11-11, sim-v2/starter-qb.mjs): a team whose starter the board WITHHELD has no named passer in the
 * Theater. Receipts written with the rule record each team's decision (`inputSnapshotIds.starters`) and route that
 * team's passing to OTHER; a receipt written before the rule may still carry a backup as the passer, so the page also
 * passes the teams its current board withholds. Every line of such a team's passer(s) and OTHER passing row is shown
 * as "Starting QB not confirmed" — the numbers stay (they are the run's), the name never does.
 */
export const STARTER_NOT_CONFIRMED = "Starting QB not confirmed";

/** Teams a receipt's recorded decision withholds, or null when the receipt predates the rule. */
export function withheldStarterTeams(starters) {
  if (!starters || typeof starters !== "object") return null;
  return Object.entries(starters).filter(([, d]) => d?.state !== "STARTER").map(([abbr]) => abbr).sort();
}

/** The stored run boxes with every withheld team's passer name(s) masked (pure; boxes not touched for other teams). */
export function maskWithheldPassers(runBoxes, teams) {
  if (!runBoxes?.boxes || !teams?.length) return runBoxes;
  const withheld = new Set(teams);
  const boxes = {};
  for (const [k, box] of Object.entries(runBoxes.boxes)) {
    const next = { ...box };
    for (const side of ["away", "home"]) {
      const s = box?.[side];
      if (!s || !withheld.has(s.abbr)) continue;
      const ids = new Set((s.passing ?? []).map((r) => r.id));
      const mask = (rows) => (rows ?? []).map((r) => (ids.has(r.id) ? { ...r, name: STARTER_NOT_CONFIRMED, position: null } : r));
      next[side] = { ...s, passing: mask(s.passing), rushing: mask(s.rushing), receiving: mask(s.receiving), tdScorers: mask(s.tdScorers), turnovers: mask(s.turnovers) };
    }
    boxes[k] = next;
  }
  return { ...runBoxes, boxes };
}
