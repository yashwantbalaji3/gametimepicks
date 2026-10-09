/**
 * NCAAF-004 challengers (docs/ncaaf/CHALLENGER_REGISTER.md). PRIVATE_RESEARCH.
 *
 * Kept OUT of models.mjs / game-worlds.mjs on purpose: those files are frozen by the NCAAF-002/003 freezes,
 * whose holdout guards refuse to re-run if they change. A challenger that is ever promoted is folded into the
 * champion code in its own reviewed change.
 *
 *   H1 C1w  — no new code: createC1 with a widened grid.
 *   H2 C1r  — createRecalibrated(inner): logistic recalibration a + b·logit p, refitted at each season start
 *             on the inner model's own out-of-sample FBS–FBS forecasts of all prior completed seasons ≥ 2017.
 *   H3 C2d  — createRidgeDivision: C2 plus division (FBS/FCS/NON_D1) offense/defense effects.
 *   H4 W2   — createAnalogWorldModel: exact empirical outcome distribution of the K nearest past FBS–FBS
 *             games in standardized (expected margin, expected total) space.
 *
 * All follow the walk-forward interface; every estimate uses earlier slate days only.
 */
import { calibrationSlopeIntercept } from "./metrics.mjs";
import { createModel } from "./models.mjs";

const PRIMARY = "FBS-FBS";
const DAY_MS = 86_400_000;
const daysBetween = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS;
const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
function erf(x) {
  const s = x < 0 ? -1 : 1, ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax));
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

/** H2 — season-start logistic recalibration of an inner model's P(home). */
export function createRecalibrated(inner, { firstSeason = 2017 } = {}) {
  const history = new Map(); // season → { ps, ys }
  let season = null, a = 0, b = 1, fittedOn = 0;
  return {
    id: `${inner.id}r`, config: { inner: inner.config, firstSeason },
    beginSlate(d, s) {
      inner.beginSlate(d, s);
      if (s !== season) {
        const ps = [], ys = [];
        for (const [hs, h] of history) if (hs >= firstSeason && hs < s) { ps.push(...h.ps); ys.push(...h.ys); }
        if (ps.length >= 200) ({ intercept: a, slope: b } = calibrationSlopeIntercept(ps, ys));
        else { a = 0; b = 1; }
        fittedOn = ps.length >= 200 ? ps.length : 0;
        season = s;
      }
    },
    predict(r) {
      const f = inner.predict(r);
      // Unfitted ⇒ exact identity (no logit round-trip).
      if (fittedOn === 0) return { ...f, pHomeRaw: f.pHome, recalibration: { a, b, fittedOn } };
      const p = Math.min(1 - 1e-9, Math.max(1e-9, f.pHome));
      return { ...f, pHomeRaw: f.pHome, pHome: sigmoid(a + b * logit(p)), recalibration: { a, b, fittedOn } };
    },
    observe(rows, forecasts) {
      // The inner model learns from its OWN forecasts; the recalibration history stores raw probabilities.
      inner.observe(rows, forecasts.map((f) => ({ ...f, pHome: f.pHomeRaw })));
      rows.forEach((r, i) => {
        if (r.pairing !== PRIMARY) return;
        if (!history.has(r.season)) history.set(r.season, { ps: [], ys: [] });
        history.get(r.season).ps.push(forecasts[i].pHomeRaw);
        history.get(r.season).ys.push(r.homeScore > r.awayScore ? 1 : 0);
      });
    },
  };
}

/**
 * H3 — C2 + division effects. Same estimator as models.mjs createRidge (decayed ridge, out-of-sample residual
 * scale per Amendment 1), with extra parameters `do:<div>` / `dd:<div>` penalised by lambdaDiv.
 */
export function createRidgeDivision({ lambda, H, lambdaDiv }) {
  const history = [], errors = [];
  const idx = new Map();
  let beta = new Float64Array(2), fittedThrough = -1, slate = null, sc = null;
  const fallback = createModel({ id: "B0" });
  const param = (k) => { if (!idx.has(k)) idx.set(k, 2 + idx.size); return idx.get(k); };
  const peek = (k) => (idx.has(k) ? beta[idx.get(k)] ?? 0 : 0);
  const design = (r) => {
    const nh = r.neutralSite === true ? 0 : 1;
    return [
      [[0, 1], [1, nh], [param(`o:${r.homeTeamId}`), 1], [param(`d:${r.awayTeamId}`), -1], [param(`do:${r.homeDivision}`), 1], [param(`dd:${r.awayDivision}`), -1]],
      [[0, 1], [param(`o:${r.awayTeamId}`), 1], [param(`d:${r.homeTeamId}`), -1], [param(`do:${r.awayDivision}`), 1], [param(`dd:${r.homeDivision}`), -1]],
    ];
  };
  function refit(d) {
    const obs = [];
    for (const r of history) {
      const w = 0.5 ** (daysBetween(r.slateDate, d) / H);
      if (w < 1e-4) continue;
      const [h, a] = design(r);
      obs.push({ e: h, w, y: r.homeScore }, { e: a, w, y: r.awayScore });
    }
    const P = idx.size + 2, pen = new Float64Array(P);
    pen[0] = pen[1] = 1e-6;
    for (const [k, i] of idx) pen[i] = k.startsWith("do:") || k.startsWith("dd:") ? lambdaDiv : lambda;
    const Av = (v, out) => {
      out.fill(0);
      for (const o of obs) { let s = 0; for (const [i, c] of o.e) s += c * v[i]; s *= o.w; for (const [i, c] of o.e) out[i] += c * s; }
      for (let i = 0; i < P; i++) out[i] += pen[i] * v[i];
    };
    const b = new Float64Array(P), diag = new Float64Array(P);
    for (const o of obs) for (const [i, c] of o.e) { b[i] += o.w * c * o.y; diag[i] += o.w * c * c; }
    for (let i = 0; i < P; i++) diag[i] += pen[i];
    const x = new Float64Array(P); x.set(beta.subarray(0, Math.min(beta.length, P)));
    const r = new Float64Array(P), z = new Float64Array(P), p = new Float64Array(P), Ap = new Float64Array(P);
    Av(x, Ap);
    for (let i = 0; i < P; i++) { r[i] = b[i] - Ap[i]; z[i] = r[i] / diag[i]; p[i] = z[i]; }
    let rz = r.reduce((s, v, i) => s + v * z[i], 0);
    const bn = Math.sqrt(b.reduce((s, v) => s + v * v, 0)) || 1;
    for (let it = 0; it < 1000; it++) {
      if (Math.sqrt(r.reduce((s, v) => s + v * v, 0)) / bn < 1e-9) break;
      Av(p, Ap);
      const alpha = rz / p.reduce((s, v, i) => s + v * Ap[i], 0);
      for (let i = 0; i < P; i++) { x[i] += alpha * p[i]; r[i] -= alpha * Ap[i]; z[i] = r[i] / diag[i]; }
      const rz2 = r.reduce((s, v, i) => s + v * z[i], 0);
      const g = rz2 / rz; rz = rz2;
      for (let i = 0; i < P; i++) p[i] = z[i] + g * p[i];
    }
    beta = x;
  }
  function scale(d) {
    if (errors.length < 200) {
      const f = fallback.predict({});
      const vm = f.marginSd ** 2, vt = f.totalSd ** 2;
      return { sigma: Math.sqrt((vm + vt) / 4), rho: (vt - vm) / (vt + vm) };
    }
    let sw = 0, s2 = 0, sx = 0;
    for (const e of errors) { const w = 0.5 ** (daysBetween(e.d, d) / H); sw += w; s2 += w * (e.eh * e.eh + e.ea * e.ea); sx += w * e.eh * e.ea; }
    const v = s2 / (2 * sw);
    return { sigma: Math.sqrt(v), rho: Math.max(-0.95, Math.min(0.95, sx / sw / v)) };
  }
  return {
    id: "C2d", config: { lambda, H, lambdaDiv },
    beginSlate(d, s) {
      slate = d; fallback.beginSlate(d, s);
      if (history.length !== fittedThrough) { refit(d); fittedThrough = history.length; }
      sc = scale(d);
    },
    predict(r) {
      const nh = r.neutralSite === true ? 0 : 1;
      const homeMean = beta[0] + beta[1] * nh + peek(`o:${r.homeTeamId}`) - peek(`d:${r.awayTeamId}`) + peek(`do:${r.homeDivision}`) - peek(`dd:${r.awayDivision}`);
      const awayMean = beta[0] + peek(`o:${r.awayTeamId}`) - peek(`d:${r.homeTeamId}`) + peek(`do:${r.awayDivision}`) - peek(`dd:${r.homeDivision}`);
      const marginSd = Math.sqrt(2 * sc.sigma ** 2 * (1 - sc.rho)), totalSd = Math.sqrt(2 * sc.sigma ** 2 * (1 + sc.rho));
      const marginMean = homeMean - awayMean;
      return { pHome: Phi(marginMean / marginSd), marginMean, marginSd, totalMean: homeMean + awayMean, totalSd, homeMean, awayMean, sigma: sc.sigma, rho: sc.rho };
    },
    observe(rows, forecasts) {
      rows.forEach((r, i) => {
        history.push(r);
        if (r.pairing === PRIMARY) errors.push({ d: slate, eh: r.homeScore - forecasts[i].homeMean, ea: r.awayScore - forecasts[i].awayMean });
      });
      fallback.observe(rows, rows.map(() => ({})));
    },
  };
}

/**
 * H4 — joint analog worlds. For an FBS–FBS game, the outcome distribution is EXACTLY the empirical distribution
 * of the (home margin, total) pairs of the K past FBS–FBS games nearest in (C2 expected margin, expected total),
 * each axis standardized by the bank's own SD as of the slate. Every analog is a real played game, so scores
 * are integers, (T ± M)/2 are its real scores, and key numbers, close-game share and overtime come from data.
 * Ties in distance break by eventId (deterministic). No sampling: N = K "analog worlds", zero Monte Carlo error.
 */
export function createAnalogWorldModel(inner, { K }) {
  const bank = []; // { mm, mt, margin, total, ot, eventId }
  return {
    id: `${inner.id}+W2`, config: { inner: inner.config, engine: "ncaaf-analog-worlds@1", K },
    beginSlate(d, s) { inner.beginSlate(d, s); },
    predict(r) {
      const f = inner.predict(r);
      if (r.pairing !== PRIMARY) return { ...f, worlds: { refused: "NOT_IN_POPULATION" } };
      if (bank.length < K) return { ...f, worlds: { refused: `ANALOG_BANK_INSUFFICIENT_n${bank.length}` } };
      const n = bank.length;
      let m1 = 0, m2 = 0, t1 = 0, t2 = 0;
      for (const b of bank) { m1 += b.mm; m2 += b.mm * b.mm; t1 += b.mt; t2 += b.mt * b.mt; }
      const sm = Math.sqrt(m2 / n - (m1 / n) ** 2), st = Math.sqrt(t2 / n - (t1 / n) ** 2);
      const scored = bank.map((b) => ({ b, d: ((b.mm - f.marginMean) / sm) ** 2 + ((b.mt - f.totalMean) / st) ** 2 }));
      scored.sort((x, y) => x.d - y.d || x.b.eventId.localeCompare(y.b.eventId));
      const near = scored.slice(0, K).map((x) => x.b);
      const margin = new Map(), total = new Map();
      let homeWins = 0, ot = 0, sm1 = 0, st1 = 0;
      for (const a of near) {
        margin.set(a.margin, (margin.get(a.margin) ?? 0) + 1);
        total.set(a.total, (total.get(a.total) ?? 0) + 1);
        if (a.margin > 0) homeWins++;
        if (a.ot) ot++;
        sm1 += a.margin; st1 += a.total;
      }
      const hist = (m) => Object.fromEntries([...m].sort((x, y) => x[0] - y[0]));
      const pct = (m) => {
        const keys = [...m.keys()].sort((x, y) => x - y);
        const at = (q) => { let acc = 0; for (const k of keys) { acc += m.get(k); if (acc >= q * K) return k; } return keys.at(-1); };
        return Object.fromEntries([0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95].map((q) => [`p${Math.round(q * 100)}`, at(q)]));
      };
      return {
        ...f,
        worlds: {
          engine: "ncaaf-analog-worlds@1", worlds: K, counts: { homeWins, awayWins: K - homeWins, overtimeWorlds: ot },
          pHome: homeWins / K, mean: { margin: sm1 / K, total: st1 / K },
          marginHistogram: hist(margin), totalHistogram: hist(total), marginPercentiles: pct(margin), totalPercentiles: pct(total),
          analogDistance: { median: Math.sqrt(scored[Math.floor(K / 2)].d), max: Math.sqrt(scored[K - 1].d) },
        },
      };
    },
    observe(rows, forecasts) {
      inner.observe(rows, forecasts);
      rows.forEach((r, i) => {
        if (r.pairing !== PRIMARY) return;
        bank.push({ mm: forecasts[i].marginMean, mt: forecasts[i].totalMean, margin: r.homeScore - r.awayScore, total: r.homeScore + r.awayScore, ot: r.overtimePeriods > 0, eventId: r.eventId });
      });
    },
  };
}
