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
import { assertProtectedLedgerIntact } from "./mr-dub/protected-invariant.mjs";
import { LANE } from "./sports/nba/experimental-public-lane.mjs";
const { publicSport } = await import("./public-registry.ts");

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const footer = read("src/components/footer.tsx");
/*
 * P185 put the footer on the canonical destination list, so its hrefs and coverage labels no longer
 * appear literally in the component — exactly the move P196 made for the other three surfaces, and
 * the comment below already anticipated. These assertions are UNCHANGED in intent; they now read
 * where the answer lives, and where possible they read the BUILT page rather than any source at
 * all, which is strictly stronger: it proves what a visitor is actually served.
 */
// UX-001 phase 2: the sport hubs' entries live in the sport catalog the registry derives its Sports group from.
const registry = read("src/lib/navigation.ts") + read("src/lib/sports/catalog.ts");
const builtFooter = (() => {
  const f = path.join(app, "out", "today", "index.html");
  if (!fs.existsSync(f)) return null;                       // source-only run
  const html = fs.readFileSync(f, "utf8");
  const i = html.indexOf('aria-label="Site map"');
  return i === -1 ? null : html.slice(i, i + 6000);
})();
const nav = read("src/components/nav.tsx") + read("src/lib/navigation.ts");

// P196: the surfaces DERIVE their destinations from src/lib/navigation.ts, so a reachability check
// must read the canonical list too — the href no longer appears literally in the surface file. The
// assertion is unchanged; it now looks where the answer actually lives.
test("footer leads with the ACTIVE sport (MLB); the completed World Cup is NOT an active footer sport", () => {
  // The static export writes trailing slashes ("/mlb/"), so match the prefix, not an exact string.
  const hay = builtFooter ?? registry;
  const mlb = hay.search(/"\/mlb\/?"/);
  const nbaArchive = hay.search(/"\/results\/nba\/?"/);
  assert.ok(mlb > 0 && nbaArchive > 0, "the coverage links exist");
  assert.ok(mlb < nbaArchive, "the live sport comes before the settled archive");
  // The 2026 World Cup is complete — it is archive-only, not an active footer sport link.
  assert.equal(hay.indexOf('"/world-cup"'), -1, "World Cup is not an active footer sport");
});

test("the footer states coverage honestly: MLB's hub, NBA archive, and NO schedule-only league", () => {
  /*
   * This guard EARNED its keep. P185 derived the footer from the canonical list and the coverage
   * annotations went with the old markup — every sport would have rendered as a bare name, which
   * implies MLB, EPL and a settled NBA archive are the same kind of thing. They are not. The state
   * now lives on the destination as `note`, and this asserts the rendered result.
   */
  if (builtFooter) {
    // #797 PR B: MLB's note was "live" — a season claim that read true the day after the season ended. It
    // now names what the hub is; the property (MLB is labelled, and not as an archive) is unchanged.
    // founder directive 2026-10-23 public readiness: the note is the public registry's ("Game Simulations · Official
    // Forecasts" — the MLB hub is the simulation center), still naming what the hub is, still not an archive
    assert.match(builtFooter, /MLB<span[^>]*> · Game Simulations · Official Forecasts/, "MLB is labelled by what its hub is");
    // P0 2026-10-28: /results/nba leads with the NBA Official Forecast record; the retired archive is still named, after it
    assert.match(builtFooter, /NBA record<span[^>]*> · Official Forecast record · retired May–June 2026 archive/, "the NBA record names the official record and the retired archive, never current coverage alone");
    // NBA preregistration §13 (founder decision 2026-10-20): with the experimental public lane on, the hub's label must
    // say its projections are NOT validated; with it off, factual-only. Never an unqualified forecast claim.
    // founder directive 2026-10-23 public readiness: the registry's note — what the hub publishes, never a validation claim;
    // its Model Performance is stated once on the hub (the release owner's exact NBA sentence)
    if (LANE.enabled) {
      assert.match(builtFooter, /NBA<span[^>]*> · Official Forecasts · Top Boards · Game Simulations/, "the NBA hub is labelled by what it publishes");
      assert.doesNotMatch(builtFooter, /NBA<span[^>]*> · [^<]*\bvalidated\b/, "never an unqualified validation claim");
    }
    else assert.match(builtFooter, /NBA<span[^>]*> · schedule \+ final scores · no forecast/, "the NBA hub is labelled factual-only");
  }
  // founder directive 2026-10-23 public readiness: catalog notes are the public registry's (navNote) — asserted on the value
  assert.match(registry, /href: "\/mlb", label: "MLB", note: navNote\("mlb"\)/, "MLB declares its coverage");
  assert.equal(publicSport("mlb").navNote, "Game Simulations · Official Forecasts");
  assert.match(registry, /href: "\/results\/nba", label: "NBA record", note: "Official Forecast record · retired May–June 2026 archive"/,
    "the NBA record entry names the official record and keeps the retired archive's label");
  // Session 6 (founder decision 3): /nba is a factual hub in the sports group, and its entry says it publishes no forecast.
  assert.match(registry, /href: "\/nba", label: "NBA", note: navNote\("nba"\)/, "the NBA hub's nav entry is the registry's");
  assert.doesNotMatch(publicSport("nba").navNote, /\bvalidated\b/, "the NBA hub's nav entry must not imply a validated model");
  // The schedule-only leagues have no public destination at all, so nothing links to them.
  for (const league of ["nhl", "ipl"]) {
    assert.equal(registry.indexOf(`href: "/${league}"`), -1, `nothing links /${league}`);
    if (builtFooter) {
      assert.equal(builtFooter.search(new RegExp(`href="/${league}/?"`)), -1, `footer does not link /${league}`);
    }
  }
  // Session 6: /nba is no longer a redirect stub (it is the factual hub), so linking it is correct; the archive keeps its own link.
  assert.notEqual(registry.indexOf('href: "/results/nba"'), -1, "the archive stays reachable");
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
  assert.ok(/href: "\/simulate", label: "Simulations", group: "now"/.test(nav), "/simulate leads the Now cluster");
});

test("Results, Bank Builder, and Simulate remain reachable (trust/record never hidden)", () => {
  for (const href of ["/results", "/bank-builder", "/simulate", "/today"]) {
    assert.ok(nav.includes(`href: "${href}"`), `${href} still in the nav`);
  }
});

test("route hiding touches NO canonical money", () => {
  assertProtectedLedgerIntact(app); // P256: history + crown fixed; bankroll = July base + Rule S fold (was a whole-file md5 pin)
});
