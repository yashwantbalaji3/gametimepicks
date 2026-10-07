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
    /* Model detail — both already in the frozen record; shown only as what they are. */
    marketCapturedAt: typeof row?.frozen?.market?.capturedAt === "string" ? row.frozen.market.capturedAt : null,
    familyState: typeof row.familyState === "string" ? row.familyState : null,
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

/** The game's lifecycle, as the card knows it. UNKNOWN makes no claim about the present at all. */
export const GAME_PHASE = Object.freeze({ PRE: "PRE", LIVE: "LIVE", FINAL: "FINAL", UNKNOWN: "UNKNOWN", NOT_PLAYED: "NOT_PLAYED" });

/**
 * The lifecycle owner's presentation state (`lifecycle.mjs` LIFECYCLE_STATES) → the tracker's phase.
 * An EXPLICIT table. ⚠ The first version defaulted every unrecognised state to LIVE, so during a gateway
 * outage — when the lifecycle honestly says UNKNOWN — a game that had not kicked off was told
 * "live tracking temporarily unavailable" and its record was fetched. Unknown is not live.
 */
const LIFECYCLE_TO_PHASE = Object.freeze({
  PRE: "PRE",
  LIVE: "LIVE",
  DELAYED: "LIVE",
  FINAL_PENDING_SETTLEMENT: "FINAL",
  SETTLED: "FINAL",
  POSTPONED: "NOT_PLAYED",
  CANCELLED: "NOT_PLAYED",
  UNKNOWN: "UNKNOWN",
});
/** @param {string} state @returns {"PRE" | "LIVE" | "FINAL" | "UNKNOWN" | "NOT_PLAYED"} */
export function gamePhaseForLifecycle(state) {
  return Object.hasOwn(LIFECYCLE_TO_PHASE, state) ? LIFECYCLE_TO_PHASE[state] : "UNKNOWN";
}

/** Whether we hold a live-props record for this game at all. */
export const FEED = Object.freeze({ OK: "OK", UNAVAILABLE: "UNAVAILABLE", NOT_ASKED: "NOT_ASKED" });

/**
 * THE SETTLEMENT OWNER'S OWN VOCABULARY (`settle()` in live-prop-state.mjs). Rendered VERBATIM — never
 * mapped onto another vocabulary. In particular WIN is not translated to HIT: `tracked-prediction.mjs`
 * speaks HIT/MISS, this owner speaks WIN/LOSS, and a silent translation would be an invented mapping.
 * A value outside these lists is dropped, not guessed at.
 */
export const OWNER_FORECAST_RESULTS = Object.freeze(["WIN", "LOSS", "PUSH", "NOT_PUBLISHED", "NOT_APPLICABLE"]);
export const OWNER_LINE_RESULTS = Object.freeze(["OVER", "UNDER", "PUSH", "YES", "NO"]);

/**
 * The canonical settlement for one row, or null (founder decision, 2026-09-28).
 *
 *   settlement.finality !== "CANONICAL"   → null: the row stays FINAL · GRADING PENDING
 *   CANONICAL + SETTLED                   → the owner's forecastResult / lineResult / finalStat, as written
 *   CANONICAL + NO_MEASUREMENT            → the owner's no-measurement answer (never a loss)
 *
 * ⚠ NOTHING HERE DERIVES A RESULT. The browser never compares a final stat to a line; it reads what the
 *   settlement owner wrote. A touchdown's forecast is NOT_APPLICABLE by the owner's rule, so a scored
 *   touchdown is a line result (YES), never a forecast win.
 */
export function canonicalSettlementOf(liveRow) {
  const s = liveRow?.settlement;
  if (!s || s.finality !== "CANONICAL") return null;
  if (s.state === "NO_MEASUREMENT") return { state: "NO_MEASUREMENT", forecastResult: null, lineResult: null, finalStat: null };
  if (s.state !== "SETTLED") return null;
  return {
    state: "SETTLED",
    forecastResult: OWNER_FORECAST_RESULTS.includes(s.forecastResult) ? s.forecastResult : null,
    lineResult: OWNER_LINE_RESULTS.includes(s.lineResult) ? s.lineResult : null,
    finalStat: num(s.finalStat),
  };
}

/** The owner's words, lightly humanised (underscores → spaces). Never re-labelled. */
const ownerWord = (v) => v.replace(/_/g, " ").toLowerCase();
export function settledStatusFor(settled) {
  if (!settled) return null;
  if (settled.state === "NO_MEASUREMENT") return "Settled · no measurement";
  const parts = ["Settled"];
  if (settled.forecastResult) parts.push(`forecast ${settled.forecastResult === "WIN" || settled.forecastResult === "LOSS" || settled.forecastResult === "PUSH" ? settled.forecastResult : ownerWord(settled.forecastResult)}`);
  if (settled.lineResult) parts.push(`line ${settled.lineResult}`);
  return parts.join(" · ");
}

/**
 * A live measurement older than this is shown as LAST KNOWN, never as current. Pinned at 120s on its
 * own: it was the gateway's DELAYED bound, which widened to 180s for the scoreboard's cache cycle, and
 * a live-props record has its own (60s) refresh, so it keeps the tighter window.
 */
export const LIVE_STALE_AFTER_MS = 120_000;

/**
 * Join ONE featured forecast to its live-props row and derive what the card may say.
 *
 * ⚠ OUTCOME LANGUAGE COMES ONLY FROM THE SETTLEMENT OWNER. Finality is passed to the rail machine as
 *   FINAL_PROVISIONAL at most, so `railStateOf` cannot return a HIT or a MISS from here. An outcome is
 *   shown only when the row's own settlement is CANONICAL (founder decision 2026-09-28), and then in
 *   the owner's words (`canonicalSettlementOf`) — never derived here from a final stat and a line.
 *
 * `nowMs` may be null (server render): staleness is then unknown rather than guessed, and no age is
 * claimed — the reader's own clock supplies it after hydration.
 */
/**
 * @param {any} forecast
 * @param {{ gamePhase?: "PRE" | "LIVE" | "FINAL" | "UNKNOWN" | "NOT_PLAYED", liveRow?: any, feed?: "OK" | "UNAVAILABLE" | "NOT_ASKED", observedAt?: string | null, nowMs?: number | null }} [ctx]
 */
export function trackForecast(forecast, { gamePhase = GAME_PHASE.PRE, liveRow = null, feed = FEED.NOT_ASKED, observedAt = null, nowMs = null } = {}) {
  const binary = forecast.kind === "PROBABILITY";
  const value = num(liveRow?.live?.statValue);
  const at = liveRow?.live?.observedAt ?? observedAt ?? null;
  const atMs = at ? Date.parse(at) : NaN;
  const ageMs = nowMs !== null && Number.isFinite(atMs) ? Math.max(0, nowMs - atMs) : null;
  const stale = gamePhase === GAME_PHASE.LIVE && ageMs !== null && ageMs > LIVE_STALE_AFTER_MS;

  let measurementState;
  /* Before kickoff — and whenever the game's state is not known — no live number exists to show. */
  if (gamePhase === GAME_PHASE.PRE || gamePhase === GAME_PHASE.UNKNOWN || gamePhase === GAME_PHASE.NOT_PLAYED) measurementState = MEASUREMENT_STATES.AWAITING_EVENT;
  else if (value !== null) measurementState = stale ? MEASUREMENT_STATES.SOURCE_STALE : MEASUREMENT_STATES.MEASURED;
  else measurementState = MEASUREMENT_STATES.NO_MEASUREMENT;

  /* Canonical settlement is read only once the game is over, and only as the owner wrote it. */
  const settled = gamePhase === GAME_PHASE.FINAL ? canonicalSettlementOf(liveRow) : null;
  const finalStat = gamePhase === GAME_PHASE.FINAL ? settled?.finalStat ?? num(liveRow?.settlement?.finalStat) ?? value : null;

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
    liveValue: gamePhase === GAME_PHASE.LIVE || gamePhase === GAME_PHASE.FINAL ? value : null,
    finalStat,
    observedAt: at,
    ageMs,
    stale,
    feed,
    settlement: settled,
    /* Session 6 · the row's short anytime-TD final words come from this, never from its own `>= 1` test. */
    tdFinal: binary ? tdFinalOf({ gamePhase, value: finalStat, measuredAtFinal: measuredAtFinalOf(liveRow, settled) }) : null,
    status: settledStatusFor(settled) ?? statusFor({ rail, binary, gamePhase, feed, value: gamePhase === GAME_PHASE.FINAL ? finalStat : value, line: forecast.line, stale, hasRow: Boolean(liveRow), measuredAtFinal: measuredAtFinalOf(liveRow, settled) }),
    landmarks: binary ? null : railLandmarks({ line: forecast.line, gtp: forecast.modelValue, high: forecast.modelHigh, live: gamePhase === GAME_PHASE.FINAL ? finalStat : gamePhase === GAME_PHASE.LIVE ? value : null }),
  };
}

/**
 * Session 6 · was the number we hold read AT the final, or earlier? A producer file frozen mid-game (the
 * free capture is dispatch-only) still carries its Q2 value when the game ends: PIT @ CLE 2026-10-01 held
 * TD 0 for two players ESPN's final credits with one each. Only a FINAL-phase observation or an owner-written
 * final stat may support "no TD recorded".
 */
export const TD_FINAL = Object.freeze({ SCORED: "SCORED", NONE_AT_FINAL: "NONE_AT_FINAL", NONE_AT_LAST_READ: "NONE_AT_LAST_READ", NOT_MEASURED: "NOT_MEASURED" });
/** The short words the row shows for each state — the same facts statusFor states in its longer form. */
export const TD_FINAL_WORDS = Object.freeze({ SCORED: "Touchdown scored", NONE_AT_FINAL: "No TD recorded", NONE_AT_LAST_READ: "No TD at last measurement", NOT_MEASURED: "Not measured" });

/** One anytime-TD final state, or null when the game is not over. */
export function tdFinalOf({ gamePhase, value, measuredAtFinal }) {
  if (gamePhase !== GAME_PHASE.FINAL) return null;
  if (value !== null && value >= 1) return TD_FINAL.SCORED;
  if (value === null) return TD_FINAL.NOT_MEASURED;
  return measuredAtFinal ? TD_FINAL.NONE_AT_FINAL : TD_FINAL.NONE_AT_LAST_READ;
}

export function measuredAtFinalOf(liveRow, settled = null) {
  if (num(settled?.finalStat) !== null || num(liveRow?.settlement?.finalStat) !== null) return true;
  return String(liveRow?.live?.phase ?? "").toUpperCase() === "FINAL";
}

/**
 * The words a reader sees. Factual measurement language only — "currently", "last known",
 * "grading pending". No HIT, MISS, WIN, LOSS or CASHED is reachable from this function.
 */
export function statusFor({ rail, binary, gamePhase, feed, value, line, stale, hasRow = true, measuredAtFinal = false }) {
  const R = RAIL_STATE;
  if (gamePhase === GAME_PHASE.PRE) return rail === R.PRE_GAME_SNAPSHOT_MISSING ? "Pregame snapshot missing" : "Starts at kickoff";
  if (gamePhase === GAME_PHASE.UNKNOWN) return "Game status unavailable";
  if (gamePhase === GAME_PHASE.NOT_PLAYED) return "No live tracking for this game";
  if (gamePhase === GAME_PHASE.FINAL) {
    if (binary) {
      /* A touchdown once scored is a fact at any read. "No TD" is a claim about the WHOLE game: it needs a
         measurement taken at the final; an earlier read says only what it saw, and no read says nothing. */
      const td = tdFinalOf({ gamePhase, value, measuredAtFinal });
      return `Final · ${td === TD_FINAL.NOT_MEASURED ? "touchdown not measured" : TD_FINAL_WORDS[td][0].toLowerCase() + TD_FINAL_WORDS[td].slice(1)} · grading pending`;
    }
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

/* ─────────────────────────────  V2D · card-level freshness  ───────────────────────────── */

/**
 * How current the card's live measurements are, in words — or null when there is nothing honest to say.
 *
 *   LIVE, record read, age ≤ window   → "Live measurements · Updated 42s ago"
 *   LIVE, record read, older          → "Last known state · Updated 3m ago"   (values stay visible)
 *   LIVE, record could not be read    → "Live tracking temporarily unavailable"
 *   PRE / UNKNOWN / FINAL / no clock  → null
 *
 * ⚠ HYDRATION-SAFE BY CONSTRUCTION: with `nowMs === null` (the server render, and the first client
 *   render) it returns null, so no build-time age can be baked into the HTML and no reader-clock text
 *   can differ between the server and the browser. Staleness never turns a live game back into PRE,
 *   and a missing record is never presented as a zero.
 *
 * @param {{ gamePhase: string, feed: string, observedAt: string | null, nowMs: number | null }} p
 * @returns {{ kind: "FRESH" | "STALE" | "UNAVAILABLE", text: string } | null}
 */
export function cardFreshness({ gamePhase, feed, observedAt, nowMs }) {
  if (gamePhase !== GAME_PHASE.LIVE || nowMs === null || nowMs === undefined) return null;
  if (feed === FEED.UNAVAILABLE) return { kind: "UNAVAILABLE", text: "Live tracking temporarily unavailable" };
  if (feed !== FEED.OK) return null;
  const t = Date.parse(observedAt ?? "");
  if (!Number.isFinite(t)) return null;
  const age = Math.max(0, nowMs - t);
  const s = Math.round(age / 1000);
  const ago = s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
  return age > LIVE_STALE_AFTER_MS
    ? { kind: "STALE", text: `Last known state · Updated ${ago}` }
    : { kind: "FRESH", text: `Live measurements · Updated ${ago}` };
}
