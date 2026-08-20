/**
 * The `owner` stage is the easiest of the twelve to fake — a name in a document reads as ownership
 * and does nothing. These assertions are what separate a named owner from a real one: the workflow
 * must EXIST, must be SCHEDULED, and must be able to reach a human.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { SPORT_OWNERS, OWNED_SPORTS, ESCALATION, ownerFor } from "./sport-owners.mjs";

const REPO = path.join(process.cwd(), "..");
const WF = path.join(REPO, ".github/workflows");
const read = (f) => fs.readFileSync(path.join(WF, f), "utf8");

test("every named owning workflow actually exists", () => {
  for (const [sport, o] of Object.entries(SPORT_OWNERS)) {
    for (const key of ["primary", "settlement"]) {
      if (o[key] == null) continue;
      const f = path.join(WF, o[key]);
      assert.ok(fs.existsSync(f), `${sport}.${key} names ${o[key]}, which does not exist — an owner that is not a real job is a label`);
    }
  }
});

test("every owning workflow is SCHEDULED, not dispatch-only", () => {
  // A job that only ever runs when a human clicks it has no daily owner; the human IS the owner, and
  // that is exactly the state this stage exists to distinguish from automation.
  for (const [sport, o] of Object.entries(SPORT_OWNERS)) {
    if (o.primary == null) {
      // An unowned sport must SAY SO. Skipping silently is how "nobody owns this" becomes invisible.
      assert.ok(o.unownedReason && o.unownedReason.length > 20, `${sport}: no primary owner must carry a stated reason`);
      continue;
    }
    const src = read(o.primary);
    assert.match(src, /cron:/, `${sport}: ${o.primary} carries no cron — it cannot own a daily run`);
  }
});

test("failures can reach a human — the escalation path is real and wired", () => {
  assert.ok(fs.existsSync(path.join(REPO, ESCALATION.script)), `${ESCALATION.script} must exist`);
  // Named in the settler, or an owner's failure goes to a log nobody reads.
  const settlers = new Set(Object.values(SPORT_OWNERS).map((o) => o.settlement));
  for (const s of settlers) {
    assert.match(read(s), new RegExp(ESCALATION.secret), `${s} must wire ${ESCALATION.secret}`);
  }
});

test("settlement has exactly ONE owner across all sports", () => {
  // A per-sport settler would be a second writer to the money chain. This repo has one by design.
  const settlers = new Set(Object.values(SPORT_OWNERS).map((o) => o.settlement));
  assert.equal(settlers.size, 1, `settlement must have one owner, found: ${[...settlers].join(", ")}`);
});

test("ownerFor answers, and reports an unowned sport as null rather than guessing", () => {
  assert.equal(ownerFor("UFC").primary, "ufc-fight-week.yml", "lookup is case-insensitive");
  for (const s of OWNED_SPORTS) assert.ok(ownerFor(s), `${s} must resolve`);
  for (const bad of ["cricket", "", null, undefined]) assert.equal(ownerFor(bad), null);
});
