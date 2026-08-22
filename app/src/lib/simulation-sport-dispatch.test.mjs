/**
 * SPORT DISPATCH (Phase 5) — the simulation staging + the runner dispatch on the REAL sport.
 *
 * MLB keeps the baseball diamond; any other sport degrades HONESTLY to a generic staging shell that
 * says so plainly — never a baseball diamond for a non-baseball game, and never fabricated sport data
 * (no scoreline / first-scorer / xG / corners / cards). There is no soccer artifact yet, so these are
 * structural assertions on the dispatch wiring + the honest fallback (the only truthful thing to test).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const ANIM_SRC = fs.readFileSync(path.join(app, "src/components/game/simulation-animation.tsx"), "utf8");
const RUNNER_SRC = fs.readFileSync(path.join(app, "src/components/game/game-simulation-runner.tsx"), "utf8");
const VIEW_SRC = fs.readFileSync(path.join(app, "src/lib/game-simulations/game-lab-view.ts"), "utf8");

/** Slice a single function body by its header, up to the next top-level `function`/`export function`. */
function fnBody(src, header) {
  const start = src.indexOf(header);
  if (start < 0) return "";
  const after = src.slice(start + header.length);
  const nextIdx = after.search(/\n(?:export )?function /);
  return nextIdx < 0 ? after : after.slice(0, nextIdx);
}

// ── 1 · the runner dispatches on the REAL view.sport, not a hardcoded literal ─────────────────────
test("runner dispatches the animation on the real view.sport (no hardcoded sport literal)", () => {
  assert.ok(RUNNER_SRC.includes("<SportSimulationAnimation sport={view.sport}"), "render uses view.sport");
  assert.ok(!RUNNER_SRC.includes('SportSimulationAnimation sport="mlb"'), 'no hardcoded sport="mlb" literal remains');
  // The view genuinely carries a sport field (the data path is real, not invented in the component).
  assert.match(VIEW_SRC, /sport:\s*string/, "GameSimulationView declares a sport field");
  assert.match(VIEW_SRC, /sport:\s*result\.sport/, "the view is populated from the artifact's real sport");
});

// ── 2 · MLB (and the default) → baseball diamond; any other sport → the neutral shell ─────────────
test("every sport gets its OWN surface, and anything unlisted still gets the honest shell", () => {
  /*
   * MLB had the diamond and every other sport fell through to a neutral shell reading "No
   * {sport}-specific view yet". NFL, soccer and UFC now have a gridiron, a pitch and an octagon.
   *
   * The neutral shell is NOT retired, and that is the point of this test: a sport with no graphic
   * must still say so rather than borrow another sport's field, which is the same rule that kept a
   * baseball diamond off a fight card.
   */
  assert.match(ANIM_SRC, /const FIELD_BY_SPORT/, "the surfaces are declared in one lookup");
  for (const [code, field] of [["nfl", "GridironGraphic"], ["soccer", "PitchGraphic"], ["epl", "PitchGraphic"], ["ufc", "OctagonGraphic"]]) {
    assert.match(ANIM_SRC, new RegExp(`${code}:\\s*${field}`), `${code} routes to ${field}`);
  }
  assert.match(ANIM_SRC, /<NeutralSimulationAnimation sport=\{sport\}/, "an unlisted sport still reaches the honest shell");
  assert.match(ANIM_SRC, /return <BaseballSimulationAnimation view=\{view\}/, "mlb/default falls through to baseball");
});

test("a sport surface depicts a PLAYING FIELD, never a result", () => {
  /*
   * These render during the ten seconds BEFORE any number exists. A ball hitting a net, a knockout
   * flourish or a scoreboard would be the animation telling a story the simulation has not run yet.
   */
  const fields = fs.readFileSync(path.join(app, "src/components/game/sport-field-graphics.tsx"), "utf8");
  for (const banned of [/\bgoal\b/i, /\btouchdown\b/i, /\bknockout\b/i, /\bwins?\b/i, /\bscore(board)?\b/i]) {
    const code = fields.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, banned, `a loading graphic must not depict an outcome: ${banned}`);
  }
});

test("motion is decoration — every surface stops under reduced motion", () => {
  const fields = fs.readFileSync(path.join(app, "src/components/game/sport-field-graphics.tsx"), "utf8");
  assert.equal((fields.match(/prefers-reduced-motion: reduce/g) ?? []).length, 3,
    "each of the three surfaces guards its own keyframes");
  // And no raw colour literal: the ratchet counts a hex inside a var() fallback exactly the same.
  assert.doesNotMatch(fields, /#[0-9a-fA-F]{3,8}\b/, "surfaces use tokens only");
});

// ── 3 · the neutral shell renders NO baseball diamond (never a diamond for a non-baseball game) ────
test("the neutral shell has no baseball graphic", () => {
  const neutral = fnBody(ANIM_SRC, "function NeutralSimulationAnimation");
  assert.ok(neutral.length > 0, "found the neutral shell");
  assert.ok(!/DiamondGraphic|gtp-sim-ball|gtp-sim-diamond/.test(neutral), "neutral shell draws no baseball diamond");
  // The baseball shell is the ONLY place the diamond lives.
  const baseball = fnBody(ANIM_SRC, "export function BaseballSimulationAnimation");
  assert.match(baseball, /DiamondGraphic/, "the baseball shell owns the diamond");
});

// ── 4 · the neutral shell degrades honestly AND still advances the stage checklist ────────────────
test("the neutral shell degrades honestly and keeps the stage sequence", () => {
  const neutral = fnBody(ANIM_SRC, "function NeutralSimulationAnimation");
  assert.match(neutral, /-specific view yet/, "honest 'no <sport>-specific view yet' note");
  assert.match(neutral, /<StageChecklist stage=\{stage\} \/>/, "stages still render for any sport");
});

// ── 5 · no fabricated soccer/sport data anywhere in the animation; money is untouched ─────────────
test("no fabricated sport data in the animation; money md5 unchanged", () => {
  // Match SOCCER-DATA forms specifically — the bare words "corners"/"cards" legitimately appear in
  // baseball field geometry (e.g. "foul lines … to the corners"), so we key off the soccer-stat spellings
  // (corner KICK, YELLOW/RED card, bookings, scoreline, first scorer, xG) that could only be fabricated data.
  assert.ok(
    !/scoreline|first[\s_-]?scorer|firstScorer|\bxg\b|corner[\s_-]?kick|yellow[\s_-]?card|red[\s_-]?card|\bbookings\b/i.test(ANIM_SRC),
    "no fake scoreline / first-scorer / xG / corner-kicks / cards in the animation",
  );
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json money file untouched");
});
