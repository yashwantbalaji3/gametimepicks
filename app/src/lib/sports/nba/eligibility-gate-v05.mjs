/**
 * NBA v0.5 CANDIDATE: a pre-tip ELIGIBILITY GATE on top of v0.3's role-minutes pool. PURE, deterministic, no I/O.
 * NBA REGULAR SEASON — CANDIDATE SHADOW (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * WHY. v0.3 keeps the team at 240 minutes IN EXPECTATION (Σ playRate·minutes = 240, game-sim-v03.mjs), with playRate
 * taken from the role prior (appearances ÷ (appearances + coach's-decision DNPs), mostly last season). Over its first
 * 42 forward games that still put ~32 expected minutes per team-game (playRate-weighted; ~39 unweighted) on players
 * who then did not play, so the players who did play were projected ~22 minutes per team-game short and ~2 minutes
 * each (investigation 2026-10-28 §3; refreshed 2026-10-29). The strongest pre-tip separator of who will not play is the
 * player's OWN CURRENT-SEASON RECORD WITH THIS TEAM: whether he played the team's last game, and for how many
 * consecutive team games he has not.
 *
 * THE v0.5 RULE (one structural rule; its numbers are a table fitted on the PRIOR season only — see ELIGIBILITY_TABLE):
 *   1. STATE. As of the forecast instant, from the current season's regular-season box scores that tipped before it AND
 *      were captured at or before it (never the game being forecast, never anything later), each rostered player is in
 *      exactly one state (classifyState):
 *        NONE           the team has no current-season game yet, or the player's last current-season box appearance was
 *                       for ANOTHER team (newly moved) → no evidence; v0.3's playRate is kept unchanged.
 *        NO_APPEARANCE  the team has played, and the player is in none of this season's box scores (not even as a DNP).
 *        LAST_PLAYED    he played (minutes > 0) in the team's most recent game.
 *        MISSED_1_COACH / MISSED_1_OTHER     he did not play the team's last game only (coach's decision / any other
 *                       reason, including absent from the box), counting team games since his first box appearance
 *                       with this team this season (his tenure).
 *        MISSED_2PLUS_COACH / MISSED_2PLUS_OTHER  ≥ 2 consecutive tenure games without playing (split by the last one).
 *   2. PLAY PROBABILITY. q = v0.3 playRate × MULTIPLIER[state], where MULTIPLIER[state] = P(play | state) ÷
 *      P(play | LAST_PLAYED) from the prior season's table, capped at 1 (the gate only ever DOWN-weights; LAST_PLAYED
 *      and NONE are exactly 1, so a player who played last time keeps v0.3's playRate).
 *   3. REDISTRIBUTION. q replaces playRate in v0.3's engine unchanged (game-sim-v03.mjs prepareRosterV03): the team
 *      still sums to 240 in expectation (Σ q·minutes = 240), an over-full pool is water-filled on minutes^1.25 with the
 *      per-player cap MAX_PLAYER_MINUTES = 48, an under-full pool keeps v0's bounded uniform factor [0.5, 1.5]. The mass
 *      the gate removes from likely non-players therefore goes to the eligible rotation, mostly its larger roles; q is
 *      also the engine's participation probability. Minutes stay CONDITIONAL on playing. No new engine constant.
 *
 * CONSTANTS. The only new numbers are the five MULTIPLIERS, each a ratio of two empirical play rates in the 2025-26
 * regular season (corpus season 2026) — strictly before every 2026-27 forecast. fitEligibilityTable re-derives them from
 * the committed corpus box scores; eligibility-gate-v05.test.mjs recomputes and pins them. They need founder approval
 * (methodology constants need a source) before the family is armed.
 */
import { inPopulation, corpusSeasonOfDate } from "./sim-v1-profile.mjs";

export const ELIGIBILITY_GATE_V05_VERSION = "nba-eligibility-gate-v0.5";
export const POOL_V05_VERSION = "nba-roster-gated-pool-v0.5-eligibility";
export const STATES = Object.freeze({
  NONE: "NONE",
  NO_APPEARANCE: "NO_APPEARANCE",
  LAST_PLAYED: "LAST_PLAYED",
  MISSED_1_COACH: "MISSED_1_COACH",
  MISSED_1_OTHER: "MISSED_1_OTHER",
  MISSED_2PLUS_COACH: "MISSED_2PLUS_COACH",
  MISSED_2PLUS_OTHER: "MISSED_2PLUS_OTHER",
});
const FITTED_STATES = Object.freeze([STATES.NO_APPEARANCE, STATES.LAST_PLAYED, STATES.MISSED_1_COACH, STATES.MISSED_1_OTHER, STATES.MISSED_2PLUS_COACH, STATES.MISSED_2PLUS_OTHER]);
const r3 = (x) => Number(x.toFixed(3));

/**
 * THE FROZEN TABLE (fitted by fitEligibilityTable on corpus season 2026 = the 2025-26 regular season, phase 2 + cup final;
 * recomputed and pinned by eligibility-gate-v05.test.mjs). `cells` are the counts behind each rate; MULTIPLIERS are the
 * rate ratios to LAST_PLAYED, rounded to 3 dp and capped at 1. NOT fitted to any 2026-27 outcome. FOUNDER APPROVAL REQUIRED.
 */
export const ELIGIBILITY_TABLE = Object.freeze({
  fitSeason: 2026,
  population: "regular",
  source: "data/internal/research/nba/boxscores/*.json (corpus box scores), season 2026 regular (phase 2 + cup-final)",
  cells: Object.freeze({
    NO_APPEARANCE: Object.freeze({ n: 5059, played: 107 }),
    LAST_PLAYED: Object.freeze({ n: 26076, played: 22461 }),
    MISSED_1_COACH: Object.freeze({ n: 1847, played: 913 }),
    MISSED_1_OTHER: Object.freeze({ n: 1865, played: 929 }),
    MISSED_2PLUS_COACH: Object.freeze({ n: 2421, played: 894 }),
    MISSED_2PLUS_OTHER: Object.freeze({ n: 6454, played: 872 }),
  }),
});
export const MULTIPLIERS = Object.freeze({
  NONE: 1,
  LAST_PLAYED: 1,
  NO_APPEARANCE: 0.025,
  MISSED_1_COACH: 0.574,
  MISSED_1_OTHER: 0.578,
  MISSED_2PLUS_COACH: 0.429,
  MISSED_2PLUS_OTHER: 0.157,
});

/** One player's line in one box score → "played" | "dnp_coach" | "dnp_other". */
export function lineStatus(p) {
  if (p?.didNotPlay || !Number.isInteger(p?.minutes) || p.minutes <= 0) return /COACH/i.test(String(p?.dnpReason ?? "")) ? "dnp_coach" : "dnp_other";
  return "played";
}

/**
 * THE STATE RULE (shared by the fit and the runtime gate, so both classify identically). Pure.
 * @param teamGames  the team's current-season regular games strictly before the instant, oldest first: [{ statusOf: Map(athleteId → status) }]
 * @param athleteId
 * @param lastTeamBefore  the team id of the athlete's most recent current-season box appearance before the instant (any status), or null
 * @param teamId
 */
export function classifyState({ teamGames, athleteId, lastTeamBefore, teamId }) {
  if (!teamGames.length) return { state: STATES.NONE, streak: 0, tenureGames: 0 };
  if (lastTeamBefore == null) return { state: STATES.NO_APPEARANCE, streak: teamGames.length, tenureGames: 0 };
  if (String(lastTeamBefore) !== String(teamId)) return { state: STATES.NONE, streak: 0, tenureGames: 0 };
  // tenure: team games from the athlete's first appearance in this team's box (the most recent unbroken spell)
  let start = -1;
  for (let i = teamGames.length - 1; i >= 0; i -= 1) if (teamGames[i].statusOf.has(athleteId)) start = i;
  // (the spell is unbroken by construction: lastTeamBefore === teamId, and a move away and back within one season
  //  is rare enough that the earliest appearance is used)
  const tenure = teamGames.slice(start);
  let streak = 0;
  for (let i = tenure.length - 1; i >= 0; i -= 1) {
    const s = tenure[i].statusOf.get(athleteId) ?? "absent";
    if (s === "played") break;
    streak += 1;
  }
  const last = tenure.at(-1).statusOf.get(athleteId) ?? "absent";
  if (streak === 0) return { state: STATES.LAST_PLAYED, streak, tenureGames: tenure.length };
  const coach = last === "dnp_coach";
  if (streak === 1) return { state: coach ? STATES.MISSED_1_COACH : STATES.MISSED_1_OTHER, streak, tenureGames: tenure.length };
  return { state: coach ? STATES.MISSED_2PLUS_COACH : STATES.MISSED_2PLUS_OTHER, streak, tenureGames: tenure.length };
}

function seasonDocs(boxscores, season) {
  return (Array.isArray(boxscores) ? boxscores : [])
    .filter((d) => d?.boxscoreAvailable && typeof d.dateUtc === "string" && inPopulation(d.phase, "regular")
      && (Number.isInteger(d.season) ? d.season : corpusSeasonOfDate(d.dateUtc)) === season)
    .map((d) => ({ d, t: Date.parse(d.dateUtc) }))
    .sort((a, b) => a.t - b.t || String(a.d.providerEventId).localeCompare(String(b.d.providerEventId)));
}
/** athlete → status for one team's lines in one box score */
const teamStatusMap = (d, team) => new Map((d.players ?? []).filter((p) => p?.providerAthleteId != null && String(p.providerTeamId) === team).map((p) => [String(p.providerAthleteId), lineStatus(p)]));
const teamIdsOf = (d) => (d.teams ?? []).map((t) => String(t.providerTeamId));

/**
 * RUNTIME INDEX. Current-season (corpusSeasonOfDate(asOf)) regular-season box scores with dateUtc < asOf and, when the
 * doc carries capturedAt, capturedAt ≤ asOf. Nothing at or after the instant is read. Pure.
 */
export function indexCurrentSeasonStatus(boxscores, { asOfDateUtc }) {
  const cutoff = Date.parse(asOfDateUtc);
  if (!Number.isFinite(cutoff)) throw new Error("indexCurrentSeasonStatus: asOfDateUtc (ISO) is required");
  const season = corpusSeasonOfDate(asOfDateUtc);
  const docs = seasonDocs(boxscores, season).filter(({ d, t }) => t < cutoff && (d.capturedAt == null || Date.parse(d.capturedAt) <= cutoff));
  const byTeam = new Map();
  const lastTeam = new Map();
  for (const { d } of docs) {
    for (const id of teamIdsOf(d)) {
      if (!byTeam.has(id)) byTeam.set(id, []);
      byTeam.get(id).push({ providerEventId: String(d.providerEventId), dateUtc: d.dateUtc, statusOf: teamStatusMap(d, id) });
    }
    for (const p of d.players ?? []) if (p?.providerAthleteId != null) lastTeam.set(String(p.providerAthleteId), String(p.providerTeamId));
  }
  return { asOfDateUtc, season, docsRead: docs.length, lastEventDateUtc: docs.at(-1)?.d.dateUtc ?? null, byTeam, lastTeam };
}

export function stateFor(index, teamId, athleteId) {
  return classifyState({ teamGames: index.byTeam.get(String(teamId)) ?? [], athleteId: String(athleteId), lastTeamBefore: index.lastTeam.get(String(athleteId)) ?? null, teamId: String(teamId) });
}

/**
 * THE FIT (re-derives ELIGIBILITY_TABLE). For every team game g of `season` (regular) after the team's first, the
 * population is the athletes "on the team" at g — the next box appearance at or after g (any status) is with this team
 * (a labels-side stand-in for the roster capture, which the prior season does not have) and the previous appearance in
 * the season, if any, was also with this team. Each is classified by classifyState over the team's earlier games and
 * scored played / not played at g. Pure and deterministic.
 */
export function fitEligibilityTable(boxscores, { season }) {
  const docs = seasonDocs(boxscores, season).map(({ d }) => d);
  const apps = new Map(); // athlete → [{ i, team }]
  docs.forEach((d, i) => { for (const p of d.players ?? []) if (p?.providerAthleteId != null) { const a = String(p.providerAthleteId); if (!apps.has(a)) apps.set(a, []); apps.get(a).push({ i, team: String(p.providerTeamId) }); } });
  const teamGames = new Map(); // team → [doc index]
  docs.forEach((d, i) => { for (const t of teamIdsOf(d)) { if (!teamGames.has(t)) teamGames.set(t, []); teamGames.get(t).push(i); } });
  const cache = new Map();
  const tg = (i, team) => { const k = `${i}|${team}`; if (!cache.has(k)) cache.set(k, { statusOf: teamStatusMap(docs[i], team) }); return cache.get(k); };
  const cells = Object.fromEntries(FITTED_STATES.map((s) => [s, { n: 0, played: 0 }]));
  const firstIndex = (seq, g) => { let lo = 0, hi = seq.length; while (lo < hi) { const m = (lo + hi) >> 1; if (seq[m].i < g) lo = m + 1; else hi = m; } return lo; };
  for (const team of [...teamGames.keys()].sort()) {
    const games = teamGames.get(team);
    for (let k = 1; k < games.length; k += 1) {
      const g = games[k];
      const prior = games.slice(0, k).map((i) => tg(i, team));
      for (const [aid, seq] of apps) {
        const j = firstIndex(seq, g);
        if (j >= seq.length || seq[j].team !== team) continue; // not on this team at g (next appearance elsewhere / none)
        const lastTeamBefore = j > 0 ? seq[j - 1].team : null;
        if (lastTeamBefore != null && lastTeamBefore !== team) continue; // moved here; at runtime that is NONE
        const { state } = classifyState({ teamGames: prior, athleteId: aid, lastTeamBefore, teamId: team });
        if (!(state in cells)) continue;
        cells[state].n += 1;
        if (seq[j].i === g && tg(g, team).statusOf.get(aid) === "played") cells[state].played += 1;
      }
    }
  }
  const rate = (c) => (c.n > 0 ? c.played / c.n : null);
  const ref = rate(cells.LAST_PLAYED);
  const multipliers = { NONE: 1, LAST_PLAYED: 1 };
  for (const s of FITTED_STATES) if (s !== STATES.LAST_PLAYED) multipliers[s] = ref && rate(cells[s]) != null ? Math.min(1, r3(rate(cells[s]) / ref)) : 1;
  return { fitSeason: season, docs: docs.length, cells, rates: Object.fromEntries(FITTED_STATES.map((s) => [s, rate(cells[s]) == null ? null : r3(rate(cells[s]))])), multipliers };
}

/**
 * THE GATE on a v0.3 gated pool (minutes-model-v03.mjs gatePoolV03 result, state GATED). Returns a new pool object
 * (the input is not mutated) whose rows carry playRate = q, plus rolePlayRate (v0.3's), eligibilityState, streak and
 * multiplier; normalisation is v0.3's own (game-sim-v03 consumes it unchanged). A REFUSED pool passes through. Pure.
 */
export function applyEligibilityGate(gated, { statusIndex, multipliers = MULTIPLIERS }) {
  if (gated?.state !== "GATED") return gated;
  if (!statusIndex || statusIndex.asOfDateUtc !== gated.asOfDateUtc) throw new Error("applyEligibilityGate: statusIndex must be built at the pool's asOfDateUtc");
  const teamId = String(gated.teamProviderId);
  const counts = Object.fromEntries(Object.values(STATES).map((s) => [s, 0]));
  const rows = gated.rows.map((r) => {
    const { state, streak } = stateFor(statusIndex, teamId, r.providerAthleteId);
    counts[state] += 1;
    const m = multipliers[state];
    if (!(Number.isFinite(m) && m > 0 && m <= 1)) throw new Error(`applyEligibilityGate: multiplier for ${state} must be in (0, 1]`);
    const base = Number.isFinite(r.playRate) && r.playRate > 0 ? Math.min(1, r.playRate) : 1; // game-sim-v03 playRateOf
    return { ...r, rolePlayRate: r.playRate ?? null, playRate: Math.max(0.001, r3(base * m)), eligibilityState: state, eligibilityStreak: streak, eligibilityMultiplier: m };
  });
  return {
    ...gated,
    rows,
    eligibility: {
      version: ELIGIBILITY_GATE_V05_VERSION,
      rule: "q = v0.3 playRate × MULTIPLIER[state of the player's current-season record with this team before the instant]; q replaces playRate in game-sim-v03",
      boxscoresRead: statusIndex.docsRead,
      teamGamesBefore: (statusIndex.byTeam.get(teamId) ?? []).length,
      lastEventDateUtc: statusIndex.lastEventDateUtc,
      stateCounts: counts,
    },
    gate: {
      ...gated.gate,
      poolVersion: POOL_V05_VERSION,
      eligibilityGate: ELIGIBILITY_GATE_V05_VERSION,
      eligibilityStateCounts: counts,
      eligibilityRows: rows.map((r) => ({ providerAthleteId: r.providerAthleteId, state: r.eligibilityState, streak: r.eligibilityStreak, rolePlayRate: r.rolePlayRate, playRate: r.playRate })),
    },
  };
}
