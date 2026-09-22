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
 */
import { buildTeamRatings, ratingFor, winProbability, seasonOfDate } from "./team-rating.mjs";
import { expectedMinutes } from "./minutes-model.mjs";
import { simulateGame, DEFAULT_SIMULATIONS, NBA_SIM_MODEL_VERSION } from "./game-sim.mjs";

export const FORECAST_ARTIFACT = "nba-experimental-forecasts";
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
 * Build the forecast artifact for one ET date. Pure given already-loaded inputs.
 *
 * @param date          YYYY-MM-DD (ET)
 * @param now           ISO — ratings/minutes as-of; also the leakage cutoff
 * @param scheduleRows  schedule capture rows[]
 * @param corpusRows    corpus-v1 rows[]
 * @param boxscores     box-score docs[]
 * @param injuries      injuries feed entries[] (null → availability unknown)
 */
export function buildForecastArtifact({ date, now, scheduleRows, corpusRows, boxscores, injuries = null, simulations = DEFAULT_SIMULATIONS }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error("REFUSED: --date YYYY-MM-DD required");
  if (typeof now !== "string" || !Number.isFinite(Date.parse(now))) throw new Error("REFUSED: --now ISO required");

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
      const minutes = expectedMinutes({ boxscores, teamProviderId: s?.providerTeamId, asOfDateUtc: now, injuries, population });
      if (minutes.teamGamesInSeason === 0) noteTeam(manifest.teamsWithoutBoxscoreHistory, `${name} (${s?.providerTeamId}) [${population}]`);
      for (const p of minutes.rows) {
        manifest.minutesBasisCounts[p.basis] += 1;
        if (p.availability === "out") manifest.playersOut += 1;
        else if (p.expectedMinutes != null) manifest.playersWithExpectedMinutes += 1;
        else manifest.playersNoMinutes += 1;
        if (p.basis === "insufficient") manifest.playersInsufficient += 1;
      }
      for (const u of minutes.unmatchedInjuries) manifest.playersUnknownToHistory.push({ team: name, providerTeamId: String(s?.providerTeamId), ...u });
      return { name, abbr: s?.abbr ?? null, providerTeamId: String(s?.providerTeamId), rating, minutes };
    };
    const home = side(row.home);
    const away = side(row.away);
    const eloP = winProbability(home.rating.rating, away.rating.rating, { neutralSite: row.neutralSite === true });
    const sim = simulateGame({ providerEventId: row.providerEventId, inputAsOf: now, neutralSite: row.neutralSite === true, home, away, eloWinProbability: eloP, simulations });
    manifest.poolRateSubstitutions += sim.assumptions.minutes.home.poolRateSubstitutions + sim.assumptions.minutes.away.poolRateSubstitutions;
    manifest.defaultSdSubstitutions += sim.assumptions.minutes.home.defaultSdSubstitutions + sim.assumptions.minutes.away.defaultSdSubstitutions;

    games.push({
      providerEventId: String(row.providerEventId),
      label, seasonType: row.seasonType, population,
      dateUtc: row.dateUtc, etDate: date, neutralSite: row.neutralSite === true, venue: row.venue ?? null,
      home: { name: home.name, abbr: home.abbr, providerTeamId: home.providerTeamId, rating: home.rating, minutesModel: { modelVersion: home.minutes.modelVersion, seasonUsed: home.minutes.seasonUsed, teamGamesInSeason: home.minutes.teamGamesInSeason, teamGamesInWindow: home.minutes.teamGamesInWindow, windowFromDateUtc: home.minutes.windowFromDateUtc, windowToDateUtc: home.minutes.windowToDateUtc } },
      away: { name: away.name, abbr: away.abbr, providerTeamId: away.providerTeamId, rating: away.rating, minutesModel: { modelVersion: away.minutes.modelVersion, seasonUsed: away.minutes.seasonUsed, teamGamesInSeason: away.minutes.teamGamesInSeason, teamGamesInWindow: away.minutes.teamGamesInWindow, windowFromDateUtc: away.minutes.windowFromDateUtc, windowToDateUtc: away.minutes.windowToDateUtc } },
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
    modelVersion: NBA_SIM_MODEL_VERSION,
    generatedAt: now,
    inputAsOf: now,
    date,
    labels: [...new Set(games.map((g) => g.label))].sort(),
    ratings: { params: ratings.params, targetSeason: ratings.targetSeason, boundaryRegressionApplied: ratings.boundaryRegressionApplied, folded: ratings.folded, lastFoldedDateUtc: ratings.lastFoldedDateUtc },
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
