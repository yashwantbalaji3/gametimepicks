/**
 * NFL game page → Methodology → "Which model produced which number" (found on production 2026-11-13 at 375px): the four
 * columns shared 382px, so the description column got 81px and one row ran 226px. The table already sits in a horizontal
 * scroller with a swipe hint; its cells keep a floor so it scrolls instead of stacking words. The floor is scoped to THIS
 * table: applied to the evaluation-status table beside it, the same rule made that table taller (414 → 763px, measured).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(HERE, "styles.tsx"), "utf8");
const tsx = fs.readFileSync(path.join(HERE, "methodology.tsx"), "utf8");

test("the sources table carries the scoped class, inside its scroller", () => {
  assert.match(tsx, /<div className="nf-scroll"[^>]*aria-label="Which model produced which number"[^>]*>\s*<table className="nf-table nf-table-sources">/);
  assert.equal(tsx.split("nf-table-sources").length - 1, 1, "only the sources table: the evaluation table keeps auto widths");
});

test("its description column and the other cells keep a readable floor", () => {
  /* Phone widths only: at 768px the same floors made the table 39px TALLER (273 → 312, measured on production), because
     they pull width from the version column. Tablet and desktop keep the automatic layout. */
  const phone = css.match(/@media \(max-width:639px\)\{(\.nf-table-sources[^@]*\})\}/)?.[1] ?? "";
  assert.ok(phone, "the floors live inside a phone-width media query");
  assert.equal(css.split(".nf-table-sources").length - 1, 2, "and nowhere outside it");
  const first = Number(phone.match(/\.nf-table-sources td:first-child\{min-width:(\d+)px\}/)?.[1]);
  const rest = Number(phone.match(/\.nf-table-sources td\{min-width:(\d+)px\}/)?.[1]);
  assert.ok(first >= 170, `description column floor ${first}px`);
  assert.ok(rest >= 90 && rest < first, `other cells floor ${rest}px`);
  assert.match(css, /\.nf-scroll\{overflow-x:auto\}/, "the scroller that makes a floor safe");
});
