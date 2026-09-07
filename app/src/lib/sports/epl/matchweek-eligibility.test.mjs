/**
 * P243 · C-EPL — forecast eligibility is the OFFICIAL MATCHWEEK, not a rolling 96-hour clock.
 *
 * The 96h window delivered a matchweek in slices: /epl showed priced Sep-12 cards days before a
 * single Sep-12 forecast existed, and a Saturday fixture could appear while its own matchweek's
 * Sunday fixtures stayed invisible. Eligibility is now every unplayed fixture of the CURRENT
 * matchweek (earliest with an unplayed fixture), with the old lookahead kept only as a straggler
 * backstop.
 *
 * Functional: the real script runs as a child process WITHOUT --write (it mutates nothing), with
 * a pinned --now, against the committed fixture capture. The assertion is population-exact.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const APP = process.cwd();

test("every unplayed fixture of the current matchweek is eligible in one run", () => {
  const fixturesDir = path.join(APP, "public/data/soccer/epl/fixtures");
  const cap = fs.readdirSync(fixturesDir).filter((f) => f.startsWith("capture-")).sort().pop();
  if (!cap) return; // no capture in this tree state
  const rows = JSON.parse(fs.readFileSync(path.join(fixturesDir, cap), "utf8")).fixtures ?? [];
  const NOW = "2026-09-07T20:15:00Z";
  const nowMs = Date.parse(NOW);
  const unplayed = rows.filter((f) => Date.parse(f.kickoffIso ?? "") > nowMs);
  if (!unplayed.length) return;
  const mw = Math.min(...unplayed.map((f) => Number(f.matchweek) || Infinity));
  const expected = unplayed.filter((f) => Number(f.matchweek) === mw);

  const out = execFileSync("npx", ["tsx", "scripts/epl/build-epl-forecasts.mjs", "--now", NOW], {
    cwd: APP, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  assert.match(out, new RegExp(`eligibility: matchweek ${mw} \\(${expected.length} unplayed fixture\\(s\\)\\)`),
    "the whole current matchweek is eligible together");
  // Every fixture of the matchweek appears in the run output — population-exact, not a count.
  for (const f of expected) {
    const name = `${f.homeClub} v ${f.awayClub}`;
    assert.ok(out.includes(name), `${name} (mw${mw}) missing from the eligible set`);
  }
});

test("the source keeps the matchweek rule and the backstop, in that order", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/epl/build-epl-forecasts.mjs"), "utf8");
  assert.match(src, /Number\(f\.matchweek\) === currentMw \|\| k <= nowMs \+ LOOKAHEAD_H/,
    "matchweek eligibility with the lookahead as backstop only");
});
