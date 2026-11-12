/**
 * NBA POST-FREEZE AVAILABILITY (founder directive 2026-11-11). Fixture: Bennedict Mathurin, BKN @ NO (401909972),
 * projected in the lane frozen 08:23Z, ruled Out on the 16:32Z capture (stated 16:29Z). The page keeps his projection
 * as recorded, demotes it below every active row and says why; the frozen lane file is never edited.
 *
 * IMMUTABLE FIXTURE (founder-approved repair, 2026-11-12). The live file app/public/data/nba/post-freeze-availability/
 * 2026-11-11.json is rewritten by the window step from each later capture (nine Outs by 23:53Z; Mathurin's statedAt
 * moved 16:29Z → 16:55Z as ESPN re-posted the item), so the pinned assertions read __fixtures__/
 * post-freeze-availability-2026-11-11-from-1632Z.json: the script's own output from the 16:32Z capture, byte-equal to
 * the file's first committed version (#1323). The LIVE file is held to the rule instead: every change it carries must be
 * a real post-freeze Out of a projected lane player (validateAgainstLane), and so must the derivation from the latest
 * committed capture.
 *
 * Run (from app/): npx tsx --test src/lib/sports/nba/post-freeze-availability.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { execFileSync } from "node:child_process";

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
const FIXTURE_REL = "src/lib/sports/nba/__fixtures__/post-freeze-availability-2026-11-11-from-1632Z.json";
const fixture = JSON.parse(fs.readFileSync(path.join(APP, FIXTURE_REL), "utf8"));
/** Run `fn` with process.cwd() at a temp app root whose public post-freeze file for DATE is `doc` (the readers resolve
 *  public/ from the cwd), so a render reads the immutable fixture, never the live file. */
function withPublicFile(doc, fn) {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "pfa-cwd-"));
  const at = path.join(tmp, "public/data/nba/post-freeze-availability", `${DATE}.json`);
  fs.mkdirSync(path.dirname(at), { recursive: true }); fs.writeFileSync(at, JSON.stringify(doc));
  const cwd = process.cwd();
  process.chdir(tmp);
  try { return fn(); } finally { process.chdir(cwd); fs.rmSync(tmp, { recursive: true, force: true }); }
}
/** The rule, against the frozen lane: problems in a post-freeze file (empty = valid). */
function validateAgainstLane(doc, laneDoc) {
  const p = [];
  if (doc?.schema !== POST_FREEZE_AVAILABILITY_SCHEMA) p.push(`schema ${doc?.schema}`);
  if (doc?.date !== laneDoc.date) p.push(`date ${doc?.date}`);
  if (doc?.lane?.generatedAt !== laneDoc.generatedAt) p.push(`lane ${doc?.lane?.generatedAt}`);
  if (!Array.isArray(doc?.changes) || !doc.changes.length) p.push("no changes array");
  const seen = new Set();
  for (const c of doc?.changes ?? []) {
    const k = `${c.providerEventId}:${c.providerAthleteId}`;
    if (seen.has(k)) p.push(`${k}: duplicate`); seen.add(k);
    const gm = laneDoc.games.find((x) => x.providerEventId === c.providerEventId);
    const row = gm && gm.players?.[c.side]?.find((r) => r.providerAthleteId === c.providerAthleteId);
    if (!row) { p.push(`${k}: not a projected ${c.side} player of a slate game`); continue; }
    if (c.status !== "Out") p.push(`${k}: status ${c.status}`);
    const t = Date.parse(c.statedAt ?? "");
    if (!(t > Date.parse(gm.frozenAt) && t < Date.parse(gm.tipUtc))) p.push(`${k}: stated ${c.statedAt} not after the freeze and before tip-off`);
    if (c.name !== row.name) p.push(`${k}: name ${c.name} ≠ lane ${row.name}`);
  }
  if (/median|expectedMinutes|price|odds/i.test(JSON.stringify(doc ?? {}))) p.push("carries a projection number or a price");
  return p;
}
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

test("the immutable fixture is what the script derives from the 16:32Z capture (no projection number, no price) and the frozen lane file is untouched", () => {
  assert.deepEqual(fixture.changes, postFreezeAvailability(lane, capture).changes, "the fixture is the 16:32Z derivation");
  assert.deepEqual(validateAgainstLane(fixture, lane), []);
  assert.ok(!/median|expectedMinutes|price|odds/i.test(JSON.stringify(fixture)), "facts only");
  assert.equal(fixture.date, DATE);
  assert.equal(fixture.lane.generatedAt, lane.generatedAt, "derived from the lane frozen at 08:23Z");
  const g = lane.games.find((x) => x.providerEventId === GAME);
  const row = g.players.home.find((p) => p.providerAthleteId === MATHURIN);
  assert.deepEqual([row.expectedMinutes, row.medians.pts, row.injuryStatus], [16.9, 8.4, null], "the frozen lane still holds the projection as recorded");
  assert.equal(g.receipt.payloadSha256, "04e35976bbe53247a877aff34571254339aaca379df4c79d04c65cf45d11e215", "the receipt the lane froze at 08:23Z");
});

test("LIVE · the committed public file obeys the rule: every change is a real post-freeze Out of a projected lane player", () => {
  const live = JSON.parse(read(POST_FREEZE_REL(DATE)));
  assert.deepEqual(validateAgainstLane(live, lane), [], "the live file the pages read");
  const latest = JSON.parse(read("data/internal/research/injuries/nba/latest.json"));
  const fromLatest = postFreezeAvailability(lane, latest);
  if (fromLatest.changes.length) assert.deepEqual(validateAgainstLane(fromLatest, lane), [], "the latest committed capture's derivation obeys the same rule");
  const { loadPostFreezeOut } = { loadPostFreezeOut: (d, e) => postFreezeOutFor(live, e, d) };
  for (const c of live.changes) assert.ok(loadPostFreezeOut(DATE, c.providerEventId).has(c.providerAthleteId), `${c.name} reaches its game page`);
});

test("the rule still refuses: a non-Out status, an Out stated before the freeze or after tip-off, a player not projected, a wrong lane or date, a number", () => {
  const ok = structuredClone(fixture);
  const bad = (mut) => { const d = structuredClone(ok); mut(d); return validateAgainstLane(d, lane); };
  assert.deepEqual(validateAgainstLane(ok, lane), []);
  assert.ok(bad((d) => { d.changes[0].status = "Day-To-Day"; }).some((x) => /status/.test(x)));
  assert.ok(bad((d) => { d.changes[0].statedAt = "2026-11-11T08:00Z"; }).some((x) => /not after the freeze/.test(x)));
  assert.ok(bad((d) => { d.changes[0].statedAt = "2026-11-12T03:00Z"; }).some((x) => /before tip-off/.test(x)));
  assert.ok(bad((d) => { d.changes[0].providerAthleteId = "999999"; }).some((x) => /not a projected/.test(x)));
  assert.ok(bad((d) => { d.changes[0].side = "away"; }).some((x) => /not a projected/.test(x)));
  assert.ok(bad((d) => { d.date = "2026-11-10"; }).some((x) => /date/.test(x)));
  assert.ok(bad((d) => { d.lane.generatedAt = "2026-11-11T07:00:00Z"; }).some((x) => /lane/.test(x)));
  assert.ok(bad((d) => { d.changes[0].expectedMinutes = 16.9; }).some((x) => /projection number/.test(x)));
  assert.ok(bad((d) => { d.changes.push(d.changes[0]); }).some((x) => /duplicate/.test(x)));
  assert.ok(bad((d) => { d.schema = "x"; }).some((x) => /schema/.test(x)));
  assert.equal(postFreezeOutFor({ schema: "x", changes: ok.changes }, GAME, DATE).size, 0, "a foreign schema is never applied");
  assert.equal(postFreezeOutFor(null, GAME, DATE).size, 0, "a missing file is never applied");
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
  const ruled = withPublicFile(fixture, () => loadPostFreezeOut(DATE, GAME));
  assert.ok(ruled.has(MATHURIN), "the page's reader reads the public file (here: the immutable fixture)");
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
  const html = withPublicFile(fixture, () => renderToStaticMarkup(React.createElement(SettledSimulation, { view: { id: GAME, date: DATE, game: g, record: null } })));
  assert.equal(html.split("data-nba-post-freeze-out").length - 1, 1);
  assert.match(text(html), /Bennedict Mathurin Ruled out after this forecast froze \(injury report 11:29 AM ET\) 16\.9 8\.4/);
});

test("tip-off bound: an Out stated after the game tipped is not a pregame availability change", () => {
  const late = { ...capture, entries: capture.entries.map((e) => (e.athleteId === MATHURIN ? { ...e, statedAt: new Date(Date.parse(g.tipUtc) + 60e3).toISOString() } : e)) };
  assert.deepEqual(postFreezeAvailability(lane, late).changes, []);
});

test("/nba/projections all-players board: Mathurin kept as recorded, last in the default order, with the note (wire round-trip)", async () => {
  const { boardRows, packBoard, unpackBoard, sortRows } = await import("./projection-board-ops.mjs");
  const { PROJECTION_BOARD_STATS } = await import("./experimental-public-lane.mjs");
  const { loadPostFreezeNotes } = await import("../../../components/nba/post-freeze-availability-data.ts");
  const notes = withPublicFile(fixture, () => loadPostFreezeNotes(DATE));
  assert.deepEqual(notes, { [`${GAME}:${MATHURIN}`]: "Ruled out after this forecast froze (injury report 11:29 AM ET)" });
  assert.equal(loadPostFreezeNotes("2026-11-10"), null, "a date without a file: no notes");
  const plain = packBoard(boardRows(lane, PROJECTION_BOARD_STATS));
  const packed = packBoard(boardRows(lane, PROJECTION_BOARD_STATS, notes));
  assert.equal(plain.o, undefined, "no notes → the wire is unchanged");
  assert.deepEqual(packed.t, plain.t, "teams unchanged");
  assert.deepEqual(packed.r.filter((x) => x[0] !== "Bennedict Mathurin"), plain.r.filter((x) => x[0] !== "Bennedict Mathurin"), "every other row, in the same order, unchanged");
  assert.equal(packed.r.length, plain.r.length, "no row removed");
  const last = packed.r.at(-1);
  assert.equal(last[0], "Bennedict Mathurin");
  assert.deepEqual(last.slice(3, 5), [16.9, 8.4], "expected minutes and points as recorded");
  assert.deepEqual(packed.o, [[packed.r.length - 1, notes[`${GAME}:${MATHURIN}`]]]);
  const rows = unpackBoard(packed);
  const order = sortRows(rows);
  assert.equal(order.at(-1).name, "Bennedict Mathurin", "the island's default order demotes him (same as the server's)");
  assert.equal(order.at(-1).pf, notes[`${GAME}:${MATHURIN}`]);
  assert.deepEqual(order.map((r) => r.id), rows.map((r) => r.id), "client default order = server pack order");
});

test("the window step: after the build step's capture and the lane publish, its own capture, explicit path, writes on change, no skip marker", () => {
  const wf = read(".github/workflows/nba-forecast-window.yml");
  const i = wf.indexOf("- name: Post-freeze availability");
  assert.ok(i > wf.indexOf("- name: Capture injuries, build the owed forecasts") && i > wf.indexOf("- name: Publish the NBA experimental lane"), "runs after the injuries capture and the lane publish");
  const step = wf.slice(i, wf.indexOf("- name: Report a hold"));
  assert.ok(step.indexOf("capture-injuries.mjs") < step.indexOf("build-nba-post-freeze-availability.mjs"), "its own capture first");
  const adds = [...step.matchAll(/git add ([^\n;]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(adds, ['"$F"'], "one git add, of the explicit file path only");
  assert.match(step, /F="public\/data\/nba\/post-freeze-availability\/\$D\.json"/);
  assert.match(step, /git commit -q -m "auto: nba post-freeze availability \$NOW"/);
  assert.doesNotMatch(step, /skip[ -]ci|ci[ -]skip/i, "the commit message carries no CI skip marker");
  assert.doesNotMatch(step, /experimental-public|graded|exit 1\b/, "never stages the lane or a graded record; never fails the window");
});

test("script: writes only on change and never an empty file", () => {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "pfa-"));
  const put = (rel, obj) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), JSON.stringify(obj)); };
  put(LANE_REL, lane);
  const run = () => execFileSync(process.execPath, [path.join(APP, "scripts/nba/build-nba-post-freeze-availability.mjs"), "--date", DATE, "--root", tmp], { encoding: "utf8" });
  const out = path.join(tmp, POST_FREEZE_REL(DATE));
  put("data/internal/research/injuries/nba/latest.json", { ...capture, entries: [] });
  assert.match(run(), /no post-freeze change, no file/);
  assert.ok(!fs.existsSync(out), "no change → no file → no commit, no build");
  put("data/internal/research/injuries/nba/latest.json", capture);
  assert.match(run(), /1 change/);
  const first = fs.readFileSync(out, "utf8");
  assert.match(run(), /unchanged/);
  assert.equal(fs.readFileSync(out, "utf8"), first, "byte-identical rerun");
  assert.equal(first, fs.readFileSync(path.join(APP, FIXTURE_REL), "utf8"), "the immutable fixture is exactly what the script writes from the 16:32Z capture");
  fs.rmSync(tmp, { recursive: true, force: true });
});
