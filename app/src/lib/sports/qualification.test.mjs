/**
 * `qualification` asks for a policy APPLIED BY CODE with no-play as a first-class outcome. A registry
 * that merely lists states satisfies a reader and proves nothing, so every assertion here is read
 * against the sport's actual module.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { QUALIFICATION, QUALIFIED_SPORTS, LADDER, LADDER_STATES, NO_PLAY_STATES, canDecline } from "./qualification.mjs";

const APP = process.cwd();
const src = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
/** The states a module actually emits, read from its own `state: "X"` literals. */
const emitted = (rel) => [...new Set([...src(rel).matchAll(/state:\s*"([A-Z_]+)"/g)].map((m) => m[1]))].sort();

test("every named policy module exists", () => {
  for (const [sport, q] of Object.entries(QUALIFICATION)) {
    assert.ok(fs.existsSync(path.join(APP, q.module)), `${sport}: ${q.module} does not exist`);
  }
});

test("the registry matches what each module actually emits — no drift in either direction", () => {
  for (const [sport, q] of Object.entries(QUALIFICATION)) {
    assert.deepEqual(emitted(q.module), [...q.states].sort(),
      `${sport}: the registry and ${q.module} disagree about which rungs exist`);
  }
});

test("THE VOCABULARY IS CLOSED — no sport may invent a rung", () => {
  // A MODELLED_EXPERIMENTAL state was once added outside the closed coverage axis so a sport would
  // read as further along than its evidence supported. A new rung belongs in qualification.mjs,
  // reviewed — never as a local string in one sport's module.
  for (const [sport, q] of Object.entries(QUALIFICATION)) {
    for (const s of emitted(q.module)) {
      assert.ok(LADDER_STATES.includes(s), `${sport}: ${q.module} emits "${s}", which is not in the shared ladder`);
    }
  }
});

test("no-play is a FIRST-CLASS outcome, reachable in every sport", () => {
  assert.ok(NO_PLAY_STATES.length >= 3, "a ladder that can barely decline is not a policy");
  for (const sport of QUALIFIED_SPORTS) {
    assert.ok(canDecline(sport), `${sport}: the policy must be able to decline, or it is not a policy`);
    const declining = QUALIFICATION[sport].states.filter((s) => !LADDER[s].play);
    assert.ok(declining.length >= 2, `${sport}: only ${declining.length} declining rung(s) — too few to distinguish why`);
  }
});

test("every rung states WHY, so an abstention is auditable rather than a silent gap", () => {
  for (const [state, def] of Object.entries(LADDER)) {
    assert.equal(typeof def.play, "boolean", `${state} must declare whether it publishes`);
    assert.ok(def.meaning && def.meaning.length > 40, `${state}: a rung without a stated reason cannot be audited`);
  }
});
