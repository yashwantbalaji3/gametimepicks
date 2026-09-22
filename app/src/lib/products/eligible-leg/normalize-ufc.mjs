/**
 * UFC → ProductEligibleLeg candidates.
 *
 * There is no independent fight model: `ufc/projections-latest.json` carries a de-vigged market price
 * with a capped nudge (`status/ufc-graduation-decision.json`: genuineModel false), the registry holds UFC
 * at SCAFFOLD_ONLY, and the newest odds (`ufc/odds-latest.json`) name a different card than the newest
 * projections. Candidates are built from the ODDS capture only — the projections file is not a forecast
 * owner — as MARKET_IMPLIED_NO_FORECAST with modelStatus SCAFFOLD_ONLY, so the manifest shows the real
 * count and the registry refuses every one.
 *
 * No per-bout start time is captured: `eventStartUtc` is the card's commence time when the capture has
 * one, else null (MISSING_IDENTITY — a leg whose start is unknown cannot be time-locked).
 */
export const UFC_RECEIPT = "docs/receipts/ODDS_AUTHORIZATION_UFC.md";

export function ufcCandidates({ odds }) {
  const out = [];
  const bouts = odds?.bouts ?? [];
  const cardStart = odds?.event?.commenceTime ?? odds?.event?.startUtc ?? null;
  const capturedAt = odds?.capturedAt ?? odds?.generatedAt ?? null;
  for (const b of bouts) {
    const sides = Array.isArray(b.sides) && b.sides.length ? b.sides : [b.red, b.blue].filter(Boolean).map((s) => ({ name: s?.name, american: s?.price?.american ?? s?.american, books: s?.price?.books ?? s?.books }));
    const names = sides.map((s) => s.name).filter(Boolean);
    for (const s of sides) {
      if (!s?.name) continue;
      const american = Number.isFinite(s.american) ? s.american : null;
      const implied = american == null ? null : american < 0 ? -american / (-american + 100) : 100 / (american + 100);
      out.push({ sport: "ufc", eventId: b.boutId ?? b.eventId ?? null, eventStartUtc: cardStart, entityIds: names.map((n) => `ufc-fighter-name:${n}`), marketFamily: "fight_result", marketKey: "ufc_h2h", side: s.name, line: null, forecastOwner: "ufc/odds-latest", forecastId: null, forecastClass: "MARKET_IMPLIED_NO_FORECAST", modelStatus: "SCAFFOLD_ONLY", probability: null, marketImpliedProbability: implied, oddsForSide: american == null ? null : { american, bookmaker: `consensus(${s.books ?? "?"} books)`, capturedAt, receipt: UFC_RECEIPT }, publishedAt: odds?.generatedAt ?? null, sourceReceiptRefs: ["ufc/odds-latest.json"], displayMatchup: names.join(" vs "), displaySelection: `${s.name} to win` });
    }
  }
  return { candidates: out, rawForecastCount: bouts.length, publicForecastCount: 0, ownerNote: "no independent fight model (SCAFFOLD_ONLY); the projections artifact is a nudged market price and is not an owner; prices are a raw consensus without a per-bout capture time" };
}
