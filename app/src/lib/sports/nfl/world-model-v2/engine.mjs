/**
 * NFL WORLD MODEL V2 — COHERENT GAME-WORLD SIMULATOR (EXPERIMENTAL; not the forecast of record).
 *
 * One world = one internally consistent football game. Every number on the World Model V2 page is counted from the
 * same worlds:
 *   score      regulation margin/total drawn from the published margin and total heads (normal, mean = published
 *              median, sigma from the published 80% band), snapped to integer points (1 → 0)
 *   overtime   a world level after regulation plays overtime: (winner, loser) overtime points are drawn from the
 *              10-minute-OT record (2017–2025, including games still level after OT); the overtime winner is home
 *              with probability Φ(margin mean / margin sigma) — the same margin head, no second rating
 *   scoring    each team's regulation points → offensive TDs from the validated TD|points table (nfl-game-worlds-v1),
 *              then the rest of the points (defensive/special-teams TDs, extra points, two-point conversions, field
 *              goals, safeties) from historical team-games whose scoring added up exactly to the same points and
 *              offensive TDs; overtime points decompose as a touchdown (6, 7 or 8) or a field goal (3)
 *   volume     pass attempts and carries from the allocV1 volume fit plus the game-script slope on this world's margin
 *   players    Dirichlet-multinomial targets/attempts/carries over the active set (allocV1 shares after reallocation),
 *              binomial catches, gamma yards; passing yards = the receiving yards of the passer's completions, so a
 *              team's passing yards equal its receiving yards in every world
 *   touchdowns rushing TDs go to a ball carrier with a carry in this world, receiving TDs to a receiver with an unused
 *              reception, and each receiving TD credits ONE passing TD to a passer with a completion. A thrown TD is
 *              never an anytime-TD event for the passer; his own rushing TDs are.
 * Every world is checked; a violated invariant throws (a page is never built from an incoherent world).
 *
 * Pure and deterministic: same inputs + same seed ⇒ the same worlds. No I/O, no clock.
 */

export const WORLD_MODEL_V2_ENGINE = "nfl-world-model-v2-engine-1";
export const FAMILIES = ["passAttempts", "rushAttempts", "targets"];
const VOLKEY = { passAttempts: "passAtt", rushAttempts: "carries", targets: "targets" };

// ── deterministic randomness ───────────────────────────────────────────────────────────────────────────
export function hashSeed(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function normal(rng) { const u = Math.max(1e-12, rng()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
function gammaDraw(rng, shape) {
  if (shape <= 0) return 0;
  if (shape < 1) return gammaDraw(rng, shape + 1) * rng() ** (1 / shape);
  const d = shape - 1 / 3; const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x; let v;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function dirichlet(rng, alpha) { const g = alpha.map((a) => (a > 0 ? gammaDraw(rng, a) : 0)); const s = g.reduce((a, b) => a + b, 0); return s > 0 ? g.map((x) => x / s) : alpha.map(() => 1 / alpha.length); }
function binomial(rng, n, p) { let k = 0; for (let j = 0; j < n; j += 1) if (rng() < p) k += 1; return k; }
function multinomial(rng, n, p) {
  const out = new Array(p.length).fill(0); let left = n; let mass = 1;
  for (let i = 0; i < p.length - 1 && left > 0; i += 1) { const q = mass > 0 ? Math.min(1, Math.max(0, p[i] / mass)) : 0; const k = binomial(rng, left, q); out[i] = k; left -= k; mass -= p[i]; }
  out[p.length - 1] += left;
  return out;
}
function pick(rng, w) { const t = w.reduce((a, b) => a + b, 0); if (!(t > 0)) return -1; let u = rng() * t; for (let i = 0; i < w.length; i += 1) { u -= w[i]; if (u <= 0) return i; } return w.length - 1; }
/** Draw a key from [key, count] pairs. */
function drawHist(rng, entries) { const i = pick(rng, entries.map((e) => e[1])); return entries[i][0]; }
export function normalCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989422804014327 * Math.exp(-z * z / 2); const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return z > 0 ? 1 - p : p; }
const snapPts = (x) => { const v = Math.max(0, Math.round(x)); return v === 1 ? 0 : v; };

// ── availability and opportunity (allocV1, registered rule) ────────────────────────────────────────────
/** Active-set reallocation of one share: share × (a + rho·v)/a, capped so the named sum ≤ 1 − floor. */
export function reallocate(share, a, v, rho, floor) {
  if (!(a > 0)) return share;
  const named = a + rho * v;
  return share * (named / a) * Math.min(1, (1 - floor) / named);
}

/**
 * One team's simulation side. `pool` comes from the input packet; `isActive(member)` is the build-time availability
 * decision. `isActiveFor(member, family)` (optional) narrows one family further: an active backup quarterback is
 * active for carries but not for pass attempts, so his historical passing share counts as vacated, exactly as a
 * player with no row did in the development history the reallocation was fit on. Returns active members, allocated
 * shares per family (OTHER last), and the expected volume.
 */
export function prepareSide({ pool, isActive, isActiveFor = (p) => isActive(p), volumeBase, marginTeam, teamTdForm, params }) {
  const active = pool.filter((p) => isActive(p));
  const shares = {};
  for (const fam of FAMILIES) {
    const on = (p) => isActive(p) && isActiveFor(p, fam);
    const a = pool.filter(on).reduce((s, p) => s + p.shares[fam], 0);
    const v = pool.filter((p) => !on(p)).reduce((s, p) => s + p.shares[fam], 0);
    const s = active.map((p) => (on(p) ? reallocate(p.shares[fam], a, v, params.rho[fam], params.otherFloor) : 0));
    shares[fam] = [...s, Math.max(0, 1 - s.reduce((x, y) => x + y, 0))];
  }
  const V = {};
  for (const fam of FAMILIES) { const k = VOLKEY[fam]; V[k] = volumeBase[k] + params.volumeMarginSlope[k] * marginTeam; }
  const rzc = active.map((p) => p.redZone.carry); const rzt = active.map((p) => p.redZone.target);
  return {
    members: active, shares, V, marginTeam, teamTdForm,
    rzCarry: [...rzc, Math.max(0, 1 - rzc.reduce((x, y) => x + y, 0))],
    rzTarget: [...rzt, Math.max(0, 1 - rzt.reduce((x, y) => x + y, 0))],
  };
}

// ── scoring tables ─────────────────────────────────────────────────────────────────────────────────────
export function scoringTables(tables, minObs) {
  const offByPts = new Map(Object.entries(tables.offTdByPts).map(([p, h]) => [Number(p), Object.entries(h).map(([k, c]) => [Number(k), c])]));
  const poolCache = new Map();
  /** The validated TD|points pool: exact points, widened ±1..3 until ≥ minObs observations. */
  const tdPool = (pts) => {
    if (poolCache.has(pts)) return poolCache.get(pts);
    const acc = new Map();
    const add = (q) => { for (const [k, c] of offByPts.get(q) ?? []) acc.set(k, (acc.get(k) ?? 0) + c); };
    const n = () => [...acc.values()].reduce((a, b) => a + b, 0);
    add(pts);
    for (let w = 1; n() < minObs && w <= 3; w += 1) { add(pts - w); add(pts + w); }
    const out = acc.size ? [...acc.entries()] : [[Math.floor(pts / 7), 1]];
    poolCache.set(pts, out);
    return out;
  };
  const comp = new Map(Object.entries(tables.composition).map(([k, h]) => [k, Object.entries(h).map(([c, n]) => [c.split(",").map(Number), n])]));
  const ot = Object.entries(tables.overtime.outcomes).map(([k, n]) => [k.split(",").map(Number), n]);
  return { tdPool, comp, ot };
}

/**
 * The non-offensive-TD remainder of `pts` given `off` offensive TDs: [nonOffTd, xp, two, fg, safeties]. Drawn from
 * the historical team-games that added up exactly; constructed (each TD converts for one, then field goals, then a
 * two-point conversion or a safety) only when history has no exact match. null = no decomposition with `off` TDs.
 */
export function composeRegulation(rng, T, pts, off) {
  const hist = T.comp.get(`${pts}|${off}`);
  if (hist) return { parts: drawHist(rng, hist), constructed: false };
  let rem = pts - 6 * off;
  if (rem < 0) return null;
  let xp = Math.min(off, rem); rem -= xp;
  let two = 0; let saf = 0;
  let fg = Math.floor(rem / 3); rem -= 3 * fg;
  if (rem === 1) {
    if (xp > 0) { xp -= 1; two += 1; } else if (fg > 0) { fg -= 1; saf += 2; } else return null; // 4 = two safeties
  }
  else if (rem === 2) { if (xp >= 2) { xp -= 2; two += 2; } else saf = 1; }
  return { parts: [0, xp, two, fg, saf], constructed: true };
}
export function composeOvertime(pts) {
  const table = { 0: [0, 0, 0, 0, 0], 2: [0, 0, 0, 0, 1], 3: [0, 0, 0, 1, 0], 6: [1, 0, 0, 0, 0], 7: [1, 1, 0, 0, 0], 8: [1, 0, 1, 0, 0] };
  const t = table[pts];
  if (!t) throw new Error(`overtime points ${pts} have no decomposition`);
  return { td: t[0], xp: t[1], two: t[2], fg: t[3], saf: t[4] };
}

// ── the simulator ──────────────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} a
 * @param {object[]} a.sides [away, home] from prepareSide
 * @param {{mMean: number, mSigma: number, tMean: number, tSigma: number}} a.heads home-perspective margin, total
 * @param {object} a.params packet params  @param {object} a.tables packet tables
 * @param {number} a.runs  @param {string} a.seed
 */
export function simulateGame({ sides, heads, params, tables, runs, seed }) {
  const rng = mulberry32(hashSeed(seed));
  const T = scoringTables(tables, params.tdTableMinObs);
  const { league: L, dispersion: D, kappa: K, gameScript: S } = params;
  const pHomeOt = normalCdf(heads.mMean / heads.mSigma);
  const F32 = (n) => new Float32Array(n);
  const U8 = (n) => new Uint8Array(n);
  const game = { home: new Int16Array(runs), away: new Int16Array(runs), regHome: new Int16Array(runs), regAway: new Int16Array(runs), ot: U8(runs) };
  const team = sides.map((sd) => ({
    offTd: U8(runs), nonOffTd: U8(runs), xp: U8(runs), two: U8(runs), fg: U8(runs), saf: U8(runs), rushTd: U8(runs), recTd: U8(runs),
    passAtt: new Int16Array(runs), carries: new Int16Array(runs), completions: new Int16Array(runs), passYds: F32(runs), rushYds: F32(runs),
    players: sd.members.map(() => ({ targets: U8(runs), rec: U8(runs), recYds: F32(runs), carries: U8(runs), rushYds: F32(runs), passAtt: U8(runs), completions: U8(runs), passYds: F32(runs), rushTd: U8(runs), recTd: U8(runs), passTd: U8(runs) })),
  }));
  const diag = { worlds: runs, teamWorldsChecked: 0, constructedCompositions: 0, tdCountClipped: 0, receivingTdToRushing: 0, otherScorerTds: 0, otherPasserTds: 0, levelAfterRegulation: 0, levelAfterOvertime: 0 };
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  for (let r = 0; r < runs; r += 1) {
    // 1. regulation score from the published heads
    const M = heads.mMean + heads.mSigma * normal(rng);
    const Tt = Math.max(2, heads.tMean + heads.tSigma * normal(rng));
    const reg = [snapPts((Tt - M) / 2), snapPts((Tt + M) / 2)]; // [away, home]
    // 2. overtime
    const otPts = [0, 0];
    if (reg[0] === reg[1]) {
      diag.levelAfterRegulation += 1;
      const [w, l] = drawHist(rng, T.ot);
      const homeWins = rng() < pHomeOt;
      otPts[homeWins ? 1 : 0] = w; otPts[homeWins ? 0 : 1] = l;
      if (w === l) diag.levelAfterOvertime += 1;
      game.ot[r] = 1;
    }
    const final = [reg[0] + otPts[0], reg[1] + otPts[1]];
    game.away[r] = final[0]; game.home[r] = final[1]; game.regAway[r] = reg[0]; game.regHome[r] = reg[1];

    for (let si = 0; si < 2; si += 1) {
      const sd = sides[si]; const o = team[si]; const n = sd.members.length;
      // 3. scoring composition
      let off = 0;
      if (reg[si] >= 6) {
        off = drawHist(rng, T.tdPool(reg[si]));
        if (6 * off > reg[si]) { off = Math.floor(reg[si] / 6); diag.tdCountClipped += 1; }
      }
      let c = composeRegulation(rng, T, reg[si], off);
      while (!c) {
        if (off === 0) throw new Error(`invariant: ${reg[si]} points have no decomposition (${seed} world ${r})`);
        off -= 1; diag.tdCountClipped += 1; c = composeRegulation(rng, T, reg[si], off);
      }
      if (c.constructed) diag.constructedCompositions += 1;
      const [nonOff, xp, two, fg, saf] = c.parts;
      const oc = composeOvertime(otPts[si]);
      const offTd = off + oc.td;
      o.offTd[r] = offTd; o.nonOffTd[r] = nonOff; o.xp[r] = xp + oc.xp; o.two[r] = two + oc.two; o.fg[r] = fg + oc.fg; o.saf[r] = saf + oc.saf;
      if (6 * (offTd + nonOff) + o.xp[r] + 2 * o.two[r] + 3 * o.fg[r] + 2 * o.saf[r] !== final[si]) throw new Error(`invariant: scoring composition != points (${seed} world ${r})`);
      // 4. team volume (game script on this world's final margin)
      const real = si === 1 ? final[1] - final[0] : final[0] - final[1];
      const A = Math.max(0, Math.round(sd.V.passAtt + S.passAtt.beta * (real - sd.marginTeam) + S.passAtt.sigma * normal(rng)));
      const Kc = Math.max(0, Math.round(sd.V.carries + S.carries.beta * (real - sd.marginTeam) + S.carries.sigma * normal(rng)));
      const Tg = sd.V.passAtt > 0 ? Math.round(A * sd.V.targets / sd.V.passAtt) : 0;
      // 5. receiving
      const tgt = multinomial(rng, Tg, dirichlet(rng, sd.shares.targets.map((x) => x * K.t)));
      const rec = new Array(n + 1).fill(0); const recYds = new Array(n + 1).fill(0); let teamRec = 0; let teamRecYds = 0;
      for (let i = 0; i <= n; i += 1) {
        rec[i] = binomial(rng, tgt[i], i < n ? sd.members[i].rates.catch : L.catchRate);
        recYds[i] = rec[i] > 0 ? gammaDraw(rng, rec[i] * D.receivingShape) * ((i < n ? sd.members[i].rates.ypr : L.yardsPerReception) / D.receivingShape) : 0;
        teamRec += rec[i]; teamRecYds += recYds[i];
      }
      // 6. passing: attempts over passers, completions follow attempts, yards = receiving yards of those completions
      const att = multinomial(rng, A, dirichlet(rng, sd.shares.passAttempts.map((x) => x * K.p)));
      const cmp = A > 0 ? multinomial(rng, teamRec, att.map((x) => x / A)) : att.map(() => 0);
      if (A === 0 && teamRec > 0) cmp[n] = teamRec;
      const passYds = cmp.map((x) => (teamRec > 0 ? teamRecYds * x / teamRec : 0));
      // 7. rushing
      const car = multinomial(rng, Kc, dirichlet(rng, sd.shares.rushAttempts.map((x) => x * K.c)));
      const rushYds = car.map((k, i) => (k > 0 ? gammaDraw(rng, k * D.rushingShape) * ((i < n ? sd.members[i].rates.ypc : L.yardsPerCarry) / D.rushingShape) : 0));
      // 8. touchdowns: rushing/receiving split by team TD form; scorers need the opportunity in this world
      let rushTD = binomial(rng, offTd, sd.teamTdForm.rush / (sd.teamTdForm.rush + sd.teamTdForm.rec));
      let recTD = offTd - rushTD;
      const rushBy = new Array(n + 1).fill(0); const recBy = new Array(n + 1).fill(0); const passBy = new Array(n + 1).fill(0);
      for (let k = 0; k < recTD;) {
        const i = pick(rng, sd.rzTarget.map((w, ix) => (rec[ix] - recBy[ix] > 0 ? w : 0)));
        const j = i < 0 ? -1 : pick(rng, cmp.map((x, ix) => (x - passBy[ix] > 0 ? x - passBy[ix] : 0)));
        if (i < 0 || j < 0) { recTD -= 1; rushTD += 1; diag.receivingTdToRushing += 1; continue; }
        recBy[i] += 1; passBy[j] += 1; k += 1;
        if (i === n) diag.otherScorerTds += 1;
        if (j === n) diag.otherPasserTds += 1;
      }
      for (let k = 0; k < rushTD; k += 1) {
        let i = pick(rng, sd.rzCarry.map((w, ix) => (car[ix] - rushBy[ix] > 0 ? w : 0)));
        if (i < 0) i = n;
        rushBy[i] += 1;
        if (i === n) diag.otherScorerTds += 1;
      }
      // 9. invariants (every team-world)
      if (sum(cmp) !== teamRec) throw new Error(`invariant: completions != receptions (${seed} world ${r})`);
      if (Math.abs(sum(passYds) - teamRecYds) > 1e-6) throw new Error(`invariant: passing yards != receiving yards (${seed} world ${r})`);
      if (sum(rushBy) + sum(recBy) !== offTd || sum(passBy) !== sum(recBy) || sum(rushBy) !== rushTD || sum(recBy) !== recTD) throw new Error(`invariant: scorer TDs != team offensive TDs (${seed} world ${r})`);
      for (let i = 0; i <= n; i += 1) {
        if (recBy[i] > rec[i]) throw new Error(`invariant: receiving TDs exceed receptions (${seed} world ${r})`);
        if (i < n && rushBy[i] > car[i]) throw new Error(`invariant: rushing TDs exceed carries (${seed} world ${r})`);
        if (passBy[i] > cmp[i]) throw new Error(`invariant: passing TDs exceed completions (${seed} world ${r})`);
      }
      diag.teamWorldsChecked += 1;
      o.passAtt[r] = A; o.carries[r] = Kc; o.completions[r] = teamRec; o.passYds[r] = teamRecYds; o.rushYds[r] = sum(rushYds); o.rushTd[r] = rushTD; o.recTd[r] = recTD;
      for (let i = 0; i < n; i += 1) {
        const p = o.players[i];
        p.targets[r] = tgt[i]; p.rec[r] = rec[i]; p.recYds[r] = recYds[i]; p.carries[r] = car[i]; p.rushYds[r] = rushYds[i];
        p.passAtt[r] = att[i]; p.completions[r] = cmp[i]; p.passYds[r] = passYds[i]; p.rushTd[r] = rushBy[i]; p.recTd[r] = recBy[i]; p.passTd[r] = passBy[i];
      }
    }
  }
  return { game, team, diag, pHomeOt };
}

// ── summaries ──────────────────────────────────────────────────────────────────────────────────────────
const round = (x, d = 2) => Number(x.toFixed(d));
export function distribution(arr, ladder = []) {
  const n = arr.length;
  const s = Float64Array.from(arr).sort();
  const at = (p) => s[Math.min(n - 1, Math.floor(p * (n - 1)))];
  let mean = 0; for (let i = 0; i < n; i += 1) mean += arr[i]; mean /= n;
  let v = 0; for (let i = 0; i < n; i += 1) v += (arr[i] - mean) ** 2; v /= n;
  const out = { mean: round(mean), sd: round(Math.sqrt(v)), p10: round(at(0.1), 1), p25: round(at(0.25), 1), median: round(at(0.5), 1), p75: round(at(0.75), 1), p90: round(at(0.9), 1) };
  if (ladder.length) {
    out.atLeast = {};
    for (const t of ladder) { let k = 0; for (let i = 0; i < n; i += 1) if (arr[i] >= t) k += 1; out.atLeast[t] = round(k / n, 4); }
  }
  return out;
}
export const LADDERS = { receptions: [3, 4, 5, 6, 7], receivingYards: [25, 40, 50, 60, 75, 100], rushingYards: [25, 40, 50, 60, 75, 100], passingYards: [175, 200, 225, 250, 275, 300] };

/** Indices of real sampled worlds at the given quantiles of the home margin (ties broken by world index). */
export function representativeWorldIndices(game, quantiles) {
  const n = game.home.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => (game.home[a] - game.away[a]) - (game.home[b] - game.away[b]) || a - b);
  return quantiles.map((q) => ({ quantile: q, index: order[Math.min(n - 1, Math.floor(q * (n - 1)))] }));
}
