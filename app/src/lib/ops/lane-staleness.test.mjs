/**
 * THE WATCHDOG FOR A JOB THAT NEVER EXISTED.
 *
 * Run: npx tsx --test src/lib/ops/lane-staleness.test.mjs
 *
 * The cron-slot watchdog asks whether a scheduled run fired and how it ended. Both are questions
 * about JOBS, and neither could see what actually went wrong with UFC — because nothing broke.
 * build-ufc-ladder was in no workflow at all, so there was no run to miss and no failure to report.
 * A hand-built ladder from 2026-08-18 served an event on 2026-08-22 for four days while every
 * surface reported the sport live, against a completely green board.
 *
 * A job that never existed leaves no trace in run history. The only evidence is the output.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { LANE_ARTIFACT_MAX_AGE_H, laneStaleness } from "./lane-staleness.mjs";

const NOW = "2026-08-22T02:00:00Z";
const healthy = {
  generatedAt: "2026-08-22T01:30:00Z",
  cards: { state: "PUBLISHED_FOR_THIS_CARD", date: "2026-08-22" },
  settlementReach: { state: "IN_SCOPE" },
  productLane: { live: true },
};

test("THE INCIDENT · a live lane whose cards belong to another event is an ALERT", () => {
  /*
   * The exact shape of the UFC failure, and deliberately not a threshold judgement: a lane saying
   * it is live while its cards belong to a different card is two statements that cannot both be
   * true, whatever anyone's staleness tolerance is.
   */
  const out = laneStaleness([{ sport: "ufc", artifact: {
    ...healthy,
    cards: { state: "STALE_FOR_A_DIFFERENT_CARD", detail: "the newest ladder is dated 2026-08-18 but this card is on 2026-08-22" },
  } }], NOW);
  assert.equal(out.worst, "ALERT");
  const f = out.findings.find((x) => x.id === "cards-belong-to-another-event");
  assert.ok(f, "the contradiction must be reported");
  assert.match(f.detail, /2026-08-18/, "and must carry the dates, so it can be acted on without opening the artifact");
});

test("a settler that cannot reach the sport is an ALERT — those cards can never grade", () => {
  // True for UFC for four days and for EPL from its first night: the settler read only baseball's
  // ladder directory, so anything published elsewhere would sit pending forever.
  const out = laneStaleness([{ sport: "ufc", artifact: { ...healthy, settlementReach: { state: "OUT_OF_SCOPE" } } }], NOW);
  assert.equal(out.worst, "ALERT");
  assert.ok(out.findings.some((f) => f.id === "settler-out-of-scope"));
});

test("an ABSENT lane artifact is an ALERT, not a pass", () => {
  // The sport most likely to have no artifact is the one whose producer has just stopped. Treating
  // absence as OK is how a watchdog reports health for something it cannot see at all.
  const out = laneStaleness([{ sport: "epl", artifact: null }], NOW);
  assert.equal(out.worst, "ALERT");
  assert.ok(out.findings.some((f) => f.id === "lane-artifact-absent"));
});

test("a lane artifact that has stopped moving is an ALERT", () => {
  const old = new Date(Date.parse(NOW) - (LANE_ARTIFACT_MAX_AGE_H + 1) * 3_600_000).toISOString();
  const out = laneStaleness([{ sport: "ufc", artifact: { ...healthy, generatedAt: old } }], NOW);
  assert.ok(out.findings.some((f) => f.id === "lane-artifact-stale"));
  // Just inside the window is not.
  const fresh = new Date(Date.parse(NOW) - (LANE_ARTIFACT_MAX_AGE_H - 1) * 3_600_000).toISOString();
  assert.equal(laneStaleness([{ sport: "ufc", artifact: { ...healthy, generatedAt: fresh } }], NOW).worst, "OK");
});

test("an unstamped artifact cannot be judged fresh, so it is not", () => {
  const out = laneStaleness([{ sport: "ufc", artifact: { ...healthy, generatedAt: undefined } }], NOW);
  assert.ok(out.findings.some((f) => f.id === "lane-artifact-unstamped"));
});

test("a live lane with no ladder at all is a WARN, not an ALERT", () => {
  // Weaker than the contradiction above: a sport can legitimately be between cards. Worth seeing,
  // not worth paging.
  const out = laneStaleness([{ sport: "ufc", artifact: { ...healthy, cards: { state: "UNKNOWN" } } }], NOW);
  assert.equal(out.worst, "WARN");
});

test("a healthy lane produces NOTHING — the guard is not simply always red", () => {
  const out = laneStaleness([{ sport: "ufc", artifact: healthy }, { sport: "epl", artifact: healthy }], NOW);
  assert.equal(out.worst, "OK");
  assert.deepEqual(out.findings, []);
  assert.equal(out.checked, 2);
});

test("it re-derives nothing — it reads what each lane says about itself", () => {
  // A second opinion computed here would be a second thing to drift from the lane artifact. The
  // watchdog's whole value is spotting statements that cannot both be true, not recomputing them.
  const src = fs.readFileSync(new URL("./lane-staleness.mjs", import.meta.url), "utf8");
  for (const forbidden of [/risk-ladder/, /readFileSync/, /labEligibility/]) {
    assert.doesNotMatch(src, forbidden, `the staleness rule must not read artifacts itself: ${forbidden}`);
  }
});
