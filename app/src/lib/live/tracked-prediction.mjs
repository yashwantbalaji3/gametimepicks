/**
 * LiveTrackedPrediction — ONE sport-neutral shape for "how is this prediction doing?" (v1.9 · §6).
 *
 * WHY THIS EXISTS. `tracked-forecast.mjs` already answers the question for NFL, and answers it well:
 * it separates a frozen forecast from a live fact and it names the SEVEN different reasons a row may
 * carry no value. What it cannot do is answer it for MLB or UFC — `sport` is the literal "nfl",
 * trackability is `COMPARABLE_NFL_MARKETS`, and the join is the NFL player board's. §6 forbids the
 * obvious next step ("do not build unrelated NFL, MLB and UFC live products"), so the sport-specific
 * parts move behind an adapter and the shape moves here.
 *
 * FOUR OWNERS, NESTED SO THEY CANNOT BE COLLAPSED. The flat row was convenient and it let a caller
 * write `row.currentValue` beside `row.frozenProjection` with nothing in the type saying they are
 * owned by different systems and settle at different times. Nesting is the enforcement:
 *
 *   pregame     immutable   model-owned        sealed before kickoff, never rewritten
 *   live        ephemeral   provider-owned     rewritten every poll, never authoritative
 *   final       canonical   settlement-owned   written once, corrected only by its owner
 *   settlement  derived     settlement-owned   the only place a WIN or a LOSS may be spelled
 *
 * ⚠ THE RULE THIS MODULE EXISTS TO MAKE UNBREAKABLE (§5.2). A live statistic that has passed a
 * threshold is a FACT, not a win. `railStateOf` cannot return FINAL_WIN, FINAL_LOSS or FINAL_PUSH
 * unless finality is FINAL_CANONICAL — not "probably won", not a green Under that the fourth quarter
 * can still take away. During play the vocabulary is CURRENTLY_ABOVE_LINE / CURRENTLY_BELOW_LINE /
 * CURRENTLY_AT_LINE / RECORDED / NOT_YET_RECORDED / LIVE_UNRESOLVED, every one of which is a
 * statement about a measurement rather than about money.
 *
 * NEVER FABRICATE (§3). Absent is null, never 0. NO_MEASUREMENT is not an Under. A market this
 * product has not published is not trackable because a provider happens to measure it. And nothing
 * here derives a probability: the only arithmetic in this file compares two numbers that are both
 * already public.
 *
 * NO NODE IMPORTS. The gateway and the browser both load this, so it must run in either runtime —
 * the same constraint `contract.mjs` records.
 */

export const TRACKED_PREDICTION_SCHEMA_VERSION = 1;

/**
 * Why this (participant, market) does or does not carry a live measurement.
 *
 * Closed, and every member is a DIFFERENT fact. The NFL vocabulary in `tracked-forecast.mjs` was
 * right and is carried over verbatim in meaning; only the names generalise away from one sport.
 */
export const MEASUREMENT_STATES = Object.freeze({
  MEASURED: "MEASURED",                       // the feed states a value for this participant + market
  AWAITING_EVENT: "AWAITING_EVENT",           // the event has not started; absence is expected
  NO_MEASUREMENT: "NO_MEASUREMENT",           // in play or final, feed carries no row — NOT zero, NOT an Under
  IDENTITY_UNRESOLVED: "IDENTITY_UNRESOLVED", // no canonical participant id to join on
  MARKET_UNSUPPORTED: "MARKET_UNSUPPORTED",   // this product does not publish the family; nothing is emitted
  SOURCE_STALE: "SOURCE_STALE",               // in play, but the observation is older than the live window
  EVENT_NOT_TRACKABLE: "EVENT_NOT_TRACKABLE", // postponed / cancelled — nothing will arrive
});

/** The NFL vocabulary → this one. An explicit table, so no adapter invents a mapping of its own. */
export const NFL_TRACKING_STATE_TO_MEASUREMENT = Object.freeze({
  TRACKING: MEASUREMENT_STATES.MEASURED,
  AWAITING_KICKOFF: MEASUREMENT_STATES.AWAITING_EVENT,
  NO_STAT_YET: MEASUREMENT_STATES.NO_MEASUREMENT,
  IDENTITY_UNRESOLVED: MEASUREMENT_STATES.IDENTITY_UNRESOLVED,
  STAT_UNSUPPORTED: MEASUREMENT_STATES.MARKET_UNSUPPORTED,
  SOURCE_STALE: MEASUREMENT_STATES.SOURCE_STALE,
  GAME_NOT_TRACKABLE: MEASUREMENT_STATES.EVENT_NOT_TRACKABLE,
});

/** A measurement may be SHOWN as a current fact only in these states. */
const VALUE_BEARING = new Set([MEASUREMENT_STATES.MEASURED, MEASUREMENT_STATES.SOURCE_STALE]);

/**
 * How final is this event, for THIS prediction?
 *
 * ⚠ A provider's "Final" is not a settlement — the distinction `lifecycle.mjs` already owns and the
 * one that keeps a corrected box score from silently re-grading a published row.
 */
export const FINALITY = Object.freeze({
  NOT_FINAL: "NOT_FINAL",
  FINAL_PROVISIONAL: "FINAL_PROVISIONAL", // the provider says final; nobody has settled anything
  FINAL_CANONICAL: "FINAL_CANONICAL",     // settlement has spoken; the ONLY state that may show a result
});

/** What the frozen line did, factually. `NO_MEASUREMENT` is its own answer and is never an Under. */
export const LINE_RESULT = Object.freeze(["OVER", "UNDER", "PUSH", "VOID", "NO_MEASUREMENT"]);

/** What GameTimePicks' own forecast did. Separate from the line: we can be right and it still push. */
export const FORECAST_RESULT = Object.freeze(["HIT", "MISS", "PUSH", "VOID", "NO_MEASUREMENT"]);

export const SETTLEMENT_STATUS = Object.freeze({
  PENDING: "PENDING",
  SETTLED: "SETTLED",
  VOID: "VOID",
  NO_ACTION: "NO_ACTION",
  UNGRADED: "UNGRADED", // measurable in principle, but no authoritative measurement arrived
});

/**
 * How a market's numbers behave over an event. The rail's geometry and its live vocabulary both
 * depend on this, and guessing it wrong is how an Under gets a green bar in the third quarter.
 */
export const MARKET_KIND = Object.freeze({
  ADDITIVE: "ADDITIVE", // a non-decreasing count: yards, receptions, strikeouts, hits, total bases
  BINARY: "BINARY",     // 0 or 1+: anytime touchdown, batter home run
  TERMINAL: "TERMINAL", // resolved only at the end: fight winner, method, goes distance
});

/**
 * The display state of one progress rail.
 *
 * ⚠ READ THE THREE GROUPS AS A CONTRACT. The FINAL_ group is unreachable outside FINAL_CANONICAL;
 * `railStateOf` is written so that no combination of live inputs can produce one.
 */
export const RAIL_STATE = Object.freeze({
  // before the event
  PRE: "PRE",
  PRE_GAME_SNAPSHOT_MISSING: "PRE_GAME_SNAPSHOT_MISSING",

  // during the event — factual, never about money
  CURRENTLY_ABOVE_LINE: "CURRENTLY_ABOVE_LINE",
  CURRENTLY_BELOW_LINE: "CURRENTLY_BELOW_LINE",
  CURRENTLY_AT_LINE: "CURRENTLY_AT_LINE",
  /* ⚠ A SEPARATE VOCABULARY, AND THE REASON IS §3. GameTime buys no NFL player-prop lines, so an
     NFL row's frozen side is the model's own p10–p90 BAND and there is no line to be above. Falling
     back to the median and calling it "the line" would fabricate a sportsbook number out of a model
     output — the substitution this product exists to refuse. A band gets band words. */
  CURRENTLY_ABOVE_RANGE: "CURRENTLY_ABOVE_RANGE",
  CURRENTLY_INSIDE_RANGE: "CURRENTLY_INSIDE_RANGE",
  CURRENTLY_BELOW_RANGE: "CURRENTLY_BELOW_RANGE",
  RECORDED: "RECORDED",                 // a binary event has factually happened
  NOT_YET_RECORDED: "NOT_YET_RECORDED", // a binary event has not — and "not yet" is not "no"
  LIVE_UNRESOLVED: "LIVE_UNRESOLVED",   // a TERMINAL market, in play: honest, and the only honest answer
  PROVIDER_DELAY: "PROVIDER_DELAY",
  NO_MEASUREMENT: "NO_MEASUREMENT",
  /* ⚠ DISTINCT FROM NO_MEASUREMENT ON PURPOSE. NO_MEASUREMENT says "we cannot see a value right
     now" — a delay, a missing row, an unresolved identity, all of which may resolve. This says the
     live column will NEVER fill for this market, because no feed states it by identity. The
     prediction is published and real; only its live half does not exist. Collapsing the two tells a
     reader to keep waiting for a number that is not coming. */
  NOT_LIVE_TRACKABLE: "NOT_LIVE_TRACKABLE",

  // after settlement, and only after settlement
  FINAL_WIN: "FINAL_WIN",
  FINAL_LOSS: "FINAL_LOSS",
  FINAL_PUSH: "FINAL_PUSH",
  FINAL_VOID: "FINAL_VOID",
  FINAL_NO_MEASUREMENT: "FINAL_NO_MEASUREMENT",
});

/** Exactly the rail states that assert an outcome. Nothing outside FINAL_CANONICAL may return one. */
export const RESULT_RAIL_STATES = Object.freeze([
  RAIL_STATE.FINAL_WIN,
  RAIL_STATE.FINAL_LOSS,
  RAIL_STATE.FINAL_PUSH,
]);

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/**
 * Build one LiveTrackedPrediction. Every field is explicitly present; anything unstated is null, so
 * "the provider omitted it" and "we chose not to read it" are indistinguishable downstream and
 * NEITHER can be read as zero.
 */
export function makeTrackedPrediction(input) {
  const measurementState = MEASUREMENT_STATES[input.live?.measurementState] ?? MEASUREMENT_STATES.NO_MEASUREMENT;
  const finality = FINALITY[input.final?.finality] ?? FINALITY.NOT_FINAL;
  return {
    schemaVersion: TRACKED_PREDICTION_SCHEMA_VERSION,
    sport: input.sport,
    eventId: input.eventId,
    participantId: input.participantId ?? null,
    participantName: input.participantName ?? null,
    participantType: input.participantType ?? "PLAYER", // PLAYER | TEAM | FIGHTER
    marketFamily: input.marketFamily,
    marketKind: MARKET_KIND[input.marketKind] ?? MARKET_KIND.ADDITIVE,
    label: input.label ?? input.marketFamily,

    /* IMMUTABLE · model-owned. Sealed before the event; nothing below may write here. */
    pregame: {
      modelPrediction: num(input.pregame?.modelPrediction),
      modelRange: {
        low: num(input.pregame?.modelRange?.low),
        high: num(input.pregame?.modelRange?.high),
      },
      /* ⚠ Null unless a VALIDATED probability mapping exists (§13). A market-implied price is not
         this field, and writing one here is the substitution §13 explicitly forbids. */
      modelProbability: num(input.pregame?.modelProbability),
      modelVersion: input.pregame?.modelVersion ?? null,
      modelState: input.pregame?.modelState ?? null,
      sportsbook: input.pregame?.sportsbook ?? null,
      line: num(input.pregame?.line),
      overPrice: num(input.pregame?.overPrice),
      underPrice: num(input.pregame?.underPrice),
      capturedAt: input.pregame?.capturedAt ?? null,
      /* The proof the capture preceded the event. A pregame block that cannot say this is one the
         UI must mark PRE_GAME_SNAPSHOT_MISSING rather than present as frozen. */
      provenance: input.pregame?.provenance ?? null,
    },

    /* EPHEMERAL · provider-owned. Rewritten on every poll, authoritative for nothing. */
    live: {
      measurementState,
      currentValue: VALUE_BEARING.has(measurementState) ? num(input.live?.currentValue) : null,
      eventState: input.live?.eventState ?? null,
      scoreState: input.live?.scoreState ?? null,
      periodState: input.live?.periodState ?? null,
      clock: input.live?.clock ?? null,
      provider: input.live?.provider ?? null,
      observedAt: input.live?.observedAt ?? null,
    },

    /* CANONICAL · settlement-owned. */
    final: {
      finality,
      measurementState: MEASUREMENT_STATES[input.final?.measurementState] ?? null,
      actualValue: num(input.final?.actualValue),
      firstFinalObservedAt: input.final?.firstFinalObservedAt ?? null,
      canonicalAt: input.final?.canonicalAt ?? null,
      correction: input.final?.correction ?? null,
    },

    /* DERIVED · settlement-owned. The only block in which an outcome may be spelled. */
    settlement: {
      lineResult: LINE_RESULT.includes(input.settlement?.lineResult) ? input.settlement.lineResult : null,
      forecastResult: FORECAST_RESULT.includes(input.settlement?.forecastResult) ? input.settlement.forecastResult : null,
      /* Do we know the BOOK's own grading rule for this market? When we do not, we may still state
         the measurement and must not state a settlement. */
      bookRuleKnown: input.settlement?.bookRuleKnown === true,
      status: SETTLEMENT_STATUS[input.settlement?.status] ?? SETTLEMENT_STATUS.PENDING,
    },
  };
}

/**
 * The rail's display state. **The integrity core of §5.2.**
 *
 * Decided in fail-closed order, and deliberately written so the FINAL_ branch is the FIRST thing
 * that can happen and the ONLY thing that reads `settlement`. Every path below it is a statement
 * about a measurement. There is no path on which a live number produces a win.
 *
 * @param {object} p a LiveTrackedPrediction
 * @returns {string} a RAIL_STATE
 */
export function railStateOf(p) {
  const R = RAIL_STATE;
  const M = MEASUREMENT_STATES;

  /* ── 1 · SETTLED, and nowhere else ─────────────────────────────────────────────────────────── */
  if (p.final?.finality === FINALITY.FINAL_CANONICAL) {
    const st = p.settlement?.status;
    if (st === SETTLEMENT_STATUS.VOID || st === SETTLEMENT_STATUS.NO_ACTION) return R.FINAL_VOID;
    if (st === SETTLEMENT_STATUS.UNGRADED) return R.FINAL_NO_MEASUREMENT;
    switch (p.settlement?.forecastResult) {
      case "HIT": return R.FINAL_WIN;
      case "MISS": return R.FINAL_LOSS;
      case "PUSH": return R.FINAL_PUSH;
      case "VOID": return R.FINAL_VOID;
      case "NO_MEASUREMENT": return R.FINAL_NO_MEASUREMENT;
      default:
        /* Canonical, but nothing graded it. That is an honest unknown, not a loss. */
        return R.FINAL_NO_MEASUREMENT;
    }
  }

  /* ── 2 · the event cannot produce a measurement ────────────────────────────────────────────── */
  if (p.live?.measurementState === M.EVENT_NOT_TRACKABLE) return R.FINAL_VOID;
  /* Published, real, and permanently unmeasurable live — before kickoff AND during play. It is
     checked ahead of AWAITING_EVENT because "not trackable" is the more specific truth: a PRE badge
     would promise a live number that never arrives. */
  if (p.live?.measurementState === M.MARKET_UNSUPPORTED) return R.NOT_LIVE_TRACKABLE;
  if (p.live?.measurementState === M.AWAITING_EVENT) {
    /* Before the event, the only thing that can be wrong is the frozen side itself. */
    return hasFrozenProof(p) ? R.PRE : R.PRE_GAME_SNAPSHOT_MISSING;
  }
  if (p.live?.measurementState === M.IDENTITY_UNRESOLVED) return R.NO_MEASUREMENT;
  if (p.live?.measurementState === M.SOURCE_STALE) return R.PROVIDER_DELAY;
  if (p.live?.measurementState === M.NO_MEASUREMENT) {
    /* ⚠ "The feed carries no row" is not "he has zero". For a BINARY market that distinction is the
       whole product: NOT_YET_RECORDED says the event has not been observed to happen, which is what
       an anytime-touchdown feed actually tells us; NO_MEASUREMENT would claim we cannot see. */
    return p.marketKind === MARKET_KIND.BINARY ? R.NOT_YET_RECORDED : R.NO_MEASUREMENT;
  }

  /* ── 3 · in play, with a measurement. Factual vocabulary only. ─────────────────────────────── */
  if (p.marketKind === MARKET_KIND.TERMINAL) return R.LIVE_UNRESOLVED;

  const v = num(p.live?.currentValue);
  if (v === null) return R.NO_MEASUREMENT;

  if (p.marketKind === MARKET_KIND.BINARY) return v >= 1 ? R.RECORDED : R.NOT_YET_RECORDED;

  /* A REAL, PURCHASED line is the only thing that earns the line vocabulary. */
  const line = num(p.pregame?.line);
  if (line !== null) {
    if (v > line) return R.CURRENTLY_ABOVE_LINE;
    if (v < line) return R.CURRENTLY_BELOW_LINE;
    return R.CURRENTLY_AT_LINE;
  }

  /* Otherwise the frozen side is the model's band, and the words say so. */
  const lo = num(p.pregame?.modelRange?.low);
  const hi = num(p.pregame?.modelRange?.high);
  if (lo !== null && hi !== null) {
    if (v > hi) return R.CURRENTLY_ABOVE_RANGE;
    if (v < lo) return R.CURRENTLY_BELOW_RANGE;
    return R.CURRENTLY_INSIDE_RANGE;
  }

  /* No line and no band: there is a measurement but nothing published to compare it against. */
  return R.NO_MEASUREMENT;
}

/** Does the frozen block carry proof it was captured before the event? */
export function hasFrozenProof(p) {
  return Boolean(p?.pregame?.capturedAt) && p?.pregame?.modelPrediction !== null;
}

/** Is this rail state one that asserts an outcome? */
export function isResultState(state) {
  return RESULT_RAIL_STATES.includes(state);
}

/**
 * The rail's geometry — pure arithmetic over two already-public numbers.
 *
 * Returns fractions in [0, 1] for where to draw the frozen target and the current value, plus the
 * raw overflow ratio so a caller can render "beyond the target" honestly rather than clamping it
 * into a bar that looks full at 40 yards and at 400.
 *
 * ⚠ NOT A PREDICTION. Nothing here estimates remaining production, pace or likelihood. A rail that
 * extrapolated would be a forecast wearing a measurement's clothes.
 *
 * @returns {{targetFraction: number, valueFraction: number, ratio: number|null, beyondTarget: boolean}|null}
 */
export function railGeometry({ currentValue, line, marketKind = MARKET_KIND.ADDITIVE, headroom = 0.25 }) {
  /* `line` here is whichever frozen number the rail is drawn against — a purchased line, or a band
     edge the caller chose. It is the CALLER's job to have picked one honestly; this function does
     arithmetic and makes no claim about what the number means. */
  const v = num(currentValue);
  const t = num(line);
  if (marketKind === MARKET_KIND.BINARY) {
    if (v === null) return null;
    return { targetFraction: 1, valueFraction: v >= 1 ? 1 : 0, ratio: v >= 1 ? 1 : 0, beyondTarget: false };
  }
  if (v === null || t === null || t <= 0) return null;

  /* The target sits at 1/(1+headroom) of the rail, so a value that passes it has somewhere to go
     and the bar does not read as "complete" the instant the threshold is crossed. */
  const targetFraction = 1 / (1 + headroom);
  const ratio = v / t;
  const valueFraction = Math.max(0, Math.min(1, ratio * targetFraction));
  return { targetFraction, valueFraction, ratio, beyondTarget: v > t };
}

/**
 * The adapter registry (§6). A sport supplies the parts that are genuinely sport-specific; the shape
 * and every rule above are shared.
 *
 * An adapter is `{ sport, marketKind(family), isTrackable(ctx), rows(ctx) }`. Registration is
 * explicit and a sport with no adapter yields NOTHING rather than a default-shaped guess — EPL plugs
 * in here later (§10) without another architecture.
 */
const ADAPTERS = new Map();

export function registerSportAdapter(adapter) {
  if (!adapter?.sport) throw new Error("a sport adapter must name its sport");
  ADAPTERS.set(adapter.sport, adapter);
  return adapter;
}

export function sportAdapter(sport) {
  return ADAPTERS.get(sport) ?? null;
}

export function registeredSports() {
  return [...ADAPTERS.keys()].sort();
}

/**
 * Build tracked predictions for one event, through the registered adapter.
 *
 * An unregistered sport returns an empty list and says so. It does NOT fall back to another sport's
 * rules — the fallback-is-a-claim defect this repository has now recorded twice.
 */
export function buildTrackedPredictions(sport, ctx) {
  const adapter = sportAdapter(sport);
  if (!adapter) return { rows: [], refused: "SPORT_NOT_REGISTERED", sport };
  const rows = adapter.rows(ctx) ?? [];
  const counts = {};
  for (const r of rows) {
    const k = r.live.measurementState;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return { rows, refused: null, sport, counts };
}
