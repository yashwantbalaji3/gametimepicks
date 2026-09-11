/**
 * MOTION HYGIENE (P262) — two invariants that a growing stylesheet loses silently.
 *
 * 1. A CLASS IS DEFINED ONCE. `.gtp-meter-fill` was the Bank Builder's progress meter; the Parlay Lab
 *    re-declared the same name at the end of the file for its own chance bars, and the flagship meter
 *    silently gained a scale-in animation nobody asked for. A second top-level definition of a live
 *    class is a change to every surface already using it.
 * 2. NEW MOTION USES THE ROLE TOKENS. The role contract (P185 · B4) fixes eleven durations and three
 *    curves; an animation with a hand-picked 900ms is how six near-identical durations accumulate.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CSS = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

/** Pre-existing duplicates, inherited and untouched by P262. Nothing may be added to this list. */
const KNOWN_DUPLICATES = new Set([".gtp-led-row", ".gtp-rail-frame"]);

/** Top-level single-class selectors only: a media or supports block legitimately re-declares. */
function topLevelClassCounts(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const counts = new Map();
  let depth = 0, buf = "";
  for (const ch of stripped) {
    if (ch === "{") { if (depth === 0) { for (const part of buf.split(",")) { const p = part.trim(); if (/^\.[A-Za-z0-9_-]+$/.test(p)) counts.set(p, (counts.get(p) ?? 0) + 1); } } buf = ""; depth += 1; }
    else if (ch === "}") { depth -= 1; if (depth === 0) buf = ""; }
    else if (depth === 0) buf += ch;
  }
  return counts;
}

test("no class is defined twice at the top level of globals.css", () => {
  const dups = [...topLevelClassCounts(CSS)].filter(([, n]) => n > 1).map(([k]) => k);
  const unexpected = dups.filter((d) => !KNOWN_DUPLICATES.has(d));
  assert.deepEqual(unexpected, [], `a second definition silently changes every surface already using the class: ${unexpected.join(", ")}`);
});

test("the Parlay Lab's bars never reuse the Bank Builder's meter class", () => {
  const lab = fs.readFileSync(path.join(process.cwd(), "src/components/parlays/lab/chance-meter.tsx"), "utf8");
  assert.match(lab, /gtp-chance-fill/);
  assert.ok(!/gtp-meter-fill/.test(lab), "the flagship meter's class stays the flagship meter's");
});

test("every animation this programme added runs on the role tokens", () => {
  const block = CSS.slice(CSS.indexOf("PARLAY LAB 2.0 MOTION"));
  assert.ok(block.length > 200, "the block exists");
  const animations = [...block.matchAll(/animation:\s*([^;]+);/g)].map((m) => m[1]);
  assert.ok(animations.length >= 3, `expected the lab's animations, got ${animations.length}`);
  for (const a of animations) {
    if (/^none/.test(a.trim())) continue;
    assert.match(a, /var\(--motion-[a-z-]+-duration\)/, `hand-picked duration in "${a.trim()}"`);
    assert.match(a, /var\(--motion-[a-z-]+-easing\)/, `hand-picked easing in "${a.trim()}"`);
  }
});

test("a staggered entrance drops its delay under reduced motion, not just its duration", () => {
  const reduced = CSS.slice(CSS.indexOf(".gtp-chance-fill, .gtp-line-draw, .gtp-rise"));
  assert.match(reduced.slice(0, 160), /animation-delay:\s*0ms/, "a `both`-filled item would otherwise wait at opacity 0");
  assert.match(CSS, /animation-delay: calc\(min\(var\(--i, 0\), 4\) \* 70ms\)/, "and the stagger stops at the contract's five items");
});
