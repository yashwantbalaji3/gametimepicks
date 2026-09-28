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
 *
 * ⚠ V2B · FAMILY DIVERSITY IS A PRESENTATION ROTATION, NOT A RANKING. One-row-per-player over board
 *   order took each player's FIRST family, and on the 2026-09-27 slate that featured 24 rushing and 21
 *   receiving rows, 0 receptions and 0 touchdowns — while touchdowns were 35% of the eligible pool.
 *   So pass 1 visits the families in a FIXED order and takes each one's earliest eligible row; nothing
 *   about that order says one family, player or row is better than another. It exists so the card shows
 *   the product's range, and it reads frozen pregame fields only.
 *
 * ⚠ AND THIS MODULE IS ALSO THE ONE PLACE A FEATURED ROW IS JOINED TO ITS LIVE MEASUREMENT
 *   (`trackForecast`). Selection and tracking are separate functions on purpose: the selector is
 *   asserted never to read a live field, and the tracker never decides membership.
 */
import { MARKET_KIND, MEASUREMENT_STATES, FINALITY, RAIL_STATE, makeTrackedPrediction, railStateOf } from "./tracked-prediction.mjs";
import { DELAYED_MAX_MS } from "./freshness.mjs";

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

/**
 * Is this a family the card knows how to shape? An OWN key of FAMILY_KIND, never `in`: `in` also
 * answers true for inherited names ("constructor", "toString"), which is an allowlist that admits
 * whatever the prototype happens to carry.
 */
export const isFeaturedFamily = (family) => typeof family === "string" && Object.hasOwn(FAMILY_KIND, family);

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * THE FIXED PRESENTATION ORDER for pass 1 (founder decision, 2026-09-28). Receiving yards, rushing
 * yards, receptions, anytime touchdown. A rotation over the product's families — never read it as a
 * ranking of them.
 */
export const FEATURED_FAMILY_ORDER = Object.freeze(["player_reception_yds", "player_rush_yds", "player_receptions", "anytime_td"]);

/**
 * The families' own published labels — the same strings the board's `families[key].label` carries.
 * The live-props record does not repeat the label per row, so the card needs one owner for it.
 */
export const FAMILY_LABEL = Object.freeze({
  player_rush_yds: "Rushing yards",
  player_reception_yds: "Receiving yards",
  player_receptions: "Receptions",
  anytime_td: "Anytime touchdown",
});

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

/** Is this row a legitimate published forecast at all — the "View all N" population. */
export function isEligibleForecast(row) {
  return Boolean(row) && typeof row.predictionId === "string" && FEATURED_FAMILY_STATES.has(row.familyState) && isFeaturedFamily(row.family);
}

/**
 * Does the FROZEN record carry the model's own pregame claim?
 *
 * A volume family must carry a frozen median; a touchdown must carry a frozen model probability.
 * ⚠ A touchdown row frozen before the producer carried `probability` (every row frozen on
 *   2026-09-27) has none, and it is NOT eligible to be featured: backfilling it from a board, or from
 *   anything a bookmaker priced, would put a claim in front of the reader that was never frozen. It
 *   stays in View All, where its factual touchdown state still renders.
 */
export function hasFrozenClaim(row) {
  const proj = row?.frozen?.projection;
  if (!proj) return false;
  const kind = FAMILY_KIND[row.family];
  if (kind === "VOLUME") return num(proj.median) !== null;
  if (kind === "PROBABILITY") return num(proj.probability) !== null;
  return false;
}

/**
 * One prediction, flattened for the card. Frozen halves come from the row's own `frozen` block, so
 * the projection and the line came out of the SAME record and cannot skew against each other.
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
    label: row.label ?? FAMILY_LABEL[row.family] ?? null,
    /* A volume family's frozen claim. Null for a probability family — never a converted price. */
    modelValue: kind === "VOLUME" ? num(proj.median) : null,
    modelLow: kind === "VOLUME" ? num(proj.p10) : null,
    modelHigh: kind === "VOLUME" ? num(proj.p90) : null,
    modelProbability: kind === "PROBABILITY" ? num(proj.probability) : null,
    line: num(row?.frozen?.market?.line),
    sportsbook: typeof row?.frozen?.market?.sportsbook === "string" ? row.frozen.market.sportsbook : null,
    /* When the frozen forecast was generated — the proof it predates kickoff. */
    frozenAt: row?.frozen?.forecastGeneratedAt ?? null,
    liveValue: num(row?.live?.statValue),
    measurementState: measurementStateOf(row, phase),
    lastObservedAt: row?.live?.observedAt ?? null,
    portraitUrl: portraitFor ? portraitFor(row.playerId) : null,
  };
}

/**
 * The featured five for one game — from a live-props artifact, or from rows derived from the frozen
 * board before any capture exists (`featured-source.mjs`). Both carry the same row shape and order.
 *
 * Selection, using frozen pregame fields only (predictionId, playerId, family, familyState, the
 * frozen claim) and the order the rows arrive in, which is the board's own frozen display order:
 *   PASS 1 · family diversity — for each family in FEATURED_FAMILY_ORDER, the earliest eligible row
 *            whose player is not yet represented. At most one row per family.
 *   PASS 2 · fill to five from the same order, unused players only.
 *   PASS 3 · only if fewer than five unique-player rows exist, a second market for a player already
 *            shown, in the same order.
 * Rows are de-duplicated by predictionId, so the order is total and no further tie-break can arise.
 */
/**
 * @param {{ rows?: any[], phase?: string | null } | null | undefined} artifact
 * @param {{ portraitFor?: ((playerId: string) => string | null) | null, limit?: number }} [opts]
 */
export function featuredForecasts(artifact, { portraitFor = null, limit = FEATURED_LIMIT } = {}) {
  const rows = Array.isArray(artifact?.rows) ? artifact.rows : [];
  const phase = artifact?.phase ?? null;

  const seenIds = new Set();
  const pool = [];
  for (const r of rows) {
    if (!isEligibleForecast(r) || !hasFrozenClaim(r) || seenIds.has(r.predictionId)) continue;
    seenIds.add(r.predictionId);
    pool.push(r);
  }

  const picked = [];
  const taken = new Set();
  const players = new Set();
  const take = (r) => { picked.push(r); taken.add(r.predictionId); players.add(r.playerId); };

  /* PASS 1 — one row per family, fixed presentation order, preferring a new face. */
  for (const family of FEATURED_FAMILY_ORDER) {
    if (picked.length >= limit) break;
    const r = pool.find((x) => x.family === family && !players.has(x.playerId));
    if (r) take(r);
  }
  /* PASS 2 — fill from board order, new faces only. */
  for (const r of pool) {
    if (picked.length >= limit) break;
    if (!taken.has(r.predictionId) && !players.has(r.playerId)) take(r);
  }
  /* PASS 3 — a short slate: a second market for someone already shown. */
  for (const r of pool) {
    if (picked.length >= limit) break;
    if (!taken.has(r.predictionId)) take(r);
  }

  return picked.map((r) => toForecast(r, phase, portraitFor));
}

/** How many legitimate forecasts the game actually has — the "View all N" figure. */
export function eligibleForecastCount(artifact) {
  const rows = Array.isArray(artifact?.rows) ? artifact.rows : [];
  return rows.filter(isEligibleForecast).length;
}

/* ─────────────────────────────  TRACKING — frozen forecast × live fact  ───────────────────────────── */

/** The game's lifecycle, as the card knows it. */
export const GAME_PHASE = Object.freeze({ PRE: "PRE", LIVE: "LIVE", FINAL: "FINAL" });

/** Whether we hold a live-props record for this game at all. */
export const FEED = Object.freeze({ OK: "OK", UNAVAILABLE: "UNAVAILABLE", NOT_ASKED: "NOT_ASKED" });

/** A live measurement older than this is shown as LAST KNOWN, never as current (the live window's own bound). */
export const LIVE_STALE_AFTER_MS = DELAYED_MAX_MS;

/**
 * Join ONE featured forecast to its live-props row and derive what the card may say.
 *
 * ⚠ OUTCOME LANGUAGE IS CAPPED AT "FINAL · GRADING PENDING". Finality is passed to the canonical
 *   rail machine as FINAL_PROVISIONAL at most, so `railStateOf` cannot return a HIT or a MISS from
 *   here. Whether the live-props producer's own reconciled settlement may be shown as the canonical
 *   result is a settlement-semantics decision that has not been made; until it is, a final row shows
 *   its final stat and says grading is pending.
 *
 * `nowMs` may be null (server render): staleness is then unknown rather than guessed, and no age is
 * claimed — the reader's own clock supplies it after hydration.
 */
/**
 * @param {any} forecast
 * @param {{ gamePhase?: "PRE" | "LIVE" | "FINAL", liveRow?: any, feed?: "OK" | "UNAVAILABLE" | "NOT_ASKED", observedAt?: string | null, nowMs?: number | null }} [ctx]
 */
export function trackForecast(forecast, { gamePhase = GAME_PHASE.PRE, liveRow = null, feed = FEED.NOT_ASKED, observedAt = null, nowMs = null } = {}) {
  const binary = forecast.kind === "PROBABILITY";
  const value = num(liveRow?.live?.statValue);
  const at = liveRow?.live?.observedAt ?? observedAt ?? null;
  const atMs = at ? Date.parse(at) : NaN;
  const ageMs = nowMs !== null && Number.isFinite(atMs) ? Math.max(0, nowMs - atMs) : null;
  const stale = gamePhase === GAME_PHASE.LIVE && ageMs !== null && ageMs > LIVE_STALE_AFTER_MS;

  let measurementState;
  if (gamePhase === GAME_PHASE.PRE) measurementState = MEASUREMENT_STATES.AWAITING_EVENT;
  else if (value !== null) measurementState = stale ? MEASUREMENT_STATES.SOURCE_STALE : MEASUREMENT_STATES.MEASURED;
  else measurementState = MEASUREMENT_STATES.NO_MEASUREMENT;

  const finalStat = gamePhase === GAME_PHASE.FINAL ? num(liveRow?.settlement?.finalStat) ?? value : null;

  const tracked = makeTrackedPrediction({
    sport: "nfl",
    eventId: String(forecast.predictionId).split(":")[0],
    participantId: forecast.playerId,
    marketFamily: forecast.family,
    marketKind: binary ? MARKET_KIND.BINARY : MARKET_KIND.ADDITIVE,
    pregame: {
      modelPrediction: binary ? forecast.modelProbability : forecast.modelValue,
      modelRange: { low: forecast.modelLow, high: forecast.modelHigh },
      modelProbability: binary ? forecast.modelProbability : null,
      line: forecast.line,
      capturedAt: forecast.frozenAt,
    },
    live: { measurementState, currentValue: value, observedAt: at },
    final: { finality: gamePhase === GAME_PHASE.FINAL ? FINALITY.FINAL_PROVISIONAL : FINALITY.NOT_FINAL, actualValue: finalStat },
  });
  const rail = railStateOf(tracked);

  return {
    rail,
    /* Shown only when it is a real measurement; never a zero standing in for "not yet". */
    liveValue: gamePhase === GAME_PHASE.PRE ? null : value,
    finalStat,
    observedAt: at,
    ageMs,
    stale,
    feed,
    status: statusFor({ rail, binary, gamePhase, feed, value: gamePhase === GAME_PHASE.FINAL ? finalStat : value, line: forecast.line, stale, hasRow: Boolean(liveRow) }),
    landmarks: binary ? null : railLandmarks({ line: forecast.line, gtp: forecast.modelValue, high: forecast.modelHigh, live: gamePhase === GAME_PHASE.FINAL ? finalStat : value }),
  };
}

/**
 * The words a reader sees. Factual measurement language only — "currently", "last known",
 * "grading pending". No HIT, MISS, WIN, LOSS or CASHED is reachable from this function.
 */
export function statusFor({ rail, binary, gamePhase, feed, value, line, stale, hasRow = true }) {
  const R = RAIL_STATE;
  if (gamePhase === GAME_PHASE.PRE) return rail === R.PRE_GAME_SNAPSHOT_MISSING ? "Pregame snapshot missing" : "Starts at kickoff";
  if (gamePhase === GAME_PHASE.FINAL) {
    if (binary) return value !== null && value >= 1 ? "Final · touchdown scored · grading pending" : "Final · no TD recorded · grading pending";
    return value === null ? "Final · grading pending · no measurement yet" : "Final · grading pending";
  }
  if (feed === FEED.UNAVAILABLE && value === null) return "Live tracking temporarily unavailable";
  /* ⚠ "No TD yet" is a claim. It needs a record that actually carries this player's row — before any
     record has been read, or when the record omits the row, there is no evidence either way. */
  if (value === null && (feed !== FEED.OK || !hasRow)) return "Awaiting first measurement";
  if (binary) {
    const td = value !== null && value >= 1 ? "touchdown scored" : "no TD yet";
    return stale ? `Last known · ${td}` : td[0].toUpperCase() + td.slice(1);
  }
  if (value === null) return "Awaiting first measurement";
  const side = line === null ? null : value > line ? "above line" : value < line ? "below line" : "at line";
  if (stale) return side ? `Last known · ${side}` : "Last known state";
  switch (rail) {
    case R.CURRENTLY_ABOVE_LINE: return "Currently above line";
    case R.CURRENTLY_BELOW_LINE: return "Currently below line";
    case R.CURRENTLY_AT_LINE: return "Currently at line";
    case R.CURRENTLY_ABOVE_RANGE: return "Currently above pregame range";
    case R.CURRENTLY_INSIDE_RANGE: return "Currently inside pregame range";
    case R.CURRENTLY_BELOW_RANGE: return "Currently below pregame range";
    default: return "Awaiting first measurement";
  }
}

/**
 * Rail positions as percentages of a scale built from FROZEN numbers only — the line, the GTP median
 * and the model's own 90th percentile, plus headroom. LINE and GTP are landmarks: a live value can
 * move the dot, and can run off the end (`liveOverflow`), but it can never move the scale and so can
 * never move a landmark.
 */
export function railLandmarks({ line = null, gtp = null, high = null, live = null, headroom = 0.2 }) {
  const frozen = [line, gtp, high].map(num).filter((v) => v !== null && v >= 0);
  if (!frozen.length) return null;
  const max = Math.max(...frozen) * (1 + headroom) || 1;
  const pct = (v) => (num(v) === null ? null : Math.max(0, Math.min(100, (v / max) * 100)));
  const liveN = num(live);
  return {
    max,
    line: pct(line),
    gtp: pct(gtp),
    live: liveN === null ? null : pct(liveN),
    liveOverflow: liveN !== null && liveN > max,
  };
}
