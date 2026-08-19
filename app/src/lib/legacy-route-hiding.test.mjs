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
/*
 * P185 put the footer on the canonical destination list, so its hrefs and coverage labels no longer
 * appear literally in the component — exactly the move P196 made for the other three surfaces, and
 * the comment below already anticipated. These assertions are UNCHANGED in intent; they now read
 * where the answer lives, and where possible they read the BUILT page rather than any source at
 * all, which is strictly stronger: it proves what a visitor is actually served.
 */
const registry = read("src/lib/navigation.ts");
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

test("the footer states coverage honestly: MLB live, NBA archive, and NO schedule-only league", () => {
  /*
   * This guard EARNED its keep. P185 derived the footer from the canonical list and the coverage
   * annotations went with the old markup — every sport would have rendered as a bare name, which
   * implies MLB, EPL and a settled NBA archive are the same kind of thing. They are not. The state
   * now lives on the destination as `note`, and this asserts the rendered result.
   */
  if (builtFooter) {
    assert.match(builtFooter, /MLB<span[^>]*> · live/, "MLB is labelled live");
    assert.match(builtFooter, /NBA<span[^>]*> · settled archive/, "NBA is labelled a settled archive, not off-season coverage");
  }
  assert.match(registry, /href: "\/mlb", label: "MLB", note: "live"/, "MLB declares itself live");
  assert.match(registry, /href: "\/results\/nba", label: "NBA", note: "settled archive"/,
    "the NBA archive declares itself an archive");
  // The schedule-only leagues have no public destination at all, so nothing links to them.
  for (const league of ["nhl", "ipl"]) {
    assert.equal(registry.indexOf(`href: "/${league}"`), -1, `nothing links /${league}`);
    if (builtFooter) {
      assert.equal(builtFooter.search(new RegExp(`href="/${league}/?"`)), -1, `footer does not link /${league}`);
    }
  }
  // /nba redirects to the archive; the footer must point at the archive itself, not the stub.
  assert.equal(registry.indexOf('href: "/nba"'), -1, "footer links the archive, not the /nba redirect stub");
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
  assert.ok(/href: "\/simulate", label: "Simulate", group: "now"/.test(nav), "/simulate leads the Now cluster");
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
