/**
 * /methodology must not say a sport "never enters" Bank Builder, Moonshot or the Parlay Center while those pages show that
 * sport's Level A model suggestions. Audit 2026-10-25: the live page printed "Never enters Bank Builder, Moonshot or
 * Parlays." for NBA, Premier League and Ligue 1 — all three OPEN for Level A (founder policy 2026-10-23) and all three on
 * those pages that day. The paper-ladder claim (MLB only) was right; it was read as the whole answer.
 * Run: npx tsx --test src/lib/methodology-level-a-wording.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { PUBLIC_SPORTS } from "./public-registry.ts";
import { canEnterModelSuggestions } from "./sport-capability-registry.ts";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/methodology/page.tsx"), "utf8");

test("the registry still has sports that are Level A OPEN but not paper-ladder eligible (else this guard is vacuous)", () => {
  const suggestionOnly = PUBLIC_SPORTS.filter((s) => !s.productEligible && canEnterModelSuggestions(s.key)).map((s) => s.key);
  assert.ok(suggestionOnly.length > 0);
  assert.ok(suggestionOnly.includes("nba"), "NBA cards are on all three pages");
  for (const k of ["nfl", "ufc"]) assert.equal(canEnterModelSuggestions(k), false, `${k} stays CLOSED — its row keeps "Never enters"`);
});

test("the Paper products row and both summary sentences read the Level A axis from the registry, not a typed list", () => {
  assert.match(page, /import \{ canEnterModelSuggestions \} from "@\/lib\/sport-capability-registry";/);
  const row = page.slice(page.indexOf('["Paper products"'), page.indexOf("\n", page.indexOf('["Paper products"')));
  assert.match(row, /suggestionOnly\(sp\) \? "Never enters the paper ladders\. Its official picks appear in Bank Builder, Moonshot and the Parlay Center only as unpriced model suggestions \(no price, no payout\)\."/);
  assert.match(row, /: "Never enters Bank Builder, Moonshot or Parlays\."\]/, "a CLOSED sport keeps the plain statement");
  assert.match(page, /Separately, \$\{andList\(suggestionSports\.map/);
  assert.match(page, /picks are shown there only as unpriced model suggestions/);
  assert.doesNotMatch(page, /never enter Bank Builder, Moonshot or Parlays until/, "the limitation row no longer overclaims");
});
