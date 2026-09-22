/**
 * MLB → ProductEligibleLeg candidates.
 *
 * Source: `mlb/team-markets/<date>.json` (one bookmaker, de-vigged; per-game `capturedAt`) bridged to
 * the official `gamePk` through `mlb/statsapi-schedule/<date>.json` by team names and date
 * (doubleheaders resolve by nearest start). The MLB model (`mlb/predictions`) is NOT a forecast owner
 * for products: every family sits at WATCH / HOLDING / BREACHED against the market, so its numbers are
 * market context and never enter a leg as `probability`. What enters is the price — and the leg says so.
 *
 * Pure: takes the parsed artifacts, returns candidates for `evaluateLeg`.
 */
export const MLB_RECEIPT = "docs/MLB_DAILY_PIPELINE.md";

function bridge(schedule) {
  const games = schedule?.games ?? [];
  return (home, away, commence) => {
    const hits = games.filter((g) => g.home?.name === home && g.away?.name === away);
    if (hits.length === 0) return null;
    if (hits.length === 1) return hits[0];
    const t = Date.parse(commence);
    return hits.slice().sort((a, b) => Math.abs(Date.parse(a.gameDate) - t) - Math.abs(Date.parse(b.gameDate) - t))[0];
  };
}

/**
 * @param {object} args
 * @param {object} args.teamMarkets   parsed mlb/team-markets/<date>.json
 * @param {object|null} args.schedule parsed mlb/statsapi-schedule/<date>.json
 * @param {string} args.date
 */
export function mlbCandidates({ teamMarkets, schedule, date }) {
  const out = [];
  const find = bridge(schedule);
  const src = `mlb/team-markets/${date}.json`;
  const games = teamMarkets?.games ? Object.values(teamMarkets.games) : [];
  for (const g of games) {
    const sched = find(g.homeTeam, g.awayTeam, g.commenceTime);
    const eventId = sched ? String(sched.gamePk) : null; // no gamePk → MISSING_IDENTITY, by design
    const startUtc = sched?.gameDate ?? g.commenceTime ?? null;
    const homeId = sched?.home?.id != null ? `mlb-team-${sched.home.id}` : `mlb-team-name:${g.homeTeam}`;
    const awayId = sched?.away?.id != null ? `mlb-team-${sched.away.id}` : `mlb-team-name:${g.awayTeam}`;
    const base = { sport: "mlb", eventId, eventStartUtc: startUtc, forecastOwner: "mlb/team-markets", forecastId: null, forecastClass: "MARKET_IMPLIED_NO_FORECAST", modelStatus: "MARKET_CONTEXT", probability: null, publishedAt: teamMarkets.generatedAt ?? null, sourceReceiptRefs: [src, ...(sched ? [`mlb/statsapi-schedule/${date}.json`] : [])], displayMatchup: `${g.awayTeam} @ ${g.homeTeam}`, oddsEventId: g.gameId ?? null };
    const price = (o) => (o && Number.isFinite(o.odds) ? { american: o.odds, bookmaker: g.bookmaker ?? teamMarkets.bookmaker ?? null, capturedAt: g.capturedAt ?? teamMarkets.generatedAt ?? null, receipt: MLB_RECEIPT } : null);
    if (g.moneyline) {
      out.push({ ...base, entityIds: [homeId, awayId], marketFamily: "team_result", marketKey: "mlb_moneyline", side: "home", line: null, marketImpliedProbability: g.moneyline.home?.noVigProb ?? null, oddsForSide: price(g.moneyline.home), displaySelection: `${g.homeTeam} to win` });
      out.push({ ...base, entityIds: [awayId, homeId], marketFamily: "team_result", marketKey: "mlb_moneyline", side: "away", line: null, marketImpliedProbability: g.moneyline.away?.noVigProb ?? null, oddsForSide: price(g.moneyline.away), displaySelection: `${g.awayTeam} to win` });
    }
    if (g.runLine) {
      for (const sideKey of ["home", "away"]) {
        const s = g.runLine[sideKey]; if (!s) continue;
        const team = sideKey === "home" ? g.homeTeam : g.awayTeam;
        out.push({ ...base, entityIds: sideKey === "home" ? [homeId, awayId] : [awayId, homeId], marketFamily: "team_spread", marketKey: "mlb_run_line", side: sideKey, line: typeof s.line === "number" ? s.line : null, marketImpliedProbability: s.coverNoVigProb ?? null, oddsForSide: price(s), displaySelection: `${team} ${s.line > 0 ? "+" : ""}${s.line}` });
      }
    }
    if (g.total && typeof g.total.line === "number") {
      for (const sideKey of ["over", "under"]) {
        const s = g.total[sideKey]; if (!s) continue;
        out.push({ ...base, entityIds: [homeId, awayId], marketFamily: "team_total", marketKey: "mlb_total_runs", side: sideKey, line: g.total.line, marketImpliedProbability: s.noVigProb ?? null, oddsForSide: price(s), displaySelection: `${sideKey === "over" ? "Over" : "Under"} ${g.total.line}` });
      }
    }
  }
  return { candidates: out, rawForecastCount: games.length, publicForecastCount: games.length, ownerNote: "market-implied de-vigged prices from one bookmaker; the MLB model families are WATCH/HOLDING/BREACHED against the market and are not a product forecast owner" };
}
