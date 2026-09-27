/**
 * FEATURED GAMETIMEPICKS FORECASTS — the five predictions a game card shows.
 *
 * ⚠ NO fs, NO node builtins. A client component imports this, and the hub's roster module cannot be
 *   imported there because it reads the filesystem.
 *
 * ⚠ THE FIVE ARE CHOSEN FROM FROZEN PREGAME DATA ONLY, AND NEVER RE-RANKED BY LIVE PLAY.
 *
 *   The obvious policy — surface whatever is moving most right now — was rejected, correctly: it
 *   turns "featured forecasts" into "whatever is currently happening", and a prediction featured
 *   before kickoff could vanish from the card once the game starts. The product claim is that a
 *   prediction is frozen before kickoff and then watched, so the SAME five must stay attached to
 *   the game through PRE → LIVE → FINAL · grading pending. Live data moves the rail, never the
 *   membership.
 *
 * ⚠ AND THERE IS NO CONFIDENCE FIELD TO RANK BY. Nothing in the NFL families carries a calibrated,
 *   cross-family comparable confidence — an interval width in yards is not comparable to one in
 *   receptions, and a bookmaker's implied probability is a price, not a model's opinion. So these
 *   are FEATURED, not "top 5", and nothing here invents a score.
 *
 * WHERE THE ORDER COMES FROM. `build-nfl-player-board.mjs` already sorts a game's players for
 * display, on frozen pregame numbers alone, and the live-props producer walks the board in that
 * order — verified: live-props player order follows board order exactly. So the prominence order is
 * an owner that already exists and is simply REUSED here rather than re-derived.
 */

/**
 * Promotion states a product may show. An explicit allowlist: a family nobody has cleared fails
 * closed instead of appearing because its name happened to contain a hopeful substring.
 */
export const FEATURED_FAMILY_STATES = Object.freeze(new Set(["PUBLISHED", "VALIDATED_PICK", "ADOPTED"]));

/** The most rows one collapsed game card ever renders. */
export const FEATURED_LIMIT = 5;

/**
 * How a family's frozen claim is shaped. A volume family states a number; a probability family
 * states a chance. Keeping them apart is what stops a touchdown ending up on a yardage rail.
 */
export const FAMILY_KIND = Object.freeze({
  player_rush_yds: "VOLUME",
  player_reception_yds: "VOLUME",
  player_receptions: "VOLUME",
  anytime_td: "PROBABILITY",
});

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * The measurement state for one row. `MISSING` and a measured `0` are different facts and must
 * never collapse into each other — a player who has not been measured has not gained zero yards.
 */
export function measurementStateOf(row, phase) {
  if (phase === "PRE") return "NOT_STARTED";
  const v = num(row?.live?.statValue);
  if (v === null) return "AWAITING_FIRST_MEASUREMENT";
  return "MEASURED";
}

/**
 * One prediction, flattened for the card. Frozen halves come from the artifact's own `frozen`
 * block, so the projection, the line and the live value all came out of the SAME capture and
 * cannot skew against each other.
 */
function toForecast(row, phase, portraitFor) {
  const kind = FAMILY_KIND[row.family] ?? null;
  const proj = row?.frozen?.projection ?? {};
  return {
    predictionId: row.predictionId,
    playerId: row.playerId,
    playerName: row.name,
    team: row.team ?? null,
    family: row.family,
    kind,
    label: row.label ?? null,
    /* A volume family's frozen claim. Null for a probability family — never a converted price. */
    modelValue: kind === "VOLUME" ? num(proj.median) : null,
    modelProbability: kind === "PROBABILITY" ? num(proj.probability) : null,
    line: num(row?.frozen?.market?.line),
    liveValue: num(row?.live?.statValue),
    measurementState: measurementStateOf(row, phase),
    lastObservedAt: row?.live?.observedAt ?? null,
    portraitUrl: portraitFor ? portraitFor(row.playerId) : null,
  };
}

/**
 * The featured five for one live-props artifact.
 *
 * Selection, in order, using frozen data only:
 *   1. the family must be cleared by the allowlist above
 *   2. artifact order — which is the board's own frozen display order
 *   3. one row per player first, so five rows are five faces rather than one player's whole slate
 *   4. then a second pass to fill any remaining slots from the same order
 *   5. `predictionId` breaks any tie deterministically
 */
export function featuredForecasts(artifact, { portraitFor = null, limit = FEATURED_LIMIT } = {}) {
  const rows = Array.isArray(artifact?.rows) ? artifact.rows : [];
  const phase = artifact?.phase ?? null;

  const eligible = rows.filter(
    (r) => r && typeof r.predictionId === "string" && FEATURED_FAMILY_STATES.has(r.familyState) && r.family in FAMILY_KIND,
  );

  const picked = [];
  const seenPlayers = new Set();
  /* Pass 1 — breadth: at most one row per player, in frozen prominence order. */
  for (const r of eligible) {
    if (picked.length >= limit) break;
    if (seenPlayers.has(r.playerId)) continue;
    seenPlayers.add(r.playerId);
    picked.push(r);
  }
  /* Pass 2 — depth: a short slate may not have five distinct players. */
  if (picked.length < limit) {
    const taken = new Set(picked.map((r) => r.predictionId));
    for (const r of eligible) {
      if (picked.length >= limit) break;
      if (taken.has(r.predictionId)) continue;
      picked.push(r);
    }
  }
  /* Deterministic within the order already established: equal-position rows resolve by id. */
  picked.sort((a, b) => eligible.indexOf(a) - eligible.indexOf(b) || a.predictionId.localeCompare(b.predictionId));

  return picked.map((r) => toForecast(r, phase, portraitFor));
}

/** How many eligible predictions the game actually has — the "View all N" figure. */
export function eligibleForecastCount(artifact) {
  const rows = Array.isArray(artifact?.rows) ? artifact.rows : [];
  return rows.filter((r) => FEATURED_FAMILY_STATES.has(r?.familyState) && r?.family in FAMILY_KIND).length;
}
