/**
 * FOLLOWING CHANGES WHAT IS SHOWN FIRST, AND NOTHING ELSE. (P251 · F9, carried into v1.1.2.)
 *
 * The risks this guards were named when following first shipped and have not changed: that a
 * preference could reach a published number, that it could become a data-collection surface, and that
 * a follow surface could promise a destination which does not exist.
 *
 * ⚠ WHAT CHANGED IN v1.1.2, DELIBERATELY — AND WHY THE TESTS CHANGED WITH IT
 *
 *   - IDENTITY. P251 pinned "the star keys on the club's PUBLISHED name, not an invented id". Its real
 *     purpose was never "use a name"; it was "do not invent an id space or hand-type a roster". v1.1.2
 *     keeps that purpose and fixes the part a name could not do: a name has no sport (MLB and NFL both
 *     have Giants), cannot hold a player, and breaks on a rename. Follows now key on the canonical ids
 *     the published artifacts ALREADY carry. That test was not weakened — it was left passing while
 *     asserting something no longer true, which is the more dangerous failure, so it is rewritten.
 *
 *   - CAP. P251's FOLLOW_MAX (12) silently dropped the thirteenth follow and was doing validation's job.
 *     The founder's v1.1.2 instruction removes the product cap; a generous STRUCTURAL bound remains so a
 *     corrupted document cannot grow without limit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
/** Code only: these files explain themselves by naming what they must not do. */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const FOLLOW_SOURCES = [
  "src/lib/follow/follow-schema.mjs",
  "src/lib/follow/follow-browser.mjs",
  "src/lib/follow/follow-store.ts",
  "src/components/follow/follow-toggle.tsx",
  "src/components/follow/your-teams.tsx",
  "src/components/follow/team-follow-row.tsx",
  "src/components/follow/follow-legacy-migration.tsx",
];

test("a preference is browser-local and never transmitted", () => {
  assert.match(read("src/lib/follow/follow-store.ts"), /window\.localStorage/, "it lives in the reader's browser");
  for (const rel of FOLLOW_SOURCES) {
    // your-teams GETs the public search index to find destinations; that request carries no preference.
    const body = code(rel);
    assert.ok(!/XMLHttpRequest|navigator\.sendBeacon/.test(body), `${rel}: a follow is never sent anywhere`);
    if (rel !== "src/components/follow/your-teams.tsx") {
      assert.ok(!/\bfetch\(/.test(body), `${rel}: no network call`);
    }
  }
  // The one fetch that exists requests a fixed public path — no follow list in the URL.
  const strip = code("src/components/follow/your-teams.tsx");
  assert.match(strip, /fetch\("\/data\/search\/index\.json"\)/, "a constant public URL, never a preference");
});

test("the structural bound is generous — no silent shortlist", async () => {
  const { FOLLOW_STRUCTURAL_MAX } = await import("./follow-schema.mjs");
  assert.ok(FOLLOW_STRUCTURAL_MAX >= 200, "the P251 cap of 12 is gone by founder instruction (v1.1.2 §20)");
  assert.equal(/FOLLOW_MAX\b/.test(code("src/lib/follow/follow-store.ts")), false, "no product cap remains in the hook");
});

test("a preference cannot reach a number", () => {
  /*
   * The load-bearing claim. Following reorders what a reader meets first; it must not touch what is
   * published, ranked, evaluated or settled. Checked against IMPORTS, not prose.
   */
  for (const rel of FOLLOW_SOURCES) {
    const imports = [...read(rel).matchAll(/^import[^;]*from\s+"([^"]+)";/gm)].map((m) => m[1]);
    for (const banned of ["top-reads", "product-day", "parlay", "ledger", "settle", "grade", "live/"]) {
      const hit = imports.find((i) => i.includes(banned));
      assert.ok(!hit, `${rel} imports "${hit}" — a preference must not reach a record`);
    }
  }
});

test("the strip only ever offers a destination that exists", () => {
  const src = read("src/components/follow/your-teams.tsx");
  assert.match(src, /data\/search\/index\.json/, "destinations come from the index, not from string-building");
  assert.ok(!/`\/(nfl|mlb|epl|ufc)\//.test(src), "the strip must not construct routes itself");
  assert.match(src, /No game in the current window/, "a followed club with nothing on the slate is SAID, not dropped");
  assert.match(src, /teams\.length === 0\) return null/, "and the whole strip is absent until someone follows something");
});

test("⚠ follows key on CANONICAL IDS derived from published artifacts — no invented space, no hand-typed roster", () => {
  // The P251 purpose, preserved: no hand-typed league roster anywhere a follow is resolved.
  for (const rel of ["src/lib/follow/entity-registry.ts", "src/components/nfl/weekly-boards.tsx"]) {
    assert.ok(!/const (NFL|MLB)_TEAMS\s*=|TEAM_NAMES\s*=\s*\{/.test(read(rel)), `${rel} must not hand-type a roster`);
  }
  // The registry DERIVES ids from artifacts the site ships.
  const registry = read("src/lib/follow/entity-registry.ts");
  assert.match(registry, /mlb\/statsapi-schedule/, "MLB team ids come from the StatsAPI schedule capture");
  assert.match(registry, /nfl\/rosters\/latest\.json/, "NFL team ids come from the ESPN roster capture");

  // The board hands the star a REF, never a name.
  const boards = read("src/components/nfl/weekly-boards.tsx");
  assert.match(boards, /<FollowToggle entity=\{teamRefs\[t\] \?\? null\}/, "the board passes a canonical ref");
  assert.equal(/<FollowToggle team=/.test(boards), false, "the P251 name prop is gone");
  // The page resolves those refs on the server.
  assert.match(read("src/app/nfl/page.tsx"), /teamRefs=\{nflTeamRefsByAbbr\(/);
});

test("the toggle is a real, labelled, toggleable control", () => {
  const src = read("src/components/follow/follow-toggle.tsx");
  assert.match(src, /aria-pressed=/, "its state is announced");
  assert.match(src, /aria-label=\{on \?/, "and its label says what the click will do");
  assert.match(src, /e\.preventDefault\(\); e\.stopPropagation\(\)/, "starring inside a link must not navigate");
  assert.match(src, /if \(!entity\?\.id\) return null/, "no canonical id ⇒ no control, never a name fallback");
});
