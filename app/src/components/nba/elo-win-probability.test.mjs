/**
 * NBA · THE ELO RATING'S GAME-WINNER PROBABILITY — founder decision 2026-10-23:
 *   "I approve preparing a separately identified Elo game-winner probability display, provided it is sourced from the
 *    existing frozen official forecast, has consistent provenance across pages, and passes the relevant disclosure and
 *    integrity checks … Keep existing forecasts and grading immutable."
 *
 *   source        the receipt's own forecast.elo pHome / pAway, verbatim, with provenance (freeze + receipt hash)
 *   switch        default OFF: no field is published and nothing renders; a published slate is never rewritten
 *   one accessor  hub card, Theater Official Forecast panel, current + dated boards and Level A rows print the SAME text
 *                 and the SAME receipt number for the same game
 *   withheld      only `winProbability` changes (for the Elo field); team scores, ranges and markets stay withheld
 *
 * Fixtures: the committed, frozen 2026-10-23 v0.1 receipts and Theater files (immutable — frozen forecasts are never
 * rewritten), plus synthetic games for the refusals. Run (from app/): npx tsx --test src/components/nba/elo-win-probability.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const W = await import("../../lib/sports/nba/elo-win-probability.mjs");
const { eloGradedCount, loadEloWinProbabilityContext } = await import("../../lib/sports/nba/elo-win-probability-context.mjs");
const L = await import("../../lib/sports/nba/experimental-public-lane.mjs");
const { decidePublish } = await import("../../lib/sports/nba/experimental-lane-publish.mjs");
const { etDateOf } = await import("../../lib/sports/nba/experimental-forecast.mjs");
const { PREREG } = await import("../../lib/sports/nba/grader-metrics.mjs");
const { default: Lane } = await import("./experimental-lane.tsx");
const { default: Board } = await import("./projections-view.tsx");
const { default: Official } = await import("./official-predictions.tsx");
const { default: LevelASuggestions } = await import("../products/level-a-suggestions.tsx");
const { nbaSelections } = await import("../../lib/products/level-a/sources.mjs");
const { levelASuggestions } = await import("../../lib/products/level-a/suggestions.mjs");
const { readPossessionArtifact, validatedGame } = await import("../../lib/simulation-theater/nba/possession/stored-run.mjs");
const { buildPlaybackPayload } = await import("../../lib/simulation-theater/nba/possession/payload.mjs");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const DATE = "2026-10-23";
const readJson = (abs) => JSON.parse(fs.readFileSync(abs, "utf8"));
const FORECAST = readJson(path.join(REPO, "data/internal/research/nba/experimental-v0.1/forecasts", `${DATE}.json`));
const COMMITTED = readJson(path.join(APP, "public/data/nba/experimental-public", `${DATE}.json`));
const build = (eloWinProbability) => L.buildExperimentalSnapshot({ forecastDoc: structuredClone(FORECAST), sourceFile: COMMITTED.source.file, sourceCommit: COMMITTED.source.commit, generatedAt: COMMITTED.generatedAt, eloWinProbability });
const ON = { enabled: true, disclosure: W.eloAccuracyDisclosure({ graded: 14, minN: PREREG.winner.minN }) };
const receiptOf = (id) => FORECAST.games.find((g) => String(g.providerEventId) === String(id));

test("the switch is ON since Release G; OFF changes nothing, and a slate already published without the field keeps it that way", () => {
  assert.equal(W.ELO_WIN_PROBABILITY.enabled, true, "ON since Release G (founder conditional approval 2026-10-23, after acceptance); rollback = false here and in the module");
  // OFF (the rollback state): the committed 10-23 lane rebuilds byte-for-byte.
  assert.deepEqual(JSON.parse(JSON.stringify(build(false))), COMMITTED);
  // ON never rewrites a published slate: 10-23 was published without the field, so the publisher's rule keeps it out.
  assert.equal(W.eloWinProbabilityForPublish(COMMITTED), false, "an already-published slate follows what it was published with, not the switch");
  assert.equal(W.eloWinProbabilityForPublish(null), true, "a slate not yet published follows the switch (ON)");
  assert.deepEqual(JSON.parse(JSON.stringify(build(W.eloWinProbabilityForPublish(COMMITTED)))), COMMITTED, "the publisher's rebuild of 10-23 with the switch ON is the committed slate");
  assert.ok(Object.hasOwn(COMMITTED.withheld, "winProbability"));
  for (const g of COMMITTED.games) assert.equal(W.eloWinProbabilityOf(g), null, "a slate published without the field shows nothing");
});

test("publisher ON: the receipt's own Elo numbers, verbatim, with provenance; the change is additive only", () => {
  const on = build(true);
  for (const g of on.games) {
    const r = receiptOf(g.providerEventId);
    assert.ok(Object.is(g.elo.winProbability.home, r.forecast.elo.pHome), "pHome copied, not recomputed");
    assert.ok(Object.is(g.elo.winProbability.away, r.forecast.elo.pAway), "pAway copied, not recomputed");
    assert.deepEqual(g.elo.winProbability.provenance, { source: W.ELO_WIN_PROBABILITY_SOURCE, rule: "nba-winner-side@1", field: "forecast.elo.pHome / forecast.elo.pAway", frozenAt: r.receipt.generatedAt, receiptPayloadSha256: r.receipt.payloadSha256 });
    assert.equal(g.elo.source, W.ELO_SOURCE_WITH_PROBABILITY);
    assert.ok(L.snapshotMatchesSource(g, r), "re-derives from its receipt");
    const tampered = structuredClone(g); tampered.elo.winProbability.home = 0.7;
    assert.equal(L.snapshotMatchesSource(tampered, r), false, "a changed number never re-derives");
  }
  // strip exactly the decision's additions → the committed OFF slate
  const stripped = structuredClone(on);
  for (const g of stripped.games) { delete g.elo.winProbability; g.elo.source = COMMITTED.games[0].elo.source; }
  stripped.withheld = { ...L.WITHHELD };
  assert.deepEqual(JSON.parse(JSON.stringify(stripped)), COMMITTED);
});

test("withheld (founder decision 2026-10-23): only winProbability leaves the list; team scores, ranges and markets stay", () => {
  const on = build(true);
  assert.deepEqual(Object.keys(on.withheld), ["teamScores", "playerRanges", "markets"]);
  const text = JSON.stringify({ ...on, withheld: null, games: on.games.map((g) => ({ ...g, elo: { ...g.elo, winProbability: null } })) });
  assert.doesNotMatch(text, /"(pHome|pAway|probability|confidence|odds|line|edge|p10|p90|mean)"\s*:/, "nothing else probability-like travels");
  for (const g of on.games) {
    assert.equal(g.teamScores.state, "WITHHELD");
    for (const side of ["away", "home"]) for (const r of g.players[side]) assert.deepEqual(Object.keys(r.medians), ["pts", "reb", "ast", "threePm"], "medians only — no ranges");
  }
});

test("a published slate is never rewritten by a flip: the publisher rebuilds it exactly as it was published", () => {
  assert.equal(W.eloWinProbabilityForPublish(COMMITTED, { enabled: true }), false, "published without the field → stays without");
  assert.equal(W.eloWinProbabilityForPublish({ ...COMMITTED, withheld: L.withheldFor({ eloWinProbability: true }) }, { enabled: false }), true, "published with it → stays with it");
  assert.equal(W.eloWinProbabilityForPublish(null, { enabled: true }), true);
  assert.equal(W.eloWinProbabilityForPublish(null, { enabled: false }), false);
  const rebuilt = build(W.eloWinProbabilityForPublish(COMMITTED, { enabled: true }));
  const d = decidePublish({ date: DATE, scheduleRows: FORECAST.games.map((g) => ({ providerEventId: g.providerEventId, dateUtc: g.dateUtc, statusRaw: "STATUS_FINAL" })), etDateOf, forecastDoc: FORECAST, now: "2026-10-24T12:00:00Z", snapshot: rebuilt, rederivesOk: true, committedDay: COMMITTED, committedLatest: COMMITTED });
  assert.equal(d.action, "NOOP", d.reason);
});

test("the accessor refuses anything that is not this game's own frozen Elo numbers", () => {
  const g = build(true).games[0];
  const v = W.eloWinProbabilityOf(g, { enabled: true });
  assert.ok(v && Object.is(v.home, g.elo.winProbability.home));
  assert.equal(W.eloWinProbabilityOf(g, { enabled: false }), null, "switch off");
  const bad = (mut) => { const x = structuredClone(g); mut(x); return W.eloWinProbabilityOf(x, { enabled: true }); };
  assert.equal(bad((x) => { delete x.elo.winProbability; }), null, "no field");
  assert.equal(bad((x) => { x.elo.winProbability.provenance.frozenAt = "2026-10-23T15:00:00Z"; }), null, "another freeze");
  assert.equal(bad((x) => { x.elo.winProbability.provenance.receiptPayloadSha256 = "0".repeat(64); }), null, "another receipt");
  assert.equal(bad((x) => { x.elo.winProbability.provenance.source = "v1 sim"; }), null, "another source");
  assert.equal(bad((x) => { x.elo.winProbability.home = 0.2; x.elo.winProbability.away = 0.8; }), null, "contradicts the published side");
  assert.equal(bad((x) => { x.elo.winProbability.away = 0.5; }), null, "not complements");
  assert.equal(bad((x) => { x.elo.winProbability.home = 1; x.elo.winProbability.away = 0; }), null, "not a probability");
  assert.equal(bad((x) => { x.elo.state = "TOO_CLOSE"; x.elo.favoured = null; }), null, "TOO_CLOSE needs exactly 0.5");
  const even = structuredClone(g); Object.assign(even.elo, { state: "TOO_CLOSE", favoured: null }); Object.assign(even.elo.winProbability, { home: 0.5, away: 0.5 });
  assert.equal(W.eloWinProbabilityText(W.eloWinProbabilityOf(even, { enabled: true })), `${W.ELO_WIN_PROBABILITY_LABEL}: ${g.away.abbr} 50% · ${g.home.abbr} 50%`);
});

test("text: separately identified, whole percents that read as 100; extremes never print 0 % or 100 %", () => {
  const g = (home, away) => ({ providerEventId: "1", frozenAt: "t", receipt: { payloadSha256: "s" }, home: { abbr: "BOS" }, away: { abbr: "NY" },
    elo: { state: "FAVOURED", favoured: home > 0.5 ? "BOS" : "NY", rule: "nba-winner-side@1", winProbability: { home, away, provenance: { source: W.ELO_WIN_PROBABILITY_SOURCE, rule: "nba-winner-side@1", frozenAt: "t", receiptPayloadSha256: "s" } } } });
  assert.equal(W.eloWinProbabilityText(W.eloWinProbabilityOf(g(0.6337, 0.3663), { enabled: true })), "Elo rating’s game-winner probability: NY 37% · BOS 63%");
  assert.equal(W.eloWinProbabilityText(W.eloWinProbabilityOf(g(0.635, 0.365), { enabled: true })), "Elo rating’s game-winner probability: NY 36% · BOS 64%", "the pair always sums to 100");
  assert.equal(W.eloWinProbabilityText(W.eloWinProbabilityOf(g(0.9962, 0.0038), { enabled: true })), "Elo rating’s game-winner probability: NY <1% · BOS >99%");
  assert.doesNotMatch(W.ELO_WIN_PROBABILITY_LABEL, /official|win chance/i, "never called the official win chance");
});

test("disclosure: accuracy not established, with the graded count and the preregistered minimum (§6, not a display constant)", () => {
  const finals = { finals: [
    { providerEventId: "a", phase: "REGULAR", winnerSide: "home" }, { providerEventId: "b", phase: "REGULAR", winnerSide: "away" },
    { providerEventId: "c", phase: "PRESEASON", winnerSide: "home" }, { providerEventId: "d", phase: "REGULAR", winnerSide: null },
  ] };
  const lanes = [{ games: [{ providerEventId: "a", elo: { state: "FAVOURED" } }, { providerEventId: "c", elo: { state: "FAVOURED" } }] },
    { games: [{ providerEventId: "a", elo: { state: "FAVOURED" } }, { providerEventId: "b", elo: { state: "FAVOURED" } }, { providerEventId: "d", elo: { state: "FAVOURED" } }, { providerEventId: "e", elo: { state: "FAVOURED" } }] }];
  assert.equal(eloGradedCount(lanes, finals), 2, "regular season, a recorded final, counted once");
  assert.equal(eloGradedCount([], null), 0);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "elo-ctx-"));
  fs.mkdirSync(path.join(tmp, "public/data/nba/experimental-public"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "public/data/nba/results"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "public/data/nba/experimental-public/2030-01-01.json"), JSON.stringify({ date: "2030-01-01", ...lanes[1] }));
  fs.writeFileSync(path.join(tmp, "public/data/nba/experimental-public/2030-01-02.json"), JSON.stringify({ date: "2030-01-09", ...lanes[0] })); // names another date → ignored
  fs.writeFileSync(path.join(tmp, "public/data/nba/results/finals-2026-27.json"), JSON.stringify(finals));
  const ctx = loadEloWinProbabilityContext({ appDir: tmp, enabled: true });
  assert.equal(ctx.graded, 2); assert.equal(ctx.minN, PREREG.winner.minN);
  assert.equal(ctx.disclosure, W.eloAccuracyDisclosure({ graded: 2, minN: 300 }));
  assert.match(ctx.disclosure, /^Model Performance: the Elo rating’s game-outcome accuracy is not yet established — 2 regular-season games graded so far; the preregistration requires 300 before any accuracy claim\./);
  assert.equal(loadEloWinProbabilityContext({ appDir: tmp, enabled: false }).enabled, false);
});

/** Every Elo element on a rendered surface: id → { home, text }. */
function eloOn(html) {
  const out = new Map();
  for (const m of html.matchAll(/data-nba-elo-wp="(\d+):([0-9.]+)"[^>]*>([^<]+)</g)) {
    assert.ok(!out.has(m[1]), `one Elo element per game per surface (${m[1]})`);
    out.set(m[1], { home: Number(m[2]), text: m[3] });
  }
  return out;
}

test("ONE accessor: the hub card, the Theater Official Forecast panel, the current + dated boards and Level A print the identical value", () => {
  const on = JSON.parse(JSON.stringify(build(true)));
  const surfaces = {};
  surfaces.hub = eloOn(renderToStaticMarkup(React.createElement(Lane, { snapshot: on, eloCtx: ON })));
  surfaces.board = eloOn(renderToStaticMarkup(React.createElement(Board, { lane: on, role: "current", date: DATE, eloCtx: ON })));
  surfaces.datedBoard = eloOn(renderToStaticMarkup(React.createElement(Board, { lane: on, role: "past", date: DATE, dated: true, eloCtx: ON })));
  // The Theater page as Production builds it (public-loader.mjs): the official panel EMBEDDED in the frozen stored run.
  const theater = new Map();
  const stored = readPossessionArtifact(REPO, DATE);
  for (const g of on.games) {
    const v = validatedGame(stored, g.providerEventId);
    assert.ok(v.ok, `${g.providerEventId}: ${v.reason ?? ""}`);
    const payload = buildPlaybackPayload(v.game, v.game.official.panel);
    const h = renderToStaticMarkup(React.createElement(Official, { official: payload.official, teams: payload.teams, lane: g, finalNote: null, resultsHref: "/r", eloCtx: ON }));
    for (const [k, v] of eloOn(h)) theater.set(k, v);
    assert.match(h, /<dt>Withheld<\/dt><dd>Team scores, margin and total, player ranges, prices/, "only the win chance leaves the Withheld line");
    assert.ok(h.includes(ON.disclosure.replace(/'/g, "&#x27;")), "the disclosure sits beside the number");
  }
  surfaces.theater = theater;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "elo-levela-"));
  fs.mkdirSync(path.join(tmp, "app/public/data/nba/experimental-public"), { recursive: true });
  fs.writeFileSync(path.join(tmp, `app/public/data/nba/experimental-public/${DATE}.json`), JSON.stringify(on));
  const sels = nbaSelections({ repoRoot: tmp, date: DATE, eloCtx: ON }).selections;
  for (const s of sels) assert.equal(s.probability, null, "display only: Level A never tiers on it");
  const model = levelASuggestions({ selections: sels, now: "2026-10-23T12:00:00Z", productDay: DATE });
  assert.equal(model.untiered.length, on.games.length);
  for (const l of model.untiered) { assert.equal(l.tierable, false); assert.match(l.probabilityNote, /shown for information only and does not tier this leg/); }
  const lvl = renderToStaticMarkup(React.createElement(LevelASuggestions, { model: { ...model, refusedByReason: {}, nbaProjections: [] }, mode: "parlay-lab" }));
  surfaces.levelA = eloOn(lvl);
  assert.ok(lvl.includes(ON.disclosure));
  // WEIGHT (built 15-game page, 2026-10-23): once per list, never once per leg (+16.7 KB → +5.7 KB)
  assert.equal((lvl.match(/data-nba-elo-wp-disclosure/g) ?? []).length, 1, "the disclosure prints once on Level A");
  for (const [name, m] of Object.entries(surfaces)) {
    assert.equal(m.size, on.games.length, `${name}: every game shows it`);
    for (const g of on.games) {
      const v = W.eloWinProbabilityOf(g, { enabled: true });
      assert.deepEqual(m.get(g.providerEventId), { home: receiptOf(g.providerEventId).forecast.elo.pHome, text: W.eloWinProbabilityText(v) }, `${name} ${g.providerEventId}`);
    }
  }
});

test("OFF (and a slate without the field): no surface prints a percentage or an Elo element, exactly as before", () => {
  const OFF = { enabled: false, disclosure: "" };
  const on = JSON.parse(JSON.stringify(build(true)));
  for (const lane of [COMMITTED, on]) {
    for (const ctx of lane === COMMITTED ? [ON, OFF] : [OFF]) {
      const html = renderToStaticMarkup(React.createElement(Lane, { snapshot: lane, eloCtx: ctx })) + renderToStaticMarkup(React.createElement(Board, { lane, role: "current", date: DATE, eloCtx: ctx }));
      assert.doesNotMatch(html, /data-nba-elo-wp/);
      assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /\d+(\.\d+)?\s?%/, "no percentage");
    }
  }
});

test("every surface reads the shared accessor (no surface formats its own copy)", () => {
  const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
  for (const f of ["src/components/nba/experimental-lane.tsx", "src/components/nba/projections-view.tsx", "src/components/nba/official-predictions.tsx"]) assert.match(read(f), /<EloWinProbability /, f);
  assert.match(read("src/lib/products/level-a/sources.mjs"), /eloWinProbabilityOf\(g, \{ enabled: elo\.enabled \}\)[\s\S]*eloWinProbabilityText\(wp\)/);
  for (const f of ["src/app/nba/projections/page.tsx", "src/app/nba/projections/[date]/page.tsx"]) assert.match(read(f), /eloCtx=\{loadEloWinProbabilityContext\(\)\}/, f);
  for (const f of ["src/components/nba/elo-win-probability.tsx", "src/lib/sports/nba/elo-win-probability.mjs"]) assert.doesNotMatch(read(f), /^"use client"/m, `${f} stays server-side`);
});
