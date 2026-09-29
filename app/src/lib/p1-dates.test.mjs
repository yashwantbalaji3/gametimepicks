/**
 * P1-C (#816) · prose prints human days, from ONE shared formatter. Fixture dates only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { etDayLabel } from "./et-stamp.mjs";
import { freshnessDisplay } from "./freshness-display.ts";

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

test("the shared day format: a day or an instant reads 'Thu, Oct 2'; unreadable input is null, never a guess", () => {
  assert.equal(etDayLabel("2031-10-02"), "Thu, Oct 2");
  assert.equal(etDayLabel("2031-10-03T00:15:00Z"), "Thu, Oct 2", "an instant is labelled by its ET day (8:15 PM ET Thursday)");
  for (const bad of [null, undefined, "", "not a date"]) assert.equal(etDayLabel(bad), null);
});

test("🔴 freshness badges and their warnings name days in words", () => {
  assert.equal(freshnessDisplay("2031-07-10", "2031-07-05").text, "Upcoming · Thu, Jul 10");
  assert.match(freshnessDisplay("2031-07-01", "2031-07-05").warning ?? "", /most recent available \(Tue, Jul 1\)/);
});

test("🔴 every prose site that printed a raw ISO day now goes through the shared formatter", () => {
  const pd = read("src/lib/product-day/product-day.ts");
  assert.match(pd, /next kickoff \$\{etDayLabel\(nextForecastDay\) \?\? nextForecastDay\}/, "Home NFL card");
  assert.match(pd, /bouts predicted · card \$\{etDayLabel\(slateDate\) \?\? slateDate\}/, "Home UFC card");
  assert.doesNotMatch(pd, /next kickoff \$\{(kickDay|nextForecastDay)\}/, "no raw day left in an NFL note");
  assert.match(read("src/lib/simulate/day-view.ts"), /next kickoff \$\{etDayLabel\(nextDay\) \?\? nextDay\}/, "/simulate NFL empty date");
  assert.match(read("src/app/build/page.tsx"), /latest published cards \(\$\{etDayLabel\(ladderDate\) \?\? ladderDate\}\)/, "/build note");
  const gd = read("src/components/game/game-detail-page.tsx");
  assert.doesNotMatch(gd, /\{detail\.date\}\{detail\.venue/, "MLB game header");
  assert.match(read("src/components/sports/sport-chooser.tsx"), /from "@\/lib\/et-stamp\.mjs"/, "the chooser uses the shared formatter, not a copy");
});
