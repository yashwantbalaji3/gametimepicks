/**
 * CARD MATH — Program 234 · Releases E and F.
 *
 * Every operation over settled cards that does NOT touch the filesystem: filtering, pooling, the
 * grid and the daily series. It lives apart from `dated-cards.mjs` for one hard reason — that module
 * reads `node:fs`, and a client component importing a single function from it drags `node:fs` into
 * the browser bundle and fails the static export outright. This project has now hit that exact wall
 * twice; the rule is that anything a "use client" file may ever import must have no fs anywhere in
 * its import graph.
 *
 * `dated-cards.mjs` re-exports all of this, so the loader-side callers keep one import and there is
 * still exactly one definition of each rule.
 */

/** The dates actually covered, ascending. Used to bound the pickers to real data. */
export function coveredDates(cards) {
  return [...new Set(cards.map((c) => c.date))].sort();
}

/**
 * Filter by an inclusive date range and the existing selectors.
 * A reversed range returns a typed refusal rather than silently swapping the ends or returning all
 * time — a reader who typed the ends the wrong way round asked a question, and answering a different
 * one is worse than saying so.
 *
 * @returns {{ ok: true, cards: object[] } | { ok: false, reason: string }}
 */
export function filterCards(cards, { from = null, to = null, sport = null, tier = null } = {}) {
  const valid = (d) => d == null || /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!valid(from)) return { ok: false, reason: `"${from}" is not a date in YYYY-MM-DD form.` };
  if (!valid(to)) return { ok: false, reason: `"${to}" is not a date in YYYY-MM-DD form.` };
  if (from && to && from > to) {
    return { ok: false, reason: `The range starts after it ends (${from} → ${to}). Nothing can fall inside it.` };
  }
  const out = cards.filter((c) => {
    if (from && c.date < from) return false;
    if (to && c.date > to) return false;
    if (sport && sport !== "all" && c.sport !== sport) return false;
    if (tier && tier !== "all" && c.tier !== tier) return false;
    return true;
  });
  return { ok: true, cards: out };
}

/**
 * Pool a card set. Counts are SUMMED; nothing here averages a rate, and a set with no decided card
 * reports `available: false` rather than a zero.
 */
export function poolCards(cards) {
  const wins = cards.filter((c) => c.won).length;
  const losses = cards.filter((c) => c.lost).length;
  const pushes = cards.filter((c) => c.pushed).length;
  const pending = cards.filter((c) => c.pending).length;
  const decisive = wins + losses;
  return {
    cards: cards.length,
    wins, losses, pushes, pending, decisive,
    hitRate: decisive > 0
      ? { value: wins / decisive, decisive, available: true, reason: null }
      : { value: null, decisive: 0, available: false, reason: cards.length ? "no card in this selection has settled yet" : "no card in this selection" },
  };
}

/** The sport × tier grid. Empty cells are typed, never dropped — an absent tier is information. */
export function cardGrid(cards, { sports, tiers }) {
  return sports.map((sport) => ({
    sport,
    cells: tiers.map((tier) => {
      const subset = cards.filter((c) => c.sport === sport && c.tier === tier);
      return { tier, ...poolCards(subset), slipIds: subset.map((c) => c.slipId) };
    }),
    total: poolCards(cards.filter((c) => c.sport === sport)),
  }));
}

/* ── TRENDS · Program 234 · Release F ─────────────────────────────────────────────────────────── */

/**
 * The daily series over an already-filtered card set.
 *
 * `days` is EVERY calendar day in the range, including the ones with nothing on them, each typed:
 * a day with no card carries `hasData: false` and a null rate. That is the whole point. A chart that
 * plots a zero-event day at 0% draws a loss that never happened, and a chart that silently skips it
 * compresses time so a three-week gap looks like a bad afternoon.
 *
 * `cumulative` is pooled from SUMMED COUNTS at every step — never an average of the daily rates,
 * which is a different number and a wrong one whenever the days have unequal denominators.
 *
 * @param {object[]} cards already filtered by population, sport, tier and range
 * @param {{from?: string|null, to?: string|null}} bounds the range to draw, so an empty tail is visible
 */
export function dailySeries(cards, bounds = {}) {
  const dates = [...new Set(cards.map((c) => c.date))].sort();
  const from = bounds.from || dates[0] || null;
  const to = bounds.to || dates[dates.length - 1] || null;
  if (!from || !to || from > to) return { days: [], cumulative: [], pooled: poolCards(cards) };

  const days = [];
  let cw = 0, cl = 0;
  const cumulative = [];
  for (let d = from; d <= to; d = nextDay(d)) {
    const onDay = cards.filter((c) => c.date === d);
    const p = poolCards(onDay);
    days.push({
      date: d,
      hasData: onDay.length > 0,
      cards: onDay.length,
      wins: p.wins, losses: p.losses, pushes: p.pushes, pending: p.pending,
      decisive: p.decisive,
      /* No decisive card ⇒ no rate. Not zero, and not carried forward from yesterday. */
      rate: p.decisive > 0 ? p.wins / p.decisive : null,
    });
    cw += p.wins; cl += p.losses;
    cumulative.push({
      date: d,
      wins: cw, losses: cl, decisive: cw + cl,
      /* Pooled from the running SUMS, so unequal daily denominators weight correctly. */
      rate: cw + cl > 0 ? cw / (cw + cl) : null,
    });
  }
  return { days, cumulative, pooled: poolCards(cards) };
}

/** Next calendar day, via UTC noon so no timezone can shift the date by one. */
function nextDay(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
