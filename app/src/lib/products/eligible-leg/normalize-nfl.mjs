/**
 * NFL → ProductEligibleLeg candidates.
 *
 * Forecast owner: `nfl/forecasts/latest.json` (`nfl-regular-season-public-v1`, state PUBLIC_EXPERIMENTAL on
 * every game). Price owner: `nfl/markets/latest.json` (team markets only, many books, file-level
 * `capturedAt`), joined on `canonicalEventId`. The forecast class is EXPERIMENTAL_MODEL: the contract
 * carries no probability for it and the registry (EXPERIMENTAL_PUBLIC) refuses the sport. The candidates
 * are still built so the manifest can say exactly how many legs would exist and why none qualifies —
 * and so the day a validated NFL model exists, nothing new has to be written.
 *
 * Player families (rush / reception yds / receptions) publish distributions with no line and no price;
 * they produce no candidate (a leg without a side and a price is not a leg).
 */
export const NFL_RECEIPT = "docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md";
const BOOK_PREFERENCE = ["draftkings", "fanduel", "betmgm"];

function pickBook(books) {
  const list = Array.isArray(books) ? books : [];
  for (const b of BOOK_PREFERENCE) { const hit = list.find((x) => x.book === b); if (hit) return hit; }
  return list[0] ?? null;
}

export function nflCandidates({ forecasts, markets }) {
  const out = [];
  const rows = forecasts?.forecasts ?? [];
  const byEvent = new Map((markets?.rows ?? []).map((r) => [r.canonicalEventId, r]));
  const capturedAt = markets?.capturedAt ?? null;
  for (const f of rows) {
    const m = byEvent.get(f.canonicalEventId) ?? null;
    const book = m ? pickBook(m.books) : null;
    const homeId = `nfl-team-${f.home?.abbr ?? "?"}`, awayId = `nfl-team-${f.away?.abbr ?? "?"}`;
    const base = { sport: "nfl", eventId: f.canonicalEventId ?? null, eventStartUtc: f.kickoffUtc ?? null, forecastOwner: "nfl/forecasts", forecastId: f.model?.id ? `${f.model.id}@v${f.model.version ?? "?"}` : null, forecastClass: "EXPERIMENTAL_MODEL", modelStatus: f.state ?? "PUBLIC_EXPERIMENTAL", publishedAt: f.generatedAt ?? forecasts?.generatedAt ?? null, sourceReceiptRefs: ["nfl/forecasts/latest.json", ...(m ? ["nfl/markets/latest.json"] : [])], displayMatchup: f.matchup ?? null };
    const price = (american) => (Number.isFinite(american) && book ? { american, bookmaker: book.book, capturedAt, receipt: NFL_RECEIPT } : null);
    const wp = f.forecastSummary?.winProbability ?? f.winProbability ?? null;
    out.push({ ...base, entityIds: [homeId, awayId], marketFamily: "team_result", marketKey: "nfl_moneyline", side: "home", line: null, probability: wp?.home ?? null, marketImpliedProbability: book?.noVigWinProb?.home ?? null, oddsForSide: price(book?.moneyline?.home), displaySelection: `${f.home?.name ?? f.home?.abbr} to win` });
    out.push({ ...base, entityIds: [awayId, homeId], marketFamily: "team_result", marketKey: "nfl_moneyline", side: "away", line: null, probability: wp?.away ?? null, marketImpliedProbability: book?.noVigWinProb?.away ?? null, oddsForSide: price(book?.moneyline?.away), displaySelection: `${f.away?.name ?? f.away?.abbr} to win` });
    if (book?.spread && typeof book.spread.line === "number") {
      out.push({ ...base, entityIds: [homeId, awayId], marketFamily: "team_spread", marketKey: "nfl_spread", side: "home", line: book.spread.line, probability: null, marketImpliedProbability: null, oddsForSide: price(book.spread.prices?.home), displaySelection: `${f.home?.abbr} ${book.spread.line > 0 ? "+" : ""}${book.spread.line}` });
      out.push({ ...base, entityIds: [awayId, homeId], marketFamily: "team_spread", marketKey: "nfl_spread", side: "away", line: -book.spread.line, probability: null, marketImpliedProbability: null, oddsForSide: price(book.spread.prices?.away), displaySelection: `${f.away?.abbr} ${-book.spread.line > 0 ? "+" : ""}${-book.spread.line}` });
    }
    if (book?.total && typeof book.total.line === "number") {
      for (const side of ["over", "under"]) out.push({ ...base, entityIds: [homeId, awayId], marketFamily: "team_total", marketKey: "nfl_total", side, line: book.total.line, probability: null, marketImpliedProbability: null, oddsForSide: price(book.total.prices?.[side]), displaySelection: `${side === "over" ? "Over" : "Under"} ${book.total.line}` });
    }
  }
  return { candidates: out, rawForecastCount: rows.length, publicForecastCount: rows.filter((r) => r.state !== "MODEL_UNAVAILABLE").length, ownerNote: "every game is PUBLIC_EXPERIMENTAL; only VALIDATED_PICK may become a product leg (nfl/product-eligibility.json) and the public-beta engine cannot emit it; player families publish no line and no price" };
}
