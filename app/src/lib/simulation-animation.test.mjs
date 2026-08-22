/**
 * SIMULATION ANIMATION (Phase 6) — the 10-second, sport-specific "Generate Simulation" staging.
 *
 * These pin the NEW client animation + its wiring into the runner:
 *   1. `SIMULATION_MIN_DURATION_MS === 10000`.
 *   2. `SIMULATION_STAGES` has 8 labels and ends with "Simulation complete".
 *   3. `stageAtElapsed` — t=0 → stage 0; just before the min duration → NOT the final "complete" stage
 *      (dashboard hidden before 10s); at/after the min duration → the final stage (dashboard allowed).
 *   4. The runner GATES the done-phase on `SIMULATION_MIN_DURATION_MS` and does NOT set "done" on a
 *      sub-10s timer.
 *   5. The animation source renders a baseball DIAMOND (bases + mound markers) for MLB.
 *   6. The checklist renders all 8 stages.
 *   7. Run-count copy is gated on `allowsRunCountClaim`.
 *   8. A reduced-motion guard exists and does NOT gate the stage sequence.
 *   9. NO banned copy in the new component + the runner.
 *  10. Canonical money file is untouched (portfolio.json md5).
 *
 * The pure `stageAtElapsed` timing is exercised WITHOUT real timers (it takes elapsed as an argument).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  SIMULATION_MIN_DURATION_MS,
  SIMULATION_STAGES,
  stageAtElapsed,
} from "../components/game/simulation-animation.tsx";

const app = process.cwd();
const ANIM_SRC = fs.readFileSync(path.join(app, "src/components/game/simulation-animation.tsx"), "utf8");
const RUNNER_SRC = fs.readFileSync(path.join(app, "src/components/game/game-simulation-runner.tsx"), "utf8");

// The house honest-language ban. `\bsafe\b` / `\block\b` are whole words — "block"/"unlock" are fine.
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|can'?t lose|sure thing|risk-?free|free money|easy money|Monte Carlo|live betting/i;

// ── 1 · the min duration is exactly 10 seconds ───────────────────────────────────────────────────
test("SIMULATION_MIN_DURATION_MS is exactly 10000ms", () => {
  assert.equal(SIMULATION_MIN_DURATION_MS, 10000);
});

// ── 2 · eight stages, ending with the completion label ───────────────────────────────────────────
test("SIMULATION_STAGES has 8 labels and ends with 'Simulation complete'", () => {
  assert.equal(SIMULATION_STAGES.length, 8);
  assert.equal(SIMULATION_STAGES[SIMULATION_STAGES.length - 1], "Simulation complete");
  assert.ok(SIMULATION_STAGES.includes("Simulation complete"));
});

// ── 3 · the pure stage-timing helper gates the final stage on the full duration ──────────────────
test("stageAtElapsed: t=0 → stage 0; just before 10s → NOT final; at/after 10s → final", () => {
  const n = SIMULATION_STAGES.length;
  const total = SIMULATION_MIN_DURATION_MS;
  const last = n - 1;

  // t=0 → the first stage.
  assert.equal(stageAtElapsed(0, n, total), 0);
  assert.equal(stageAtElapsed(-50, n, total), 0, "negative elapsed clamps to the first stage");

  // Just before the min duration → an intermediate stage, NEVER the final "complete" stage.
  const justBefore = stageAtElapsed(total - 1, n, total);
  assert.ok(justBefore < last, `just before 10s must be < final stage (got ${justBefore})`);
  assert.notEqual(justBefore, last, "the dashboard-allowing final stage must NOT show before 10s");

  // A mid-point elapsed is somewhere in the pre-completion range.
  const mid = stageAtElapsed(total / 2, n, total);
  assert.ok(mid >= 0 && mid < last, "mid animation is a pre-completion stage");

  // At / after the min duration → the final "complete" stage (dashboard allowed).
  assert.equal(stageAtElapsed(total, n, total), last, "exactly 10s reaches the final stage");
  assert.equal(stageAtElapsed(total + 500, n, total), last, "past 10s stays on the final stage");

  // The stage index is monotonic non-decreasing across the window (deterministic staging).
  let prev = -1;
  for (let t = 0; t <= total; t += 250) {
    const s = stageAtElapsed(t, n, total);
    assert.ok(s >= prev, `stage must not go backwards (t=${t}, ${s} < ${prev})`);
    assert.ok(s >= 0 && s <= last, "stage index in range");
    prev = s;
  }
});

// ── 4 · the runner gates the done-phase on the constant, never a sub-10s timer ───────────────────
test("the runner gates the done-phase on SIMULATION_MIN_DURATION_MS (no sub-10s done timer)", () => {
  // The runner imports + references the min-duration constant.
  assert.match(RUNNER_SRC, /SIMULATION_MIN_DURATION_MS/, "runner references the min-duration constant");
  // It flips to the done dashboard.
  assert.match(RUNNER_SRC, /setPhase\("done"\)/, "runner flips to the done phase");

  // Every setTimeout that sets phase "done" MUST use the constant as its delay — never a numeric literal.
  // Find each `window.setTimeout(() => { ... setPhase("done") ... }, <delay>)` and assert the delay is the constant.
  const doneTimerRe = /window\.setTimeout\(\s*\(\)\s*=>\s*\{[^}]*setPhase\("done"\)[^}]*\},\s*([A-Za-z0-9_.]+)\s*\)/g;
  const matches = [...RUNNER_SRC.matchAll(doneTimerRe)];
  assert.ok(matches.length >= 1, "expected a setTimeout that reveals the dashboard");
  for (const m of matches) {
    assert.equal(m[1], "SIMULATION_MIN_DURATION_MS", `done-phase timer delay must be the constant, got "${m[1]}"`);
  }

  // Belt-and-suspenders: no numeric-literal timer sets the done phase (guards against a sub-10s regression).
  assert.doesNotMatch(
    RUNNER_SRC,
    /window\.setTimeout\(\s*\(\)\s*=>\s*\{[^}]*setPhase\("done"\)[^}]*\},\s*\d+\s*\)/,
    "the done phase must NOT be set on a numeric (sub-10s) timer",
  );
  // The old fast reveal path is gone.
  assert.doesNotMatch(RUNNER_SRC, /STEP_MS|RevealSequence|REVEAL_STEPS/, "the old sub-10s reveal path is removed");

  // The runner renders the new animation for MLB.
  assert.match(RUNNER_SRC, /<SportSimulationAnimation sport=\{view\.sport\} view=\{view\} stage=\{stage\}/, "runner renders the sport animation, dispatched on the real view.sport");
});

// ── 5 · the animation renders a baseball diamond for MLB ─────────────────────────────────────────
test("the animation source renders a baseball diamond (bases + mound) for MLB", () => {
  assert.match(ANIM_SRC, /diamond/i, "a diamond is drawn");
  assert.match(ANIM_SRC, /\bmound\b/i, "the pitcher's mound is drawn");
  assert.match(ANIM_SRC, /\bbase\b/i, "the bases are drawn");
  assert.match(ANIM_SRC, /home plate/i, "home plate is drawn");
  // It is an inline SVG (self-contained, no external asset).
  assert.match(ANIM_SRC, /<svg/, "the diamond is an inline SVG");
  assert.match(ANIM_SRC, /<polygon[^>]*points=/, "the diamond shape / bases use polygons");
  /*
   * The dispatcher defaults to MLB. It used to be true that ONLY a non-MLB sport skipped the
   * diamond, because nothing else had a graphic; NFL, soccer and UFC now have their own surfaces, so
   * pinning that branch condition pinned the absence of the other three.
   *
   * What still has to hold — and is the reason this test exists — is that the diamond belongs to
   * baseball and nothing else reaches it.
   */
  assert.match(ANIM_SRC, /function BaseballSimulationAnimation/, "the baseball animation exists");
  assert.match(ANIM_SRC, /code !== "mlb"/, "a sport with no surface of its own does not fall into baseball");
  assert.match(ANIM_SRC, /return <BaseballSimulationAnimation/, "mlb is the default");
  // No other sport may be routed to the diamond.
  const lookup = /const FIELD_BY_SPORT[^}]*}/.exec(ANIM_SRC)?.[0] ?? "";
  assert.doesNotMatch(lookup, /Diamond|Baseball/, "the surface lookup never points a sport at the diamond");
});

// ── 6 · the checklist renders all 8 stages ───────────────────────────────────────────────────────
test("the checklist renders all 8 stages", () => {
  assert.match(ANIM_SRC, /SIMULATION_STAGES\.map/, "the checklist maps over the stage list");
  // Every stage label is present verbatim in the source (the exported array is the single source).
  for (const label of SIMULATION_STAGES) {
    assert.ok(ANIM_SRC.includes(label), `stage label present: "${label}"`);
  }
});

// ── 7 · run-count copy gated on allowsRunCountClaim ──────────────────────────────────────────────
test("run-count copy is gated on allowsRunCountClaim (no fabricated N-run claim)", () => {
  assert.match(ANIM_SRC, /view\.allowsRunCountClaim && view\.runCount != null/, "run count gated on allowsRunCountClaim");
  assert.match(ANIM_SRC, /: "model simulation"/, "falls back to a plain 'model simulation' label");
  // No sampling-method name and no hard-coded fabricated run-count CLAIM (e.g. "10,000-run" / "10,000 runs").
  assert.doesNotMatch(ANIM_SRC, /monte[\s-]?carlo/i, "no sampling-method name claim");
  assert.doesNotMatch(ANIM_SRC, /10[,.]?000[\s-]?(?:run|runs|simulation)/i, "no fabricated 10,000-run claim");
});

// ── 8 · a reduced-motion guard exists and does NOT gate the stage sequence ───────────────────────
test("a reduced-motion guard exists and does not gate the stage sequence", () => {
  assert.match(ANIM_SRC, /prefers-reduced-motion/, "a prefers-reduced-motion guard exists");
  // The reduced-motion rule disables the moving BALL only (animation: none on the ball), not the stages.
  assert.match(
    ANIM_SRC,
    /@media \(prefers-reduced-motion: reduce\)[^}]*\.gtp-sim-ball\s*\{\s*animation:\s*none/,
    "reduced motion stops the ball's motion",
  );
  // The reduced-motion guard is a CSS media query (it disables the ball's motion) — it is never a
  // JS/TSX conditional around the stage sequence. There is a real `@media (prefers-reduced-motion: reduce)`
  // rule, and NO reduced-motion / matchMedia branch wraps the render of the stage checklist.
  const cssMediaCount = (ANIM_SRC.match(/@media \(prefers-reduced-motion: reduce\)/g) || []).length;
  assert.ok(cssMediaCount >= 1, "a CSS @media (prefers-reduced-motion: reduce) guard exists");
  // No stage sequence is behind a reduced-motion check: the animation must not read matchMedia at all
  // (the reduced-motion handling is purely CSS), so the stages always advance + render.
  assert.doesNotMatch(ANIM_SRC, /matchMedia|useReducedMotion/, "reduced motion is handled in CSS, never a JS gate on the stages");
  // The checklist is rendered unconditionally in both animation shells, and its render call is not
  // preceded on the same line by a reduced-motion conditional.
  assert.match(ANIM_SRC, /<StageChecklist stage=\{stage\} \/>/, "the checklist always renders with the current stage");
  assert.doesNotMatch(ANIM_SRC, /(reducedMotion|prefers-reduced-motion)[^\n]*<StageChecklist/, "the checklist is not gated on a reduced-motion check");
});

// ── 9 · no banned copy in the new component or the runner ────────────────────────────────────────
test("no banned copy in the new animation component or the runner", () => {
  assert.ok(!BANNED.test(ANIM_SRC), "no banned/hype/certainty copy in the animation");
  assert.ok(!BANNED.test(RUNNER_SRC), "no banned/hype/certainty copy in the runner");
  // "block"/"unlock" are allowed (whole-word ban only) — sanity that the regex is whole-word.
  assert.ok(!BANNED.test("this will unlock and block the flow"), "unlock/block are not banned");
});

// ── 10 · canonical money file untouched ──────────────────────────────────────────────────────────
test("canonical money file (portfolio.json) md5 is unchanged", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json money file must be untouched");
});
