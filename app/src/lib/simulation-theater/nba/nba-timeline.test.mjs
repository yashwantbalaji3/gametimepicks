/**
 * NBA theater · timeline + stateAt: checkpoints exact, everything between them flagged illustrative, deterministic.
 * Run: npx tsx --test src/lib/simulation-theater/nba/nba-timeline.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { HALF_MS, OT_MS, QEND_MS, REG_MS, compileTimeline, diffPoints, fmtGameClock, stateAt, statLeaders, tickScore } from "./timeline.mjs";
import { adaptNbaArtifact } from "./adapter-nba-sim-v1.mjs";
import { createTransport, transport } from "../transport-machine.mjs";

const FIXTURE = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/lib/simulation-theater/nba/__fixtures__/nba-sim-v1-fixture.json"), "utf8"));
const SAMPLES = FIXTURE.games.flatMap((g) => adaptNbaArtifact(FIXTURE, g.providerEventId).manifest.samples.filter((s) => s.validation.ok));

test("compiled timeline: Q 12 s, OT 5 s, 1.2 s quarter holds, 4 s halftime; checkpoints are the recorded cumulative scores", () => {
  for (const s of SAMPLES) {
    const c = compileTimeline(s);
    const ot = s.overtimePeriods;
    assert.equal(c.tEnd, 4 * REG_MS + ot * OT_MS + HALF_MS + (2 + ot) * QEND_MS, `#${s.runIndex}`);
    assert.deepEqual(c.final, s.final);
    let cum = { home: 0, away: 0 };
    s.periods.forEach((p, i) => {
      cum = { home: cum.home + p.home, away: cum.away + p.away };
      assert.deepEqual(c.checkpoints[i + 1].score, cum);
      assert.equal(c.checkpoints[i + 1].label, p.label);
    });
    assert.equal(c.breaks.filter((b) => b.kind === "HALFTIME").length, 1);
    assert.equal(c.periodStarts.length, s.periods.length);
  }
});

test("stateAt at every checkpoint, break and the final is EXACT (recorded) and never illustrative", () => {
  for (const s of SAMPLES) {
    const c = compileTimeline(s);
    const f0 = stateAt(c, 0);
    assert.deepEqual([f0.score, f0.scoreIllustrative, f0.clockIllustrative, f0.period, fmtGameClock(f0.clockSec)], [{ home: 0, away: 0 }, false, false, "Q1", "12:00"]);
    for (const b of c.breaks) {
      for (const t of [b.startT, (b.startT + b.endT) / 2, b.endT - 1]) {
        const f = stateAt(c, t);
        assert.equal(f.phase, "BREAK");
        assert.deepEqual(f.score, b.score, `#${s.runIndex} ${b.label} t=${t}`);
        assert.equal(f.scoreIllustrative || f.clockIllustrative, false);
        assert.equal(f.card, b.kind === "HALFTIME" ? "HALFTIME" : null);
        assert.equal(f.periodDisplay, b.kind === "HALFTIME" ? "HALF" : `END ${b.label}`);
      }
    }
    const fin = stateAt(c, c.tEnd);
    assert.deepEqual([fin.phase, fin.card, fin.periodDisplay, fin.score, fin.scoreIllustrative], ["FINAL", "FINAL", "FINAL", s.final, false]);
    assert.deepEqual(stateAt(c, c.tEnd + 99999), fin, "clamped past the end");
  }
});

test("between checkpoints the score and clock are illustrative, monotone, and within the period's recorded bounds", () => {
  for (const s of SAMPLES.slice(0, 6)) {
    const c = compileTimeline(s);
    for (const seg of c.segments) {
      let prev = seg.before;
      for (let t = seg.startT + 50; t < seg.endT; t += 250) {
        const f = stateAt(c, t);
        assert.equal(f.phase, "LIVE");
        assert.equal(f.period, seg.label);
        assert.equal(f.scoreIllustrative, true, `#${s.runIndex} ${seg.label} t=${t}`);
        assert.equal(f.clockIllustrative, true);
        for (const side of ["home", "away"]) {
          assert.ok(f.score[side] >= prev[side] && f.score[side] >= seg.before[side] && f.score[side] <= seg.after[side], `${side} ${f.score[side]}`);
        }
        assert.ok(f.clockSec > 0 && f.clockSec < seg.clockSec);
        prev = f.score;
      }
    }
  }
  assert.equal(tickScore(31, 0), 0);
  assert.equal(tickScore(31, 1), 31);
  assert.equal(tickScore(31, 0.5), 14);
  assert.equal(tickScore(31, 0.999), 30);
});

test("deterministic: the same t gives the same frame, whatever path or speed reached it", () => {
  const s = SAMPLES.find((x) => x.overtimePeriods > 0) ?? SAMPLES[0];
  const c = compileTimeline(s);
  for (const speed of [1, 2, 4]) {
    let m = createTransport({ tEnd: c.tEnd, driveStarts: c.periodStarts });
    m = transport(m, "SPEED", { speed });
    m = transport(m, "PLAY");
    let ticks = 0;
    while (m.state === "PLAYING" && ticks < 100000) { m = transport(m, "TICK", { dt: 16.7 }); ticks++; }
    assert.equal(m.state, "COMPLETED");
    assert.deepEqual(stateAt(c, m.t), stateAt(c, c.tEnd));
  }
  for (const t of [0, 1234, 17_000, 30_000, c.tEnd / 2, c.tEnd - 1]) assert.deepEqual(stateAt(c, t), stateAt(c, t));
  // seeking via the transport and calling stateAt directly agree
  const m = transport(createTransport({ tEnd: c.tEnd, driveStarts: c.periodStarts }), "SEEK", { t: 20_000 });
  assert.deepEqual(stateAt(c, m.t), stateAt(c, 20_000));
  // next/previous period land on period starts (the transport's drive slots)
  const n1 = transport(createTransport({ tEnd: c.tEnd, driveStarts: c.periodStarts }), "NEXT_DRIVE");
  assert.equal(n1.t, c.periodStarts[1]);
});

test("OT periods: labels OT1…, 5:00 clock, and the final card after the last OT", () => {
  const s = SAMPLES.find((x) => x.overtimePeriods > 0);
  assert.ok(s, "the fixture carries an overtime sample");
  const c = compileTimeline(s);
  const ot = c.segments.find((x) => x.ot);
  const f = stateAt(c, ot.startT);
  assert.equal(f.period, "OT1");
  assert.equal(fmtGameClock(f.clockSec), "5:00");
  assert.equal(f.lastCheckpoint, "Q4");
});

test("diff line points are the checkpoints only; stat leaders come from the sample's game totals", () => {
  const s = SAMPLES[0];
  const c = compileTimeline(s);
  const d = diffPoints(c);
  assert.equal(d.length, s.periods.length + 1);
  assert.deepEqual(d.at(-1).diff, s.final.home - s.final.away);
  const L = statLeaders(s);
  for (const side of ["home", "away"]) {
    const max = Math.max(...s.players[side].map((p) => p.pts));
    assert.equal(L[side].pts.pts, max);
  }
});
