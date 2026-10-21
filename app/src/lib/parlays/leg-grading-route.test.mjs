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

/*
 * SETTLEMENT HISTORY DOES NOT MOVE. Every committed ladder the settler reads (the four LADDER_DIRS, every date, every
 * card, every leg — with the settler's own default: a leg without a sport takes its ladder's sport) routes to EXACTLY
 * the grader the old inline rule chose. So re-running the settler over any committed day grades every leg on the same
 * path as before, and every committed lab-settled receipt is reproduced unchanged by construction.
 */
const LADDER_DIRS = { mlb: "risk-ladder", ufc: "risk-ladder-ufc", epl: "risk-ladder-epl", nfl: "risk-ladder-nfl" };
const oldRoute = (leg) => { const s = leg.sport ?? "mlb"; return s === "ufc" || s === "epl" || s === "nfl" ? s : "mlb"; };

test("every committed ladder leg routes to the same grader as before (no committed record can change)", () => {
  const root = path.resolve(process.cwd(), "public/data/parlays");
  let files = 0, legs = 0;
  const moved = [];
  for (const [sport, dir] of Object.entries(LADDER_DIRS)) {
    const d = path.join(root, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
      const doc = JSON.parse(fs.readFileSync(path.join(d, f), "utf8"));
      if (!Array.isArray(doc.cards)) continue;
      files += 1;
      for (const c of doc.cards) for (const l of c.legs ?? []) {
        const leg = { ...l, sport: l.sport ?? sport }; // the settler's own per-ladder default
        legs += 1;
        const now = legGradingRoute(leg).route;
        if (now !== oldRoute(leg)) moved.push({ file: `${dir}/${f}`, slipId: c.slipId ?? null, sport: leg.sport, old: oldRoute(leg), now });
      }
    }
  }
  assert.ok(files > 0 && legs > 0, "the committed ladders were read");
  assert.deepEqual(moved, [], `committed legs whose grading path would change: ${JSON.stringify(moved.slice(0, 5))}`);
  console.log(`# ${legs} committed legs across ${files} ladder files: 0 change grading path`);
});
