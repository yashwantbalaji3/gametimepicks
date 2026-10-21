/**
 * NBA SIMULATION THEATER · TIMELINE + stateAt. Pure and deterministic: stateAt(compiled, t) depends on nothing but its
 * arguments, so the same t always yields the same frame at any playback speed.
 *
 * WHAT IS RECORDED. A representative sample records only the score at the END of each quarter (and each OT). Those are the
 * checkpoints. Between two checkpoints the theater ticks the score up in 2-point steps along a straight line and runs the
 * game clock down linearly: BOTH ARE ILLUSTRATIVE (`scoreIllustrative`, `clockIllustrative`), and every component that
 * shows them must pair them with a visible "illustrative" tag (data-st-interp / -scope / -tag, as in the NFL theater).
 * At a checkpoint, and during the breaks that follow one, the score is the recorded value and nothing is illustrative.
 *
 * PLAYBACK TIME (ms at 1×): each regulation quarter REG_MS, each OT OT_MS (5/12 of a quarter, as on the clock), a short
 * QEND_MS hold after Q1, Q3 and every period before an OT, a HALF_MS halftime hold after Q2 (halftime card), and FINAL at
 * tEnd (final card). t = 0 is tip-off: Q1, 12:00, 0–0 (exact, not illustrative).
 */
export const REG_MS = 12000;
export const OT_MS = 5000;
export const QEND_MS = 1200;
export const HALF_MS = 4000;
export const REG_SEC = 720;
export const OT_SEC = 300;

/**
 * @param {{ periods: Array<{period:number,label:string,home:number,away:number}> }} sample  a VALIDATED sample
 */
export function compileTimeline(sample) {
  const segments = [];
  const breaks = [];
  const checkpoints = [{ t: 0, label: "TIP", score: { home: 0, away: 0 } }];
  let t = 0;
  let cum = { home: 0, away: 0 };
  const n = sample.periods.length;
  sample.periods.forEach((p, i) => {
    const ot = p.period > 4;
    const len = ot ? OT_MS : REG_MS;
    const seg = {
      idx: i, period: p.period, label: p.label, ot, startT: t, endT: t + len, clockSec: ot ? OT_SEC : REG_SEC,
      before: { ...cum }, pts: { home: p.home, away: p.away }, after: { home: cum.home + p.home, away: cum.away + p.away },
    };
    segments.push(seg);
    t += len;
    cum = seg.after;
    checkpoints.push({ t, label: p.label, score: { ...cum } });
    if (i < n - 1) {
      const kind = p.period === 2 ? "HALFTIME" : "QEND";
      const hold = kind === "HALFTIME" ? HALF_MS : QEND_MS;
      breaks.push({ kind, afterIdx: i, label: p.label, startT: t, endT: t + hold, score: { ...cum } });
      t += hold;
    }
  });
  return Object.freeze({ segments, breaks, checkpoints, tEnd: t, periodStarts: segments.map((s) => s.startT), final: { ...cum } });
}

/** Illustrative score inside a period: 2-point steps along a straight line, exact at both ends. */
export function tickScore(pts, frac) {
  if (frac <= 0) return 0;
  if (frac >= 1) return pts;
  return Math.min(pts, 2 * Math.floor((pts * frac) / 2));
}

/**
 * The frame at playback time t (ms).
 * @returns {{ t:number, phase:"LIVE"|"BREAK"|"FINAL", segIdx:number, period:string, periodDisplay:string, score:{home:number,away:number},
 *   scoreIllustrative:boolean, clockSec:number, clockIllustrative:boolean, lastCheckpoint:string, card:"HALFTIME"|"FINAL"|null, breakKind:string|null }}
 */
export function stateAt(c, tIn) {
  const t = Math.min(c.tEnd, Math.max(0, Number(tIn) || 0));
  const last = c.segments[c.segments.length - 1];
  if (t >= c.tEnd) {
    return frame(t, "FINAL", last.idx, last.label, "FINAL", c.final, false, 0, false, last.label, "FINAL", null);
  }
  for (const b of c.breaks) {
    if (t >= b.startT && t < b.endT) {
      const seg = c.segments[b.afterIdx];
      return frame(t, "BREAK", seg.idx, seg.label, b.kind === "HALFTIME" ? "HALF" : `END ${seg.label}`, b.score, false, 0, false, seg.label, b.kind === "HALFTIME" ? "HALFTIME" : null, b.kind);
    }
  }
  const seg = c.segments.find((s) => t >= s.startT && t < s.endT) ?? last;
  const frac = (t - seg.startT) / (seg.endT - seg.startT);
  const score = { home: seg.before.home + tickScore(seg.pts.home, frac), away: seg.before.away + tickScore(seg.pts.away, frac) };
  const inside = frac > 0 && frac < 1;
  const clockSec = Math.max(0, seg.clockSec * (1 - frac));
  const lastCk = seg.idx === 0 ? "TIP" : c.segments[seg.idx - 1].label;
  return frame(t, "LIVE", seg.idx, seg.label, seg.label, score, inside, clockSec, inside, lastCk, null, null);
}

function frame(t, phase, segIdx, period, periodDisplay, score, scoreIllustrative, clockSec, clockIllustrative, lastCheckpoint, card, breakKind) {
  return { t, phase, segIdx, period, periodDisplay, score: { home: score.home, away: score.away }, scoreIllustrative, clockSec, clockIllustrative, lastCheckpoint, card, breakKind };
}

/** m:ss for the sim clock (rounded up to the second, as a game clock reads). */
export function fmtGameClock(sec) {
  const s = Math.max(0, Math.ceil(sec - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Score-differential polyline (home − away) through the checkpoints ONLY: [{t, diff, label}]. */
export const diffPoints = (c) => c.checkpoints.map((k) => ({ t: k.t, diff: k.score.home - k.score.away, label: k.label }));

/** The team leaders of one sample (pts, reb, ast) for the final card, from the sample's game totals. */
export function statLeaders(sample) {
  const out = {};
  for (const side of ["home", "away"]) {
    const ps = (sample.players?.[side] ?? []).filter((p) => p.minutes > 0);
    const top = (k) => ps.reduce((best, p) => (best == null || p[k] > best[k] ? p : best), null);
    out[side] = { pts: top("pts"), reb: top("reb"), ast: top("ast") };
  }
  return out;
}
