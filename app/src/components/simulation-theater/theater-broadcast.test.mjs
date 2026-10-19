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
  GAME_DISCLOSURE, ILLUSTRATIVE_TAG, RECORDED_TAG, ROLLOVER_TIMING_TAG, PERIOD_CARD_MS, breakCard, driveEndLowerThird, driveSituation, periodCard, progressYardsText, rolloverCard,
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

test("halftime card: the run's own Q1 and Q2 points (only when they sum to the halftime score), non-blocking, dismissible", () => {
  let seen = 0;
  for (const { m, s, c } of SAMPLES) {
    const brk = c.keyframes.find((k) => k.phase === "BREAK" && k.breakKind === "HALFTIME");
    if (!brk) continue;
    const st = stateAtCompiled(s, c, m.teams, brk.t0 + 10);
    const card = breakCard("HALFTIME", st.score, s, m.teams, m.runCount);
    assert.equal(card.title, "Halftime");
    assert.equal(card.line, GAME_DISCLOSURE);
    assert.equal(card.dismissible, true, "iteration 8: the halftime card can be hidden too");
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
      const rc = rolloverCard(st.rollover, st.score, m.teams, mk.exact);
      assert.equal(rc.title, `End of Q${mk.quarter}`);
      // a quarter that ends inside a drive is shown at the interpolated clock's instant: tagged (iteration 8)
      assert.equal(rc.timing, mk.exact ? null : ROLLOVER_TIMING_TAG);
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

// ── iteration 8: no interpolated value renders without its illustrative tag ───────────────────────────────────────

// the pairing audit (tree / untaggedInterp) lives in interp-audit.mjs, shared with the NBA theater's tests
const { untaggedInterp } = await import("./interp-audit.mjs");

test("the pairing check itself fails on an interpolated value without a visible tag (negative controls)", () => {
  assert.deepEqual(untaggedInterp('<div data-st-interp-scope="x"><span data-st-interp="clock">7:12</span><span data-st-interp-tag="">clock illustrative</span></div>'), []);
  assert.equal(untaggedInterp('<div><span data-st-interp="clock">7:12</span></div>').length, 1, "no scope");
  assert.equal(untaggedInterp('<div data-st-interp-scope="x"><span data-st-interp="yards">≈5 yds</span></div>').length, 1, "no tag");
  assert.equal(untaggedInterp('<div data-st-interp-scope="x"><span data-st-interp="yards"></span><span class="st-sr" data-st-interp-tag="">illustrative</span></div>').length, 1, "tag only for screen readers");
  assert.equal(untaggedInterp('<div data-st-interp-scope="x"><span data-st-interp="yards"></span><span aria-hidden="true"><b data-st-interp-tag="">illustrative</b></span></div>').length, 1, "hidden tag");
});

test("score bug: at every 100 ms of every fixture run, each interpolated value (clock, period, in-drive yardage) renders with its visible tag", () => {
  let renders = 0;
  let interp = 0;
  const fixtures = SAMPLES.filter(({ m }) => ["401873008", "401873005"].includes(String(m.eventId))).slice(0, 8);
  assert.ok(fixtures.length >= 2);
  for (const { m, s, c } of fixtures) {
    const palette = theaterPalette(m.teams.home.abbr, m.teams.away.abbr);
    for (let t = 0; t <= c.tEnd; t += 100) {
      const st = stateAtCompiled(s, c, m.teams, t);
      const ev = s.events[st.driveIdx];
      const phase = st.phase === "FINAL" || st.phase === "BREAK" || st.phase === "TRANSITION" ? "RESULT" : st.phase;
      const html = renderToStaticMarkup(React.createElement(ScoreBug, {
        teams: m.teams, palette, score: st.score, offense: st.offense, period: st.period, periodClock: st.periodClock,
        clockIllustrative: st.clockIllustrative, stateChip: null, illusId: "x", situation: driveSituation(ev, phase, m.teams, s.events.length),
      }));
      renders++;
      assert.deepEqual(untaggedInterp(html), [], `#${s.runIndex} t=${t} ${st.phase}`);
      // and nothing interpolated escapes the marking: an illustrative clock or a moving ball always marks its value
      if (st.clockIllustrative) assert.match(html, /data-st-interp="clock"/, `#${s.runIndex} t=${t}: clock unmarked`);
      if (st.phase === "PROGRESS") assert.match(html, /data-st-interp="yards"/, `#${s.runIndex} t=${t}: yardage unmarked`);
      if (/data-st-interp=/.test(html)) interp++;
    }
  }
  assert.ok(interp > 100, `interpolated frames checked: ${interp}`);
  console.log(`# score bug: ${renders} renders, ${interp} with interpolated values, every one tagged`);
});

test("the in-drive yardage and its tag are one no-wrap unit (they can never land on different lines)", async () => {
  const fs = await import("node:fs");
  const css = fs.readFileSync(path.join(process.cwd(), "src/components/simulation-theater/theater.css"), "utf8");
  assert.match(css, /\.st-bug-sit-illus\{[^}]*white-space:nowrap/);
  assert.match(css, /\.st-bug-sit-illus\{[^}]*flex:0 0 auto/);
  assert.doesNotMatch(css, /\.st-bug-sit-(illus|tag)[^{]*\{[^}]*display:\s*none/, "the tag is never hidden at any width");
  const { m, s } = SAMPLES[0];
  const html = renderToStaticMarkup(React.createElement(ScoreBug, {
    teams: m.teams, palette: theaterPalette(m.teams.home.abbr, m.teams.away.abbr), score: { home: 0, away: 0 }, offense: "home", period: 1,
    periodClock: 800, clockIllustrative: true, stateChip: null, illusId: "x", situation: driveSituation(s.events[0], "PROGRESS", m.teams, s.events.length),
  }));
  assert.match(html, /<span class="st-bug-sit-illus" data-st-interp-scope="yards"><span class="st-bug-sit-yds" data-st-interp="yards"><\/span><span class="st-bug-sit-tag is-illustrative" data-st-interp-tag="">illustrative<\/span><\/span>/);
});
