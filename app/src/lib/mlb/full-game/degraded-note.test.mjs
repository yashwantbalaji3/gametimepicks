/**
 * "Degraded inputs" on the MLB hub card and the MLB Game Simulation (founder decision 2026-10-26: degraded official MLB
 * forecasts stay out of model suggestions but stay visible, clearly labelled, with an accurate reason).
 *
 * Run: npx tsx --test src/lib/mlb/full-game/degraded-note.test.mjs
 *
 * The real cases are verbatim copies (__fixtures__/degraded-note-games.json) because today's artifact can still be
 * refreshed before first pitch: MIL @ TB 2026-10-26 (849804, degraded: 2 of 9 TB batters unrated) and TB @ MIL
 * 2026-10-24 (ready). The live-artifact test below checks every committed game for consistency without pinning a status.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DEGRADED_LABEL, DEGRADED_REFUSAL, DEGRADED_SUGGESTIONS, degradedInputsNote } from "./degraded-note.mjs";

globalThis.React = React; // the .tsx under test compiles to React.createElement

const APP = process.cwd();
const FIX = JSON.parse(fs.readFileSync(path.join(APP, "src/lib/mlb/full-game/__fixtures__/degraded-note-games.json"), "utf8"));
const noteOf = (g) => degradedInputsNote(g.status, g.completeness, { away: g.awayTeam, home: g.homeTeam });
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

test("REAL 2026-10-26 MIL @ TB (849804, degraded): the label and the snapshot's own count and cause", () => {
  const g = FIX.degraded;
  assert.equal(g.status, "degraded");
  assert.deepEqual([g.completeness.homeRatedCount, g.completeness.homeLineupCount, g.completeness.homeLineupSource], [7, 9, "confirmed"]);
  const n = noteOf(g);
  assert.equal(n.label, "Degraded inputs");
  assert.equal(n.reason, "2 of 9 TB batters have no projection (no posted prop line, or too little data) and are simulated at replacement-level rates.");
  // the producer's own note says the same thing — the sentence adds no claim the snapshot does not make
  assert.ok(g.completeness.notes.some((s) => s.includes("2 of 9 have no GTP projection (no posted prop line, or too little data) and are simulated at replacement-level rates")));
  assert.equal(n.refusal, "The official forecast is marked degraded: incomplete inputs.", "the Level A refusal, verbatim");
  assert.equal(n.suggestions, "It is not included in model suggestions while degraded.");
});

test("REAL 2026-10-24 TB @ MIL (ready) and an unavailable snapshot carry no label", () => {
  assert.equal(FIX.ready.status, "ready");
  assert.equal(noteOf(FIX.ready), null);
  assert.equal(degradedInputsNote("unavailable", FIX.degraded.completeness, { away: "MIL", home: "TB" }), null, "unavailable has its own state");
  assert.equal(degradedInputsNote(undefined, null, { away: "A", home: "B" }), null);
});

test("every cause the producer's level rule can act on is named from the snapshot's fields; none is invented", () => {
  const base = { awayLineupSource: "confirmed", homeLineupSource: "confirmed", awayRatedCount: 9, homeRatedCount: 9, awayLineupCount: 9, homeLineupCount: 9, hasAwayStarter: true, hasHomeStarter: true };
  const r = (c) => degradedInputsNote("degraded", { ...base, ...c }, { away: "NYY", home: "BOS" }).reason;
  assert.equal(r({ awayLineupSource: "prop-derived", awayRatedCount: 6 }), "NYY had not posted a batting order, so 3 of 9 NYY lineup slots are simulated at replacement-level rates.");
  assert.equal(r({ hasHomeStarter: false }), "BOS has no posted probable starter, so a league bullpen aggregate pitches for BOS.");
  assert.equal(r({ awayRatedCount: 8, homeRatedCount: 5 }),
    "1 of 9 NYY batters have no projection (no posted prop line, or too little data) and are simulated at replacement-level rates; 4 of 9 BOS batters have no projection (no posted prop line, or too little data) and are simulated at replacement-level rates.");
  assert.equal(r({}), "Some pregame inputs for this game are incomplete.", "degraded with no cause in the fields: generic, never a guessed one");
});

test("the hub card and the Game Simulation render the label + reason for the degraded game, nothing for the ready one", async () => {
  const { default: MlbSimulationsSection } = await import("../../../components/mlb/mlb-simulations-section.tsx");
  const { default: MlbDegradedInputs } = await import("../../../components/mlb/mlb-degraded-inputs.tsx");
  const card = (g) => ({
    slug: g.slug, gamePk: g.gamePk, away: g.awayTeam, home: g.homeTeam, firstPitch: g.firstPitch,
    favourite: { team: g.awayTeam, probability: g.winProbability.away }, medianTotal: g.totalRuns?.median ?? null, totalRange: null,
    likeliestScore: g.finalScores[0] ?? null, completeness: g.completeness.level, awaitingLineup: false, degraded: noteOf(g),
  });
  const set = { date: "2026-10-26", generatedAt: "", modelVersion: null, runCount: 10000, cards: [card(FIX.degraded), card(FIX.ready)], readyCount: 1, confirmedOrderCount: 2, confirmedButUnratedCount: 1 };
  const html = renderToStaticMarkup(React.createElement(MlbSimulationsSection, { set, hrefFor: (c) => `/games/mlb/${c.slug}/` }));
  assert.equal((html.match(/data-mlb-degraded-inputs/g) ?? []).length, 1, "only the degraded card is labelled");
  const t = text(html);
  assert.ok(t.includes("MIL at TB Degraded inputs 2 of 9 TB batters have no projection"), t.slice(0, 400));
  assert.ok(t.includes("simulated at replacement-level rates. Not included in model suggestions while degraded."));
  // the Game Simulation's line (its header already carries the "Degraded inputs" chip): reason + Level A refusal + suggestions
  const sim = text(renderToStaticMarkup(React.createElement(MlbDegradedInputs, { note: noteOf(FIX.degraded), showLabel: false })));
  assert.equal(sim, `2 of 9 TB batters have no projection (no posted prop line, or too little data) and are simulated at replacement-level rates. ${DEGRADED_REFUSAL} ${DEGRADED_SUGGESTIONS}`);
});

test("SOURCE PIN · the Game Simulation keeps its header chip and renders the reason from the same snapshot", () => {
  const src = fs.readFileSync(path.join(APP, "src/components/game/mlb-full-game-report.tsx"), "utf8");
  assert.match(src, /g\.status === "degraded" \? <Chip tone="warn">Degraded inputs<\/Chip>/);
  assert.match(src, /degradedInputsNote\(g\.status, g\.completeness, \{ away: g\.awayTeam, home: g\.homeTeam \}\)/);
  assert.equal(DEGRADED_LABEL, "Degraded inputs");
});

test("LIVE ARTIFACTS · every committed game: a label iff its status is degraded, and the prediction snapshot agrees", async (t) => {
  const { loadMlbSimCards } = await import("./hub-cards.ts");
  const dir = path.join(APP, "public/data/mlb/full-game-simulations");
  const days = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-14).map((f) => f.slice(0, 10));
  let degraded = 0;
  for (const d of days) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, `${d}.json`), "utf8"));
    const set = loadMlbSimCards(d);
    if (!set) continue;
    let preds = null;
    try { preds = new Map(JSON.parse(fs.readFileSync(path.join(APP, "public/data/mlb/predictions", `${d}.json`), "utf8")).predictions.map((p) => [String(p.gamePk), p.status])); } catch { /* no prediction snapshot that day */ }
    for (const c of set.cards) {
      const g = raw.games.find((x) => x.slug === c.slug);
      assert.equal(!!c.degraded, g.status === "degraded", `${d} ${c.slug}`);
      if (preds?.has(String(g.gamePk))) assert.equal(preds.get(String(g.gamePk)), g.status, `${d} ${c.slug}: the official prediction snapshot's status`);
      if (c.degraded) degraded += 1;
    }
  }
  assert.ok(days.length > 0);
  t.diagnostic(`${degraded} degraded game(s) across ${days.length} day(s)`);
});

test("CONTRAST · label and text are AA on the card/report panel (globals.css)", () => {
  const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");
  const hex = (name) => css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
  const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const panel = hex("--lava-panel");
  assert.ok(panel, "panel token");
  for (const [name, min] of [["--vault-warn", 4.5], ["--lava-text-muted", 4.5]]) {
    const fg = hex(name);
    assert.ok(fg, name);
    assert.ok(ratio(fg, panel) >= min, `${name} ${fg} on ${panel}: ${ratio(fg, panel).toFixed(2)}`);
  }
});
