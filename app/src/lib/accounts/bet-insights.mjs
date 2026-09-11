/**
 * WHAT YOUR OWN BETS SAY (P263) — the personal record, computed from a person's confirmed slips.
 *
 * This is the honest half of personalisation. The site cannot tell anyone which bets will win; it CAN
 * tell them what they have actually been doing and how it has actually gone — the repeated legs, the
 * risk mix, the leg counts, the trend. Those are facts about them, not predictions about games.
 *
 * THE RULES THIS FILE KEEPS:
 *   · A finding needs a sample. Below the floor every observation reports NEEDS_MORE with its count,
 *     because "your 3-leg parlays lose" off four slips is noise presented as self-knowledge.
 *   · Pending slips are pending. They are never counted as losses, and never quietly dropped from the
 *     denominator of anything they belong to.
 *   · A push returns the stake: it is neither a win nor a loss, and it does not break a losing run.
 *   · Nothing here is advice. Each finding states what happened and its sample; it never tells anyone
 *     what to bet next.
 */

/** Below this many decided slips, a slice reports NEEDS_MORE rather than a number that reads as a verdict. */
export const MIN_DECIDED = 20;

const DECIDED = new Set(["won", "lost", "push"]);
const decimalFromAmerican = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

/** Price bands, mirroring the lab's published bands so a personal record can sit beside the site's. */
export function bandOf(american) {
  if (!Number.isFinite(american)) return null;
  if (american < -200) return null;
  if (american <= 100) return "low";
  if (american <= 300) return "medium";
  if (american <= 600) return "high";
  return "longshot";
}

const returnedOf = (r) =>
  r.status === "won" ? (Number.isFinite(r.returned) ? r.returned : (r.stake ?? 0) * decimalFromAmerican(r.price_american ?? -110))
  : r.status === "push" ? (r.stake ?? 0)
  : 0;

/** Headline: what has settled, what it did, and what is still live. */
export function summarise(rows) {
  const decided = rows.filter((r) => DECIDED.has(r.status));
  const staked = decided.reduce((n, r) => n + (r.stake ?? 0), 0);
  const returned = decided.reduce((n, r) => n + returnedOf(r), 0);
  return {
    slips: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    decided: decided.length,
    wins: decided.filter((r) => r.status === "won").length,
    losses: decided.filter((r) => r.status === "lost").length,
    pushes: decided.filter((r) => r.status === "push").length,
    staked: Math.round(staked * 100) / 100,
    returned: Math.round(returned * 100) / 100,
    net: Math.round((returned - staked) * 100) / 100,
    roi: staked > 0 ? (returned - staked) / staked : null,
    state: decided.length >= MIN_DECIDED ? "OBSERVED" : "NEEDS_MORE",
  };
}

/** One slice of the record — by leg count, by price band, by sportsbook, by anything. */
function sliceBy(rows, keyOf) {
  const out = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (k == null) continue;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return [...out.entries()]
    .map(([key, group]) => ({ key, ...summarise(group) }))
    .sort((a, b) => b.decided - a.decided);
}

export const byLegCount = (rows) => sliceBy(rows, (r) => (Array.isArray(r.legs) ? r.legs.length : null));
export const byPriceBand = (rows) => sliceBy(rows, (r) => bandOf(r.price_american));
export const byBook = (rows) => sliceBy(rows, (r) => r.book ?? null);

/**
 * The selections a person keeps coming back to, with how those slips actually went.
 *
 * Keyed on the selection, not the slip: backing the same player three nights running is the pattern
 * worth seeing, and it is invisible in a list of tickets.
 */
export function repeatedLegs(rows, { minAppearances = 3 } = {}) {
  const byLeg = new Map();
  for (const r of rows) {
    for (const l of r.legs ?? []) {
      const key = [l.player, l.market, l.side, l.line].filter((x) => x != null && x !== "").join(" · ");
      if (!key) continue;
      if (!byLeg.has(key)) byLeg.set(key, []);
      byLeg.get(key).push(r);
    }
  }
  return [...byLeg.entries()]
    .filter(([, slips]) => slips.length >= minAppearances)
    .map(([key, slips]) => ({ leg: key, appearances: slips.length, ...summarise(slips) }))
    .sort((a, b) => b.appearances - a.appearances);
}

/** Where the money actually goes, as a share of stake. A stated preference and this often disagree. */
export function riskMix(rows) {
  const staked = rows.reduce((n, r) => n + (r.stake ?? 0), 0);
  if (staked <= 0) return [];
  const bands = new Map();
  for (const r of rows) {
    const b = bandOf(r.price_american) ?? "unpriced";
    bands.set(b, (bands.get(b) ?? 0) + (r.stake ?? 0));
  }
  return [...bands.entries()]
    .map(([band, amount]) => ({ band, staked: Math.round(amount * 100) / 100, share: amount / staked }))
    .sort((a, b) => b.staked - a.staked);
}

/** Week by week, oldest first: staked, returned, net. Weeks with nothing settled are kept as zeroes. */
export function weeklyTrend(rows, { weeks = 8, now = new Date() } = {}) {
  const end = new Date(now);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const to = new Date(end.getTime() - i * 7 * 86_400_000);
    const from = new Date(to.getTime() - 7 * 86_400_000);
    const inWeek = rows.filter((r) => {
      const t = Date.parse(r.settled_at ?? r.placed_at ?? "");
      return Number.isFinite(t) && t > from.getTime() && t <= to.getTime() && DECIDED.has(r.status);
    });
    const s = summarise(inWeek);
    out.push({ weekEnding: to.toISOString().slice(0, 10), decided: s.decided, staked: s.staked, returned: s.returned, net: s.net });
  }
  return out;
}

/**
 * The findings worth putting in front of someone, each with its own sample state.
 *
 * Every finding is a statement about what happened. None of them says what to do next: the person
 * decides that, and a site whose own models do not beat the closing line is in no position to instruct.
 */
export function findings(rows) {
  const out = [];
  const overall = summarise(rows);
  out.push({
    id: "overall",
    state: overall.state,
    text: overall.decided === 0
      ? "Nothing has settled yet."
      : `${overall.wins}–${overall.losses}${overall.pushes ? `–${overall.pushes}` : ""} on ${overall.decided} settled slips, ${overall.net >= 0 ? "up" : "down"} ${Math.abs(overall.net).toFixed(2)}.`,
    sample: overall.decided,
  });

  for (const slice of byLegCount(rows)) {
    if (slice.decided === 0) continue;
    out.push({
      id: `legs-${slice.key}`,
      state: slice.state,
      text: `${slice.key}-leg slips: ${slice.wins}–${slice.losses} on ${slice.decided} settled` +
        (slice.state === "OBSERVED" && slice.roi != null ? `, ${(slice.roi * 100).toFixed(1)}% return` : ", too few to read anything into"),
      sample: slice.decided,
    });
  }

  for (const rep of repeatedLegs(rows).slice(0, 3)) {
    out.push({
      id: `repeat-${rep.leg}`,
      state: rep.state,
      text: `${rep.leg} is on ${rep.appearances} of your slips` + (rep.decided ? `; those went ${rep.wins}–${rep.losses}` : "; none settled yet"),
      sample: rep.decided,
    });
  }

  const mix = riskMix(rows);
  if (mix.length) {
    const top = mix[0];
    out.push({
      id: "risk-mix",
      state: overall.state,
      text: `${Math.round(top.share * 100)}% of your stake goes on ${top.band === "unpriced" ? "slips with no ticket price read" : `${top.band}-priced slips`}.`,
      sample: overall.decided,
    });
  }
  return out;
}
