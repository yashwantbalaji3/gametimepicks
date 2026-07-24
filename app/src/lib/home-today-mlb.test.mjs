/**
 * HOMEPAGE DAILY-MLB DESTINATION HOOK (Sprint 004, Phase 2). Pins that the homepage surfaces today's MLB
 * freshness + availability + a clear path into /today, reusing the SAME brief overview as /today, with no
 * betting/prediction claims. Source-grep style (runs pre-build).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const homePage = read("src/app/page.tsx");
const strip = read("src/components/home/home-today-mlb.tsx");

test("homepage builds the daily-MLB hook from the SAME shared brief as /today", () => {
  assert.match(homePage, /import \{ buildDailyBrief \} from "@\/lib\/today\/daily-brief"/, "reuses the brief selector");
  assert.match(homePage, /buildDailyBrief\(details, today, \{ nowMs: Date\.now\(\) \}\)/, "builds from real details + a real clock");
  assert.match(homePage, /<HomeTodayMlb\b/, "renders the daily-MLB hook");
});

test("the hook shows freshness + availability + a clear path to the /today brief", () => {
  assert.match(strip, /Today&rsquo;s MLB|Today's MLB/, "labeled Today's MLB");
  assert.match(strip, /Live today|Latest slate/, "shows slate freshness");
  assert.match(strip, /simulations? ready/, "shows current availability (simulations ready)");
  assert.match(strip, /href="\/today"/, "one clear path into the Today brief");
  assert.match(strip, /Open today&rsquo;s brief/, "explicit CTA into the brief");
});

test("the hook gives a reason to return without any betting/prediction claim", () => {
  assert.match(strip, /every game day/i, "reason to return tomorrow");
  assert.match(strip, /Educational, paper-only/, "keeps educational, paper-only framing");
  assert.ok(!/best bet|guaranteed|lock|edge|value play|likely winner|profit/i.test(strip), "no betting/prediction/certainty vocabulary");
});

test("the hook renders nothing on a no-games day (never a broken empty strip)", () => {
  assert.match(strip, /if \(games === 0\) return null/, "no-games day → renders null, the banner speaks");
});
