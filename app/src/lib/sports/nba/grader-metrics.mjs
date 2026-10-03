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
  return {
    n: games.filter((g) => Number.isFinite(g.score?.[absKey])).length,
    mae: r4(mean(games.map((g) => g.score?.[absKey]).filter(Number.isFinite))),
    bias: r4(mean(games.map((g) => g.score?.[errKey]).filter(Number.isFinite))),
    coverage80: recorded.length ? r4(mean(recorded.map((r) => r.inside80))) : null,
    coverage80N: recorded.length,
    coverage50: null,
    coverage50Reason: "NOT_RECORDED — the v0 artifact stores p10/p50/p90, not p25/p75",
    intervalNotRecorded: games.length - recorded.length,
  };
}

function playerMetrics(games) {
  const rows = games.flatMap((g) => g.players?.rows ?? []);
  const out = { minutes: { n: rows.length, mae: r4(mean(rows.map((r) => r.minutesAbsErr).filter(Number.isFinite))) }, families: {} };
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
    overtime: {
      n: ot.length,
      notMeasured: g.length - ot.length,
      actualRate: ot.length ? r4(mean(ot.map((x) => (x.overtime.actual ? 1 : 0)))) : null,
      simTieMassMean: r4(mean(ot.map((x) => x.overtime.simTieMass).filter(Number.isFinite))),
      note: "forward finals carry no overtime fact (results capture + box score); only corpus finals do — NOT_MEASURED is not 'no overtime'",
    },
    players: playerMetrics(g),
  };
  m.states = marketStates(m);
  return m;
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
