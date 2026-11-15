/**
 * NCAAF-002 candidates, exactly as registered in docs/ncaaf/MODEL_EVALUATION_PROTOCOL.md §4 (+ Amendment 1).
 * PRIVATE_RESEARCH. Each model follows the walk-forward interface (walk-forward.mjs): it never sees an
 * outcome before the runner hands it the slate's results, and every estimate it uses — ratings, ridge fits,
 * slopes, residual scales — is built from games of earlier slate days only.
 *
 *   B0  no-information          P = 0.5; margin ~ N(0, σ_m); total ~ N(μ_T, σ_T)
 *   B1  home-field only         P = past home win rate (0.5 neutral); margin mean = past home margin
 *   C1  Elo + margin of victory P = 1/(1+10^(−Δ/400)); margin ~ N(βΔ, σ_m)
 *   C2  ridge offense/defense   joint (home, away) points ~ bivariate Normal from a decayed ridge fit
 *   C3  C2 + conference effects partial pooling of teams toward conferences
 *
 * "Scored population" statistics (B0 moments, C1 slope, C2/C3 error scale) use FBS–FBS games only — the
 * protocol's primary population — so a lopsided FCS–NON_D1 game cannot widen an FBS forecast.
 */

const PRIMARY = "FBS-FBS";
const DAY_MS = 86_400_000;
const daysBetween = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS;
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
function erf(x) {
  const s = x < 0 ? -1 : 1, ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax));
}

/** Welford running mean/variance. */
function moments() {
  let n = 0, mean = 0, m2 = 0, sq = 0;
  return {
    push(x) { n++; const d = x - mean; mean += d / n; m2 += d * (x - mean); sq += x * x; },
    get n() { return n; },
    get mean() { return mean; },
    sd() { return n > 1 ? Math.sqrt(m2 / (n - 1)) : NaN; },
    rms() { return n ? Math.sqrt(sq / n) : NaN; },
  };
}

/** Expanding FBS–FBS margin/total statistics shared by B0, B1 (totals) and C1 (totals). Burn-in defaults
 *  apply only before 30 primary games have been observed, i.e. inside the never-scored 2016 burn-in. */
function primaryMoments() {
  const margin = moments(), total = moments(), homeMarginNonNeutral = moments();
  let homeWins = 0, nonNeutral = 0;
  const ready = () => margin.n >= 30;
  return {
    observe(rows) {
      for (const r of rows) {
        if (r.pairing !== PRIMARY) continue;
        const m = r.homeScore - r.awayScore;
        margin.push(m); total.push(r.homeScore + r.awayScore);
        if (r.neutralSite !== true) { nonNeutral++; homeWins += m > 0 ? 1 : 0; homeMarginNonNeutral.push(m); }
      }
    },
    marginRms: () => (ready() ? margin.rms() : 20),
    marginSd: () => (ready() ? margin.sd() : 20),
    totalMean: () => (ready() ? total.mean : 55),
    totalSd: () => (ready() ? total.sd() : 17),
    homeWinRate: () => (nonNeutral >= 30 ? homeWins / nonNeutral : 0.5),
    homeMargin: () => (homeMarginNonNeutral.n >= 30 ? homeMarginNonNeutral.mean : 0),
    homeMarginSd: () => (homeMarginNonNeutral.n >= 30 ? homeMarginNonNeutral.sd() : 20),
  };
}

export function createB0() {
  const pm = primaryMoments();
  return {
    id: "B0", config: {},
    beginSlate() {},
    // Mean 0 ⇒ the scale is the RMS of past margins about 0 (the forecast's own centre).
    predict() { return { pHome: 0.5, marginMean: 0, marginSd: pm.marginRms(), totalMean: pm.totalMean(), totalSd: pm.totalSd() }; },
    observe(rows) { pm.observe(rows); },
  };
}

export function createB1() {
  const pm = primaryMoments();
  return {
    id: "B1", config: {},
    beginSlate() {},
    predict(r) {
      const neutral = r.neutralSite === true;
      return {
        pHome: neutral ? 0.5 : pm.homeWinRate(),
        marginMean: neutral ? 0 : pm.homeMargin(),
        marginSd: pm.homeMarginSd(),
        totalMean: pm.totalMean(),
        totalSd: pm.totalSd(),
      };
    },
    observe(rows) { pm.observe(rows); },
  };
}

/** C1 — Elo with margin-of-victory multiplier. config: { K, HFA, c, dFcs }. */
export function createC1({ K, HFA, c, dFcs }) {
  const prior = (div) => (div === "FBS" ? 1500 : div === "FCS" ? 1500 - dFcs : 1500 - dFcs - 200);
  const teams = new Map();
  const team = (id, div) => { if (!teams.has(id)) teams.set(id, { R: prior(div), div }); return teams.get(id); };
  const pm = primaryMoments();
  let season = null;
  // Expanding least squares through the origin: margin ≈ β·Δ (Δ is pregame, so this is out-of-sample).
  let sxx = 0, sxy = 0, syy = 0, n = 0;
  const beta = () => (n >= 200 ? sxy / sxx : 1 / 25);
  const sigma = () => (n >= 200 ? Math.sqrt(Math.max(1, (syy - 2 * beta() * sxy + beta() ** 2 * sxx) / n)) : 18);
  return {
    id: "C1", config: { K, HFA, c, dFcs },
    beginSlate(_d, s) {
      if (season !== null && s !== season) for (const t of teams.values()) { const p = prior(t.div); t.R = p + c * (t.R - p); }
      season = s;
    },
    predict(r) {
      const delta = team(r.homeTeamId, r.homeDivision).R - team(r.awayTeamId, r.awayDivision).R + (r.neutralSite === true ? 0 : HFA);
      return {
        pHome: 1 / (1 + 10 ** (-delta / 400)),
        marginMean: beta() * delta, marginSd: sigma(),
        totalMean: pm.totalMean(), totalSd: pm.totalSd(),
        delta,
      };
    },
    observe(rows, forecasts) {
      rows.forEach((r, i) => {
        const f = forecasts[i];
        const m = r.homeScore - r.awayScore;
        const won = m > 0 ? 1 : 0;
        const dWinner = won ? f.delta : -f.delta;
        const mov = Math.log(Math.abs(m) + 1) * 2.2 / (0.001 * dWinner + 2.2);
        const change = K * mov * (won - f.pHome);
        const h = team(r.homeTeamId, r.homeDivision), a = team(r.awayTeamId, r.awayDivision);
        h.R += change; a.R -= change;
        h.div = r.homeDivision; a.div = r.awayDivision;
        if (r.pairing === PRIMARY) { sxx += f.delta ** 2; sxy += f.delta * m; syy += m * m; n++; }
      });
      pm.observe(rows);
    },
  };
}

/**
 * C2 / C3 — decayed ridge offense/defense model, solved per slate day by Jacobi-preconditioned conjugate
 * gradients on the normal equations (matrix-free), warm-started from the previous slate.
 * config: { lambda, H, lambdaC } (lambdaC null ⇒ C2, number ⇒ C3).
 */
export function createRidge({ lambda, H, lambdaC = null }) {
  const withConf = lambdaC !== null;
  const history = [];   // observed rows
  const errors = [];    // { d, eh, ea } out-of-sample errors on FBS–FBS games (Amendment 1)
  const pm = primaryMoments();
  const idx = new Map(); // "o:<team>" / "d:<team>" / "co:<conf>" / "cd:<conf>" → parameter index
  let beta = new Float64Array(2);
  let fittedThrough = -1;
  let slate = null;

  const param = (key) => { if (!idx.has(key)) idx.set(key, 2 + idx.size); return idx.get(key); };
  const peek = (key) => (idx.has(key) ? beta[idx.get(key)] ?? 0 : 0);

  function design(r) {
    // Two observations per game. Entries: [index, coefficient]; conference entries only for C3.
    const nh = r.neutralSite === true ? 0 : 1;
    const hc = r.homeConferenceId, ac = r.awayConferenceId;
    const home = [[0, 1], [1, nh], [param(`o:${r.homeTeamId}`), 1], [param(`d:${r.awayTeamId}`), -1]];
    const away = [[0, 1], [param(`o:${r.awayTeamId}`), 1], [param(`d:${r.homeTeamId}`), -1]];
    if (withConf) {
      if (hc) { home.push([param(`co:${hc}`), 1]); away.push([param(`cd:${hc}`), -1]); }
      if (ac) { away.push([param(`co:${ac}`), 1]); home.push([param(`cd:${ac}`), -1]); }
    }
    return [home, away];
  }

  function refit(d) {
    const obs = [];
    for (const r of history) {
      const w = 0.5 ** (daysBetween(r.slateDate, d) / H);
      if (w < 1e-4) continue; // numerical tolerance, not a modelling choice: weight < 1/10,000
      const [home, away] = design(r);
      obs.push({ e: home, w, y: r.homeScore }, { e: away, w, y: r.awayScore });
    }
    const P = idx.size + 2;
    const pen = new Float64Array(P);
    pen[0] = pen[1] = 1e-6;
    for (const [k, i] of idx) pen[i] = k.startsWith("c") ? lambdaC : lambda;
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
      const vm = pm.marginSd() ** 2, vt = pm.totalSd() ** 2;
      return { sigma: Math.sqrt((vm + vt) / 4), rho: (vt - vm) / (vt + vm) };
    }
    let sw = 0, s2 = 0, sx = 0;
    for (const e of errors) { const w = 0.5 ** (daysBetween(e.d, d) / H); sw += w; s2 += w * (e.eh * e.eh + e.ea * e.ea); sx += w * e.eh * e.ea; }
    const v = s2 / (2 * sw);
    return { sigma: Math.sqrt(v), rho: Math.max(-0.95, Math.min(0.95, sx / sw / v)) };
  }

  let sc = null;
  return {
    id: withConf ? "C3" : "C2", config: withConf ? { lambda, H, lambdaC } : { lambda, H },
    beginSlate(d) {
      slate = d;
      if (history.length !== fittedThrough) { refit(d); fittedThrough = history.length; }
      sc = scale(d);
    },
    predict(r) {
      const nh = r.neutralSite === true ? 0 : 1;
      const hc = r.homeConferenceId, ac = r.awayConferenceId;
      const conf = (k, c) => (withConf && c ? peek(`${k}:${c}`) : 0);
      const homeMean = beta[0] + beta[1] * nh + peek(`o:${r.homeTeamId}`) - peek(`d:${r.awayTeamId}`) + conf("co", hc) - conf("cd", ac);
      const awayMean = beta[0] + peek(`o:${r.awayTeamId}`) - peek(`d:${r.homeTeamId}`) + conf("co", ac) - conf("cd", hc);
      const marginSd = Math.sqrt(2 * sc.sigma ** 2 * (1 - sc.rho));
      const totalSd = Math.sqrt(2 * sc.sigma ** 2 * (1 + sc.rho));
      const marginMean = homeMean - awayMean;
      return {
        pHome: Phi(marginMean / marginSd),
        marginMean, marginSd, totalMean: homeMean + awayMean, totalSd,
        homeMean, awayMean, sigma: sc.sigma, rho: sc.rho,
      };
    },
    observe(rows, forecasts) {
      rows.forEach((r, i) => {
        history.push(r);
        if (r.pairing === PRIMARY) errors.push({ d: slate, eh: r.homeScore - forecasts[i].homeMean, ea: r.awayScore - forecasts[i].awayMean });
      });
      pm.observe(rows);
    },
  };
}

/** Factory by registered id. */
export function createModel(spec) {
  switch (spec.id) {
    case "B0": return createB0();
    case "B1": return createB1();
    case "C1": return createC1(spec);
    case "C2": return createRidge({ lambda: spec.lambda, H: spec.H });
    case "C3": return createRidge({ lambda: spec.lambda, H: spec.H, lambdaC: spec.lambdaC });
    default: throw new Error(`unknown candidate ${spec.id}`);
  }
}
