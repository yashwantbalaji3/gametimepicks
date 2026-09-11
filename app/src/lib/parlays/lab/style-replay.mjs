/**
 * STYLE REPLAY — what one risk level of the Parlay Lab actually did, applied to the reader's own
 * bankroll (Parlay Lab 2.0).
 *
 * A COMPLETED PAST, NEVER A PROJECTION. Every point on the replay is a card that was published before
 * its games and graded after them (parlays/lab-settled/<date>.json — the same receipts the lab ledger
 * is re-derived from). Nothing here simulates, extrapolates or forecasts; a reader who states $500 and
 * 2% sees what flat $10 cards at their chosen risk level did, day by day, since the selection rules
 * last changed. That is arithmetic on their own two numbers and the published record, and it is the
 * most honest answer to "what would this style have done for me?".
 *
 * Flat staking only: one unit per card, the same every day. There is no progression of any kind.
 */

export const RISK_ORDER = Object.freeze(["low", "medium", "high", "longshot"]);

/**
 * Per-tier settled series from the lab's settled receipts, oldest first.
 * @param {ReadonlyArray<{date:string, policyVersion?:number, cards:ReadonlyArray<{sport:string, tier:string, result:string, combinedDecimal:number}>}>} docs
 * @param {{ sport?: string }} [opts]
 */
export function buildTierReplay(docs, { sport = "mlb" } = {}) {
  const tiers = Object.fromEntries(RISK_ORDER.map((t) => [t, []]));
  const sorted = [...docs].filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date ?? "")).sort((a, b) => a.date.localeCompare(b.date));
  for (const d of sorted) {
    for (const c of d.cards ?? []) {
      if (c.sport !== sport || !tiers[c.tier]) continue;
      // Only decided cards move a bankroll; a push returns the stake and is kept as such.
      if (!["win", "loss", "push"].includes(c.result)) continue;
      const decimal = Number(c.combinedDecimal);
      if (!(decimal > 1)) continue;
      tiers[c.tier].push({ date: d.date, result: c.result, decimal: Math.round(decimal * 1e5) / 1e5 });
    }
  }
  return { since: sorted[0]?.date ?? null, through: sorted.at(-1)?.date ?? null, sport, tiers };
}

/** Units staked and returned for a series — one unit per card. */
export function seriesTotals(series) {
  let wins = 0, losses = 0, pushes = 0, returned = 0;
  for (const r of series) {
    if (r.result === "win") { wins += 1; returned += r.decimal; }
    else if (r.result === "push") { pushes += 1; returned += 1; }
    else losses += 1;
  }
  const staked = series.length;
  return { cards: staked, wins, losses, pushes, staked, returned: Math.round(returned * 100) / 100, roi: staked ? (returned - staked) / staked : null };
}

/**
 * Replay a series against a stated bankroll at a flat unit. Returns one point per settled day
 * (several cards on a day are netted into that day) plus the facts a reader should see first:
 * where it ended, the lowest it went, and the longest run of losing cards.
 */
export function replayBankroll(series, { bankroll, unit }) {
  if (!(bankroll > 0) || !(unit > 0)) return null;
  let balance = bankroll, low = bankroll, run = 0, worstRun = 0;
  const points = [{ date: null, balance: bankroll }];
  for (const r of series) {
    const net = r.result === "win" ? unit * (r.decimal - 1) : r.result === "push" ? 0 : -unit;
    balance = Math.round((balance + net) * 100) / 100;
    low = Math.min(low, balance);
    run = r.result === "loss" ? run + 1 : r.result === "win" ? 0 : run;
    worstRun = Math.max(worstRun, run);
    const last = points.at(-1);
    if (last.date === r.date) last.balance = balance; else points.push({ date: r.date, balance });
  }
  return { points, start: bankroll, end: balance, net: Math.round((balance - bankroll) * 100) / 100, lowest: low, worstRun, ...seriesTotals(series) };
}

/** The chance a price implies — 1 / decimal. It includes the sportsbook's margin, and says so where shown. */
export const impliedChance = (decimal) => (decimal > 1 ? 1 / decimal : null);

/**
 * The reader's card and its neighbours. The stated risk level leads; when today has no card there,
 * the nearest level stands in and says so. Safer and bolder are the nearest published levels on each
 * side — shown beside it, never instead of it.
 */
export function pickForYou(cards, risk) {
  if (!risk || !RISK_ORDER.includes(risk) || !cards?.length) return null;
  const at = (t) => cards.find((c) => c.tier === t) ?? null;
  const idx = RISK_ORDER.indexOf(risk);
  let main = at(risk), substitute = false;
  if (!main) {
    for (let d = 1; d < RISK_ORDER.length && !main; d++) {
      main = at(RISK_ORDER[idx - d]) ?? at(RISK_ORDER[idx + d]);
    }
    substitute = main != null;
  }
  if (!main) return null;
  const m = RISK_ORDER.indexOf(main.tier);
  const safer = RISK_ORDER.slice(0, m).reverse().map(at).find(Boolean) ?? null;
  const bolder = RISK_ORDER.slice(m + 1).map(at).find(Boolean) ?? null;
  return { main, substitute, safer, bolder };
}
