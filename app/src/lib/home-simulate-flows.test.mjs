/**
 * HOME / SIMULATE / TODAY FLOW ALIGNMENT (UX mission, Phase 4). The homepage pushes to BOTH the simulation
 * lobby (/simulate) and Today's Picks, without duplicating the full lobby onto /today. Copy-only; no money.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const band = read("src/components/home/game-lab-home-band.tsx");
const hero = read("src/components/home-hero.tsx");
const todayPage = read("src/app/today/page.tsx");

test("Home's Simulate CTA points to the clean /simulate route", () => {
  assert.match(band, /href="\/simulate"/, "the Simulate CTA links to /simulate (not the raw /games)");
  assert.match(band, /Simulate Today.{0,10}s Games/i, "the CTA is simulate-first");
});

test("Home also pushes users to Today's Picks (a distinct CTA, not a duplicate of Simulate)", () => {
  assert.match(hero, /picksAnchorId/, "the hero has a today's-picks CTA");
  assert.match(hero, /See today.{0,6}s picks/i, "the hero CTA is 'See today's picks'");
});

test("/today is NOT mislabeled as the simulation lobby (it is the picks/no-play board)", () => {
  assert.match(todayPage, /title: "Today · GameTime Picks"/, "/today is titled 'Today', not 'Simulate Games'");
  assert.ok(!/title="Simulate Games"/.test(todayPage), "/today does not render the simulate-lobby header");
});

test("the flow alignment touches NO canonical money", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json md5 unchanged");
});
