/**
 * EMPTY-SLATE HARDENING — the daily refresh must NOT crash on a 0-game MLB day (e.g. the All-Star break).
 * The July-13 refresh crashed at the MLB team-markets step (`board has no gameIds`) because `set -e` propagated
 * the error. These pins guard the fix: the refresh script skips team markets + simulations cleanly on an empty
 * board and continues, and the sim generator already writes a valid 0-game artifact.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "..");
const refresh = fs.readFileSync(path.join(root, "scripts", "refresh_daily_products.sh"), "utf8");

test("1 · the refresh script guards the MLB steps behind a games>0 check", () => {
  assert.match(refresh, /MLB_GAMES=\$\(node -e/, "computes the MLB game count from the board");
  assert.match(refresh, /if \[ "\$\{MLB_GAMES:-0\}" -gt 0 \]; then/, "runs team markets ONLY when games > 0");
  assert.match(refresh, /0 games for \$DATE — All-Star break \/ no games\. Skipping team markets \+ simulations\./, "honest 0-game skip message");
  // The team-markets call must be INSIDE the guarded branch (not run unconditionally).
  const guardIdx = refresh.indexOf('if [ "${MLB_GAMES:-0}" -gt 0 ]');
  // Use the LAST occurrence — the string also appears once in the step-summary docs array above the guard.
  const teamMktIdx = refresh.lastIndexOf("ingest-mlb-team-markets.mjs --write");
  assert.ok(guardIdx > 0 && teamMktIdx > guardIdx, "team-markets ingest is inside the games>0 guard");
});

test("2 · the guard fails closed to 0 (skip) if the board can't be read", () => {
  // The node one-liner catches a read/parse error and prints '0' so the guard skips rather than crashing.
  assert.match(refresh, /catch\{process\.stdout\.write\('0'\)\}/, "board read errors fall back to 0 games (skip)");
});

test("3 · the refresh script is valid shell (no syntax error introduced by the guard)", () => {
  // A structural sanity check: the guarded block opens an `if` and closes with a matching `fi`.
  const ifs = (refresh.match(/\n\s*if \[/g) || []).length;
  const fis = (refresh.match(/\n\s*fi\b/g) || []).length;
  assert.ok(fis >= ifs, "every if has a closing fi");
});
