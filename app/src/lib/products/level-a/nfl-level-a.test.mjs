/**
 * LEVEL A · THE NFL PATH, WITH THE REGISTRY AXIS CLOSED. Run: npx tsx --test src/lib/products/level-a/nfl-level-a.test.mjs
 *
 * The axis stays CLOSED in the registry. A test reaches the open path only by injecting `suggestionCapabilityOf`; the last test
 * fails if any production caller does the same.
 *
 * __fixtures__/nfl-chi-sea-2026-11-02 pins the committed inputs of that day, so the suite cannot go red when the slate
 * rolls: forecasts/latest.json is byte-for-byte the file committed at 2026-11-02T01:21Z; the player board keeps only the
 * identity fields the official snapshot checks (a game-winner leg reads no player); frozen-latest is empty. Finals and
 * legs marked FIXTURE are test inputs. Everything else reads committed data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { modelSuggestionOf, canEnterModelSuggestions } from "../../sport-capability-registry.ts";
import { levelALeg, levelASuggestions, cardCopyText, productDayOf } from "./suggestions.mjs";
import { levelASources, nflSelections } from "./sources.mjs";
import { buildLevelAModel } from "./model.mjs";
import { recordEntries } from "./record.mjs";
import { gradeLevelALeg, gradeRecord } from "./grade.mjs";
import { slipLegOf } from "./slip-legs.mjs";
import { committedFinals } from "../../../../scripts/products/grade-level-a-suggestions.mjs";
import { loadForecastView, loadForecastViews, loadOfficialGames } from "../../sports/nfl/forecast-view-load.mjs";
import GameHeroModule from "../../../components/nfl/forecast/game-hero.tsx";

const GameHero = GameHeroModule.default ?? GameHeroModule; // tsx hands a .tsx default export over as a CJS namespace
globalThis.React = React; // tsx compiles the component with the classic JSX transform
const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const FIXTURE_ROOT = path.join(APP, "src/lib/products/level-a/__fixtures__/nfl-chi-sea-2026-11-02");
const FIXTURE_PUBLIC = path.join(FIXTURE_ROOT, "app/public");
const LIVE_REL = "data/nfl/forecasts/latest.json";
const EVENT = "401873036";
const DAY = "2026-11-02";
const BEFORE = "2026-11-02T18:00:00.000Z"; // 13:00 ET, about seven hours before the 20:15 ET kickoff
const KICKOFF = "2026-11-03T01:15Z";

/** The ONLY open path in this repo: the axis injected as OPEN, in this file. */
const NFL_OPEN = (sport) => (sport === "nfl" ? { key: "nfl", state: "OPEN", forecastOwner: "test injection", markets: ["winner"], probabilityPublished: true, reason: "test injection" } : modelSuggestionOf(sport));

const rawForecast = () => JSON.parse(fs.readFileSync(path.join(FIXTURE_PUBLIC, LIVE_REL), "utf8")).forecasts[0];
const fixtureLeg = (now = BEFORE) => {
  const [sel] = nflSelections({ repoRoot: FIXTURE_ROOT, date: DAY });
  return levelALeg(sel, { now, productDay: DAY, suggestionCapabilityOf: NFL_OPEN });
};

/** A throwaway repo root holding the fixture with one forecast edit (`mutate(forecast, publicDir)`). */
function mutatedRoot(mutate) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nfl-level-a-"));
  fs.cpSync(FIXTURE_ROOT, root, { recursive: true });
  const file = path.join(root, "app/public", LIVE_REL);
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  mutate(doc.forecasts[0], path.join(root, "app/public"));
  fs.writeFileSync(file, JSON.stringify(doc));
  return root;
}
const refusalsWith = (mutate) => {
  const [sel] = nflSelections({ repoRoot: mutatedRoot(mutate), date: DAY });
  const r = levelALeg(sel, { now: BEFORE, productDay: DAY, suggestionCapabilityOf: NFL_OPEN });
  return r.ok ? [] : r.refusal.reasons;
};

test("the registry axis stays CLOSED, exactly as it was", () => {
  assert.equal(canEnterModelSuggestions("nfl"), false);
  assert.deepEqual(modelSuggestionOf("nfl"), {
    key: "nfl", state: "CLOSED", forecastOwner: null, markets: [], probabilityPublished: false,
    reason: "No reader for the NFL official game forecast has been reviewed for Level A yet; NFL stays out until one is.",
  });
});

test("the pinned forecast is the committed record: SEA home 65.66%, frozen 2026-11-02T00:05:54Z", () => {
  const f = rawForecast();
  assert.equal(f.matchup, "CHI @ SEA");
  assert.equal(f.kickoffUtc, KICKOFF);
  assert.equal(f.forecastSummary.winProbability.home, 0.6566);
  assert.equal(f.sideDecision.publishedSide, "HOME");
  assert.equal(f.sideDecision.frozenAt, "2026-11-02T00:05:54Z");
  /* The write-once receipt behind that stamp: same inputs, same number, same side. The 01:21Z window republished it. */
  const receipt = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/nfl/forecast-receipts/2026-11-02/401873036.json"), "utf8"));
  assert.equal(receipt.generatedAt, "2026-11-02T00:05:54Z");
  assert.equal(receipt.model.inputHash, f.model.inputHash);
  assert.equal(receipt.forecastSummary.winProbability.home, f.forecastSummary.winProbability.home);
  assert.equal(receipt.sideDecision.publishedSide, "HOME");
});

test("CLOSED: zero NFL legs reach any public output, even with the forecast on disk and a selection handed in", () => {
  assert.deepEqual(levelASources({ repoRoot: FIXTURE_ROOT, date: DAY }).selections.filter((s) => s.sport === "nfl"), [], "a closed axis never reads the forecast");
  const handed = nflSelections({ repoRoot: FIXTURE_ROOT, date: DAY });
  assert.equal(handed.length, 1, "the reader itself works, so the zero above is the gate and not an empty slate");

  const answer = levelASuggestions({ selections: handed, now: BEFORE, productDay: DAY });
  assert.deepEqual(answer.legs, []);
  assert.deepEqual(answer.refused.map((r) => [r.eventId, r.reasons]), [[EVENT, ["SPORT_CLOSED"]]]);

  const model = buildLevelAModel({ repoRoot: FIXTURE_ROOT, now: BEFORE, productDay: DAY, sources: { selections: handed, nbaProjections: [] }, mixed: { enabled: true }, nbaGameWinners: { enabled: false } });
  assert.equal(model.legs.some((l) => l.sport === "nfl"), false);
  const cards = [...model.parlayLab.map((t) => t.card), model.bankBuilder.card, model.moonshot.card].filter(Boolean);
  assert.equal(cards.flatMap((c) => c.legs).some((l) => l.sport === "nfl"), false);
  assert.equal(model.untiered.some((l) => l.sport === "nfl"), false);
  assert.deepEqual(recordEntries(model, { recordedAt: BEFORE }), [], "nothing to record");
  assert.equal(JSON.stringify({ legs: model.legs, cards, untiered: model.untiered }).includes(EVENT), false);

  const unfiltered = buildLevelAModel({ repoRoot: FIXTURE_ROOT, now: BEFORE, productDay: DAY });
  assert.equal(JSON.stringify(unfiltered).includes(EVENT), false, "no refusal row either: the closed axis reads nothing");
});

test("OPEN (injected): today's CHI @ SEA forecast is one correct leg, unpriced", () => {
  const sources = levelASources({ repoRoot: FIXTURE_ROOT, date: DAY, suggestionCapabilityOf: NFL_OPEN }).selections.filter((s) => s.sport === "nfl");
  assert.equal(sources.length, 1);
  const r = fixtureLeg();
  assert.equal(r.ok, true, JSON.stringify(r.refusal));
  const { leg } = r;
  assert.equal(productDayOf(leg.startUtc), DAY, "20:15 ET on the product day, though the UTC date is the 3rd");
  assert.deepEqual(
    { sport: leg.sport, eventId: leg.eventId, eventLabel: leg.eventLabel, market: leg.market, startUtc: leg.startUtc, selection: leg.selection, probability: leg.probability, tierable: leg.tierable, priced: leg.priced, price: leg.price },
    { sport: "nfl", eventId: EVENT, eventLabel: "CHI @ SEA", market: "winner", startUtc: KICKOFF, selection: { code: "home", label: "Seattle Seahawks to win" }, probability: 0.6566, tierable: true, priced: false, price: null },
  );
  assert.equal(leg.forecast.stampedAt, "2026-11-02T00:05:54.000Z");
  assert.equal(leg.forecast.modelId, "nfl-regular-season-public-v1@v2");
  assert.match(leg.forecast.ref, /^nfl-official-snapshot:[0-9a-f]{64}$/);
  assert.deepEqual(leg.settlement, { grader: "nfl-settlement-contract", market: "moneyline", side: "home" });
  assert.equal(JSON.stringify(leg).includes("marketComparison"), false);
});

test("a started game produces no leg; nor does one inside the cutoff or on another product day", () => {
  assert.deepEqual(fixtureLeg("2026-11-03T01:16:00.000Z").refusal.reasons, ["EVENT_STARTED"]);
  assert.deepEqual(fixtureLeg("2026-11-03T00:50:00.000Z").refusal.reasons, ["INSIDE_CUTOFF"]);
  assert.equal(fixtureLeg("2026-11-03T00:44:59.000Z").ok, true, "more than 30 minutes out");
  assert.deepEqual(nflSelections({ repoRoot: FIXTURE_ROOT, date: "2026-11-03" }), [], "the ET date, not the UTC date");
  const answer = levelASuggestions({ selections: nflSelections({ repoRoot: FIXTURE_ROOT, date: DAY }), now: "2026-11-03T01:16:00.000Z", productDay: DAY, suggestionCapabilityOf: NFL_OPEN });
  assert.deepEqual([answer.legs.length, answer.refused[0].reasons], [0, ["EVENT_STARTED"]]);
});

test("BYTE FOR BYTE: the leg's probability is the value the game page publishes", () => {
  const { leg } = fixtureLeg();
  const view = loadForecastView(FIXTURE_PUBLIC, EVENT);
  const text = fs.readFileSync(path.join(FIXTURE_PUBLIC, LIVE_REL), "utf8");
  const published = /"winProbability":\s*\{\s*"home":\s*([0-9.]+),/.exec(text)[1];
  assert.equal(published, "0.6566");
  assert.equal(JSON.stringify(leg.probability), published, "the committed bytes");
  assert.equal(JSON.stringify(leg.probability), JSON.stringify(view.record.winProbability.home), "the page's view");
  assert.notEqual(leg.probability, rawForecast().forecastSummary.winProbability.homeUnrounded, "not the unrounded number, which no page prints");

  const hero = renderToStaticMarkup(createElement(GameHero, { away: view.away, home: view.home, kickoffLabel: "Mon", venue: view.venue, record: view.record, started: false }));
  assert.ok(hero.includes("65.7% to win"), "the hero's printed number");
  assert.ok(cardCopyText({ tierLabel: "Low", legs: [leg] }).includes("model 65.7%"), "the card's printed number");
  assert.equal(slipLegOf(leg).estimate.text, "Official Forecast 65.7%", "the slip's printed number");
});

test("on committed data, every game's leg input equals its game page, whatever the slate is", () => {
  const publicDir = path.join(APP, "public");
  const games = loadOfficialGames(publicDir);
  assert.deepEqual(games.map((g) => g.view), loadForecastViews(publicDir), "one path to the views");
  const days = [...new Set(games.map((g) => productDayOf(g.view.kickoffUtc)))];
  const rows = days.flatMap((date) => nflSelections({ repoRoot: REPO, date }));
  assert.equal(rows.length, games.length);
  for (const s of rows) {
    const { view, snapshot } = games.find((g) => g.view.providerEventId === s.eventId);
    if (s.selection) assert.equal(s.probability, view.record.winProbability[s.selection.code], s.eventId);
    if (s.selection) assert.equal(`${s.selection.code}`.toUpperCase(), snapshot.game.winner.side, s.eventId);
    assert.equal(s.market, "winner");
    /* Kicked off or not, the clock decides: one instant past each game's own start, no leg. */
    const after = new Date(Date.parse(s.startUtc) + 1000).toISOString();
    assert.equal(levelALeg(s, { now: after, productDay: productDayOf(s.startUtc), suggestionCapabilityOf: NFL_OPEN }).ok, false, s.eventId);
  }
});

test("what-if and market numbers never feed a leg", () => {
  const before = fixtureLeg().leg;
  const root = mutatedRoot((f, publicDir) => {
    f.marketComparison = { state: "MARKET", marketHomeWinPct: 0.12, note: "FIXTURE" };
    fs.mkdirSync(path.join(publicDir, "data/nfl/world-model-v2"));
    fs.writeFileSync(path.join(publicDir, "data/nfl/world-model-v2", `${EVENT}.json`), JSON.stringify({
      artifact: "nfl-world-model-v2-simulation", simulationId: "FIXTURE", identity: { providerEventId: EVENT, kickoffUtc: KICKOFF },
      model: { id: "nfl-world-model-v2", version: "FIXTURE" }, run: { runs: 10000, generatedAt: "2026-11-02T00:00:00Z", inputs: {} }, diagnostics: { invariantViolations: 0, teamWorldsChecked: 0 },
      game: { winProbability: { home: 0.11, away: 0.88, tie: 0.01 }, overtime: {}, margin: {}, total: {}, away: {}, home: {} }, sampledWorlds: [], availability: {}, unsupported: [], limitations: [],
    }));
  });
  const [sel] = nflSelections({ repoRoot: root, date: DAY });
  const { leg } = levelALeg(sel, { now: BEFORE, productDay: DAY, suggestionCapabilityOf: NFL_OPEN });
  assert.equal(leg.probability, before.probability);
  assert.deepEqual(leg.selection, before.selection);

  const src = fs.readFileSync(path.join(APP, "src/lib/products/level-a/sources.mjs"), "utf8");
  const reader = src.slice(src.indexOf("function nflSourceStatus"), src.indexOf("/** Every OPEN sport's"));
  assert.doesNotMatch(reader, /world-?model|theater|whatIf|what-if|simulation|marketComparison|odds/i);
});

test("gates: a forecast that is not ready, not frozen, or names no side is refused with a reason", () => {
  assert.deepEqual(refusalsWith((f) => { f.sideDecision.publishedSide = "TOO_CLOSE"; }), ["NO_SELECTION", "BAD_PROBABILITY"]);
  assert.ok(refusalsWith((f) => { delete f.sideDecision; }).includes("NO_SELECTION"), "a forward forecast with no frozen side has none");
  assert.deepEqual(refusalsWith((f) => { f.teamInputs = { state: "BLIND_TO_STARTING_QB_ABSENCE", absences: [{ name: "FIXTURE", team: "SEA", status: "Out" }] }; }), ["UNAVAILABLE", "SOURCE_NOT_READY"]);
  assert.deepEqual(refusalsWith((f) => { f.teamInputs.state = "UNKNOWN"; }), ["SOURCE_UNAVAILABLE"]);
  assert.deepEqual(refusalsWith((f) => { delete f.teamInputs; }), ["SOURCE_UNAVAILABLE"]);
  assert.deepEqual(refusalsWith((f) => { f.teamSignal.state = "NOT_SIGNIFICANT"; }), ["SOURCE_UNAVAILABLE"]);
  assert.ok(refusalsWith((f) => { f.forecastSummary.winProbability.home = 1; }).includes("BAD_PROBABILITY"));
  assert.ok(refusalsWith((f) => { f.forecastSummary.winProbability.home = null; }).includes("BAD_PROBABILITY"));
  assert.ok(refusalsWith((f) => { f.sideDecision.frozenAt = "2026-11-03T02:00:00Z"; }).includes("FORECAST_NOT_FROZEN"), "stamped after the start");
  /* No pre-kickoff record: the official snapshot refuses, and the leg with it. */
  const late = refusalsWith((f) => { f.generatedAt = "2026-11-03T02:00:00Z"; });
  assert.ok(late.includes("SOURCE_UNAVAILABLE") && late.includes("FORECAST_NOT_FROZEN"), late.join());
  const noBoard = mutatedRoot((_f, publicDir) => fs.rmSync(path.join(publicDir, "data/nfl/player-board", `${EVENT}.json`)));
  const [sel] = nflSelections({ repoRoot: noBoard, date: DAY });
  assert.equal(sel.sourceStatus, "official-snapshot-refused");
});

test("OPEN (injected): NFL keeps a mixed card alive beside one other sport, and its tier comes from the existing bands", () => {
  const nfl = nflSelections({ repoRoot: FIXTURE_ROOT, date: DAY });
  /* FIXTURE second sport, as on a day when the Premier League has finished and only one other sport has a leg. */
  const other = { sport: "mlb", eventId: "fixture-1", eventLabel: "AAA @ BBB", startUtc: "2026-11-02T23:00:00Z", market: "winner", selection: { code: "home", label: "BBB to win" }, probability: 0.6, sourceStatus: "ready", forecast: { owner: "FIXTURE", modelId: "FIXTURE", stampedAt: "2026-11-02T12:00:00Z", ref: null }, uncertainty: null, participantStatuses: [], settlement: { grader: "mlb-official-final", market: "moneyline", side: "home" } };
  const args = { repoRoot: FIXTURE_ROOT, now: BEFORE, productDay: DAY, mixed: { enabled: true }, nbaGameWinners: { enabled: false } };
  const closed = buildLevelAModel({ ...args, sources: { selections: [other, ...nfl], nbaProjections: [] } });
  assert.equal(closed.bankBuilder.card, null, "one sport: no mixed card");
  const open = buildLevelAModel({ ...args, sources: { selections: [other, ...nfl], nbaProjections: [] }, suggestionCapabilityOf: NFL_OPEN });
  const card = open.bankBuilder.card;
  assert.deepEqual(card.sports, ["mlb", "nfl"]);
  assert.equal(card.tier, "medium", "0.6 × 0.6566 = 39.4% is the existing Medium band");
  assert.equal(card.jointProbability, 0.6 * 0.6566);
  assert.match(card.whySelected, /MLB, NFL/);
  assert.deepEqual([card.priced, card.price, card.payout], [false, null, null]);
  const entries = recordEntries(open, { recordedAt: BEFORE });
  assert.ok(entries.length > 0);
  assert.equal(entries.find((e) => e.legs.some((l) => l.sport === "nfl")).legs.find((l) => l.sport === "nfl").probability, 0.6566);
});

const nflLeg = (code) => ({ sport: "nfl", eventId: EVENT, market: "winner", selection: { code, label: code }, startUtc: KICKOFF });
const finalOf = (homePointsFT, awayPointsFT, status = "STATUS_FINAL") => ({ nfl: () => ({ status, homePointsFT, awayPointsFT }) }); // FIXTURE finals

test("GRADER: the NFL settlement contract grades; a tie voids; nothing unfinished is a loss", () => {
  assert.equal(gradeLevelALeg(nflLeg("home"), finalOf(27, 20)).result, "win");
  assert.equal(gradeLevelALeg(nflLeg("away"), finalOf(27, 20)).result, "loss");
  assert.equal(gradeLevelALeg(nflLeg("home"), finalOf(20, 27)).result, "loss");
  const tie = gradeLevelALeg(nflLeg("home"), finalOf(20, 20));
  assert.deepEqual([tie.result, tie.grader], ["void", "nfl-moneyline"]);
  assert.equal(gradeLevelALeg(nflLeg("home"), finalOf(20, 20, "STATUS_FINAL_OVERTIME")).result, "void", "a tie after overtime");
  assert.equal(gradeLevelALeg(nflLeg("home"), finalOf(27, 20, "STATUS_IN_PROGRESS")).result, "pending");
  assert.equal(gradeLevelALeg(nflLeg("home"), finalOf(0, 0, "STATUS_POSTPONED")).result, "pending");
  assert.equal(gradeLevelALeg(nflLeg("home"), finalOf(null, null)).result, "pending", "quarantined");
  assert.equal(gradeLevelALeg(nflLeg("home"), { nfl: () => null }).result, "pending", "no final");
  assert.equal(gradeLevelALeg(nflLeg("home"), {}).result, "pending", "no reader");
  assert.equal(gradeLevelALeg(nflLeg("home"), { nfl: () => { throw new Error("io"); } }).result, "pending");
  assert.equal(gradeLevelALeg({ ...nflLeg("home"), market: "1x2" }, finalOf(27, 20)).result, "pending", "an unknown market");
});

test("GRADER: a card with a tied NFL leg is VOID unless another leg lost; pending writes no row", () => {
  const other = { sport: "mlb", eventId: "m1", market: "winner", selection: { code: "home", label: "home" }, startUtc: "2026-11-02T23:00:00Z" };
  const entry = (id, legs) => ({ schema: "gtp.level-a.suggestion@1", id, productDay: DAY, policy: "level-a-mixed@1/bank-builder", tier: "medium", jointProbability: 0.39, legs });
  const record = [entry("a", [other, nflLeg("home")])];
  const mlbWon = { mlb: () => ({ homeRuns: 3, awayRuns: 1, isFinal: true }) }, mlbLost = { mlb: () => ({ homeRuns: 1, awayRuns: 3, isFinal: true }) }; // FIXTURE finals
  assert.deepEqual(gradeRecord({ record, finals: { ...mlbWon, ...finalOf(20, 20) }, gradedAt: BEFORE }).rows.map((r) => r.result), ["void"]);
  assert.deepEqual(gradeRecord({ record, finals: { ...mlbLost, ...finalOf(20, 20) }, gradedAt: BEFORE }).rows.map((r) => r.result), ["loss"]);
  const waiting = gradeRecord({ record, finals: { ...mlbWon, nfl: () => null }, gradedAt: BEFORE });
  assert.deepEqual([waiting.rows.length, waiting.pending], [0, 1]);
  const won = gradeRecord({ record, finals: { ...mlbWon, ...finalOf(27, 20) }, gradedAt: BEFORE }).rows[0];
  assert.deepEqual([won.result, won.priced, won.payout], ["win", false, null]);
});

test("committedFinals: NFL finals come through the results adapter, with schedule lineage", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nfl-level-a-finals-"));
  const data = path.join(root, "app/public/data/nfl");
  fs.mkdirSync(path.join(data, "results"), { recursive: true });
  fs.mkdirSync(path.join(data, "schedule"), { recursive: true });
  const nowIso = "2026-11-01T16:00:00Z";
  /* 401873010 is the committed NE @ CHI final, 30-24; 999 has no schedule row, so it must not settle. */
  fs.writeFileSync(path.join(data, "results/latest.json"), JSON.stringify({ sourceAsOf: nowIso, rows: [
    { providerEventId: "401873010", statusRaw: "STATUS_FINAL", ftHome: 30, ftAway: 24 },
    { providerEventId: "999", statusRaw: "STATUS_FINAL", ftHome: 7, ftAway: 3 },
  ] }));
  fs.writeFileSync(path.join(data, "schedule/latest.json"), JSON.stringify({ rows: [{ providerEventId: "401873010", home: { abbr: "CHI" }, away: { abbr: "NE" } }] }));
  const finals = committedFinals({ repoRoot: root, nowIso });
  assert.deepEqual(finals.nfl("401873010"), { status: "STATUS_FINAL", homePointsFT: 30, awayPointsFT: 24 });
  assert.equal(finals.nfl("999"), null, "a result without schedule lineage settles nothing");
  assert.equal(finals.nfl("401873036"), null);
  assert.equal(gradeLevelALeg({ ...nflLeg("home"), eventId: "401873010" }, finals).result, "win");

  /* Committed data: every final the capture holds reads the same through the grader's path. */
  const real = committedFinals({ repoRoot: REPO, nowIso });
  const committed = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/results/latest.json"), "utf8"));
  for (const r of committed.rows.filter((x) => /^STATUS_FINAL/.test(x.statusRaw) && Number.isInteger(x.ftHome) && Number.isInteger(x.ftAway))) {
    assert.deepEqual(real.nfl(r.providerEventId), { status: r.statusRaw, homePointsFT: r.ftHome, awayPointsFT: r.ftAway }, r.providerEventId);
  }
  assert.equal(real.nfl(EVENT), null, "CHI @ SEA has not been played on this data: pending, not graded");
});

test("no production caller injects a capability: only this test opens NFL", () => {
  const FORWARDERS = new Set(["src/lib/products/level-a/suggestions.mjs", "src/lib/products/level-a/sources.mjs", "src/lib/products/level-a/model.mjs"]);
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(APP, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "__fixtures__") walk(rel); continue; }
      if (!/\.(mjs|ts|tsx)$/.test(e.name) || /\.test\.mjs$/.test(e.name)) continue;
      if (fs.readFileSync(path.join(APP, rel), "utf8").includes("suggestionCapabilityOf")) hits.push(rel);
    }
  };
  walk("src"); walk("scripts");
  assert.deepEqual(hits.filter((f) => !FORWARDERS.has(f)), []);
  /* The forwarders' public entry point takes the registry default. */
  const model = fs.readFileSync(path.join(APP, "src/lib/products/level-a/model.mjs"), "utf8");
  assert.match(model, /buildLevelAModel\(\{ now: buildAsOfIso\(\) \}\)/);
});
