/**
 * P185 · B4 — THE MOTION ROLE CONTRACT, GUARDED.
 *
 * The colour half of this programme learned that a system only holds if the count that measures it
 * is pinned. Motion is the same: 44 keyframes and zero named tokens is how six interaction
 * durations and four near-identical decelerate curves accumulate without anyone deciding to.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { MOTION_ROLES, ESSENTIAL_ROLES, EASING, durationVar, easingVar, motionTokenBlock }
  from "./motion-roles.mjs";

const APP = process.cwd();
const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");

test("the charter's eleven roles all exist, and each states why it moves", () => {
  const expected = ["ambient", "entrance", "exit", "emphasis", "progress", "state-change",
                    "number-transition", "chart-draw", "hover-focus", "disclosure", "route-transition"];
  assert.deepEqual([...MOTION_ROLES.map((r) => r.role)].sort(), [...expected].sort());
  for (const r of MOTION_ROLES) {
    assert.equal(typeof r.duration, "number", `${r.role} needs a duration`);
    assert.ok(r.easing, `${r.role} needs an easing`);
    assert.ok(typeof r.distance === "string", `${r.role} needs a distance`);
    assert.ok(r.budget && r.budget.length > 10, `${r.role} needs a performance budget`);
    assert.ok(r.reason && r.reason.length > 30, `${r.role} needs a reason to exist`);
    /* The load-bearing field. A role without a stated limit is one a future author will overuse. */
    assert.ok(r.forbidden && r.forbidden.length > 20, `${r.role} must state what it may NOT do`);
  }
});

test("CSS and the contract cannot drift apart", () => {
  /* The block in globals.css is GENERATED from this module. If someone edits one, this fails. */
  for (const line of motionTokenBlock().split("\n")) {
    assert.ok(css.includes(line.trim()), `globals.css is missing: ${line.trim()}`);
  }
});

test("reduced motion follows the roles — it is not a blanket off-switch", () => {
  /*
   * The charter: reduced mode "removes nonessential spatial/looping movement but KEEPS focus,
   * progress, state and loading feedback understandable". Turning everything off fails the second
   * half — a user who asked for less motion still needs to know a control took focus.
   */
  const i = css.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(i > -1, "a reduced-motion contract must exist");
  const block = css.slice(i, css.indexOf("\n}", css.indexOf("}", i)) + 2);

  for (const role of ESSENTIAL_ROLES) {
    if (role === "disclosure") continue;                       // shortened, asserted below
    assert.ok(!block.includes(durationVar(role)),
      `${role} is overridden under reduced motion — its motion IS the feedback, so it must survive`);
  }
  for (const r of MOTION_ROLES.filter((x) => x.reduced === "remove")) {
    assert.ok(block.includes(`${durationVar(r.role)}: 0.01ms`),
      `${r.role} is spatial/looping decoration and must be removed under reduced motion`);
  }
  assert.match(block, /--motion-disclosure-duration: 80ms/,
    "disclosure is shortened, not removed — the direction still says what opened");
});

test("progress has no constant duration, because its duration is data", () => {
  /* A progress animation with a hard-coded length is a loading bar that lies. */
  const progress = MOTION_ROLES.find((r) => r.role === "progress");
  assert.equal(progress.duration, 0);
  assert.equal(progress.easing, EASING.linear, "elapsed work moves at a constant rate or it misleads");
  assert.equal(progress.reduced, "keep");
});

test("no role may imply a deterministic artifact is being recomputed", () => {
  /*
   * The product publishes fixed artifacts. The charter bans "fake reroll animation, arbitrary
   * jitter or cosmetic differentiation", and the two roles that could smuggle it in say so.
   */
  const num = MOTION_ROLES.find((r) => r.role === "number-transition");
  assert.match(num.forbidden, /NEVER count up to a deterministic published number/);
  const chart = MOTION_ROLES.find((r) => r.role === "chart-draw");
  assert.match(chart.forbidden, /resampling|re-render/);
  const prog = MOTION_ROLES.find((r) => r.role === "progress");
  assert.match(prog.forbidden, /finished or unavailable/);
});

test("one decelerate curve replaces the four that had accumulated", () => {
  const curves = new Set(Object.values(EASING));
  assert.equal(curves.size, 3, "three curves: decelerate, standard, linear — no near-duplicates");
  assert.equal(EASING.decelerate, "cubic-bezier(0.22, 0.61, 0.36, 1)",
    "the canonical decelerate is the one that was already most used (x11)");
});

test("the token layer is declared once, at :root, not scoped to a component", () => {
  const first = css.indexOf(durationVar("hover-focus"));
  const rootAt = css.lastIndexOf(":root", first);
  assert.ok(rootAt > -1 && first - rootAt < 20000,
    "motion tokens must live on :root so every surface reads the same contract");
});
