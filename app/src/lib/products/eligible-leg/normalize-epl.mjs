/**
 * EPL → ProductEligibleLeg candidates.
 *
 * Forecast owner: `soccer/epl/forecasts/<date>.json` (P304 Elo-Poisson; the artifact says
 * VALIDATED_OUT_OF_SAMPLE_HISTORY for 1X2, the registry holds the sport at EXPERIMENTAL_PUBLIC and the lane
 * gate reports calibration UNPROVEN). Price owner: `soccer/epl/odds/latest.json` (h2h + totals, file-level
 * `capturedAt`, `public: false`), joined on the canonical `eventId`. Because the registry is binding, the
 * forecast class is EXPERIMENTAL_MODEL: no probability is carried and every leg is refused as
 * SPORT_NOT_ELIGIBLE — but the counts are real, so the sport eligibility matrix can show exactly what a
 * registry promotion would admit. Totals from P305-F are shadow and never read here.
 */
export const EPL_RECEIPT = "docs/receipts/ODDS_AUTHORIZATION_EPL.md";

export function eplCandidates({ forecasts, odds, date }) {
  const out = [];
  const rows = forecasts?.rows ?? [];
  const byEvent = new Map((odds?.rows ?? []).map((r) => [r.eventId, r]));
  const capturedAt = odds?.capturedAt ?? odds?.generatedAt ?? null;
  const status = forecasts?.validation ?? "UNKNOWN";
  for (const f of rows) {
    const o = byEvent.get(f.eventId) ?? null;
    const homeId = `epl-club:${f.homeClub}`, awayId = `epl-club:${f.awayClub}`;
    const base = { sport: "epl", eventId: f.eventId ?? null, eventStartUtc: f.kickoffUtc ?? null, forecastOwner: "soccer/epl/forecasts", forecastId: f.modelId ?? null, forecastClass: "EXPERIMENTAL_MODEL", modelStatus: status, publishedAt: forecasts?.generatedAt ?? null, sourceReceiptRefs: [`soccer/epl/forecasts/${date}.json`, ...(o ? ["soccer/epl/odds/latest.json"] : [])], displayMatchup: f.matchup ?? `${f.homeClub} v ${f.awayClub}` };
    const mr = (outcome) => (o?.matchResult ?? []).find((x) => x.outcome === outcome) ?? null;
    const price = (x) => (x && Number.isFinite(x.american) ? { american: x.american, bookmaker: `consensus(${x.books ?? "?"} books)`, capturedAt, receipt: EPL_RECEIPT } : null);
    for (const [side, outcomeName, prob, ents, label] of [["home", f.homeClub, f.probs?.home, [homeId, awayId], `${f.homeClub} to win`], ["draw", "Draw", f.probs?.draw, [homeId, awayId], "Draw"], ["away", f.awayClub, f.probs?.away, [awayId, homeId], `${f.awayClub} to win`]]) {
      const x = mr(outcomeName);
      out.push({ ...base, entityIds: ents, marketFamily: "team_result", marketKey: "epl_match_result", side, line: null, probability: prob ?? null, marketImpliedProbability: x?.noVig ?? null, oddsForSide: price(x), displaySelection: label });
    }
    for (const t of o?.totalGoals ?? []) {
      const ladder = (f.totals?.ladder ?? []).find((l) => l.line === t.line) ?? null;
      for (const side of ["over", "under"]) {
        const x = (t.outcomes ?? []).find((y) => String(y.outcome).toLowerCase() === side) ?? null;
        out.push({ ...base, entityIds: [homeId, awayId], marketFamily: "team_total", marketKey: "epl_total_goals", side, line: t.line, probability: ladder?.[side] ?? null, marketImpliedProbability: x?.noVig ?? null, oddsForSide: price(x), displaySelection: `${side === "over" ? "Over" : "Under"} ${t.line}` });
      }
    }
  }
  return { candidates: out, rawForecastCount: rows.length, publicForecastCount: rows.filter((r) => forecasts?.public === true).length, ownerNote: `registry EXPERIMENTAL_PUBLIC (binding); artifact validation ${status}; lane calibration UNPROVEN; odds capture is public:false and joined by eventId` };
}
