/**
 * THE RENDERED STAKE/PAYOUT CONTROL (§13) — what a reader actually sees.
 *
 * `parlay-payout.test.mjs` proves the arithmetic and the validation states. That is necessary and
 * not sufficient: the whole defect was a COMPONENT that took the wrong input, and a separate one
 * was a component printing "$0.00" for a stake it had silently rejected. Both are facts about
 * markup, so this renders the real component and reads what it prints.
 *
 * Run: cd app && npx tsx --test src/lib/payout-precision-rendered.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

import { combinedDecimalFromLegs, MAX_STAKE } from "./parlay-payout.ts";
import { decimalToAmerican } from "./odds-math.ts";

const mod = await import("../components/ui/stake-payout-input.tsx");
const StakePayoutInput = mod.default;

/* The founder's exact slip. */
const LEGS = [{ oddsForSide: 133 }, { oddsForSide: -130 }];
const DEC = combinedDecimalFromLegs(LEGS);
const AM = decimalToAmerican(DEC);

/** `defaultStake` seeds the field, so it is how a stake is exercised without a keyboard. */
const render = (stake) =>
  renderToStaticMarkup(
    React.createElement(StakePayoutInput, { combinedAmerican: AM, combinedDecimal: DEC, defaultStake: stake }),
  );

/* Currency is rendered by toLocaleString, so a rendered figure carries a thousands separator. */
const money = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

test("a $100 stake on +133/-130 PRINTS $412.23", () => {
  const html = render(100);
  assert.ok(html.includes(money(412.23)), `expected $412.23 in the markup, got:\n${html.slice(0, 400)}`);
  assert.ok(!html.includes("$412.00"), "the lossy figure must not appear");
});

test("the displayed multiplier and American price are consistent with the payout", () => {
  const html = render(100);
  /* The chip shows the American price for readability; the money comes from the decimal. Both
     appear, and they are allowed to disagree in precision — that is the documented convention. */
  assert.ok(html.includes(`+${AM}`), "the American price is still shown");
  assert.ok(html.includes("4.12&#xD7;") || html.includes("4.12×"), "the 2dp multiplier chip is display-only");
});

for (const [label, stake, expect] of [
  ["negative", -50, /cannot be negative/i],
  ["zero", 0, /above \$0/i],
  ["below the floor", 0.5, /Minimum stake/i],
  ["above the ceiling", MAX_STAKE + 1, /Maximum stake/i],
]) {
  test(`a ${label} stake prints an explicit message`, () => {
    const html = render(stake);
    assert.match(html, expect, `no validation message rendered for ${label}`);
  });
}

for (const [label, stake] of [["negative", -50], ["zero", 0]]) {
  test(`a ${label} stake prints NO payout — not a confident $0.00`, () => {
    const html = render(stake);
    /* THE ACTUAL DEFECT. `sanitizeStake(raw) ?? 0` rendered "To return $0.00 · Profit +$0.00" for a
       stake the component had already rejected. */
    assert.ok(!html.includes("$0.00"), `a rejected stake rendered a $0.00 payout:\n${html}`);
    assert.ok(!html.includes("To return"), "no return figure at all for an invalid stake");
  });
}

test("a clamped stake prints the payout for the stake it actually used", () => {
  const html = render(0.5);
  /* Clamped up to $1, so the return is the $1 return — and the message above says so. */
  assert.ok(html.includes("To return"), "a clamp still produces a payout");
  assert.ok(html.includes(money(Math.round(DEC * 1 * 100) / 100)), "the figure matches the clamped stake");
  assert.ok(!html.includes(money(Math.round(DEC * 0.5 * 100) / 100)), "never the rejected stake's figure");
});

test("an empty field prints neither a payout nor an error", () => {
  const html = render(null);
  assert.ok(!html.includes("To return"), "nothing is computed before a stake is entered");
  assert.ok(!/cannot be negative|above \$0|Minimum stake|Maximum stake/.test(html), "an untouched field is not an error");
});

test("cents in the stake reach the rendered figure", () => {
  const html = render(12.34);
  assert.ok(html.includes(money(Math.round(DEC * 12.34 * 100) / 100)), "a fractional stake is not floored");
});
