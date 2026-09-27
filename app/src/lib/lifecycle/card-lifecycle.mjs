/**
 * THE SHARED CARD / EVENT LIFECYCLE (§8) — one vocabulary, and one rule about money.
 *
 * 🔴 THE DEFECT THIS EXISTS FOR, reproduced verbatim in `results/trust-center.tsx`:
 *
 *     settlement && (settlement.status === "none" || settlement.realizedPnl === 0)
 *       ? " · no card settled (no-play day)"
 *
 * `realizedPnl === 0` is true on a day with THREE published paper cards that have not settled yet —
 * `placed-lanes.mjs` emits `{ status: "pending", realizedPnl: 0 }` precisely when cards ARE live. So
 * /results printed "no-play day" over a slate carrying real published exposure, which is the
 * external review's finding and §8's own instruction: do not use NO_PLAY to mean "nothing settled
 * yet."
 *
 * ── THE RULE THAT MAKES IT UNREPEATABLE ────────────────────────────────────────────────────────
 *
 * **MONEY IS NOT A LIFECYCLE SIGNAL, so this module cannot see any.** `cardLifecycleOf` takes no
 * P&L, no exposure and no stake — there is no argument to pass one through. Zero realized money is
 * the honest state of at least four different lifecycles:
 *
 *     · no card was ever published
 *     · cards are published and have not started
 *     · cards are live
 *     · cards settled and net exactly zero
 *
 * One number, four meanings. Any code that reads a lifecycle off it is guessing, and it guessed
 * wrong on a public page.
 *
 * ── WHY THIS IS A FOURTH VOCABULARY AND NOT A DUPLICATE ────────────────────────────────────────
 *
 * §8 asks for ONE canonical lifecycle, and the honest answer is that FIVE different subjects each
 * need one. They are not interchangeable, and the boundary is written here because the failure mode
 * is a reader picking whichever name looks closest:
 *
 *   sports/event-lifecycle.mjs   EVENT_STATE       ONE EVENT, from the CLOCK alone (no feed):
 *                                                  UPCOMING / IN_PROGRESS / COMPLETE / UNKNOWN
 *   live/lifecycle.mjs           LIFECYCLE_LABEL   ONE EVENT, from the PROVIDER:
 *                                                  PRE / LIVE / DELAYED / POSTPONED / SETTLED / …
 *   live/tracked-prediction.mjs  RAIL_STATE        ONE PREDICTION ROW, against a line or a band
 *   lifecycle/card-lifecycle.mjs CARD_LIFECYCLE    A DATE or CARD, by PUBLICATION and SETTLEMENT
 *   products/lifecycle.mjs       CARD              A LADDER CARD'S GRADED OUTCOME: won/lost/void/pending
 *
 * ⚠ THE LAST TWO ARE ONE CHARACTER-CLASS APART AND BOTH HAVE A VOID. `CARD` says what HAPPENED;
 * `CARD_LIFECYCLE` says HOW FAR ALONG. A card is legitimately CARD_LIFECYCLE.SETTLED and CARD.LOST at
 * the same time. Crossing them would let a pending ladder read as an unpublished day — the very
 * conflation §8 filed.
 *
 * `vocabulary-registry.test.mjs` pins that set as CLOSED: a fifth frozen state-map cannot appear
 * under a lifecycle name without declaring its subject, which is how four became four rather than
 * one plus drift.
 *
 * ⚠ THIS MODULE KNOWS NOTHING ABOUT ONE EVENT'S CLOCK. It counts cards. The `live` count it accepts
 * is supplied BY a caller that consulted one of the event vocabularies above — see
 * `eventStateObserved`.
 *
 * COUNTS, NOT FLAGS. The derivation is driven by how many cards are in each condition, because
 * "published" and "settled" are not mutually exclusive on a real slate: a day can have two cards
 * graded and one still live, and a single status string cannot say so.
 */

export const CARD_LIFECYCLE = Object.freeze({
  /** Nothing was published. The ONLY state that may be called a no-play day. */
  NO_CARD_PUBLISHED: "NO_CARD_PUBLISHED",
  /** Published and not yet started. */
  PUBLISHED_PRE: "PUBLISHED_PRE",
  /** At least one card has a started event. */
  LIVE: "LIVE",
  /** Every event is over by a provider, and we have not graded it. NOT a result. */
  FINAL_AWAITING_SETTLEMENT: "FINAL_AWAITING_SETTLEMENT",
  /** Every event is final by official record; grading may still be running. */
  FINAL_CANONICAL: "FINAL_CANONICAL",
  /** Graded from official results. The only state a win/loss may be spoken from. */
  SETTLED: "SETTLED",
  /** Published, then voided — a scratch, a postponement, a pulled market. Not a loss and not a no-play. */
  VOID: "VOID",
  /**
   * ⚠ PUBLISHED, UNSETTLED, AND WE HAVE NOT LOOKED AT THE EVENTS. Not in §8's minimum list, and
   * added because the alternative is a second false claim: the daily-portfolio lanes carry only
   * "active" vs settled, with no event state, so calling an active lane PUBLISHED_PRE would assert
   * "not started" about a card that may well be in progress. Unknown is not "not started", exactly
   * as unknown is not "up to date". A caller that HAS observed the events passes the counts and
   * never sees this state.
   */
  PUBLISHED_UNSETTLED: "PUBLISHED_UNSETTLED",
});

/**
 * ⚠ THE PHRASE IS RESERVED TO EXACTLY ONE STATE. Every other lifecycle has published cards behind
 * it, so calling any of them a no-play day asserts an absence that is not there.
 */
export function mayBeCalledNoPlay(lifecycle) {
  return lifecycle === CARD_LIFECYCLE.NO_CARD_PUBLISHED;
}

/**
 * Reader-facing phrase per state. Kept beside the states so a new state cannot ship unworded.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const LIFECYCLE_PHRASE = Object.freeze({
  [CARD_LIFECYCLE.NO_CARD_PUBLISHED]: "no card published (no-play day)",
  [CARD_LIFECYCLE.PUBLISHED_PRE]: "published · not started",
  [CARD_LIFECYCLE.LIVE]: "live",
  [CARD_LIFECYCLE.FINAL_AWAITING_SETTLEMENT]: "final · awaiting settlement",
  [CARD_LIFECYCLE.FINAL_CANONICAL]: "final · grading",
  [CARD_LIFECYCLE.SETTLED]: "settled",
  [CARD_LIFECYCLE.VOID]: "void · no action",
  [CARD_LIFECYCLE.PUBLISHED_UNSETTLED]: "published · not settled",
});

const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/**
 * Derive the lifecycle of a date, or of one card's event set, from COUNTS.
 *
 * @param published  how many cards were published for this date
 * @param settled    how many are graded from official results
 * @param voided     how many were voided (scratch / postponement / pulled market)
 * @param live       how many have a started, unfinished event
 * @param providerFinal  how many are over per a provider but not officially confirmed
 * @param officialFinal  how many are final per the official record but not yet graded
 * @param eventStateObserved  whether the caller actually looked at event state. REQUIRED to be true
 *        before PUBLISHED_PRE or LIVE can be claimed — see PUBLISHED_UNSETTLED.
 *
 * ⚠ There is no `realizedPnl` parameter, and adding one would be the bug. See the header.
 */
export function cardLifecycleOf({ published = NaN, settled = 0, voided = 0, live = 0, providerFinal = 0, officialFinal = 0, eventStateObserved = false } = {}) {
  /*
   * ⚠ OMITTING `published` THROWS RATHER THAN DEFAULTING TO ZERO. A zero default would make the
   * most dangerous answer — "no card published, a no-play day" — also the easiest one to get by
   * accident, which is the shape of the bug this module replaces. The `NaN` default exists only so
   * TypeScript infers `number` for this property across the .mjs boundary — and NaN is not finite,
   * so it lands on the refusal below rather than on a count.
   */
  if (!Number.isFinite(published) || published < 0) {
    throw new Error("cardLifecycleOf: `published` is required and must be a count — a missing count is not zero cards (§8)");
  }
  const p = n(published);

  /*
   * ⚠ THE ONE STRUCTURAL REFUSAL. Nothing published ⇒ no-play, and anything published ⇒ NEVER
   * no-play, whatever the other counts say. This is the line the old condition did not have.
   */
  if (p === 0) return CARD_LIFECYCLE.NO_CARD_PUBLISHED;

  const s = n(settled), v = n(voided), l = n(live), pf = n(providerFinal), of_ = n(officialFinal);

  /* A mixed slate reports the LEAST resolved state that still has cards in it, because the headline
     must not claim a resolution the whole slate has not reached. Live outranks final; unsettled
     outranks settled. */
  if (l > 0) return CARD_LIFECYCLE.LIVE;
  if (of_ > 0) return CARD_LIFECYCLE.FINAL_CANONICAL;
  if (pf > 0) return CARD_LIFECYCLE.FINAL_AWAITING_SETTLEMENT;

  /* Everything accounted for as settled and/or void. */
  if (s + v >= p) {
    /* All void is VOID; any settled card makes the day settled — a void leg leaves the card, and a
       void card is not a loss. */
    return s > 0 ? CARD_LIFECYCLE.SETTLED : CARD_LIFECYCLE.VOID;
  }

  /*
   * ⚠ THE RESIDUAL IS NEVER NO_CARD_PUBLISHED. Cards exist and none is live, final, settled or void.
   * This is the exact slate that printed "no-play day" because its realized P&L was zero.
   *
   * Which of the two unsettled states it is depends on whether the caller LOOKED. "Not started" is a
   * claim about the events; a caller that never read them says only "not settled".
   */
  return eventStateObserved ? CARD_LIFECYCLE.PUBLISHED_PRE : CARD_LIFECYCLE.PUBLISHED_UNSETTLED;
}

/**
 * Cross-route coherence (§8): two surfaces describing the same date must not disagree about whether
 * anything was published. Returns the contradictions rather than throwing, so a report can name them.
 */
export function lifecycleContradictions(views) {
  const byDate = new Map();
  for (const v of views ?? []) {
    if (!v?.date) continue;
    if (!byDate.has(v.date)) byDate.set(v.date, []);
    byDate.get(v.date).push(v);
  }
  const out = [];
  for (const [date, vs] of byDate) {
    const claimsNone = vs.filter((v) => v.lifecycle === CARD_LIFECYCLE.NO_CARD_PUBLISHED);
    const claimsSome = vs.filter((v) => v.lifecycle !== CARD_LIFECYCLE.NO_CARD_PUBLISHED);
    if (claimsNone.length && claimsSome.length) {
      out.push({
        date,
        kind: "PUBLISHED_DISAGREEMENT",
        detail: `${claimsNone.map((v) => v.surface).join(", ")} report no card published; ${claimsSome.map((v) => `${v.surface} (${v.lifecycle})`).join(", ")} report otherwise`,
      });
    }
    /* A surface may not claim a settled result for a date another surface still has live. */
    const settledS = vs.filter((v) => v.lifecycle === CARD_LIFECYCLE.SETTLED);
    const liveS = vs.filter((v) => v.lifecycle === CARD_LIFECYCLE.LIVE);
    if (settledS.length && liveS.length) {
      out.push({
        date,
        kind: "SETTLED_WHILE_LIVE",
        detail: `${settledS.map((v) => v.surface).join(", ")} report settled while ${liveS.map((v) => v.surface).join(", ")} report live`,
      });
    }
  }
  return out;
}
