/**
 * Locks the casino-rebuild /today ordering: the Bank Builder spotlight leads the
 * page (the old "What's live today" counts hero is gone) and appears BEFORE the
 * suggested-cards section. Source-level checks (suite runs pre-build).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("src/app/today/page.tsx", "utf8");

test("the 'What's live today' counts hero is removed", () => {
  assert.ok(!src.includes("What&apos;s live today"), "old hero heading must be gone");
});

test("UFC featured slate leads on a UFC day, with Bank Builder recap before suggested cards", () => {
  const ufc = src.indexOf("featured slate · UFC");
  const bank = src.indexOf("Bank Builder · {dateLabel}");
  const cards = src.indexOf("Suggested paper cards");
  assert.ok(ufc > 0, "UFC featured slate section present");
  assert.ok(bank > 0 && cards > 0, "Bank Builder recap + suggested cards present");
  assert.ok(ufc < bank, "UFC featured slate leads the Bank Builder recap on a UFC day");
  assert.ok(bank < cards, "Bank Builder recap precedes suggested cards");
});

test("heat system tokens exist in the design system", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.ok(css.includes("--gtp-bank-heat:") && css.includes("--gtp-bank-lava:"), "heat tokens present");
  assert.ok(css.includes(".gtp-heat-pulse { animation: none; }"), "heat pulse is reduced-motion gated");
});
