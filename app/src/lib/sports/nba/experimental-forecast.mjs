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

export const FORECAST_ARTIFACT = "nba-experimental-forecasts";
/**
 * Artifact FAMILIES (v1.8 A1). v0 is frozen exactly as preregistered (docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md
 * §1) and keeps its directory, its ledger and its model-version string. v0.1 is the roster-gated pool: same
 * Elo, same minutes model, same seeded simulation engine — only the POOL rule changes — written to its own
 * directory with its own ledger so the two are graded side by side and neither rewrites the other.
 */
export const FAMILIES = Object.freeze({
  "v0": Object.freeze({ family: "v0", poolRule: "box-score-history", modelVersion: "nba-preseason-experimental-v0", dir: "experimental" }),
  "v0.1": Object.freeze({ family: "v0.1", poolRule: "roster-gated", modelVersion: "nba-preseason-experimental-v0.1", dir: "experimental-v0.1" }),
});
export function familySpec(family) {
  const f = FAMILIES[String(family ?? "v0")];
  if (!f) throw new Error(`REFUSED: unknown NBA experimental family ${JSON.stringify(family)} (${Object.keys(FAMILIES).join(", ")})`);
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
  // v0.1 FAILS CLOSED on a missing roster capture at the artifact level too: no roster, no forecast, no fallback.
  if (rosterGated && !rosters) throw new Error("REFUSED: family v0.1 requires a roster capture (rosters/latest.json) — it never falls back to box-score membership");
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
    minutesBasisCounts: { trailing10: 0, season: 0, insufficient: 0 },
    poolRateSubstitutions: 0, defaultSdSubstitutions: 0,
    gamesAlreadyStartedAtNow: 0,
    family: spec.family, poolRule: spec.poolRule,
    pool: rosterGated ? { poolVersion: ROSTER_GATED_POOL_VERSION, rosterPlayers: 0, playersSimulated: 0, playersInsufficientHistory: 0, playersExcludedNotOnRoster: 0, playersOtherTeamHistory: 0, gamesRefusedByRosterGate: 0 } : { poolVersion: null, rule: "v0: box-score history" },
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
        const gated = gatePool({ rosters, providerTeamId: s?.providerTeamId, boxscores, asOfDateUtc: now, injuries, population, teamMinutesCache });
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
      return { name, abbr: s?.abbr ?? null, providerTeamId: String(s?.providerTeamId), rating, minutes, rosterReconciliation, pool };
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
    const sim = simulateGame({ providerEventId: row.providerEventId, inputAsOf: now, neutralSite: row.neutralSite === true, home, away, eloWinProbability: eloP, simulations });
    manifest.poolRateSubstitutions += sim.assumptions.minutes.home.poolRateSubstitutions + sim.assumptions.minutes.away.poolRateSubstitutions;
    manifest.defaultSdSubstitutions += sim.assumptions.minutes.home.defaultSdSubstitutions + sim.assumptions.minutes.away.defaultSdSubstitutions;

    games.push({
      providerEventId: String(row.providerEventId),
      label, seasonType: row.seasonType, population,
      dateUtc: row.dateUtc, etDate: date, neutralSite: row.neutralSite === true, venue: row.venue ?? null,
      home: { name: home.name, abbr: home.abbr, providerTeamId: home.providerTeamId, rating: home.rating, minutesModel: { modelVersion: home.minutes.modelVersion, seasonUsed: home.minutes.seasonUsed, teamGamesInSeason: home.minutes.teamGamesInSeason, teamGamesInWindow: home.minutes.teamGamesInWindow, windowFromDateUtc: home.minutes.windowFromDateUtc, windowToDateUtc: home.minutes.windowToDateUtc }, rosterReconciliation: home.rosterReconciliation, ...(rosterGated ? { pool: home.pool } : {}) },
      away: { name: away.name, abbr: away.abbr, providerTeamId: away.providerTeamId, rating: away.rating, minutesModel: { modelVersion: away.minutes.modelVersion, seasonUsed: away.minutes.seasonUsed, teamGamesInSeason: away.minutes.teamGamesInSeason, teamGamesInWindow: away.minutes.teamGamesInWindow, windowFromDateUtc: away.minutes.windowFromDateUtc, windowToDateUtc: away.minutes.windowToDateUtc }, rosterReconciliation: away.rosterReconciliation, ...(rosterGated ? { pool: away.pool } : {}) },
      ...(rosterGated ? { poolVersion: ROSTER_GATED_POOL_VERSION } : {}),
      forecast: sim,
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
    ...(rosterGated ? { family: spec.family, poolRule: spec.poolRule, poolVersion: ROSTER_GATED_POOL_VERSION, simEngineVersion: NBA_SIM_MODEL_VERSION } : {}),
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
        if (a.didNotPlay) { if (pred) players.predictedButDnp.push({ side: sideKey, providerAthleteId: id, name: a.name, expectedMinutes: pred.expectedMinutes, dnpReason: a.dnpReason }); continue; }
        if (!Number.isInteger(a.minutes)) { players.nullMinutesActual += 1; continue; }
        if (!pred) { players.playedButUnpredicted.push({ side: sideKey, providerAthleteId: id, name: a.name, minutes: a.minutes, pts: a.pts }); continue; }
        // Minutes error: predicted expected minutes vs actual minutes (the minutes model's own error).
        // Conditional production error: actual minutes × predicted rate vs actual stat (rate error alone).
        const row = { side: sideKey, providerAthleteId: id, name: a.name, expectedMinutes: pred.expectedMinutes, actualMinutes: a.minutes, minutesAbsErr: r4(Math.abs(pred.expectedMinutes - a.minutes)), ratesBasis: pred.ratesBasis, conditional: {}, unconditional: {} };
        for (const k of STAT_KEYS) {
          const rate = pred.rates?.[k];
          if (!Number.isInteger(a[k]) || !Number.isFinite(rate)) { row.conditional[k] = null; row.unconditional[k] = null; continue; }
          row.conditional[k] = r4(Math.abs(a.minutes * rate - a[k]));
          row.unconditional[k] = r4(Math.abs(pred[k].mean - a[k]));
        }
        players.rows.push(row);
      }
      for (const [id, pred] of predicted) if (!seen.has(id)) players.predictedButAbsent.push({ side: sideKey, providerAthleteId: id, name: pred.name, expectedMinutes: pred.expectedMinutes });
    }
  }

  return { providerEventId: game.providerEventId, label: game.label, seasonType: game.seasonType, population: game.population, dateUtc: game.dateUtc, graded: true, final: { ftHome: final.ftHome, ftAway: final.ftAway, source: final.source ?? null }, winner, score, players };
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
