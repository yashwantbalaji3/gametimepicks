/**
 * THE RESULTS TRACE, AGAINST THE BUILT EXPORT (founder 2026-10-23). Each settled game on a /results/date/<d>/ page
 * links its Official Forecast (the exported page that published the pregame forecast) and its sport's Model
 * Performance pages. A trace link to a page the deploy did not export would be worse than no link, so every one is
 * proven against out/. Post-build: skips when out/ is absent (unit lane).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const DAYS = path.join(OUT, "results/date");

const exported = (href) => {
  const p = href.split("#")[0].split("?")[0];
  return fs.existsSync(path.join(OUT, p, "index.html")) || fs.existsSync(path.join(OUT, p));
};

test("🔴 every trace and Model Performance link on the day pages opens an exported page", (t) => {
  if (!fs.existsSync(DAYS)) return t.skip("post-build: out/results/date is emitted by the build");
  let links = 0;
  let traced = 0;
  const missing = [];
  for (const d of fs.readdirSync(DAYS)) {
    const f = path.join(DAYS, d, "index.html");
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf8");
    for (const block of html.match(/data-(?:trace|model-performance)="true"[\s\S]*?<\/p>/g) ?? []) {
      for (const [, href] of block.matchAll(/href="([^"]+)"/g)) {
        links += 1;
        if (!exported(href)) missing.push(`${d}: ${href}`);
      }
      if (block.startsWith("data-trace")) traced += 1;
    }
  }
  assert.deepEqual(missing.slice(0, 20), [], `${missing.length} trace links point at no exported page`);
  assert.ok(traced > 0 && links > 0, "the day pages carry the trace");
});

test("🔴 every earlier NBA day /results/nba links to is an exported day page carrying that day's official forecasts", (t) => {
  const nba = path.join(OUT, "results/nba/index.html");
  if (!fs.existsSync(nba)) return t.skip("post-build: out/results/nba is emitted by the build");
  const html = fs.readFileSync(nba, "utf8");
  const block = html.match(/data-nba-older-days="true"[\s\S]*?<\/ul>/)?.[0] ?? "";
  for (const [, d] of block.matchAll(/href="\/results\/date\/(\d{4}-\d{2}-\d{2})\/#official-forecast"/g)) {
    const f = path.join(DAYS, d, "index.html");
    assert.ok(fs.existsSync(f), `${d} has no day page`);
    assert.match(fs.readFileSync(f, "utf8"), new RegExp(`id="official-forecast"[\\s\\S]*data-nba-day="${d}"`), `${d}'s page carries its NBA games`);
  }
  /* Not vacuous while the season is young: every lane day's page carries that day's games, linked or not yet. */
  const laneDir = path.join(process.cwd(), "public/data/nba/experimental-public");
  const laneDays = fs.readdirSync(laneDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10));
  assert.ok(laneDays.length > 0);
  for (const d of laneDays) {
    const f = path.join(DAYS, d, "index.html");
    assert.ok(fs.existsSync(f), `lane day ${d} has no day page`);
    assert.match(fs.readFileSync(f, "utf8"), new RegExp(`data-nba-day="${d}"`), `${d}'s page carries its NBA games`);
  }
});

/* Release owner 2026-10-24: the archive's per-game rows moved off /results/nba to the day pages. Across EVERY archive
   date, each game's card is anchored and holds exactly that game's rows, in order; every /results/nba link lands on one. */
const ARCHIVE = path.join(process.cwd(), "public/data/results/settled_leans.jsonl");
const archiveByDate = () => {
  const by = new Map();
  for (const l of fs.readFileSync(ARCHIVE, "utf8").split("\n")) {
    if (!l.trim()) continue;
    const r = JSON.parse(l);
    if (!by.has(r.date)) by.set(r.date, new Map());
    const g = by.get(r.date);
    g.set(r.gameId ?? "_", [...(g.get(r.gameId ?? "_") ?? []), r]);
  }
  return by;
};
const cardOf = (html, gid) => {
  const i = html.indexOf(`data-nba-archive-game="${gid}"`);
  if (i < 0) return null;
  const j = html.indexOf("data-nba-archive-game=", i + 10);
  return html.slice(i, j > -1 ? j : html.indexOf("</section>", i));
};
const unescape = (s) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

test("🔴 every archived game, on every archive date, is anchored on its day page with exactly its rows", (t) => {
  if (!fs.existsSync(DAYS)) return t.skip("post-build: out/results/date is emitted by the build");
  let games = 0;
  for (const [d, byGame] of archiveByDate()) {
    const f = path.join(DAYS, d, "index.html");
    assert.ok(fs.existsSync(f), `${d} has no day page`);
    const html = fs.readFileSync(f, "utf8");
    for (const [gid, rows] of byGame) {
      const card = cardOf(html, gid);
      assert.ok(card, `${d} ${gid}: no anchored card`);
      assert.match(html, new RegExp(`<div id="nba-game-${gid}"[^>]*data-nba-archive-game="${gid}"`), `${d} ${gid}: the card carries its anchor`);
      assert.equal((card.match(/class="sgd-row"/g) ?? []).length, rows.length, `${d} ${gid}: row count`);
      const names = [...card.matchAll(/<span class="sgd-name">([^<]*)<\/span>/g)].map((m) => unescape(m[1]));
      assert.deepEqual(names, rows.map((r) => r.playerName ?? "—"), `${d} ${gid}: the exact rows, in order`);
      games += 1;
    }
  }
  assert.ok(games >= 17, `checked ${games} archived games`);
});

test("🔴 /results/nba lists every newest-date archive game, and each link opens that game's rows on its day page", (t) => {
  const nba = path.join(OUT, "results/nba/index.html");
  if (!fs.existsSync(nba)) return t.skip("post-build: out/results/nba is emitted by the build");
  const html = fs.readFileSync(nba, "utf8");
  const by = archiveByDate();
  const newest = [...by.keys()].sort().at(-1);
  const links = [...html.matchAll(/href="([^"]+)" class="[^"]*" data-archive-link="([^"]+)"/g)].map((m) => ({ href: m[1], gid: m[2] }));
  assert.deepEqual(links.map((l) => l.gid).sort(), [...by.get(newest).keys()].sort(), "every game of the newest date is listed");
  assert.doesNotMatch(html, /class="sgd-row"/, "no inline player rows on /results/nba");
  for (const { href, gid } of links) {
    assert.equal(href, `/results/date/${newest}/#nba-game-${gid}`);
    const card = cardOf(fs.readFileSync(path.join(DAYS, newest, "index.html"), "utf8"), gid);
    assert.ok(card && (card.match(/class="sgd-row"/g) ?? []).length === by.get(newest).get(gid).length, `${gid}: the link lands on its rows`);
  }
});
