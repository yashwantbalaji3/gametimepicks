/**
 * LEVEL A · OFFICIAL FROZEN FORECAST READERS. Node-only, READ-ONLY. Each reader turns one sport's OFFICIAL forecast
 * artifact into ForecastSelection rows (lib/products/level-a/suggestions.mjs). It copies the owner's own pick and
 * probability verbatim, reads no sportsbook field, and writes nothing. A missing or unreadable artifact yields no
 * rows (never a guess). Only sports OPEN in the registry's Level A axis are read.
 *
 *   MLB      data/internal/mlb/prediction-snapshots/<date>/<latest>.json (official snapshot): predictedWinner +
 *            moneyline.simulationProbability; first pitch from its own source artifact (full-game-simulations/<date>).
 *            The snapshot's `market` block (de-vigged sportsbook prices) is NEVER read.
 *   NBA      app/public/data/nba/experimental-public/<date>.json, the public lane publication of the official
 *            composition (nba-official-composition@1): the Elo favoured SIDE; probability withheld (founder N2). Its
 *            v0.1 player MEDIANS are returned separately as Predicted Player Statistics (no line, never a leg); the
 *            lane withholds ranges, so this reader has none to return. No lane file for the day, no NBA.
 *   EPL      through the EPL lane's own reader (sports/epl/forecast-view.ts: loadEplForecasts + forecastRows, the
 *            same rows /epl publishes): the most likely of home / draw / away and its probability; the full 1X2
 *            split is the uncertainty shown beside it. The lane owns that artifact; nothing here names its path.
 *   Ligue 1  app/public/data/soccer/ligue-1/forecasts/latest.json (model-only rows, each with forecastAt): the same.
 */
import fs from "node:fs";
import path from "node:path";
import { canEnterModelSuggestions } from "../../sport-capability-registry.ts";
import { loadEplForecasts, forecastRows as eplForecastRows } from "../../sports/epl/forecast-view.ts";

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const OUTCOME_LABEL = { home: "home win", draw: "draw", away: "away win" };

export function mlbSelections({ repoRoot, date }) {
  const dir = path.join(repoRoot, "data", "internal", "mlb", "prediction-snapshots", date);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^snapshot-\d+\.json$/.test(f)).sort(); } catch { return []; }
  const snap = files.length ? readJson(path.join(dir, files.at(-1))) : null;
  if (!snap) return [];
  const sims = readJson(path.join(repoRoot, "app", "public", "data", "mlb", "full-game-simulations", `${date}.json`));
  const firstPitch = new Map((sims?.games ?? []).map((g) => [String(g.gamePk), g.firstPitch]));
  return (snap.predictions ?? []).filter((p) => p?.status === "ready" && p?.completeness?.startedBeforeGeneration !== true).map((p) => {
    const side = p.moneyline?.side ?? p.predictedWinner?.side ?? null;
    const team = p.moneyline?.team ?? p.predictedWinner?.team ?? null;
    return {
      sport: "mlb", eventId: String(p.gamePk), eventLabel: `${p.awayTeamName ?? p.awayTeam} @ ${p.homeTeamName ?? p.homeTeam}`,
      startUtc: firstPitch.get(String(p.gamePk)) ?? null, market: "winner",
      selection: side ? { code: side, label: `${team ?? side} to win` } : null,
      probability: typeof p.moneyline?.simulationProbability === "number" ? p.moneyline.simulationProbability : null,
      forecast: { owner: "mlb-prediction official snapshot", modelId: p.decisionEngineVersion ?? snap.decisionEngineVersion ?? null, stampedAt: snap.generatedAt ?? null, ref: `mlb-prediction-snapshot:${date}:${files.at(-1).replace(/\.json$/, "")}#${p.artifactHash ?? p.gamePk}` }, // an identifier, not a repo path: this ref reaches the public served model
      uncertainty: { kind: "win-probability", note: "Probability from the official full-game simulation (10,000 runs)." },
      participantStatuses: [],
      settlement: { grader: "mlb-official-final", market: "moneyline", side },
    };
  });
}

export function nbaSelections({ repoRoot, date }) {
  const rel = `app/public/data/nba/experimental-public/${date}.json`;
  const doc = readJson(path.join(repoRoot, rel));
  if (!doc || doc.date !== date) return { selections: [], projections: [] };
  const selections = [], projections = [];
  for (const g of doc.games ?? []) {
    const fav = g.elo?.state === "FAVOURED" ? g.elo.favoured : null;
    const side = fav && fav === g.home?.abbr ? "home" : fav && fav === g.away?.abbr ? "away" : null;
    const matchup = `${g.away?.abbr} @ ${g.home?.abbr}`;
    selections.push({
      sport: "nba", eventId: String(g.providerEventId), eventLabel: matchup, startUtc: g.tipUtc, market: "winner",
      selection: side ? { code: side, label: `${fav} (official side)` } : null,
      probability: null, // withheld by the official composition (founder N2); the lane never carries one
      forecast: { owner: "nba-official-composition@1", modelId: g.receipt?.modelVersion ?? null, stampedAt: g.frozenAt, ref: `${rel}#${g.providerEventId}` },
      uncertainty: { kind: "side-only", note: doc.withheld?.winProbability ?? "Win probability not published." },
      participantStatuses: [],
      settlement: { grader: "nba-settlement-contract", market: "moneyline", side },
    });
    for (const team of ["away", "home"]) for (const p of g.players?.[team] ?? []) {
      if (typeof p.medians?.pts !== "number") continue;
      projections.push({ eventId: String(g.providerEventId), eventLabel: matchup, startUtc: g.tipUtc, playerId: p.providerAthleteId, name: p.name, team: g[team]?.abbr,
        availability: p.injuryStatus ?? null, expectedMinutes: p.expectedMinutes ?? null, points: { median: p.medians.pts }, frozenAt: g.frozenAt });
    }
  }
  projections.sort((a, b) => (b.expectedMinutes ?? 0) - (a.expectedMinutes ?? 0) || String(a.playerId).localeCompare(String(b.playerId)));
  return { selections, projections };
}

/** EPL rows as the EPL lane itself publishes them (its reader reads relative to the app directory). */
function eplRows() {
  const doc = loadEplForecasts();
  return doc ? { doc, rows: eplForecastRows(doc), ref: "sports/epl/forecast-view.ts loadEplForecasts" } : null;
}

function ligue1Rows({ repoRoot }) {
  const rel = "app/public/data/soccer/ligue-1/forecasts/latest.json";
  const doc = readJson(path.join(repoRoot, rel));
  return doc ? { doc, rows: (doc.rows ?? []).filter((r) => (r.state == null || r.state === "CURRENT_PRE_EVENT") && r.probs && !r.unavailableReason), ref: rel } : null;
}

function soccerSelections({ source, league, owner }) {
  if (!source) return [];
  const { doc, rows, ref } = source;
  return rows.map((r) => {
    const entries = ["home", "draw", "away"].map((k) => [k, r.probs[k]]).filter(([, v]) => typeof v === "number");
    const [code, p] = entries.reduce((a, b) => (b[1] > a[1] ? b : a), entries[0] ?? [null, null]);
    const label = code === "home" ? `${r.homeClub} to win` : code === "away" ? `${r.awayClub} to win` : "Draw";
    return {
      sport: league, eventId: String(r.eventId), eventLabel: r.matchup, startUtc: r.kickoffUtc, market: "1x2",
      selection: code ? { code, label } : null, probability: typeof p === "number" ? p : null,
      forecast: { owner, modelId: r.modelId ?? doc.model?.id ?? null, stampedAt: r.forecastAt ?? doc.generatedAt ?? null, ref: `${ref}#${r.eventId}` },
      uncertainty: { kind: "1x2", home: r.probs.home ?? null, draw: r.probs.draw ?? null, away: r.probs.away ?? null, outcomeLabel: OUTCOME_LABEL[code] ?? null },
      participantStatuses: [],
      settlement: { grader: "soccer-1x2-official-final", market: "1x2", side: code },
    };
  });
}

/** Every OPEN sport's official selections for `date` (plus NBA player projections). */
export function levelASources({ repoRoot, date }) {
  const out = { selections: [], nbaProjections: [] };
  if (canEnterModelSuggestions("mlb")) out.selections.push(...mlbSelections({ repoRoot, date }));
  if (canEnterModelSuggestions("nba")) { const n = nbaSelections({ repoRoot, date }); out.selections.push(...n.selections); out.nbaProjections = n.projections; }
  if (canEnterModelSuggestions("epl")) out.selections.push(...soccerSelections({ source: eplRows(), league: "epl", owner: "epl-model-v2-elo-poisson public forecast" }));
  if (canEnterModelSuggestions("ligue-1")) out.selections.push(...soccerSelections({ source: ligue1Rows({ repoRoot }), league: "ligue-1", owner: "soccer-league-forecasts (Ligue 1, model-only)" }));
  return out;
}
