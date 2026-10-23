/**
 * POST-BUILD · game discovery and depth (gaps 3–6, 2026-10-23), read from the built export.
 *
 *   gap 6  every sport's /players/<s>/ and /teams/<s>/ index exists and links EXACTLY the detail pages the research index
 *          generates (each one served by this export); /players/ and /teams/ link each sport index; no UFC team index.
 *   gap 5  a settled NFL game page with a FINAL official file carries the "What happened" box score with its final.
 *   gap 3  /today carries the cross-sport games table.
 *   gap 4  an NFL game page with a simulation carries the all-players table.
 *   weight the new index pages stay inside a measured ceiling.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const OUT = path.join(APP, "out");
const has = (rel) => fs.existsSync(path.join(OUT, rel));
const html = (rel) => fs.readFileSync(path.join(OUT, rel), "utf8");
const index = JSON.parse(fs.readFileSync(path.join(APP, "..", "data", "research-projection", "v1", "index.json"), "utf8")).entries;

/*
 * Weight ceilings, SCALED BY THE REGISTRY: SHELL_KB for the page around the list, plus PER_ROW_KB for each entry it lists.
 * A fixed number per page broke on the first measurement and would break again as rosters grow (a UFC card adds ~20
 * fighters), which is growth, not a regression. Derived from CI's own measurements:
 *   run 39912148148 (74696635e0)  players/nfl 208KB with 763 rows (old row markup, 101.8KB of list HTML by renderToString)
 *   run 39914448030 (b186699a06)  players/ufc 113KB with 352 rows (compact rows, 24.8KB of list HTML + 16.1KB of props)
 * ⇒ the shared shell is ~65–69KB, and a compact row costs ~0.14KB (HTML + its props in the flight). 80KB + 0.2KB/row fails
 * a ~45% per-row regression or a heavier shell, and allows registry growth. Every size is printed (diagnostic) per run.
 */
const SHELL_KB = 80;
const PER_ROW_KB = 0.2;
const rowsOf = (rel) => {
  const [root, sport] = rel.split("/");
  if (sport === "index.html") return 4; // the two directories list one card per sport
  return index.filter((e) => e.kind === (root === "players" ? "player" : "team") && e.sport.toLowerCase() === sport).length;
};
const WEIGHED = ["players/nfl/index.html", "players/epl/index.html", "players/mlb/index.html", "players/ufc/index.html", "teams/nfl/index.html", "teams/mlb/index.html", "teams/epl/index.html", "players/index.html", "teams/index.html"];

test("every research index page links exactly the detail pages that exist", (t) => {
  if (!has("index.html")) { t.skip("no export in this run"); return; }
  for (const kind of ["player", "team"]) {
    const root = kind === "player" ? "players" : "teams";
    const sports = [...new Set(index.filter((e) => e.kind === kind).map((e) => e.sport.toLowerCase()))];
    assert.ok(sports.length >= 3, `${root}: sports`);
    assert.ok(has(`${root}/index.html`), `/${root}/ must exist`);
    for (const s of sports) {
      assert.match(html(`${root}/index.html`), new RegExp(`href="/${root}/${s}/"`), `/${root}/ links /${root}/${s}/`);
      const page = `${root}/${s}/index.html`;
      assert.ok(has(page), `/${root}/${s}/ must exist (it 404ed before gap 6)`);
      const linked = new Set([...html(page).matchAll(new RegExp(`href="(/${root}/${s}/[^"/]+/)"`, "g"))].map((m) => m[1]));
      const expected = new Set(index.filter((e) => e.kind === kind && e.sport.toLowerCase() === s).map((e) => e.path));
      assert.deepEqual([...linked].sort(), [...expected].sort(), `/${root}/${s}/ lists exactly the index's ${kind} pages`);
      for (const href of linked) assert.ok(has(`${href.slice(1)}index.html`), `${href} is linked but not built`);
    }
  }
  assert.ok(!has("teams/ufc/index.html"), "UFC has no teams, so no team index");
});

test("the new index pages stay inside their registry-scaled ceilings", (t) => {
  if (!has("index.html")) { t.skip("no export in this run"); return; }
  for (const rel of WEIGHED) {
    assert.ok(has(rel), `${rel} missing`);
    const rows = rowsOf(rel);
    const kb = SHELL_KB + PER_ROW_KB * rows;
    const size = fs.statSync(path.join(OUT, rel)).size / 1024;
    t.diagnostic(`${rel}: ${size.toFixed(1)}KB for ${rows} rows (ceiling ${kb.toFixed(1)}KB)`);
    assert.ok(size <= kb, `${rel}: ${size.toFixed(1)}KB exceeds ${kb.toFixed(1)}KB (${SHELL_KB}KB + ${PER_ROW_KB}KB × ${rows} rows)`);
  }
});

test("a settled NFL game page shows the official box score under What happened", (t) => {
  if (!has("index.html")) { t.skip("no export in this run"); return; }
  const stats = path.join(APP, "..", "data", "internal", "nfl", "official-stats");
  const finals = fs.readdirSync(stats).map((f) => f.replace(/\.json$/, "")).filter((id) => has(`nfl/game/${id}/index.html`));
  assert.ok(finals.length > 10, `settled game pages with official lines: ${finals.length}`);
  for (const id of finals) {
    const off = JSON.parse(fs.readFileSync(path.join(stats, `${id}.json`), "utf8"));
    if (off.state !== "FINAL") continue;
    const page = html(`nfl/game/${id}/index.html`);
    assert.match(page, /id="what-happened"/, `${id}: box score section`);
    assert.match(page, new RegExp(`Final: [A-Z]{2,3} ${off.finalScore.away} – ${off.finalScore.home} [A-Z]{2,3}`), `${id}: the official final`);
  }
});

test("/today carries the cross-sport games table; a simulated NFL game carries the all-players table", (t) => {
  if (!has("index.html")) { t.skip("no export in this run"); return; }
  const today = html("today/index.html");
  assert.match(today, /id="all-games"/);
  assert.match(today, /class="gt-table"|No events match these filters/);
  const withSim = fs.readdirSync(path.join(OUT, "nfl", "game")).filter((id) => /id="nf-players-h"/.test(html(`nfl/game/${id}/index.html`)));
  assert.ok(withSim.length > 0, "at least one simulated NFL game page");
  for (const id of withSim) assert.match(html(`nfl/game/${id}/index.html`), /players on the official board/, `${id}: all-players table`);
});
