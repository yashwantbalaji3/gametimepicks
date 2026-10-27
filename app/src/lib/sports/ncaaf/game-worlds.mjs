/**
 * NCAAF coherent game worlds (NCAAF-003). PRIVATE_RESEARCH — spec: docs/ncaaf/WORLD_MODEL_SPEC.md.
 *
 * One world = one complete game. Both teams' REGULATION scores are drawn jointly; a tied regulation is played
 * out under the season's overtime rules (overtime.mjs); winner, margin, total and overtime are then read off
 * that same world. Nothing is sampled independently per market.
 *
 *   joint draw      (z_h, z_a) ~ standard bivariate normal with correlation ρ (score champion C2's ρ)
 *   marginals       each team's regulation score = the u = Φ(z) quantile of the EMPIRICAL regulation scores
 *                   of the K past team-games whose C2 expected score was nearest this team's (score bank,
 *                   earlier slate days only). Real football clustering (7, 10, 14, 17, 21, 24, 28 …) comes
 *                   from data, not from rounding a Gaussian.
 *   overtime        each OT period both teams draw points from the empirical as-of per-period distribution;
 *                   repeat until the period ends unequal.
 *
 * Every world is checked: integer, non-negative scores; margin = home − away; total = home + away; regulation
 * tie ⇔ overtime; winner = sign(margin) with no final ties. The receipt carries EXACT counts (numerators over
 * N), so every probability it states is a count / N.
 *
 * Pure: the RNG is seeded per event (seedFor); same inputs + seed + version → byte-identical receipt.
 */
import { fnv1a64 } from "../../forecast-ledger/identity.mjs";
import { mulberry32 } from "./metrics.mjs";
import { otDistribution as otRegimeDistribution } from "./overtime.mjs";

export const WORLD_ENGINE_VERSION = "ncaaf-worlds@1";
export const DEFAULT_WORLDS = 10_000;
export const BANK_NEIGHBOURS = 400;
const MAX_OT_PERIODS = 30;

/** 32-bit seed for one event under one engine version and base seed. */
export function seedFor(eventId, baseSeed = 20261009) {
  return parseInt(fnv1a64(`${WORLD_ENGINE_VERSION}|${baseSeed}|${eventId}`).slice(-8), 16) >>> 0;
}

/**
 * Score bank: past team-games as { mu, score } (mu = C2 expected points at forecast time, score = that team's
 * REGULATION points). `conditional(mu)` returns the sorted scores of the K entries with nearest mu.
 */
export function createScoreBank() {
  const entries = []; // kept sorted by mu
  return {
    get size() { return entries.length; },
    add(mu, score) {
      if (!Number.isFinite(mu) || !Number.isInteger(score) || score < 0) throw new Error(`score bank: bad entry ${mu}/${score}`);
      let lo = 0, hi = entries.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (entries[m].mu < mu) lo = m + 1; else hi = m; }
      entries.splice(lo, 0, { mu, score });
    },
    conditional(mu, k = BANK_NEIGHBOURS) {
      if (entries.length < k) return null;
      let lo = 0, hi = entries.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (entries[m].mu < mu) lo = m + 1; else hi = m; }
      let l = lo - 1, r = lo;
      const out = [];
      while (out.length < k) {
        // Ties in distance go to the lower-mu side: deterministic.
        if (r >= entries.length || (l >= 0 && mu - entries[l].mu <= entries[r].mu - mu)) out.push(entries[l--].score);
        else out.push(entries[r++].score);
      }
      return Int32Array.from(out).sort();
    },
  };
}

const drawDiscrete = (dist, u) => {
  let acc = 0;
  for (let i = 0; i < dist.values.length; i++) { acc += dist.probs[i]; if (u < acc) return dist.values[i]; }
  return dist.values.at(-1);
};

const inc = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
const sortedObj = (m) => Object.fromEntries([...m].sort((a, b) => a[0] - b[0]));
function percentiles(hist, n) {
  const keys = [...hist.keys()].sort((a, b) => a - b);
  const at = (q) => { let acc = 0; for (const k of keys) { acc += hist.get(k); if (acc >= q * n) return k; } return keys.at(-1); };
  return Object.fromEntries([0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95].map((q) => [`p${Math.round(q * 100)}`, at(q)]));
}

/**
 * Simulate one event. `forecast` = the score champion's { homeMean, awayMean, rho }; `bank` a score bank as of
 * the slate; `ot` = otDistribution(…) as of the slate. → receipt, or { refused } with a reason.
 */
export function simulateEvent({ eventId, forecast, bank, ot, n = DEFAULT_WORLDS, baseSeed = 20261009 }) {
  if (ot?.refused) return { refused: ot.refused };
  if (!Number.isFinite(forecast?.homeMean) || !Number.isFinite(forecast?.awayMean) || !Number.isFinite(forecast?.rho)) return { refused: "FORECAST_INCOMPLETE" };
  const qh = bank.conditional(forecast.homeMean), qa = bank.conditional(forecast.awayMean);
  if (!qh || !qa) return { refused: `SCORE_BANK_INSUFFICIENT_n${bank.size}` };
  const rho = forecast.rho, sq = Math.sqrt(1 - rho * rho);
  const seed = seedFor(eventId, baseSeed);
  const rand = mulberry32(seed);
  const k = qh.length;
  const pick = (q, z) => q[Math.min(k - 1, Math.floor(0.5 * (1 + erf(z / Math.SQRT2)) * k))];

  let homeWins = 0, overtimeWorlds = 0, sumHome = 0, sumAway = 0;
  const margin = new Map(), total = new Map(), otPeriods = new Map(), regulationTieScore = new Map();
  for (let w = 0; w < n; w++) {
    // Box–Muller from the seeded stream (u1 shifted off 0 so the log is finite).
    const u1 = (rand() + 1e-12) / (1 + 1e-12), u2 = rand();
    const g1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const g2 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
    let h = pick(qh, g1), a = pick(qa, rho * g1 + sq * g2);
    let periods = 0;
    if (h === a) {
      inc(regulationTieScore, h);
      while (h === a) {
        periods++;
        if (periods > MAX_OT_PERIODS) throw new Error(`${eventId}: world ${w} exceeded ${MAX_OT_PERIODS} OT periods`);
        const dist = ot.periods[periods >= 3 ? "3+" : String(periods)];
        h += drawDiscrete(dist, rand()); a += drawDiscrete(dist, rand());
      }
      overtimeWorlds++;
      inc(otPeriods, periods);
    }
    // Coherence: every derived quantity is read from this one world.
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h === a) throw new Error(`${eventId}: incoherent world ${w} ${h}-${a}`);
    if (h > a) homeWins++;
    sumHome += h; sumAway += a;
    inc(margin, h - a); inc(total, h + a);
  }
  return {
    engine: WORLD_ENGINE_VERSION,
    eventId,
    seed,
    worlds: n,
    counts: { homeWins, awayWins: n - homeWins, overtimeWorlds },
    pHome: homeWins / n,
    mean: { home: sumHome / n, away: sumAway / n, margin: (sumHome - sumAway) / n, total: (sumHome + sumAway) / n },
    marginPercentiles: percentiles(margin, n),
    totalPercentiles: percentiles(total, n),
    marginHistogram: sortedObj(margin),
    totalHistogram: sortedObj(total),
    overtimePeriodsHistogram: sortedObj(otPeriods),
    regulationTieScores: sortedObj(regulationTieScore),
    inputs: { homeMean: forecast.homeMean, awayMean: forecast.awayMean, rho, bankSize: bank.size, bankNeighbours: k, otRegime: ot.regime, otObservations: Object.fromEntries(Object.entries(ot.periods).map(([p, d]) => [p, d.n])) },
  };
}

function erf(x) {
  const s = x < 0 ? -1 : 1, ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax));
}

/**
 * Walk-forward wrapper: the score champion's forecast plus a world receipt, with the score bank and the OT
 * distribution built only from slates already observed. Worlds are produced for the primary population
 * (FBS–FBS) only; anything else carries `worlds: { refused: "NOT_IN_POPULATION" }`.
 * `otRowsById`: Map eventId → overtime row (overtime-periods.json `games`), `quarantinedIds`: Set.
 */
export function createWorldModel(inner, { otRows, quarantinedIds, n = DEFAULT_WORLDS, baseSeed = 20261009 }) {
  const bank = createScoreBank();
  const otById = new Map(otRows.map((r) => [r.eventId, r]));
  let ot = null, season = null, slate = null;
  return {
    id: `${inner.id}+worlds`, config: { inner: inner.config, engine: WORLD_ENGINE_VERSION, n, baseSeed, bankNeighbours: BANK_NEIGHBOURS },
    beginSlate(d, s) { inner.beginSlate(d, s); slate = d; season = s; ot = null; },
    predict(r) {
      const f = inner.predict(r);
      if (r.pairing !== "FBS-FBS") return { ...f, worlds: { refused: "NOT_IN_POPULATION" } };
      // OT distribution as of this slate (rows with slateDate < D), computed once per slate.
      ot ??= otRegimeDistribution(otRows, slate, season);
      return { ...f, worlds: simulateEvent({ eventId: r.eventId, forecast: f, bank, ot, n, baseSeed }) };
    },
    observe(rows, forecasts) {
      inner.observe(rows, forecasts);
      rows.forEach((r, i) => {
        if (r.pairing !== "FBS-FBS" || quarantinedIds.has(r.eventId)) return;
        let hReg = r.homeScore, aReg = r.awayScore;
        if (r.overtimePeriods > 0) {
          const o = otById.get(r.eventId);
          if (!o) return; // regulation score unknown → no bank entry (never guessed)
          hReg = o.homeRegulation; aReg = o.awayRegulation;
        }
        bank.add(forecasts[i].homeMean, hReg);
        bank.add(forecasts[i].awayMean, aReg);
      });
    },
  };
}
