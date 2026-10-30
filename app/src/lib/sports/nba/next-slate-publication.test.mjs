/**
 * NBA next-slate publication trigger (founder 2026-10-30): the previous ET slate's last final, or 06:00 America/New_York
 * on the slate date, whichever comes first — and nothing about the once-per-slate, never-rewritten lane changes.
 * Fixtures are synthetic (no committed slate is read), so a data commit can never turn this red.
 *
 * Run: npx tsx --test src/lib/sports/nba/next-slate-publication.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { decideNextSlate, zonedWallClockToUtc, slatesByEtDate, inputReadiness, addDays, NEXT_SLATE, TRIGGER, FALLBACK_ET } from "./next-slate-publication.mjs";
import { decidePublish, PUBLISH } from "./experimental-lane-publish.mjs";
import { etDateOf } from "./experimental-forecast.mjs";

const row = (id, dateUtc, statusRaw = "STATUS_SCHEDULED") => ({ providerEventId: id, dateUtc, statusRaw });
const fin = (id, dateUtc) => ({ providerEventId: id, dateUtc, statusRaw: "STATUS_FINAL" });
const none = () => new Set();

// Friday 10-30 ET slate: 23:00Z (7 PM EDT) … 02:30Z next day (10:30 PM EDT). Saturday 10-31 slate: 19:00Z … 00:30Z.
const FRI = [row("f1", "2026-10-30T23:00Z"), row("f2", "2026-10-31T02:30Z")];
const SAT = [row("s1", "2026-10-31T19:00Z"), row("s2", "2026-11-01T00:30Z")];

test("fallback is 06:00 America/New_York, DST-aware (EDT → EST on Sunday 2026-11-01)", () => {
  assert.equal(FALLBACK_ET, "06:00");
  assert.equal(zonedWallClockToUtc("2026-10-30", "06:00"), "2026-10-30T10:00:00Z");
  assert.equal(zonedWallClockToUtc("2026-10-31", "06:00"), "2026-10-31T10:00:00Z");
  assert.equal(zonedWallClockToUtc("2026-11-01", "06:00"), "2026-11-01T11:00:00Z", "DST ended at 02:00 local: 06:00 is EST");
  assert.equal(zonedWallClockToUtc("2026-11-02", "06:00"), "2026-11-02T11:00:00Z");
  assert.equal(zonedWallClockToUtc("2027-03-14", "06:00"), "2027-03-14T10:00:00Z", "spring forward: back on EDT");
  assert.throws(() => zonedWallClockToUtc("2027-03-14", "02:30"), /does not exist/);
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-11-01", -1), "2026-10-31");
});

test("a final after midnight ET belongs to the previous slate; the slate's LAST final fires the next slate", () => {
  // f2 tips 02:30Z 10-31 = 22:30 EDT on 10-30, so it is a 10-30 game even though it ends ~05:00Z (01:00 ET 10-31).
  assert.equal(etDateOf("2026-10-31T02:30Z"), "2026-10-30");
  const slates = slatesByEtDate({ scheduleRows: [...FRI, ...SAT], finals: [fin("f2", "2026-10-31T02:30Z")], etDateOf });
  assert.deepEqual([...slates.get("2026-10-30").keys()].sort(), ["f1", "f2"]);
  const at = (now, finals) => decideNextSlate({ scheduleRows: [...FRI, ...SAT], finals, etDateOf, now, frozenIds: none });
  const before = at("2026-10-31T04:50:00Z", [fin("f1", "2026-10-30T23:00Z")]);
  assert.equal(before.action, NEXT_SLATE.HOLD);
  assert.equal(before.slate, "2026-10-31");
  assert.deepEqual(before.pendingPrevious, ["f2"]);
  assert.match(before.reason, /fallback 06:00 ET = 2026-10-31T10:00:00Z/);
  const after = at("2026-10-31T05:10:00Z", [fin("f1", "2026-10-30T23:00Z"), fin("f2", "2026-10-31T02:30Z")]);
  assert.equal(after.action, NEXT_SLATE.BUILD);
  assert.equal(after.trigger, TRIGGER.PREVIOUS_SLATE_FINAL);
  assert.deepEqual(after.owed, ["s1", "s2"]);
});

test("a slate that goes final before midnight ET publishes TOMORROW's slate the same evening (lead cap = 1 ET day)", () => {
  const early = [row("f1", "2026-10-30T23:00Z"), row("f2", "2026-10-31T00:00Z")];
  const d = decideNextSlate({ scheduleRows: [...early, ...SAT], finals: [fin("f1", "2026-10-30T23:00Z"), fin("f2", "2026-10-31T00:00Z")], etDateOf, now: "2026-10-31T03:20:00Z", frozenIds: none });
  assert.equal(etDateOf("2026-10-31T03:20:00Z"), "2026-10-30", "still Friday in New York");
  assert.equal(d.action, NEXT_SLATE.BUILD);
  assert.equal(d.slate, "2026-10-31");
  assert.equal(d.trigger, TRIGGER.PREVIOUS_SLATE_FINAL);
});

test("fallback cases: late final · provider delayed / reconciliation incomplete · unseen postponement · skipped workflow", () => {
  const rows = [...FRI, ...SAT];
  const one = [fin("f1", "2026-10-30T23:00Z")]; // f2 never recorded (late final, provider delay, postponed but captured as scheduled)
  const at = (now, finals) => decideNextSlate({ scheduleRows: rows, finals, etDateOf, now, frozenIds: none });
  for (const finals of [one, []]) {
    assert.equal(at("2026-10-31T09:59:59Z", finals).action, NEXT_SLATE.HOLD, "one second before 06:00 EDT");
    const fb = at("2026-10-31T10:00:00Z", finals);
    assert.equal(fb.action, NEXT_SLATE.BUILD);
    assert.equal(fb.trigger, TRIGGER.FALLBACK_CLOCK);
    assert.match(fb.reason, /not final/);
    // every early tick was dropped: the first tick that does arrive (watchdog 12Z, or 15Z) still fires
    for (const late of ["2026-10-31T12:00:00Z", "2026-10-31T15:00:00Z"]) assert.equal(at(late, finals).action, NEXT_SLATE.BUILD);
  }
  // after the first tip of the target slate it is under way: never a next-slate build (the window owns it)
  const underway = at("2026-10-31T19:30:00Z", one);
  assert.notEqual(underway.slate, "2026-10-31");
});

test("postponed / cancelled / suspended games of the previous slate count as done (no wait for the fallback)", () => {
  for (const status of ["STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_SUSPENDED"]) {
    const rows = [row("f1", "2026-10-30T23:00Z"), row("f2", "2026-10-31T02:30Z", status), ...SAT];
    const d = decideNextSlate({ scheduleRows: rows, finals: [fin("f1", "2026-10-30T23:00Z")], etDateOf, now: "2026-10-31T02:00:00Z", frozenIds: none });
    assert.equal(d.action, NEXT_SLATE.BUILD, status);
    assert.equal(d.trigger, TRIGGER.PREVIOUS_SLATE_FINAL);
  }
  // a postponed game ON the target slate is never owed
  const rows = [...FRI, row("s1", "2026-10-31T19:00Z", "STATUS_POSTPONED"), row("s2", "2026-11-01T00:30Z")];
  const d = decideNextSlate({ scheduleRows: rows, finals: FRI.map((r) => fin(r.providerEventId, r.dateUtc)), etDateOf, now: "2026-10-31T06:00:00Z", frozenIds: none });
  assert.deepEqual(d.owed, ["s2"]);
});

test("no games the prior date (Election Day 2026-11-03): HOLD until 06:00 EST on the slate date, then BUILD", () => {
  const MON = [row("m1", "2026-11-03T00:00Z"), row("m2", "2026-11-03T03:00Z")];
  const WED = [row("w1", "2026-11-05T00:00Z"), row("w2", "2026-11-05T03:30Z")];
  const finals = MON.map((r) => fin(r.providerEventId, r.dateUtc));
  const at = (now) => decideNextSlate({ scheduleRows: [...MON, ...WED], finals, etDateOf, now, frozenIds: none });
  // Monday evening (23:30 EST 11-02) with Monday final: Wednesday is 2 ET days away → never frozen that early
  assert.equal(at("2026-11-03T04:30:00Z").action, NEXT_SLATE.NONE);
  assert.equal(at("2026-11-03T06:00:00Z").action, NEXT_SLATE.HOLD, "from Tuesday ET it waits for Wednesday's fallback");
  const tue = at("2026-11-03T20:00:00Z");
  assert.equal(tue.action, NEXT_SLATE.HOLD);
  assert.equal(tue.slate, "2026-11-04");
  assert.match(tue.reason, /no games on 2026-11-03; fallback 06:00 ET = 2026-11-04T11:00:00Z/);
  assert.equal(at("2026-11-04T10:59:00Z").action, NEXT_SLATE.HOLD);
  const wed = at("2026-11-04T11:00:00Z");
  assert.equal(wed.action, NEXT_SLATE.BUILD);
  assert.equal(wed.trigger, TRIGGER.FALLBACK_CLOCK);
});

test("Sunday 2026-11-01 (DST ends): Saturday's after-midnight final fires; the fallback is 11:00Z", () => {
  const SUN = [row("u1", "2026-11-01T20:30Z"), row("u2", "2026-11-02T02:00Z")];
  const at = (now, finals) => decideNextSlate({ scheduleRows: [...SAT, ...SUN], finals, etDateOf, now, frozenIds: none });
  // s2 tips 00:30Z 11-01 = 20:30 EDT on 10-31 → a Saturday game; it ends ~03:00Z, before the 06:00Z (02:00 EDT) switch
  assert.equal(etDateOf("2026-11-01T00:30Z"), "2026-10-31");
  const fired = at("2026-11-01T03:05:00Z", SAT.map((r) => fin(r.providerEventId, r.dateUtc)));
  assert.equal(fired.slate, "2026-11-01");
  assert.equal(fired.action, NEXT_SLATE.BUILD);
  assert.equal(fired.fallbackAt, "2026-11-01T11:00:00Z");
  assert.equal(at("2026-11-01T10:30:00Z", []).action, NEXT_SLATE.HOLD, "10:30Z is 05:30 EST — before the fallback");
  assert.equal(at("2026-11-01T11:00:00Z", []).action, NEXT_SLATE.BUILD);
});

test("already frozen in v0 AND v0.1 → FROZEN (publish still pointed at the slate); partial → only the missing; tipped never owed", () => {
  const finals = FRI.map((r) => fin(r.providerEventId, r.dateUtc));
  const all = decideNextSlate({ scheduleRows: [...FRI, ...SAT], finals, etDateOf, now: "2026-10-31T06:00:00Z", frozenIds: () => new Set(["s1", "s2"]) });
  assert.equal(all.action, NEXT_SLATE.FROZEN);
  assert.equal(all.slate, "2026-10-31");
  const part = decideNextSlate({ scheduleRows: [...FRI, ...SAT], finals, etDateOf, now: "2026-10-31T06:00:00Z", frozenIds: () => new Set(["s1"]) });
  assert.deepEqual(part.owed, ["s2"]);
  assert.equal(decideNextSlate({ scheduleRows: [], finals, etDateOf, now: "2026-10-31T06:00:00Z", frozenIds: none }).action, NEXT_SLATE.NONE);
});

test("NO REWRITE: an early-published slate stays frozen — a later, different snapshot of the same date is REFUSED", () => {
  const forecastDoc = { family: "v0.1", games: SAT.map((r) => ({ providerEventId: r.providerEventId })) };
  const snap = (v) => ({ date: "2026-10-31", generatedAt: v, games: [{ providerEventId: "s1", m: v }] });
  const early = decidePublish({ date: "2026-10-31", scheduleRows: SAT, etDateOf, forecastDoc, now: "2026-10-31T05:20:00Z", snapshot: snap("a"), rederivesOk: true, committedDay: null, committedLatest: { date: "2026-10-30" } });
  assert.equal(early.action, PUBLISH.PUBLISH);
  assert.ok(early.writeDay && early.writeLatest, "the day file and latest.json move together");
  const published = snap("a");
  const sameLater = decidePublish({ date: "2026-10-31", scheduleRows: SAT, etDateOf, forecastDoc, now: "2026-10-31T16:00:00Z", snapshot: { ...snap("a"), generatedAt: "later" }, rederivesOk: true, committedDay: published, committedLatest: published });
  assert.equal(sameLater.action, PUBLISH.NOOP);
  for (const now of ["2026-10-31T16:00:00Z", "2026-11-01T02:00:00Z"]) {
    const changed = decidePublish({ date: "2026-10-31", scheduleRows: SAT, etDateOf, forecastDoc, now, snapshot: snap("b"), rederivesOk: true, committedDay: published, committedLatest: published });
    assert.equal(changed.action, PUBLISH.REFUSE, `before and after tip (${now}): never a silent rewrite`);
  }
});

test("input readiness labels the roster by the builder's own thresholds (describes; never relaxes)", () => {
  const r = (h) => inputReadiness({ now: "2026-10-31T05:00:00Z", rosterAsOf: new Date(Date.parse("2026-10-31T05:00:00Z") - h * 3_600_000).toISOString(), injuriesGeneratedAt: null, scheduleGeneratedAt: "2026-10-30T16:00:00Z", rosterMaxAgeHours: 48 });
  assert.match(r(13).roster, /^CURRENT/);
  assert.match(r(31).roster, /^AGEING/);
  assert.match(r(49).roster, /^STALE .* v0\.1 refuses if that fails/);
  assert.match(inputReadiness({ now: "2026-10-31T05:00:00Z", rosterAsOf: null, rosterMaxAgeHours: 48 }).roster, /^MISSING/);
  assert.match(r(13).injuries, /MISSING/);
  assert.equal(r(13).schedule, "13 h old");
});

// ── the workflows that carry it ─────────────────────────────────────────────────────────────────────────────────
const WF_DIR = path.resolve(process.cwd(), "..", ".github", "workflows");
const read = (f) => fs.readFileSync(path.join(WF_DIR, f), "utf8");

test("window: the next slate is frozen whole (v0 → v0.1 → v0.3, same instant) before the per-date loop, staged by the family loop, and published with today", () => {
  const body = read("nba-forecast-window.yml").replace(/^\s*#.*$/gm, "");
  assert.match(body, /NEXTDAY: \$\{\{ steps\.decide\.outputs\.nextday \}\}/);
  const v0 = body.indexOf('--date "$NEXTDAY" --now "$NOW" --write --family v0 ||');
  const v01 = body.indexOf('--date "$NEXTDAY" --now "$NOW" --write --family v0.1 \\');
  const v03 = body.indexOf('--date "$NEXTDAY" --now "$NOW" --write --family v0.3 \\');
  assert.ok(v0 > body.indexOf("capture-injuries.mjs") && v0 < v01 && v01 < v03, "injuries → v0 → v0.1 → v0.3");
  assert.ok(v03 < body.indexOf("for D in $DATES; do"), "before the windowed loop (which freezes the slate's Top Boards)");
  assert.doesNotMatch(body, /\$NEXTDAY"[^\n]*--horizon-hours/, "whole slate: no horizon");
  assert.doesNotMatch(body, /\$NEXTDAY"[^\n]*--family (v0\.2|v1)\b/, "research families keep their own 8 h cutoff");
  assert.ok(body.indexOf("for FD in experimental") > v03 && body.indexOf("verify-nba-forecast-receipts.mjs --against HEAD") > v03, "staged and guarded like every other build");
  assert.match(body, /SLATE: \$\{\{ steps\.decide\.outputs\.slate \}\}/);
  assert.match(body, /for D in \$\(printf '%s\\n' "\$TODAY" \$\{SLATE:-\} \| sort -u\); do publish_one "\$D" \|\| FAILED=1; done/);
  assert.match(body, /publish-nba-experimental-lane\.mjs --date "\$D" --write --theater/);
  const on = yaml.load(read("nba-forecast-window.yml")).on ?? yaml.load(read("nba-forecast-window.yml"))[true];
  assert.deepEqual(on.workflow_run.workflows, ["publication-watchdog"], "no deeper workflow_run source (nba-finals-waiter would pass the 4-workflow limit)");
  assert.ok(on.schedule.some((c) => /\b10,11\b/.test(c.cron)), "extra crons across the 06:00 ET fallback (10Z EDT, 11Z EST)");
});

test("results refresh: a committed NEW FINAL dispatches the window (fresh chain), actions: write only, never a failure", () => {
  const wf = yaml.load(read("nba-results-refresh.yml"));
  const tick = wf.jobs["tick-window"];
  assert.ok(tick, "tick-window job");
  assert.equal(tick.needs, "refresh");
  assert.match(String(tick.if), /needs\.refresh\.outputs\.finals_committed == '1'/);
  assert.deepEqual(tick.permissions, { actions: "write" });
  assert.equal(wf.jobs.refresh.outputs.finals_committed, "${{ steps.capture.outputs.finals_committed }}");
  const run = tick.steps.map((s) => String(s.run ?? "")).join("\n");
  assert.match(run, /gh workflow run nba-forecast-window\.yml --ref main \\\n\s+\|\| echo "::warning::/);
  assert.equal(tick.steps.some((s) => String(s.uses ?? "").includes("checkout")), false, "no checkout");
  const step = wf.jobs.refresh.steps.find((s) => s.id === "capture").run;
  assert.match(step, /FINALS_CHANGED=1\n/, "set only when a finals file changed");
  assert.ok(step.indexOf('echo "finals_committed=$FINALS_CHANGED" >> "$GITHUB_OUTPUT"') > step.indexOf("git push -q origin HEAD:main"), "output only after a successful push");
  assert.ok(step.indexOf("finals_committed=") > step.indexOf('if [ "$DRY_RUN" = "true" ]'), "a dry run never ticks");
});
