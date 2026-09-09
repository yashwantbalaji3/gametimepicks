/**
 * P251-F9 — FOLLOWING CHANGES WHAT IS SHOWN FIRST, AND NOTHING ELSE.
 *
 * Nothing a reader did survived the visit: the parlay slip persisted and everything else was
 * stateless, so every arrival started from the same cold page whether the visitor came for one
 * club or for the first time. This is the one persistence feature that changes whether they come
 * back, and it does not need an account.
 *
 * The risks it introduces are the ones guarded here: that a preference could reach a published
 * number, that it could become a data-collection surface, and that the strip could promise a
 * destination which does not exist.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("a preference is browser-local and never transmitted", () => {
  const store = read("src/lib/follow/follow-store.ts");
  assert.match(store, /window\.localStorage/, "it lives in the reader's browser");
  assert.ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(store), "a followed club is never sent anywhere");
  assert.match(store, /FOLLOW_MAX/, "a shortlist, not a subscription list");
});

test("a preference cannot reach a number", () => {
  /*
   * The load-bearing claim. Following reorders what a reader meets first; it must not touch what
   * is published, ranked, evaluated or settled. Any of these imports inside the follow surfaces
   * would mean a reader's interests could move a figure.
   */
  for (const rel of [
    "src/lib/follow/follow-store.ts",
    "src/components/follow/follow-toggle.tsx",
    "src/components/follow/your-teams.tsx",
  ]) {
    /* Checked against the IMPORTS, not the prose — these files explain themselves by naming the
       records they must not touch, and a guard that reads comments would forbid the explanation. */
    const imports = [...read(rel).matchAll(/^import[^;]*from\s+"([^"]+)";/gm)].map((m) => m[1]);
    for (const banned of ["top-reads", "product-day", "parlay", "ledger", "settle", "grade"]) {
      const hit = imports.find((i) => i.includes(banned));
      assert.ok(!hit, `${rel} imports "${hit}" — a preference must not reach a record`);
    }
  }
});

test("the strip only ever offers a destination that exists", () => {
  const src = read("src/components/follow/your-teams.tsx");
  /* It reads the SAME index the search overlay reads — every href in which is resolved against
     the built export by lib/search/index.test.mjs. Nothing here builds a URL of its own. */
  assert.match(src, /data\/search\/index\.json/, "destinations come from the index, not from string-building");
  assert.ok(!/`\/(nfl|mlb|epl|ufc)\//.test(src), "the strip must not construct routes itself");
  assert.match(src, /No game in the current window/, "a followed club with nothing on the slate is SAID, not dropped");
  assert.match(src, /teams\.length === 0\) return null/, "and the whole strip is absent until someone follows something");
});

test("the star keys on the club's PUBLISHED name, not an invented id", () => {
  const boards = read("src/components/nfl/weekly-boards.tsx");
  assert.match(boards, /teamNames\[abbr\] \?\? abbr/, "abbreviations are widened through the artifact's own map");
  const page = read("src/app/nfl/page.tsx");
  assert.match(page, /teamNames=\{Object\.fromEntries/, "…which the page derives from the forecast artifact");
  assert.ok(!/const NFL_TEAMS|TEAM_NAMES = \{/.test(boards), "no hand-typed league roster is introduced for the star");
});

test("the toggle is a real, labelled, toggleable control", () => {
  const src = read("src/components/follow/follow-toggle.tsx");
  assert.match(src, /aria-pressed=/, "its state is announced");
  assert.match(src, /aria-label=\{on \?/, "and its label says what the click will do");
  assert.match(src, /e\.preventDefault\(\); e\.stopPropagation\(\)/, "starring inside a link must not navigate");
});
