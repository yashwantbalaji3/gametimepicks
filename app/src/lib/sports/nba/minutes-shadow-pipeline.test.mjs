/**
 * The minutes shadow's place in the two writers: after the official v0.1 build, warn-only, staged on its own line.
 *
 * Run: cd app && npx tsx --test src/lib/sports/nba/minutes-shadow-pipeline.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const wf = (f) => fs.readFileSync(path.resolve(process.cwd(), "..", ".github", "workflows", f), "utf8").replace(/^\s*#.*$/gm, "");

test("minutes shadow: frozen after the official v0.1 build in both writers, before the frozen-game guard; warn-only; staged", () => {
  const win = wf("nba-forecast-window.yml"), ss = wf("sport-schedules.yml");
  for (const [body, v01, shadow] of [
    [win, '--date "$NEXTDAY" --now "$NOW" --write --family v0.1', 'build-nba-minutes-shadow.mjs --date "$NEXTDAY" --now "$NOW" --write'],
    [win, '--write --family v0.1 --horizon-hours 8', 'build-nba-minutes-shadow.mjs --date "$D" --now "$NOW" --write'],
    [ss, '--date "$TODAY" --now "$NOW" --write --family v0.1', 'build-nba-minutes-shadow.mjs --date "$TODAY" --now "$NOW" --write'],
  ]) {
    assert.ok(body.indexOf(v01) > 0 && body.indexOf(shadow) > body.indexOf(v01), `${shadow} after the official v0.1 build`);
    assert.match(body.slice(body.indexOf(shadow)), /^[^\n]*\\\n[^\n]*\|\| echo "::warning::/, "a refusal warns, never fails");
  }
  assert.ok(win.indexOf("build-nba-minutes-shadow.mjs") < win.indexOf("verify-nba-forecast-receipts.mjs --against HEAD"));
  assert.match(win, /then git add "\.\.\/data\/internal\/research\/nba\/minutes-shadow\/forecasts\/"; fi/);
  assert.match(ss, /then git add data\/internal\/research\/nba\/minutes-shadow\/forecasts\/; fi/);
});
