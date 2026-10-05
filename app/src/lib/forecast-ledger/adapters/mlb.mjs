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
 *
 * NOT HERE (stated, not hidden): MLB projected score / simulation-median total (published, never graded by an owner
 * → reported UNMEASURED in coverage) and the MLB player-prop leans (every market DEMOTED to market context → RESEARCH,
 * never public forecast history).
 */
import { FORECAST_KIND, RECOVERABILITY } from "../contract.mjs";
import { measureBinary, withDirectional } from "../measure.mjs";
import { makeRow, marketBlock } from "../row.mjs";

const FAMILY = { moneyline: "mlb_moneyline", run_line: "mlb_run_line", total: "mlb_total" };
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
export function homerNukesRows(settledFiles = []) {
  const out = [];
  for (const { file, doc } of settledFiles) {
    for (const p of doc?.picks ?? []) {
      if (!Number.isInteger(p.gamePk) || p.playerId == null || !isNum(p.probability)) continue;
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
      out.push(makeRow({
        sport: "MLB",
        competition: "MLB",
        season: typeof doc.date === "string" ? doc.date.slice(0, 4) : null,
        eventId: String(p.gamePk),
        eventStart: null, // the settled file does not record first pitch
        matchup: p.matchup ?? null,
        subjectType: "PLAYER",
        subjectId: `mlbam-${p.playerId}`,
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
      }));
    }
  }
  return out;
}
