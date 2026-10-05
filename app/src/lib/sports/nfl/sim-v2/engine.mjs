/**
 * NFL SIMULATION ENGINE V2 — a drive-level generative game simulator (Session 13 · Phase D · SHADOW).
 *
 * ONE RUN = ONE COHERENT POSSIBLE GAME. Each run walks a game clock from kickoff to the final whistle (and overtime):
 *
 *   possession → drive result | field position, score state, clock state   (empirical tables, tilted per offense)
 *              → scrimmage plays, clock used                                (empirical)
 *              → net yards (exact for a TD: the whole field)                (empirical | result, start)
 *              → play mix: dropbacks (sacks, scrambles, attempts) vs runs   (| score × clock = game script)
 *              → players: passer, target, catch, carrier, TD scorer          (role shares + an explicit OTHER bucket)
 *              → points (TD + XP / two-point, FG, defensive TD, safety)
 *              → next possession's start (kickoff / mirrored end spot + offset)
 *
 * Every number a run reports is accumulated from that run's own events, so the invariants hold BY CONSTRUCTION and
 * are then CHECKED independently (coherence.mjs): points = scoring events, quarters sum to the final, team
 * completions = Σ player receptions, team passing TDs = Σ receiving TDs = the passer's TDs, team carries = Σ player
 * carries, first-TD scorer = the first TD event, overtime only from a regulation tie.
 *
 * WHAT IS NOT MODELLED (stated, not hidden): downs and distance, individual play clock, penalties, timeouts, kick
 * returns as events, the kicker as a player, weather. Yards inside a drive are the drive's empirical net yards split
 * across its plays in proportion to sampled per-player gains — so player yardage is tied to the field position the
 * drive actually covered, not sampled free.
 *
 * Team strength enters ONLY as one tilt θ per offense (in this matchup) on the drive-result table, solved so the
 * simulated mean points equal model-owned anchors (calibrate.mjs). No sportsbook number is an input.
 */
import { mulberry32 } from "../game-sim.mjs";
import { gammaDraw } from "../player-props-v1.mjs";

export const NFL_SIM_V2_ENGINE = "nfl-drive-sim-v2";
export const NFL_SIM_V2_VERSION = "2.0.0-shadow";
export const RESULTS = ["TD", "FG", "FG_MISS", "PUNT", "TURNOVER", "DOWNS", "END_HALF", "OPP_TD", "SAFETY"];
const R = Object.fromEntries(RESULTS.map((r, i) => [r, i]));
const SCORE_STATES = ["T2", "T1", "EV", "L1", "L2"];
const CLOCK_STATES = ["NORMAL", "LATE_HALF", "LATE_GAME"];
/** How strongly the offense tilt moves each result (log-odds weight). Points-producing outcomes up, giveaways down. */
const TILT = [1, 0.45, 0.15, 0, -0.5, -0.1, 0, -0.5, -0.5];

export const yBucket = (y) => Math.min(9, Math.max(0, Math.floor((y - 1) / 10)));
export const scoreState = (diff) => (diff <= -9 ? 0 : diff < 0 ? 1 : diff === 0 ? 2 : diff < 9 ? 3 : 4);
export const clockState = (q, halfSec, gameSec) => (q >= 4 && gameSec <= 300 ? 2 : halfSec <= 120 ? 1 : 0);
/** Quarter of an instant on the regulation clock (seconds remaining); an event at exactly 2700 belongs to Q1. */
export const quarterOf = (clockRemaining) => (clockRemaining >= 2700 ? 1 : clockRemaining >= 1800 ? 2 : clockRemaining >= 900 ? 3 : 4);

// ── RNG ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Per-run RNG: run i of a batch is reproducible on its own (representative paths are re-simulated by index). */
export function runRng(baseSeedHex, i) {
  const base = parseInt(baseSeedHex.slice(0, 8), 16) >>> 0;
  let z = (base + Math.imul(i + 1, 0x9e3779b9)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return mulberry32(z.toString(16).padStart(8, "0"));
}

function compileHist(h) {
  const entries = Object.entries(h).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);
  const values = new Int32Array(entries.length);
  const cum = new Float64Array(entries.length);
  let t = 0;
  entries.forEach(([k, v], i) => { values[i] = k; t += v; cum[i] = t; });
  for (let i = 0; i < cum.length; i++) cum[i] /= t;
  return { values, cum };
}
function sampleCum(cum, u) {
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (u <= cum[mid]) hi = mid; else lo = mid + 1;
  }
  return lo;
}
const sampleHist = (h, rng) => h.values[sampleCum(h.cum, rng())];

/** Compile the fitted params (fit-drive-sim-v2.mjs) into fast tables. Pure; do once per process. */
export function compileParams(raw) {
  if (raw?.schemaVersion !== "nfl-drive-sim-params@1") throw new Error("nfl sim v2: unknown params schema");
  const result = new Map();
  for (const [k, v] of Object.entries(raw.result)) result.set(k, Float64Array.from(v.p));
  const hists = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, compileHist(v)]));
  return {
    raw,
    result,
    plays: hists(raw.plays),
    secPerPlay: CLOCK_STATES.map((c) => compileHist(raw.secPerPlay[c])),
    netYards: hists(raw.netYards),
    start: hists(raw.start),
    playMix: raw.playMix,
    conversions: raw.conversions,
    turnover: raw.turnover,
  };
}

/** Result table tilted by θ for one offense: p'(r) ∝ p(r)·exp(θ·w_r). Cumulative arrays keyed like the fit. */
export function tiltedTable(compiled, theta) {
  const out = new Map();
  for (const [k, p] of compiled.result) {
    const w = new Float64Array(p.length);
    let s = 0;
    for (let i = 0; i < p.length; i++) { w[i] = p[i] * Math.exp(theta * TILT[i]); s += w[i]; }
    let c = 0;
    for (let i = 0; i < p.length; i++) { c += w[i] / s; w[i] = c; }
    w[p.length - 1] = 1;
    out.set(k, w);
  }
  return out;
}

// ── players ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const PSTAT = Object.freeze({ passAtt: 0, cmp: 1, passYds: 2, passTd: 3, int: 4, rushAtt: 5, rushYds: 6, rushTd: 7, targets: 8, rec: 9, recYds: 10, recTd: 11 });
export const N_PSTAT = 12;

function cumOf(weights) {
  const c = new Float64Array(weights.length);
  let t = 0;
  for (let i = 0; i < weights.length; i++) { t += Math.max(0, weights[i]); c[i] = t; }
  if (t <= 0) { c.fill(1); return c; }
  for (let i = 0; i < c.length; i++) c[i] /= t;
  c[c.length - 1] = 1;
  return c;
}

/**
 * Prepare one team's opportunity model from role shares. Slot n (last) is OTHER — every team total that is not a
 * named player's lands there, so conservation is exact and never forced onto named players.
 * @param team { players: [{playerId, name, position, passShare, targetShare, carryShare, catchRate, ypr, ypc}] }
 *             — blocked (unavailable) players must already be removed by the caller.
 */
export function prepareTeamPlayers(team) {
  const ps = (team?.players ?? []).filter((p) => p && p.playerId);
  const n = ps.length;
  const share = (k) => [...ps.map((p) => Math.max(0, p[k] ?? 0)), Math.max(0, 1 - ps.reduce((a, p) => a + Math.max(0, p[k] ?? 0), 0))];
  const pass = share("passShare");
  const tgt = share("targetShare");
  const car = share("carryShare");
  /* TD scorers are OPPORTUNITY-based, the structure of the published nfl-anytime-td-opportunity-v1: a receiving TD
     goes to a target drawn by target share, a rushing TD to a carrier drawn by carry share. The pooled role-share
     `scorerTd` table mixes rushing and receiving TDs, and splitting it by a player's carry/target ratio routed most
     rushing TDs to quarterbacks (found on the first MNF shadow run: QB ATD 0.43, lead RB 0.05). Goal-line role
     differences are NOT modelled — stated in docs/SIMULATION_ENGINE_V2.md. */
  const recTdW = tgt;
  const rushTdW = car;
  // The scrambling QB is the main passer (QB1 rule); with no named passer, scrambles go to OTHER.
  let qb = n;
  let best = 0;
  ps.forEach((p, i) => { if (pass[i] > best) { best = pass[i]; qb = i; } });
  return {
    n,
    slots: ps.map((p) => ({ playerId: p.playerId, name: p.name ?? null, position: p.position ?? null })),
    passCum: cumOf(pass),
    tgtCum: cumOf(tgt),
    carCum: cumOf(car),
    recTdCum: cumOf(recTdW),
    rushTdCum: cumOf(rushTdW),
    catchRate: Float64Array.from([...ps.map((p) => p.catchRate ?? 0.64), 0.64]),
    ypr: Float64Array.from([...ps.map((p) => p.ypr ?? 11), 11]),
    ypc: Float64Array.from([...ps.map((p) => p.ypc ?? 4.3), 4.3]),
    scrambler: qb,
  };
}

// ── one game ────────────────────────────────────────────────────────────────────────────────────────────────────
const TEAM_FIELDS = ["pts", "drives", "plays", "passAtt", "cmp", "passYds", "sacks", "sackYds", "scrambles", "rushAtt", "rushYds", "passTd", "rushTd", "int", "fumLost", "fgAtt", "fgMade", "xpAtt", "xpMade", "twoAtt", "twoMade", "defTd", "safetiesFor", "kneels", "possessions"];
export const TEAM_STAT = Object.freeze(Object.fromEntries(TEAM_FIELDS.map((f, i) => [f, i])));
export const N_TSTAT = TEAM_FIELDS.length;
export const N_PERIODS = 5; // Q1–Q4 + OT

/**
 * Simulate one game. Returns a run record. `out` buffers are reused across runs by the caller (no per-run garbage):
 *   out.team[side]  Float64Array(N_TSTAT)
 *   out.period[side] Float64Array(N_PERIODS)
 *   out.players[side] Float64Array((n+1)·N_PSTAT) or null
 * `events` (optional array) receives the coherent event path for representative / debug runs.
 */
export function simulateGame({ compiled, tables, players = null, rng, postseason = false, out, events = null }) {
  const T = [out.team[0], out.team[1]];
  const P = [out.period[0], out.period[1]];
  const PL = players ? [out.players[0], out.players[1]] : null;
  T[0].fill(0); T[1].fill(0); P[0].fill(0); P[1].fill(0);
  if (PL) { PL[0].fill(0); PL[1].fill(0); }
  const score = [0, 0];
  let firstTd = null;
  const { playMix, conversions, turnover } = compiled;

  const addPoints = (side, pts, clockEnd, period) => {
    score[side] += pts;
    T[side][TEAM_STAT.pts] += pts;
    P[side][period] += pts;
  };

  // Split a drive's net yards over its gaining plays, in proportion to sampled per-player gains; integers that sum exactly.
  const gains = new Float64Array(64);
  const gainSlot = new Int32Array(64);
  const gainKind = new Int8Array(64); // 1 completion · 2 rush

  const kickoffY = () => Math.min(99, Math.max(1, sampleHist(compiled.start.KICKOFF, rng)));
  // Opening kickoff: coin flip.
  const firstReceiver = rng() < 0.5 ? 0 : 1;
  let pos = firstReceiver;
  let y0 = kickoffY();
  let clock = 3600; // regulation seconds remaining
  let half = 1;
  let inOT = false;
  let otClock = 0;
  const otPossessed = [false, false];
  let guard = 0;

  while (guard++ < 60) {
    const def = 1 - pos;
    const diff = score[pos] - score[def];
    let halfSec;
    let q;
    let cs;
    if (!inOT) {
      halfSec = clock - (half === 1 ? 1800 : 0);
      q = quarterOf(clock);
      cs = clockState(q, halfSec, clock);
    } else {
      halfSec = otClock;
      q = 5;
      cs = otClock <= 120 ? 1 : 0;
    }
    const yb = yBucket(y0);
    const key = `${yb}|${SCORE_STATES[scoreState(diff)]}|${CLOCK_STATES[cs]}`;
    let res = sampleCum(tables[pos].get(key), rng());
    let nPlays = Math.max(1, sampleHist(compiled.plays[RESULTS[res]], rng));
    let dur = Math.max(5, Math.round(nPlays * Math.max(5, sampleHist(compiled.secPerPlay[cs], rng))));
    const scoring = res === R.TD || res === R.FG || res === R.FG_MISS || res === R.OPP_TD || res === R.SAFETY;
    if (res === R.END_HALF || dur >= halfSec) {
      dur = halfSec;
      if (!scoring) res = R.END_HALF;
    }

    // Net yards — coherent with field position.
    let net;
    if (res === R.TD) net = y0;
    else if (res === R.SAFETY) net = y0 - 100;
    else if (res === R.OPP_TD) net = sampleHist(compiled.netYards["OPP_TD|all"], rng);
    else net = sampleHist(compiled.netYards[`${RESULTS[res]}|${yb}`], rng);
    if (res !== R.TD && res !== R.SAFETY) net = Math.max(y0 - 99, Math.min(y0 - 1, net));
    const endY = y0 - net;

    T[pos][TEAM_STAT.drives] += 1;
    T[pos][TEAM_STAT.possessions] += 1;
    if (inOT) otPossessed[pos] = true;

    // ── plays ──
    const kneelOut = res === R.END_HALF && diff > 0 && cs !== 0;
    const ss = SCORE_STATES[scoreState(diff)];
    const dbRate = playMix.dropbackRate[`${ss}|${CLOCK_STATES[cs]}`] ?? 0.58;
    const pl = players ? players[pos] : null;
    const tdPlayIsPass = res === R.TD ? rng() < conversions.passTdShare : false;
    const toIsInt = res === R.TURNOVER || res === R.OPP_TD ? rng() < turnover.intShare : false;
    let nGain = 0;
    let sackYds = 0;
    let lastGain = -1;
    if (kneelOut) {
      const k = Math.min(nPlays, 3);
      T[pos][TEAM_STAT.kneels] += k;
      T[pos][TEAM_STAT.plays] += k;
      nPlays = k;
    } else {
      for (let i = 0; i < nPlays; i++) {
        const last = i === nPlays - 1;
        T[pos][TEAM_STAT.plays] += 1;
        // The last play of a TD / turnover drive is the scoring / giveaway play, of the type its event needs.
        let dropback;
        if (last && res === R.TD) dropback = tdPlayIsPass;
        else if (last && (res === R.TURNOVER || res === R.OPP_TD)) dropback = toIsInt;
        else dropback = rng() < dbRate;
        if (dropback) {
          const forcedAttempt = last && (res === R.TD || ((res === R.TURNOVER || res === R.OPP_TD) && toIsInt));
          const u = forcedAttempt ? 1 : rng();
          if (u < playMix.sackPerDropback) {
            T[pos][TEAM_STAT.sacks] += 1;
            const sy = Math.max(0, Math.round(playMix.sackYards + (rng() - 0.5) * 6));
            T[pos][TEAM_STAT.sackYds] += sy;
            sackYds += sy;
            continue;
          }
          if (u < playMix.sackPerDropback + playMix.scramblePerDropback) {
            T[pos][TEAM_STAT.scrambles] += 1;
            T[pos][TEAM_STAT.rushAtt] += 1;
            const slot = pl ? pl.scrambler : -1;
            if (PL) PL[pos][(slot) * N_PSTAT + PSTAT.rushAtt] += 1;
            gains[nGain] = 1 + gammaDraw(rng, 1.4, 5 / 1.4); gainSlot[nGain] = slot; gainKind[nGain] = 2; nGain++;
            continue;
          }
          // A pass attempt.
          T[pos][TEAM_STAT.passAtt] += 1;
          const passer = pl ? sampleCum(pl.passCum, rng()) : -1;
          const target = pl ? sampleCum(pl.tgtCum, rng()) : -1;
          if (PL) { PL[pos][passer * N_PSTAT + PSTAT.passAtt] += 1; PL[pos][target * N_PSTAT + PSTAT.targets] += 1; }
          if (last && (res === R.TURNOVER || res === R.OPP_TD) && toIsInt) {
            T[pos][TEAM_STAT.int] += 1;
            if (PL) PL[pos][passer * N_PSTAT + PSTAT.int] += 1;
            continue;
          }
          const catchP = pl ? pl.catchRate[target] : playMix.completionRate;
          const complete = (last && res === R.TD) || rng() < catchP;
          if (!complete) continue;
          let receiver = target;
          if (last && res === R.TD && pl) {
            // The TD receiver is drawn from the receiving-TD weights; the scoring catch is THAT player's target.
            const r = sampleCum(pl.recTdCum, rng());
            if (r !== target) {
              PL[pos][target * N_PSTAT + PSTAT.targets] -= 1;
              PL[pos][r * N_PSTAT + PSTAT.targets] += 1;
              receiver = r;
            }
          }
          T[pos][TEAM_STAT.cmp] += 1;
          if (PL) { PL[pos][passer * N_PSTAT + PSTAT.cmp] += 1; PL[pos][receiver * N_PSTAT + PSTAT.rec] += 1; }
          const ypr = pl ? pl.ypr[receiver] : playMix.yardsPerCompletion;
          gains[nGain] = gammaDraw(rng, 1.6, ypr / 1.6); gainSlot[nGain] = receiver; gainKind[nGain] = 1;
          if (last && res === R.TD) {
            T[pos][TEAM_STAT.passTd] += 1;
            if (PL) { PL[pos][passer * N_PSTAT + PSTAT.passTd] += 1; PL[pos][receiver * N_PSTAT + PSTAT.recTd] += 1; }
            if (!firstTd) firstTd = { side: pos, slot: pl ? receiver : -1, type: "PASS" };
          }
          gainKind[nGain] = 1;
          gainPasser[nGain] = passer;
          lastGain = nGain;
          nGain++;
        } else {
          T[pos][TEAM_STAT.rushAtt] += 1;
          let carrier = pl ? sampleCum(pl.carCum, rng()) : -1;
          if (last && res === R.TD && pl) carrier = sampleCum(pl.rushTdCum, rng());
          if (PL) PL[pos][carrier * N_PSTAT + PSTAT.rushAtt] += 1;
          const ypc = pl ? pl.ypc[carrier] : playMix.yardsPerRush;
          // Raw gain with mean = the carrier's yards per carry (−1 + Gamma, mean ypc + 1); a loss weighs 0 in the split.
          gains[nGain] = Math.max(0, -1 + gammaDraw(rng, 1.2, Math.max(0.5, ypc + 1) / 1.2)); gainSlot[nGain] = carrier; gainKind[nGain] = 2;
          gainPasser[nGain] = -2;
          if (last && res === R.TD) {
            T[pos][TEAM_STAT.rushTd] += 1;
            if (PL) PL[pos][carrier * N_PSTAT + PSTAT.rushTd] += 1;
            if (!firstTd) firstTd = { side: pos, slot: pl ? carrier : -1, type: "RUSH" };
          }
          if (last && (res === R.TURNOVER || res === R.OPP_TD) && !toIsInt) T[pos][TEAM_STAT.fumLost] += 1;
          lastGain = nGain;
          nGain++;
        }
      }
    }

    // Distribute yards: Σ gaining plays − sack yards = the drive's net yards, in integers.
    if (!kneelOut) {
      const required = net + sackYds;
      let raw = 0;
      for (let i = 0; i < nGain; i++) raw += gains[i];
      const ints = new Int32Array(nGain);
      if (nGain > 0) {
        if (required > 0 && raw > 0) {
          let acc = 0;
          for (let i = 0; i < nGain; i++) { ints[i] = Math.floor((gains[i] / raw) * required); acc += ints[i]; }
          ints[lastGain >= 0 ? lastGain : nGain - 1] += required - acc;
        } else {
          // A drive that lost ground: the loss sits on its last gaining play (a run or a short completion).
          ints[nGain - 1] = required;
        }
      } else if (required !== 0) {
        // No gaining play (all sacks / incompletions): the residual is unexplained yardage (penalties) — recorded
        // nowhere as a player stat; team rushing/passing yards stay Σ players.
      }
      for (let i = 0; i < nGain; i++) {
        const y = ints[i];
        if (gainKind[i] === 1) {
          T[pos][TEAM_STAT.passYds] += y;
          if (PL) { PL[pos][gainSlot[i] * N_PSTAT + PSTAT.recYds] += y; PL[pos][gainPasser[i] * N_PSTAT + PSTAT.passYds] += y; }
        } else {
          T[pos][TEAM_STAT.rushYds] += y;
          if (PL) PL[pos][gainSlot[i] * N_PSTAT + PSTAT.rushYds] += y;
        }
      }
    }

    // ── clock and points ──
    const clockEnd = inOT ? 0 : clock - dur;
    const period = inOT ? 4 : quarterOf(clockEnd) - 1;
    let nextPos = def;
    let nextY;
    if (res === R.TD) {
      addPoints(pos, 6, clockEnd, period);
      const newDiff = score[pos] - score[def];
      const goForTwo = cs === 2 && (newDiff === -2 || newDiff === -5 || newDiff === -10 || newDiff === 1) ? rng() < 0.85 : rng() < conversions.twoPointAttemptRate;
      if (goForTwo) {
        T[pos][TEAM_STAT.twoAtt] += 1;
        if (rng() < conversions.twoPointSuccess) { T[pos][TEAM_STAT.twoMade] += 1; addPoints(pos, 2, clockEnd, period); }
      } else {
        T[pos][TEAM_STAT.xpAtt] += 1;
        if (rng() < conversions.xpMake) { T[pos][TEAM_STAT.xpMade] += 1; addPoints(pos, 1, clockEnd, period); }
      }
      nextY = kickoffY();
    } else if (res === R.FG || res === R.FG_MISS) {
      T[pos][TEAM_STAT.fgAtt] += 1;
      if (res === R.FG) { T[pos][TEAM_STAT.fgMade] += 1; addPoints(pos, 3, clockEnd, period); nextY = kickoffY(); }
      else nextY = Math.min(99, Math.max(1, 100 - endY + sampleHist(compiled.start.FG_MISS, rng)));
    } else if (res === R.OPP_TD) {
      T[def][TEAM_STAT.defTd] += 1;
      addPoints(def, 6, clockEnd, period);
      T[def][TEAM_STAT.xpAtt] += 1;
      if (rng() < conversions.xpMake) { T[def][TEAM_STAT.xpMade] += 1; addPoints(def, 1, clockEnd, period); }
      nextPos = pos; // the scoring defense kicks off to the same offense
      nextY = kickoffY();
    } else if (res === R.SAFETY) {
      T[def][TEAM_STAT.safetiesFor] += 1;
      addPoints(def, 2, clockEnd, period);
      nextY = 57; // free kick from the 20: the receiving team's typical start
    } else if (res === R.END_HALF) {
      nextY = null;
    } else {
      const off = compiled.start[RESULTS[res]] ? sampleHist(compiled.start[RESULTS[res]], rng) : 0;
      nextY = Math.min(99, Math.max(1, 100 - endY + off));
    }
    if (events) events.push({ q: inOT ? 5 : quarterOf(clock), clockStart: inOT ? otClock : clock, offense: pos, startYardsToGoal: y0, result: RESULTS[res], plays: nPlays, netYards: net, seconds: dur, score: [score[0], score[1]] });

    // ── advance ──
    if (inOT) {
      otClock = Math.max(0, otClock - dur);
      const bothHad = otPossessed[0] && otPossessed[1];
      // Sudden death once both teams have possessed (a defensive score or safety ends it at once).
      if ((res === R.OPP_TD || res === R.SAFETY) && score[0] !== score[1]) break;
      if (bothHad && score[0] !== score[1]) break;
      if (otClock <= 0) {
        if (postseason && score[0] === score[1]) { otClock = 900; continue; }
        break;
      }
      pos = nextPos;
      y0 = nextY ?? kickoffY();
      continue;
    }
    clock = clockEnd;
    if (half === 1 && clock <= 1800) {
      clock = 1800;
      half = 2;
      pos = 1 - firstReceiver;
      y0 = kickoffY();
      continue;
    }
    if (clock <= 0) {
      if (score[0] !== score[1]) break;
      inOT = true;
      otClock = 600;
      pos = rng() < 0.5 ? 0 : 1;
      y0 = kickoffY();
      continue;
    }
    pos = nextPos;
    y0 = nextY ?? kickoffY();
  }
  return { score: [score[0], score[1]], ot: inOT, tie: score[0] === score[1], firstTd };
}

// Shared scratch for the passer of each gaining completion (module-level; simulateGame is not re-entrant).
const gainPasser = new Int32Array(64);
