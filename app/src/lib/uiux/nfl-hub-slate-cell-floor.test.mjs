/**
 * NFL hub slate table at phone width (found on production 2026-11-13 at 375px): the weather and status sentences carried
 * only a max-width, so the 760px table squeezed them to ~75px and each row ran 119–340px. Both cells keep a floor; the
 * table sits in a horizontal scroller, so a floor widens the scroll area instead of stretching rows.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");
const page = fs.readFileSync(path.join(APP, "src/app/nfl/page.tsx"), "utf8");

for (const cls of ["gtp-nfl-w200", "gtp-nfl-w220"]) {
  test(`.${cls} has a readable floor as well as a ceiling`, () => {
    const rule = css.match(new RegExp(`^\\.${cls} \\{([^}]*)\\}`, "m"));
    assert.ok(rule, `${cls} rule exists`);
    const min = Number(rule[1].match(/min-width: (\d+)px/)?.[1]);
    const max = Number(rule[1].match(/max-width: (\d+)px/)?.[1]);
    assert.ok(min >= 140, `min-width ${min}px keeps a sentence readable`);
    assert.ok(max > min, "the ceiling stays above the floor");
  });
}

test("the slate table that uses those cells still scrolls horizontally", () => {
  const i = page.indexOf("gtp-nfl-w200");
  assert.ok(i > 0);
  const before = page.slice(0, i);
  const scroller = before.lastIndexOf('overflowX: "auto"');
  const table = before.lastIndexOf("<table");
  assert.ok(scroller > 0 && table > scroller, "the table is inside an overflow-x scroller");
});
