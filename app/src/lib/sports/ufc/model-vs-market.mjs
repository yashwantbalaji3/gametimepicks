/**
 * IS THE UFC MODEL BETTER THAN THE PRICE BESIDE IT?
 *
 * The gate has recorded UFC's calibration as UNPROVEN with the reason "never scored against a no-vig
 * line" since the model shipped. That was true, and it was not the whole story: every ingredient has
 * been on disk the entire time. The model publishes a winner probability per bout, the authorised
 * capture carries both sides' posted prices, and the results corpus records who won. Nothing joined
 * them, so the one question calibration exists to answer had no instrument at all — not a small
 * sample, no instrument.
 *
 * This is the same shape built for EPL: record BOTH probabilities BEFORE the event, grade them
 * against the official result afterwards, and score them on identical bouts.
 *
 * RECORDED PRE-FIGHT, NEVER RE-DERIVED. A comparison assembled after the fact from whatever odds
 * file is on disk compares the model to a price that did not exist when it spoke. The snapshot is
 * written before the card and is immutable.
 *
 * IT DOES NOT DECIDE ANYTHING. It produces two numbers on the same bouts. Whether the model earns a
 * calibration promotion is a separate judgement against preregistered bars, on a sample that does
 * not exist yet — tonight's card is one card.
 */

/** American price → implied probability, vig included. */
export const impliedFromAmerican = (am) => (am > 0 ? 100 / (am + 100) : Math.abs(am) / (Math.abs(am) + 100));

/**
 * De-vig a two-way market by proportional normalisation.
 *
 * Two-way only, deliberately: a fight moneyline has exactly two outcomes, and a function that also
 * accepted three would silently normalise a set it had not been designed for. Returns null when the
 * pair does not look like a real two-way market rather than rescaling nonsense into something that
 * sums to one.
 */
export function deVigTwoWay(americanA, americanB) {
  if (!Number.isFinite(americanA) || !Number.isFinite(americanB)) return null;
  const a = impliedFromAmerican(americanA);
  const b = impliedFromAmerican(americanB);
  const sum = a + b;
  // A real two-way book runs a few points of vig. Outside this the capture is malformed, not sharp.
  if (!(sum > 1.0 && sum < 1.25)) return null;
  return { a: a / sum, b: b / sum, impliedSum: Number(sum.toFixed(6)) };
}

/** Fold a fighter name for joining: strip diacritics, lowercase, letters and spaces only. */
export const foldName = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * The results corpus's own bout key: `YYYY-MM-DD:fighter|fighter`, participants sorted.
 *
 * Date-qualified because that is what makes it rematch-safe — the same two fighters meeting twice
 * are two bouts, and a name-only key would score the second against the first.
 */
export const boutKey = (eventDate, nameA, nameB) =>
  `${String(eventDate).slice(0, 10)}:${[foldName(nameA), foldName(nameB)].sort().join("|")}`;

/**
 * One pre-fight row per bout: what the model said, what the market said, on the same fight.
 *
 * A bout is INCLUDED only when both are available. A missing price is a gap in our capture and a
 * missing read is the model declining — neither is evidence about the other, and scoring a bout with
 * one side absent would put a number where there is none.
 */
export function buildPreFightRows({ card, odds, capturedAt }) {
  const eventDate = card?.event?.slateDate ?? null;
  const startUtc = card?.event?.startUtc ?? null;
  if (!eventDate || !startUtc) return { rows: [], skipped: [{ reason: "the card carries no date or start time" }] };

  // Leakage: a snapshot taken at or after the first bout can already see a result.
  if (Number.isFinite(Date.parse(capturedAt)) && Number.isFinite(Date.parse(startUtc)) && Date.parse(capturedAt) >= Date.parse(startUtc)) {
    return { rows: [], skipped: [{ reason: `captured ${capturedAt} at or after the card started ${startUtc} — refused` }] };
  }

  const priceByBout = new Map();
  for (const b of odds?.bouts ?? []) {
    if (b?.boutId) priceByBout.set(String(b.boutId), b);
  }

  const rows = [];
  const skipped = [];
  for (const b of card?.bouts ?? []) {
    const w = b?.prediction?.winner;
    if (!w?.name || !Number.isFinite(w.probability)) {
      skipped.push({ boutId: b?.boutId ?? null, reason: "the model published no read for this bout" });
      continue;
    }
    const priced = priceByBout.get(String(b.boutId));
    const devig = deVigTwoWay(priced?.red?.price?.american, priced?.blue?.price?.american);
    if (!devig) {
      skipped.push({ boutId: b?.boutId ?? null, reason: "no usable two-way price for this bout" });
      continue;
    }
    // Which side the model picked, so the two probabilities describe the same outcome.
    const pickedRed = foldName(w.name) === foldName(b.red?.name);
    const marketForPick = pickedRed ? devig.a : devig.b;
    rows.push({
      boutId: boutKey(eventDate, b.red?.name, b.blue?.name),
      providerBoutId: String(b.boutId),
      eventDate,
      eventName: card?.event?.name ?? null,
      pick: w.name,
      opponent: pickedRed ? b.blue?.name ?? null : b.red?.name ?? null,
      modelProbability: Number(w.probability.toFixed(6)),
      marketProbability: Number(marketForPick.toFixed(6)),
      impliedSum: devig.impliedSum,
      books: priced?.red?.price?.books ?? null,
      modelId: card?.model?.id ?? null,
    });
  }
  return { rows, skipped };
}

const clip = (p) => Math.min(1 - 1e-15, Math.max(1e-15, p));

/**
 * Score both on the SAME bouts, once results exist.
 *
 * A draw or no-contest is VOIDED rather than scored: the model answered "who wins" and the fight
 * produced no winner, so neither side of the comparison has anything to be right or wrong about.
 */
export function scorePreFightRows(rows, resultsByBout) {
  const graded = [];
  const voided = [];
  for (const r of rows ?? []) {
    const res = resultsByBout.get(r.boutId);
    if (!res) continue;                                    // not fought yet — not a miss
    if (!res.winner || !res.loser) { voided.push({ ...r, reason: "draw or no contest — no winner to score" }); continue; }
    const hit = foldName(res.winner) === foldName(r.pick);
    const pModel = hit ? r.modelProbability : 1 - r.modelProbability;
    const pMarket = hit ? r.marketProbability : 1 - r.marketProbability;
    graded.push({
      ...r,
      winner: res.winner,
      hit,
      model: { probabilityOfActual: Number(pModel.toFixed(6)), logLoss: Number((-Math.log(clip(pModel))).toFixed(6)), brier: Number(((pModel - 1) ** 2).toFixed(6)) },
      market: { probabilityOfActual: Number(pMarket.toFixed(6)), logLoss: Number((-Math.log(clip(pMarket))).toFixed(6)), brier: Number(((pMarket - 1) ** 2).toFixed(6)) },
    });
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const round = (x) => (x == null ? null : Number(x.toFixed(6)));
  return {
    graded,
    voided,
    n: graded.length,
    model: { logLoss: round(mean(graded.map((g) => g.model.logLoss))), brier: round(mean(graded.map((g) => g.model.brier))), accuracy: round(mean(graded.map((g) => (g.hit ? 1 : 0)))) },
    market: { logLoss: round(mean(graded.map((g) => g.market.logLoss))), brier: round(mean(graded.map((g) => g.market.brier))) },
  };
}
