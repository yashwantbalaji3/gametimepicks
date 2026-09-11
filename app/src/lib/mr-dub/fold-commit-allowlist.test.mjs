/**
 * The Rule S fold writes FOUR files; the nightly commit must carry all four (P256 · 2026-09-11).
 *
 * The first night the fold ran, nightly-settle committed portfolio.json but not the ledger rows the
 * fold writes beside it. Its own health gate passed (the rows existed in that run), and every fresh
 * checkout after it failed: morning-projections aborted three times, the MLB production chain was
 * skipped, and the site opened the day on yesterday's slate. A file written but never added to the
 * commit is the same shape as the Aug 1–3 freshness outage.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WF = fs.readFileSync(path.join(process.cwd(), "..", ".github", "workflows", "nightly-settle.yml"), "utf8");
const FOLD = fs.readFileSync(path.join(process.cwd(), "scripts", "mr-dub", "fold-protected-era.mjs"), "utf8");

test("every file the fold writes is in the nightly commit allowlist", () => {
  const written = ["portfolio.json", "ledger.json", "daily-summary.json", "daily-portfolio.json"];
  for (const f of written) assert.ok(FOLD.includes(`"${f}"`), `sanity: the fold script writes mr-dub/${f}`);
  const adds = WF.split("\n").filter((l) => /^\s*git add /.test(l)).join("\n");
  for (const f of written) assert.match(adds, new RegExp(`git add app/public/data/mr-dub/${f.replace(".", "\\.")}\\b`), `nightly-settle commits mr-dub/${f}`);
});

test("the fold runs before the roll-forward, and the banked ladders stay founder-only", () => {
  const fold = WF.indexOf("scripts/mr-dub/fold-protected-era.mjs --apply");
  const roll = WF.indexOf("activate-daily-portfolio.mjs --date");
  assert.ok(fold > 0 && roll > 0 && fold < roll, "fold precedes the roll-forward");
  assert.ok(!/git add [^\n]*banked-ladders\.json/.test(WF), "banked-ladders.json is never auto-committed");
});
