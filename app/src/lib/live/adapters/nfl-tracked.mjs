/**
 * THE NFL ADAPTER for the sport-neutral tracked-prediction contract (§6, §7).
 *
 * It owns exactly the parts that are NFL's: which published families a live feed can actually
 * measure, how a market behaves over a game, and how a board row's frozen side is read. The shape,
 * the rail rules and the §5.2 settlement boundary live in `tracked-prediction.mjs` and are not
 * restated here — that is the point of the split.
 *
 * ── WHY THE FROZEN SIDE IS READ FROM THE BOARD AND NOT FROM `joinNflPlayerBoard` ────────────────
 *
 * The join is excellent at the thing it was built for — attaching a live box-score value to a
 * forecast by canonical id — and it deliberately projects the forecast down to a narrow shape:
 * `rangeLow`, `rangeHigh`, `position`. Two things §5.1 requires do not survive that projection, and
 * both were measured on a real Sunday board (401872960, BAL @ DAL, 34 rows) on 2026-09-26:
 *
 *   · the MEDIAN. `tracked-forecast.mjs` reads `j.median`; the join emits no such field. Every one
 *     of those 34 rows carried `frozenProjection: null` — the model's central estimate, absent from
 *     a row whose entire purpose is to show it beside a live number.
 *
 *   · the FROZEN SPORTSBOOK BLOCK. `player.markets[family].market` holds
 *     `{ line, overOdds, underOdds, sportsbook, capturedAt }` — a real DraftKings line captured at
 *     16:49:46Z against a 20:25Z Sunday kickoff. The join drops it whole.
 *
 * ⚠ AND THE PREMISE THAT MADE THAT LOOK CORRECT IS OUT OF DATE. `tracked-forecast.mjs` states
 * "GameTime buys no NFL player-prop lines (props are out of the NFL odds receipt's scope), so
 * `frozenLine` stays null". That was true when it was written. NFL prop pricing has since been
 * authorised and captured, and the boards carry it. A comment that was true once is how a real line
 * goes on sitting in an artifact while every consumer is told there is none.
 *
 * So the adapter reads the board for the frozen side and the join for the live side, which is also
 * the honest division of labour: the frozen side is this sport's artifact to parse.
 *
 * ── HOW MANY NFL FAMILIES ARE LIVE-TRACKABLE, MEASURED RATHER THAN ASSUMED ─────────────────────
 *
 * The Sunday boards publish FOUR trackable-looking families. **Three are live-measurable.**
 * `anytime_td` is published, its model is validated (and it is one of the few families that carries
 * a real GameTimePicks `probability`), and it is NOT live-measurable, for a reason `espn-nfl.mjs`
 * verified against a real payload: a player's touchdowns are spread across six overlapping box-score
 * columns — a pick-six is counted by both `defensive` and `interceptions`, and `passing:TD` is
 * thrown, not scored — and the event-level fix does not exist either, because
 * `scoringPlays[].athletesInvolved` is EMPTY and the plays carry only prose. Resolving a scorer from
 * that means matching a name, which is the one thing the live join exists to avoid.
 *
 * ⚠ SO IT GETS A ROW, AND THE ROW SAYS SO. `tracked-forecast.mjs` drops an untrackable family
 * entirely, and for an ESTIMATE or STOP family that is right — putting a rejected model on screen
 * beside a live number reads as the market returning. `anytime_td` is the OTHER case: the prediction
 * is published and a reader is following it, so silently dropping it answers "where did my touchdown
 * prediction go?" with nothing. It is emitted as MARKET_UNSUPPORTED — present, explicitly not
 * live-measurable, never a zero, because "no feed can see this" and "he has not scored" are
 * different facts and this product is the one that keeps them apart.
 */
import {
  MARKET_KIND,
  MEASUREMENT_STATES,
  FINALITY,
  SETTLEMENT_STATUS,
  NFL_TRACKING_STATE_TO_MEASUREMENT,
  makeTrackedPrediction,
  registerSportAdapter,
} from "../tracked-prediction.mjs";
import { buildLiveTrackedForecasts } from "../tracked-forecast.mjs";
import { COMPARABLE_NFL_MARKETS } from "../forecast-join.mjs";
import { familyStateOf } from "../../sports/nfl/lifecycle-trace.mjs";

/** Published NFL families a live feed can state BY PLAYER IDENTITY. Verified, not assumed. */
export const LIVE_MEASURABLE_NFL_MARKETS = Object.freeze([...COMPARABLE_NFL_MARKETS]);

/** Published families that are NOT live-measurable, each with the reason the UI should show. */
export const PUBLISHED_NOT_LIVE_MEASURABLE = Object.freeze({
  anytime_td: "no feed states the scorer by id — the box-score columns overlap and the scoring plays carry only prose",
});

export function nflMarketKind(family) {
  return family === "anytime_td" ? MARKET_KIND.BINARY : MARKET_KIND.ADDITIVE;
}

/** Provider FINAL is not settlement — the distinction `lifecycle.mjs` owns, restated in this shape. */
function finalityOf(gameState, settlement) {
  if (settlement?.canonical === true || settlement?.canonicalAt) return FINALITY.FINAL_CANONICAL;
  if (gameState === "FINAL" || gameState === "FINAL_PENDING_SETTLEMENT") return FINALITY.FINAL_PROVISIONAL;
  return FINALITY.NOT_FINAL;
}

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/**
 * The frozen side of one (player, family), read from the board itself.
 *
 * ⚠ `capturedAt` comes from the MARKET block, because that is the instant we can actually prove
 * something about — the board's own `generatedAt` is when we wrote the file, not when the price was
 * observed. Where there is no market block there is no capture to claim, and the field stays null
 * rather than borrowing the board's timestamp to look complete.
 */
export function frozenSideOf(board, player, family) {
  const p = player?.markets?.[family];
  if (!p) return null;
  const mk = p.market ?? null;
  return {
    modelPrediction: num(p.median) ?? num(p.probability),
    modelRange: { low: num(p.p10), high: num(p.p90) },
    /* Only `anytime_td` publishes a calibrated probability today; the yards/receptions families
       publish a distribution and no probability mapping, and §13 says record that rather than
       invent one. `num()` returns null for the families that have none. */
    modelProbability: num(p.probability),
    modelState: familyStateOf(board?.families?.[family]),
    sportsbook: mk?.sportsbook ?? null,
    line: num(mk?.line),
    overPrice: num(mk?.overOdds) ?? num(mk?.yesOdds),
    underPrice: num(mk?.underOdds) ?? num(mk?.noOdds),
    capturedAt: mk?.capturedAt ?? null,
    provenance: board?.generatedAt ?? null,
  };
}

/**
 * Rows for one NFL event, in the canonical shape.
 *
 * @param {object} ctx  `{ board, envelope, joined, settlement, nowMs }` — the same inputs
 *                      `buildLiveTrackedForecasts` takes, whose live-side reasoning is reused whole.
 */
export function nflTrackedRows(ctx) {
  const { board, envelope = null, settlement = null } = ctx;
  const { rows: liveRows, gameState } = buildLiveTrackedForecasts(ctx);
  const finality = finalityOf(gameState, settlement);
  const playerById = new Map((board?.players ?? []).map((p) => [p.playerId, p]));

  const out = liveRows.map((r) => {
    const frozen = frozenSideOf(board, playerById.get(r.entityId), r.market) ?? {};
    return makeTrackedPrediction({
      sport: "nfl",
      eventId: r.gameId,
      participantId: r.entityId,
      participantName: playerById.get(r.entityId)?.name ?? null,
      participantType: r.entityType ?? "PLAYER",
      marketFamily: r.market,
      marketKind: nflMarketKind(r.market),
      label: r.label,
      pregame: { ...frozen, capturedAt: frozen.capturedAt ?? r.publishedAt },
      live: {
        measurementState: NFL_TRACKING_STATE_TO_MEASUREMENT[r.trackingState] ?? MEASUREMENT_STATES.NO_MEASUREMENT,
        currentValue: r.currentValue,
        eventState: r.gameState,
        periodState: r.period,
        clock: r.clock,
        provider: r.source,
        observedAt: r.updatedAt,
      },
      final: { finality, actualValue: r.finalValue },
      settlement: { status: r.settlementStatus ?? SETTLEMENT_STATUS.PENDING },
    });
  });

  /* The published-but-unmeasurable families, one row per player the board projected. */
  for (const [family, reason] of Object.entries(PUBLISHED_NOT_LIVE_MEASURABLE)) {
    if (familyStateOf(board?.families?.[family]) !== "PUBLISHED") continue;
    for (const player of board?.players ?? []) {
      const frozen = frozenSideOf(board, player, family);
      if (!frozen) continue;
      out.push(makeTrackedPrediction({
        sport: "nfl",
        eventId: board?.providerEventId ?? null,
        participantId: player.playerId ?? null,
        participantName: player.name ?? null,
        marketFamily: family,
        marketKind: nflMarketKind(family),
        label: board?.families?.[family]?.label ?? family,
        pregame: { ...frozen, provenance: reason },
        /* ⚠ MARKET_UNSUPPORTED, and the contract drops `currentValue` whatever is passed.
           "No feed can see this" must never render as "he has not scored". */
        live: {
          measurementState: MEASUREMENT_STATES.MARKET_UNSUPPORTED,
          currentValue: null,
          eventState: gameState,
          provider: envelope?.provider ?? null,
        },
        final: { finality },
        settlement: { status: SETTLEMENT_STATUS.PENDING },
      }));
    }
  }

  return out;
}

export const NFL_TRACKED_ADAPTER = registerSportAdapter({
  sport: "nfl",
  marketKind: nflMarketKind,
  rows: nflTrackedRows,
});
