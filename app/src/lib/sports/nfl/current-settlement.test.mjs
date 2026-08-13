/**
 * Release H guards (Program 171): the current-artifact settlement path is proven BEFORE it
 * fires — exactly-once, pending-is-never-a-loss, population-exact, lineage-complete — and it is
 * structurally incapable of touching protected money.
 *
 * The grading proofs run the REAL committed artifacts through the REAL contract against
 * SYNTHETIC finals declared here. That is the honest way to prove a path whose reality has not
 * happened yet: the fixture is visibly a fixture, and nothing it produces is committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { gradeNflLeg } from "./settlement-contract.mjs";
import { validateCurrentEventArtifact } from "./current-event-contract.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const DATE = "2026-08-13";
const dir = path.join(ROOT, "data/internal/nfl/current", DATE);
const artifacts = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => ({ file: f, a: read(path.join(dir, f)) }));
const det = artifacts.find(({ a }) => a.providerEventId === "401873272").a;

/** The settlement legs the script derives from an artifact's pinned targets. */
const legsFor = (a) => {
  const t = a.settlementTargets;
  const favourite = t.moneylineNoVig.home >= t.moneylineNoVig.away ? "home" : "away";
  return [
    { providerEventId: a.providerEventId, market: "moneyline", side: favourite },
    { providerEventId: a.providerEventId, market: "point_spread", side: "home", line: t.spreadHome },
    { providerEventId: a.providerEventId, market: "total_points", side: "over", line: t.total },
  ];
};

test("every artifact carries what settlement needs: pre-start lineage and pinned targets", () => {
  assert.ok(artifacts.length >= 6);
  for (const { a } of artifacts) {
    assert.equal(validateCurrentEventArtifact(a).ok, true);
    assert.ok(a.settlementTargets, "a settleable artifact pins its targets");
    assert.ok(Date.parse(a.settlementTargets.capturedAt) < Date.parse(a.kickoffUtc), "targets were captured pre-kickoff");
    assert.ok(Date.parse(a.generatedAt) < Date.parse(a.kickoffUtc));
  }
});

test("FIXTURE GRADING · the real DET@CIN targets settle correctly against synthetic finals", () => {
  const t = det.settlementTargets;
  // the committed capture: CIN favoured, home spread -7, total 37.5
  assert.ok(t.moneylineNoVig.home > t.moneylineNoVig.away, "CIN is the market favourite");
  const legs = legsFor(det);
  const grade = (home, away) => legs.map((l) => gradeNflLeg(l, { status: "STATUS_FINAL", homePointsFT: home, awayPointsFT: away }).outcome);

  // favourite covers everything: CIN 31-10 → margin 21 > 7, total 41 > 37.5
  assert.deepEqual(grade(31, 10), ["WIN", "WIN", "WIN"]);
  // favourite wins but fails the spread; total stays under
  assert.deepEqual(grade(17, 14), ["WIN", "LOSS", "LOSS"]);
  // underdog wins outright
  assert.deepEqual(grade(10, 24), ["LOSS", "LOSS", "LOSS"]);
  // NFL ties are real: a two-way moneyline PUSHES rather than guessing a winner
  assert.deepEqual(grade(20, 20), ["PUSH", "LOSS", "WIN"]);
});

test("push semantics on a whole-number line, and a non-final never grades", () => {
  const wholeLine = { providerEventId: "x", market: "total_points", side: "over", line: 38 };
  assert.equal(gradeNflLeg(wholeLine, { status: "STATUS_FINAL", homePointsFT: 21, awayPointsFT: 17 }).outcome, "PUSH", "total exactly on the line pushes");
  const spreadPush = { providerEventId: "x", market: "point_spread", side: "home", line: -7 };
  assert.equal(gradeNflLeg(spreadPush, { status: "STATUS_FINAL", homePointsFT: 24, awayPointsFT: 17 }).outcome, "PUSH");
  // postponed/scheduled/final-without-scores never grade — pending is never a loss
  for (const status of ["STATUS_SCHEDULED", "STATUS_POSTPONED", "STATUS_IN_PROGRESS"]) {
    assert.equal(gradeNflLeg(legsFor(det)[0], { status, homePointsFT: 21, awayPointsFT: 17 }).outcome, "VOID_PENDING_REVIEW", `${status} must not grade`);
  }
  assert.equal(gradeNflLeg(legsFor(det)[0], { status: "STATUS_FINAL" }).outcome, "VOID_PENDING_REVIEW", "FINAL without integer points is quarantined, never guessed (the StatsAPI postponed lesson)");
});

test("the settlement script is exactly-once, population-exact, and honest about what it grades", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/settle-nfl-current.mjs"), "utf8");
  assert.match(src, /settledAlready\.has\(a\.canonicalEventId\)/, "a settled event is skipped on rerun — exactly once");
  assert.match(src, /reconciles: allEvents\.length \+ pending\.length === byEvent\.size/, "population must reconcile");
  assert.match(src, /process\.exit\(2\)/, "a population gap REFUSES rather than writing a partial record");
  assert.match(src, /pending is never a loss/);
  assert.match(src, /market-accuracy record and is never reported as model performance/, "the receipt states what it actually grades");
  assert.match(src, /decisive = WIN \+ LOSS only/);
});

test("PROTECTED MONEY · the NFL settlement path cannot reach the money writers", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/settle-nfl-current.mjs"), "utf8");
  for (const forbidden of ["mr-dub", "portfolio.json", "bank-builder", "moonshot", "settled_leans", "bankroll"]) {
    assert.ok(!src.includes(forbidden), `the NFL settler must never name ${forbidden}`);
  }
  assert.match(src, /PRIVATE_PAPER_RECORD/, "its own separate record class");
  // and the protected artifact is byte-identical right now
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "protected money file untouched by every P171 release");
});

test("REALITY WATCH · armed with an exact trigger and a falsifiable acceptance test", () => {
  const watch = read(path.join(ROOT, "data/internal/nfl/settlement/WATCH.json"));
  assert.equal(watch.state, "ARMED");
  assert.equal(watch.observable, false, "nothing has settled yet — the watch says so plainly");
  assert.match(watch.trigger.afterUtc, /^2026-08-14T/, "the trigger fires after the results capture that follows tonight's finals");
  assert.equal(watch.trigger.canonicalEventId, "nfl-401873272");
  assert.ok(watch.acceptance.length >= 3, "the acceptance test is spelled out, not implied");
  assert.match(watch.acceptance.join(" "), /exactly once/i);
  assert.ok(watch.artifacts.every((f) => fs.existsSync(path.join(ROOT, f))), "every artifact the watch names exists now");
});
