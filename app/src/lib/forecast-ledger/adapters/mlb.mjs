/**
 * MLB → Forecast Ledger rows. Pure.
 *
 * GAME PREDICTIONS (owner: grade-game-predictions.mjs → public/data/mlb/results/game-predictions-graded.jsonl,
 * append-only, one row per (gamePk, market), each carrying the pre-first-pitch forecast it graded and its source —
 * a prediction snapshot or the git commit of the predictions file). Each published market pick is one BINARY
 * observation: the model's probability that the PUBLISHED PICK wins, with the owner's WIN / LOSS / PUSH carried as
 * the directional word (basis PUBLISHED_PICK). A PUSH is VOID for the probability score — the binary event neither
 * happened nor failed. The market's implied probability is context, typed as such.
 *
 * HOMER NUKES (owner: settle-homer-nukes.mjs → homer-nukes/settled-<date>.json). BINARY P(player homers). The
 * published day file is overwritten during the day and has no frozen copy, so these rows are labelled
 * OWNER_SETTLED_UNFROZEN and carry no publication time (the settled file does not record one).
 *   POSTPONED + RE-PUBLISHED (founder decision 2026-10-19, option B). When a game (gamePk) appears in more than one
 *   day's settled file, it was postponed off every earlier slate and the owner published it again. Every still-PENDING
 *   pick for that game on an earlier slate is VOID (reason POSTPONED_REPUBLISHED — never a miss, never measured),
 *   whether or not that player was picked again. PENDING → VOID is an allowed append-only move and the row keeps its
 *   committed id. A player picked on more than one slate: the earliest publication keeps the plain identity; every
 *   later one is its own forecast with identity qualified by `slate:<date>`, graded on its own result. An earlier pick
 *   the owner already GRADED is never voided — and if that player was picked again, the same id appears twice, which
 *   stays a duplicate-id defect and fails the build, as compose.mjs requires.
 *
 * PROJECTED SCORE + SIMULATION-MEDIAN TOTAL (owner: grade-projected-scores.mjs → game-projected-scores-graded.jsonl,
 * Block A, re-opening the SAME revision the game owner graded and reproducing its probabilities exactly). CONTINUOUS:
 *   mlb_projected_runs   one row per team (subject mlb-team-<id>, exact unique abbreviation; unresolved = not emitted)
 *   mlb_projected_total  one row per game (the simulation median of total runs — NOT the sum of the two team medians)
 * Measured by error only. A median carries no W/L: the published total PICK is already its own family (mlb_total).
 *
 * NOT HERE (stated, not hidden): the MLB player-prop leans (every market DEMOTED to market context → RESEARCH, never
 * public forecast history).
 */
import { FORECAST_KIND, RECOVERABILITY } from "../contract.mjs";
import { measureBinary, measureContinuous, withDirectional } from "../measure.mjs";
import { makeRow, marketBlock } from "../row.mjs";

// run_line = decision engine v1 (±1.5 off the simulated favourite); run_line_posted = v2 (the sportsbook's posted
// line, TRUTH-001). Two families, never one record.
const FAMILY = { moneyline: "mlb_moneyline", run_line: "mlb_run_line", run_line_posted: "mlb_run_line_posted", total: "mlb_total" };
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * @param graded         parsed jsonl rows
 * @param sourceModels   optional Map<forecastSource, {modelId, modelVersion}> read from the exact source the owner
 *                       graded (a prediction snapshot). Absent → null; never filled from today's registry.
 */
export function mlbGameRows(graded = [], sourceModels = new Map()) {
  const out = [];
  for (const g of graded) {
    const family = FAMILY[g.market];
    if (!family || !Number.isInteger(g.gamePk) || !isNum(g.modelProbability)) continue;
    const src = sourceModels.get(g.forecastSource) ?? null;
    const outcome = g.outcome;
    let settlement = { state: "PENDING" };
    let measurement = {};
    if (outcome === "WIN" || outcome === "LOSS") {
      settlement = { state: "SETTLED", finalValue: outcome === "WIN" ? 1 : 0, finalCategory: outcome, settledAt: g.gradedAt ?? null, finality: "CANONICAL", source: g.resultSource ?? null };
      measurement = withDirectional(measureBinary({ probability: g.modelProbability, observed: outcome === "WIN" ? 1 : 0 }), { result: outcome, basis: "PUBLISHED_PICK" });
    } else if (outcome === "PUSH") {
      settlement = { state: "VOID", finalCategory: "PUSH", settledAt: g.gradedAt ?? null, finality: "CANONICAL", source: g.resultSource ?? null, reason: "PUSH" };
      measurement = withDirectional({}, { result: "PUSH", basis: "PUBLISHED_PICK" });
    }
    out.push(makeRow({
      sport: "MLB",
      competition: "MLB",
      season: typeof g.date === "string" ? g.date.slice(0, 4) : null,
      eventId: String(g.gamePk),
      eventStart: g.firstPitchUtc ?? null,
      matchup: g.matchup ?? null,
      subjectType: "GAME",
      subjectId: `mlb-${g.gamePk}`,
      subjectDisplay: g.matchup ?? null,
      family,
      forecastKind: FORECAST_KIND.BINARY,
      modelId: src?.modelId ?? null,
      modelVersion: src?.modelVersion ?? null,
      publicationSurface: "mlb-game-prediction",
      receiptId: g.forecastSource ?? null,
      publishedAt: g.forecastGeneratedAt ?? null,
      probability: g.modelProbability,
      probabilityType: "MODEL",
      direction: g.pick ?? null,
      categoryPrediction: g.pick ?? null,
      market: marketBlock({ line: isNum(g.line) ? g.line : null, impliedProbability: isNum(g.marketImpliedProbability) ? g.marketImpliedProbability : null }),
      settlement,
      measurement,
      recoverability: RECOVERABILITY.OWNER_GRADED_LOG,
    }));
  }
  return out;
}

/** @param settledFiles [{ file, doc }] homer-nukes settled-<date>.json */
export const POSTPONED_REPUBLISHED = "POSTPONED_REPUBLISHED";

export function homerNukesRows(settledFiles = []) {
  const out = [];
  const usable = (p) => Number.isInteger(p?.gamePk) && p?.playerId != null && isNum(p?.probability);
  // Publications of each (gamePk, player), in slate order — the republication rule needs the whole set first.
  const slateOf = ({ file, doc }) => (typeof doc?.date === "string" ? doc.date : (String(file).match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? ""));
  const pubs = new Map();
  const gameSlates = new Map();
  for (const f of settledFiles) {
    for (const p of f.doc?.picks ?? []) {
      if (!usable(p)) continue;
      const k = `${p.gamePk}|${p.playerId}`;
      if (!pubs.has(k)) pubs.set(k, []);
      pubs.get(k).push(slateOf(f));
      if (!gameSlates.has(p.gamePk)) gameSlates.set(p.gamePk, new Set());
      gameSlates.get(p.gamePk).add(slateOf(f));
    }
  }
  for (const list of pubs.values()) list.sort();
  const lastSlateOfGame = new Map([...gameSlates].map(([g, set]) => [g, [...set].sort().at(-1)]));
  for (const f of settledFiles) {
    const { file, doc } = f;
    const slate = slateOf(f);
    for (const p of doc?.picks ?? []) {
      if (!usable(p)) continue;
      const slates = pubs.get(`${p.gamePk}|${p.playerId}`);
      const republished = slates.length > 1 && new Set(slates).size === slates.length;
      const isFirst = slate === slates[0];
      const gameLater = lastSlateOfGame.get(p.gamePk);
      const postponedOffThisSlate = slate < gameLater;
      let settlement = { state: "PENDING" };
      let measurement = {};
      if (p.result === "hit" || p.result === "miss") {
        const observed = p.result === "hit" ? 1 : 0;
        settlement = { state: "SETTLED", finalValue: Number.isInteger(p.homeRuns) ? p.homeRuns : null, finalCategory: p.result.toUpperCase(), settledAt: doc.settledAt ?? null, finality: "CANONICAL", source: p.source ?? doc.source ?? null };
        measurement = measureBinary({ probability: p.probability, observed });
      } else if (p.result === "pending" && /absent from the official box score/.test(String(p.note ?? ""))) {
        // The owner's own words: a possible scratch is "never graded as a miss". Unmeasured, not pending forever.
        settlement = { state: "NO_MEASUREMENT", reason: "ABSENT_FROM_OFFICIAL_BOX_SCORE" };
      } else if (p.result !== "pending") {
        settlement = { state: "NO_MEASUREMENT", reason: `OWNER_RESULT_${String(p.result).toUpperCase()}` };
      }
      // Postponed + re-published: an earlier, still-pending publication is VOID; a graded earlier one is left alone
      // (same id twice → the build refuses, as it must). Measurement is cleared for a VOID row.
      if (postponedOffThisSlate && p.result === "pending") {
        settlement = { state: "VOID", finalCategory: "VOID", reason: POSTPONED_REPUBLISHED, source: `game re-published on the ${gameLater} slate` };
        measurement = {};
      }
      out.push(makeRow({
        sport: "MLB",
        competition: "MLB",
        season: typeof doc.date === "string" ? doc.date.slice(0, 4) : null,
        eventId: String(p.gamePk),
        eventStart: null, // the settled file does not record first pitch
        matchup: p.matchup ?? null,
        subjectType: "PLAYER",
        subjectId: `mlb-player-${p.playerId}`, // the platform's canonical player id (research-projection index): MLBAM number
        subjectDisplay: p.player ?? null,
        teamId: p.teamAbbr ?? null,
        family: "mlb_homer_nukes",
        forecastKind: FORECAST_KIND.BINARY,
        modelId: doc.modelId ?? null,
        modelStatusAtPublish: null,
        publicationSurface: "homer-nukes",
        receiptId: file,
        publishedAt: null,
        probability: p.probability,
        probabilityType: "MODEL",
        direction: "HITS_HOME_RUN",
        settlement,
        measurement,
        recoverability: RECOVERABILITY.OWNER_SETTLED_UNFROZEN,
        ...(republished && !isFirst ? {
          identityQualifier: `slate:${slate}`,
          provenance: { notes: [`re-publication on the ${slate} slate of a game first published on ${slates[0]} (postponed); its own forecast`] },
        } : {}),
        ...(postponedOffThisSlate && p.result === "pending" && isFirst ? {
          provenance: { notes: [`postponed off the ${slate} slate; the game was re-published on ${gameLater}`] },
        } : {}),
      }));
    }
  }
  return out;
}

/**
 * @param graded   parsed game-projected-scores-graded.jsonl rows
 * @param teamIds  Map<abbreviation, mlb-team-<id>> (exact, unique)
 * @returns {{ rows, unresolved }}
 */
export function mlbProjectedRows(graded = [], teamIds = new Map()) {
  const out = [];
  let unresolved = 0;
  for (const g of graded) {
    if (!Number.isInteger(g.gamePk)) continue;
    const fin = Number.isInteger(g.actual?.awayRuns) && Number.isInteger(g.actual?.homeRuns);
    const base = {
      sport: "MLB",
      competition: "MLB",
      season: typeof g.date === "string" ? g.date.slice(0, 4) : null,
      eventId: String(g.gamePk),
      eventStart: g.firstPitchUtc ?? null,
      matchup: g.matchup ?? null,
      forecastKind: FORECAST_KIND.CONTINUOUS,
      modelId: g.modelId ?? null,
      publicationSurface: "mlb-game-prediction",
      receiptId: g.forecastSource ?? null,
      publishedAt: g.forecastGeneratedAt ?? null,
      recoverability: RECOVERABILITY.OWNER_GRADED_LOG,
    };
    const settle = (finalValue, projection) => fin
      ? { settlement: { state: "SETTLED", finalValue, settledAt: g.gradedAt ?? null, finality: "CANONICAL", source: g.resultSource ?? null }, measurement: measureContinuous({ projection, finalValue }) }
      : { settlement: { state: "PENDING" }, measurement: {} };
    for (const side of ["away", "home"]) {
      const projection = g.projectedScore?.[side];
      if (!isNum(projection)) continue;
      const abbr = side === "away" ? g.awayTeam : g.homeTeam;
      const teamId = abbr ? teamIds.get(abbr) ?? null : null;
      if (!teamId) { unresolved += 1; continue; }
      out.push(makeRow({
        ...base,
        subjectType: "TEAM",
        subjectId: teamId,
        subjectDisplay: abbr,
        teamId,
        family: "mlb_projected_runs",
        projection,
        direction: g.projectedScore.label ?? null,
        ...settle(side === "away" ? g.actual?.awayRuns : g.actual?.homeRuns, projection),
      }));
    }
    if (isNum(g.simulationMedianTotal)) {
      out.push(makeRow({
        ...base,
        subjectType: "GAME",
        subjectId: `mlb-${g.gamePk}`,
        subjectDisplay: g.matchup ?? null,
        family: "mlb_projected_total",
        projection: g.simulationMedianTotal,
        direction: "Simulation median total runs",
        ...settle(fin ? g.actual.awayRuns + g.actual.homeRuns : null, g.simulationMedianTotal),
      }));
    }
  }
  return { rows: out, unresolved };
}
