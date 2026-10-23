/**
 * RESULTS V2 · THE FORECAST RECORD — family-appropriate measurement over the Universal Forecast Ledger (Session 13 · H).
 *
 * One ledger row = one forecast observation. This module RE-GRADES NOTHING: settlement words come from the owners
 * (via the ledger); it only aggregates the ledger's per-row measurement into per-family metrics:
 *
 *   CONTINUOUS   n · MAE · median absolute error · RMSE · bias (mean of projection − actual) · 80% range coverage
 *   BINARY       n · Brier · log loss · mean forecast vs observed rate · ECE + reliability bins (10 equal-width)
 *   MULTICLASS   n · Brier · log loss · top-class accuracy · the uniform-guess reference (a non-hindsight floor)
 *   DIRECTIONAL  W / L / PUSH only where the owner graded a PUBLISHED directional claim (basis named)
 *
 * Never: one pooled "accuracy" across families; a W/L for a projection that published no directional claim;
 * pending / withdrawn / void counted as a loss.
 */

import { HISTORICAL_MODEL_FAVORED_LABEL, SIDE_BASIS } from "../forecast-of-record.mjs";

const HISTORICAL_MODEL_FAVORED = SIDE_BASIS.HISTORICAL_MODEL_FAVORED;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const round = (v, d = 4) => (isNum(v) ? Number(v.toFixed(d)) : null);

/**
 * forecast-ledger@1 amendment 1: a NOT_SERVED row is the internal record of a graded forecast no deployment served. It
 * is never a public forecast — excluded from every count and metric here, and disclosed as `notServed`.
 */
export const isPublicForecastRow = (r) => r?.publicationStatus !== "NOT_SERVED";

/** Status counts for any set of rows — the denominators a reader sees beside every metric. */
export function statusCounts(rows) {
  const c = { published: 0, withdrawn: 0, measured: 0, pending: 0, void: 0, unmeasured: 0, notServed: 0 };
  for (const r of rows) {
    if (!isPublicForecastRow(r)) { c.notServed += 1; continue; }
    if (r.publicationStatus === "WITHDRAWN") c.withdrawn += 1; else c.published += 1;
    const s = r.settlement?.state;
    if (r.measurement?.type) c.measured += 1;
    else if (s === "PENDING") c.pending += 1;
    else if (s === "VOID") c.void += 1;
    else c.unmeasured += 1;
  }
  return c;
}

function directional(rows) {
  const d = { win: 0, loss: 0, push: 0, basis: new Set() };
  const by = new Map();
  for (const r of rows) {
    const m = r.measurement ?? {};
    // Only a published claim that the owner settled counts: pending, withdrawn and unmeasured rows never add a W/L.
    if (!m.directionalBasis || r.publicationStatus !== "PUBLISHED") continue;
    if (r.settlement?.state !== "SETTLED" && !(r.settlement?.state === "VOID" && m.directionalResult === "PUSH")) continue;
    const word = m.directionalResult === "WIN" ? "win" : m.directionalResult === "LOSS" ? "loss" : m.directionalResult === "PUSH" ? "push" : null;
    if (word == null) continue;
    d[word] += 1;
    d.basis.add(m.directionalBasis);
    if (!by.has(m.directionalBasis)) by.set(m.directionalBasis, { win: 0, loss: 0, push: 0 });
    by.get(m.directionalBasis)[word] += 1;
  }
  if (!d.win && !d.loss && !d.push) return null;
  const basis = [...d.basis].sort();
  const labelOf = (b) => (b === HISTORICAL_MODEL_FAVORED ? HISTORICAL_MODEL_FAVORED_LABEL : "pick record");
  /* Stage 3C (founder Q4): a record graded on the model-favored team, with no published side, is never a "pick record".
     Stage 3D: once forward forecasts freeze a side, one family can hold both kinds. They are never pooled under one
     label: `byBasis` carries each record on its own, and `label` is null for a mixed record (render byBasis). */
  const byBasis = basis.map((b) => ({ basis: b, label: labelOf(b), ...by.get(b), decided: by.get(b).win + by.get(b).loss }));
  const mixed = basis.includes(HISTORICAL_MODEL_FAVORED) && basis.length > 1;
  return { win: d.win, loss: d.loss, push: d.push, decided: d.win + d.loss, basis, label: mixed ? null : labelOf(basis[0]), byBasis };
}

export function reliabilityBins(pairs, bins = 10) {
  const out = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, meanForecast: 0, observed: 0 }));
  for (const { p, y } of pairs) {
    const b = Math.min(bins - 1, Math.floor(p * bins));
    out[b].n += 1;
    out[b].meanForecast += p;
    out[b].observed += y;
  }
  let ece = 0;
  for (const b of out) {
    if (!b.n) continue;
    b.meanForecast /= b.n;
    b.observed /= b.n;
    ece += (b.n / Math.max(1, pairs.length)) * Math.abs(b.meanForecast - b.observed);
  }
  return {
    ece: pairs.length ? round(ece) : null,
    bins: out.filter((b) => b.n > 0).map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, meanForecast: round(b.meanForecast), observed: round(b.observed) })),
  };
}

/** Metrics for ONE family (rows must share sport + family + forecastKind). */
export function familyMetrics(rows) {
  const kind = rows[0]?.forecastKind ?? null;
  const measured = rows.filter((r) => r.measurement?.type && isPublicForecastRow(r));
  const base = { kind, counts: statusCounts(rows), directional: directional(rows) };
  if (kind === "CONTINUOUS_PROJECTION") {
    const ae = measured.map((r) => r.measurement.absoluteError).filter(isNum);
    const se = measured.map((r) => r.measurement.squaredError).filter(isNum);
    const sg = measured.map((r) => r.measurement.signedError).filter(isNum);
    const cov = measured.filter((r) => typeof r.measurement.insideRange === "boolean");
    return {
      ...base,
      n: ae.length,
      mae: round(mean(ae), 3),
      medianAbsError: round(median(ae), 3),
      rmse: se.length ? round(Math.sqrt(mean(se)), 3) : null,
      bias: round(mean(sg), 3),
      coverage: cov.length ? { n: cov.length, inside: round(cov.filter((r) => r.measurement.insideRange).length / cov.length), target: round(mean(cov.map((r) => r.rangeCoverage).filter(isNum))) } : null,
    };
  }
  if (kind === "BINARY_PROBABILITY") {
    const pairs = measured
      .filter((r) => isNum(r.probability) && isNum(r.measurement.brier))
      .map((r) => ({ p: r.probability, y: observedOf(r) }))
      .filter((x) => x.y === 0 || x.y === 1);
    return {
      ...base,
      n: pairs.length,
      brier: round(mean(measured.map((r) => r.measurement.brier).filter(isNum))),
      logLoss: round(mean(measured.map((r) => r.measurement.logLoss).filter(isNum))),
      meanForecast: round(mean(pairs.map((x) => x.p))),
      observedRate: round(mean(pairs.map((x) => x.y))),
      calibration: reliabilityBins(pairs),
    };
  }
  if (kind === "MULTICLASS_PROBABILITY") {
    const k = Object.keys(rows[0]?.classProbabilities ?? {}).length || 3;
    const top = measured.filter((r) => typeof r.measurement.topClassHit === "boolean");
    return {
      ...base,
      n: measured.length,
      brier: round(mean(measured.map((r) => r.measurement.brier).filter(isNum))),
      logLoss: round(mean(measured.map((r) => r.measurement.logLoss).filter(isNum))),
      topClassAccuracy: top.length ? round(top.filter((r) => r.measurement.topClassHit).length / top.length) : null,
      // A score table (classes = listed scores + OTHER): the hit means "the single likeliest LISTED score was the final"
      // — a top-1 exact-score hit rate, never a pooled accuracy. Brier/log loss above run over the full, normalized
      // outcome space including OTHER.
      topClassLabel: "OTHER" in (rows[0]?.classProbabilities ?? {})
        ? "top-1 exact-score hit rate (how often our single likeliest listed score was the exact final)"
        : null,
      uniformReference: { logLoss: round(Math.log(k)), brier: round(1 - 1 / k) },
    };
  }
  return { ...base, n: 0 };
}

/**
 * The binary outcome (0/1) the row's Brier was computed from: `measurement.observed` (ledger rows from Session 13
 * on), else recovered from the Brier itself.
 */
export function observedOf(r) {
  const m = r.measurement ?? {};
  if (m.observed === 0 || m.observed === 1) return m.observed;
  // Rows written before `observed` existed: Brier = (p − y)², so exactly one y ∈ {0, 1} reproduces it — except at
  // p = 0.5, where both do. That row is left out of the reliability table rather than guessed.
  const p = r.probability;
  if (!isNum(p) || !isNum(m.brier) || p === 0.5) return null;
  const c = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.abs(m.brier - round((c - 1) ** 2, 6)) < 1e-6 ? 1 : Math.abs(m.brier - round(c * c, 6)) < 1e-6 ? 0 : null;
}

export const FAMILY_LABELS = Object.freeze({
  nfl_game_winner: "Game winner",
  nfl_game_total: "Game total points",
  nfl_game_margin: "Winning margin",
  nfl_team_score: "Team score",
  player_pass_yds: "Passing yards",
  player_rush_yds: "Rushing yards",
  player_reception_yds: "Receiving yards",
  player_receptions: "Receptions",
  anytime_td: "Anytime touchdown",
  mlb_moneyline: "Moneyline pick",
  mlb_run_line: "Run line pick (simulated ±1.5, retired)",
  mlb_run_line_posted: "Run line pick (posted line)",
  mlb_total: "Total runs pick",
  mlb_homer_nukes: "Home run (Homer Nukes)",
  mlb_projected_runs: "Projected runs (median simulation score)",
  mlb_projected_total: "Projected total runs (simulation median)",
  epl_1x2: "Match result (1X2)",
  epl_over_2_5: "Over 2.5 goals",
  epl_anytime_goalscorer: "Anytime goalscorer",
  epl_shots_on_goal_over_0_5: "1+ shot on target",
  epl_btts: "Both teams to score",
  epl_clean_sheet: "Clean sheet",
  epl_scoreline: "Correct score (top-10 table)",
  ligue1_1x2: "Match result (1X2)",
  ufc_winner: "Fight winner",
});

export const SPORT_LABELS = Object.freeze({ NFL: "NFL", MLB: "MLB", EPL: "Premier League", LIGUE_1: "Ligue 1", UFC: "UFC" });

/** Group the whole ledger into the Forecast Record: sports → families → metrics, plus the KPI strip. */
export function forecastRecord(allRows, { declaredGaps = [] } = {}) {
  // Exactly once: the ledger guarantees it; the reader refuses rather than counting a forecast twice.
  const ids = new Set();
  for (const r of allRows) {
    if (ids.has(r.forecastId)) throw new Error(`forecast record: duplicate forecastId ${r.forecastId}`);
    ids.add(r.forecastId);
  }
  // Never-public (NOT_SERVED) rows are disclosed, never counted (amendment 1).
  const rows = allRows.filter(isPublicForecastRow);
  const notServed = allRows.length - rows.length;
  const bySport = new Map();
  for (const r of rows) {
    const s = bySport.get(r.sport) ?? new Map();
    const f = s.get(r.family) ?? [];
    f.push(r);
    s.set(r.family, f);
    bySport.set(r.sport, s);
  }
  const counts = statusCounts(rows);
  const settledAts = rows.map((r) => r.settlement?.settledAt).filter(Boolean).sort();
  const sports = [...bySport.entries()].sort(([a], [b]) => Object.keys(SPORT_LABELS).indexOf(a) - Object.keys(SPORT_LABELS).indexOf(b)).map(([sport, fams]) => ({
    sport,
    label: SPORT_LABELS[sport] ?? sport,
    counts: statusCounts([...fams.values()].flat()),
    families: [...fams.entries()].map(([family, rs]) => {
      const latest = rs.map((r) => r.eventStart ?? r.publishedAt).filter(Boolean).sort().pop() ?? null;
      return { family, label: FAMILY_LABELS[family] ?? family, latestEvent: latest, models: [...new Set(rs.map((r) => r.modelId).filter(Boolean))].sort(), ...familyMetrics(rs) };
    }).sort((a, b) => b.counts.measured - a.counts.measured || (a.family < b.family ? -1 : 1)),
  }));
  return {
    kpis: {
      forecasts: rows.length,
      measured: counts.measured,
      coverage: rows.length ? round(counts.measured / rows.length) : null,
      pending: counts.pending,
      voidCount: counts.void,
      unmeasured: counts.unmeasured,
      withdrawn: counts.withdrawn,
      notServed,
      sports: sports.length,
      families: sports.reduce((a, s) => a + s.families.length, 0),
      lastSettledAt: settledAts.length ? settledAts[settledAts.length - 1] : null,
    },
    sports,
    declaredGaps,
  };
}

/** CSV of ledger rows (no private data exists in the ledger; every column is a public forecast fact). */
export const CSV_COLUMNS = Object.freeze([
  "forecastId", "sport", "season", "eventId", "eventStart", "matchup", "subjectId", "subjectDisplay", "teamId", "family",
  "forecastKind", "modelId", "modelVersion", "publicationStatus", "publishedAt", "projection", "rangeLow", "rangeHigh",
  "probability", "categoryPrediction", "marketLine", "marketImpliedProbability", "settlementState", "finalValue",
  "finalCategory", "settledAt", "absoluteError", "brier", "logLoss", "directionalResult", "directionalBasis",
]);
const csvCell = (v) => {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    const v = {
      ...r,
      marketLine: r.market?.line ?? null,
      marketImpliedProbability: r.market?.impliedProbability ?? null,
      settlementState: r.settlement?.state ?? null,
      finalValue: r.settlement?.finalValue ?? null,
      finalCategory: r.settlement?.finalCategory ?? null,
      settledAt: r.settlement?.settledAt ?? null,
      absoluteError: r.measurement?.absoluteError ?? null,
      brier: r.measurement?.brier ?? null,
      logLoss: r.measurement?.logLoss ?? null,
      directionalResult: r.measurement?.directionalResult ?? null,
      directionalBasis: r.measurement?.directionalBasis ?? null,
    };
    lines.push(CSV_COLUMNS.map((c) => csvCell(v[c])).join(","));
  }
  return lines.join("\n") + "\n";
}
