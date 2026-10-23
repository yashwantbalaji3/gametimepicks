/**
 * NBA · THE ELO RATING'S GAME-WINNER PROBABILITY — a separately identified display (founder decision 2026-10-23). PURE.
 *
 * THE DECISION (quoted): "I approve preparing a separately identified Elo game-winner probability display, provided it
 * is sourced from the existing frozen official forecast, has consistent provenance across pages, and passes the
 * relevant disclosure and integrity checks … Keep existing forecasts and grading immutable."
 *
 * WHAT IT IS. The Elo pHome / pAway that every official v0.1 receipt already froze (`forecast.elo`, the head of the
 * published winner side `nba-winner-side@1`). It is the ELO RATING's probability for the game winner — not a chance from
 * the player model, not a new model, and nothing here recomputes it. Team scores, margin, total, player ranges and
 * markets stay withheld.
 *
 * WHERE IT COMES FROM. Public pages read the public lane file (app/public/data/nba/experimental-public/<date>.json);
 * the internal receipts are not a build input. So:
 *   - the lane publisher copies the receipt's two numbers, verbatim, into `elo.winProbability` with their provenance
 *     (laneEloWinProbability) — only while the switch is on, so a slate published before the switch carries nothing;
 *   - every surface reads ONE accessor (eloWinProbabilityOf) over that lane game, which refuses (returns null) unless the
 *     field's provenance is the game's own freeze and receipt and the numbers agree with the published side. A slate
 *     without the field shows nothing; nothing is ever rebuilt, backfilled or republished.
 * Surfaces: the /nba hub cards, the Theater page's Official Forecast panel, the current and dated /nba/projections
 * boards, and the Level A NBA rows — each prints eloWinProbabilityText(view), so the same game reads the same everywhere
 * (elo-win-probability.test.mjs renders all four).
 *
 * Accuracy: not established. Each surface carries eloAccuracyDisclosure (the graded count and the preregistered minimum).
 */

/** THE SWITCH (default OFF; the release owner flips it after acceptance). Off: the publisher writes no field and every
 * surface shows nothing — the lane, the boards and the Theater page are byte-for-byte what they were. */
export const ELO_WIN_PROBABILITY = Object.freeze({
  id: "nba-elo-game-winner-probability@1",
  enabled: false,
  decision: "founder decision 2026-10-23 — a separately identified Elo game-winner probability display",
});

/** The provenance `source` every published field must carry. */
export const ELO_WIN_PROBABILITY_SOURCE = "nba-winner-side@1 Elo";
/** The one name the number is shown under, on every surface. */
export const ELO_WIN_PROBABILITY_LABEL = "Elo rating's game-winner probability";
/** The lane's `elo.source` sentence for a slate that carries the field (a slate without it keeps its frozen sentence). */
export const ELO_SOURCE_WITH_PROBABILITY = "Elo team rating — the published winner side (founder N2) and its game-winner probability (founder decision 2026-10-23)";

const isP = (x) => typeof x === "number" && Number.isFinite(x) && x > 0 && x < 1;
/** The receipt stores both numbers at 4 dp; they must be complements (allowing the rounding of each). */
const COMPLEMENT_TOLERANCE = 1e-4 + 1e-12;

/**
 * PUBLISHER: the field for one lane game, copied verbatim from its receipt — or null when the receipt has no usable Elo
 * head (then nothing is published for that game). Pure.
 * @param forecast the receipt's `forecast` (its `elo` and `sideRule`)
 * @param receipt  the receipt itself (`generatedAt`, `payloadSha256`)
 */
export function laneEloWinProbability(forecast, receipt) {
  const e = forecast?.elo;
  if (!isP(e?.pHome) || !isP(e?.pAway) || Math.abs(e.pHome + e.pAway - 1) > COMPLEMENT_TOLERANCE) return null;
  if (typeof receipt?.generatedAt !== "string" || typeof receipt?.payloadSha256 !== "string") return null;
  return {
    home: e.pHome,
    away: e.pAway,
    provenance: {
      source: ELO_WIN_PROBABILITY_SOURCE,
      rule: forecast?.sideRule?.id ?? null,
      field: "forecast.elo.pHome / forecast.elo.pAway",
      frozenAt: receipt.generatedAt,
      receiptPayloadSha256: receipt.payloadSha256,
    },
  };
}

/** Whole-percent display. The away figure is 100 − home so the pair always reads as 100 % (each is the receipt's number
 * rounded; never an extreme 0 % / 100 % — those print as "<1" / ">99"). */
function pctPair(home) {
  const h = Math.round(home * 100);
  const show = (v) => (v < 1 ? "<1" : v > 99 ? ">99" : String(v));
  return { home: show(h), away: show(100 - h) };
}

/**
 * THE ONE ACCESSOR. A lane game → the view every surface prints, or null (show nothing). Refuses when the switch is off,
 * the field is missing, its provenance is not this game's own freeze and receipt, or the numbers disagree with the
 * published side (FAVOURED home ⇔ pHome > 0.5; TOO_CLOSE ⇔ exactly 0.5). Pure.
 * @param game  a lane snapshot game (experimental-public-lane.mjs)
 * @param ctx   { enabled?: boolean } — defaults to the switch
 */
export function eloWinProbabilityOf(game, { enabled = ELO_WIN_PROBABILITY.enabled } = {}) {
  if (!enabled || !game) return null;
  const w = game.elo?.winProbability;
  if (!w || !isP(w.home) || !isP(w.away) || Math.abs(w.home + w.away - 1) > COMPLEMENT_TOLERANCE) return null;
  const p = w.provenance ?? {};
  if (p.source !== ELO_WIN_PROBABILITY_SOURCE || p.frozenAt !== game.frozenAt || p.receiptPayloadSha256 !== game.receipt?.payloadSha256) return null;
  if (p.rule != null && game.elo?.rule != null && p.rule !== game.elo.rule) return null;
  const fav = game.elo?.favoured ?? null;
  const consistent = game.elo?.state === "TOO_CLOSE" ? w.home === 0.5
    : fav != null && fav === game.home?.abbr ? w.home > 0.5
    : fav != null && fav === game.away?.abbr ? w.home < 0.5
    : false;
  if (!consistent) return null;
  const pct = pctPair(w.home);
  return Object.freeze({
    eventId: String(game.providerEventId),
    home: w.home,
    away: w.away,
    homeAbbr: game.home?.abbr ?? "Home",
    awayAbbr: game.away?.abbr ?? "Away",
    homePct: pct.home,
    awayPct: pct.away,
    label: ELO_WIN_PROBABILITY_LABEL,
    provenance: Object.freeze({ ...p }),
  });
}

/** The exact text every surface prints for a view (away first, as every NBA matchup is written). */
export function eloWinProbabilityText(view) {
  return `${ELO_WIN_PROBABILITY_LABEL}: ${view.awayAbbr} ${view.awayPct}% · ${view.homeAbbr} ${view.homePct}%`;
}

/**
 * The accuracy disclosure printed beside the number on every surface (Model Performance, Release D vocabulary).
 * @param graded  regular-season games with a published Elo side and an official final (elo-win-probability-context.mjs)
 * @param minN    the preregistered minimum before any accuracy claim (grader-metrics PREREG.winner.minN)
 */
export function eloAccuracyDisclosure({ graded, minN }) {
  const n = Number.isInteger(graded) && graded >= 0 ? graded : 0;
  return `Model Performance: the Elo rating's game-outcome accuracy is not yet established — ${n} regular-season game${n === 1 ? "" : "s"} graded so far; the preregistration requires ${minN} before any accuracy claim. A rating's probability, not the player model's, and not a betting recommendation.`;
}

/**
 * PUBLISHER RULE: does a rebuild of `date` carry the field? A slate that is ALREADY published keeps exactly what it was
 * published with (its `withheld` names `winProbability` iff it was published without the field), so flipping the switch
 * never makes a published slate "differ" and never rewrites one; only a slate not yet published follows the switch.
 */
export function eloWinProbabilityForPublish(committedDay, { enabled = ELO_WIN_PROBABILITY.enabled } = {}) {
  if (committedDay && typeof committedDay === "object") return !Object.prototype.hasOwnProperty.call(committedDay.withheld ?? {}, "winProbability");
  return Boolean(enabled);
}
