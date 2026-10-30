/**
 * ONE TIMESTAMP PER FORECAST: ITS FREEZE TIME, IN ET (P0 · 2026-10-28).
 *
 * Production 10-28: settled NFL game pages printed "produced Oct 27, 3:59 PM ET" (the nfl/index.json rebuild for week 8)
 * beside "Forecast frozen at Oct 25, 8:36 AM ET"; EPL match pages printed the live set's "Generated Oct 26" on a Sep 6
 * match; the MNF story dated DAL @ PHI by the UTC day (2026-10-27) although it was played Mon Oct 26 ET. These tests
 * read COMMITTED data through the same functions the pages call, on both NFL read paths (archived revision and the
 * live union).
 *
 * Run: npx tsx --test src/lib/sports/nfl/forecast-time-of-record.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { archivedEventIds, archivedForecastFor } from "./archived-forecast.ts";
import { unionFrozenForecasts } from "./public-forecast-union.mjs";
import { nflPublicRecordResolver } from "./public-record.mjs";
import { buildNflPresentation, etDateOf } from "../../simulate/presentation/nfl.ts";
import { nflGameStoryInputs } from "../../simulate/presentation/nfl-game-story.ts";
import { isPresentable } from "../../simulate/presentation/types.ts";
import { eplForecastGeneratedAt, findEplForecastAnywhere, loadEplForecastArchive } from "../epl/forecast-view.ts";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const DATA = path.join(APP, "public", "data");
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")); } catch { return null; } };
const NOW = new Date().toISOString();
const INDEX_AT = readJson("nfl/index.json")?.generatedAt ?? null;
const atOrBefore = (a, b) => Date.parse(a) <= Date.parse(b);

/** What the game page shows as the forecast's time — every stamp it prints for the forecast — plus its story. */
function pageModel(eventId, nowIso = NOW) {
  const union = unionFrozenForecasts(readJson("nfl/forecasts/latest.json"), readJson("nfl/forecasts/frozen-latest.json"), { resolve: nflPublicRecordResolver(path.resolve(APP, "..")) });
  const live = (union?.forecasts ?? []).find((x) => x.providerEventId === eventId) ?? null;
  const archived = live ? null : archivedForecastFor(DATA, eventId);
  const f = live ?? archived?.forecast;
  const story = buildNflPresentation(...nflGameStoryInputs(eventId, f, archived, nowIso));
  return { f, archived, story };
}
function storyStamps(story) {
  if (!isPresentable(story)) return [];
  return [story.provenance.generatedAt, ...story.chapters.flatMap((c) => (c.rows ?? []).map((r) => r.detail))].filter(Boolean);
}

test("archive path, committed data: no settled NFL game page presents a forecast time later than kickoff", () => {
  const ids = archivedEventIds(DATA);
  assert.ok(ids.length >= 100, `only ${ids.length} archived games`);
  let stories = 0;
  for (const id of ids) {
    const { f, archived, story } = pageModel(id);
    /* The claim is the ARCHIVE path. An id with a dated archive copy whose game is still in the live union (week 8
       Sunday games after the 2026-10-30 00:38Z event window) renders the LIVE story, which by design carries the
       "Game index refreshed" row (presentation/nfl.ts) — that path is not this test's subject. */
    if (!archived) continue;
    assert.ok(f.generatedAt && atOrBefore(f.generatedAt, f.kickoffUtc), `${id}: forecast generatedAt ${f.generatedAt} after kickoff ${f.kickoffUtc}`);
    if (!isPresentable(story)) continue;
    stories += 1;
    assert.equal(story.provenance.generatedAt, f.generatedAt, `${id}: the story's "produced" is the forecast's own time`);
    assert.ok(atOrBefore(story.provenance.generatedAt, f.kickoffUtc), `${id}: story produced after kickoff`);
    for (const s of storyStamps(story)) assert.ok(!INDEX_AT || !String(s).includes(INDEX_AT), `${id}: the index rebuild stamp reaches the story`);
    assert.ok(!story.chapters.some((c) => (c.rows ?? []).some((r) => /index/i.test(r.label))), `${id}: a frozen story carries no index stamp`);
  }
  assert.ok(stories >= 100, `${stories} archived stories checked`);
});

test("live-union path, committed data: once a union game has kicked off its story's produced time is still its forecast's own, before kickoff", () => {
  const union = unionFrozenForecasts(readJson("nfl/forecasts/latest.json"), readJson("nfl/forecasts/frozen-latest.json"), { resolve: nflPublicRecordResolver(path.resolve(APP, "..")) });
  const forecasts = union?.forecasts ?? [];
  assert.ok(forecasts.length > 0, "the committed union carries this week");
  let checked = 0;
  for (const f0 of forecasts) {
    for (const nowIso of [new Date(Date.parse(f0.kickoffUtc) - 3600e3).toISOString(), new Date(Date.parse(f0.kickoffUtc) + 4 * 3600e3).toISOString()]) {
      const { f, archived, story } = pageModel(f0.providerEventId, nowIso);
      assert.equal(archived, null, "a union game is read from the union");
      assert.ok(atOrBefore(f.generatedAt, f.kickoffUtc), `${f.providerEventId}: forecast generatedAt after kickoff`);
      if (!isPresentable(story)) continue;
      assert.equal(story.provenance.generatedAt, f.generatedAt, `${f.providerEventId}: produced = the forecast's time, not the index's`);
      if (story.readiness === "archived") assert.ok(!story.chapters.some((c) => (c.rows ?? []).some((r) => /index/i.test(r.label))), "no index stamp in a started game's story");
      checked += 1;
    }
  }
  assert.ok(checked > 0, "at least one union story was built");
});

test("the MNF game (DAL @ PHI, Mon Oct 26 8:15 PM ET = 00:15Z Oct 27) is dated Oct 26 everywhere its story names a date", () => {
  const { f, story } = pageModel("401873009");
  assert.equal(f.kickoffUtc.slice(0, 10), "2026-10-27", "fixture: the UTC day is the next day");
  assert.ok(isPresentable(story), "the archived story renders");
  assert.equal(story.displayDate, "2026-10-26");
  const text = JSON.stringify(story.chapters);
  /* Overnight W8 (2026-10-28): the sentence names the ET day in words ("Mon, Oct 26"), not as an ISO key — the
     claim (the ET day, never the UTC day) is unchanged and now also refuses the UTC day in words. */
  assert.match(story.chapters[0].line, /Dallas Cowboys at Philadelphia Eagles, Mon, Oct 26\./);
  assert.doesNotMatch(text, /2026-10-27|Oct 27/, "the UTC day appears nowhere in the story");
  assert.equal(etDateOf(f.kickoffUtc), "2026-10-26");
});

test("EPL, committed data: every played match's forecast time is its own revision's, before kickoff (Arsenal v Chelsea: Sep 5, not Oct 26)", () => {
  const set = readJson("soccer/epl/forecasts/latest.json");
  let played = 0;
  for (const r of loadEplForecastArchive()) {
    const shown = findEplForecastAnywhere(r.slug);
    const at = eplForecastGeneratedAt(r.slug);
    assert.ok(at, `${r.slug}: no forecast time`);
    assert.ok(atOrBefore(at, shown.kickoffUtc), `${r.slug}: forecast time ${at} after kickoff ${shown.kickoffUtc}`);
    if (Date.parse(shown.kickoffUtc) < Date.parse(set.generatedAt)) {
      played += 1;
      assert.notEqual(at, set.generatedAt, `${r.slug}: a played match shows the live set's time`);
    }
  }
  assert.ok(played >= 50, `${played} played matches checked`);
  assert.equal(eplForecastGeneratedAt("arsenal-v-chelsea-2026-09-06"), "2026-09-05T22:29:47Z");
  assert.equal(eplForecastGeneratedAt("arsenal-v-coventry-city-2026-08-21"), "2026-08-20T23:21:41Z", "a recovered row keeps its recovery's forecast time");
});

test("source: the EPL match page prints the fixture's own forecast time, and the NFL methodology prints ET", () => {
  const epl = fs.readFileSync(path.join(APP, "src/app/epl/match/[slug]/page.tsx"), "utf8");
  assert.match(epl, /eplForecastGeneratedAt\(params\.slug\)/);
  assert.doesNotMatch(epl, /<EtTime iso=\{set\.generatedAt\}/, "the live set's stamp is not a fixture's forecast time");
  const md = fs.readFileSync(path.join(APP, "src/components/nfl/forecast/methodology.tsx"), "utf8");
  assert.doesNotMatch(md, /UTC`/, "methodology times are ET");
  const page = fs.readFileSync(path.join(APP, "src/app/nfl/game/[eventId]/page.tsx"), "utf8");
  assert.match(page, /buildNflPresentation\(\.\.\.nflGameStoryInputs\(params\.eventId, f, archived, storyNowIso\)\)/, "the page builds the story these tests build");
});
