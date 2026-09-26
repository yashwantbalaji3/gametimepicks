/**
 * THE UFC ADAPTER for the sport-neutral tracked-prediction contract (§6, §9).
 *
 * §9 is explicit that UFC "must not be forced into a fake baseball/football shape", and the shape
 * that fits is already in the contract: MARKET_KIND.TERMINAL — a market resolved at the end or not
 * at all. A bout in progress has no partial value, and §9 says what honest live tracking looks like
 * for one: "PREGAME forecast · LIVE — unresolved · current round/time · FINAL result".
 *
 * ── THE THREE PUBLISHED FAMILIES, AND WHY ONLY ONE IS TRACKED END TO END ───────────────────────
 *
 * `card-latest.json` carries `model.publishes: ["winner","method","rounds"]` with all three
 * verdicts PASS, so all three are product-eligible. Their live and final halves are not equal:
 *
 *   winner   the scoreboard states `competitor.winner` against the ESPN athlete id → SETTLEABLE
 *   rounds   `status.period` states the round live and the round it ended in → MEASURABLE, but
 *            this product's UFC settlement contract grades WINNER ONLY, so nothing grades a rounds
 *            result. The row shows the measurement and refuses the outcome.
 *   method   the scoreboard states no KO/SUB/DEC at all, and the summary endpoint errors for these
 *            ids → MARKET_UNSUPPORTED. Forecast and display only.
 *
 * ⚠ PROVIDER FINAL IS NOT SETTLEMENT, AND THAT MATTERS MORE HERE THAN ANYWHERE. A bout result can
 * be overturned — a decision reversed, a no-contest declared on a failed test weeks later. So ESPN
 * `post` yields FINAL_PROVISIONAL, and FINAL_CANONICAL requires a settlement record to be handed in.
 * Nothing in this file can produce a canonical result on its own.
 *
 * ── THE ONE NAME COMPARISON IN THIS FILE, AND WHY IT IS NOT NAME MATCHING ──────────────────────
 *
 * `prediction.winner.name` is a NAME, while the join needs an id. The resolution is an EXACT
 * equality test against the same bout's own `red.name` and `blue.name` — two candidates, one
 * artifact, one producer. That is dereferencing a pointer inside a document, not matching a name
 * across two systems. If neither matches exactly the row is IDENTITY_UNRESOLVED; nothing is
 * normalised, lowercased or fuzzily compared, because the moment it were, this would become the
 * thing `espn-nfl.mjs` refuses to do for anytime touchdown.
 */
import {
  MARKET_KIND,
  MEASUREMENT_STATES,
  FINALITY,
  SETTLEMENT_STATUS,
  makeTrackedPrediction,
  registerSportAdapter,
} from "../tracked-prediction.mjs";

/** The market keys this adapter emits, and what each can actually do. */
export const UFC_FAMILIES = Object.freeze({
  fight_winner: { label: "Fight winner", settleable: true, measurable: true },
  fight_rounds: {
    label: "Rounds", settleable: false, measurable: true,
    ungradedReason: "the round is observable, but this product's UFC settlement contract grades the winner only",
  },
  fight_method: {
    label: "Method", settleable: false, measurable: false,
    unsupportedReason: "the ESPN MMA scoreboard states no KO/SUB/DEC, and inferring one from prose is the name-matching the live join refuses",
  },
});

/** ESPN bout state → the contract's finality. `post` is PROVISIONAL; canonical must be handed in. */
function finalityOf(bout, settlement) {
  if (settlement?.canonical === true || settlement?.canonicalAt) return FINALITY.FINAL_CANONICAL;
  if (bout?.state === "FINAL") return FINALITY.FINAL_PROVISIONAL;
  return FINALITY.NOT_FINAL;
}

/**
 * The predicted winner's ESPN athlete id — by exact equality against this bout's own two names.
 * Returns null rather than a guess, which the caller turns into IDENTITY_UNRESOLVED.
 */
export function predictedWinnerAthleteId(cardBout) {
  const name = cardBout?.prediction?.winner?.name;
  if (typeof name !== "string" || !name) return null;
  for (const corner of ["red", "blue"]) {
    const c = cardBout?.[corner];
    if (c?.name === name && c?.athleteId) return String(c.athleteId);
  }
  return null;
}

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/**
 * Tracked predictions for one card.
 *
 * @param {object} ctx
 * @param {object} ctx.card       `card-latest.json`
 * @param {object[]} ctx.bouts    normalised bouts from `espn-mma.mjs` (may be empty before the card)
 * @param {object|null} ctx.settlement  keyed by boutId, when a canonical settlement exists
 */
export function ufcTrackedRows({ card, bouts = [], settlement = null }) {
  const byBoutId = new Map(bouts.map((b) => [String(b.boutId), b]));
  const publishes = new Set(card?.model?.publishes ?? []);
  const verdicts = card?.model?.verdicts ?? {};
  const out = [];

  for (const cb of card?.bouts ?? []) {
    /* ⚠ A BOUT THE MODEL COULD NOT READ HAS NO FORECAST, so it contributes no tracked prediction.
       Emitting a row would put an empty pregame block on a card and invite a reader to follow a
       prediction that was never made — `UNKNOWN is not ACTIVE`. Two of twelve bouts on the current
       card are in this state ("neither fighter has enough UFC history"). */
    if (cb?.unmodelledReason || !cb?.prediction) continue;

    const bout = byBoutId.get(String(cb.boutId)) ?? null;
    const finality = finalityOf(bout, settlement?.[String(cb.boutId)]);
    const boutSettlement = settlement?.[String(cb.boutId)] ?? null;
    const winnerId = predictedWinnerAthleteId(cb);
    const opponent = cb.red?.athleteId === winnerId ? cb.blue : cb.red;

    for (const [family, spec] of Object.entries(UFC_FAMILIES)) {
      const modelFamily = family === "fight_winner" ? "winner" : family === "fight_method" ? "method" : "rounds";
      if (!publishes.has(modelFamily)) continue;
      const verdict = verdicts[modelFamily === "rounds" ? "round" : modelFamily] ?? null;

      out.push(makeTrackedPrediction({
        sport: "ufc",
        eventId: String(cb.boutId),          // ⚠ the BOUT is the event unit, never the card
        participantId: winnerId,
        participantName: cb.prediction?.winner?.name ?? null,
        participantType: "FIGHTER",
        marketFamily: family,
        marketKind: MARKET_KIND.TERMINAL,
        label: `${spec.label}${opponent?.name ? ` vs ${opponent.name}` : ""}`,
        pregame: {
          modelPrediction: family === "fight_winner" ? num(cb.prediction?.winner?.probability)
            : family === "fight_method" ? null : null,
          /* The model's OWN probability, which UFC actually has and which §13 asks products to
             record. Only the winner family has a single scalar; method and rounds publish
             distributions, and a distribution is not a probability for "this leg". */
          modelProbability: family === "fight_winner" ? num(cb.prediction?.winner?.probability) : null,
          modelVersion: card?.model?.id ?? null,
          modelState: verdict,
          /* No purchased UFC price is in scope here, so there is no line and no book. Null, not 0. */
          line: null,
          capturedAt: card?.generatedAt ?? null,
          provenance: spec.measurable ? null : spec.unsupportedReason,
        },
        live: {
          measurementState: !spec.measurable
            ? MEASUREMENT_STATES.MARKET_UNSUPPORTED
            : !winnerId
              ? MEASUREMENT_STATES.IDENTITY_UNRESOLVED
              : !bout
                ? MEASUREMENT_STATES.NO_MEASUREMENT
                : bout.state === "PRE"
                  ? MEASUREMENT_STATES.AWAITING_EVENT
                  : bout.state === "POSTPONED" || bout.state === "CANCELLED"
                    ? MEASUREMENT_STATES.EVENT_NOT_TRACKABLE
                    : MEASUREMENT_STATES.MEASURED,
          /* There is no partial value in a terminal market; the round is the live fact and it
             travels in periodState, where the rail renders it. */
          currentValue: null,
          eventState: bout?.state ?? null,
          periodState: bout?.round != null ? `R${bout.round}` : null,
          clock: bout?.clock ?? null,
          provider: bout?.provider ?? null,
          observedAt: bout?.fetchedAt ?? null,
        },
        final: {
          finality,
          actualValue: null,
          firstFinalObservedAt: bout?.state === "FINAL" ? bout.fetchedAt : null,
          canonicalAt: boutSettlement?.canonicalAt ?? null,
        },
        settlement: {
          /* ⚠ ONLY the winner family may carry a graded result, and only from a settlement record.
             `bout.winnerAthleteId` is the provider's word and is deliberately NOT read here. */
          forecastResult: family === "fight_winner" ? (boutSettlement?.forecastResult ?? null) : null,
          status: family === "fight_winner"
            ? (boutSettlement?.status ?? SETTLEMENT_STATUS.PENDING)
            : finality === FINALITY.FINAL_CANONICAL ? SETTLEMENT_STATUS.UNGRADED : SETTLEMENT_STATUS.PENDING,
          bookRuleKnown: false,
        },
      }));
    }
  }
  return out;
}

export const UFC_TRACKED_ADAPTER = registerSportAdapter({
  sport: "ufc",
  marketKind: () => MARKET_KIND.TERMINAL,
  rows: ufcTrackedRows,
});
