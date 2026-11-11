/**
 * NBA POST-FREEZE AVAILABILITY (founder directive 2026-11-11). Fixture: Bennedict Mathurin, BKN @ NO (401909972),
 * projected in the lane frozen 08:23Z, ruled Out on the 16:32Z capture (stated 16:29Z). The page keeps his projection
 * as recorded, demotes it below every active row and says why; the frozen lane file is never edited.
 *
 * Run (from app/): npx tsx --test src/lib/sports/nba/post-freeze-availability.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { postFreezeAvailability, postFreezeOutFor, postFreezeNote, POST_FREEZE_AVAILABILITY_SCHEMA, POST_FREEZE_REL } = await import("./post-freeze-availability.mjs");
const { default: NbaOfficialPredictions } = await import("../../../components/nba/official-predictions.tsx");
const { default: SettledSimulation } = await import("../../../components/nba/settled-simulation.tsx");
const { loadPostFreezeOut } = await import("../../../components/nba/post-freeze-availability-data.ts");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const DATE = "2026-11-11";
const GAME = "401909972";
const MATHURIN = "4683634";
const LANE_REL = `app/public/data/nba/experimental-public/${DATE}.json`;
const lane = JSON.parse(read(LANE_REL));
const capture = JSON.parse(fs.readFileSync(path.join(APP, "src/lib/sports/nba/__fixtures__/nba-injuries-2026-11-11T1632Z.json"), "utf8"));
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

test("derivation: only a PROJECTED player ruled Out after the game froze; Out → Day-To-Day and pre-freeze Outs are not changes", () => {
  const f = postFreezeAvailability(lane, capture);
  assert.equal(f.schema, POST_FREEZE_AVAILABILITY_SCHEMA);
  assert.deepEqual(f.changes, [{ providerEventId: GAME, providerAthleteId: MATHURIN, name: "Bennedict Mathurin", side: "home", status: "Out", statedAt: "2026-11-11T16:29Z" }]);
  // Watford (Out 11-10, unavailable in the lane), Herro / Markkanen / George (Out → Day-To-Day, unavailable), Trey Murphy
  // III (projected, Day-To-Day): none is a change
  const pre = { ...capture, entries: capture.entries.map((e) => (e.athleteId === MATHURIN ? { ...e, statedAt: "2026-11-11T08:00Z" } : e)) };
  assert.deepEqual(postFreezeAvailability(lane, pre).changes, [], "an Out stated before the freeze is already in the frozen forecast");
  assert.ok(!Object.keys(f).some((k) => /generated|built|now/i.test(k)) && !JSON.stringify(f).match(/median|expectedMinutes|price|odds/i), "facts only, no wall clock");
});

test("the committed public file is what the script derives (no projection number, no price) and the frozen lane file is untouched", () => {
  const committed = JSON.parse(read(POST_FREEZE_REL(DATE)));
  // a later capture may add changes to the same day's file; the fixture's change is always among them
  for (const c of postFreezeAvailability(lane, capture).changes) assert.ok(committed.changes.some((x) => JSON.stringify(x) === JSON.stringify(c)), `${c.name} is in the committed file`);
  assert.ok(!/median|expectedMinutes|price|odds/i.test(read(POST_FREEZE_REL(DATE))), "facts only");
  assert.equal(committed.date, DATE);
  assert.equal(committed.lane.generatedAt, lane.generatedAt, "derived from the lane frozen at 08:23Z");
  const g = lane.games.find((x) => x.providerEventId === GAME);
  const row = g.players.home.find((p) => p.providerAthleteId === MATHURIN);
  assert.deepEqual([row.expectedMinutes, row.medians.pts, row.injuryStatus], [16.9, 8.4, null], "the frozen lane still holds the projection as recorded");
  assert.equal(g.receipt.payloadSha256, "04e35976bbe53247a877aff34571254339aaca379df4c79d04c65cf45d11e215", "the receipt the lane froze at 08:23Z");
});

test("note text: ET clock time of the injury report", () => {
  assert.equal(postFreezeNote("2026-11-11T16:29Z"), "Ruled out after this forecast froze (injury report 11:29 AM ET)");
  assert.equal(postFreezeNote(null), "Ruled out after this forecast froze");
  assert.equal(postFreezeOutFor({ schema: "x", changes: [] }, GAME).size, 0);
  assert.equal(postFreezeOutFor(JSON.parse(read(POST_FREEZE_REL(DATE))), GAME, "2026-11-12").size, 0, "another date's file is never applied");
});

const g = lane.games.find((x) => x.providerEventId === GAME);
const official = {
  snapshotId: "fixture", eventId: GAME, favouredSide: null, models: { game: null, players: [g.receipt.modelVersion] }, frozenAt: g.frozenAt, lockAt: g.tipUtc, withheld: {},
  players: ["away", "home"].flatMap((side) => g.players[side].map((p) => ({ playerId: p.providerAthleteId, team: side, displayName: p.name, medians: p.medians, expectedMinutes: p.expectedMinutes }))),
};
const teams = { away: { abbr: g.away.abbr, name: g.away.name }, home: { abbr: g.home.abbr, name: g.home.name } };
const eloCtx = { enabled: false, disclosure: "" };

test("game page Default view: Mathurin's projection stays as recorded, demoted below every active NO row, with the note", () => {
  const ruled = loadPostFreezeOut(DATE, GAME);
  assert.ok(ruled.has(MATHURIN), "the page reads the committed public file");
  const html = renderToStaticMarkup(React.createElement(NbaOfficialPredictions, { official, teams, lane: g, finalNote: null, resultsHref: "/results/nba/", eloCtx, postFreezeOut: ruled }));
  const table = html.split('data-nba-official-table="home"')[1].split("</table>")[0];
  const rows = table.split("<tr").slice(2); // header row, then body rows
  const projected = rows.filter((r) => !r.includes("data-nba-projection-unavailable"));
  assert.ok(projected.at(-1).includes(`data-nba-post-freeze-out="${MATHURIN}"`), "demoted: the last projected row");
  assert.equal(html.split("data-nba-post-freeze-out").length - 1, 1, "only Mathurin is marked");
  const t = text(projected.at(-1));
  assert.match(t, /Bennedict Mathurin Ruled out after this forecast froze \(injury report 11:29 AM ET\) 16\.9 8\.4 2\.9 1\.6 0\.6/, "numbers as recorded, beside the note");
  const before = renderToStaticMarkup(React.createElement(NbaOfficialPredictions, { official, teams, lane: g, finalNote: null, resultsHref: "/results/nba/", eloCtx }));
  assert.doesNotMatch(before, /Ruled out after/, "no file, no note (other games unchanged)");
  const away = renderToStaticMarkup(React.createElement(NbaOfficialPredictions, { official, teams, lane: g, finalNote: null, resultsHref: "/results/nba/", eloCtx, postFreezeOut: ruled })).split('data-nba-official-table="away"')[1].split("</table>")[0];
  assert.equal(away, before.split('data-nba-official-table="away"')[1].split("</table>")[0], "the other side's table is byte-identical");
});

test("settled page (same URL after the ET rollover) keeps the same note and order", () => {
  const html = renderToStaticMarkup(React.createElement(SettledSimulation, { view: { id: GAME, date: DATE, game: g, record: null } }));
  assert.equal(html.split("data-nba-post-freeze-out").length - 1, 1);
  assert.match(text(html), /Bennedict Mathurin Ruled out after this forecast froze \(injury report 11:29 AM ET\) 16\.9 8\.4/);
});
