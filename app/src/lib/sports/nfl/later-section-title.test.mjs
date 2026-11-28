/** NFL hub: the title over the games after the lead week's. Found on production 2026-11-13: "The rest of Week 11" over a
 *  Week 11 game while the lead slate was Week 10. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { laterSectionTitle } from "./season-context.mjs";

const reg = (week) => ({ seasonType: 2, week });

test("🔴 a later week that is not the lead week is named plainly, never 'the rest of' it", () => {
  assert.equal(laterSectionTitle([reg(11)], [reg(10), reg(10)]), "Week 11");
  assert.equal(laterSectionTitle([reg(11), reg(11)], []), "Week 11", "no lead rows: nothing of that week has been shown");
});

test("later games in the SAME week as the lead are 'the rest of' it", () => {
  assert.equal(laterSectionTitle([reg(10), reg(10)], [reg(10)]), "The rest of Week 10");
});

test("mixed weeks or phases stay generic; preseason and postseason keep their titles; unknown codes never guess", () => {
  assert.equal(laterSectionTitle([reg(11), reg(12)], [reg(10)]), "Coming up");
  assert.equal(laterSectionTitle([], [reg(10)]), "Coming up");
  assert.equal(laterSectionTitle([{ seasonType: 1, week: 2 }], []), "Later this preseason");
  assert.equal(laterSectionTitle([{ seasonType: 3, week: 1 }], [reg(18)]), "Postseason schedule");
  assert.equal(laterSectionTitle([{ seasonType: 9, week: 1 }], []), "Coming up");
  assert.equal(laterSectionTitle([{ seasonType: 2, week: null }], []), "Coming up");
});

test("the hub page takes its title from this function with the lead slate's rows", () => {
  const page = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../app/nfl/page.tsx"), "utf8");
  assert.match(page, /const laterTitle = laterSectionTitle\(laterGames, slateGames\);/);
  assert.doesNotMatch(page, /The rest of Week/, "no second copy of the rule in the page");
});
