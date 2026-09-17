/**
 * RESEARCH LAB — the built export (v1.5 · §99 post-build · §105 §106 §114–§119).
 *
 *  LB1  exactly ONE Lab page is exported; no page per query, season, filter, mode or sport
 *  LB2  SEO: canonical is the shell, the shell is in the sitemap exactly once, and no query URL ever is
 *  LB3  public assets are byte-for-byte the committed projection — every declared partition, and nothing else
 *  LB4  the page makes no Live request and no provider call, and owns no device storage (dependency-aware chunk scan)
 *  LB5  no internal path, provider key or absolute filesystem path reaches the export
 *  LB6  the rendered page is factual: no prediction, no evaluative word, no rate, no reader-clock phrase in the HTML
 *  LB7  every link the Lab can emit resolves in THIS export — durable routes only, never a synthesised one
 *  LB8  the page ships no forecast, Live, settlement or personal value, and the grammar it carries is the pinned one
 *
 * Run (after `npm run build`): npx tsx --test src/lib/lab/lab-built.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { LAB_ASSET_PREFIX, LAB_BUDGET, LAB_EVALUATIVE_TERMS, LAB_MODE_SPORTS, LAB_PROJECTION_SCHEMA_VERSION, LAB_QUERY_SCHEMA_VERSION, LAB_ROUTE, labAssetPath } from "./contract.mjs";
import { GAME } from "./fields.mjs";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const OUT = path.join(APP, "out");
const LAB = path.join(APP, "..", "data/lab-projection/v1");
const readLab = (rel) => { const b = fs.readFileSync(path.join(LAB, rel)); return (rel.endsWith(".gz") ? zlib.gunzipSync(b) : b).toString("utf8"); };
const htmlOf = (p) => fs.readFileSync(path.join(OUT, p.replace(/^\//, ""), "index.html"), "utf8");
const exists = (p) => { const t = p.replace(/^\//, ""); return fs.existsSync(path.join(OUT, t, "index.html")) || fs.existsSync(path.join(OUT, t)); };
const mainOf = (html) => /<main[\s\S]*?<\/main>/.exec(html)?.[0] ?? "";
const textOf = (f) => f.replace(/<!-- -->/g, "").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");
const outAsset = (p) => path.join(OUT, p.replace(/^\//, ""));

/**
 * THE LAB'S OWN VISIBLE TEXT — the shared slate status bar ("Today · Sep 17") and the footer's source-attribution
 * chips ("ESPN public API") live on every page, so a scan of the whole document, or even of <main>, judges the
 * chrome rather than this page (the vacuous/noisy guard lesson: scan what you mean, and prove the scope is real).
 * The Lab's region starts at its eyebrow. If that marker ever moves, this throws instead of passing on "".
 */
const MARKER = "Research · Lab";
function labText(html) {
  const text = textOf(mainOf(html));
  const i = text.indexOf(MARKER);
  assert.ok(i >= 0, `the Lab region marker "${MARKER}" is not in <main> — this guard would otherwise scan nothing`);
  const scoped = text.slice(i);
  assert.ok(scoped.length > 400, `the Lab region is only ${scoped.length} characters`);
  assert.ok(!scoped.includes("Pregame slate"), "the scope still contains the shared status bar");
  return scoped;
}

test("LB1 exactly one Lab page is exported — no page per query, season, filter, mode or sport", () => {
  assert.ok(fs.existsSync(OUT), "run after `npm run build` (post-build phase)");
  assert.ok(exists(LAB_ROUTE), `${LAB_ROUTE} is not exported`);
  const found = [];
  const visit = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) visit(path.join(d, e.name)); else if (e.name === "index.html") found.push(`/${path.relative(OUT, d)}/`); } };
  visit(path.join(OUT, "research"));
  assert.deepEqual(found.sort(), ["/research/", "/research/lab/"], "the Lab must add exactly one page under /research/");
  // A mode or a sport is query state, not a route.
  for (const p of ["/research/lab/games/", "/research/lab/players/", "/research/lab/seasons/", "/research/lab/nfl/", "/research/lab/games/nfl/"]) {
    assert.ok(!exists(p), `${p} must not exist — mode and sport are query state`);
  }
});

test("LB2 SEO: canonical is the shell, listed once, and no query URL is ever in the sitemap", () => {
  const html = htmlOf(LAB_ROUTE);
  assert.match(html, new RegExp(`<link rel="canonical" href="https://[^"]+${LAB_ROUTE}"`), "canonical is the shell path");
  assert.doesNotMatch(html, /<meta name="robots"[^>]*noindex/, "the tool shell is indexable");
  const sitemap = fs.readFileSync(path.join(OUT, "sitemap.xml"), "utf8");
  const locs = [...sitemap.matchAll(/<loc>https:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.filter((u) => u === LAB_ROUTE).length, 1, "the Lab shell is listed exactly once");
  assert.equal(locs.filter((u) => u.startsWith("/research/lab")).length, 1, "no second Lab URL is listed");
  assert.ok(!locs.some((u) => u.includes("?")), "no query-state URL in the sitemap");
  assert.ok(!locs.some((u) => u.includes("[")), "no literal route template in the sitemap");
  // Title and description describe a factual search, never a prediction.
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
  assert.match(title, /Research Lab/);
  const desc = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "";
  // The BRAND is "GameTimePicks": scanning for "pick" without removing it matches the product's own name and makes
  // the guard noise rather than a check (the v1.4 CB2 lesson).
  const meta = `${title} ${desc}`.replace(/GameTimePicks/g, "").toLowerCase();
  for (const w of ["predict", "prediction", "forecast", "pick", "edge", "odds", "best bet"]) {
    assert.ok(!new RegExp(`\\b${w}`).test(meta), `metadata says "${w}"`);
  }
  assert.ok(/GameTimePicks/.test(title), "positive control: the brand really is in the title that was stripped");
});

test("LB3 public assets are the committed projection, every declared partition and nothing else", () => {
  const expected = new Map();
  for (const [mode, sports] of Object.entries(LAB_MODE_SPORTS)) {
    for (const sport of sports) {
      expected.set(labAssetPath.index(mode, sport), readLab(`indexes/${mode}-${sport.toLowerCase()}.json`));
      if (mode === "players") {
        for (const s of JSON.parse(readLab(`indexes/players-${sport.toLowerCase()}.json`)).seasons) expected.set(labAssetPath.players(sport, s), readLab(`players/${sport}/${s}.json.gz`));
      } else {
        expected.set(mode === "games" ? labAssetPath.games(sport) : labAssetPath.seasons(sport), readLab(`${mode}/${sport}.json.gz`));
      }
    }
  }
  for (const [p, content] of expected) {
    assert.ok(fs.existsSync(outAsset(p)), `${p} is declared but not served`);
    assert.equal(fs.readFileSync(outAsset(p), "utf8"), content, `${p} differs from the committed projection`);
    assert.equal(JSON.parse(content).schemaVersion, LAB_PROJECTION_SCHEMA_VERSION, p);
  }
  // Nothing extra survives under the prefix: a partition dropped upstream must not linger publicly.
  const root = outAsset(LAB_ASSET_PREFIX);
  const served = [];
  const visit = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) visit(f); else served.push(`${LAB_ASSET_PREFIX}/${path.relative(root, f).split(path.sep).join("/")}`); } };
  visit(root);
  assert.deepEqual(served.sort(), [...expected.keys()].sort(), "served assets ≠ declared assets");
  // And the prune's narrow Lab exemption did not keep anything else: unrelated data is still swept.
  assert.ok(!fs.existsSync(path.join(OUT, "data/mlb/boards")), "the Lab prefix exemption must not disable pruning elsewhere");
});

test("LB4 the Lab page makes no Live request, no provider call, and owns no device storage", () => {
  /* Scan EVERY chunk the Lab page loads that a static baseline page (/about/) does not: client components are split
     into shared numbered chunks, so the page's own app/ chunk alone would miss an injected fetch (v1.4 probe 22). */
  const scriptsOf = (html) => new Set([...html.matchAll(/<script src="(\/_next\/static\/chunks\/[^"]+)"/g)].map((m) => decodeURIComponent(m[1])));
  const baseline = scriptsOf(htmlOf("/about/"));
  const own = [...scriptsOf(htmlOf(LAB_ROUTE))].filter((s) => !baseline.has(s));
  assert.ok(own.length >= 2, `Lab-specific chunks found: ${own.length}`);
  for (const src of own) {
    const js = fs.readFileSync(path.join(OUT, src.replace(/^\//, "")), "utf8");
    assert.doesNotMatch(js, /\/api\/live|espn\.com|statsapi\.mlb\.com|the-odds-api|api-football|api-sports/, `${src}: no Live request and no provider call`);
    assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB/, `${src}: the Lab owns no device storage`);
    assert.doesNotMatch(js, /gtp\.(follow|saved|observation|research)/, `${src}: no storage key`);
  }
  // Every fetch the Lab page can make is under its own static prefix.
  const labJs = own.map((s) => fs.readFileSync(path.join(OUT, s.replace(/^\//, "")), "utf8")).join("\n");
  assert.match(labJs, new RegExp(LAB_ASSET_PREFIX.replace(/\//g, "\\/")), "the Lab asset prefix is in the shipped code");
  for (const m of labJs.matchAll(/fetch\(([^)]{0,40})/g)) assert.doesNotMatch(m[1], /https?:|\/\/[a-z]/i, `absolute fetch target: ${m[0]}`);
});

test("LB5 no internal path, provider key or absolute filesystem path reaches the export", () => {
  const assets = [labAssetPath.index("games", "MLB"), labAssetPath.games("NFL"), labAssetPath.players("NFL", "NFL-2025"), labAssetPath.seasons("MLB"), labAssetPath.index("players", "EPL")];
  // The page's OWN region plus every asset it serves. The site footer credits its public sources by name on every
  // page; that attribution is deliberate and is not a Lab leak.
  const blobs = [labText(htmlOf(LAB_ROUTE)), ...assets.map((p) => fs.readFileSync(outAsset(p), "utf8"))];
  for (const s of blobs) {
    for (const n of ["data/internal", "lab-projection", "compare-projection", "research-projection", "/Users/", "/home/", "ODDS_API_KEY", "SUPABASE", "espn", "statsapi", "nflverse", "openfootball"]) {
      assert.ok(!s.toLowerCase().includes(n.toLowerCase()), `export contains "${n}"`);
    }
  }
});

test("LB6 the rendered page is factual: no prediction, no evaluative word, no rate, no reader-clock phrase", () => {
  const text = labText(htmlOf(LAB_ROUTE)).toLowerCase();
  for (const t of LAB_EVALUATIVE_TERMS) assert.ok(!text.includes(t), `the Lab page says "${t}"`);
  for (const t of ["hit rate", "over rate", "success rate", "win probability", "power ranking", "best bet", "all-time", "guaranteed"]) {
    assert.ok(!text.includes(t), `the Lab page says "${t}"`);
  }
  // No reader-clock phrase is baked into static HTML (a static artifact ages; v1.4 CB4).
  for (const t of ["today", "tomorrow", "tonight", "starts in", "yesterday"]) assert.ok(!text.includes(t), `static HTML says "${t}"`);
  // Database vocabulary stays in the docs.
  for (const t of ["schema", "sql", "jsonl", "query cost"]) assert.ok(!text.includes(t), `the Lab page says "${t}"`);
  // It does say what it is and what it covers.
  assert.match(text, /research lab/);
  assert.match(text, /recorded/);
});

test("LB7 every link the Lab can emit resolves in THIS export", () => {
  // Page links (the whole document: a dead link in shared chrome is still a dead link on this page).
  for (const m of mainOf(htmlOf(LAB_ROUTE)).matchAll(/href="(\/[^"#?]*)"/g)) {
    assert.ok(exists(m[1]), `${LAB_ROUTE} links to ${m[1]}, which this export does not serve`);
  }
  // Every route the ASSETS carry: entity research pages and the matchup pages a game row names.
  const checked = new Set();
  for (const [mode, sports] of Object.entries(LAB_MODE_SPORTS)) {
    for (const sport of sports) {
      const idx = JSON.parse(fs.readFileSync(outAsset(labAssetPath.index(mode, sport)), "utf8"));
      for (const e of [...idx.entities, ...(idx.teams ?? [])]) if (e[4]) checked.add(e[4]);
    }
  }
  for (const sport of LAB_MODE_SPORTS.games) {
    const rows = JSON.parse(fs.readFileSync(outAsset(labAssetPath.games(sport)), "utf8")).rows;
    for (const r of rows) if (r[GAME.PATH]) checked.add(r[GAME.PATH]);
  }
  assert.ok(checked.size >= 800, `routes referenced by Lab assets: ${checked.size}`);
  const dead = [...checked].filter((p) => !exists(p));
  assert.deepEqual(dead, [], "a Lab asset names a route this export does not serve");
});

test("LB8 the page ships no other owner's value, and the grammar it carries is the pinned one", () => {
  const html = htmlOf(LAB_ROUTE);
  for (const key of ['"forecast"', '"prediction"', '"probability"', '"gradedAt"', '"settled"', '"liveState"', '"odds"', '"followed"', '"saved"']) {
    assert.ok(!html.includes(key), `the Lab page carries ${key}`);
  }
  const scriptsOf = (h) => [...h.matchAll(/<script src="(\/_next\/static\/chunks\/[^"]+)"/g)].map((m) => decodeURIComponent(m[1]));
  const baseline = new Set(scriptsOf(htmlOf("/about/")));
  const js = scriptsOf(html).filter((s) => !baseline.has(s)).map((s) => fs.readFileSync(path.join(OUT, s.replace(/^\//, "")), "utf8")).join("\n");
  // The shipped budget is the pinned budget: a build that dropped a cap would ship different numbers.
  assert.ok(js.includes(String(LAB_BUDGET.maxRows)), "the row cap is not in the shipped code");
  assert.ok(js.includes(String(LAB_BUDGET.maxFilters)), "the filter cap is not in the shipped code");
  assert.equal(LAB_QUERY_SCHEMA_VERSION, 1);
});
