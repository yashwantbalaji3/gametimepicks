/**
 * nba-possession-sim-v0 · THE POSSESSION ENGINE. PURE, seeded, deterministic. No I/O.
 * NBA RESEARCH PROTOTYPE · dataClass PRIVATE_RESEARCH · productEligible: false · never wired into a route, artifact
 * producer, workflow, product, board or the official snapshot.
 *
 * ONE DRAW = ONE FULL GAME, PLAY BY PLAY. The clock runs in deciseconds. Each period is a sequence of TIMED SEGMENTS
 * (one offensive "play": a shot attempt, a turnover, a free-throw trip or a non-shooting foul). For each segment:
 *   1. duration d ~ min(SHOT_CLOCK, Gamma(SEGMENT_DURATION_SHAPE, scale)) with the scale solved per game so that the
 *      expected segment length is 2880 s ÷ expected game segments per 48 (PACE_OFFSET + PACE_SLOPE·mean team pace).
 *      If d ≥ the time left, the period ends (no action). All ten players on court are credited with d.
 *   2. LATE FOUL: in period ≥ 4 with ≤ LATE_FOUL_WINDOW_DS left, a defence trailing by 1..LATE_FOUL_MAX_DEFICIT fouls
 *      intentionally → two free throws.
 *   3. else with probability nonFtFoulPerSegment (league, as of tip) a non-shooting personal foul: dead ball, same offence.
 *   4. else the play outcome, from the FIVE PLAYERS ON COURT (lineup-dependent): weights Σ TOV rate × defTov × home,
 *      Σ two-shot-trip rate × defTrip × home, Σ three-shot-trip rate, Σ FGA rate. The acting player is drawn ∝ his own
 *      rate for that outcome.
 *        TOV   → steal with probability STEAL_SHARE × (Σ defenders' STL rate ÷ 5·league), stealer ∝ STL rate.
 *        trip  → shooting foul (fouler ∝ PF rate), 2 or 3 free throws at the shooter's FT%.
 *        FGA   → three with the shooter's 3PA share; make probability = his shrunk 3P% / 2P% × defFg × home.
 *                made → assisted with probability min(1, Σ on-court AST rate ÷ Σ on-court FGM rate), assister ∝ AST
 *                rate among the other four; and-one with probability AND_ONE_PER_FGM.
 *                missed → blocked with probability BLOCK_PER_MISS{2,3} × (Σ defenders' BLK rate ÷ 5·league).
 *   5. REBOUND (missed FG or missed last free throw): a player rebound with PLAYER_REBOUND_SHARE (else a team rebound),
 *      offensive with probability Σ offence OREB rate ÷ (Σ offence OREB + Σ defence DREB) — lineup-dependent;
 *      rebounder ∝ his OREB / DREB rate.
 * POSSESSION changes on a made basket (after any and-one free throw), a made last free throw, a defensive rebound and
 * a turnover; Q1 and every OT start with a jump ball (0.5), Q2/Q3 go to the tip loser and Q4 to the tip winner.
 *
 * ROTATION. Each draw first draws every player's TARGET minutes exactly as v1 does (Bernoulli(playRate) ×
 * N(mean, sd) clipped to [0, 48], raised to MINUTES_POWER, water-filled to 240 with a 48-minute cap). Substitutions
 * happen only at period starts and at the first dead ball after each mandatory-timeout point (7:00 and 3:00): the five
 * eligible players with the largest remaining target time (target − played) take the floor. A player's 6th foul
 * disqualifies him and forces an immediate substitution. An OT period rescales the targets to 240 + 25·OT (cap
 * 48 + 5·OT). Minutes are therefore exactly the seconds on court: 5 players × game length per team, by construction.
 *
 * DETERMINISM: draw i uses mulberry32(fnv1a32(`${seed}:${i}`)), seed = fnv1a32(providerEventId) by default — any draw
 * replays from (seed, runIndex) alone.
 */
import { fnv1a32, mulberry32 } from "../../game-sim.mjs";
import { waterFill } from "../../game-sim-v1.mjs";
import { POSSESSION_PARAMS } from "./params.mjs";
import { foldEvents, periodLengthDs, BOX_KEYS } from "./events.mjs";

export const MIN_PLAYERS = 5;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/* ─────────────── variates ─────────────── */
function normal(rng) {
  const u1 = Math.max(1e-12, rng()), u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function gammaVariate(rng, shape) {
  if (shape < 1) return gammaVariate(rng, shape + 1) * Math.max(1e-12, rng()) ** (1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
/** Regularised lower incomplete gamma P(a, x) (series / continued fraction). */
export function gammaP(a, x) {
  if (x <= 0) return 0;
  const lgA = lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 500; n += 1) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
    return sum * Math.exp(-x + a * Math.log(x) - lgA);
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i += 1) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lgA) * h;
}
function lnGamma(z) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1; let x = c[0];
  for (let i = 1; i < g + 2; i += 1) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
/** E[min(cap, G)], G ~ Gamma(shape k, scale s). */
export const cappedGammaMean = (k, s, cap) => k * s * gammaP(k + 1, cap / s) + cap * (1 - gammaP(k, cap / s));
/** Scale s with E[min(cap, Gamma(k, s))] = mean (bisection; mean < cap required). */
export function solveGammaScale(k, mean, cap) {
  if (!(mean > 0 && mean < cap)) throw new Error(`solveGammaScale: mean ${mean} must lie in (0, ${cap})`);
  let lo = 1e-6, hi = cap * 50;
  for (let i = 0; i < 200; i += 1) { const mid = (lo + hi) / 2; if (cappedGammaMean(k, mid, cap) < mean) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function pick(rng, idx, w) {
  let tot = 0;
  for (const j of idx) tot += w[j] > 0 ? w[j] : 0;
  if (!(tot > 0)) return idx[Math.floor(rng() * idx.length)];
  let x = rng() * tot;
  for (const j of idx) { const v = w[j] > 0 ? w[j] : 0; if (x < v) return j; x -= v; }
  for (let k = idx.length - 1; k >= 0; k -= 1) if (w[idx[k]] > 0) return idx[k];
  return idx[idx.length - 1];
}

/* ─────────────── preparation (fixed per game) ─────────────── */
/**
 * @param home/away  { providerTeamId, side: buildPossessionSide() result }
 * @param leagueV1   sim-v1-profile leagueMeans() as of tip;  leagueExt  profile-ext leagueExtended() as of tip
 */
export function preparePossessionGame({ providerEventId, seed = null, neutralSite = false, home, away, leagueV1, leagueExt, params = POSSESSION_PARAMS }) {
  if (!providerEventId) throw new Error("preparePossessionGame: providerEventId required");
  const P = params;
  for (const [k, s] of [["home", home], ["away", away]]) {
    const n = s.side?.players?.length ?? 0;
    if (n < MIN_PLAYERS) throw new Error(`REFUSED: ${k} side has ${n} simulable players (< ${MIN_PLAYERS})`);
  }
  const lgFtPct = leagueV1.rates.fta > 0 ? leagueV1.rates.ftm / leagueV1.rates.fta : 0.78;
  const player = (p) => {
    const r = p.rates, e = p.ext;
    const fga = r.threePa + r.twoPa, fgm = r.threePm + r.twoPm;
    const trip3 = P.THREE_SHOT_TRIPS_PER_MIN * (leagueV1.rates.threePa > 0 ? r.threePa / leagueV1.rates.threePa : 1);
    return {
      id: String(p.providerAthleteId), mean: p.minutesMean, sd: p.minutesSd, play: p.playRate,
      fga, threeShare: fga > 0 ? r.threePa / fga : 0, p3: p.p3, p2: p.p2, pft: r.fta > 0 ? clamp(r.ftm / r.fta, 0, 1) : lgFtPct,
      tov: e.tov, trip2: Math.max(0, (r.fta - P.AND_ONE_PER_FGM * fgm - 3 * trip3) / 2), trip3,
      oreb: e.oreb, dreb: e.dreb, stl: e.stl, blk: e.blk, pf: e.pf, ast: r.ast, fgm,
    };
  };
  const hf = (ratio, t) => (neutralSite ? 1 : t === 0 ? Math.sqrt(ratio) : 1 / Math.sqrt(ratio));
  const sides = [home, away].map((s, t) => {
    const ps = s.side.players.map(player);
    const f = s.side.factors;
    return {
      teamId: String(s.providerTeamId), players: ps,
      w: Object.fromEntries(["tov", "trip2", "trip3", "fga", "oreb", "dreb", "stl", "blk", "pf", "ast", "fgm"].map((k) => [k, ps.map((x) => x[k])])),
      defFg: f.defFgPct, defTov: f.defTov, defTrip: f.defTrip, pace: f.pace,
      hFg: hf(P.HOME_FG_RATIO, t), hTov: hf(P.HOME_TOV_RATIO, t), hTrip: hf(P.HOME_TRIP_RATIO, t),
    };
  });
  const segmentsPer48 = P.PACE_OFFSET + P.PACE_SLOPE * (sides[0].pace + sides[1].pace) / 2;
  const meanDs = 28800 / segmentsPer48;
  const scale = solveGammaScale(P.SEGMENT_DURATION_SHAPE, meanDs, P.SHOT_CLOCK_DS);
  const seeded = seed != null ? { seed: String(seed), seedPolicy: "explicit" } : { seed: fnv1a32(String(providerEventId)), seedPolicy: "fixed-per-game: hash(providerEventId); draw i uses mulberry32(fnv1a32(seed + ':' + i))" };
  return {
    ...seeded, providerEventId: String(providerEventId), params: P, sides, segmentsPer48, meanSegmentDs: meanDs, durationScale: scale,
    league: { stl: leagueExt.perMinute.stl, blk: leagueExt.perMinute.blk, nonFtFoulPerSegment: leagueExt.nonFtFoulPerSegment },
    rosters: sides.map((s) => s.players.map((p) => p.id)),
  };
}

/* ─────────────── one draw ─────────────── */
export function simulatePossessionDraw(prep, runIndex) {
  const P = prep.params;
  const rng = mulberry32(fnv1a32(`${prep.seed}:${runIndex}`));
  const S = prep.sides;
  const notes = { segments: 0, possessions: [0, 0], fouledOut: 0, disqualifiedStayed: 0, targetTopUps: 0, lateFouls: 0, subs: 0 };

  // targets (v1's rule), in deciseconds
  const target = S.map((sp) => {
    const raw = sp.players.map((p) => { const plays = rng() < p.play; const m = clamp(p.mean + p.sd * normal(rng), 0, 48); return plays ? m ** P.MINUTES_POWER : 0; });
    let positive = raw.filter((m) => m > 0).length;
    if (positive < MIN_PLAYERS) {
      const order = sp.players.map((_, j) => j).filter((j) => !(raw[j] > 0)).sort((x, y) => sp.players[y].mean * sp.players[y].play - sp.players[x].mean * sp.players[x].play || x - y);
      for (const j of order) { if (positive >= MIN_PLAYERS) break; raw[j] = Math.max(1, sp.players[j].mean) ** P.MINUTES_POWER; positive += 1; notes.targetTopUps += 1; }
    }
    return waterFill(raw, 144000, 28800); // 240 team-minutes = 144,000 ds; 48-minute cap = 28,800 ds
  });

  const played = S.map((sp) => sp.players.map(() => 0));
  const fouls = S.map((sp) => sp.players.map(() => 0));
  const ledger = S.map((sp) => sp.players.map(() => ({ ds: 0, ...Object.fromEntries(BOX_KEYS.map((k) => [k, 0])) })));
  const on = [[], []];
  const score = [0, 0];
  const events = [];
  let q = 0, clock = 0, poss = 0, tipWinner = 0;
  const id = (t, j) => S[t].players[j].id;
  const emit = (type, fields = {}) => { events.push({ i: events.length, q, c: clock, type, poss, ...fields, s: [score[0], score[1]] }); };
  const run = (dt) => { clock -= dt; for (let t = 0; t < 2; t += 1) for (const j of on[t]) { played[t][j] += dt; ledger[t][j].ds += dt; } };

  const chooseLineup = (t) => {
    const n = S[t].players.length;
    const all = Array.from({ length: n }, (_, j) => j);
    let elig = all.filter((j) => fouls[t][j] < P.PERSONAL_FOUL_LIMIT && target[t][j] > 0);
    if (elig.length < MIN_PLAYERS) {
      const extra = all.filter((j) => fouls[t][j] < P.PERSONAL_FOUL_LIMIT && !(target[t][j] > 0)).sort((x, y) => S[t].players[y].mean - S[t].players[x].mean || x - y);
      elig = elig.concat(extra.slice(0, MIN_PLAYERS - elig.length));
    }
    if (elig.length < MIN_PLAYERS) { // rule: with no eligible substitute, a disqualified player stays in
      const dq = all.filter((j) => !elig.includes(j)).sort((x, y) => played[t][y] - played[t][x] || x - y);
      const k = MIN_PLAYERS - elig.length; elig = elig.concat(dq.slice(0, k)); notes.disqualifiedStayed += k;
    }
    return elig.sort((x, y) => (target[t][y] - played[t][y]) - (target[t][x] - played[t][x]) || target[t][y] - target[t][x] || x - y).slice(0, MIN_PLAYERS);
  };
  const applyLineup = (t, next) => {
    const cur = new Set(on[t]), nx = new Set(next);
    const outs = on[t].filter((j) => !nx.has(j)).sort((a, b) => a - b), ins = next.filter((j) => !cur.has(j)).sort((a, b) => a - b);
    for (let k = 0; k < outs.length; k += 1) {
      on[t] = on[t].filter((j) => j !== outs[k]).concat([ins[k]]);
      emit("sub", { team: t, in: id(t, ins[k]), out: id(t, outs[k]) }); notes.subs += 1;
    }
  };
  let windows = [], wIdx = 0;
  const deadBall = () => {
    let fire = false;
    while (wIdx < windows.length && clock <= windows[wIdx]) { wIdx += 1; fire = true; }
    if (fire) for (let t = 0; t < 2; t += 1) applyLineup(t, chooseLineup(t));
  };
  const foul = (t, kind, onId) => {
    const j = pick(rng, on[t], S[t].w.pf);
    fouls[t][j] += 1; ledger[t][j].pf += 1;
    const out = fouls[t][j] === P.PERSONAL_FOUL_LIMIT;
    emit("foul", { team: t, player: id(t, j), on: onId, kind, fouledOut: out });
    if (out) {
      notes.fouledOut += 1;
      const n = S[t].players.length;
      const bench = Array.from({ length: n }, (_, k) => k).filter((k) => !on[t].includes(k) && fouls[t][k] < P.PERSONAL_FOUL_LIMIT);
      if (bench.length) {
        const k = bench.sort((x, y) => (target[t][y] - played[t][y]) - (target[t][x] - played[t][x]) || target[t][y] - target[t][x] || x - y)[0];
        on[t] = on[t].filter((x) => x !== j).concat([k]);
        emit("sub", { team: t, in: id(t, k), out: id(t, j) }); notes.subs += 1;
      } else notes.disqualifiedStayed += 1;
    }
  };
  const sumOn = (t, k) => { let s = 0; for (const j of on[t]) s += S[t].w[k][j]; return s; };
  const rebound = (o) => {
    const d = 1 - o;
    const ro = sumOn(o, "oreb"), rd = sumOn(d, "dreb");
    const isPlayer = rng() < P.PLAYER_REBOUND_SHARE;
    const off = rng() < ro / (ro + rd);
    const t = off ? o : d;
    let pid = null;
    if (isPlayer) { const j = pick(rng, on[t], off ? S[t].w.oreb : S[t].w.dreb); pid = id(t, j); ledger[t][j].reb += 1; ledger[t][j][off ? "oreb" : "dreb"] += 1; }
    emit("rebound", { team: t, player: pid, kind: off ? "offensive" : "defensive" });
    if (!off) { poss = d; notes.possessions[o] += 1; }
    if (!isPlayer) deadBall();
  };
  const trip = (o, j, n) => {
    const pft = S[o].players[j].pft;
    let made = false;
    for (let k = 1; k <= n; k += 1) {
      made = rng() < pft;
      ledger[o][j].fta += 1;
      if (made) { score[o] += 1; ledger[o][j].ftm += 1; ledger[o][j].pts += 1; }
      emit("free_throw", { team: o, player: id(o, j), made, n: k, of: n });
    }
    if (made) { poss = 1 - o; notes.possessions[o] += 1; deadBall(); } else rebound(o);
  };

  const L = prep.league;
  const playPeriod = () => {
    for (;;) {
      const dur = Math.max(1, Math.round(Math.min(P.SHOT_CLOCK_DS, gammaVariate(rng, P.SEGMENT_DURATION_SHAPE) * prep.durationScale)));
      if (dur >= clock) { run(clock); notes.possessions[poss] += 1; emit("period_end"); return; }
      run(dur); notes.segments += 1;
      const o = poss, d = 1 - o, so = S[o], sd = S[d];
      const lead = score[o] - score[d];
      if (q >= 4 && clock <= P.LATE_FOUL_WINDOW_DS && lead >= 1 && lead <= P.LATE_FOUL_MAX_DEFICIT) {
        const v = pick(rng, on[o], so.w.trip2);
        notes.lateFouls += 1;
        foul(d, "late_intentional", id(o, v));
        trip(o, v, 2);
        continue;
      }
      if (rng() < L.nonFtFoulPerSegment) { foul(d, "personal", null); deadBall(); continue; }
      const wT = sumOn(o, "tov") * sd.defTov * so.hTov, w2 = sumOn(o, "trip2") * sd.defTrip * so.hTrip, w3 = sumOn(o, "trip3"), wF = sumOn(o, "fga");
      let u = rng() * (wT + w2 + w3 + wF);
      if (u < wT) {
        const j = pick(rng, on[o], so.w.tov);
        ledger[o][j].tov += 1;
        let st = null;
        if (rng() < Math.min(1, P.STEAL_SHARE_OF_TOV * sumOn(d, "stl") / (5 * L.stl))) { const k = pick(rng, on[d], sd.w.stl); st = id(d, k); ledger[d][k].stl += 1; }
        emit("turnover", { team: o, player: id(o, j), steal: st });
        poss = d; notes.possessions[o] += 1;
        if (st == null) deadBall();
        continue;
      }
      u -= wT;
      if (u < w2 + w3) {
        const three = u >= w2;
        const j = pick(rng, on[o], three ? so.w.trip3 : so.w.trip2);
        foul(d, "shooting", id(o, j));
        trip(o, j, three ? 3 : 2);
        continue;
      }
      // field-goal attempt
      const j = pick(rng, on[o], so.w.fga);
      const pl = so.players[j];
      const three = rng() < pl.threeShare;
      const value = three ? 3 : 2;
      const pm = clamp((three ? pl.p3 : pl.p2) * sd.defFg * so.hFg, 0, 1);
      const made = rng() < pm;
      ledger[o][j].fga += 1; if (three) ledger[o][j].threePa += 1;
      if (made) {
        score[o] += value; ledger[o][j].fgm += 1; ledger[o][j].pts += value; if (three) ledger[o][j].threePm += 1;
        let ast = null;
        if (rng() < Math.min(1, sumOn(o, "ast") / sumOn(o, "fgm"))) {
          const others = on[o].filter((k) => k !== j);
          const k = pick(rng, others, so.w.ast); ast = id(o, k); ledger[o][k].ast += 1;
        }
        const andOne = rng() < P.AND_ONE_PER_FGM;
        emit("shot", { team: o, player: pl.id, value, made: true, assist: ast, block: null });
        if (andOne) { foul(d, "and_one", pl.id); trip(o, j, 1); } else { poss = d; notes.possessions[o] += 1; deadBall(); }
      } else {
        let bl = null;
        const beta = three ? P.BLOCK_PER_MISS3 : P.BLOCK_PER_MISS2;
        if (rng() < Math.min(1, beta * sumOn(d, "blk") / (5 * L.blk))) { const k = pick(rng, on[d], sd.w.blk); bl = id(d, k); ledger[d][k].blk += 1; }
        emit("shot", { team: o, player: pl.id, value, made: false, assist: null, block: bl });
        rebound(o);
      }
    }
  };

  const periods = [[], []];
  for (q = 1; ; q += 1) {
    const ot = q > 4;
    if (ot) { // rescale targets to 240 + 25·OT (cap 48 + 5·OT)
      const nOt = q - 4;
      for (let t = 0; t < 2; t += 1) target[t] = waterFill(target[t].map((x) => (x > 0 ? x : 0)), 144000 + 15000 * nOt, 28800 + 3000 * nOt);
    }
    clock = periodLengthDs(q);
    windows = ot ? [] : [...P.MANDATORY_TIMEOUT_CLOCKS_DS]; wIdx = 0;
    const before = [score[0], score[1]];
    for (let t = 0; t < 2; t += 1) on[t] = chooseLineup(t);
    emit("period_start", { lineups: [on[0].map((j) => id(0, j)), on[1].map((j) => id(1, j))] });
    if (q === 1 || ot) {
      const w = rng() < 0.5 ? 0 : 1;
      if (q === 1) tipWinner = w;
      poss = w; emit("jump_ball", { team: w });
    } else poss = q === 4 ? tipWinner : 1 - tipWinner;
    playPeriod();
    periods[0].push(score[0] - before[0]); periods[1].push(score[1] - before[1]);
    if (q >= 4 && score[0] !== score[1]) break;
    if (q >= 4 + 50) throw new Error("possession engine: more than 50 overtime periods");
  }
  emit("game_end", { final: [score[0], score[1]] });
  const box = foldEvents(events, prep.rosters);
  return { runIndex, events, box, ledger, final: [score[0], score[1]], periods, overtimePeriods: q - 4, notes, targets: target.map((a) => a.map((x) => Math.round(x))) };
}
