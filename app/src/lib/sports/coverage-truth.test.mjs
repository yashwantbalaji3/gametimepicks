/**
 * P185 · RELEASE G — the schedules directory may not contradict a sport's own hub.
 *
 * The charter: "A schedule-only sport remains useful but does not masquerade as a simulation
 * product." The defect found was the MIRROR of that rule, and it had been true once: /sports
 * declared UFC `SCHEDULE_ONLY` and rendered "This sport has no simulations, no predictions and no
 * picks on this site" — while /ufc publishes winner, method and finishing round for every bout on
 * the next card, from a model trained on 8,642 decisive bouts.
 *
 * Understating is the safer direction and it is still wrong: a discovery page that hides a live
 * product does not work as a discovery page.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("the directory does not claim a sport has nothing published site-wide", () => {
  /*
   * The sentence read "This sport has no simulations, no predictions and no picks ON THIS SITE" and
   * was UNCONDITIONAL — it rendered under UFC while /ufc publishes a three-market fight model.
   *
   * The fix is deliberately NOT a coverage-state promotion. `coverage` is a GATED claim: the
   * schedule contract says "SIMULATION_READY and beyond require their sport-gate stages", and
   * moving a sport past its gate from a UI release is exactly what that contract prevents. So the
   * sentence was narrowed to what this page can actually vouch for.
   */
  const tile = strip(fs.readFileSync(path.join(APP, "src/components/sports/upcoming-sports.tsx"), "utf8"));
  assert.doesNotMatch(tile, /no simulations, no predictions and no picks on this site/,
    "the directory cannot make a site-wide negative claim about a sport with its own hub");
  assert.match(tile, /This section is the schedule only\./,
    "it may describe THIS page's contents");
  assert.match(tile, /SPORT_HUB\[s\.sport\]/,
    "where a sport has a hub, the reader is sent there to see what it publishes");
});

test("the coverage axis stays closed and ungamed", () => {
  /* A UI release may not invent a coverage word to route around the sport gate. */
  const tile = fs.readFileSync(path.join(APP, "src/components/sports/upcoming-sports.tsx"), "utf8");
  const contract = fs.readFileSync(path.join(APP, "src/lib/sports/schedule-contract.mjs"), "utf8");
  const declared = [...contract.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
  for (const m of tile.matchAll(/^\s{2}([A-Z_]{4,}):/gm)) {
    assert.ok(declared.includes(m[1]),
      `${m[1]} is rendered as a coverage state but is not in the schedule contract's closed axis`);
  }
});

test("the built directory and the built UFC hub agree", () => {
  const dir = path.join(APP, "out", "sports", "index.html");
  const hub = path.join(APP, "out", "ufc", "index.html");
  if (!fs.existsSync(dir) || !fs.existsSync(hub)) return;
  const txt = (f) => fs.readFileSync(f, "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const hubText = txt(hub);
  const publishesModel = /Winner, method and finishing round/i.test(hubText);
  if (!publishesModel) return;                       // if the hub stops publishing, this is moot
  const dirText = txt(dir);
  const ufcAt = dirText.indexOf("UFC");
  assert.ok(ufcAt > -1, "the directory must list UFC");
  const ufcSection = dirText.slice(ufcAt, ufcAt + 400);
  assert.doesNotMatch(dirText, /no simulations, no predictions and no picks on this site/,
    "the built directory still makes a site-wide negative claim");
  assert.doesNotMatch(dirText, /UFC carry schedules only/,
    "the intro still counts UFC among the schedule-only sports");
  assert.match(ufcSection + dirText, /\/ufc\//, "the directory must link the UFC hub");
});
