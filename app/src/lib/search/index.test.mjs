/**
 * P251-F7 — SEARCH CAN ONLY POINT AT SOMETHING THAT EXISTS.
 *
 * The site had nineteen filter boxes, each scoped to one board, and no way in from outside: a
 * reader who wanted a player or a club had to already know which of 377 pages to open.
 *
 * The risk a search index introduces is that it becomes a second surface — a list of names that
 * outlives the pages behind it, or that quotes numbers which can disagree with the page it opens.
 * Both are checked here, against the built export, because a link that 404s is only a link when
 * it is shipped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const OUT = path.join(APP, "out");
const INDEX = path.join(OUT, "data", "search", "index.json");
const hasExport = fs.existsSync(INDEX);
const idx = hasExport ? JSON.parse(fs.readFileSync(INDEX, "utf8")) : null;

test("BUILT · the index ships, and survives the data sweep", { skip: !hasExport && "no export in this run" }, () => {
  assert.equal(idx.dataClass, "PUBLIC_DERIVED");
  assert.ok(idx.rows.length > 100, `only ${idx.rows.length} rows — the index is not being built from live artifacts`);
  /*
   * It is fetched on first open rather than bundled, so no page references it and the prune
   * script's derived keep-set cannot see it. That is exactly why it is named in
   * ALWAYS_PUBLIC_DATA — and why this asserts the file survived rather than trusting the list.
   */
  const prune = fs.readFileSync(path.join(APP, "scripts/prune-internal-routes.mjs"), "utf8");
  assert.match(prune, /"search\/index\.json"/, "the index is kept deliberately, not by accident");
});

test("BUILT · every destination in the index is a page we shipped", { skip: !hasExport && "no export" }, () => {
  const dead = [];
  for (const r of idx.rows) {
    const rel = String(r.h).replace(/^\//, "").replace(/\/$/, "");
    if (!fs.existsSync(path.join(OUT, rel, "index.html"))) dead.push(`${r.l} → ${r.h}`);
  }
  assert.deepEqual(dead.slice(0, 10), [], `index entries pointing at pages that do not exist (${dead.length}):\n  ${dead.slice(0, 10).join("\n  ")}`);
});

test("A RESULT IS A DOOR, NOT A SECOND SURFACE", { skip: !hasExport && "no export" }, () => {
  /*
   * Rows carry a label, a context line and a destination. If a row ever carried a probability or a
   * price it could disagree with the page it opens — two answers to one question, which is the
   * defect class this repository keeps closing. The row shape is asserted rather than described.
   */
  for (const r of idx.rows.slice(0, 200)) {
    assert.deepEqual(Object.keys(r).sort(), ["h", "k", "l", "s", "t"], `unexpected field on "${r.l}"`);
  }
  const blob = JSON.stringify(idx.rows);
  for (const banned of ["probability", "edge", "odds", "price", "median", "percent"]) {
    assert.ok(!blob.includes(`"${banned}"`), `the index must not carry "${banned}"`);
  }
  assert.ok(!/\b\d{1,3}\.\d%/.test(blob), "no percentage may appear in a search row");
});

test("the index is small enough to fetch on demand", { skip: !hasExport && "no export" }, () => {
  const kb = fs.statSync(INDEX).size / 1024;
  /* A budget, not a limit reached by accident: past this it stops being reasonable to fetch on a
     phone, and the answer is to narrow WHAT is indexed rather than to raise the number. */
  assert.ok(kb < 260, `the search index is ${kb.toFixed(0)} KB — narrow what is indexed rather than raising this budget`);
});

test("BUILT · the search entry point is on the page, on desktop and on mobile", { skip: !hasExport && "no export" }, () => {
  for (const route of ["", "nfl", "mlb", "results"]) {
    const f = path.join(OUT, route, "index.html");
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf8");
    assert.match(html, /gtp-site-search-trigger/, `/${route} ships no way to open search`);
  }
  const rail = fs.readFileSync(path.join(APP, "src/components/command-rail.tsx"), "utf8");
  const nav = fs.readFileSync(path.join(APP, "src/components/nav.tsx"), "utf8");
  assert.match(rail, /SiteSearch/, "the desktop rail carries it");
  assert.match(nav, /SiteSearch/, "and the mobile header does too — the rail is desktop-only");
});

test("a player is indexed because a BOARD published him, never because a roster lists him", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/build-search-index.mjs"), "utf8");
  assert.match(src, /player-board/, "NFL players come from the published boards");
  assert.ok(!/rosters\/latest\.json/.test(src), "being rostered is not being published");
  assert.match(src, /entries\.has\(key\)/, "a repeat cannot double-list a player who appears on four boards");
  /*
   * P252: EPL was missing entirely — the player layer shipped after this index was written and the
   * generator never learned about it, so a Premier League striker was unfindable while his
   * projection was live on three surfaces. And the fix had to respect the same rule: the fixture
   * page renders the 12 likeliest of ~64 squad rows, so indexing all 64 would have sent a searcher
   * to a page that does not name 52 of them.
   */
  assert.match(src, /player-projections/, "EPL players come from the published projections");
  assert.match(src, /EPL_PLAYERS_RENDERED/, "…capped to what the fixture page actually renders");
});

test("LIVE · every sport that publishes players has them in the index", { skip: !hasExport && "no export" }, () => {
  const players = idx.rows.filter((r) => r.k === 1);
  for (const [sport, marker] of [["NFL", /NFL ·/], ["MLB", /MLB ·/], ["UFC", /UFC ·/], ["Premier League", /Premier League ·/]]) {
    assert.ok(players.some((p) => marker.test(p.s)), `no ${sport} player is indexed, but that sport publishes them`);
  }
});

test("LIVE · an indexed EPL player is one the fixture page actually names", { skip: !hasExport && "no export" }, () => {
  const eplPlayers = idx.rows.filter((r) => r.k === 1 && /Premier League ·/.test(r.s));
  if (!eplPlayers.length) return;
  const byPage = new Map();
  for (const p of eplPlayers) {
    const f = path.join(OUT, String(p.h).replace(/^\//, "").replace(/\/$/, ""), "index.html");
    if (!byPage.has(f)) {
      byPage.set(f, fs.existsSync(f)
        ? fs.readFileSync(f, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ")
        : "");
    }
    assert.ok(byPage.get(f).includes(p.l), `${p.l} is indexed to ${p.h}, and that page never names him`);
  }
});
