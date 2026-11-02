/**
 * NBA v0.7 CANDIDATE: the recompute functions behind its PROPOSED constants. PURE, deterministic, no I/O.
 * NBA REGULAR SEASON — CANDIDATE (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * COMPLETED SEASONS ONLY. Every function reads corpus seasons 2024 to 2026 (2023-24 to 2025-26) and throws on anything
 * else, because no v0.7 constant may be fitted against a 2026-27 game. That is the anti-tuning rule in code, and a test
 * proves the refusal. See docs/nba/NBA_V07_MINUTES_CANDIDATE_PREREGISTRATION_2026-11-02.md.
 *
 * The completed seasons have no roster captures and no injury feed, so seasonRows uses two labels-side stand-ins:
 *   - ON THE TEAM at game g: the athlete's next box appearance at or after g (any status) is with this team, as in the v0.5 fit.
 *   - OUT at game g: he has a non-coach DNP line or no line. This is a perfect-feed stand-in, so it uses hindsight. It is
 *     used only to size the under-full lift, and the preregistration discloses it.
 */
import { classifyState, FITTED_STATES, lineStatus, regularSeasonDocs, STATES, teamIdsOf, teamStatusMap } from "./minutes-model-v07-state.mjs";

export const COMPLETED_SEASONS = Object.freeze([2024, 2025, 2026]);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(3)));

/** The anti-tuning rule in code. */
export function assertCompletedSeasons(seasons) {
  for (const s of seasons) if (!COMPLETED_SEASONS.includes(s)) throw new Error(`v0.7 fit: season ${s} is not a completed season; no v0.7 constant may read it`);
}
const sumM = (xs) => xs.reduce((s, x) => s + x, 0);

/** The v0.7 role blend on plain minutes. carried and current are arrays of minutes. Mirrors minutesEstimateV07. */
export function blendRole({ carried, current, moved, priorGames, transferPriorGames }) {
  const nP = carried.length, nC = current.length;
  if (nP + nC === 0) return null;
  if (nC === 0) return sumM(carried) / nP;
  const w = nP > 0 ? Math.min(1, (moved ? transferPriorGames : priorGames) / nP) : 0;
  return (w * sumM(carried) + sumM(current)) / (w * nP + nC);
}

/** v0.3's play rate on running counts: appearances ÷ (appearances + coach's DNPs), prior worth 10. */
function basePlayRate({ nP, cdP, nC, cdC }) {
  const w = nP > 0 ? Math.min(1, 10 / nP) : 0;
  const den = w * (nP + cdP) + nC + cdC;
  return den > 0 ? (w * nP + nC) / den : 1;
}

/**
 * Every (team game, athlete on the team) of one completed season, in chronological order, after the team's first game.
 * Each row holds only what was known before that game, plus the outcome fields `played`, `minutes` and `status`.
 * Rows with no role (no S−1 appearance and no appearance yet) are skipped: at runtime those players have no projection.
 */
export function seasonRows(docs, { season, priorGames, transferPriorGames, carriedSeason = season - 1, includeNoRole = false }) {
  assertCompletedSeasons([season, carriedSeason]);
  const prior = new Map(); // athlete → { minutes: [], lastTeam, coachDnp }
  for (const d of regularSeasonDocs(docs, carriedSeason)) {
    for (const p of d.players ?? []) {
      if (p?.providerAthleteId == null) continue;
      const id = String(p.providerAthleteId);
      const rec = prior.get(id) ?? { minutes: [], lastTeam: null, coachDnp: 0 };
      const s = lineStatus(p);
      if (s === "played") { rec.minutes.push(p.minutes); rec.lastTeam = String(p.providerTeamId); }
      if (s === "dnp_coach") rec.coachDnp += 1;
      prior.set(id, rec);
    }
  }
  const seasonDocs = regularSeasonDocs(docs, season);
  const apps = new Map(); // athlete → [{ i, team }]
  const teamGames = new Map(); // team → [doc index]
  const teamAthletes = new Map(); // team → Set(athlete)
  seasonDocs.forEach((d, i) => {
    for (const t of teamIdsOf(d)) { if (!teamGames.has(t)) { teamGames.set(t, []); teamAthletes.set(t, new Set()); } teamGames.get(t).push(i); }
    for (const p of d.players ?? []) {
      if (p?.providerAthleteId == null) continue;
      const a = String(p.providerAthleteId);
      if (!apps.has(a)) apps.set(a, []);
      apps.get(a).push({ i, team: String(p.providerTeamId) });
      teamAthletes.get(String(p.providerTeamId))?.add(a);
    }
  });
  const statusCache = new Map();
  const tg = (i, team) => { const k = `${i}|${team}`; if (!statusCache.has(k)) statusCache.set(k, { statusOf: teamStatusMap(seasonDocs[i], team) }); return statusCache.get(k); };
  const lineAt = (i, team, a) => (seasonDocs[i].players ?? []).find((p) => String(p.providerAthleteId) === a && String(p.providerTeamId) === team) ?? null;
  // current[athlete] = chronological [{ i, team, minutes, status }]
  const current = new Map();
  seasonDocs.forEach((d, i) => {
    for (const p of d.players ?? []) {
      if (p?.providerAthleteId == null) continue;
      const a = String(p.providerAthleteId);
      if (!current.has(a)) current.set(a, []);
      current.get(a).push({ i, team: String(p.providerTeamId), minutes: p.minutes, status: lineStatus(p) });
    }
  });
  const out = [];
  for (const team of [...teamGames.keys()].sort()) {
    const games = teamGames.get(team);
    for (let k = 1; k < games.length; k += 1) {
      const g = games[k];
      const priorGamesForTeam = games.slice(0, k).map((i) => tg(i, team));
      for (const a of [...teamAthletes.get(team)].sort()) {
        const seq = apps.get(a);
        let j = 0;
        while (j < seq.length && seq[j].i < g) j += 1;
        if (j >= seq.length || seq[j].team !== team) continue; // not on this team at g
        const lastTeamBefore = j > 0 ? seq[j - 1].team : null;
        const moved = lastTeamBefore != null && lastTeamBefore !== team;
        const { state, streak } = classifyState({ teamGames: priorGamesForTeam, athleteId: a, lastTeamBefore, teamId: team });
        const P = prior.get(a) ?? { minutes: [], lastTeam: null, coachDnp: 0 };
        const before = (current.get(a) ?? []).filter((x) => x.i < g);
        const forTeam = before.filter((x) => x.team === team && x.status === "played").map((x) => x.minutes);
        const forOthers = before.filter((x) => x.team !== team && x.status === "played").map((x) => x.minutes);
        const carried = [...P.minutes, ...forOthers];
        const carriedFromOther = forOthers.length ? true : P.lastTeam != null && P.lastTeam !== team;
        const role = blendRole({ carried, current: forTeam, moved: carriedFromOther, priorGames, transferPriorGames });
        if (!includeNoRole && (role == null || !(role > 0))) continue;
        const allPlayed = before.filter((x) => x.status === "played").length;
        const coachNow = before.filter((x) => x.status === "dnp_coach").length;
        const line = seq[j].i === g ? lineAt(g, team, a) : null;
        const status = line ? lineStatus(line) : "absent";
        out.push({
          season, team, k, gameId: String(seasonDocs[g].providerEventId), athleteId: a, state, streak, moved,
          role, base: basePlayRate({ nP: P.minutes.length, cdP: P.coachDnp, nC: allPlayed, cdC: coachNow }),
          played: status === "played", minutes: status === "played" ? line.minutes : 0, status, starter: line?.starter === true,
        });
      }
    }
  }
  return out;
}

/** Play rate by state, optionally split by role tier. Multiplier = P(play | cell) ÷ P(play | LAST_PLAYED in that tier), capped at 1. */
export function stateTable(rows, { firstTeamGames = Infinity, rotationMinutes = null } = {}) {
  const tier = (r) => (rotationMinutes == null ? "ALL" : r.role >= rotationMinutes ? "ROTATION" : "FRINGE");
  const tiers = rotationMinutes == null ? ["ALL"] : ["ROTATION", "FRINGE"];
  const cells = Object.fromEntries(tiers.map((t) => [t, Object.fromEntries(FITTED_STATES.map((s) => [s, { n: 0, played: 0 }]))]));
  for (const r of rows) {
    if (r.k >= firstTeamGames || !(r.state in cells[tiers[0]])) continue;
    const c = cells[tier(r)][r.state];
    c.n += 1;
    if (r.played) c.played += 1;
  }
  const rate = (c) => (c.n ? c.played / c.n : null);
  const multipliers = Object.fromEntries(tiers.map((t) => {
    const ref = rate(cells[t].LAST_PLAYED);
    return [t, { NONE: 1, LAST_PLAYED: 1, ...Object.fromEntries(FITTED_STATES.filter((s) => s !== STATES.LAST_PLAYED).map((s) => [s, rate(cells[t][s]) == null || !ref ? null : Math.min(1, r3(rate(cells[t][s]) / ref))])) }];
  }));
  return { cells, multipliers, rates: Object.fromEntries(tiers.map((t) => [t, Object.fromEntries(FITTED_STATES.map((s) => [s, r3(rate(cells[t][s]))]))])) };
}

/** The v0.7 state table: two seasons pooled over their first team games. */
export function fitStateTable(docs, { seasons, firstTeamGames, rotationMinutes, priorGames, transferPriorGames }) {
  assertCompletedSeasons(seasons);
  return stateTable(seasons.flatMap((season) => seasonRows(docs, { season, priorGames, transferPriorGames })), { firstTeamGames, rotationMinutes });
}

/** v0.7's box-record play probability on a fit's rates. LAST_PLAYED and NONE keep the base rate. */
export const qOfRow = (rates) => (r) => (r.state === STATES.LAST_PLAYED || r.state === STATES.NONE ? r.base : Math.min(r.base, rates[r.state]));

/** Every side of seasonRows with the hindsight-perfect Out stand-in removed: { list, S, f }, S = Σ q·role. */
export function sidesOf(rows, { q, firstTeamGames = Infinity, target = 240 }) {
  const by = new Map();
  for (const r of rows) {
    if (r.k >= firstTeamGames || r.status === "dnp_other" || r.status === "absent") continue;
    const key = `${r.gameId}|${r.team}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(r);
  }
  return [...by.values()].map((list) => { const S = list.reduce((s, r) => s + q(r) * r.role, 0); return { list, S, f: target / S }; });
}

/** Under-full sides, played rows in a role band: OLS through the origin of (actual − role) on (f − 1)·role. A correct uniform factor gives 1. */
export function proportionalLiftSlope(sides, { lo = -Infinity, hi = Infinity } = {}) {
  let xy = 0, xx = 0, n = 0;
  for (const s of sides) {
    if (!(s.f > 1)) continue;
    for (const r of s.list) {
      if (!r.played || r.role < lo || r.role >= hi) continue;
      const x = (s.f - 1) * r.role;
      xy += x * (r.minutes - r.role); xx += x * x; n += 1;
    }
  }
  return { n, slope: xx > 0 ? r3(xy / xx) : null };
}

/** UNDER_FULL_LIFT_MINUTES source: OLS through the origin of (actual − role) on (f − 1), played rows under the top line, under-full sides. */
export function fitAdditiveLift(sides, { topRotationMinutes }) {
  let xy = 0, xx = 0, n = 0;
  for (const s of sides) {
    if (!(s.f > 1)) continue;
    for (const r of s.list) {
      if (!r.played || r.role >= topRotationMinutes) continue;
      const x = s.f - 1;
      xy += x * (r.minutes - r.role); xx += x * x; n += 1;
    }
  }
  return { n, liftMinutes: xx > 0 ? r3(xy / xx) : null };
}

/** Quantile of regular-season appearance minutes (nearest rank). */
export function minutesQuantile(docs, { season, q }) {
  assertCompletedSeasons([season]);
  const xs = [];
  for (const d of regularSeasonDocs(docs, season)) for (const p of d.players ?? []) if (lineStatus(p) === "played") xs.push(p.minutes);
  xs.sort((a, b) => a - b);
  return { n: xs.length, value: xs[Math.min(xs.length - 1, Math.ceil(q * xs.length) - 1)] };
}
