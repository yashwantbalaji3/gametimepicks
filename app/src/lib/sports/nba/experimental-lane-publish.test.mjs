/** Run: npx tsx --test src/lib/sports/nba/experimental-lane-publish.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { PUBLISH, comparableSnapshot, decidePublish } from "./experimental-lane-publish.mjs";
import { buildExperimentalSnapshot, snapshotMatchesSource } from "./experimental-public-lane.mjs";
import { etDateOf } from "./experimental-forecast.mjs";

const REPO = path.resolve(process.cwd(), "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));
const DATE = "2026-10-20";
const DOC = read(`data/internal/research/nba/experimental-v0.1/forecasts/${DATE}.json`);
const DAY = read(`app/public/data/nba/experimental-public/${DATE}.json`);
const ROWS = DOC.games.map((g) => ({ providerEventId: g.providerEventId, dateUtc: g.dateUtc, statusRaw: "STATUS_SCHEDULED" }));
const snap = (doc = DOC, generatedAt = "2026-10-20T20:00:00Z") => buildExperimentalSnapshot({ forecastDoc: doc, sourceFile: DAY.source.file, sourceCommit: DAY.source.commit, generatedAt });
const base = (o = {}) => ({ date: DATE, scheduleRows: ROWS, etDateOf, forecastDoc: DOC, now: "2026-10-20T18:00:00Z", snapshot: snap(), rederivesOk: true, committedDay: null, committedLatest: null, ...o });

test("PUBLISH once every game is frozen; writes the day file and latest.json", () => {
  const d = decidePublish(base());
  assert.equal(d.action, PUBLISH.PUBLISH);
  assert.equal(d.writeDay, true);
  assert.equal(d.writeLatest, true);
});

test("HOLD while a scheduled game has neither a receipt nor has tipped (a second publish would mean a second build)", () => {
  const rows = [...ROWS, { providerEventId: "999", dateUtc: "2026-10-21T02:00Z", statusRaw: "STATUS_SCHEDULED" }];
  const d = decidePublish(base({ scheduleRows: rows }));
  assert.equal(d.action, PUBLISH.HOLD);
  assert.deepEqual(d.pending, ["999"]);
  const tipped = decidePublish(base({ scheduleRows: rows, now: "2026-10-21T02:30:00Z" }));
  assert.equal(tipped.action, PUBLISH.PUBLISH, "a game that tipped without a receipt is final (never frozen)");
  assert.deepEqual(tipped.unfrozen, ["999"]);
  const postponed = decidePublish(base({ scheduleRows: [...ROWS, { providerEventId: "998", dateUtc: "2026-10-21T02:00Z", statusRaw: "STATUS_POSTPONED" }] }));
  assert.equal(postponed.action, PUBLISH.PUBLISH);
  assert.deepEqual(postponed.unfrozen, [], "postponed games are neither pending nor unfrozen");
});

test("NOOP on the real committed 2026-10-20 day file: the automated rebuild equals the hand-built publish", () => {
  const d = decidePublish(base({ committedDay: DAY, committedLatest: DAY }));
  assert.equal(d.action, PUBLISH.NOOP);
  assert.equal(comparableSnapshot(snap(DOC, "2030-01-01T00:00:00Z")), comparableSnapshot(DAY), "only generatedAt differs");
  for (const g of DAY.games) assert.equal(snapshotMatchesSource(g, DOC.games.find((x) => String(x.providerEventId) === g.providerEventId)), true);
});

test("REFUSE: a differing published day file is never rewritten; a failed re-derivation refuses the run", () => {
  const tampered = { ...DAY, games: DAY.games.slice(1) };
  assert.equal(decidePublish(base({ committedDay: tampered })).action, PUBLISH.REFUSE);
  assert.equal(decidePublish(base({ rederivesOk: false })).action, PUBLISH.REFUSE);
  assert.equal(decidePublish(base({ forecastDoc: { ...DOC, family: "v1" } })).action, PUBLISH.REFUSE);
});

test("latest.json never rolls back to an older slate; it catches up when the day file is final but latest lags", () => {
  const newer = { ...DAY, date: "2026-10-22" };
  const d = decidePublish(base({ committedLatest: newer }));
  assert.equal(d.action, PUBLISH.PUBLISH);
  assert.equal(d.writeLatest, false);
  const lag = decidePublish(base({ committedDay: DAY, committedLatest: { ...DAY, date: "2026-10-19", games: [] } }));
  assert.equal(lag.action, PUBLISH.PUBLISH);
  assert.equal(lag.writeDay, false);
  assert.equal(lag.writeLatest, true);
});

test("HOLD with no forecast file or no games on the date", () => {
  assert.equal(decidePublish(base({ forecastDoc: null, snapshot: null })).action, PUBLISH.HOLD);
  assert.equal(decidePublish(base({ scheduleRows: [] })).action, PUBLISH.HOLD);
});
