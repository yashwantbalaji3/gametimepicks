import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { frameValue, decelerate } from "./number-transition.mjs";

test("a transition starts where it was, ends exactly on the target, and never overshoots", () => {
  assert.equal(frameValue(0, 100, 0, 480), 0);
  assert.equal(frameValue(0, 100, 480, 480), 100, "lands exactly, not a cent short");
  assert.equal(frameValue(0, 100, 999, 480), 100, "past the end stays at the end");
  const mid = frameValue(0, 100, 240, 480);
  assert.ok(mid > 0 && mid < 100, `mid-flight is between: ${mid}`);
  assert.equal(frameValue(40, 10, 480, 480), 10, "downward too");
});

test("zero duration is an instant jump — the reduced-motion path", () => {
  assert.equal(frameValue(0, 100, 0, 0), 100);
});

test("the curve decelerates: more distance is covered early than late", () => {
  assert.ok(decelerate(0.25) > 0.25, "front-loaded");
  assert.equal(decelerate(1), 1);
  assert.equal(decelerate(0), 0);
});

test("the role's rule is enforced at the call sites: only reader-driven numbers animate", () => {
  const root = process.cwd();
  const users = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name) && fs.readFileSync(p, "utf8").includes("<AnimatedNumber")) users.push(path.relative(root, p));
    }
  };
  walk(path.join(root, "src"));
  /*
   * Every file here must animate a number the READER just changed. A published figure — a settled
   * record, a graded price, a committed projection — may never appear in this list: animating one
   * implies it is being computed now, when it was computed once and committed.
   */
  const ALLOWED = ["src/components/ui/stake-payout-input.tsx"];
  assert.deepEqual(users.sort(), ALLOWED.sort(), "a new caller must be reviewed against the number-transition role");
});
