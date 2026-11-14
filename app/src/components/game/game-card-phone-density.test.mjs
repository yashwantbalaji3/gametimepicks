/**
 * Phone density of the shared hub game card (2026-11-14). Layout only: the card keeps every fact, tag and action;
 * below 640px the rhythm tightens, and two abbreviated sides (NFL/NBA) put crest and name on one line.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const card = readFileSync(here("./game-card.tsx"), "utf8");
const css = readFileSync(here("../../app/globals.css"), "utf8");

const block = (() => {
  const at = css.indexOf("li.gtp-ev { gap:");
  const open = css.lastIndexOf("@media", at);
  const close = css.indexOf("\n}\n", at);
  return { head: css.slice(open, css.indexOf("{", open)), body: css.slice(open, close) };
})();

test("the density rules apply to phones only", () => {
  assert.match(block.head, /max-width:\s*639px/);
  for (const sel of ["li.gtp-ev {", ".gtp-ev-sides[data-short] .gtp-ev-side {", ".gtp-ev-sides[data-short] .gtp-ev-side:last-child {"]) {
    assert.equal(css.split(sel).length - 1, 1, `${sel} appears once`);
    assert.ok(block.body.includes(sel), `${sel} is inside the phone block`);
  }
});

test("the one-line sides are opt-in by name length, never for full team names", () => {
  assert.ok(card.includes('export const shortSides = (sides: GameCardSide[]) => sides.every((x) => { const n = x.name.trim().length; return n > 0 && n <= 4; });'));
  assert.match(card, /className="gtp-ev-sides [^"]*" data-short=\{shortSides\(m\.sides\) \? "" : undefined\} aria-label=\{m\.matchup\}/);
  assert.match(card, /className="gtp-ev-side flex min-w-0 flex-col/);
});

test("the card still renders every part: time, status, sides, tagged read, visual, facts, actions", () => {
  for (const part of ["{m.startLabel}", "{m.statusLabel}", "<Side s={m.sides[0]} />", "<Side s={m.sides[1]} />", "<GameStateTag state={head.state} />", "{m.visual}", "m.facts.filter((f) => f !== head)", "<Act key={a.href} a={a} />", "(model favourite)"]) {
    assert.ok(card.includes(part), part);
  }
  assert.match(css, /\.gtp-ev-cta \{ min-height: 44px;/);
});
