/**
 * Simulation Theater V2 · the disclosures render exactly, at every width (iteration 2), and the field marks only
 * recorded spots. Server render of the shared shell parts (no browser).
 *
 * Run: npx tsx --test src/components/simulation-theater/theater-shell.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { SceneBadge, ScoreBug, FieldLegend, Transcript } = await import("./parts.tsx");
const { DetachedBall, FieldLive, FieldMarks, StaticField } = await import("./FieldScene.tsx");
const { LABELS } = await import("../../lib/simulation-theater/format.mjs");
const { loadTheater, FIXTURE_EVENT_IDS } = await import("../../lib/simulation-theater/loader.mjs");
const { finalState } = await import("../../lib/simulation-theater/state-at.mjs");
const { theaterPalette } = await import("../../lib/simulation-theater/nfl-team-colors.mjs");
const { BALL_RX, ballSize, fieldMap, overlayFrame } = await import("../../lib/simulation-theater/field-geometry.mjs");

const DISCLOSURE = "SIMULATED · drive-level · movement illustrative · experimental model";
const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const text = (html) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

test("the scene badge renders the EXACT disclosure, once, with no abbreviated variant anywhere", () => {
  assert.equal(LABELS.badge, DISCLOSURE);
  assert.equal(LABELS.badgeShort, undefined, "no short badge exists to be swapped in at narrow widths");
  const html = renderToStaticMarkup(React.createElement(SceneBadge));
  assert.equal(text(html), DISCLOSURE);
  assert.match(html, /data-st-disclosure/);
  for (const f of ["parts.tsx", "TheaterIsland.tsx", "TheaterSection.tsx", "theater.css"]) {
    const src = fs.readFileSync(path.join(APP, "src/components/simulation-theater", f), "utf8");
    assert.ok(!/badge-short|badgeShort/.test(src), `${f}: no short badge`);
    assert.ok(!/drive-level · illustrative/.test(src), `${f}: never drops "movement"`);
  }
  const css = fs.readFileSync(path.join(APP, "src/components/simulation-theater/theater.css"), "utf8");
  assert.ok(!/\.st-badge[^{]*\{[^}]*display:\s*none/.test(css), "the badge is never hidden");
  assert.ok(!/\.st-badge[^{]*\{[^}]*(text-overflow|white-space:\s*nowrap)/.test(css), "the badge wraps; it is never truncated");
});

test("limitations stay visible: illustrative clock, fixed orientation, not the forecast, experimental", () => {
  const t = loadTheater(REPO, FIXTURE_EVENT_IDS[0]);
  const m = t.manifest;
  const palette = theaterPalette(m.teams.home.abbr, m.teams.away.abbr);
  const bug = (illus) => renderToStaticMarkup(React.createElement(ScoreBug, { teams: m.teams, palette, score: { home: 3, away: 0 }, offense: "home", period: 1, periodClock: 701.4, clockIllustrative: illus, stateChip: null, illusId: "x" }));
  assert.match(text(bug(true)), /Sim clock/i);
  assert.match(text(bug(true)), /clock illustrative/);
  assert.match(bug(true), /aria-describedby="x"/);
  assert.match(text(bug(true)), new RegExp(LABELS.clockIllustrative));
  assert.match(text(bug(true)), /has the ball/);
  assert.ok(!/timeout/i.test(text(bug(true))), "no timeouts: the engine records none");
  const legend = text(renderToStaticMarkup(React.createElement(FieldLegend, { homeAbbr: m.teams.home.abbr })));
  assert.match(legend, /fixed orientation: SF \(home\) defends the left end zone all game/);
  assert.match(legend, /illustrative/);
  assert.equal(LABELS.sample, "REPRESENTATIVE SIMULATED GAME — not the forecast");
  const tr = text(renderToStaticMarkup(React.createElement(Transcript, { sample: m.samples[0], teams: m.teams, current: null })));
  assert.ok(tr.includes(DISCLOSURE));
  assert.ok(tr.includes("Q1 15:00 · SF ball at own 30 · 11 plays, 28 yards, 2:45 · field goal · SF 3–0"));
});

test("the field marks only the RECORDED start and end spots (no invented first-down or per-play marks)", () => {
  const t = loadTheater(REPO, FIXTURE_EVENT_IDS[0]);
  const m = t.manifest;
  const sample = m.samples[0];
  const palette = theaterPalette(m.teams.home.abbr, m.teams.away.abbr);
  const s = finalState(m, sample);
  const ev = sample.events[s.driveIdx];
  const W = 1200, H = 561;
  const endX = fieldMap(W, H).X(ev.offense === "home" ? 110 - ev.fieldEnd : 10 + ev.fieldEnd);
  const live = renderToStaticMarkup(React.createElement(FieldLive, {
    W, H, frame: s, o: overlayFrame(s, { W, H }), palette, offenseAbbr: m.teams[ev.offense].abbr, startTag: "START", endTag: "END",
    showEnd: true, endX, idPrefix: "t", reducedMotion: false,
  }));
  assert.equal((live.match(/class="st-spot /g) ?? []).length, 2, "exactly two marker lines: start and end");
  assert.ok(!/first.?down/i.test(live));
  const turf = renderToStaticMarkup(React.createElement(StaticField, { palette, idPrefix: "t" }));
  assert.equal((turf.match(/<filter/g) ?? []).length, 1, "one grain filter, on the static layer");
  assert.ok(turf.length < 12000, `static turf stays small (${turf.length} B): hashes are a pattern, not 350 paths`);
  const marks = renderToStaticMarkup(React.createElement(FieldMarks, { W: 288, H: 140, palette, teams: m.teams }));
  assert.ok(!marks.includes(">SF<"), "end-zone lettering dropped at 288 px (spec §2.3)");
});

test("no-JavaScript final frame: the ball keeps its drawn shape in any box (rendered w/h of the round glow = 1 ± 5 %)", () => {
  const t = loadTheater(REPO, FIXTURE_EVENT_IDS[0]);
  const m = t.manifest;
  const sample = m.samples[0];
  const palette = theaterPalette(m.teams.home.abbr, m.teams.away.abbr);
  const s = finalState(m, sample);
  const W = 1200, H = 561; // TheaterSection's SSR_W × SSR_H
  const o = overlayFrame(s, { W, H });
  const section = fs.readFileSync(path.join(APP, "src/components/simulation-theater/TheaterSection.tsx"), "utf8");
  assert.match(section, /detachBall \/>/, "the server frame's stretched layer draws no ball");
  assert.match(section, /<DetachedBall W=\{SSR_W\} H=\{SSR_H\} o=\{o\}/);
  assert.match(section, /const SSR_W = 1200;\s*const SSR_H = 561;/);
  const live = renderToStaticMarkup(React.createElement(FieldLive, {
    W, H, frame: s, o, palette, offenseAbbr: "SF", startTag: "START", endTag: "END", showEnd: true, endX: 0, idPrefix: "t", reducedMotion: false, detachBall: true,
  }));
  assert.match(live, /preserveAspectRatio="none"/, "the live layer still stretches with the turf");
  assert.ok(!/st-ball-body|st-ball-glow/.test(live), "…but carries no ball");
  const ball = renderToStaticMarkup(React.createElement(DetachedBall, { W, H, o, idPrefix: "b" }));
  assert.ok(!/preserveAspectRatio/.test(ball), "default xMidYMid meet: uniform scale");
  const vb = ball.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
  assert.equal(vb[2], vb[3], "square viewBox");
  assert.equal(vb[0], -vb[2] / 2, "centred on the ball");
  const css = fs.readFileSync(path.join(APP, "src/components/simulation-theater/theater.css"), "utf8");
  assert.match(css, /\.st-fieldwrap \.st-ball-solo\{[^}]*height:auto;aspect-ratio:1\/1;transform:translate\(-50%,-50%\)/, "square box");
  // placed at the same fieldMap percentages as the stretched layers
  const left = Number(ball.match(/left:([\d.]+)%/)[1]);
  const top = Number(ball.match(/top:([\d.]+)%/)[1]);
  assert.ok(Math.abs(left - (o.ballX / W) * 100) < 0.001 && Math.abs(top - (o.laneY / H) * 100) < 0.001);
  // rendered proportions in the boxes the page gives this frame (320 full-bleed, 390, 1440): the square SVG scales
  // by k = boxWidthPx / viewBoxWidth on BOTH axes, so the round glow renders k·2r × k·2r and the ball body keeps rx:ry
  const [, minPx, pct, maxPx] = ball.match(/width:clamp\(([\d.]+)px, ([\d.]+)%, ([\d.]+)px\)/).map(Number);
  const { rx, ry } = ballSize(W);
  const r = rx * 2.3;
  const out = [];
  for (const [label, boxW, boxH] of [["320", 320, 168], ["390", 344, 168], ["1440", 1154, 539.2]]) {
    const svgPx = Math.min(maxPx, Math.max(minPx, (pct / 100) * boxW));
    const k = svgPx / vb[2]; // uniform: the svg box is square (aspect-ratio 1/1), the viewBox is square
    const glowWH = (2 * r * k) / (2 * r * k);
    const bodyDistortion = ((2 * rx * k) / (2 * ry * k)) / (rx / ry);
    // stretched (the old way): the x and y scales of a 1200 × 561 drawing in that box
    const stretched = (boxW / W) / (boxH / H);
    assert.ok(Math.abs(glowWH - 1) <= 0.05 && Math.abs(bodyDistortion - 1) <= 0.05, label);
    // and the ball is the island's size at that width (ballSize(boxW).rx)
    assert.ok(Math.abs(rx * k - ballSize(boxW).rx) < 0.05, `${label}: ${(rx * k).toFixed(2)} vs island ${ballSize(boxW).rx}`);
    out.push(`${label}: glow w/h ${glowWH.toFixed(3)} (stretched layer would give ${stretched.toFixed(3)}), rx ${(rx * k).toFixed(1)} px`);
  }
  assert.equal(BALL_RX.max, rx, "drawn at the 1200 px size, i.e. the largest ball");
  console.log(`# no-JS ball: ${out.join(" · ")}`);
});
