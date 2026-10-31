/**
 * NBA experimental forecast assembly + grading (NBA readiness tracks N2/N3) — PURE, no I/O.
 * NBA PRESEASON — EXPERIMENTAL · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * The two scripts (build-nba-experimental-forecasts / grade-nba-experimental-forecasts) own only
 * file reads/writes and the one guarded fetch; every rule lives here so it is unit-tested:
 *
 *   - LABELS: seasonType 1 → "NBA PRESEASON — EXPERIMENTAL", 2 → "NBA REGULAR SEASON — SHADOW";
 *     anything else REFUSES (a preseason game can never be labelled regular season, and an
 *     unknown seasonType is never guessed).
 *   - POPULATIONS: a preseason game is forecast from the preseason minutes population and the
 *     preseason Elo stream; a regular-season game from the regular ones. Grading keeps the two
 *     samples in separate buckets; a preseason record is never regular-season validation.
 *   - The artifact is internal research: productEligible:false, dataClass PRIVATE_RESEARCH,
 *     and a `neverReadBy` note. Nothing here is imported by app/src/app/**.
 *   - ROSTER RECONCILIATION (N-4, additive, v0 pool UNCHANGED): when a roster capture is passed,
 *     every side records who is on the current roster but has no box-score history (rookies,
 *     arrivals) and who is in the simulated pool but no longer on the roster (departures). The
 *     numbers are diagnostics stamped with the roster's asOf; the simulated pool is still the v0
 *     "appeared in a box score" pool, so the gap is measured, not hidden and not yet closed.
 */
import { buildTeamRatings, ratingFor, winProbability, seasonOfDate } from "./team-rating.mjs";
import { expectedMinutes } from "./minutes-model.mjs";
import { simulateGame, DEFAULT_SIMULATIONS, NBA_SIM_MODEL_VERSION } from "./game-sim.mjs";
import { rosterForTeam } from "./roster-contract.mjs";
import { gatePool, POOL_VERSION as ROSTER_GATED_POOL_VERSION } from "./roster-gated-pool.mjs";
import { frozenWinnerSide, DECIDED_WINNER_HEAD } from "./winner-side.mjs";
import { simulateGameV1, NBA_SIM_V1_MODEL_VERSION } from "./game-sim-v1.mjs";
import { indexBoxscores, leagueMeans, buildSideProfile, PROFILE_VERSION as V1_PROFILE_VERSION } from "./sim-v1-profile.mjs";
import { scoreQuantileBlock } from "./distribution-scores.mjs";
import { simulateGameV03, NBA_SIM_V03_MODEL_VERSION } from "./game-sim-v03.mjs";
import { gatePoolV03, indexRoleHistory, MINUTES_MODEL_V03_VERSION, POOL_V03_VERSION, BASES as V03_BASES } from "./minutes-model-v03.mjs";
import { applyEligibilityGate, indexCurrentSeasonStatus, ELIGIBILITY_GATE_V05_VERSION, POOL_V05_VERSION } from "./eligibility-gate-v05.mjs";

export const FORECAST_ARTIFACT = "nba-experimental-forecasts";
/**
 * Artifact FAMILIES (v1.8 A1). v0 is frozen exactly as preregistered (docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md
 * §1) and keeps its directory, its ledger and its model-version string. v0.1 is the roster-gated pool: same
 * Elo, same minutes model, same seeded simulation engine — only the POOL rule changes — written to its own
 * directory with its own ledger so the two are graded side by side and neither rewrites the other.
 *
 * v0.2 (Stage 12-S1b, founder decision N3, 2026-10-07) is the 2026-27 CHALLENGER: v0.1's roster-gated pool, but its
 * Elo and minutes also fold the 2026-27 season as it happens (the finals record and the fetched box scores — see
 * season-fold.mjs), which v0 and v0.1 never read. It is SHADOW research beside the champion: it never replaces
 * v0.1 (N1 champion) or the Elo winner side (N2) automatically.
 *
 * v1 (2026-10-19) is the coherent-engine CANDIDATE (game-sim-v1.mjs, "nba-sim-v1-coherent"): v0.2's roster gate and
 * data rule (the 2026-27 season fold), but a different ENGINE — shared-pace team scoring from Elo + the pools, quarters,
 * overtime, minutes that sum to 240 (+25 per OT), and player stats allocated so they sum to the team. Its player
 * history is sim-v1-profile.mjs (current + prior season blended by recency and shrinkage), never the minutes model's
 * single-season rows. `engine` is the one key the build branches on; v0/v0.1/v0.2 have none and run game-sim.mjs
 * exactly as before.
 *
 * v0.3 (founder decision 2026-10-22, recorded in the PR 1116 decision register; preregistration §1 addition and look 8)
 * is the role-minutes FORWARD-SHADOW CHALLENGER (docs/nba/NBA_V01_PRESEASON_MINUTES_INVESTIGATION_2026-10-21.md):
 * v0.1's roster gate and Elo UNCHANGED; only the minutes layer (minutes-model-v03.mjs: the whole prior regular season as
 * a role prior blended toward the current regular season) and its normalisation (game-sim-v03.mjs: the v0 draw model
 * with conditional minutes, bench-first normalisation to 240 in expectation, participation by play rate; game-sim.mjs,
 * the frozen v0 engine, is not edited). Its data rule folds the fetched 2026-27 box scores but NOT the finals record, so
 * its Elo is v0.1's. `minutesRule` is the key the build branches on. `alignsWith: "v0.1"` is the founder's SAME-CUTOFF
 * condition: the builder freezes a v0.3 game only when v0.1's receipt for that game was generated at the same --now
 * from the same roster / injury / schedule inputs (alignedCutoffRefusal below), and the forecast-window decision does
 * not count an aligned family as owed (it follows its anchor). It never replaces v0.1 or the Elo side automatically.
 *
 * `role` and `dataRule` are labels for readers; nothing in the build branches on `role`.
 */
export const FAMILIES = Object.freeze({
  "v0": Object.freeze({ family: "v0", poolRule: "box-score-history", dataRule: "corpus-v1", role: "PREREGISTERED_SHADOW", modelVersion: "nba-preseason-experimental-v0", dir: "experimental" }),
  "v0.1": Object.freeze({ family: "v0.1", poolRule: "roster-gated", dataRule: "corpus-v1", role: "CHAMPION", modelVersion: "nba-preseason-experimental-v0.1", dir: "experimental-v0.1" }),
  "v0.2": Object.freeze({ family: "v0.2", poolRule: "roster-gated", dataRule: "corpus-v1+season-2026-27", role: "CHALLENGER", modelVersion: "nba-experimental-v0.2-season-2026-27", dir: "experimental-v0.2" }),
  "v1": Object.freeze({ family: "v1", poolRule: "roster-gated", dataRule: "corpus-v1+season-2026-27", role: "CANDIDATE_SHADOW", modelVersion: "nba-sim-v1-coherent", dir: "experimental-v1", engine: "v1" }),
  "v0.3": Object.freeze({ family: "v0.3", poolRule: "roster-gated", dataRule: "corpus-v1+boxscores-2026-27", role: "CHALLENGER", modelVersion: "nba-experimental-v0.3-role-minutes", dir: "experimental-v0.3", minutesRule: "v0.3-role-prior", alignsWith: "v0.1" }),
});
/**
 * CANDIDATE families: resolvable by name (familySpec), never iterated by the nightly pipeline. They are kept OUT of
 * FAMILIES on purpose — every script that walks FAMILIES (the forecast-window decision, the grader's cross-ledger
 * checks, the receipt guard, the box-score fetch dirs) would otherwise start owing, grading or fetching for a family
 * the founder has not armed. `armed: false` makes the builder refuse to write into any forecasts/ directory
 * (unarmedWriteRefusal; a replay goes to --out). Arming is a founder decision recorded in the preregistration looks
 * log and moves the family into FAMILIES (v0.3 was armed this way on 2026-10-22).
 *
 * v0.5 (proposed 2026-10-29, NOT ARMED; docs/nba/NBA_V05_ELIGIBILITY_GATE_PREREGISTRATION_2026-10-29.md) is v0.3 with one
 * layer added: a pre-tip eligibility gate (eligibility-gate-v05.mjs) that multiplies v0.3's playRate by a prior-season
 * table indexed by the player's current-season record with this team before the instant, so the 240-minute expectation
 * stops parking minutes on likely non-players. Same roster gate, Elo, role-minutes layer, engine and cutoff as v0.3.
 * Until the founder arms it, its only use is a replay written with --out outside any forecasts/ directory.
 */
export const CANDIDATE_FAMILIES = Object.freeze({
  "v0.5": Object.freeze({ family: "v0.5", poolRule: "roster-gated", dataRule: "corpus-v1+boxscores-2026-27", role: "CANDIDATE_SHADOW", modelVersion: "nba-experimental-v0.5-eligibility-gate", dir: "experimental-v0.5", minutesRule: "v0.5-eligibility-gate", alignsWith: "v0.1", armed: false }),
});

/**
 * The builder's write guard for an UNARMED candidate (spec.armed === false). Pure. Returns a refusal string or null.
 * --write without --out is refused, and so is an --out inside <nbaRoot>/.../forecasts/.
 */
export function unarmedWriteRefusal(spec, { write = false, outFile = null, nbaRoot = null } = {}) {
  if (spec?.armed !== false) return null;
  if (write && !outFile) return `family ${spec.family} is a candidate that is NOT ARMED (founder decision required) — --write is refused; pass --out <file> outside any forecasts/ directory for a replay`;
  if (outFile && nbaRoot && String(outFile).startsWith(String(nbaRoot)) && String(outFile).split(/[\\/]+/).includes("forecasts")) {
    return `family ${spec.family} is NOT ARMED — --out may not point inside a forecasts/ directory`;
  }
  return null;
}

/**
 * SAME-CUTOFF rule for a family with `alignsWith` (v0.3 → v0.1). Pure. A game may be frozen only when the anchor
 * family's receipt for it exists, was generated at exactly this run's `now`, and records the same roster sha256,
 * injury sha256 and schedule capture as this run. Returns null when aligned, else the reason.
 *
 * @param anchorGame  the anchor family's stored game (with its receipt), or undefined
 * @param run         { now, rostersSha256, injuriesSha256, scheduleGeneratedAt } of this build
 */
export function alignedCutoffRefusal(anchorGame, run) {
  const r = anchorGame?.receipt;
  if (!r) return "the anchor family has no receipt for this game, so there is no cutoff to share";
  if (r.generatedAt !== run.now) return `the anchor froze at ${r.generatedAt}, not at this run's ${run.now}`;
  if ((r.inputs?.rosters?.sha256 ?? null) !== (run.rostersSha256 ?? null)) return "the anchor's roster blob differs from this run's";
  if ((r.inputs?.injuries?.sha256 ?? null) !== (run.injuriesSha256 ?? null)) return "the anchor's injury blob differs from this run's";
  if ((r.inputs?.schedule?.generatedAt ?? null) !== (run.scheduleGeneratedAt ?? null)) return "the anchor's schedule capture differs from this run's";
  return null;
}

export function familySpec(family) {
  const key = String(family ?? "v0");
  const f = FAMILIES[key] ?? CANDIDATE_FAMILIES[key];
  if (!f) throw new Error(`REFUSED: unknown NBA experimental family ${JSON.stringify(family)} (${[...Object.keys(FAMILIES), ...Object.keys(CANDIDATE_FAMILIES)].join(", ")})`);
  return f;
}

/**
 * Does a document on disk belong to the family that is about to read or extend it? (v1.8 A1)
 *
 * The two families live in sibling directories, so the PATH normally keeps them apart — but a path is
 * not a proof. A forecast written by one family and left in the other's directory (a bad `--out`, a
 * hand-copied file, a half-finished migration) would be graded into the wrong ledger, and the ledger
 * would then average two different pool rules into one record. Two populations summed is the defect
 * class this project refuses everywhere else, so the grader checks the DOCUMENT, not the directory.
 *
 * A document with neither `family` nor `modelVersion` is legacy (v0 predates the family key) and is
 * adopted by v0 only — never by v0.1, which has never existed without its stamps.
 *
 * @returns { ok: true, adopt } | { ok: false, reason, detail }
 */
export function familyGuard({ family, doc, what = "document" }) {
  const spec = familySpec(family);
  const declaredFamily = doc?.family ?? null;
  const declaredVersion = doc?.modelVersion ?? null;
  if (declaredFamily != null && String(declaredFamily) !== spec.family) {
    return { ok: false, reason: "FAMILY_MISMATCH", detail: `${what} declares family ${JSON.stringify(declaredFamily)}, not ${spec.family} — a family never reads another family's ${what}` };
  }
  if (declaredVersion != null && String(declaredVersion) !== spec.modelVersion) {
    return { ok: false, reason: "MODEL_VERSION_MISMATCH", detail: `${what} carries modelVersion ${JSON.stringify(declaredVersion)}, not ${spec.modelVersion} — a family never reads another family's ${what}` };
  }
  if (declaredFamily == null && declaredVersion == null) {
    if (spec.family !== "v0") return { ok: false, reason: "UNSTAMPED_NOT_ADOPTABLE", detail: `${what} declares no family and no modelVersion; only v0 adopts an unstamped ${what} (it predates the family key), never ${spec.family}` };
    return { ok: true, adopt: true };
  }
  return { ok: true, adopt: declaredFamily == null };
}
export const FORECAST_SCHEMA_VERSION = 1;
export const DATA_CLASS = "PRIVATE_RESEARCH";
export const LABELS = Object.freeze({ 1: "NBA PRESEASON — EXPERIMENTAL", 2: "NBA REGULAR SEASON — SHADOW" });
export const POPULATIONS = Object.freeze({ 1: "preseason", 2: "regular" });
const STAT_KEYS = Object.freeze(["pts", "reb", "ast", "threePm"]);
/** The three §5 joint combinations and their components (the keys `game-sim.mjs` COMBO_KEYS writes). */
const COMBO_PARTS = Object.freeze({ pra: ["pts", "reb", "ast"], ptsAst: ["pts", "ast"], ptsReb: ["pts", "reb"] });

/**
 * Possessions per team from a box score — the standard estimate FGA + 0.44·FTA − OREB + TOV, averaged over the two
 * sides. Null when any input is missing on either side (never zero-filled). A DIAGNOSTIC slice key, not a model input.
 */
export function paceFromBoxscore(boxscore, game) {
  const sideIds = [game?.home?.providerTeamId, game?.away?.providerTeamId].map((x) => (x == null ? null : String(x)));
  const per = [];
  for (const id of sideIds) {
    const rows = (boxscore?.players ?? []).filter((p) => String(p.providerTeamId) === id && Number.isInteger(p.minutes));
    if (!rows.length) return null;
    const sum = (k) => rows.reduce((s, p) => (s == null || !Number.isInteger(p[k]) ? null : s + p[k]), 0);
    const fga = sum("fga"), fta = sum("fta"), oreb = sum("oreb"), tov = sum("tov");
    if ([fga, fta, oreb, tov].some((x) => x == null)) return null;
    per.push(fga + 0.44 * fta - oreb + tov);
  }
  return { possessions: r4((per[0] + per[1]) / 2), rule: "FGA + 0.44·FTA − OREB + TOV, mean of both sides (team box totals from player rows)" };
}

/** Label for a schedule seasonType — throws on anything but 1 or 2. */
export function labelForSeasonType(seasonType) {
  // Integer only: object keys are strings, so LABELS["1"] would otherwise pass a string through.
  const label = Number.isInteger(seasonType) ? LABELS[seasonType] : undefined;
  if (!label) throw new Error(`REFUSED: seasonType ${JSON.stringify(seasonType)} has no experimental label (1 preseason · 2 regular only)`);
  return label;
}

export function populationForSeasonType(seasonType) {
  const p = Number.isInteger(seasonType) ? POPULATIONS[seasonType] : undefined;
  if (!p) throw new Error(`REFUSED: seasonType ${JSON.stringify(seasonType)} has no population`);
  return p;
}

/** ET calendar date (YYYY-MM-DD) of a UTC instant. */
export function etDateOf(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/**
 * Reconcile one team's simulated pool (minutes-model rows) against the roster capture. Pure.
 * Returns { state: "ABSENT" } when no roster was passed, { state: "MISSING", reason } when the
 * team's roster was not captured, else the three lists. Never changes the pool.
 */
export function reconcileRoster(rosters, providerTeamId, minutesResult) {
  if (!rosters) return { state: "ABSENT", asOf: null };
  const team = rosterForTeam(rosters, providerTeamId);
  if (!team) {
    const missing = (rosters.teams ?? []).find((t) => String(t.providerTeamId) === String(providerTeamId));
    return { state: "MISSING", asOf: rosters.asOf ?? rosters.capturedAt ?? null, reason: missing?.reason ?? "team not in roster capture" };
  }
  const rows = Array.isArray(minutesResult?.rows) ? minutesResult.rows : [];
  const history = new Map(rows.map((r) => [String(r.providerAthleteId), r]));
  const onRoster = new Set(team.players.map((p) => String(p.providerAthleteId)));
  const onRosterWithoutHistory = team.players.filter((p) => !history.has(String(p.providerAthleteId)))
    .map((p) => ({ providerAthleteId: String(p.providerAthleteId), name: p.displayName, position: p.position ?? null, experienceYears: p.experienceYears ?? null, injuryStatus: p.injuryStatus ?? null }));
  const simulatedButNotOnRoster = rows.filter((r) => !onRoster.has(String(r.providerAthleteId)))
    .map((r) => ({ providerAthleteId: String(r.providerAthleteId), name: r.name ?? null, expectedMinutes: r.expectedMinutes ?? null, availability: r.availability ?? null, basis: r.basis ?? null }));
  return {
    state: "CAPTURED",
    asOf: rosters.asOf ?? rosters.capturedAt ?? null,
    rosterSize: team.playerCount,
    simulatedOnRoster: rows.length - simulatedButNotOnRoster.length,
    onRosterWithoutHistory,
    simulatedButNotOnRoster,
    poolRule: "v0: pool = box-score history; roster reconciled, not applied",
  };
}

/**
 * Build the forecast artifact for one ET date. Pure given already-loaded inputs.
 *
 * @param date          YYYY-MM-DD (ET)
 * @param now           ISO — ratings/minutes as-of; also the leakage cutoff
 * @param scheduleRows  schedule capture rows[]
 * @param corpusRows    corpus-v1 rows[]
 * @param boxscores     box-score docs[]
 * @param injuries      injuries feed entries[] (null → availability unknown)
 * @param rosters       roster capture artifact (roster-parse.mjs) or null → reconciliation absent, never guessed
 */
export function buildForecastArtifact({ date, now, scheduleRows, corpusRows, boxscores, injuries = null, rosters = null, simulations = DEFAULT_SIMULATIONS, family = "v0" }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error("REFUSED: --date YYYY-MM-DD required");
  if (typeof now !== "string" || !Number.isFinite(Date.parse(now))) throw new Error("REFUSED: --now ISO required");
  const spec = familySpec(family);
  const rosterGated = spec.poolRule === "roster-gated";
  const engineV1 = spec.engine === "v1";
  // v0.3 candidate: a different minutes layer behind the same roster gate (one role index per population per artifact).
  // v0.5 candidate (not armed): v0.3's pool and engine, with the eligibility gate applied to the gated pool's playRate.
  const minutesV05 = spec.minutesRule === "v0.5-eligibility-gate";
  const minutesV03 = spec.minutesRule === "v0.3-role-prior" || minutesV05;
  let v05Status = null;
  const v05StatusIndex = () => (v05Status ??= indexCurrentSeasonStatus(boxscores, { asOfDateUtc: now }));
  const v03Index = new Map();
  const v03IndexFor = (population) => {
    if (!v03Index.has(population)) v03Index.set(population, indexRoleHistory(boxscores, { asOfDateUtc: now, population }));
    return v03Index.get(population);
  };
  const poolVersion = minutesV05 ? POOL_V05_VERSION : minutesV03 ? POOL_V03_VERSION : ROSTER_GATED_POOL_VERSION;
  // v1 reads the same as-of box scores (one index per artifact) and league means per population, lazily.
  let v1Index = null;
  const v1League = new Map();
  const v1LeagueFor = (population) => {
    if (!v1Index) v1Index = indexBoxscores(boxscores);
    if (!v1League.has(population)) v1League.set(population, leagueMeans(v1Index, { asOf: now, population }));
    return v1League.get(population);
  };
  // v0.1 FAILS CLOSED on a missing roster capture at the artifact level too: no roster, no forecast, no fallback.
  if (rosterGated && !rosters) throw new Error(`REFUSED: family ${spec.family} requires a roster capture (rosters/latest.json) — it never falls back to box-score membership`);
  const teamMinutesCache = new Map();

  const slate = (Array.isArray(scheduleRows) ? scheduleRows : [])
    .filter((r) => r?.providerEventId && r?.dateUtc && etDateOf(r.dateUtc) === date)
    .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));

  const targetSeason = slate.length ? seasonOfDate(slate[0].dateUtc) : seasonOfDate(`${date}T12:00:00Z`);
  const ratings = buildTeamRatings(corpusRows, { throughDateUtc: now, targetSeason });

  const games = [];
  const manifest = {
    date, now, gamesOnSchedule: slate.length, gamesForecast: 0, refused: [],
    byLabel: {},
    teamsWithoutRegularHistory: [], teamsWithoutPreseasonHistory: [], teamsWithoutBoxscoreHistory: [],
    playersWithExpectedMinutes: 0, playersOut: 0, playersInsufficient: 0, playersNoMinutes: 0,
    playersUnknownToHistory: [], // injuries entries naming athletes with no box-score row for that team
    minutesBasisCounts: minutesV03 ? Object.fromEntries(Object.values(V03_BASES).map((b) => [b, 0])) : { trailing10: 0, season: 0, insufficient: 0 },
    poolRateSubstitutions: 0, defaultSdSubstitutions: 0,
    gamesAlreadyStartedAtNow: 0,
    family: spec.family, poolRule: spec.poolRule,
    ...(engineV1 ? { v1Pool: { profileVersion: V1_PROFILE_VERSION, simulated: 0, insufficientHistory: 0, out: 0, otherTeamHistory: 0 } } : {}),
    pool: rosterGated ? { poolVersion, rosterPlayers: 0, playersSimulated: 0, playersInsufficientHistory: 0, playersExcludedNotOnRoster: 0, playersOtherTeamHistory: 0, gamesRefusedByRosterGate: 0 } : { poolVersion: null, rule: "v0: box-score history" },
    roster: rosters ? {
      provided: true, asOf: rosters.asOf ?? rosters.capturedAt ?? null, contractVersion: rosters.contractVersion ?? null,
      teamsMissingRoster: [], playersOnRosterWithoutHistory: 0, playersSimulatedButNotOnRoster: 0, playersSimulatedOnRoster: 0,
      poolRule: "v0: the simulated pool is still box-score history; roster is reconciled, not applied",
    } : { provided: false, asOf: null, contractVersion: null, poolRule: "no roster capture passed — reconciliation absent (not zero)" },
  };
  const noteTeam = (list, name) => { if (!list.includes(name)) list.push(name); };

  for (const row of slate) {
    let label, population;
    try { label = labelForSeasonType(row.seasonType); population = populationForSeasonType(row.seasonType); }
    catch (e) { manifest.refused.push({ providerEventId: String(row.providerEventId), reason: e.message }); continue; }
    manifest.byLabel[label] = (manifest.byLabel[label] ?? 0) + 1;
    if (Date.parse(row.dateUtc) <= Date.parse(now)) manifest.gamesAlreadyStartedAtNow += 1;

    const side = (s) => {
      const name = s?.name ?? null;
      const rating = ratingFor(ratings, name, { population });
      if (rating.basis === "default-no-history") noteTeam(population === "preseason" ? manifest.teamsWithoutPreseasonHistory : manifest.teamsWithoutRegularHistory, `${name} (${s?.providerTeamId})`);
      let minutes, pool = null;
      if (rosterGated) {
        const gatedV03 = minutesV03
          ? gatePoolV03({ rosters, providerTeamId: s?.providerTeamId, boxscores, asOfDateUtc: now, injuries, population, roleIndex: v03IndexFor(population) })
          : null;
        const gated = minutesV05 ? applyEligibilityGate(gatedV03, { statusIndex: v05StatusIndex() })
          : gatedV03 ?? gatePool({ rosters, providerTeamId: s?.providerTeamId, boxscores, asOfDateUtc: now, injuries, population, teamMinutesCache });
        if (gated.state === "REFUSED") return { refused: gated.reason, name, providerTeamId: String(s?.providerTeamId), gate: gated.gate };
        minutes = gated; pool = gated.gate;
        manifest.pool.playersInsufficientHistory += pool.insufficientHistory.length;
        manifest.pool.playersExcludedNotOnRoster += pool.excludedNotOnRoster.length;
        manifest.pool.playersOtherTeamHistory += pool.otherTeamHistory.length;
        manifest.pool.playersSimulated += pool.simulated;
        manifest.pool.rosterPlayers += pool.rosterSize;
      } else {
        minutes = expectedMinutes({ boxscores, teamProviderId: s?.providerTeamId, asOfDateUtc: now, injuries, population });
      }
      if (minutes.teamGamesInSeason === 0) noteTeam(manifest.teamsWithoutBoxscoreHistory, `${name} (${s?.providerTeamId}) [${population}]`);
      for (const p of minutes.rows) {
        manifest.minutesBasisCounts[p.basis] += 1;
        if (p.availability === "out") manifest.playersOut += 1;
        else if (p.expectedMinutes != null) manifest.playersWithExpectedMinutes += 1;
        else manifest.playersNoMinutes += 1;
        if (p.basis === "insufficient") manifest.playersInsufficient += 1;
      }
      for (const u of minutes.unmatchedInjuries) manifest.playersUnknownToHistory.push({ team: name, providerTeamId: String(s?.providerTeamId), ...u });
      const rosterReconciliation = reconcileRoster(rosters, String(s?.providerTeamId), minutes);
      if (rosters) {
        if (rosterReconciliation.state === "MISSING") noteTeam(manifest.roster.teamsMissingRoster, `${name} (${s?.providerTeamId})`);
        else {
          manifest.roster.playersOnRosterWithoutHistory += rosterReconciliation.onRosterWithoutHistory.length;
          manifest.roster.playersSimulatedButNotOnRoster += rosterReconciliation.simulatedButNotOnRoster.length;
          manifest.roster.playersSimulatedOnRoster += rosterReconciliation.simulatedOnRoster;
        }
      }
      let profile = null;
      if (engineV1) {
        const league = v1LeagueFor(population); // also builds v1Index
        // The gated rows are the roster (membership, availability under the CURRENT team); v1 reads each player's own
        // blended history from the index — the minutes-model rates on those rows are not used.
        profile = buildSideProfile(v1Index, { teamId: String(s?.providerTeamId), rosterRows: minutes.rows, asOf: now, population, league });
        // v1's OWN pool counts (its blended two-season history differs from the gate's single-season minutes rows)
        manifest.v1Pool.simulated += profile.players.length;
        manifest.v1Pool.insufficientHistory += profile.insufficientHistory.length;
        manifest.v1Pool.out += profile.excludedOut.length;
        manifest.v1Pool.otherTeamHistory += profile.players.filter((p) => p.historyBasis === "other-team").length;
      }
      return { name, abbr: s?.abbr ?? null, providerTeamId: String(s?.providerTeamId), rating, minutes, rosterReconciliation, pool, ...(engineV1 ? { profile } : {}) };
    };
    const home = side(row.home);
    const away = side(row.away);
    if (home.refused || away.refused) {
      // FAIL CLOSED (v0.1): a side whose roster gate refused is not simulated — the game is recorded as refused with the reason.
      for (const [sideKey, s] of [["home", home], ["away", away]]) if (s.refused) manifest.refused.push({ providerEventId: String(row.providerEventId), side: sideKey, team: `${s.name} (${s.providerTeamId})`, reason: `ROSTER_GATE: ${s.refused}`, gate: s.gate });
      manifest.pool.gamesRefusedByRosterGate += 1;
      manifest.byLabel[label] -= 1;
      continue;
    }
    const eloP = winProbability(home.rating.rating, away.rating.rating, { neutralSite: row.neutralSite === true });
    let sim;
    if (engineV1) {
      try {
        sim = simulateGameV1({ providerEventId: row.providerEventId, inputAsOf: now, neutralSite: row.neutralSite === true, home, away, league: v1LeagueFor(population), eloWinProbability: eloP, simulations });
      } catch (e) {
        if (!/^REFUSED/.test(e.message)) throw e; // an invariant violation is a bug, never a refusal
        manifest.refused.push({ providerEventId: String(row.providerEventId), reason: `V1_ENGINE: ${e.message}` });
        manifest.byLabel[label] -= 1;
        continue;
      }
    } else {
      sim = (minutesV03 ? simulateGameV03 : simulateGame)({ providerEventId: row.providerEventId, inputAsOf: now, neutralSite: row.neutralSite === true, home, away, eloWinProbability: eloP, simulations });
    }
    manifest.poolRateSubstitutions += sim.assumptions.minutes.home.poolRateSubstitutions + sim.assumptions.minutes.away.poolRateSubstitutions;
    manifest.defaultSdSubstitutions += sim.assumptions.minutes.home.defaultSdSubstitutions + sim.assumptions.minutes.away.defaultSdSubstitutions;

    games.push({
      providerEventId: String(row.providerEventId),
      label, seasonType: row.seasonType, population,
      dateUtc: row.dateUtc, etDate: date, neutralSite: row.neutralSite === true, venue: row.venue ?? null,
      home: { name: home.name, abbr: home.abbr, providerTeamId: home.providerTeamId, rating: home.rating, minutesModel: { modelVersion: home.minutes.modelVersion, seasonUsed: home.minutes.seasonUsed, teamGamesInSeason: home.minutes.teamGamesInSeason, teamGamesInWindow: home.minutes.teamGamesInWindow, windowFromDateUtc: home.minutes.windowFromDateUtc, windowToDateUtc: home.minutes.windowToDateUtc }, rosterReconciliation: home.rosterReconciliation, ...(rosterGated ? { pool: home.pool } : {}) },
      away: { name: away.name, abbr: away.abbr, providerTeamId: away.providerTeamId, rating: away.rating, minutesModel: { modelVersion: away.minutes.modelVersion, seasonUsed: away.minutes.seasonUsed, teamGamesInSeason: away.minutes.teamGamesInSeason, teamGamesInWindow: away.minutes.teamGamesInWindow, windowFromDateUtc: away.minutes.windowFromDateUtc, windowToDateUtc: away.minutes.windowToDateUtc }, rosterReconciliation: away.rosterReconciliation, ...(rosterGated ? { pool: away.pool } : {}) },
      ...(rosterGated ? { poolVersion } : {}),
      // Stage 12-S1: the winner side is frozen beside the probabilities it comes from (N2: Elo, with the generation).
      forecast: { ...sim, ...frozenWinnerSide(sim, { head: DECIDED_WINNER_HEAD, generation: spec.modelVersion }) },
    });
    manifest.gamesForecast += 1;
  }

  const artifact = {
    schemaVersion: FORECAST_SCHEMA_VERSION,
    artifact: FORECAST_ARTIFACT,
    dataClass: DATA_CLASS,
    productEligible: false,
    neverReadBy: "app/src/app/** (public routes) — internal research only; sport-capability-registry keeps NBA HISTORICAL_ONLY",
    modelVersion: spec.modelVersion,
    ...(rosterGated ? { family: spec.family, poolRule: spec.poolRule, poolVersion, simEngineVersion: engineV1 ? NBA_SIM_V1_MODEL_VERSION : minutesV03 ? NBA_SIM_V03_MODEL_VERSION : NBA_SIM_MODEL_VERSION } : {}),
    ...(minutesV03 ? { minutesModelVersion: MINUTES_MODEL_V03_VERSION, ...(minutesV05 ? { eligibilityGateVersion: ELIGIBILITY_GATE_V05_VERSION } : {}), ...(spec.alignsWith ? { alignsWith: spec.alignsWith } : {}) } : {}),
    ...(engineV1 ? { profileVersion: V1_PROFILE_VERSION } : {}),
    ...(spec.dataRule !== "corpus-v1" ? { dataRule: spec.dataRule, role: spec.role } : {}),
    generatedAt: now,
    inputAsOf: now,
    date,
    labels: [...new Set(games.map((g) => g.label))].sort(),
    ratings: { params: ratings.params, targetSeason: ratings.targetSeason, boundaryRegressionApplied: ratings.boundaryRegressionApplied, folded: ratings.folded, lastFoldedDateUtc: ratings.lastFoldedDateUtc },
    roster: manifest.roster,
    games,
    manifest,
  };
  return { artifact, manifest };
}

/* ─────────────── grading ─────────────── */
const r4 = (x) => (x == null ? null : Number(x.toFixed(4)));
const clampP = (p) => Math.min(1 - 1e-12, Math.max(1e-12, p));
const logLoss = (p, y) => -(y ? Math.log(clampP(p)) : Math.log(1 - clampP(p)));

/**
 * Grade one forecast game against its final (+ optional box-score doc for player grading).
 *
 * @param game        artifact games[] entry
 * @param final       { ftHome, ftAway } integers (winner, score, total)
 * @param boxscore    box-score doc for the event, or null (player rows then absent, never zero)
 */
export function gradeForecastGame(game, final, boxscore = null) {
  if (!Number.isInteger(final?.ftHome) || !Number.isInteger(final?.ftAway) || final.ftHome === final.ftAway) {
    return { providerEventId: game.providerEventId, label: game.label, graded: false, reason: "final missing or tied" };
  }
  const y = final.ftHome > final.ftAway ? 1 : 0;
  const f = game.forecast;
  const winner = {};
  for (const [name, p] of [["elo", f.elo?.pHome], ["sim", f.sim?.pHome]]) {
    winner[name] = Number.isFinite(p) ? { p: p, y, brier: r4((p - y) ** 2), logLoss: r4(logLoss(p, y)), hit: (p >= 0.5 ? 1 : 0) === y ? 1 : 0 } : null;
  }
  const score = {
    homeErr: r4(f.sim.home.mean - final.ftHome), awayErr: r4(f.sim.away.mean - final.ftAway),
    homeAbsErr: r4(Math.abs(f.sim.home.mean - final.ftHome)), awayAbsErr: r4(Math.abs(f.sim.away.mean - final.ftAway)),
    marginErr: r4(f.sim.margin.mean - (final.ftHome - final.ftAway)), marginAbsErr: r4(Math.abs(f.sim.margin.mean - (final.ftHome - final.ftAway))),
    totalErr: r4(f.sim.total.mean - (final.ftHome + final.ftAway)), totalAbsErr: r4(Math.abs(f.sim.total.mean - (final.ftHome + final.ftAway))),
  };
  /* Session 10 · G5 — the facts the preregistered interval / overtime / timing metrics need, recorded per game
     (grader-metrics.mjs aggregates them). An interval the artifact did not store is null, never "outside". */
  const within = (q, actual) => (Number.isFinite(q?.p10) && Number.isFinite(q?.p90) ? (actual >= q.p10 && actual <= q.p90 ? 1 : 0) : null);
  // p25–p75 only where the artifact stored it (v1 does; v0/v0.1/v0.2 do not) — absent is null, never "outside".
  const within50 = (q, actual) => (Number.isFinite(q?.p25) && Number.isFinite(q?.p75) ? (actual >= q.p25 && actual <= q.p75 ? 1 : 0) : null);
  const intervals = {
    margin: { actual: final.ftHome - final.ftAway, p10: f.sim.margin?.p10 ?? null, p90: f.sim.margin?.p90 ?? null, inside80: within(f.sim.margin, final.ftHome - final.ftAway), inside50: within50(f.sim.margin, final.ftHome - final.ftAway) },
    total: { actual: final.ftHome + final.ftAway, p10: f.sim.total?.p10 ?? null, p90: f.sim.total?.p90 ?? null, inside80: within(f.sim.total, final.ftHome + final.ftAway), inside50: within50(f.sim.total, final.ftHome + final.ftAway) },
  };
  // Overtime (grader v2): the FACT comes from the caller (finals record / box-score minutes / summary periods — see
  // experimental-grading-ledger.mjs resolveOvertime); the PROBABILITY head is the sim's own P(OT): v1 models overtime
  // (`overtimeRate`), v0-family sims split regulation ties, so their regulation tie mass IS their P(OT).
  const pOvertime = Number.isFinite(f.sim?.overtimeRate) ? f.sim.overtimeRate : Number.isFinite(f.sim?.tieMass) ? f.sim.tieMass : null;
  const overtime = {
    simTieMass: Number.isFinite(f.sim?.tieMass) ? f.sim.tieMass : null,
    pOvertime,
    pOvertimeSource: Number.isFinite(f.sim?.overtimeRate) ? "sim.overtimeRate" : Number.isFinite(f.sim?.tieMass) ? "sim.tieMass" : null,
    actual: typeof final.overtime === "boolean" ? final.overtime : null,
    periods: Number.isInteger(final.periods) ? final.periods : null,
    source: typeof final.overtime === "boolean" ? final.overtimeSource ?? final.source ?? null : null,
  };
  const timing = { inputAsOf: f.inputAsOf ?? null, tipUtc: game.dateUtc ?? null, preTip: Number.isFinite(Date.parse(f.inputAsOf ?? "")) && Number.isFinite(Date.parse(game.dateUtc ?? "")) ? Date.parse(f.inputAsOf) < Date.parse(game.dateUtc) : null };

  let players = null;
  if (boxscore?.boxscoreAvailable) {
    players = { rows: [], predictedButAbsent: [], playedButUnpredicted: [], predictedButDnp: [], nullMinutesActual: 0 };
    for (const sideKey of ["home", "away"]) {
      const teamId = game[sideKey].providerTeamId;
      const predicted = new Map((f.players[sideKey] ?? []).map((p) => [p.providerAthleteId, p]));
      const actualRows = (boxscore.players ?? []).filter((p) => String(p.providerTeamId) === teamId);
      const seen = new Set();
      for (const a of actualRows) {
        const id = String(a.providerAthleteId);
        seen.add(id);
        const pred = predicted.get(id);
        if (a.didNotPlay) { if (pred) players.predictedButDnp.push({ side: sideKey, providerAthleteId: id, name: a.name, expectedMinutes: pred.expectedMinutes, dnpReason: a.dnpReason, availability: pred.availability ?? null, injuryStatus: pred.injuryStatus ?? null }); continue; }
        if (!Number.isInteger(a.minutes)) { players.nullMinutesActual += 1; continue; }
        if (!pred) { players.playedButUnpredicted.push({ side: sideKey, providerAthleteId: id, name: a.name, minutes: a.minutes, pts: a.pts }); continue; }
        // Minutes error: predicted expected minutes vs actual minutes (the minutes model's own error).
        // Conditional production error: actual minutes × predicted rate vs actual stat (rate error alone).
        const row = { side: sideKey, providerAthleteId: id, name: a.name, expectedMinutes: pred.expectedMinutes, actualMinutes: a.minutes, minutesAbsErr: r4(Math.abs(pred.expectedMinutes - a.minutes)), ratesBasis: pred.ratesBasis, conditional: {}, unconditional: {}, rates: {}, inside80: {}, atOrAboveMedian: {} };
        // Grader v2 (additive): signed errors (forecast − actual, the repo convention) so bias and RMSE are computable;
        // the prediction's availability / injury status and the box score's starter flag, for the §9 slices.
        row.minutesErr = r4(pred.expectedMinutes - a.minutes);
        row.minutesInside80 = Number.isFinite(pred.minutes?.p10) && Number.isFinite(pred.minutes?.p90) ? (a.minutes >= pred.minutes.p10 && a.minutes <= pred.minutes.p90 ? 1 : 0) : null;
        row.availability = pred.availability ?? null;
        row.injuryStatus = pred.injuryStatus ?? null;
        row.starterActual = typeof a.starter === "boolean" ? a.starter : null;
        row.signed = {};
        for (const k of STAT_KEYS) {
          const rate = pred.rates?.[k];
          row.rates[k] = Number.isFinite(rate) ? rate : null;
          // Unconditional error and coverage need only the simulated distribution; conditional needs the rate too.
          row.signed[k] = Number.isInteger(a[k]) && Number.isFinite(pred[k]?.mean) ? r4(pred[k].mean - a[k]) : null;
          if (!Number.isInteger(a[k]) || !Number.isFinite(rate)) { row.conditional[k] = null; row.unconditional[k] = null; row.inside80[k] = null; row.atOrAboveMedian[k] = null; continue; }
          row.conditional[k] = r4(Math.abs(a.minutes * rate - a[k]));
          row.unconditional[k] = r4(Math.abs(pred[k].mean - a[k]));
          row.inside80[k] = Number.isFinite(pred[k]?.p10) && Number.isFinite(pred[k]?.p90) ? (a[k] >= pred[k].p10 && a[k] <= pred[k].p90 ? 1 : 0) : null;
          row.atOrAboveMedian[k] = Number.isFinite(pred[k]?.p50) ? (a[k] >= pred[k].p50 ? 1 : 0) : null;
        }
        // Joint combinations (§5: PRA, P+A, P+R — coverage of the frozen joint quantiles; never separately fitted).
        row.combos = {};
        for (const [ck, parts] of Object.entries(COMBO_PARTS)) {
          const actual = parts.every((k) => Number.isInteger(a[k])) ? parts.reduce((s, k) => s + a[k], 0) : null;
          const q = pred[ck];
          row.combos[ck] = actual == null || !Number.isFinite(q?.mean) ? null : {
            actual, signed: r4(q.mean - actual),
            inside80: Number.isFinite(q.p10) && Number.isFinite(q.p90) ? (actual >= q.p10 && actual <= q.p90 ? 1 : 0) : null,
          };
        }
        // Distribution scores over the FROZEN receipt quantiles (distribution-scores.mjs): per-level pinball, interval
        // scores, P(X ≥ k) at the standard thresholds. Never over draws or mean/sd.
        row.dist = {};
        for (const m of ["pts", "reb", "ast", "threePm"]) row.dist[m] = Number.isInteger(a[m]) ? scoreQuantileBlock(pred[m], a[m], { market: m }) : null;
        for (const [ck, parts] of Object.entries(COMBO_PARTS)) row.dist[ck] = parts.every((k) => Number.isInteger(a[k])) ? scoreQuantileBlock(pred[ck], parts.reduce((s, k) => s + a[k], 0), { market: ck }) : null;
        row.dist.minutes = scoreQuantileBlock(pred.minutes, a.minutes, { market: "minutes" });
        players.rows.push(row);
      }
      for (const [id, pred] of predicted) if (!seen.has(id)) players.predictedButAbsent.push({ side: sideKey, providerAthleteId: id, name: pred.name, expectedMinutes: pred.expectedMinutes, availability: pred.availability ?? null, injuryStatus: pred.injuryStatus ?? null });
    }
    players.pace = paceFromBoxscore(boxscore, game);
  }

  const dist = {
    margin: scoreQuantileBlock(f.sim.margin, final.ftHome - final.ftAway, { market: "margin" }),
    total: scoreQuantileBlock(f.sim.total, final.ftHome + final.ftAway, { market: "total" }),
  };
  return { providerEventId: game.providerEventId, label: game.label, seasonType: game.seasonType, population: game.population, dateUtc: game.dateUtc, graded: true, final: { ftHome: final.ftHome, ftAway: final.ftAway, source: final.source ?? null }, winner, score, intervals, overtime, timing, players, dist };
}

const meanOf = (xs) => (xs.length ? r4(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

/** Aggregate graded games into separate preseason / regular buckets (never pooled). */
export function summariseGrades(graded) {
  const buckets = {};
  for (const label of Object.values(LABELS)) {
    const gs = graded.filter((g) => g.graded && g.label === label);
    const w = (m) => { const l = gs.map((g) => g.winner?.[m]).filter(Boolean); return l.length ? { n: l.length, brier: meanOf(l.map((x) => x.brier)), logLoss: meanOf(l.map((x) => x.logLoss)), accuracy: meanOf(l.map((x) => x.hit)) } : { n: 0 }; };
    const prow = gs.flatMap((g) => g.players?.rows ?? []);
    const cond = (k) => meanOf(prow.map((r) => r.conditional[k]).filter((x) => x != null));
    const uncond = (k) => meanOf(prow.map((r) => r.unconditional[k]).filter((x) => x != null));
    buckets[label] = {
      games: gs.length,
      winner: { elo: w("elo"), sim: w("sim") },
      score: gs.length ? {
        homeMAE: meanOf(gs.map((g) => g.score.homeAbsErr)), awayMAE: meanOf(gs.map((g) => g.score.awayAbsErr)),
        marginMAE: meanOf(gs.map((g) => g.score.marginAbsErr)), marginBias: meanOf(gs.map((g) => g.score.marginErr)),
        totalMAE: meanOf(gs.map((g) => g.score.totalAbsErr)), totalBias: meanOf(gs.map((g) => g.score.totalErr)),
      } : null,
      players: {
        gamesWithBoxscore: gs.filter((g) => g.players).length,
        matchedRows: prow.length,
        minutesMAE: meanOf(prow.map((r) => r.minutesAbsErr)),
        conditionalMAE: Object.fromEntries(STAT_KEYS.map((k) => [k, cond(k)])),
        unconditionalMAE: Object.fromEntries(STAT_KEYS.map((k) => [k, uncond(k)])),
        predictedButAbsent: gs.reduce((s, g) => s + (g.players?.predictedButAbsent.length ?? 0), 0),
        predictedButDnp: gs.reduce((s, g) => s + (g.players?.predictedButDnp.length ?? 0), 0),
        playedButUnpredicted: gs.reduce((s, g) => s + (g.players?.playedButUnpredicted.length ?? 0), 0),
        nullMinutesActual: gs.reduce((s, g) => s + (g.players?.nullMinutesActual ?? 0), 0),
      },
    };
  }
  return buckets;
}
