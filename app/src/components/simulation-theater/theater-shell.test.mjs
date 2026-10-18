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
const { FieldLive, FieldMarks, StaticField } = await import("./FieldScene.tsx");
const { LABELS } = await import("../../lib/simulation-theater/format.mjs");
const { loadTheater, FIXTURE_EVENT_IDS } = await import("../../lib/simulation-theater/loader.mjs");
const { finalState } = await import("../../lib/simulation-theater/state-at.mjs");
const { theaterPalette } = await import("../../lib/simulation-theater/nfl-team-colors.mjs");
const { fieldMap, overlayFrame } = await import("../../lib/simulation-theater/field-geometry.mjs");

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
