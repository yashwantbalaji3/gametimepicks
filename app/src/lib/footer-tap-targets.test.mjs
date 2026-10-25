/**
 * Footer site-map links are tap targets. Audit 2026-10-25 (Playwright, live site, 19 routes × 320/390/768/1440 px): every
 * page carried ~30 site-map links 16px tall, under even WCAG 2.2's 24px minimum (2.5.8); measured after the fix on a
 * local render: 24px with a mouse, 44px on touch, label and coverage note still one run of wrapping text, no overflow.
 * Run: npx tsx --test src/lib/footer-tap-targets.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
const footer = fs.readFileSync(path.join(process.cwd(), "src/components/footer.tsx"), "utf8");

test("every site-map link is at least 24px tall, and 44px where the pointer is a finger", () => {
  assert.match(css, /a\.ft-link \{ display: inline-block; min-height: 24px;/);
  const coarse = css.slice(css.indexOf("@media (pointer: coarse) {\n  a.ft-link"));
  assert.match(coarse.slice(0, 200), /a\.ft-link \{ min-height: 44px;/);
  assert.doesNotMatch(css, /a\.ft-link \{ display: inline-flex/, "flex splits the label from its coverage note into two columns");
});

test("the site-map lists use the rule's own spacing (the old space-y-2 would stack a gap on top of 44px rows)", () => {
  const nav = footer.slice(footer.indexOf('aria-label="Site map"'), footer.indexOf("</nav>"));
  assert.match(nav, /<ul className="ft-list list-none p-0">/);
  assert.doesNotMatch(nav, /space-y-2/);
  assert.equal((nav.match(/className="ft-link"/g) ?? []).length, 2, "both link kinds (destinations, legal) carry the class");
});
