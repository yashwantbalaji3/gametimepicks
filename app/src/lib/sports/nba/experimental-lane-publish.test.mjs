/** Run: npx tsx --test src/lib/sports/nba/experimental-lane-publish.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { PUBLISH, comparableSnapshot, decidePublish, manualWriteDecision } from "./experimental-lane-publish.mjs";
import { ELO_WIN_PROBABILITY, eloWinProbabilityForPublish } from "./elo-win-probability.mjs";
import { buildExperimentalSnapshot, snapshotMatchesSource, unavailablePlayersForPublish } from "./experimental-public-lane.mjs";
import { etDateOf } from "./experimental-forecast.mjs";

const REPO = path.resolve(process.cwd(), "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));
const DATE = "2026-10-20";
const DOC = read(`data/internal/research/nba/experimental-v0.1/forecasts/${DATE}.json`);
const DAY = read(`app/public/data/nba/experimental-public/${DATE}.json`);
const ROWS = DOC.games.map((g) => ({ providerEventId: g.providerEventId, dateUtc: g.dateUtc, statusRaw: "STATUS_SCHEDULED" }));
// 10-20 is ALREADY PUBLISHED: every rebuild here follows the publisher's own Elo rule (Release G: switch-agnostic, so the
// identity checks below hold with the Elo switch ON as well as OFF — never weaker).
const snap = (doc = DOC, generatedAt = "2026-10-20T20:00:00Z") => buildExperimentalSnapshot({ forecastDoc: doc, sourceFile: DAY.source.file, sourceCommit: DAY.source.commit, generatedAt, eloWinProbability: eloWinProbabilityForPublish(DAY), unavailablePlayers: unavailablePlayersForPublish(DAY) });
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

// ── Release G (Elo switch ON) ─────────────────────────────────────────────────────────────────────────────────────────
const LANE_DIR = path.join(REPO, "app/public/data/nba/experimental-public");
const DATED = fs.readdirSync(LANE_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();

test("EVERY committed slate rebuilds byte-for-byte under the publisher's rule, with the Elo switch as it is (ON since Release G)", () => {
  assert.ok(DATED.length >= 4);
  for (const f of DATED) {
    const date = f.slice(0, 10);
    const text = fs.readFileSync(path.join(LANE_DIR, f), "utf8");
    const day = JSON.parse(text);
    const doc = read(`data/internal/research/nba/experimental-v0.1/forecasts/${date}.json`);
    const rebuilt = buildExperimentalSnapshot({ forecastDoc: doc, sourceFile: day.source.file, sourceCommit: day.source.commit, generatedAt: day.generatedAt, eloWinProbability: eloWinProbabilityForPublish(day), unavailablePlayers: unavailablePlayersForPublish(day) });
    assert.equal(`${JSON.stringify(rebuilt, null, 1)}\n`, text, `${date}: a published slate is exactly what the producer rebuilds`);
    assert.equal(manualWriteDecision({ committedDay: day, snapshot: rebuilt }).action, PUBLISH.NOOP, date);
  }
});

test("the hand-run producer's write rule: a new slate is written, an identical rebuild is a NOOP, a differing one REFUSED", () => {
  assert.equal(manualWriteDecision({ committedDay: null, snapshot: snap() }).action, PUBLISH.PUBLISH);
  assert.equal(manualWriteDecision({ committedDay: DAY, snapshot: snap(DOC, "2031-01-01T00:00:00Z") }).action, PUBLISH.NOOP, "generatedAt alone never rewrites");
  const withField = buildExperimentalSnapshot({ forecastDoc: DOC, sourceFile: DAY.source.file, sourceCommit: DAY.source.commit, generatedAt: DAY.generatedAt, eloWinProbability: true });
  assert.equal(manualWriteDecision({ committedDay: DAY, snapshot: withField }).action, PUBLISH.REFUSE, "adding the Elo field to a published slate is refused");
  assert.equal(manualWriteDecision({ committedDay: DAY, snapshot: null }).action, PUBLISH.REFUSE);
});

test("with the Elo switch ON, the hand-run producer (--write) cannot change ANY committed day file or latest.json", { skip: !ELO_WIN_PROBABILITY.enabled ? "switch OFF" : false }, () => {
  const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(LANE_DIR, f))).digest("hex");
  for (const f of DATED) {
    const before = [sha(f), sha("latest.json")];
    const r = spawnSync("npx", ["tsx", "scripts/nba/build-nba-experimental-public.mjs", "--date", f.slice(0, 10), "--write"], { cwd: process.cwd(), encoding: "utf8" });
    assert.match(r.stdout, /: NOOP — /, `${f}: ${r.stdout}${r.stderr}`);
    assert.deepEqual([sha(f), sha("latest.json")], before, `${f}: unchanged bytes`);
  }
});
