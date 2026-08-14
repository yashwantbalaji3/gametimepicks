/**
 * LEGACY / OFF-SEASON ROUTE HIDING. Originally this guard kept off-season leagues reachable from the
 * footer behind an honest label ("· provider pending"). The public-route audit (2026-07-30) went
 * further: a link that promises future coverage is still a promise, so the schedule-only leagues no
 * longer have public destinations at all and the footer lists only what the site can do — MLB live,
 * NBA as a settled archive. The primary nav stays a clean simulate-first spine. No money change.
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

test("footer leads with the ACTIVE sport (MLB); the completed World Cup is NOT an active footer sport", () => {
  const mlb = footer.indexOf('href="/mlb"');
  const nbaArchive = footer.indexOf('href="/results/nba"');
  assert.ok(mlb > 0 && nbaArchive > 0, "the coverage links exist");
  assert.ok(mlb < nbaArchive, "the live sport comes before the settled archive");
  // The 2026 World Cup is complete — it is archive-only, not an active footer sport link.
  assert.equal(footer.indexOf('href="/world-cup"'), -1, "World Cup is not an active footer sport");
});

test("the footer states coverage honestly: MLB live, NBA archive, and NO schedule-only league", () => {
  assert.match(footer, /MLB <span[^>]*>· live/, "MLB is labelled live");
  assert.match(footer, /NBA <span[^>]*>· settled archive/, "NBA is labelled a settled archive, not off-season coverage");
  // The schedule-only leagues have no public destination at all, so nothing links to them.
  for (const href of ['href="/nhl"', 'href="/ipl"', 'href="/nba"']) {
    assert.equal(footer.indexOf(href), -1, `footer does not link ${href}`);
  }
});

test("the primary nav stays a clean simulate-first spine (no non-live sport promoted to primary)", () => {
  const dividerIdx = nav.indexOf("beforeDivider: true");
  // No non-live sport route appears in the nav at all; MLB is the only sport, and it sits AFTER the divider.
  // "/sports" left this list in Program 158: it is the canonical schedules destination now
  // (one "Sports · Schedules" item, secondary group) — the per-league and retired-sport bans stand.
  // P186: the founder asked for sports beside MLB in the top bar. The invariant this test protects
  // is "the PRIMARY spine stays simulate-first" — not "no sport may be linked". So sports are
  // allowed, and every one of them is asserted to sit AFTER the divider, in the secondary group,
  // exactly where MLB already was. A sport promoted above the divider still fails.
  for (const href of ["/nhl", "/ipl"]) {
    assert.equal(nav.indexOf(`href: "${href}"`), -1, `${href} is not a nav destination`);
  }
  for (const href of ["/mlb", "/nfl", "/epl", "/ufc"]) {
    const at = nav.indexOf(`href: "${href}"`);
    if (at === -1) continue;
    assert.ok(at > dividerIdx, `${href} is secondary, not the primary spine`);
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
