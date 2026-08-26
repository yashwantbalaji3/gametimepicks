/**
 * Sport-theme + scene guards (P209 · Release C).
 *
 * Run: npx tsx --test src/lib/simulate/themes.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { themeFor } from "./themes.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p) => fs.readFileSync(path.join(APP, p), "utf8");

test("every registered sport has a theme; an unknown sport gets the arena, never a blank", () => {
  for (const s of ["mlb", "nfl", "epl", "ufc", "nba"]) {
    const t = themeFor(s);
    assert.ok(t.scene && t.accent && t.poster, `${s} theme complete`);
    assert.match(t.accent, /^var\(--/, `${s} accent is a token, not a hex`);
  }
  assert.equal(themeFor("cricket").scene, "arena", "future sport falls back to the arena scene");
});

test("scenes are decorative by contract: aria-hidden frame, token colours, motion via gtp-sim classes", () => {
  const scenes = read("src/components/simulate/scenes.tsx");
  assert.match(scenes, /aria-hidden focusable="false"/, "the shared Frame is hidden from AT");
  assert.doesNotMatch(scenes, /#[0-9a-fA-F]{3,8}\b/, "no raw hex in scenes — tokens only");
  assert.match(scenes, /gtp-sim-(pulse|trace|blink)/, "motion rides the shared keyframes");
  for (const id of ["diamond", "field", "pitch", "octagon", "court", "arena"]) {
    assert.match(scenes, new RegExp(`${id}: `), `scene ${id} registered`);
  }
});

test("the scene keyframes ride the motion-token system (the global reduced-motion guard governs them)", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.gtp-sim-pulse \{ animation: gtp-sim-pulse var\(--motion-ambient-duration/, "pulse uses the ambient token");
  assert.match(css, /\.gtp-sim-trace \{[^}]*var\(--motion-chart-draw-duration/, "trace uses the chart-draw token");
  assert.match(css, /\.gtp-sim-paused \* \{ animation-play-state: paused/, "hidden-tab pause hook exists");
});

test("the stage narrates through a live region, pauses with the hidden tab, and never traps history", () => {
  const stage = read("src/components/simulate/simulation-stage.tsx");
  assert.match(stage, /role="status" aria-live="polite"/, "the truth carrier is a live region");
  assert.match(stage, /visibilitychange/, "hidden tab pauses the clock");
  assert.match(stage, /gtp-sim-paused/, "…and the scene animations");
  assert.doesNotMatch(stage, /history\.pushState/, "no history entry — browser back is never trapped");
  assert.match(stage, /scriptForReadiness\(event\.state/, "the terminal comes from the event's own readiness");
  assert.match(stage, /router\.prefetch/, "loading inputs does real work (prefetching the report)");
});
