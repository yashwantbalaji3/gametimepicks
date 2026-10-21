/**
 * NBA SIMULATION THEATER · POSSESSION PLAYBACK — event log → playback timeline → frame at time t. Pure; client-safe.
 *
 * TRUE POSSESSION-LEVEL PLAYBACK. Every score change, clock reading, possession and lineup shown comes from ONE stored
 * engine event log (nba-possession-sim-v0 events.mjs vocabulary); nothing is interpolated or invented:
 *   - an event with clock c (deciseconds left) in period q plays at t = periodStart(q) + (len(q) − c)/len(q) · dur(q);
 *   - the frame at t is the state after the last event with tₑ ≤ t (events at the same clock land together, in log order);
 *   - the game clock between two events is the exact linear map of t back to game time (the engine's segments are
 *     timed, so the clock really does run between plays); in STEP mode (prefers-reduced-motion) it shows the last
 *     event's clock instead, so nothing ticks;
 *   - possession after an event = the possession of the next event of the same period (the log records the team in
 *     possession AT each event), so the arrow flips exactly when the engine's possession changed.
 * Breaks: a short hold after Q1 and Q3 (and before each OT), a longer one at halftime; FINAL at tEnd.
 */
import { periodLengthDs } from "../../../sports/nba/research/possession-sim/events.mjs";

export const PERIOD_MS = 60000; // a 12:00 quarter plays in 60 s at 1× (12× real time)
export const OT_MS = 25000; // a 5:00 overtime keeps the same pace
export const BREAK_MS = 2500;
export const HALFTIME_MS = 4500;
export const POSSESSION_SPEEDS = Object.freeze([1, 2, 4, 8]);

export const periodLabel = (q) => (q <= 4 ? `Q${q}` : `OT${q - 4}`);
export const periodName = (q) => (q <= 4 ? ["1st quarter", "2nd quarter", "3rd quarter", "4th quarter"][q - 1] : `Overtime ${q - 4}`);

/** "mm:ss" for ≥ 1:00, "s.t" under a minute (the NBA broadcast convention). */
export function fmtClockDs(ds) {
  const d = Math.max(0, Math.round(ds));
  if (d < 600) return `${Math.floor(d / 10)}.${d % 10}`;
  const s = Math.floor(d / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * @param {{ events: object[] }} run  a stored run (events in log order, `s` = score after the event)
 * @returns compiled timeline: { events: [{…e, t, k}], periods: [{q, label, startT, endT, lenDs}], breaks, periodStarts, tEnd, final, possAfter }
 */
export function compilePossessionTimeline(run) {
  const ev = run?.events ?? [];
  if (!ev.length || ev[0].type !== "period_start") throw new Error("compilePossessionTimeline: the log must start with period_start");
  const periods = [];
  const breaks = [];
  let t = 0;
  for (const e of ev) {
    if (e.type !== "period_start") continue;
    if (periods.length) {
      const prev = periods[periods.length - 1];
      const dur = prev.q === 2 ? HALFTIME_MS : BREAK_MS;
      breaks.push({ afterQ: prev.q, kind: prev.q === 2 ? "HALFTIME" : prev.q >= 4 ? "BEFORE_OT" : "END_OF_PERIOD", startT: t, endT: t + dur });
      t += dur;
    }
    const dur = e.q <= 4 ? PERIOD_MS : OT_MS;
    periods.push({ q: e.q, label: periodLabel(e.q), startT: t, endT: t + dur, lenDs: periodLengthDs(e.q) });
    t += dur;
  }
  const byQ = new Map(periods.map((p) => [p.q, p]));
  const events = ev.map((e, k) => {
    const p = byQ.get(e.q);
    const te = p.startT + ((p.lenDs - e.c) / p.lenDs) * (p.endT - p.startT);
    return { ...e, k, t: e.type === "game_end" ? t : Math.round(te * 1000) / 1000 };
  });
  for (let k = 1; k < events.length; k += 1) if (events[k].t < events[k - 1].t) throw new Error(`compilePossessionTimeline: event ${k} plays before event ${k - 1}`);
  const possAfter = events.map((e, k) => {
    if (e.type === "period_end" || e.type === "game_end") return null;
    for (let j = k + 1; j < events.length; j += 1) {
      const n = events[j];
      // the period ends before the next play: the arrow is unknown (never guessed)
      if (n.q !== e.q || n.type === "period_end" || n.type === "game_end") return null;
      if (n.type !== "jump_ball") return n.poss;
    }
    return null;
  });
  const last = events[events.length - 1];
  return { events, periods, breaks, periodStarts: periods.map((p) => p.startT), tEnd: t, final: { home: last.s[0], away: last.s[1] }, possAfter };
}

/** Index of the last event with t ≤ time (binary search); −1 before the first. */
export function lastEventAt(compiled, time) {
  const ev = compiled.events;
  let lo = 0, hi = ev.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (ev[mid].t <= time) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

/** Lineups on court after event k (period_start lineups + subs). */
export function onCourtAt(compiled, k) {
  const on = [[], []];
  for (let j = 0; j <= k && j < compiled.events.length; j += 1) {
    const e = compiled.events[j];
    if (e.type === "period_start") { on[0] = e.lineups[0].map(String); on[1] = e.lineups[1].map(String); }
    else if (e.type === "sub") on[e.team] = on[e.team].map((id) => (id === String(e.out) ? String(e.in) : id));
  }
  return on;
}

/**
 * The frame at playback time t. `step` = true (reduced motion): the clock shows the last event's clock (no ticking).
 * @returns {{ t, k, phase: "LIVE"|"BREAK"|"FINAL", q, label, name, clockDs, score: {home, away}, possession: 0|1|null, breakKind, periodScores }}
 */
export function frameAt(compiled, time, { step = false } = {}) {
  const t = Math.min(compiled.tEnd, Math.max(0, time));
  const k = Math.max(0, lastEventAt(compiled, t));
  const e = compiled.events[k];
  const ended = e.type === "game_end" || t >= compiled.tEnd;
  let phase = "LIVE", breakKind = null, q = e.q;
  const brk = compiled.breaks.find((b) => t >= b.startT && t < b.endT);
  if (ended) phase = "FINAL";
  else if (brk) { phase = "BREAK"; breakKind = brk.kind; q = brk.afterQ; }
  const p = compiled.periods.find((x) => x.q === q);
  let clockDs;
  if (phase !== "LIVE") clockDs = 0;
  else if (step) clockDs = e.c;
  else clockDs = Math.max(0, Math.min(e.c, Math.round(p.lenDs - ((t - p.startT) / (p.endT - p.startT)) * p.lenDs)));
  const periodScores = compiled.periods.map((pp) => ({ q: pp.q, label: pp.label, home: 0, away: 0, started: pp.startT <= t }));
  let prev = [0, 0];
  for (let j = 0; j <= k; j += 1) {
    const x = compiled.events[j];
    const ps = periodScores.find((r) => r.q === x.q);
    if (ps) { ps.home += x.s[0] - prev[0]; ps.away += x.s[1] - prev[1]; }
    prev = x.s;
  }
  return {
    t, k, phase, q, label: periodLabel(q), name: periodName(q), clockDs,
    score: { home: e.s[0], away: e.s[1] },
    possession: phase === "LIVE" ? compiled.possAfter[k] ?? null : null,
    breakKind, periodScores,
  };
}

/** Playback time of the next / previous play (an event that changes something on screen) from t. */
export function nextPlayT(compiled, t) {
  for (const e of compiled.events) if (e.t > t + 1e-6 && e.type !== "period_start") return e.t;
  return compiled.tEnd;
}
export function prevPlayT(compiled, t) {
  let out = 0;
  for (const e of compiled.events) { if (e.t >= t - 1e-6) break; if (e.type !== "period_start") out = e.t; }
  return out;
}

/**
 * The shared transport-machine with the possession speeds (1×, 2×, 4×, 8×). Every other action is the shared machine's.
 * @param {Function} transport  transport-machine.mjs `transport`
 */
export function possessionTransport(transport, m, action, arg = {}) {
  if (action === "SPEED") {
    if (m.state === "UNAVAILABLE" || m.state === "ERROR") return m;
    return POSSESSION_SPEEDS.includes(arg.speed) && arg.speed !== m.speed ? Object.freeze({ ...m, speed: arg.speed }) : m;
  }
  return transport(m, action, arg);
}
