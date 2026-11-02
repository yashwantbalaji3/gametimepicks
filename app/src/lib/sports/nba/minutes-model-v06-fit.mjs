/**
 * NBA v0.6 CANDIDATE: the recompute functions behind its PROPOSED constants. PURE, deterministic, no I/O.
 * NBA REGULAR SEASON — CANDIDATE (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * Every function here re-derives one number in minutes-model-v06.mjs CONSTANTS from committed data, so
 * minutes-model-v06.test.mjs can pin the number to its source (methodology constants need a source). Nothing here is
 * approved; see docs/nba/NBA_V06_MINUTES_CANDIDATE_PREREGISTRATION_2026-11-02.md.
 */
import { inPopulation } from "./sim-v1-profile.mjs";
import { lineStatus, stateFor, indexCurrentSeasonStatus, STATES } from "./eligibility-gate-v05.mjs";

const regularSeasonDocs = (docs, season) => (Array.isArray(docs) ? docs : [])
  .filter((d) => d?.boxscoreAvailable && d.season === season && inPopulation(d.phase, "regular"))
  .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(3)));
const played = (p) => lineStatus(p) === "played";

/**
 * Rows of the first `firstTeamGames` team games of `season`: one per player who played, with at least one earlier game
 * this season for this team and at least one S−1 regular-season appearance. `changedTeam` = his last S−1 team is not
 * this team. The first 20 team games is the audit's window (section 6) and the part of a season a prior matters in.
 */
export function earlySeasonRows(docs, { season, firstTeamGames = 20 }) {
  const prior = new Map(); // athlete → { minutes: [], lastTeam }
  for (const d of regularSeasonDocs(docs, season - 1)) {
    for (const p of d.players ?? []) {
      if (p?.providerAthleteId == null || !played(p)) continue;
      const id = String(p.providerAthleteId);
      const rec = prior.get(id) ?? { minutes: [], lastTeam: null };
      rec.minutes.push(p.minutes); rec.lastTeam = String(p.providerTeamId);
      prior.set(id, rec);
    }
  }
  const out = [];
  const teamCount = new Map();
  const current = new Map(); // `${athlete}|${team}` → minutes[]
  for (const d of regularSeasonDocs(docs, season)) {
    const rows = [];
    for (const t of d.teams ?? []) {
      const team = String(t.providerTeamId);
      const n = teamCount.get(team) ?? 0;
      teamCount.set(team, n + 1);
      if (n >= firstTeamGames) continue;
      for (const p of d.players ?? []) {
        if (String(p?.providerTeamId) !== team || p?.providerAthleteId == null || !played(p)) continue;
        const id = String(p.providerAthleteId);
        const P = prior.get(id);
        const C = current.get(`${id}|${team}`) ?? [];
        if (!P || !C.length) continue;
        rows.push({ gameId: String(d.providerEventId), actual: p.minutes, sumP: P.minutes.reduce((s, x) => s + x, 0), nP: P.minutes.length, sumC: C.reduce((s, x) => s + x, 0), nC: C.length, changedTeam: P.lastTeam !== team });
      }
    }
    out.push(...rows);
    for (const p of d.players ?? []) {
      if (p?.providerAthleteId == null || !played(p)) continue;
      const k = `${p.providerAthleteId}|${p.providerTeamId}`;
      if (!current.has(k)) current.set(k, []);
      current.get(k).push(p.minutes);
    }
  }
  return out;
}

/** minutes estimate with the prior worth k appearances (the v0.3 blend). */
export function blendEstimate(r, k) {
  const w = Math.min(1, k / r.nP);
  return (w * r.sumP + r.sumC) / (w * r.nP + r.nC);
}

/** MAE by prior weight k, for one population of earlySeasonRows. */
export function maeByPriorGames(rows, grid) {
  return Object.fromEntries(grid.map((k) => [k, rows.length ? r3(rows.reduce((s, r) => s + Math.abs(blendEstimate(r, k) - r.actual), 0) / rows.length) : null]));
}

/**
 * TRANSFER_PRIOR_GAMES source: the k in `grid` with the lowest pooled MAE on changed-team rows of the given completed
 * seasons, given the same k on every season. Ties go to the larger k (keep more of the prior).
 */
export function fitTransferPriorGames(docs, { seasons, firstTeamGames = 20, grid }) {
  const bySeason = {};
  let all = [];
  for (const season of seasons) {
    const rows = earlySeasonRows(docs, { season, firstTeamGames }).filter((r) => r.changedTeam);
    bySeason[season] = { n: rows.length, mae: maeByPriorGames(rows, grid) };
    all = all.concat(rows);
  }
  const pooled = maeByPriorGames(all, grid);
  const best = [...grid].sort((a, b) => pooled[a] - pooled[b] || b - a)[0];
  return { n: all.length, pooled, best, bySeason };
}

/**
 * The share of `season` regular-season appearances at or below the player's own season mean + `sds` × his own season SD,
 * for players with at least `minGames` appearances. Describes how far a one-SD ceiling reaches. In-sample per player.
 */
export function shareUnderMeanPlusSd(docs, { season, sds = 1, minGames = 10 }) {
  const byId = new Map();
  for (const d of regularSeasonDocs(docs, season)) {
    for (const p of d.players ?? []) {
      if (p?.providerAthleteId == null || !played(p)) continue;
      const id = String(p.providerAthleteId);
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(p.minutes);
    }
  }
  let n = 0, under = 0;
  for (const xs of byId.values()) {
    if (xs.length < minGames) continue;
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
    for (const x of xs) { n += 1; if (x <= m + sds * sd) under += 1; }
  }
  return { n, share: r3(under / n) };
}

/** Quantile of regular-season appearance minutes (nearest rank), the audit's p99 definition. */
export function minutesQuantile(docs, { season, q }) {
  const xs = [];
  for (const d of regularSeasonDocs(docs, season)) for (const p of d.players ?? []) if (played(p)) xs.push(p.minutes);
  xs.sort((a, b) => a - b);
  return { n: xs.length, value: xs[Math.min(xs.length - 1, Math.ceil(q * xs.length) - 1)] };
}

/**
 * DAY_TO_DAY_MULTIPLIER source. There is no injury-feed history before 2026-10, so no strictly prior season can supply
 * it. It comes from frozen forecast receipts in a closed early window and is therefore IN-SAMPLE for those games.
 * Population: receipt pool rows (one per frozen game and player) in state LAST_PLAYED or NONE at the freeze.
 * Multiplier = P(play | listed Day-To-Day) ÷ P(play | unlisted), rounded to 3 dp, capped at 1.
 *
 * @param forecastDocs  frozen forecast documents ({ games: [{ providerEventId, receipt, forecast, home, away }] })
 * @param boxscores     the season's box scores, all of them; each freeze reads only what it could have had
 * @param outcomeDocs   Map(providerEventId → box score) for the games scored
 */
export function fitDayToDayMultiplier(forecastDocs, { boxscores, outcomeDocs, fromDate, toDate }) {
  const cells = { dayToDay: { n: 0, played: 0 }, unlisted: { n: 0, played: 0 } };
  const stateCache = new Map();
  let games = 0;
  for (const doc of forecastDocs) {
    for (const g of doc.games ?? []) {
      const date = doc.date ?? String(g.dateUtc).slice(0, 10);
      if (date < fromDate || date > toDate) continue;
      const box = outcomeDocs.get(String(g.providerEventId));
      if (!box?.boxscoreAvailable) continue;
      games += 1;
      const now = g.receipt.generatedAt;
      if (!stateCache.has(now)) stateCache.set(now, indexCurrentSeasonStatus(boxscores, { asOfDateUtc: now }));
      const idx = stateCache.get(now);
      for (const sideKey of ["home", "away"]) {
        const teamId = String(g[sideKey].providerTeamId);
        for (const p of g.forecast.players[sideKey] ?? []) {
          const { state } = stateFor(idx, teamId, p.providerAthleteId);
          if (state !== STATES.LAST_PLAYED && state !== STATES.NONE) continue;
          const line = (box.players ?? []).find((x) => String(x.providerAthleteId) === String(p.providerAthleteId) && String(x.providerTeamId) === teamId);
          const didPlay = !!line && played(line);
          const cell = /day-to-day/i.test(String(p.injuryStatus ?? "")) ? cells.dayToDay : p.injuryStatus == null ? cells.unlisted : null;
          if (!cell) continue;
          cell.n += 1;
          if (didPlay) cell.played += 1;
        }
      }
    }
  }
  const rate = (c) => (c.n ? c.played / c.n : null);
  return { games, cells, rates: { dayToDay: r3(rate(cells.dayToDay)), unlisted: r3(rate(cells.unlisted)) }, multiplier: Math.min(1, r3(rate(cells.dayToDay) / rate(cells.unlisted))) };
}
