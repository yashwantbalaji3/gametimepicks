/**
 * Parlay Lab settlement routing: a named sport without a grader is REFUSED, never graded as MLB.
 * Run: npx tsx --test src/lib/parlays/leg-grading-route.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { legGradingRoute, ROUTE_REFUSAL } from "./leg-grading-route.mjs";

test("settleable sports route to their own grader; a legacy leg with no sport stays MLB", () => {
  for (const s of ["mlb", "ufc", "epl", "nfl"]) assert.equal(legGradingRoute({ sport: s }).route, s);
  assert.equal(legGradingRoute({ sport: "NFL" }).route, "nfl");
  assert.equal(legGradingRoute({}).route, "mlb");
  assert.equal(legGradingRoute({ sport: null }).route, "mlb");
});

test("an unknown named sport (nba, ligue_1, wnba) is refused — fail closed, never MLB", () => {
  for (const s of ["nba", "ligue_1", "wnba", "ncaaf"]) {
    const r = legGradingRoute({ sport: s });
    assert.equal(r.route, null, s);
    assert.deepEqual(r.refusal, { code: ROUTE_REFUSAL.UNSUPPORTED_SPORT, sport: s });
  }
});

test("settle-lab-cards.mjs routes every leg through legGradingRoute (no `?? \"mlb\"` fall-through into MLB grading)", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "scripts/parlays/settle-lab-cards.mjs"), "utf8");
  const loop = src.slice(src.indexOf("for (const leg of card.legs"), src.indexOf("const box = await boxFor(leg.gamePk)"));
  assert.match(src, /import \{[^}]*legGradingRoute[^}]*\} from "..\/..\/src\/lib\/parlays\/leg-grading-route.mjs"/, "the script imports the router");
  assert.match(loop, /legGradingRoute\(leg\)/, "the leg loop asks the router");
  assert.doesNotMatch(loop, /leg\.sport \?\? "mlb"/, "no implicit MLB fall-through before the MLB grader");
  assert.match(loop, /refusal/, "a refused leg is recorded");
});
