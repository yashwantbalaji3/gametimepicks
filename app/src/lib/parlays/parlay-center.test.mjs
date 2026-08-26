/**
 * PARLAY CENTER structural guards (P208 · Release A).
 *
 * One destination, two modes as two real routes. These scan the BUILT export — the HTML people
 * receive — for the structure the unification promises, plus the source contracts that keep the
 * two modes on one engine. Slate-independent by design: every assertion here holds on an empty
 * slate too (tabs, anchors, signposts, shared imports), so a quiet sports day never fails the
 * guard and a broken page never passes it.
 *
 * Run: npx tsx --test src/lib/parlays/parlay-center.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p) => fs.readFileSync(path.join(APP, p), "utf8");
const built = (p) => read(path.join("out", p));

test("both modes exist in the built export with the mode tabs, each marking its own as current", () => {
  const suggested = built("build/index.html");
  const custom = built("build/custom/index.html");
  for (const html of [suggested, custom]) {
    assert.match(html, /aria-label="Parlay Center modes"/, "mode tabs render");
    assert.match(html, /Suggested Parlays/);
    assert.match(html, /Build Your Own/);
    assert.match(html, /href="\/build\/custom/, "custom tab links the real route");
  }
  // aria-current marks the ACTIVE mode's tab on each page (URL-stable mode, not hydration state).
  assert.match(suggested, /aria-current="page"[^>]*>[\s\S]{0,200}?Suggested Parlays|Suggested Parlays[\s\S]{0,200}?aria-current="page"/);
  assert.match(custom, /aria-current="page"[^>]*>[\s\S]{0,200}?Build Your Own|Build Your Own[\s\S]{0,200}?aria-current="page"/);
});

test("legacy anchors survive the split: #suggested-cards lands on /build, #advanced-builder signposts the builder", () => {
  const suggested = built("build/index.html");
  assert.match(suggested, /id="suggested-cards"/, "every /picks-era alias targets this anchor");
  assert.match(suggested, /id="advanced-builder"/, "the builder's old address gets a signpost, not silence");
  const signpost = suggested.split('id="advanced-builder"')[1]?.slice(0, 600) ?? "";
  assert.match(signpost, /href="\/build\/custom/, "the signpost points at Build Your Own");
});

test("the builder and the marketplace live on the custom mode, not the suggested mode", () => {
  const suggested = built("build/index.html");
  const custom = built("build/custom/index.html");
  assert.match(custom, /optimizer-coverage/, "marketplace disclosure moved with the builder");
  assert.doesNotMatch(suggested, /id="optimizer-coverage"/, "suggested mode no longer stacks the marketplace");
  assert.match(custom, /Build steps|No eligible legs right now/, "builder (or its honest empty state) renders on custom");
});

test("suggested cards carry a Customize action into the shared draft when cards exist", () => {
  const suggested = built("build/index.html");
  const hasCards = /slip_\d{4}-\d{2}-\d{2}/.test(suggested) || /Customize this card/.test(suggested);
  if (!hasCards) return; // empty slate: no cards, no Customize — nothing to assert
  assert.match(suggested, /Customize this card/);
  assert.match(suggested, /href="\/build\/custom\/?\?card=/, "Customize links the builder with the card's slipId (trailing-slash export)");
});

test("one draft engine: both modes' components share the slip store and the one identity rule", () => {
  const buildExperience = read("src/components/build-experience.tsx");
  assert.match(buildExperience, /from "@\/lib\/slip\/slip-store"/, "builder draft IS the slip");
  assert.match(buildExperience, /from "@\/lib\/slip\/leg-identity"/, "builder uses the canonical key");
  assert.match(buildExperience, /classifyAgainstSelection/, "one conflict engine");
  const slipStore = read("src/lib/slip/slip-store.ts");
  assert.match(slipStore, /from "@\/lib\/slip\/leg-identity"/, "store re-exports the canonical rule");
  assert.match(slipStore, /from "@\/lib\/odds-math"/, "one odds implementation site-wide");
  const ladder = read("src/components/parlays/risk-ladder-board.tsx");
  assert.match(ladder, /\/build\/custom\?card=/, "ladder Customize seeds the same draft");
});

test("game deep links point at the builder mode, never the suggested lobby with builder params", () => {
  for (const f of ["src/lib/game-detail.ts", "src/components/games/simulate-lobby.tsx", "src/components/world-cup/curated-picks.tsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /\/build\?sport=/, `${f} still deep-links the retired builder address`);
  }
});

test("the zero-leg floating pill is gone: the mobile card bar requires a non-empty draft", () => {
  const src = read("src/components/build-experience.tsx");
  assert.match(src, /!slipOpen && draft\.length > 0 &&/, "bar renders only once the card has a leg");
});
