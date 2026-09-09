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
  assert.ok(buttons >= 8, `the NFL hub renders ${buttons} controls — a 45-row ranked board needs a way in`);
  assert.match(main, /All teams/, "a team filter is offered");
  assert.match(main, /type="search"/, "…and a player search beside it");
});

test("BUILT · filtering narrows the view and never re-ranks it", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/components/nfl/weekly-boards.tsx"), "utf8");
  /*
   * The rank a reader sees must be the row's place in the PUBLISHED board. Renumbering a filtered
   * view would invent a ranking the owner never produced — the same rule that keeps a top-N table
   * a maximum rather than a quota.
   */
  assert.match(src, /\(b\.rows \?\? \[\]\)\.indexOf\(r\) \+ 1/, "rank comes from the published board, not the filtered rows");
  /* The chip list is sorted (it is an alphabetical index of clubs); the ROWS never are. */
  assert.ok(!/rows[^\n]*\.sort\(/.test(src), "the rows must not be re-sorted — ranking has one owner");
  assert.ok(!/filtered[^\n]*\.sort\(/.test(src), "the filtered view must not be re-sorted either");
  assert.match(src, /No .*player is in this board/, "a board with no matching row says so rather than vanishing");
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
  assert.match(page, /playerId: String\(r\.playerId\)/, "the projection names the fields it ships");
  const f = path.join(OUT, "nfl", "index.html");
  if (!fs.existsSync(f)) return;
  const html = fs.readFileSync(f, "utf8");
  for (const marker of ["anytime-td-v1", "player-props-v1", "role-shares-v1", "PRIVATE_RESEARCH"]) {
    assert.ok(!html.includes(marker), `the payload carries "${marker}" — a field nobody renders reached the page`);
  }
});
