/**
 * Simulation Theater V2 · broadcast package (iteration 7): the score bug's drive strip, the transition cards and the
 * drive-end lower third say only recorded facts (or a labelled illustrative value), with exact disclosure strings; the
 * score-bug depth gradient never lowers a team's ink contrast.
 *
 * Run: npx tsx --test src/components/simulation-theater/theater-broadcast.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { ScoreBug, depthClass } = await import("./parts.tsx");
const { readShadowReceipts } = await import("../../lib/sports/nfl/sim-v2/public-receipt.mjs");
const { adaptReceipt } = await import("../../lib/simulation-theater/adapter-nfl-sim-v2.mjs");
const { compileTimeline } = await import("../../lib/simulation-theater/timeline.mjs");
const { stateAtCompiled } = await import("../../lib/simulation-theater/state-at.mjs");
const { plural } = await import("../../lib/simulation-theater/format.mjs");
const {
  GAME_DISCLOSURE, ILLUSTRATIVE_TAG, RECORDED_TAG, PERIOD_CARD_MS, breakCard, driveEndLowerThird, driveSituation, periodCard, progressYardsText, rolloverCard,
} = await import("../../lib/simulation-theater/broadcast.mjs");
const { NFL_TEAM_COLORS, contrastRatio, theaterPalette, TEXT_MIN } = await import("../../lib/simulation-theater/nfl-team-colors.mjs");
const { TOKEN_RGB } = await import("../../lib/simulation-theater/field-geometry.mjs");

const REPO = path.resolve(process.cwd(), "..");
const ENTRIES = readShadowReceipts(REPO);
const MANIFESTS = ENTRIES.map((e) => adaptReceipt(e.receipt, { file: e.file }).manifest);
const SAMPLES = MANIFESTS.flatMap((m) => m.samples.filter((s) => s.validation.ok).map((s) => ({ m, s, c: compileTimeline(s) })));
const text = (html) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

/** Nothing the engine does not record: no downs or distances, no plays by type, no players, no kick details. */
const FABRICATED = /\b(1st|2nd|3rd|4th)\s*(&|and|down)|\bdown and\b|&\s*\d|\binterception|\bfumble|\bpenalt|\btimeout|\bsack|\bpass(ing|er)?\b|\brush(ing|er)?\b|\breturn(ed)? (for|to)\b|\btouchback|\bonside/i;

test("drive strip: the RECORDED totals at drive end ('Drive 7 of 19 · 10 plays · 75 yds'), from the receipt's own drive fields", () => {
  let n = 0;
  for (const { m, s, c } of SAMPLES) {
    const raw = ENTRIES.find((e) => adaptReceipt(e.receipt, { file: e.file }).manifest.receiptId === m.receiptId);
    const run = raw.receipt.representativeRuns?.find((r) => r.runIndex === s.runIndex) ?? null;
    for (const ev of s.events) {
      const sit = driveSituation(ev, "RESULT", m.teams, s.events.length);
      assert.equal(sit.text, `Drive ${ev.index + 1} of ${s.events.length} · ${plural(ev.plays, "play")} · ${plural(ev.netYards, "yd", "yds")}`);
      assert.equal(sit.tag, RECORDED_TAG);
      assert.doesNotMatch(sit.text, FABRICATED);
      const d = run?.drives?.[ev.index];
      if (d) {
        assert.equal(ev.plays, d.plays, "plays straight from the recorded drive");
        assert.equal(ev.netYards, d.netYards, "net yards straight from the recorded drive");
      }
      n++;
    }
  }
  assert.ok(n > 1000, `checked ${n} drives`);
  console.log(`# drive strip: ${n} drives, recorded totals only`);
});

test("drive strip in motion: START names the recorded start spot; PROGRESS is tagged 'illustrative' with an approximate yardage", () => {
  const { m, s, c } = SAMPLES.find(({ s }) => s.runIndex === 428) ?? SAMPLES[0];
  const ev = s.events[6];
  const start = driveSituation(ev, "START", m.teams, s.events.length);
  assert.equal(start.kind, "start");
  assert.match(start.text, /^Drive 7 of \d+ · [A-Z]{2,3} ball · (own \d+|midfield|[A-Z]{2,3} \d+)$/);
  const prog = driveSituation(ev, "PROGRESS", m.teams, s.events.length);
  assert.equal(prog.tag, ILLUSTRATIVE_TAG);
  assert.equal(prog.kind, "progress");
  const span = c.driveSpans[6];
  const mid = stateAtCompiled(s, c, m.teams, span.startT + 900);
  assert.equal(mid.phase, "PROGRESS");
  const y = progressYardsText(ev, mid.ballYardsToGoal);
  assert.match(y, /^≈−?\d+ yds?$/);
  assert.doesNotMatch(prog.text + y, FABRICATED);
});

test("final card: 'SIMULATED · not a real game', the receipt's final score, the winner, 'Final · OT' only for an OT run; dismissible", () => {
  for (const { m, s, c } of SAMPLES) {
    const st = stateAtCompiled(s, c, m.teams, c.tEnd);
    assert.equal(st.breakKind, "FINAL");
    const card = breakCard("FINAL", st.score, s, m.teams, m.runCount);
    assert.equal(card.line, GAME_DISCLOSURE);
    assert.equal(GAME_DISCLOSURE, "SIMULATED · not a real game");
    assert.equal(card.title, s.finalScore.overtime ? "Final · OT" : "Final");
    assert.deepEqual(card.rows.map((r) => [r.side, r.score]), [["away", s.finalScore.away], ["home", s.finalScore.home]]);
    const w = s.finalScore.home > s.finalScore.away ? "home" : s.finalScore.away > s.finalScore.home ? "away" : null;
    assert.deepEqual(card.rows.filter((r) => r.leader).map((r) => r.side), w ? [w] : []);
    assert.equal(card.run, `run #${s.runIndex.toLocaleString("en-US")} of ${m.runCount.toLocaleString("en-US")}`);
    assert.equal(card.dismissible, true);
  }
});

test("halftime card: the run's own Q1 and Q2 points (only when they sum to the halftime score), non-blocking", () => {
  let seen = 0;
  for (const { m, s, c } of SAMPLES) {
    const brk = c.keyframes.find((k) => k.phase === "BREAK" && k.breakKind === "HALFTIME");
    if (!brk) continue;
    const st = stateAtCompiled(s, c, m.teams, brk.t0 + 10);
    const card = breakCard("HALFTIME", st.score, s, m.teams, m.runCount);
    assert.equal(card.title, "Halftime");
    assert.equal(card.dismissible, false);
    for (const r of card.rows) {
      if (card.columns.length === 3) assert.deepEqual(r.cells, [s.periodScores[r.side][0], s.periodScores[r.side][1], st.score[r.side]]);
      else assert.deepEqual(r.cells, [st.score[r.side]]);
    }
    seen++;
  }
  assert.ok(seen > 100);
});

test("period cards: 'Start of game' at t = 0, 'Start of 2nd half' at Q3 15:00, 'Overtime' after regulation; rollover 'End of Q1' / 'End of Q3'", () => {
  for (const { m, s, c } of SAMPLES) {
    const first = periodCard(s, c, m.teams, 0);
    assert.equal(first.title, "Start of game");
    assert.equal(first.note, "kick/return not modelled");
    assert.equal(periodCard(s, c, m.teams, PERIOD_CARD_MS + 1), null, "non-blocking and brief");
    const half = c.keyframes.find((k) => k.phase === "BREAK" && k.breakKind === "HALFTIME");
    if (half) {
      const t = half.t0 + half.dur;
      const card = periodCard(s, c, m.teams, t);
      assert.equal(card.title, "Start of 2nd half");
      assert.match(card.sub, /^Q3 15:00 · [A-Z]{2,3} ball at /);
    }
    const ot = c.keyframes.find((k) => k.phase === "BREAK" && k.breakKind === "OT_START");
    if (ot) {
      assert.equal(periodCard(s, c, m.teams, ot.t0 + ot.dur).title, "Overtime");
      assert.equal(breakCard("OT_START", stateAtCompiled(s, c, m.teams, ot.t0).score, s, m.teams).title, "End of regulation");
    }
    for (const mk of c.markers) {
      const st = stateAtCompiled(s, c, m.teams, mk.atT);
      assert.equal(rolloverCard(st.rollover, st.score, m.teams).title, `End of Q${mk.quarter}`);
    }
    for (const card of [first, half ? periodCard(s, c, m.teams, half.t0 + half.dur) : null]) {
      if (card) assert.doesNotMatch(`${card.title} ${card.sub}`, FABRICATED);
    }
  }
});

test("drive-end lower third: recorded plays, net yards, game-clock duration and result only", () => {
  for (const { m, s } of SAMPLES.slice(0, 60)) {
    for (const ev of s.events) {
      const lt = driveEndLowerThird(ev, m.teams, s.events.length);
      assert.equal(lt.tag, `Drive ${ev.index + 1} of ${s.events.length}`);
      assert.match(lt.facts, /^−?\d+ plays? · −?\d+ yards? · \d+:\d\d$/);
      assert.doesNotMatch(lt.facts, FABRICATED);
      assert.ok(lt.result.startsWith(ev.outcomeLabel));
    }
  }
});

test("score bug renders the strip's exact text and tag; the drive yardage span only while the ball moves", () => {
  const { m, s } = SAMPLES[0];
  const ev = s.events[0];
  const palette = theaterPalette(m.teams.home.abbr, m.teams.away.abbr);
  const base = { teams: m.teams, palette, score: { home: 7, away: 3 }, offense: "home", period: 1, periodClock: 600, clockIllustrative: false, stateChip: null, illusId: "x" };
  const rec = driveSituation(ev, "RESULT", m.teams, s.events.length);
  const html = renderToStaticMarkup(React.createElement(ScoreBug, { ...base, situation: rec }));
  assert.ok(text(html).includes(rec.text));
  assert.ok(text(html).includes("recorded"));
  assert.ok(!html.includes("st-bug-sit-yds"));
  const prog = renderToStaticMarkup(React.createElement(ScoreBug, { ...base, situation: driveSituation(ev, "PROGRESS", m.teams, s.events.length) }));
  assert.ok(prog.includes("st-bug-sit-yds") && text(prog).includes("illustrative"));
  // the digit roll keeps the old score out of the text (generated content with empty alt text)
  const roll = renderToStaticMarkup(React.createElement(ScoreBug, { ...base, from: { home: 0, away: null } }));
  assert.ok(roll.includes('data-from="0"') && roll.includes("st-roll"));
  assert.ok(!text(roll).includes("07"), "only the new score is text");
});

test("score-bug depth: the gradient moves away from the ink, so no team's ink drops below its flat contrast (or 7:1) at any stop (32 teams)", () => {
  const hex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, p) => hex(a.map((v, i) => v * p / 100 + b[i] * (1 - p / 100)));
  let worst = 99;
  for (const key of Object.keys(NFL_TEAM_COLORS)) {
    const p = theaterPalette(key.slice(4), "ZZZ").home;
    const flat = contrastRatio(p.ink, p.fill);
    // the stops in theater.css: is-lift = --lava-text at 16 % into the fill; is-shade = --bg at 30 % into the fill
    const stop = depthClass(p.ink) === "is-lift" ? mix(TOKEN_RGB.lavaText, rgbOf(p.fill), 16) : mix(TOKEN_RGB.bg, rgbOf(p.fill), 30);
    const c = contrastRatio(p.ink, stop);
    assert.ok(flat >= TEXT_MIN, `${key} flat ${flat}`);
    // never below the flat fill's own contrast, except where both are past 7:1 (LV: black shaded toward the page's
    // near-black lifts a hair, 21.00 → 20.72)
    assert.ok(c >= Math.min(flat, 7) - 1e-9, `${key}: the depth stop ${stop} lowers the ink's contrast (${c.toFixed(2)} < ${flat.toFixed(2)})`);
    worst = Math.min(worst, c);
  }
  console.log(`# score-bug depth: worst ink contrast across both stops ${worst.toFixed(2)}:1`);
});
