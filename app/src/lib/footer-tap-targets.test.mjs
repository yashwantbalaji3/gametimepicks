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

test("standalone back / hub / prev-next links carry the same 24px (44px on touch) rule", () => {
  assert.match(css, /a\.gtp-backlink \{ display: inline-flex; align-items: center; min-height: 24px; \}/);
  assert.match(css, /@media \(pointer: coarse\) \{ a\.gtp-backlink \{ min-height: 44px; \} \}/);
  /* The pages the 2026-10-25 audit measured under 24px, plus the same link on sibling pages. */
  for (const [file, text] of [
    ["src/app/nfl/game/[eventId]/page.tsx", "← NFL hub"],
    ["src/app/results/nba/page.tsx", "← global Results hub"],
    ["src/components/nba/projections-view.tsx", "← NBA hub"],
    ["src/app/epl/match/[slug]/page.tsx", "← Premier League fixtures"],
  ]) {
    const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    const at = src.indexOf(text);
    assert.ok(at > 0, `${file}: ${text}`);
    assert.match(src.slice(src.lastIndexOf("<Link", at), at), /className="gtp-backlink/, `${file}: ${text} carries gtp-backlink`);
  }
});

test("the footer's last small targets: Contact support and the source-chip links (Production, 2026-10-25)", () => {
  /* Measured on Production after Release J: "Contact support" 16 px on every width; source-chip links 27 px on a phone. */
  const support = fs.readFileSync(path.join(process.cwd(), "src/components/support-entry.tsx"), "utf8");
  assert.match(support, /className=\{compact \? "ft-link" : undefined\}/, "the footer's support link is a site-map link");
  const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  assert.match(css, /@media \(pointer: coarse\) \{\s*a\.gtp-source-chip \{ min-height: 44px; \}\s*\}/);
});
