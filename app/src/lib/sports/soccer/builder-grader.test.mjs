/**
 * Soccer V2 · C-4 — the league builder publishes only the model its league's preregistration tested, with the
 * holdout that preregistration named; the grader never grades a 90-minute forecast on an extra-time or
 * penalty score.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { regulationFinal } from "./grading.mjs";
import { SOCCER_LEAGUES } from "./leagues.mjs";
import { EPL_MODEL_ID } from "../epl/strength-state.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));
const src = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

const ev = (type, home = "2", away = "1") => ({ id: "1", status: { type }, competitions: [{ competitors: [{ homeAway: "home", score: home }, { homeAway: "away", score: away }] }] });

test("🔴 regulationFinal: not completed → nothing; full time → the score; extra time / penalties / unreadable → refused", () => {
  assert.equal(regulationFinal(ev({ completed: false, name: "STATUS_SCHEDULED" })), null);
  assert.deepEqual(regulationFinal(ev({ completed: true, name: "STATUS_FULL_TIME", detail: "FT" })), { final: { home: 2, away: 1 } });
  assert.equal(regulationFinal(ev({ completed: true, name: "STATUS_FINAL_AET", detail: "AET" }, "3", "2")).refused, true);
  assert.equal(regulationFinal(ev({ completed: true, name: "STATUS_FINAL_PEN", detail: "FT-Pens" }, "1", "1")).refused, true);
  assert.equal(regulationFinal(ev({ completed: true, name: "STATUS_FINAL", detail: "Final after extra time" })).refused, true);
  assert.equal(regulationFinal(ev({ completed: true, name: "STATUS_FULL_TIME" }, "", "1")).refused, true, "an unreadable score is refused, never a 0");
});

test("🔴 the grader asks the one rule and parses no score of its own", () => {
  const g = src("scripts/soccer/grade-league-forecasts.mjs");
  assert.match(g, /const f = regulationFinal\(e\);/);
  assert.doesNotMatch(g, /Number\.parseInt\(h\?\.score/, "no second score parser");
});

test("🔴 every publishing league's validation evidence names THIS model and a scored holdout — the builder's refusals cannot fire on the committed tree", () => {
  const pub = SOCCER_LEAGUES.filter((l) => (l.stage === "ACCEPTED_V1" || l.stage === "LIVE") && l.key !== "epl");
  assert.ok(pub.length > 0);
  for (const l of pub) {
    const prereg = read(l.validation.preregistration);
    const report = read(l.validation.report);
    assert.equal(String(prereg.whatIsBeingTested.model).split(/\s/)[0], EPL_MODEL_ID, `${l.key}: the preregistration tested the model that publishes`);
    const hold = prereg.seasons.holdout;
    assert.ok(report.scores.poisson.bySeason[hold] && report.scores.empirical.bySeason[hold], `${l.key}: holdout ${hold} is scored`);
    const latest = JSON.parse(fs.readFileSync(path.join(APP, "public/data/soccer", l.key, "forecasts/latest.json"), "utf8"));
    assert.equal(latest.validation.holdout.season, hold, `${l.key}: the published artifact's holdout is the one the preregistration named (output unchanged)`);
  }
  const b = src("scripts/soccer/build-league-forecasts.mjs");
  assert.match(b, /if \(testedModel !== EPL_MODEL_ID\)/);
  assert.doesNotMatch(b, /bySeason\["2025-26"\]/, "no hard-coded holdout season");
  assert.match(b, /path\.join\(ROOT, L\.validation\.report\)/, "the report path is the registry's");
});
