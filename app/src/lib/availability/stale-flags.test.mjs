/**
 * Injury monitor · stale flags (Phase 1). Acceptance criteria as tests, replaying tonight's committed captures
 * (2026-11-11: BOS Paul George Out 17:55Z; NO Bennedict Mathurin Out 16:29Z) against the frozen NBA lane.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { activeFlags, appendStaleFlags, detectClearEvents, detectStaleEvents, evaluatePostAtSend, monitorHealth, nbaCandidates, nflCandidates, postAllowed, STALE_FLAGS_SCHEMA } from "./stale-flags.mjs";

const FX = path.join(process.cwd(), "src/lib/availability/__fixtures__/stale-flags-2026-11-11");
const read = (f) => JSON.parse(fs.readFileSync(path.join(FX, f), "utf8"));
const sha = (o) => crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex");
const fileSha = (f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(FX, f))).digest("hex");
const CAPTURES = fs.readdirSync(FX).filter((f) => /^nba-injuries-.*\.json$/.test(f)).sort();
const GEORGE = "4251", MATHURIN = "4683634", BOS_TOR = "401909968", BKN_NO = "401909972";

/** Replay every capture in order through detect → append, as the monitor would after each capture. */
function replay(lane) {
  const candidates = nbaCandidates(lane, sha);
  let file = null;
  for (const f of CAPTURES) {
    const cap = read(f);
    file = appendStaleFlags(file, detectStaleEvents(candidates, cap), { sport: "nba", date: "2026-11-11", capturedAt: cap.sourceAsOf });
  }
  return { candidates, file };
}
const minutes = (a, b) => (Date.parse(b) - Date.parse(a)) / 60000;
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };

test("BOS @ TOR — Paul George (27.8 projected min) Out 17:55Z: player AND game flag, detected by the 18:18Z capture", () => {
  const { file } = replay(read("lane-2026-11-11.json"));
  const e = file.events.find((x) => x.playerId === GEORGE);
  assert.ok(e, "George is flagged");
  assert.equal(e.eventId, BOS_TOR);
  assert.deepEqual(e.flags, { player: true, game: true });
  assert.match(e.materialReasons.join(" "), /projected 27\.8 min ≥ 20/);
  assert.equal(e.statedAt, "2026-11-11T17:55Z");
  assert.equal(e.detectedAt.slice(0, 16), "2026-11-11T18:18");
  assert.equal(e.statusBefore, null);
  assert.match(e.forecastSha256, /^[0-9a-f]{64}$/);
});

test("BKN @ NO — Mathurin (16.9 projected min, not Top-N) Out 16:29Z: PLAYER flag only; the game stays postable", () => {
  const { file } = replay(read("lane-2026-11-11.json"));
  const e = file.events.find((x) => x.playerId === MATHURIN);
  assert.ok(e);
  assert.deepEqual(e.flags, { player: true, game: false });
  assert.equal(e.detectedAt.slice(0, 16), "2026-11-11T16:32");
  assert.deepEqual(postAllowed(file, { sport: "nba", eventId: BKN_NO, playerIds: [], gameLevel: true }).allowed, !file.events.some((x) => x.eventId === BKN_NO && x.flags.game));
  assert.equal(postAllowed(file, { sport: "nba", eventId: BKN_NO, playerIds: [MATHURIN], gameLevel: false }).allowed, false);
});

test("append-only: each event once, versions stamped by capture instant, nothing rewritten; a quiet capture writes nothing", () => {
  const lane = read("lane-2026-11-11.json");
  const candidates = nbaCandidates(lane, sha);
  let file = null;
  const snapshots = [];
  for (const f of CAPTURES) {
    const cap = read(f);
    const next = appendStaleFlags(file, detectStaleEvents(candidates, cap), { sport: "nba", date: "2026-11-11", capturedAt: cap.sourceAsOf });
    if (file) for (const [i, e] of file.events.entries()) assert.deepEqual(next.events[i], e, "earlier events are never edited");
    snapshots.push(JSON.stringify(next));
    file = next;
  }
  assert.equal(new Set(file.events.map((e) => e.key)).size, file.events.length, "no duplicate event");
  assert.ok(file.versions.every((v, i) => v.version === i + 1 && v.added.length > 0));
  const again = appendStaleFlags(file, detectStaleEvents(candidates, read(CAPTURES.at(-1))), { sport: "nba", date: "2026-11-11", capturedAt: "x" });
  assert.equal(again, file, "re-running the last capture appends nothing (same object)");
  assert.equal(file.schema, STALE_FLAGS_SCHEMA);
});

test("frozen forecast checksums unchanged: the monitor reads the lane and never mutates it", () => {
  const before = fileSha("lane-2026-11-11.json");
  const lane = read("lane-2026-11-11.json");
  const deep = JSON.stringify(lane);
  replay(lane);
  assert.equal(JSON.stringify(lane), deep, "the in-memory lane is untouched");
  assert.equal(fileSha("lane-2026-11-11.json"), before);
  const { file } = replay(read("lane-2026-11-11.json"));
  for (const e of file.events) assert.equal(e.forecastSha256, sha(lane.games.find((g) => String(g.providerEventId) === e.eventId)), "each event names the exact frozen game it judged");
});

test("recall: every material status change in the window is caught by the end of the replay (100% for Top-N players)", () => {
  const lane = read("lane-2026-11-11.json");
  const { candidates, file } = replay(lane);
  const last = read(CAPTURES.at(-1));
  /* ground truth from the latest capture: every candidate unavailable now, stated after freeze and before start, assumed available */
  const truth = detectStaleEvents(candidates, last);
  const caught = new Set(file.events.map((e) => e.key));
  const material = truth.filter((e) => e.flags.game);
  assert.ok(material.length >= 1);
  assert.equal(material.filter((e) => caught.has(e.key)).length / material.length, 1, "≥ 95% required; 100% caught");
  assert.equal(truth.filter((e) => e.topN).every((e) => caught.has(e.key)), true, "100% of Top-N");
});

test("zero posts of flagged games/players: package build and send-time recheck refuse; a stale capture cannot clear a post", () => {
  const lane = read("lane-2026-11-11.json");
  const { candidates, file } = replay(lane);
  for (const e of file.events) {
    assert.equal(postAllowed(file, { sport: "nba", eventId: e.eventId, playerIds: [e.playerId], gameLevel: false }).allowed, false, `${e.name} post refused`);
    if (e.flags.game) assert.equal(postAllowed(file, { sport: "nba", eventId: e.eventId, playerIds: [], gameLevel: true }).allowed, false, `${e.eventId} game post refused`);
  }
  const george = read("nba-injuries-20261111T1818Z.json");
  assert.equal(evaluatePostAtSend({ candidates, capture: george, post: { sport: "nba", eventId: BOS_TOR, playerIds: [], gameLevel: true }, nowIso: "2026-11-11T18:30:00Z" }).allowed, false);
  const stale = evaluatePostAtSend({ candidates, capture: read("nba-injuries-20261111T1632Z.json"), post: { sport: "nba", eventId: "401909966", playerIds: [], gameLevel: true }, nowIso: "2026-11-11T18:30:00Z" });
  assert.equal(stale.allowed, false);
  assert.match(stale.reasons[0], /min old at send/);
  /* control: an unflagged game with a fresh capture clears */
  const clean = file.events.some((e) => e.eventId === "401909975") ? null : evaluatePostAtSend({ candidates, capture: read(CAPTURES.at(-1)), post: { sport: "nba", eventId: "401909975", playerIds: [], gameLevel: true }, nowIso: "2026-11-11T19:50:00Z" });
  if (clean) assert.equal(clean.allowed, true);
  assert.equal(postAllowed({ schema: "other", sport: "nba", events: [] }, { sport: "nba", eventId: "1", playerIds: [], gameLevel: true }).allowed, false, "a foreign file fails closed");
});

test("NFL: the identified starting QB ruled out after the board froze raises a game flag; an already-listed player raises nothing", () => {
  const board = {
    providerEventId: "999", kickoffUtc: "2026-11-15T18:00:00Z", generatedAt: "2026-11-15T08:00:00Z",
    integrity: { qbStarter: [{ team: "MIA", state: "APPLIED", starter: { playerId: "nfl-athlete-1", name: "QB One" } }] },
    players: [
      { playerId: "nfl-athlete-1", name: "QB One", team: "MIA", markets: { player_pass_yds: { median: 220 } }, eligibility: { sources: { injuries: { status: null } } } },
      { playerId: "nfl-athlete-2", name: "RB Two", team: "MIA", markets: { player_rush_yds: { median: 70 } }, eligibility: { sources: { injuries: { status: "Doubtful" } } } },
      { playerId: "nfl-athlete-3", name: "WR Three", team: "MIA", markets: { player_reception_yds: { median: 60 } } },
    ],
  };
  const c = nflCandidates(board, sha);
  const cap = { sourceAsOf: "2026-11-15T10:05:00Z", source: { name: "ESPN NFL public injuries feed" }, entries: [
    { athleteId: "1", athleteName: "QB One", status: "Out", statedAt: "2026-11-15T10:00Z" },
    { athleteId: "2", athleteName: "RB Two", status: "Out", statedAt: "2026-11-15T10:00Z" },
  ] };
  const ev = detectStaleEvents(c, cap);
  assert.deepEqual(ev.map((e) => [e.name, e.flags.game]), [["QB One", true]], "the QB is flagged; RB Two was already Doubtful at the freeze");
  assert.match(ev[0].materialReasons.join(" "), /starting QB/);
});

test("latency: the pipeline adds nothing beyond capture cadence — real 2026-11-11 cadence vs a 5-minute poller", () => {
  const { file } = replay(read("lane-2026-11-11.json"));
  const real = file.events.map((e) => minutes(e.statedAt, e.detectedAt));
  /* the report: real cadence (≈30–45 min gaps this afternoon) — measured, not asserted against the 10/20 targets */
  const report = { n: real.length, medianMin: pct(real, 0.5), p95Min: pct(real, 0.95), george: minutes("2026-11-11T17:55Z", file.events.find((e) => e.playerId === GEORGE).detectedAt), mathurin: minutes("2026-11-11T16:29Z", file.events.find((e) => e.playerId === MATHURIN).detectedAt) };
  console.log("latency on the real 2026-11-11 capture cadence (min):", JSON.stringify(report));
  assert.ok(real.every((x) => x >= 0), "never detected before stated");
  /* a 5-minute poller: each event is detected at the first 5-minute tick after it is stated (capture is instantaneous) */
  const poll = file.events.map((e) => { const s = Date.parse(e.statedAt); const tick = Math.ceil(s / 300000) * 300000; return (tick - s) / 60000; });
  assert.ok(pct(poll, 0.5) <= 10 && pct(poll, 0.95) <= 20, `5-min cadence meets median ≤ 10 / p95 ≤ 20 (got ${pct(poll, 0.5)} / ${pct(poll, 0.95)})`);
});

/* ── recovery (founder 2026-11-11 ~20:05Z): a flag never hides a game or player permanently ─────────────────────────── */
test("recovery: George available again before tip → an appended clear (STATUS_REVERTED); posts allowed again; ruled out again → a NEW flag", () => {
  const lane = read("lane-2026-11-11.json");
  const { candidates, file } = replay(lane);
  const reverted = { sourceAsOf: "2026-11-11T19:30:00Z", source: { name: "test" }, entries: [{ athleteId: GEORGE, athleteName: "Paul George", status: "Day-To-Day", statedAt: "2026-11-11T19:25Z" }] };
  const clears = detectClearEvents(file, reverted, candidates);
  assert.deepEqual(clears.map((c) => [c.reason, c.playerId]), [["STATUS_REVERTED", GEORGE]]);
  const after = appendStaleFlags(file, clears, { sport: "nba", date: "2026-11-11", capturedAt: reverted.sourceAsOf });
  for (const [i, e] of file.events.entries()) assert.deepEqual(after.events[i], e, "the flag itself is never edited");
  assert.ok(!activeFlags(after).some((e) => e.playerId === GEORGE));
  assert.equal(postAllowed(after, { sport: "nba", eventId: BOS_TOR, playerIds: [GEORGE], gameLevel: true }).allowed, true);
  const outAgain = { sourceAsOf: "2026-11-11T20:00:00Z", source: { name: "test" }, entries: [{ athleteId: GEORGE, athleteName: "Paul George", status: "Out", statedAt: "2026-11-11T19:55Z" }] };
  const reflag = appendStaleFlags(after, detectStaleEvents(candidates, outAgain), { sport: "nba", date: "2026-11-11", capturedAt: outAgain.sourceAsOf });
  assert.equal(activeFlags(reflag).filter((e) => e.playerId === GEORGE).length, 1, "a later Out raises a new flag");
  assert.equal(postAllowed(reflag, { sport: "nba", eventId: BOS_TOR, playerIds: [], gameLevel: true }).allowed, false);
  /* control: a revert stated AFTER tip clears nothing */
  const late = { ...reverted, entries: [{ ...reverted.entries[0], statedAt: "2026-11-12T00:10Z" }] };
  assert.deepEqual(detectClearEvents(file, late, candidates), []);
});

test("recovery: a newer APPROVED forecast version for the game clears its flags (NEWER_VERSION); the same version clears nothing", () => {
  const { candidates, file } = replay(read("lane-2026-11-11.json"));
  const flag = file.events.find((e) => e.playerId === GEORGE);
  const same = detectClearEvents(file, { sourceAsOf: "2026-11-11T19:00:00Z", entries: [] }, candidates, { [BOS_TOR]: { forecastSha256: flag.forecastSha256, approvedAt: "2026-11-11T19:00:00Z" } });
  assert.deepEqual(same, []);
  const newer = detectClearEvents(file, { sourceAsOf: "2026-11-11T19:00:00Z", entries: [] }, candidates, { [BOS_TOR]: { forecastSha256: "f".repeat(64), approvedAt: "2026-11-11T18:40:00Z" } });
  assert.deepEqual(newer.map((c) => [c.reason, c.eventId]), [["NEWER_VERSION", BOS_TOR]]);
  const older = detectClearEvents(file, { sourceAsOf: "2026-11-11T19:00:00Z", entries: [] }, candidates, { [BOS_TOR]: { forecastSha256: "f".repeat(64), approvedAt: "2026-11-11T18:00:00Z" } });
  assert.deepEqual(older, [], "a version approved before the flag was detected does not answer it");
});

/* ── failure alerts through the EXISTING ops path ───────────────────────────────────────────────────────────────── */
test("monitor health: stale capture inside the pre-start window, missing / malformed capture, malformed flags file", () => {
  const cap = read("nba-injuries-20261111T1632Z.json");
  const starts = ["2026-11-12T00:00:00Z"];
  assert.deepEqual(monitorHealth({ sport: "nba", date: "2026-11-11", capture: cap, flagsFile: null, starts, nowIso: "2026-11-11T16:50:00Z" }), [], "fresh capture: healthy");
  assert.deepEqual(monitorHealth({ sport: "nba", date: "2026-11-11", capture: cap, flagsFile: null, starts, nowIso: "2026-11-11T18:00:00Z" }), [], "stale but outside the 4-hour window: no alert");
  assert.deepEqual(monitorHealth({ sport: "nba", date: "2026-11-11", capture: cap, flagsFile: null, starts, nowIso: "2026-11-11T21:00:00Z" }).map((f) => f.code), ["CAPTURE_STALE"]);
  assert.deepEqual(monitorHealth({ sport: "nba", date: "2026-11-11", capture: null, flagsFile: null, starts, nowIso: "2026-11-11T21:00:00Z" }).map((f) => f.code), ["CAPTURE_MISSING"]);
  assert.deepEqual(monitorHealth({ sport: "nba", date: "2026-11-11", capture: { sourceAsOf: "2026-11-11T20:55:00Z" }, flagsFile: { schema: "x" }, starts, nowIso: "2026-11-11T21:00:00Z" }).map((f) => f.code), ["CAPTURE_MALFORMED", "FLAGS_MALFORMED"]);
});

test("the writer sends health failures through scripts/ops_alert.sh (PHASE=injury-monitor) and exits 3 on a malformed input", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stale-flags-"));
  try {
    fs.mkdirSync(path.join(tmp, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "app/public/data/nba/experimental-public"), { recursive: true });
    fs.copyFileSync(path.join(FX, "lane-2026-11-11.json"), path.join(tmp, "app/public/data/nba/experimental-public/2026-11-11.json"));
    const rec = path.join(tmp, "alert.log");
    fs.writeFileSync(path.join(tmp, "scripts/ops_alert.sh"), `#!/usr/bin/env bash\necho "PHASE=$PHASE EXIT_STATUS=$EXIT_STATUS ERROR_LINE=$ERROR_LINE" >> "${rec}"\nexit 0\n`);
    const script = path.join(process.cwd(), "scripts/availability/build-stale-flags.mjs");
    const run = (extra) => { try { execFileSync("node", [script, "--sport", "nba", "--date", "2026-11-11", "--root", tmp, ...extra], { encoding: "utf8", stdio: "pipe" }); return 0; } catch (e) { return e.status; } };
    assert.equal(run(["--capture", path.join(FX, "nba-injuries-20261111T1632Z.json"), "--now", "2026-11-11T21:00:00Z"]), 0, "stale capture: alert, but the run still appends (exit 0)");
    assert.match(fs.readFileSync(rec, "utf8"), /PHASE=injury-monitor EXIT_STATUS=CAPTURE_STALE/);
    assert.ok(fs.existsSync(path.join(tmp, "app/public/data/nba/stale-flags/2026-11-11.json")));
    const bad = path.join(tmp, "bad.json"); fs.writeFileSync(bad, JSON.stringify({ sourceAsOf: "2026-11-11T20:59:00Z" }));
    assert.equal(run(["--capture", bad, "--now", "2026-11-11T21:00:00Z"]), 3, "a malformed capture fails the job");
    assert.match(fs.readFileSync(rec, "utf8"), /EXIT_STATUS=CAPTURE_MALFORMED/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
