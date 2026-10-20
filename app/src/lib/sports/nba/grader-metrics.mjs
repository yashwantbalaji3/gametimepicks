/**
 * NBA SHADOW VALIDATION METRICS — the preregistered numbers, computed (Session 10 · G5). PURE, no I/O.
 *
 * docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md (frozen 2026-09-22) defines what the forward shadow must report
 * (§4 team metrics, §5 player metrics), the minimum sample sizes (§6), the bars (§7), the forward-timing rule
 * (§8) and the states (§10). The grader recorded Brier / log loss / MAE only, so ECE, the reliability table,
 * interval coverage, the baselines, the sample-size gate and the timing HOLD were unreported. This module
 * computes exactly those — it changes no prediction, refits nothing, and the constants below are transcribed
 * from the preregistration, not chosen here. It reports a state; it promotes nothing (the registry stays
 * HISTORICAL_ONLY and no automation writes to it — §11).
 *
 * Missing is never zero: a metric whose inputs were not recorded is null with a reason, and its rows are
 * counted as NOT_RECORDED rather than as misses.
 */

/** §6 minimum n and §7 SHADOW → PUBLIC FORECAST bars, verbatim. */
export const PREREG = Object.freeze({
  doc: "docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md",
  eceBins: 10,
  coin: Object.freeze({ logLoss: Math.LN2, brier: 0.25 }),
  winner: Object.freeze({ minN: 300, simVsEloLogLossSlack: 0.005, coinLogLossMargin: 0.010, eceMax: 0.05, brierMax: 0.240 }),
  margin: Object.freeze({ minN: 300, maeMax: 12.5, coverage: [0.76, 0.84], absBiasMax: 1.0 }),
  total: Object.freeze({ minN: 300, maeMax: 16.0, coverage: [0.76, 0.84], absBiasMax: 2.0 }),
  player: Object.freeze({
    pts: Object.freeze({ minN: 1500, minMinutes: 20, coverage: [0.76, 0.84] }),
    reb: Object.freeze({ minN: 1500, minMinutes: 20, coverage: [0.76, 0.84] }),
    ast: Object.freeze({ minN: 1500, minMinutes: 20, coverage: [0.76, 0.84] }),
    threePm: Object.freeze({ minN: 800, minMinutes: 20, minRatePerMin: 0.05, coverage: [0.74, 0.86] }),
  }),
  minutesMaeMax: 6.0,
  rejectEceAboveAtN: Object.freeze({ ece: 0.08, n: 150 }),
});

export const MARKET_STATE = Object.freeze({
  HOLD: "HOLD",                       // §6 below minimum n, or §10 a timing/input HOLD trigger
  BARS_HOLD: "BARS_HOLD",             // n met and every §7 bar holds — a CANDIDATE needs a receipt, not this file
  BARS_FAIL: "BARS_FAIL",             // n met and a §7 bar fails — §10 REJECT on the first full-sample look
  REJECT_EARLY_ECE: "REJECT_EARLY_ECE", // §10: ECE > 0.08 at any n ≥ 150
});

const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const clamp = (p) => Math.min(1 - 1e-12, Math.max(1e-12, p));

/** ECE + reliability table with equal-width bins on [0, 1]. */
export function reliability(pairs, bins = PREREG.eceBins) {
  const b = Array.from({ length: bins }, (_, i) => ({ bin: i, lo: i / bins, hi: (i + 1) / bins, n: 0, p: 0, y: 0 }));
  for (const { p, y } of pairs) {
    const k = Math.min(bins - 1, Math.max(0, Math.floor(p * bins)));
    b[k].n += 1; b[k].p += p; b[k].y += y;
  }
  const n = pairs.length;
  const ece = n ? b.reduce((s, x) => s + (x.n ? (x.n / n) * Math.abs(x.p / x.n - x.y / x.n) : 0), 0) : null;
  return { n, ece: r4(ece), table: b.filter((x) => x.n).map((x) => ({ bin: `${x.lo.toFixed(1)}–${x.hi.toFixed(1)}`, n: x.n, predicted: r4(x.p / x.n), actual: r4(x.y / x.n) })) };
}

function winnerMetrics(games) {
  const out = {};
  const ys = games.map((g) => g.winner?.sim?.y ?? g.winner?.elo?.y).filter((y) => y === 0 || y === 1);
  const homeRate = ys.length ? mean(ys) : null;
  for (const head of ["sim", "elo"]) {
    const pairs = games.map((g) => g.winner?.[head]).filter((w) => w && Number.isFinite(w.p) && (w.y === 0 || w.y === 1)).map((w) => ({ p: w.p, y: w.y }));
    const rel = reliability(pairs);
    out[head] = {
      n: pairs.length,
      accuracy: r4(mean(pairs.map(({ p, y }) => ((p >= 0.5 ? 1 : 0) === y ? 1 : 0)))),
      accuracyRule: "p(home) >= 0.5 picks home (the grader's `hit`); n beside it",
      brier: r4(mean(pairs.map(({ p, y }) => (p - y) ** 2))),
      logLoss: r4(mean(pairs.map(({ p, y }) => -(y ? Math.log(clamp(p)) : Math.log(1 - clamp(p)))))),
      ece: rel.ece,
      reliability: rel.table,
    };
  }
  // Baselines reported alongside (§4). The home-rate baseline uses the graded sample's own rate (in-sample, labelled).
  out.baselines = {
    coin: { brier: PREREG.coin.brier, logLoss: r4(PREREG.coin.logLoss) },
    homeRate: homeRate == null ? null : {
      rate: r4(homeRate), inSample: true,
      brier: r4(mean(ys.map((y) => (homeRate - y) ** 2))),
      logLoss: r4(mean(ys.map((y) => -(y ? Math.log(clamp(homeRate)) : Math.log(1 - clamp(homeRate)))))),
    },
    market: { state: "NO_AUTHORIZED_PRICE", note: "§4: market baseline only when an authorized price exists (none today)" },
  };
  return out;
}

function intervalMetrics(games, key) {
  const rows = games.map((g) => g.intervals?.[key]).filter(Boolean);
  const recorded = rows.filter((r) => r.inside80 === 0 || r.inside80 === 1);
  const errKey = key === "margin" ? "marginErr" : "totalErr";
  const absKey = key === "margin" ? "marginAbsErr" : "totalAbsErr";
  const rec50 = rows.filter((r) => r.inside50 === 0 || r.inside50 === 1);
  const errs = games.map((g) => g.score?.[errKey]).filter(Number.isFinite);
  return {
    n: games.filter((g) => Number.isFinite(g.score?.[absKey])).length,
    mae: r4(mean(games.map((g) => g.score?.[absKey]).filter(Number.isFinite))),
    rmse: errs.length ? r4(Math.sqrt(mean(errs.map((e) => e * e)))) : null,
    bias: r4(mean(errs)),
    biasRule: "mean(forecast − actual): positive = projected too high",
    coverage80: recorded.length ? r4(mean(recorded.map((r) => r.inside80))) : null,
    coverage80N: recorded.length,
    coverage50: rec50.length ? r4(mean(rec50.map((r) => r.inside50))) : null,
    coverage50N: rec50.length,
    coverage50Reason: rec50.length ? null : "NOT_RECORDED — the v0 artifact stores p10/p50/p90, not p25/p75",
    intervalNotRecorded: games.length - recorded.length,
  };
}

/** MAE / RMSE / bias over signed errors (forecast − actual), with n. MAE/RMSE use |err| when given separately. */
export function errorStats(signed, abs = null) {
  const s = signed.filter(Number.isFinite);
  const a = abs ? abs.filter(Number.isFinite) : s.map(Math.abs);
  return {
    n: a.length,
    mae: r4(mean(a)),
    rmse: a.length ? r4(Math.sqrt(mean(a.map((x) => x * x)))) : null,
    bias: s.length ? r4(mean(s)) : null,
    biasN: s.length,
  };
}
const rate01 = (xs) => { const v = xs.filter((x) => x === 0 || x === 1); return { n: v.length, rate: v.length ? r4(mean(v)) : null }; };

const STATS = ["pts", "reb", "ast", "threePm"];
const COMBOS = ["pra", "ptsAst", "ptsReb"];

/** Per-stat error + coverage block over matched player rows (unconditional = sim mean vs actual). */
function statBlock(rows) {
  const out = {};
  for (const k of STATS) {
    out[k] = {
      unconditional: errorStats(rows.map((r) => r.signed?.[k] ?? null), rows.map((r) => r.unconditional?.[k] ?? null).filter((x) => x != null)),
      conditionalMAE: r4(mean(rows.map((r) => r.conditional?.[k]).filter(Number.isFinite))),
      coverage80: rate01(rows.map((r) => r.inside80?.[k])),
      atOrAboveMedian: rate01(rows.map((r) => r.atOrAboveMedian?.[k])),
    };
  }
  for (const c of COMBOS) {
    const xs = rows.map((r) => r.combos?.[c]).filter(Boolean);
    out[c] = { unconditional: errorStats(xs.map((x) => x.signed)), coverage80: rate01(xs.map((x) => x.inside80)) };
  }
  return out;
}

/** Expected-minutes bands. 10 = the §13 lane's listing floor; 20 = the §6/§7 player-bar floor. Reporting splits only. */
export const MINUTES_BANDS = Object.freeze([
  Object.freeze({ key: "<10", lo: -Infinity, hi: 10, source: "prereg §13 (the lane lists players with ≥ 10 expected minutes)" }),
  Object.freeze({ key: "10-20", lo: 10, hi: 20, source: "prereg §13 / §6" }),
  Object.freeze({ key: "≥20", lo: 20, hi: Infinity, source: "prereg §6 (player bars count expectedMinutes ≥ 20)" }),
]);
const restKey = (d) => (d == null ? "unknown" : d === 0 ? "0 (back-to-back)" : d === 1 ? "1" : "2+");

/** Tertile cut points of a sample (in-sample, labelled) — used only for the pace slice, so no constant is chosen here. */
function tertiles(xs) {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length < 3) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return [q(1 / 3), q(2 / 3)];
}

/**
 * Player + game slices: expected-minutes band, injury status / availability (incl. DNP + absent misses), home/away,
 * rest / back-to-back (prereg §9: rest 0 / 1 / 2+), starter, pace (in-sample tertiles). Every cell carries n.
 * §6: rest / role slices are REPORTED, never gated, until n ≥ 100 per slice.
 */
export function sliceMetrics(games) {
  const rowsWithCtx = games.flatMap((g) => (g.players?.rows ?? []).map((r) => ({ r, g })));
  const group = (keyOf) => {
    const m = new Map();
    for (const x of rowsWithCtx) { const k = keyOf(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x.r); }
    return Object.fromEntries([...m.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([k, rows]) => [k, {
      n: rows.length,
      minutes: errorStats(rows.map((r) => r.minutesErr ?? null), rows.map((r) => r.minutesAbsErr)),
      stats: statBlock(rows),
    }]));
  };
  const band = (em) => MINUTES_BANDS.find((b) => Number.isFinite(em) && em >= b.lo && em < b.hi)?.key ?? "unknown";
  const paceCuts = tertiles(games.map((g) => g.players?.pace?.possessions));
  const paceKey = (g) => {
    const p = g.players?.pace?.possessions;
    if (!paceCuts || !Number.isFinite(p)) return "unknown";
    return p < paceCuts[0] ? "low (in-sample tertile 1)" : p < paceCuts[1] ? "mid (tertile 2)" : "high (tertile 3)";
  };
  const players = {
    expectedMinutes: group(({ r }) => band(r.expectedMinutes)),
    injuryStatus: group(({ r }) => r.injuryStatus ?? "none listed"),
    availability: group(({ r }) => r.availability ?? "unknown"),
    homeAway: group(({ r }) => r.side ?? "unknown"),
    rest: group(({ r, g }) => restKey(g.context?.restDays?.[r.side])),
    starter: group(({ r }) => (r.starterActual == null ? "unknown" : r.starterActual ? "started" : "bench")),
    pace: group(({ g }) => paceKey(g)),
  };
  // Availability misses by the prediction's injury status (DNP incl. coach's decision; not in the box score = absent).
  const misses = {};
  for (const g of games) for (const [kind, list] of [["predictedButDnp", g.players?.predictedButDnp], ["predictedButAbsent", g.players?.predictedButAbsent]]) {
    for (const p of list ?? []) {
      const k = p.injuryStatus ?? "none listed";
      misses[k] ??= { predictedButDnp: 0, predictedButAbsent: 0 };
      misses[k][kind] += 1;
    }
  }
  for (const [k, v] of Object.entries(players.injuryStatus)) misses[k] ??= { predictedButDnp: 0, predictedButAbsent: 0, _played: v.n };
  for (const k of Object.keys(misses)) {
    const played = players.injuryStatus[k]?.n ?? 0;
    const { predictedButDnp, predictedButAbsent } = misses[k];
    const predicted = played + predictedButDnp + predictedButAbsent;
    misses[k] = { predicted, played, predictedButDnp, predictedButAbsent, missRate: predicted ? r4((predictedButDnp + predictedButAbsent) / predicted) : null };
  }
  const gameGroup = (keyOf) => {
    const m = new Map();
    for (const g of games) { const k = keyOf(g); if (!m.has(k)) m.set(k, []); m.get(k).push(g); }
    return Object.fromEntries([...m.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([k, gs]) => [k, {
      n: gs.length,
      simAccuracy: rate01(gs.map((g) => g.winner?.sim?.hit)),
      eloAccuracy: rate01(gs.map((g) => g.winner?.elo?.hit)),
      margin: errorStats(gs.map((g) => g.score?.marginErr)),
      total: errorStats(gs.map((g) => g.score?.totalErr)),
    }]));
  };
  const b2b = (g) => {
    const h = g.context?.restDays?.home, a = g.context?.restDays?.away;
    if (h == null || a == null) return "unknown";
    return h === 0 && a === 0 ? "both back-to-back" : h === 0 ? "home back-to-back" : a === 0 ? "away back-to-back" : "neither";
  };
  return {
    note: "§6/§9: slices are reported, never gated, until n ≥ 100 per slice; pace tertiles are in-sample (cut points listed)",
    paceCuts: paceCuts ? paceCuts.map(r4) : null,
    players,
    availabilityMisses: misses,
    games: { backToBack: gameGroup(b2b), pace: gameGroup(paceKey) },
  };
}

function playerMetrics(games) {
  const rows = games.flatMap((g) => g.players?.rows ?? []);
  const out = {
    minutes: { ...errorStats(rows.map((r) => r.minutesErr ?? null), rows.map((r) => r.minutesAbsErr)), n: rows.length, mae: r4(mean(rows.map((r) => r.minutesAbsErr).filter(Number.isFinite))), coverage80: rate01(rows.map((r) => r.minutesInside80)) },
    allRows: statBlock(rows),
    families: {},
  };

  for (const [fam, spec] of Object.entries(PREREG.player)) {
    const eligible = rows.filter((r) => Number.isFinite(r.expectedMinutes) && r.expectedMinutes >= spec.minMinutes
      && (spec.minRatePerMin == null || (Number.isFinite(r.rates?.[fam]) && r.rates[fam] >= spec.minRatePerMin)));
    const cov = eligible.map((r) => r.inside80?.[fam]).filter((x) => x === 0 || x === 1);
    const med = eligible.map((r) => r.atOrAboveMedian?.[fam]).filter((x) => x === 0 || x === 1);
    out.families[fam] = {
      n: eligible.length,
      minN: spec.minN,
      conditionalMAE: r4(mean(eligible.map((r) => r.conditional?.[fam]).filter(Number.isFinite))),
      unconditionalMAE: r4(mean(eligible.map((r) => r.unconditional?.[fam]).filter(Number.isFinite))),
      unconditional: errorStats(eligible.map((r) => r.signed?.[fam] ?? null), eligible.map((r) => r.unconditional?.[fam]).filter((x) => x != null)),
      coverage80: cov.length ? r4(mean(cov)) : null,
      coverage80N: cov.length,
      atOrAboveMedianRate: med.length ? r4(mean(med)) : null,
      medianEce: null,
      medianEceReason: "NOT_RECORDED — the artifact stores the median, not P(stat ≥ median); the at-or-above rate is reported instead",
      notRecorded: eligible.length - cov.length,
    };
  }
  const sum = (k) => games.reduce((s, g) => s + (g.players?.[k]?.length ?? 0), 0);
  out.availability = { predictedButDnp: sum("predictedButDnp"), predictedButAbsent: sum("predictedButAbsent"), playedButUnpredicted: sum("playedButUnpredicted") };
  return out;
}

const inBand = (x, [lo, hi]) => x != null && x >= lo && x <= hi;

/**
 * The per-market state from §6/§7/§10. A HOLD from timing (§8/§10: any graded game whose forecast was not
 * written before tip) overrides every market.
 */
export function marketStates(m) {
  const timingHold = m.timing.notPreTip > 0 || m.timing.unknown > 0;
  const state = (n, minN, barsHold, earlyEce) => {
    if (earlyEce) return MARKET_STATE.REJECT_EARLY_ECE;
    if (timingHold || n < minN) return MARKET_STATE.HOLD;
    return barsHold ? MARKET_STATE.BARS_HOLD : MARKET_STATE.BARS_FAIL;
  };
  const w = m.winner; const B = PREREG.winner;
  const winnerBars = {
    logLossVsElo: w.sim.logLoss != null && w.elo.logLoss != null && w.sim.logLoss <= w.elo.logLoss + B.simVsEloLogLossSlack,
    logLossVsCoin: w.sim.logLoss != null && w.sim.logLoss <= PREREG.coin.logLoss - B.coinLogLossMargin,
    ece: w.sim.ece != null && w.sim.ece <= B.eceMax,
    brier: w.sim.brier != null && w.sim.brier <= B.brierMax,
  };
  const early = (ece, n) => ece != null && n >= PREREG.rejectEceAboveAtN.n && ece > PREREG.rejectEceAboveAtN.ece;
  const mm = m.margin, tt = m.total;
  const marginBars = { mae: mm.mae != null && mm.mae <= PREREG.margin.maeMax, coverage: inBand(mm.coverage80, PREREG.margin.coverage), bias: mm.bias != null && Math.abs(mm.bias) <= PREREG.margin.absBiasMax };
  const totalBars = { mae: tt.mae != null && tt.mae <= PREREG.total.maeMax, coverage: inBand(tt.coverage80, PREREG.total.coverage), bias: tt.bias != null && Math.abs(tt.bias) <= PREREG.total.absBiasMax };
  const out = {
    winner: { state: state(w.sim.n, B.minN, Object.values(winnerBars).every(Boolean), early(w.sim.ece, w.sim.n)), n: w.sim.n, minN: B.minN, bars: winnerBars },
    margin: { state: state(mm.n, PREREG.margin.minN, Object.values(marginBars).every(Boolean), false), n: mm.n, minN: PREREG.margin.minN, bars: marginBars },
    total: { state: state(tt.n, PREREG.total.minN, Object.values(totalBars).every(Boolean), false), n: tt.n, minN: PREREG.total.minN, bars: totalBars, unrecordedBar: "sim total SD > sim margin SD is not recorded by the grader" },
  };
  for (const [fam, f] of Object.entries(m.players.families)) {
    const bars = { minutesMae: m.players.minutes.mae != null && m.players.minutes.mae <= PREREG.minutesMaeMax, coverage: inBand(f.coverage80, PREREG.player[fam].coverage) };
    out[fam] = { state: state(f.n, f.minN, false, false), n: f.n, minN: f.minN, bars, unrecordedBars: "season-mean-rate baseline and median ECE are not recorded — this family cannot reach BARS_HOLD from this ledger" };
  }
  out.pra = { state: MARKET_STATE.HOLD, reason: "§7: PRA only after points, rebounds and assists each pass" };
  return out;
}

/**
 * Everything §4/§5 asks for, over a set of graded games of ONE label (preseason and regular are never pooled).
 * @param {object[]} games  gradeForecastGame outputs with graded === true
 */
export function validationMetrics(games) {
  const g = (games ?? []).filter((x) => x?.graded);
  const preTip = g.filter((x) => x.timing?.preTip === true).length;
  const notPreTip = g.filter((x) => x.timing?.preTip === false).length;
  const ot = g.filter((x) => typeof x.overtime?.actual === "boolean");
  const m = {
    games: g.length,
    timing: { preTip, notPreTip, unknown: g.length - preTip - notPreTip, rule: "§8: only forecasts written before tip count; any other graded game holds every market (§10)" },
    winner: winnerMetrics(g),
    margin: intervalMetrics(g, "margin"),
    total: intervalMetrics(g, "total"),
    overtime: overtimeMetrics(g, ot),
    players: playerMetrics(g),
  };
  m.slices = sliceMetrics(g);
  m.states = marketStates(m);
  return m;
}

/** Overtime head: the fact (grader v2 derives it) and the sim's P(OT) scored as a probability (Brier / log loss / ECE). */
function overtimeMetrics(g, ot) {
  const pOf = (x) => (Number.isFinite(x.overtime.pOvertime) ? x.overtime.pOvertime : x.overtime.simTieMass);
  const pairs = ot.filter((x) => Number.isFinite(pOf(x))).map((x) => ({ p: pOf(x), y: x.overtime.actual ? 1 : 0 }));
  const rel = reliability(pairs);
  const sources = {};
  for (const x of ot) { const k = x.overtime.source ?? "unknown"; sources[k] = (sources[k] ?? 0) + 1; }
  return {
    n: ot.length,
    notMeasured: g.length - ot.length,
    actualRate: ot.length ? r4(mean(ot.map((x) => (x.overtime.actual ? 1 : 0)))) : null,
    simTieMassMean: r4(mean(ot.map((x) => x.overtime.simTieMass).filter(Number.isFinite))),
    head: {
      n: pairs.length,
      pMean: r4(mean(pairs.map((x) => x.p))),
      brier: r4(mean(pairs.map(({ p, y }) => (p - y) ** 2))),
      logLoss: r4(mean(pairs.map(({ p, y }) => -(y ? Math.log(clamp(p)) : Math.log(1 - clamp(p)))))),
      ece: rel.ece,
      reliability: rel.table,
    },
    sources,
    note: "grader v2 derives the fact (summary periods → box-score team minutes → corpus); a game with none is NOT_MEASURED, never 'no overtime'",
  };
}

/** The validation block over a set of current grades (grader v2: the ledger's current view, one grade per event). */
export function validationFromGrades(grades, { computedAt }) {
  const byLabel = {};
  for (const g of grades ?? []) if (g?.graded) (byLabel[g.label] ??= []).push(g);
  return { preregistration: PREREG.doc, computedAt, source: "gradeEntries current view (latest entry per event)", byLabel: Object.fromEntries(Object.entries(byLabel).map(([label, games]) => [label, validationMetrics(games)])) };
}


/**
 * The ledger's validation block: CUMULATIVE over every graded date, one block per label (preseason and regular
 * are never pooled, §3). One graded row per event — an event belongs to one date file, and a re-graded date's
 * latest entry is the one the ledger holds.
 */
export function validationByLabel(entries, { computedAt }) {
  const byLabel = {};
  const seen = new Set();
  for (const e of entries ?? []) for (const g of e?.games ?? []) {
    if (!g?.graded || seen.has(String(g.providerEventId))) continue;
    seen.add(String(g.providerEventId));
    (byLabel[g.label] ??= []).push(g);
  }
  return { preregistration: PREREG.doc, computedAt, byLabel: Object.fromEntries(Object.entries(byLabel).map(([label, games]) => [label, validationMetrics(games)])) };
}
