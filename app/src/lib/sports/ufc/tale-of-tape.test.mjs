/**
 * Tale-of-the-tape loader for the bout page (UFC-001 UX Phase B): age at the event, ESPN's 0 / "--" as missing, and
 * a reason for every gap.
 *
 * Run: npx tsx --test src/lib/sports/ufc/tale-of-tape.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  ageAtEvent, easternDate, formatHeight, formatReach, indexTaleOfTheTape, loadTaleOfTheTape, tapeFor, MISSING,
} from "./tale-of-tape.mjs";

test("age at the event counts completed years, turning over ON the birthday", () => {
  assert.equal(ageAtEvent("1995-12-28", "2026-10-10"), 30, "birthday later in the year: not yet 31");
  assert.equal(ageAtEvent("1995-07-24", "2026-10-10"), 31, "birthday earlier in the year");
  assert.equal(ageAtEvent("1990-10-10", "2026-10-10"), 36, "on the birthday itself");
  assert.equal(ageAtEvent("1990-10-11", "2026-10-10"), 35, "the day before the birthday");
  assert.equal(ageAtEvent("1992-02-29", "2026-02-28"), 33, "leap-day birth: not yet a year older on 28 Feb");
  assert.equal(ageAtEvent("1992-02-29", "2026-03-01"), 34);
});

test("age is null, never a guess, when an input is missing, malformed or implausible", () => {
  assert.equal(ageAtEvent(null, "2026-10-10"), null);
  assert.equal(ageAtEvent("1995-12-28", null), null);
  assert.equal(ageAtEvent("12/28/1995", "2026-10-10"), null);
  assert.equal(ageAtEvent("2020-01-01", "2026-10-10"), null, "a 6-year-old is a typo, not a fighter");
  assert.equal(ageAtEvent("1900-01-01", "2026-10-10"), null);
});

test("the event date is the US Eastern calendar day, so a 00:00Z main event is still Saturday's", () => {
  assert.equal(easternDate("2026-10-11T00:00Z"), "2026-10-10");
  assert.equal(easternDate("2026-10-10T21:00Z"), "2026-10-10");
  assert.equal(easternDate("not a date"), null);
});

test("height and reach format with their units", () => {
  assert.equal(formatHeight(74), "6′2″ (74 in)");
  assert.equal(formatHeight(72), "6′0″ (72 in)");
  assert.equal(formatHeight(65.5), "5′5.5″ (65.5 in)");
  assert.equal(formatReach(71.5), "71.5 in");
});

const DOC = {
  generatedAt: "2026-08-18T02:55:35Z",
  caveat: "Self-reported and static.",
  fighters: [
    { athleteId: "1", name: "Full", heightIn: 74, reachIn: 75, stance: "Orthodox", dateOfBirth: "1995-12-28" },
    { athleteId: "2", name: "Zeros", heightIn: 0, reachIn: 0, stance: "--", dateOfBirth: null },
    { athleteId: "3", name: "Dup", heightIn: 70, reachIn: 70, stance: "Southpaw", dateOfBirth: "1990-01-01" },
    { athleteId: "3", name: "Dup", heightIn: 70, reachIn: 70, stance: "Southpaw", dateOfBirth: "1990-01-01" },
    { athleteId: "4", name: "Clash", heightIn: 70, reachIn: 70, stance: "Southpaw", dateOfBirth: "1990-01-01" },
    { athleteId: "4", name: "Clash", heightIn: 71, reachIn: 70, stance: "Southpaw", dateOfBirth: "1990-01-01" },
    { athleteId: "5", name: "Bad DOB", heightIn: 70, reachIn: 72, stance: "Switch", dateOfBirth: "1990-13" },
  ],
};

test("a complete entry renders every field", () => {
  const ix = indexTaleOfTheTape(DOC);
  assert.equal(ix.asOf, "2026-08-18");
  const t = tapeFor(ix, "1", "2026-10-10");
  assert.equal(t.found, true);
  assert.deepEqual([t.age.display, t.height.display, t.reach.display, t.stance.display], ["30", "6′2″ (74 in)", "75 in", "Orthodox"]);
  for (const k of ["age", "height", "reach", "stance"]) assert.equal(t[k].reason, null);
});

test("ESPN's 0 and '--' are MISSING with a reason, never a 0-inch reach", () => {
  const t = tapeFor(indexTaleOfTheTape(DOC), "2", "2026-10-10");
  assert.equal(t.found, true);
  for (const k of ["age", "height", "reach", "stance"]) assert.equal(t[k].display, null, `${k} is missing`);
  assert.equal(t.height.reason, MISSING.HEIGHT);
  assert.equal(t.reach.reason, MISSING.REACH);
  assert.equal(t.stance.reason, MISSING.STANCE);
  assert.equal(t.age.reason, MISSING.DOB);
  assert.equal(tapeFor(indexTaleOfTheTape(DOC), "5", "2026-10-10").age.reason, MISSING.DOB_UNUSABLE);
  assert.equal(tapeFor(indexTaleOfTheTape(DOC), "1", null).age.reason, MISSING.EVENT_DATE);
});

test("identical duplicate rows collapse; conflicting ones are a gap, not a choice", () => {
  const ix = indexTaleOfTheTape(DOC);
  assert.equal(tapeFor(ix, "3", "2026-10-10").height.display, "5′10″ (70 in)");
  const c = tapeFor(ix, "4", "2026-10-10");
  assert.equal(c.found, false);
  assert.equal(c.height.display, null);
  assert.equal(c.height.reason, MISSING.CONFLICT);
});

test("an unlisted fighter and an absent file each say which gap it is", () => {
  const u = tapeFor(indexTaleOfTheTape(DOC), "999", "2026-10-10");
  assert.equal(u.found, false);
  assert.equal(u.reach.reason, MISSING.NOT_LISTED);
  const f = tapeFor(null, "1", "2026-10-10");
  assert.equal(f.stance.reason, MISSING.FILE);
  assert.equal(indexTaleOfTheTape({}), null);
  assert.equal(loadTaleOfTheTape("/nonexistent-root"), null, "an unreadable file is null, not a thrown build");
});

test("the committed pull loads, keyed by ESPN athlete id, with its own as-of date", () => {
  const ix = loadTaleOfTheTape(path.join(process.cwd(), ".."));
  assert.ok(ix, "the tale-of-the-tape file is readable from the app's build root");
  assert.equal(ix.asOf, "2026-08-18");
  assert.ok(ix.byId.size > 2000, `indexed ${ix.byId.size} fighters`);
  const allen = tapeFor(ix, "4025699", easternDate("2026-10-11T00:00Z"));
  assert.deepEqual([allen.age.display, allen.height.display, allen.reach.display, allen.stance.display], ["30", "6′2″ (74 in)", "75 in", "Orthodox"]);
});
