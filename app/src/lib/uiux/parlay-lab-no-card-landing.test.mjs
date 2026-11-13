/**
 * On a no-card day, /build#suggested-cards (where /parlay-lab, /picks, /parlays… all redirect) lands on the ONE short
 * empty state, with the per-tier detail still folded (UX 2026-11-13). With the anchor inside the fold, open-on-hash
 * forced it open on every arrival: 2,147 px of per-tier reasons at 390 px.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const page = read("src/app/build/page.tsx");
const empty = read("src/components/parlays/parlay-center-no-card.tsx");

test("the empty state owns the anchor on a no-card day, and takes focus there", () => {
  assert.match(empty, /<section id="suggested-cards"[^>]*data-parlay-center-no-card/);
  assert.match(empty, /<FocusOnHash hash="suggested-cards" targetId="parlay-center-no-card-heading" \/>/);
  // the anchor sits OUTSIDE the folded detail
  assert.ok(empty.indexOf('id="suggested-cards"') < empty.indexOf("<MoreDisclosure"), "anchor precedes the fold, not inside it");
});

test("the folded 'every suggested card' section does not carry the anchor on a no-card day (one id, never two)", () => {
  assert.match(page, /<section id=\{noCardToday \? "every-suggested-card" : "suggested-cards"\}/);
  assert.match(page, /\{noCardToday \? null : <FocusOnHash hash="suggested-cards" targetId="suggested-cards-heading" \/>\}/);
  assert.equal((page.match(/id="suggested-cards"/g) ?? []).length, 0, "no unconditional second anchor on the page");
});

test("with cards to show, the anchor is the suggested-cards section as before", () => {
  assert.match(page, /\{noCardToday \? null : suggestedSection\}/);
});
