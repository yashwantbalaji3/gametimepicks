/**
 * MATCHUP EXPLORER + COMPARE — built-export guards (v1.4). Post-build phase: reads out/.
 *
 *  CB1  routes: exactly the compare shells + one Matchup page per registry entry (durable); no pair route; UFC and
 *       unknown games have no page
 *  CB2  SEO: shell canonicals, EPL/MLB noindex, matchup robots follow the registry; sitemap = indexable shells +
 *       indexable matchups, never a query URL or a noindex page
 *  CB3  public assets: out/data/compare/v1 is byte-for-byte the committed projection (index + entities) and leaks nothing
 *  CB4  matchup content: factual sections, no evaluative word, no forecast value, forecast section ⇔ exact-id join,
 *       status never baked as "upcoming" (reader clock), recorded finals shown as finals
 *  CB5  every internal link on compare shells and matchup pages resolves
 *  CB6  discovery: CTAs only where the destination exists (team/player research, NFL/MLB game pages)
 *  CB7  no Live request and no provider call from compare or matchup page code
 *
 * Run (after `npm run build`): npx tsx --test src/lib/compare/compare-built.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { EVALUATIVE_TERMS } from "./contract.mjs";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const OUT = path.join(APP, "out");
const CMP = path.join(APP, "..", "data/compare-projection/v1");
const readCmp = (rel) => { const b = fs.readFileSync(path.join(CMP, rel)); return (rel.endsWith(".gz") ? zlib.gunzipSync(b) : b).toString("utf8"); };
const lines = (rel) => readCmp(rel).split("\n").filter(Boolean);
const htmlOf = (p) => fs.readFileSync(path.join(OUT, p.replace(/^\//, ""), "index.html"), "utf8");
const exists = (p) => { const t = p.replace(/^\//, ""); return fs.existsSync(path.join(OUT, t, "index.html")) || fs.existsSync(path.join(OUT, t)); };
const mainOf = (html) => /<main[\s\S]*?<\/main>/.exec(html)?.[0] ?? "";
const textOf = (fragment) => fragment.replace(/<!-- -->/g, "").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");
const matchups = ["MLB", "NFL"].flatMap((s) => lines(`matchups/${s}.jsonl.gz`).map((l) => JSON.parse(l)));
const SHELLS = ["/compare/", "/compare/teams/mlb/", "/compare/teams/nfl/", "/compare/teams/epl/", "/compare/players/nfl/", "/compare/players/epl/", "/compare/players/mlb/"];

test("CB1 exactly the compare shells and the registry's matchup pages are exported; no pair route", () => {
  assert.ok(fs.existsSync(OUT), "run after `npm run build` (post-build phase)");
  for (const s of SHELLS) assert.ok(exists(s), s);
  for (const s of ["/compare/players/ufc/", "/compare/teams/ufc/"]) assert.ok(!exists(s), `${s} must not exist`);
  const walkHtml = (root) => {
    const found = [];
    const visit = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) visit(path.join(d, e.name)); else if (e.name === "index.html") found.push(`/${path.relative(OUT, d)}/`); } };
    if (fs.existsSync(path.join(OUT, root))) visit(path.join(OUT, root));
    return found.sort();
  };
  assert.deepEqual(walkHtml("compare"), [...SHELLS].sort(), "no page below a sport shell (a pair route would appear here)");
  assert.deepEqual(walkHtml("matchups"), matchups.map((m) => m.path).sort(), "matchup pages = registry (durable, no more, no fewer)");
  assert.ok(matchups.length >= 50, `matchups ${matchups.length}`);
  assert.ok(!exists("/matchups/nfl/0/"));
});

test("CB2 SEO: canonicals, robots and sitemap membership follow the policy", () => {
  const sitemap = fs.readFileSync(path.join(OUT, "sitemap.xml"), "utf8");
  const locs = [...sitemap.matchAll(/<loc>https:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(!locs.some((u) => u.includes("?")), "no query-state URL in the sitemap");
  const compareLocs = locs.filter((u) => u.startsWith("/compare/")).sort();
  assert.deepEqual(compareLocs, ["/compare/", "/compare/players/epl/", "/compare/players/mlb/", "/compare/players/nfl/", "/compare/teams/mlb/", "/compare/teams/nfl/"]);
  const matchupLocs = new Set(locs.filter((u) => u.startsWith("/matchups/")));
  for (const m of matchups) assert.equal(matchupLocs.has(m.path), m.indexable, `${m.path} sitemap ⇔ indexable`);
  assert.ok(matchups.some((m) => m.indexable) && matchups.some((m) => !m.indexable), "both states present (non-vacuous)");
  const robots = (html) => /<meta name="robots" content="([^"]+)"/.exec(html)?.[1] ?? "";
  const canonical = (html) => /<link rel="canonical" href="https:\/\/[^/]+([^"]+)"/.exec(html)?.[1];
  for (const s of SHELLS) {
    const h = htmlOf(s);
    assert.equal(canonical(h), s, `${s} canonical`);
    assert.equal(/noindex/.test(robots(h)), s === "/compare/teams/epl/", `${s} robots`);
  }
  for (const m of [matchups.find((x) => x.indexable), matchups.find((x) => !x.indexable)]) {
    const h = htmlOf(m.path);
    assert.equal(canonical(h), m.path);
    assert.equal(/noindex/.test(robots(h)), !m.indexable, `${m.path} robots`);
    assert.doesNotMatch((/<title>([^<]*)<\/title>/.exec(h)?.[1] ?? "").replace(/\s*\|\s*GameTimePicks$/, ""), /prediction|pick|odds/i, "factual title");
  }
});

test("CB3 public compare assets are exactly the committed projection and leak nothing", () => {
  const root = path.join(OUT, "data/compare/v1");
  let files = 0;
  for (const [kind, sports] of [["teams", ["MLB", "NFL"]], ["players", ["NFL", "EPL", "MLB"]]]) {
    for (const s of sports) {
      const seg = s.toLowerCase();
      assert.equal(fs.readFileSync(path.join(root, kind, seg, "index.json"), "utf8"), readCmp(`indexes/${kind}-${seg}.json`), `${kind}/${seg} index`);
      const ents = lines(`${kind}/${s}.jsonl.gz`);
      const onDisk = fs.readdirSync(path.join(root, kind, seg)).filter((f) => f !== "index.json");
      assert.equal(onDisk.length, ents.length, `${kind}/${seg} entity files`);
      for (const l of ents.filter((_, i) => i % 17 === 0)) {
        const e = JSON.parse(l);
        assert.equal(fs.readFileSync(path.join(root, kind, seg, `${e.slug}.json`), "utf8"), `${l}\n`);
      }
      files += onDisk.length + 1;
    }
  }
  const all = [];
  const visit = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) visit(path.join(d, e.name)); else all.push(path.join(d, e.name)); } };
  visit(root);
  assert.equal(all.length, files, "no stray public file under compare/v1");
  const needles = ["data/internal", "research-projection", "compare-projection", "providerAliases", "/Users/", '"forecast":', '"median":', '"probability":'];
  for (const f of all.filter((_, i) => i % 29 === 0)) {
    const s = fs.readFileSync(f, "utf8");
    for (const n of needles) assert.ok(!s.includes(n), `${path.relative(OUT, f)} contains ${n}`);
  }
});

test("CB4 matchup pages: factual, neutral, forecast only by exact join, no baked-in upcoming claim", () => {
  const nflPages = new Set(fs.readdirSync(path.join(OUT, "nfl/game")));
  let finals = 0, pending = 0, withForecast = 0;
  for (const m of matchups) {
    const main = mainOf(htmlOf(m.path));
    // Page content only: the shared slate status bar above the page carries its own (build-stamped) chrome.
    const full = textOf(main);
    const text = full.slice(full.indexOf("Matchup research"));
    assert.match(text, /Matchup research/);
    assert.match(text, /Recorded meetings before this game/);
    assert.doesNotMatch(text, /(?<!Not an )all-time/i);
    const beforeForecast = text.split("Current GameTime forecast")[0];
    for (const t of EVALUATIVE_TERMS) assert.doesNotMatch(beforeForecast, new RegExp(`\\b${t}\\b`, "i"), `${m.path} says "${t}"`);
    assert.doesNotMatch(text, /\bupcoming\b|starts in|\btoday\b|\btomorrow\b/i, `${m.path}: no build-time clock claim`);
    assert.doesNotMatch(text, /\d+(\.\d+)?%|\bmedian\b|win chance|projected/i, `${m.path}: no forecast value on the factual page`);
    if (m.final) {
      finals += 1;
      assert.match(main, /data-matchup-status="final"/);
      assert.match(text, new RegExp(`Final \\(official score\\)`));
    } else {
      pending += 1;
      assert.match(main, /data-matchup-status="pending"/, `${m.path}: status decided after mount`);
    }
    const hasForecast = text.includes("Current GameTime forecast");
    if (hasForecast) { withForecast += 1; assert.match(text, /Model output, not historical fact/); }
    if (m.sport === "NFL") assert.equal(hasForecast, nflPages.has(m.gameId), `${m.path}: forecast section ⇔ an NFL game report exists for this exact id`);
  }
  assert.ok(finals > 0 && pending > 0 && withForecast > 0, `non-vacuous: ${finals} final, ${pending} pending, ${withForecast} with forecast`);
});

test("CB5 every internal link on compare shells and matchup pages resolves", () => {
  const bad = [];
  let n = 0;
  for (const p of [...SHELLS, ...matchups.map((m) => m.path)]) {
    for (const m of mainOf(htmlOf(p)).matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
      n += 1;
      if (!exists(m[1])) bad.push(`${p} → ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(n > 500, `links checked: ${n}`);
});

test("CB6 discovery CTAs appear only where their destination exists", () => {
  const ids = new Set(matchups.map((m) => m.gameId));
  for (const p of ["/teams/nfl/kansas-city-chiefs/", "/teams/mlb/new-york-mets/"]) assert.match(htmlOf(p), /href="\/compare\/teams\/(nfl|mlb)\/\?a=[a-z-]+"/, p);
  assert.doesNotMatch(htmlOf("/teams/epl/arsenal/"), /\/compare\/teams\//, "no Team Compare CTA where it is blocked");
  assert.match(htmlOf("/players/nfl/keenan-allen/"), /href="\/compare\/players\/nfl\/\?a=keenan-allen"/);
  assert.doesNotMatch(htmlOf("/players/ufc/elizeu-zaleski-dos-santos/"), /\/compare\//, "no UFC Player Compare CTA");
  let nflCta = 0;
  for (const id of fs.readdirSync(path.join(OUT, "nfl/game"))) {
    const html = htmlOf(`/nfl/game/${id}/`);
    const has = html.includes(`href="/matchups/nfl/${id}/"`);
    assert.equal(has, ids.has(id), `/nfl/game/${id}/ Research matchup CTA ⇔ page exists`);
    if (has) nflCta += 1;
  }
  let mlbCta = 0;
  for (const slug of fs.readdirSync(path.join(OUT, "games/mlb"))) {
    if (!fs.existsSync(path.join(OUT, "games/mlb", slug, "index.html"))) continue;
    for (const m of htmlOf(`/games/mlb/${slug}/`).matchAll(/href="\/matchups\/mlb\/(\d+)\/"/g)) { assert.ok(ids.has(m[1]), `${slug} → ${m[1]}`); mlbCta += 1; }
  }
  assert.ok(nflCta > 0 && mlbCta > 0, `non-vacuous: NFL ${nflCta}, MLB ${mlbCta}`);
});

test("CB7 compare and matchup page code makes no Live request and no provider call", () => {
  const dirs = ["compare", "compare/teams/[sport]", "compare/players/[sport]", "matchups/[sport]/[gameId]"].map((d) => path.join(OUT, "_next/static/chunks/app", d));
  const chunks = dirs.flatMap((d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(d, f), "utf8")) : []));
  assert.ok(chunks.length >= 3, `compare page chunks found: ${chunks.length}`);
  for (const js of chunks) assert.doesNotMatch(js, /\/api\/live|espn\.com|statsapi\.mlb\.com|the-odds-api|api-football|localStorage/, "no Live, provider or device storage");
  for (const p of SHELLS.concat(matchups.slice(0, 5).map((m) => m.path))) {
    const html = htmlOf(p);
    for (const n of ["data/internal", "research-projection", "compare-projection", "/Users/"]) assert.ok(!html.includes(n), `${p} contains ${n}`);
  }
});
