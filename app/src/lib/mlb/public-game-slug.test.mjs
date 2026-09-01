/**
 * One public slug per game — the rule the route and the simulation artifacts now share.
 *
 * Run: npx tsx --test src/lib/mlb/public-game-slug.test.mjs
 *
 * The defect this closes: the full-game board adapter built `${away}-vs-${home}-${date}` directly,
 * so both halves of a doubleheader carried one slug into the simulation artifact, the predictions
 * artifact derived from it, and every href and slate story built off those. On 2026-08-29 that was
 * seventeen prediction rows over fifteen slugs. Meanwhile the public route had always disambiguated,
 * so on exactly the days it collided those links pointed at a base slug that is not a built page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { assignPublicGameSlugs, baseGameSlug } from "./public-game-slug.ts";

const g = (away, home, key, date = "2026-08-29") => ({ away, home, date, key });

test("a unique pair keeps its base slug — no URL churn for the ordinary case", () => {
  const out = assignPublicGameSlugs([g("BOS", "NYY", 1), g("AZ", "SF", 2)]);
  assert.deepEqual(out.slugs, ["bos-vs-nyy-2026-08-29", "az-vs-sf-2026-08-29"]);
  assert.deepEqual(out.slugs, out.baseSlugs, "nothing is suffixed when nothing collides");
  assert.deepEqual(out.collidingWithoutKey, []);
});

test("THE DOUBLEHEADER · twins are split by their own gamePk, and neither keeps the base", () => {
  const out = assignPublicGameSlugs([g("BOS", "NYY", 823539), g("BOS", "NYY", 823501), g("AZ", "SF", 823176)]);
  assert.deepEqual(out.slugs, [
    "bos-vs-nyy-2026-08-29-823539",
    "bos-vs-nyy-2026-08-29-823501",
    "az-vs-sf-2026-08-29",
  ]);
  assert.equal(new Set(out.slugs).size, 3, "one game, one slug");
  // The base itself is served to NEITHER twin — that is why linking to it 404s.
  assert.ok(!out.slugs.includes("bos-vs-nyy-2026-08-29"));
});

test("order is preserved, and the assignment does not depend on input order", () => {
  const a = assignPublicGameSlugs([g("BOS", "NYY", 1), g("BOS", "NYY", 2)]);
  const b = assignPublicGameSlugs([g("BOS", "NYY", 2), g("BOS", "NYY", 1)]);
  assert.deepEqual(a.slugs, ["bos-vs-nyy-2026-08-29-1", "bos-vs-nyy-2026-08-29-2"]);
  assert.deepEqual(b.slugs, ["bos-vs-nyy-2026-08-29-2", "bos-vs-nyy-2026-08-29-1"]);
  assert.deepEqual([...a.slugs].sort(), [...b.slugs].sort(), "same games, same slugs, whatever the order");
});

test("REFUSAL · a collision with no key is reported, never split by an invented suffix", () => {
  /*
   * Two games we cannot tell apart must not be given made-up identities. The caller is told which
   * rows are ambiguous so it can refuse to serve them, rather than minting an identity here.
   */
  const out = assignPublicGameSlugs([g("BOS", "NYY", null), g("BOS", "NYY", undefined)]);
  assert.deepEqual(out.collidingWithoutKey, [0, 1]);
  assert.deepEqual(out.slugs, ["bos-vs-nyy-2026-08-29", "bos-vs-nyy-2026-08-29"]);
  assert.ok(!out.slugs.some((s) => /-null|-undefined/.test(s)), "no suffix is invented from a missing key");
});

test("a triple-header splits all three", () => {
  const out = assignPublicGameSlugs([g("BOS", "NYY", 1), g("BOS", "NYY", 2), g("BOS", "NYY", 3)]);
  assert.equal(new Set(out.slugs).size, 3);
});

test("the base slug tolerates odd abbreviations without minting an empty token", () => {
  assert.equal(baseGameSlug("A.Z", "S F", "2026-08-29"), "a-z-vs-s-f-2026-08-29");
  assert.equal(baseGameSlug("", "", "2026-08-29"), "?-vs-?-2026-08-29");
});

test("BOTH OWNERS CALL THIS RULE — neither keeps a private copy", () => {
  /*
   * The point of extracting it. `slate-anchor` records the same lesson in almost these words: two
   * copies of a rule are two chances to be wrong together, and that is exactly how the route and the
   * board adapter came to disagree about what a game's slug is.
   */
  const blank = (m) => m.replace(/[^\n]/g, " ");
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank);
  for (const rel of ["src/lib/game-detail.ts", "src/lib/mlb/full-game/board-adapter.ts"]) {
    const code = strip(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
    assert.match(code, /assignPublicGameSlugs\(/, `${rel} must assign slugs through the shared rule`);
    assert.ok(
      !/`\$\{[^`]*\}-vs-\$\{[^`]*\}-\$\{[^`]*\}`/.test(code),
      `${rel} must not rebuild a slug inline — that private copy is the defect`,
    );
  }
});
