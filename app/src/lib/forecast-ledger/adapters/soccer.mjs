/**
 * Soccer (EPL, Ligue 1) → Forecast Ledger rows. Pure.
 *
 * EPL MATCH (owner: grade-epl-forecasts.mjs → graded-forecasts.jsonl, append-only, graded once against the latest
 * pre-kickoff forecast, which it names). Two observations per match:
 *   epl_1x2      MULTICLASS  {home, draw, away}  — multiclass Brier (sum form, as the owner reports it), log loss,
 *                                                  top-class hit
 *   epl_over_2_5 BINARY      P(3+ goals)
 * The `market` 1X2 vector (when the owner captured one) is context only. The CONTROL model and shadow totals on the
 * owner's row are NOT observations: they were never the published forecast.
 *
 * EPL PLAYERS (owner: grade-epl-player-projections.mjs → graded-player-projections.jsonl). BINARY P(scores) and
 * P(1+ shot on goal). VOID (did not play) is VOID, never a miss. The owner keys a player row by match SLUG, so the event
 * id is the PUBLISHED match id found by an exact join on (kickoff minute, unordered team pair) — the derived
 * id orders the pair alphabetically ("Sunderland v Fulham" is soccer:epl:fulham-v-sunderland:…), so it is read, never
 * rebuilt from the slug. No exact unique match → the row is counted unresolved and not emitted.
 *
 * LIGUE 1 (owner: grade-league-forecasts.mjs → ligue-1/results/graded.json, one row per match against the last
 * forecast published before kickoff). MULTICLASS 1X2.
 */
import { FORECAST_KIND, RECOVERABILITY } from "../contract.mjs";
import { measureBinary, measureMulticlass } from "../measure.mjs";
import { makeRow, marketBlock } from "../row.mjs";

const CAT = { H: "home", D: "draw", A: "away" };
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** EPL season label from a kickoff: Aug–Dec belongs to "YYYY-(YY+1)", Jan–Jul to "(YYYY−1)-YY". */
export function soccerSeason(kickoffUtc) {
  const d = new Date(Date.parse(kickoffUtc));
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function probs3(p) {
  if (!p || !isNum(p.home) || !isNum(p.draw) || !isNum(p.away)) return null;
  return { home: p.home, draw: p.draw, away: p.away };
}

export function eplMatchRows(graded = []) {
  const out = [];
  for (const g of graded) {
    const cp = probs3(g.forecast?.probs);
    if (!cp || !g.eventId) continue;
    const ft = g.status === "FULL_TIME" && g.actual && CAT[g.actual.outcome];
    const base = {
      sport: "EPL",
      competition: "Premier League",
      season: g.kickoffUtc ? soccerSeason(g.kickoffUtc) : null,
      eventId: g.eventId,
      eventStart: g.kickoffUtc ?? null,
      matchup: g.matchup ?? null,
      subjectType: "GAME",
      subjectId: g.eventId,
      subjectDisplay: g.matchup ?? null,
      modelId: g.modelId ?? null,
      publicationSurface: "epl-match-forecast",
      receiptId: g.forecastSource ?? null,
      publishedAt: g.forecastGeneratedAt ?? null,
      probabilityType: "MODEL",
      recoverability: RECOVERABILITY.OWNER_GRADED_LOG,
    };
    const settled = { settledAt: g.gradedAt ?? null, finality: "CANONICAL", source: g.resultSource ?? null };
    out.push(makeRow({
      ...base,
      family: "epl_1x2",
      forecastKind: FORECAST_KIND.MULTICLASS,
      classProbabilities: cp,
      categoryPrediction: Object.entries(cp).sort((a, b) => b[1] - a[1])[0][0],
      market: g.market?.probs ? marketBlock({ impliedProbability: probs3(g.market.probs), provider: g.market.books != null ? `${g.market.books} books` : null }) : null,
      settlement: ft ? { state: "SETTLED", finalCategory: CAT[g.actual.outcome], ...settled } : { state: "PENDING" },
      measurement: ft ? measureMulticlass({ classProbabilities: cp, finalCategory: CAT[g.actual.outcome] }) : {},
    }));
    const p25 = g.forecast?.over25;
    if (isNum(p25)) {
      const goals = ft && Number.isInteger(g.actual.totalGoals) ? g.actual.totalGoals : null;
      out.push(makeRow({
        ...base,
        family: "epl_over_2_5",
        forecastKind: FORECAST_KIND.BINARY,
        probability: p25,
        direction: "OVER_2_5_GOALS",
        settlement: goals != null ? { state: "SETTLED", finalValue: goals, finalCategory: goals >= 3 ? "OVER" : "UNDER", ...settled } : { state: "PENDING" },
        measurement: goals != null ? measureBinary({ probability: p25, observed: goals >= 3 ? 1 : 0 }) : {},
      }));
    }
  }
  return out;
}

/** Kickoff minute in the derived scheme: "2026-08-21T19:00:00Z" → "20260821t1900". */
function kickoffMinute(kickoffUtc) {
  const t = Date.parse(kickoffUtc);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}t${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

/** Join key: kickoff minute + the UNORDERED pair of team slugs (the derived id orders the pair alphabetically). */
function pairKey(a, b, minute) {
  return `${minute}|${[a, b].sort().join("~")}`;
}

/**
 * Index published EPL event ids by (kickoff minute, unordered team pair). An id is read, never built: the owner's
 * `soccer:epl:<a>-v-<b>:<minute>`. A key two different ids claim is AMBIGUOUS and resolves to nothing.
 */
export function eplEventIndex(events) {
  const idx = new Map();
  const put = (k, id) => {
    const prev = idx.get(k);
    idx.set(k, prev !== undefined && prev !== id ? null : id);
  };
  for (const e of events) {
    // Accept bare ids or { eventId, kickoffUtc, matchup } — the matchup key is the owners' exact display text.
    const id = typeof e === "string" ? e : e?.eventId;
    if (typeof e === "object" && e?.matchup && kickoffMinute(e.kickoffUtc)) put(`${kickoffMinute(e.kickoffUtc)}|=${e.matchup}`, id);
    const m = /^soccer:epl:([a-z0-9-]+)-v-([a-z0-9-]+):(\d{8}t\d{4})$/.exec(String(id ?? ""));
    if (!m) continue;
    put(pairKey(m[1], m[2], m[3]), id);
  }
  return idx;
}

/**
 * Player row → the published event id, or null (unresolved). First an exact (kickoff minute, matchup text) match —
 * the two owners slug "&" differently ("brighton-and-hove-albion" vs "brighton-hove-albion") but print the same
 * matchup — then an exact (kickoff minute, unordered slug pair) match. Never a fuzzy or partial match.
 */
export function eplEventIdFor(slug, kickoffUtc, index, matchup = null) {
  const minute = kickoffMinute(kickoffUtc);
  if (!minute) return null;
  if (matchup) {
    const byText = index.get(`${minute}|=${matchup}`);
    if (byText !== undefined) return byText;
  }
  const m = /^([a-z0-9-]+)-v-([a-z0-9-]+)-\d{4}-\d{2}-\d{2}$/.exec(String(slug ?? ""));
  if (!m) return null;
  return index.get(pairKey(m[1], m[2], minute)) ?? null;
}

const PLAYER_FAMILY = { anytime_goalscorer: "epl_anytime_goalscorer", shots_on_goal_over_0_5: "epl_shots_on_goal_over_0_5" };

/** @returns {{ rows, unresolved }} — rows whose event id is not an exact published id are counted, never emitted. */
export function eplPlayerRows(graded = [], index = new Map()) {
  const out = [];
  let unresolved = 0;
  for (const g of graded) {
    const family = PLAYER_FAMILY[g.market];
    const eventId = eplEventIdFor(g.slug, g.kickoffUtc, index, g.matchup ?? null);
    if (family && !eventId) unresolved += 1;
    if (!family || !eventId || g.playerId == null || !isNum(g.probability)) continue;
    let settlement = { state: "PENDING" };
    let measurement = {};
    if (g.outcome === "HIT" || g.outcome === "MISS") {
      const observed = g.outcome === "HIT" ? 1 : 0;
      settlement = { state: "SETTLED", finalValue: Number.isInteger(g.observed) ? g.observed : null, finalCategory: g.outcome, finality: "CANONICAL" };
      measurement = measureBinary({ probability: g.probability, observed });
    } else if (g.outcome === "VOID") {
      settlement = { state: "VOID", finalCategory: "VOID", finality: "CANONICAL", reason: "DID_NOT_PLAY" };
    }
    out.push(makeRow({
      sport: "EPL",
      competition: "Premier League",
      season: g.kickoffUtc ? soccerSeason(g.kickoffUtc) : null,
      eventId,
      eventStart: g.kickoffUtc ?? null,
      matchup: g.matchup ?? null,
      subjectType: "PLAYER",
      subjectId: `epl-athlete-${g.playerId}`, // the platform's canonical player id (research-projection index)
      subjectDisplay: g.playerName ?? null,
      teamId: g.teamName ?? null,
      family,
      forecastKind: FORECAST_KIND.BINARY,
      modelStatusAtPublish: g.conditional === true ? "CONDITIONAL_ON_START" : null,
      publicationSurface: "epl-player-projection",
      receiptId: g.projectionSource ?? null,
      publishedAt: g.projectionGeneratedAt ?? null,
      probability: g.probability,
      probabilityType: "MODEL",
      direction: family === "epl_anytime_goalscorer" ? "SCORES" : "ONE_PLUS_SHOT_ON_GOAL",
      settlement,
      measurement,
      recoverability: RECOVERABILITY.OWNER_GRADED_LOG,
    }));
  }
  return { rows: out, unresolved };
}

export function ligue1Rows(doc) {
  const out = [];
  for (const g of doc?.matches ?? []) {
    const cp = probs3(g.probs);
    if (!cp || !g.eventId) continue;
    const cat = CAT[g.result];
    out.push(makeRow({
      sport: "LIGUE_1",
      competition: "Ligue 1",
      season: g.kickoffUtc ? soccerSeason(g.kickoffUtc) : null,
      eventId: g.eventId,
      eventStart: g.kickoffUtc ?? null,
      matchup: g.matchup ?? null,
      subjectType: "GAME",
      subjectId: g.eventId,
      subjectDisplay: g.matchup ?? null,
      family: "ligue1_1x2",
      forecastKind: FORECAST_KIND.MULTICLASS,
      modelId: doc.modelId ?? null,
      publicationSurface: "soccer-league-forecast",
      receiptId: "ligue-1/results/graded.json",
      publishedAt: g.forecastAt ?? null,
      classProbabilities: cp,
      probabilityType: "MODEL",
      categoryPrediction: Object.entries(cp).sort((a, b) => b[1] - a[1])[0][0],
      settlement: cat ? { state: "SETTLED", finalCategory: cat, finality: "CANONICAL" } : { state: "PENDING" },
      measurement: cat ? measureMulticlass({ classProbabilities: cp, finalCategory: cat }) : {},
      recoverability: RECOVERABILITY.OWNER_GRADED_LOG,
    }));
  }
  return out;
}
