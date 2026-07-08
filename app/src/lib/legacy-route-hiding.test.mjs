/**
 * LEGACY / OFF-SEASON ROUTE HIDING (UX mission, Phase 3 — clearly-safe only). Active sports lead the
 * footer; off-season leagues stay REACHABLE (no links removed, no routes deleted) but are honestly
 * labelled so they don't read as active products. The primary nav stays a clean simulate-first spine.
 * No money change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const footer = read("src/components/footer.tsx");
const nav = read("src/components/nav.tsx");

test("footer leads with the ACTIVE sports (MLB, World Cup) before the off-season leagues", () => {
  const mlb = footer.indexOf('href="/mlb"');
  const wc = footer.indexOf('href="/world-cup"');
  const nba = footer.indexOf('href="/nba"');
  const nhl = footer.indexOf('href="/nhl"');
  assert.ok(mlb > 0 && wc > 0 && nba > 0, "the sport links exist");
  assert.ok(mlb < nba && wc < nba, "active sports (MLB, World Cup) come before off-season NBA");
  assert.ok(nba < nhl, "NHL (provider pending) stays last");
});

test("off-season leagues are REACHABLE but honestly labelled (no route deleted, no link removed)", () => {
  assert.match(footer, /href="\/nba"/, "NBA route still linked (reachable)");
  assert.match(footer, /NBA <span[^>]*>· off-season/, "NBA is labelled off-season");
  assert.match(footer, /NHL <span[^>]*>· provider pending/, "NHL keeps its honest label");
});

test("the primary nav stays a clean simulate-first spine (no off-season sport promoted to primary)", () => {
  const dividerIdx = nav.indexOf("beforeDivider: true");
  // No off-season sport route appears BEFORE the divider (in the primary spine).
  for (const href of ["/nba", "/nhl", "/ipl", "/ufc"]) {
    const i = nav.indexOf(`href: "${href}"`);
    assert.ok(i === -1 || i > dividerIdx, `${href} is not in the primary nav`);
  }
  assert.ok(nav.indexOf('href: "/simulate"') > 0 && nav.indexOf('href: "/simulate"') < dividerIdx, "/simulate is primary");
});

test("Results, Bank Builder, and Simulate remain reachable (trust/record never hidden)", () => {
  for (const href of ["/results", "/bank-builder", "/simulate", "/today"]) {
    assert.ok(nav.includes(`href: "${href}"`), `${href} still in the nav`);
  }
});

test("route hiding touches NO canonical money", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json md5 unchanged");
});
