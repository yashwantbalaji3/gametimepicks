/**
 * P251-F5 — A HUB WITH DATA HAS CONTROLS FOR IT.
 *
 * On the day NFL was the lead sport, /nfl carried five tables, forty-five ranked rows and zero
 * buttons or selects, while /mlb carried thirty-two controls and eight filters over a comparable
 * amount of data. And every other sport's event page carries a strip of its slate-mates; the EPL
 * match page had four links on the whole page, so a reader who arrived for one fixture could only
 * go backwards.
 *
 * Stated over the BUILT export, because a control that exists in source and never reaches the page
 * is the failure this is about.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const ui = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, "");
const mainOf = (f) => {
  const m = ui(fs.readFileSync(f, "utf8")).match(/<main[\s\S]*?<\/main>/i);
  return m ? m[0] : "";
};
const exists = (rel) => fs.existsSync(path.join(OUT, rel, "index.html"));

test("BUILT · the NFL hub's ranked boards can be filtered", { skip: !exists("nfl") && "no export" }, () => {
  const main = mainOf(path.join(OUT, "nfl", "index.html"));
  const buttons = (main.match(/<button\b/g) ?? []).length;
  /* The team chips are one per club on the published boards, so the floor follows the boards: a full week's
     45-row board offers ~30 clubs, the week's last game offers two. Every club must still be reachable. */
  const wb = path.join(process.cwd(), "public/data/nfl/weekly-boards/latest.json");
  const teams = fs.existsSync(wb) ? new Set(JSON.parse(fs.readFileSync(wb, "utf8")).boards.flatMap((b) => (b.rows ?? []).map((r) => r.team))).size : 7;
  assert.ok(buttons >= 1 + teams, `the NFL hub renders ${buttons} controls for ${teams} clubs on its ranked boards — every club needs a way in`);
  assert.match(main, /All teams/, "a team filter is offered");
  assert.match(main, /type="search"/, "…and a player search beside it");
});

test("BUILT · filtering narrows the view and never re-ranks it", () => {
  /* 2026-10-08: the hub boards moved to the shared FamilyTabs. Same claim: the rank a reader sees is the row's place on
     the PUBLISHED board (ranked once, in forecast-view.mjs topBoards); a filter only hides rows. */
  const src = fs.readFileSync(path.join(process.cwd(), "src/components/nfl/forecast/family-tabs.tsx"), "utf8");
  assert.match(src, /rank=\{r\.rank\}/, "rank comes from the published board, carried on the row");
  assert.ok(!/rank=\{[^}]*(index|idx|\bi\b)/.test(src), "the rank must never be read off the filtered list position");
  assert.ok(!/rows[^\n]*\.sort\(/.test(src) && !/all[^\n]*\.sort\(/.test(src), "the rows must not be re-sorted — ranking has one owner");
  assert.match(src, /No published row matches this filter\./, "a filter with no matching row says so rather than vanishing");
  const view = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/nfl/forecast-view.mjs"), "utf8");
  assert.match(view, /rank: i \+ 1/, "the one ranking owner");
});

test("BUILT · an EPL match page offers its slate-mates", { skip: !fs.existsSync(path.join(OUT, "epl", "match")) && "no export" }, () => {
  const dir = path.join(OUT, "epl", "match");
  const slugs = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "index.html")));
  if (slugs.length < 2) return; // a one-fixture matchweek genuinely has no siblings
  let checked = 0;
  for (const slug of slugs.slice(0, 6)) {
    const main = mainOf(path.join(dir, slug, "index.html"));
    const links = [...new Set([...main.matchAll(/href="(\/epl\/match\/[^"]+)"/g)].map((m) => m[1]))]
      .filter((h) => !h.includes(slug));
    /* Archived fixtures legitimately have no current slate-mates; the CURRENT ones must. */
    if (links.length === 0) continue;
    for (const href of links) {
      assert.ok(fs.existsSync(path.join(OUT, href.replace(/^\//, ""), "index.html")), `${slug} links ${href}, which was never generated`);
    }
    checked += 1;
  }
  assert.ok(checked > 0, "no EPL match page offered a single sibling fixture");
});

test("BUILT · the client boundary ships only what it renders", () => {
  /*
   * P229's lesson, met again while adding the filter. Handing the artifact's board objects
   * straight to a client component serialises EVERY field into the RSC payload — including
   * `basis`, which carries internal model ids ("anytime-td-v1") that the public page's own
   * boundary guard forbids. The page got 75 KB smaller when the projection went in, which is the
   * same defect measured a second way.
   */
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/nfl/page.tsx"), "utf8");
  assert.ok(!/boards=\{weeklyBoards\.boards( as never)?\}/.test(page),
    "the whole artifact object must not cross the boundary — project the rendered fields");
  // 2026-10-08: the hub boards cross as boardTabs(...) — the shared view's slim projection, which names its fields.
  assert.match(page, /\{\.\.\.boardTabs\(unifiedBoards\.boards\)\}/);
  const view = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/nfl/forecast-view.mjs"), "utf8");
  assert.match(view, /const slim = \(p\) => \(\{ playerId: p\.playerId, name: p\.name,/, "the projection names the fields it ships");
  assert.match(view, /const slimEntry = \(e\) => \(\{ value: e\.value, p10: e\.p10 \?\? null, p90: e\.p90 \?\? null, mean: e\.mean \?\? null \}\)/, "and no basis or model id");
  const f = path.join(OUT, "nfl", "index.html");
  if (!fs.existsSync(f)) return;
  const html = fs.readFileSync(f, "utf8");
  for (const marker of ["anytime-td-v1", "player-props-v1", "role-shares-v1", "PRIVATE_RESEARCH"]) {
    assert.ok(!html.includes(marker), `the payload carries "${marker}" — a field nobody renders reached the page`);
  }
});
