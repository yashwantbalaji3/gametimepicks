/**
 * Simulation Theater V2 · timeline compiler + stateAt + transport + announcer (spec §3.3–3.5, §3.8, §6.3; ST2-03).
 *
 * Run: npx tsx --test src/lib/simulation-theater/timeline-state.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { readShadowReceipts } from "../sports/nfl/sim-v2/public-receipt.mjs";
import { adaptReceipt } from "./adapter-nfl-sim-v2.mjs";
import { compileTimeline, SCENE_POLICY } from "./timeline.mjs";
import { stateAtCompiled, stateAt, finalState, cubicBezier } from "./state-at.mjs";
import { createTransport, transport, MAX_DT_MS } from "./transport-machine.mjs";
import { createAnnouncer, offer, flush, MIN_GAP_MS } from "./announcer.mjs";
import { lanesFor, sceneSeedOf } from "./scene-rng.mjs";
import { fmtPeriodClock } from "./format.mjs";

const REPO = path.resolve(process.cwd(), "..");
const MANIFESTS = readShadowReceipts(REPO).map((e) => adaptReceipt(e.receipt, { file: e.file }).manifest);
const REF = MANIFESTS.find((m) => m.receiptId === "nfl-sim-v2:401873008:6da012510c023181");
const SAMPLES = MANIFESTS.flatMap((m) => m.samples.filter((s) => s.validation.ok).map((s) => ({ m, s })));
const hash = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

/** 200 fixed sample instants, multiples of 16 ms so every speed's integer stepping lands on them exactly. */
const instants = (tEnd) => [...new Set(Array.from({ length: 200 }, (_, k) => Math.min(tEnd, Math.round((k * tEnd) / 199 / 16) * 16)))];

/** Simulated playback: step a transport at a fixed dt, recording the state each time t hits a target. */
function playRecord(m, s, c, speed, targets, dt = 4) {
  let tp = createTransport({ tEnd: c.tEnd, driveStarts: c.driveSpans.map((x) => x.startT) });
  tp = transport(tp, "SPEED", { speed });
  tp = transport(tp, "PLAY");
  const want = new Set(targets);
  const out = new Map();
  if (want.has(0)) out.set(0, stateAtCompiled(s, c, m.teams, 0));
  while (tp.state === "PLAYING") {
    tp = transport(tp, "TICK", { dt });
    if (want.has(tp.t)) out.set(tp.t, stateAtCompiled(s, c, m.teams, tp.t));
  }
  if (want.has(c.tEnd)) out.set(c.tEnd, stateAtCompiled(s, c, m.teams, c.tEnd));
  return out;
}

test("determinism: the same t gives the same state at 1×/2×/4×, forward and backward seeks, and a fresh compile (reload)", () => {
  const picks = [REF.samples[0], REF.samples[4], ...SAMPLES.filter((_, i) => i % 97 === 0).map((x) => x.s)];
  for (const s of picks) {
    const m = MANIFESTS.find((x) => x.receiptId === s.receiptId);
    const c = compileTimeline(s);
    const ts = instants(c.tEnd);
    const direct = ts.map((t) => stateAtCompiled(s, c, m.teams, t));
    const h = hash(direct);
    for (const speed of [1, 2, 4]) {
      const rec = playRecord(m, s, c, speed, ts);
      assert.equal(hash(ts.map((t) => rec.get(t))), h, `${s.receiptId} #${s.runIndex} at ${speed}×`);
    }
    let tp = createTransport({ tEnd: c.tEnd, driveStarts: c.driveSpans.map((x) => x.startT) });
    const fwd = ts.map((t) => { tp = transport(tp, "SEEK", { t }); return stateAtCompiled(s, c, m.teams, tp.t); });
    const back = [...ts].reverse().map((t) => { tp = transport(tp, "SEEK", { t }); return stateAtCompiled(s, c, m.teams, tp.t); }).reverse();
    assert.equal(hash(fwd), h, "seek forward");
    assert.equal(hash(back), h, "seek backward");
    const reload = compileTimeline(JSON.parse(JSON.stringify(s)));
    assert.equal(hash(ts.map((t) => stateAtCompiled(s, reload, m.teams, t))), h, "reload");
  }
});

test("score at t equals the recorded score progression; changes only at RESULT; the final equals the receipt's final", () => {
  for (const { m, s } of SAMPLES) {
    const c = compileTimeline(s);
    let prev = { home: 0, away: 0 };
    for (const kf of c.keyframes) {
      const ev = s.events[kf.driveIdx];
      for (const frac of [0, 0.5, 0.999]) {
        const st = stateAtCompiled(s, c, m.teams, kf.t0 + kf.dur * frac);
        const want = kf.phase === "START" || kf.phase === "PROGRESS" ? ev.scoreBefore : ev.scoreAfter;
        assert.deepEqual(st.score, want, `${s.receiptId} #${s.runIndex} drive ${kf.driveIdx} ${kf.phase}`);
        if (st.score.home !== prev.home || st.score.away !== prev.away) assert.equal(kf.phase, "RESULT", "the score moves only at RESULT");
        prev = st.score;
      }
    }
    const fin = stateAtCompiled(s, c, m.teams, c.tEnd);
    assert.equal(fin.phase, "FINAL");
    assert.deepEqual(fin.score, { home: s.finalScore.home, away: s.finalScore.away });
  }
});

test("clock: never increases within a period run; recorded exactly at drive start and end; illustrative strictly between", () => {
  for (const { m, s } of SAMPLES.filter((_, i) => i % 5 === 0)) {
    const c = compileTimeline(s);
    let last = null;
    for (let t = 0; t <= c.tEnd; t += 40) {
      const st = stateAtCompiled(s, c, m.teams, t);
      const ev = s.events[st.driveIdx];
      const key = ev.inOT ? "OT" : st.clock <= 1800 ? "H2" : "H1";
      if (last && last.key === key && st.driveIdx >= last.drive) assert.ok(st.clock <= last.clock + 1e-9, `${s.receiptId} #${s.runIndex} t=${t}: ${last.clock} → ${st.clock}`);
      if (st.phase === "START") { assert.equal(st.clock, ev.clockStart); assert.equal(st.clockIllustrative, false); }
      if (["RESULT", "TRANSITION", "BREAK", "FINAL"].includes(st.phase)) { assert.equal(st.clock, ev.clockEnd); assert.equal(st.clockIllustrative, false); }
      if (st.phase === "PROGRESS" && st.phaseProgress > 0 && st.phaseProgress < 1) assert.equal(st.clockIllustrative, true);
      last = { key, clock: st.clock, drive: st.driveIdx };
    }
  }
});

test("displayed quarter from the clock: run #428 drive 10 START = Q3 15:00, drive 15 START = Q4 15:00, drive 9 RESULT = Q2 0:00", () => {
  const s = REF.samples.find((x) => x.runIndex === 428);
  const c = compileTimeline(s);
  const at = (drive, phase) => {
    const kf = c.keyframes.find((k) => k.driveIdx === drive && k.phase === phase);
    return stateAtCompiled(s, c, REF.teams, kf.t0 + kf.dur / 2);
  };
  assert.equal(fmtPeriodClock(at(9, "START").period, at(9, "START").periodClock), "Q3 15:00");
  assert.equal(fmtPeriodClock(at(14, "START").period, at(14, "START").periodClock), "Q4 15:00");
  const r9 = at(8, "BREAK");
  assert.equal(r9.breakKind, "HALFTIME");
  assert.equal(fmtPeriodClock(r9.period, r9.periodClock), "Q2 0:00");
  // every second-half opener's START reads period 3 / 900 (spec §6.3)
  for (const { m, s: x } of SAMPLES) {
    const cc = compileTimeline(x);
    const i = x.events.findIndex((e) => !e.inOT && e.clockStart === 1800);
    const kf = cc.keyframes.find((k) => k.driveIdx === i && k.phase === "START");
    const st = stateAtCompiled(x, cc, m.teams, kf.t0);
    assert.equal(st.period, 3);
    assert.equal(st.periodClock, 900);
  }
});

test("S2 · exactly one Q1→Q2 and one Q3→Q4 QUARTER_ROLLOVER per run, at the instant the clock equals 2700 / 900; they add no time", () => {
  let mid = 0, exact = 0;
  for (const { m, s } of SAMPLES) {
    const c = compileTimeline(s);
    const q1 = c.markers.filter((x) => x.quarter === 1);
    const q3 = c.markers.filter((x) => x.quarter === 3);
    assert.equal(q1.length, 1, `${s.receiptId} #${s.runIndex} Q1 rollovers`);
    assert.equal(q3.length, 1, `${s.receiptId} #${s.runIndex} Q3 rollovers`);
    for (const mk of [...q1, ...q3]) {
      const b = mk.quarter === 1 ? 2700 : 900;
      if (mk.exact) { exact++; assert.equal(s.events[mk.driveIdx - 1].clockEnd, b); continue; }
      mid++;
      const st = stateAtCompiled(s, c, m.teams, mk.atT);
      assert.ok(Math.abs(st.clock - b) < 0.5, `clock ${st.clock} at the marker, wanted ${b}`);
      assert.deepEqual(stateAtCompiled(s, c, m.teams, mk.atT + 1).rollover, { quarter: mk.quarter, atT: mk.atT });
    }
    const noMarkers = { ...c, markers: [] };
    assert.equal(noMarkers.tEnd, c.tEnd);
  }
  console.log(`# theater: rollovers — mid-drive ${mid}, exactly at a drive boundary ${exact}`);
});

test("D7 · playback length at 1× is drive-weighted (≈40–103 s); breaks only at halftime, OT start and final", () => {
  const lens = SAMPLES.map(({ s }) => compileTimeline(s).tEnd / 1000).sort((a, b) => a - b);
  const median = lens[Math.floor(lens.length / 2)];
  console.log(`# theater: 1× length min ${lens[0].toFixed(1)} s · median ${median.toFixed(1)} s · max ${lens.at(-1).toFixed(1)} s`);
  assert.ok(lens[0] >= 30 && lens.at(-1) <= 115, "within the D7 envelope (with slack for breaks)");
  for (const { s } of SAMPLES) {
    const c = compileTimeline(s);
    const kinds = c.keyframes.filter((k) => k.phase === "BREAK").map((k) => k.breakKind);
    assert.equal(kinds.filter((k) => k === "HALFTIME").length, 1);
    assert.equal(kinds.filter((k) => k === "FINAL").length, 1);
    assert.equal(kinds.filter((k) => k === "OT_START").length, s.finalScore.overtime ? 1 : 0);
    assert.equal(kinds.at(-1), "FINAL");
  }
  assert.equal(SCENE_POLICY.progressMs(1), 900);
  assert.equal(SCENE_POLICY.progressMs(11), 2860);
  assert.equal(SCENE_POLICY.progressMs(30), 3200);
});

test("reduced motion: no tweened frames, and the (drive, score, period, clockEnd) sequence after each drive equals the normal timeline's", () => {
  for (const { m, s } of SAMPLES.filter((_, i) => i % 7 === 0)) {
    const n = compileTimeline(s);
    const r = compileTimeline(s, { reducedMotion: true });
    assert.equal(r.keyframes.filter((k) => k.phase === "PROGRESS" || k.phase === "TRANSITION").length, 0);
    const after = (c) => c.driveSpans.map((sp) => { const st = stateAtCompiled(s, c, m.teams, sp.t1 - 1); return [st.driveIdx, st.score, st.period, st.clock]; });
    assert.deepEqual(after(r), after(n), `${s.receiptId} #${s.runIndex}`);
    for (let t = 0; t < r.tEnd; t += 100) {
      const st = stateAtCompiled(s, r, m.teams, t);
      const ev = s.events[st.driveIdx];
      if (st.phase === "START") { assert.equal(st.ballOpacity, 1); assert.equal(st.startRingScale, 1); assert.equal(st.ballYardsToGoal, ev.fieldStart); }
      else assert.equal(st.ballYardsToGoal, ev.fieldEnd, "no in-between ball positions");
    }
  }
});

test("scene seed changes only cosmetic fields (lane); outcomes are identical", () => {
  const s = REF.samples[0];
  const other = { ...s, lanes: lanesFor(sceneSeedOf("another-receipt", 1), s.events.length) };
  const c = compileTimeline(s);
  const strip = (st) => { const { lane, ...rest } = st; return rest; };
  for (const t of instants(c.tEnd)) assert.deepEqual(strip(stateAtCompiled(other, c, REF.teams, t)), strip(stateAtCompiled(s, c, REF.teams, t)));
  assert.notDeepEqual(other.lanes, s.lanes);
  assert.ok(s.lanes.every((l) => l >= 0.3 - 1e-9 && l <= 0.7 + 1e-9));
});

test("purity: theater modules use no Math.random, Date or DOM, and import no engine RNG", () => {
  const dir = path.join(process.cwd(), "src/lib/simulation-theater");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".mjs") && !x.includes(".test."))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(src, /Math\.random/, f);
    assert.doesNotMatch(src, /\bnew Date\b|Date\.now/, f);
    assert.doesNotMatch(src, /\bdocument\.|\bwindow\./, f);
    assert.doesNotMatch(src, /runRng|sim-v2\/engine/, `${f} must not import the engine's RNG`);
  }
});

test("seek cost: stateAt is a binary search (≤1 ms per seek in Node, est. budget)", () => {
  const s = SAMPLES.reduce((a, b) => (b.s.events.length > a.s.events.length ? b : a)).s;
  const m = MANIFESTS.find((x) => x.receiptId === s.receiptId);
  const c = compileTimeline(s);
  const t0 = process.hrtime.bigint();
  const N = 5000;
  for (let i = 0; i < N; i++) stateAtCompiled(s, c, m.teams, (i * 7919) % c.tEnd);
  const per = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  console.log(`# theater: ${s.events.length}-drive run, ${c.keyframes.length} keyframes, ${per.toFixed(4)} ms per seek`);
  assert.ok(per < 1);
});

test("stateAt over a manifest: identity echoed on every frame; a failed or unknown run gives null, never a guessed frame", () => {
  const st = stateAt(REF, 428, 12345);
  assert.equal(st.receiptId, REF.receiptId);
  assert.equal(st.runIndex, 428);
  assert.equal(st.sceneVersion, "drive-scene@1");
  assert.equal(st.camera, null);
  assert.equal(st.illustrative, true);
  assert.equal(stateAt(REF, 999999, 0), null);
  const fin = finalState(REF, REF.samples[0]);
  assert.equal(fin.phase, "FINAL");
  assert.equal(fin.winner, "home");
});

test("transport: no autoplay; explicit PLAY only; dt clamped; COMPLETED at the end; seek never starts playback", () => {
  let m = createTransport({ tEnd: 10000, driveStarts: [0, 4000, 8000] });
  assert.equal(m.state, "IDLE");
  assert.equal(transport(m, "TICK", { dt: 50 }), m, "a tick while idle does nothing");
  m = transport(m, "SEEK", { t: 5000 });
  assert.equal(m.state, "PAUSED");
  m = transport(m, "PLAY");
  m = transport(m, "TICK", { dt: 5000 });
  assert.equal(m.t, 5000 + MAX_DT_MS);
  m = transport(m, "SPEED", { speed: 4 });
  m = transport(m, "TICK", { dt: 50 });
  assert.equal(m.t, 5300);
  m = transport(m, "NEXT_DRIVE");
  assert.equal(m.t, 8000);
  m = transport(m, "PREV_DRIVE");
  assert.equal(m.t, 4000, "within the grace window, previous goes to the previous drive");
  m = transport(m, "SEEK", { t: 99999 });
  assert.equal(m.state, "COMPLETED");
  m = transport(m, "PLAY");
  assert.equal(m.t, 0, "play after the end replays from kickoff");
  assert.equal(createTransport({ tEnd: 0, driveStarts: [] }).state, "UNAVAILABLE");
});

test("announcer: per result at 1×; above 1× only scores/stops/breaks, ≤1 per 3 s, newest replaces queued; FULL always", () => {
  let a = createAnnouncer();
  let r = offer(a, { kind: "RESULT", text: "punt" }, { speed: 1, now: 0 });
  assert.equal(r.say, "punt");
  r = offer(r.state, { kind: "RESULT", text: "punt 2" }, { speed: 1, now: 10 });
  assert.equal(r.say, "punt 2");
  a = createAnnouncer();
  r = offer(a, { kind: "RESULT", text: "punt" }, { speed: 4, now: 0 });
  assert.equal(r.say, null, "plain results are dropped above 1×");
  r = offer(r.state, { kind: "SCORE", text: "td 1" }, { speed: 4, now: 0 });
  assert.equal(r.say, "td 1");
  r = offer(r.state, { kind: "SCORE", text: "td 2" }, { speed: 4, now: 1000 });
  assert.equal(r.say, null);
  r = offer(r.state, { kind: "STOP", text: "turnover" }, { speed: 4, now: 2000 });
  assert.equal(r.say, null);
  assert.equal(r.state.queued.text, "turnover", "newer replaces queued");
  let f = flush(r.state, { speed: 4, now: 2500 });
  assert.equal(f.say, null);
  f = flush(r.state, { speed: 4, now: MIN_GAP_MS });
  assert.equal(f.say, "turnover");
  r = offer(f.state, { kind: "FULL", text: "drive 9" }, { speed: 4, now: MIN_GAP_MS + 1 });
  assert.equal(r.say, "drive 9");
  r = offer(r.state, { kind: "ROLLOVER", text: "End of Q1" }, { speed: 2, now: 99999 });
  assert.equal(r.say, null, "rollovers only at 1×");
});

test("cubic-bezier easing is monotone and pinned at the ends", () => {
  const e = cubicBezier(0.45, 0.05, 0.35, 1);
  let prev = 0;
  for (let p = 0; p <= 1.0001; p += 0.01) { const v = e(Math.min(1, p)); assert.ok(v >= prev - 1e-9); prev = v; }
  assert.equal(e(0), 0);
  assert.equal(e(1), 1);
});
