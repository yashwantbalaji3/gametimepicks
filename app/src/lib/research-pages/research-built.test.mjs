/**
 * TEAM + PLAYER RESEARCH — built-export guards (v1.3). Post-build phase: reads out/.
 *
 *  RX1  exactly the registry's pages are exported (no more, no fewer); unknown slugs have no page
 *  RX2  SEO: indexable ⇔ robots index; canonical = own path; sitemap lists indexable research pages only
 *  RX3  representative content per sport, including coverage copy and what must NOT appear
 *  RX4  every internal link on every research page resolves (page exists; #game- anchors exist on the target)
 *  RX5  discovery: game pages, the NFL player board, /following, /my data and UFC bouts link into research
 *  RX6  no internal leak, no Live request, no provider call in research page code
 *  RX7  forecast separation on the rendered page
 *
 * Run (after `npm run build`): npx tsx --test src/lib/research-pages/research-built.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const OUT = path.join(APP, "out");
const PROJ = path.join(APP, "..", "data/research-projection/v1");
const readProj = (rel) => { const b = fs.readFileSync(path.join(PROJ, rel)); return (rel.endsWith(".gz") ? zlib.gunzipSync(b) : b).toString("utf8"); };
const index = JSON.parse(readProj("index.json")).entries;
const partition = (kind, sport) => readProj(`${kind}/${sport}.jsonl.gz`).split("\n").filter(Boolean).map((l) => JSON.parse(l));
const htmlOf = (p) => fs.readFileSync(path.join(OUT, p, "index.html"), "utf8");
/** Visible text of <main>, entities decoded, tags and scripts dropped (the vacuous-guard lessons: scan <main>, decode). */
const mainText = (html) => {
  const m = /<main[\s\S]*?<\/main>/.exec(html)?.[0] ?? html;
  return m.replace(/<!-- -->/g, "").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");
};
const exists = (p) => fs.existsSync(path.join(OUT, p, "index.html")) || fs.existsSync(path.join(OUT, p));

test("RX1 the export holds exactly the research registry's pages", () => {
  assert.ok(fs.existsSync(OUT), "run after `npm run build` (post-build phase)");
  const walkPages = (root) => {
    const dir = path.join(OUT, root);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).flatMap((sport) => fs.readdirSync(path.join(dir, sport)).filter((slug) => fs.existsSync(path.join(dir, sport, slug, "index.html"))).map((slug) => `/${root}/${sport}/${slug}/`));
  };
  const built = [...walkPages("teams"), ...walkPages("players")].sort();
  assert.deepEqual(built, index.map((e) => e.path).sort());
  assert.ok(built.length > 1000, `research pages exported: ${built.length}`);
  assert.ok(!exists("players/nfl/not-a-real-player"), "no page for an unregistered slug");
});

test("RX2 SEO is coverage-aware: robots follow the registry, canonical is the page, sitemap lists indexable pages only", () => {
  const sitemap = fs.readFileSync(path.join(OUT, "sitemap.xml"), "utf8");
  assert.ok(!/\[[a-zA-Z]+\]/.test(sitemap), "no template path in the sitemap");
  const listed = new Set([...sitemap.matchAll(/<loc>https:\/\/[^/]+(\/(?:teams|players)\/[^<]+)<\/loc>/g)].map((m) => m[1]));
  const indexable = index.filter((e) => e.indexable);
  assert.equal(listed.size, indexable.length);
  for (const e of index) {
    assert.equal(listed.has(e.path), e.indexable, `${e.path} sitemap membership`);
  }
  // Sample robots + canonical across every (kind, sport, indexable) combination.
  const combos = new Map();
  for (const e of index) { const k = `${e.kind}|${e.sport}|${e.indexable}`; if (!combos.has(k)) combos.set(k, e); }
  assert.ok(combos.size >= 7, [...combos.keys()].join(" "));
  for (const e of combos.values()) {
    const html = htmlOf(e.path.slice(1));
    const robots = /<meta name="robots" content="([^"]+)"/.exec(html)?.[1];
    assert.equal(robots, e.indexable ? "index, follow" : "noindex, follow", e.path);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://gametimepicks\\.yashwantbalaji\\.com${e.path}"`), e.path);
    const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? "";
    assert.doesNotMatch(title, /career|all-time|2026 stats/i, e.path);
  }
});

test("RX3 representative pages: sport-aware content, coverage copy, nothing unsupported", () => {
  // NFL team: record from projection, Follow control, results words.
  const nflTeam = partition("teams", "NFL").find((t) => t.abbreviation === "KC");
  const kc = mainText(htmlOf(`teams/nfl/${nflTeam.slug}`));
  const season = nflTeam.seasons.find((s) => s.id === nflTeam.defaultSeason);
  assert.match(kc, new RegExp(`Record ${season.record.w}–${season.record.l}`));
  assert.match(htmlOf(`teams/nfl/${nflTeam.slug}`), /aria-label="(Follow|Unfollow) Kansas City Chiefs"|gtp-follow-toggle/);
  // MLB team: runs, a 2023–2025 season in the selector.
  const mlbTeam = partition("teams", "MLB")[0];
  const mlbHtml = htmlOf(`teams/mlb/${mlbTeam.slug}`);
  assert.match(mainText(mlbHtml), /Runs scored/);
  assert.match(mlbHtml, /<option value="MLB-2023">2023<\/option>/);
  assert.doesNotMatch(mainText(mlbHtml), /batting average|\bERA\b|home runs/i);
  // EPL team: no record, no follow, the coverage sentence.
  const eplTeam = partition("teams", "EPL")[0];
  const epl = htmlOf(`teams/epl/${eplTeam.slug}`);
  assert.doesNotMatch(mainText(epl), /\bRecord\b|\bW–L\b|Points scored|Goals for/);
  assert.match(mainText(epl), /Final team results are not yet available/);
  assert.doesNotMatch(epl, /gtp-follow-toggle/, "Follow is not extended to EPL");
  // NFL player: 2026 gap copy; windows with n.
  const allen = partition("players", "NFL").find((p) => p.name === "Keenan Allen" && p.id === "nfl-athlete-15818");
  const allenText = mainText(htmlOf(`players/nfl/${allen.slug}`));
  assert.match(allenText, /Current-season \(2026\) factual game logs are not available yet/);
  const w = allen.windows.receivingYards[1];
  assert.ok(allenText.includes(`${w.avg} (n=${w.n})`), "Last-5 average and its n come from the projection");
  assert.doesNotMatch(allenText, /career|all-time|trending|hot streak|due for/i);
  // MLB player: captured categories only, noindex, no Follow.
  const mlbP = partition("players", "MLB")[0];
  const mlbPHtml = htmlOf(`players/mlb/${mlbP.slug}`);
  assert.match(mainText(mlbPHtml), /not a complete MLB box-score history/);
  assert.doesNotMatch(mainText(mlbPHtml), /batting average|home runs|slugging|on-base/i, "no uncaptured baseball stat is labelled");
  assert.doesNotMatch(mainText(mlbPHtml), /\bAVG\b|\bOPS\b|\bERA\b|\bOBP\b|\bSLG\b/, "no uncaptured baseball abbreviation (case-sensitive: 'avg (n)' is the window header)");
  assert.doesNotMatch(mlbPHtml, /gtp-follow-toggle/, "Follow is not extended to MLB players");
  // EPL player: 2026-27 gap copy.
  const eplP = partition("players", "EPL")[0];
  assert.match(mainText(htmlOf(`players/epl/${eplP.slug}`)), /2026-27 match lines are not available yet/);
  // UFC fighter with a no-winner bout: never a loss, no method/round.
  const ufc = partition("players", "UFC").find((p) => p.record.n > 0);
  const ufcText = mainText(htmlOf(`players/ufc/${ufc.slug}`));
  assert.match(ufcText, /No winner \(draw or no contest\)/);
  assert.match(ufcText, new RegExp(`${ufc.record.w}–${ufc.record.l} · ${ufc.record.n} no winner`));
  assert.doesNotMatch(ufcText.replace(/Method and round are not yet available[^.]*\./, ""), /\bKO\b|Submission|Decision|Round \d/);
});

test("RX4 every internal link on every research page resolves (and #game- anchors exist)", () => {
  const anchorsCache = new Map();
  let links = 0;
  const bad = [];
  for (const e of index) {
    const html = htmlOf(e.path.slice(1));
    const main = /<main[\s\S]*?<\/main>/.exec(html)?.[0] ?? "";
    for (const m of main.matchAll(/href="(\/[^"#?]*)(#[^"]*)?"/g)) {
      links += 1;
      const target = m[1].replace(/^\//, "");
      if (!exists(target)) { bad.push(`${e.path} → ${m[1]}`); continue; }
      if (m[2]?.startsWith("#game-")) {
        if (!anchorsCache.has(target)) anchorsCache.set(target, htmlOf(target));
        if (!anchorsCache.get(target).includes(`id="${m[2].slice(1)}"`)) bad.push(`${e.path} → ${m[1]}${m[2]} (anchor missing)`);
      }
    }
    if (bad.length > 20) break;
  }
  assert.deepEqual(bad, []);
  assert.ok(links > 5000, `links checked: ${links}`);
});

test("RX5 research pages are discoverable from game pages, the player board, /following, /my and UFC bouts", () => {
  const nflGames = fs.readdirSync(path.join(OUT, "nfl/game")).filter((d) => fs.existsSync(path.join(OUT, "nfl/game", d, "index.html")));
  assert.ok(nflGames.some((g) => /href="\/players\/nfl\/[a-z0-9-]+\/"/.test(htmlOf(`nfl/game/${g}`))), "an NFL game page links a player's research page");
  assert.ok(nflGames.some((g) => /href="\/teams\/nfl\/[a-z0-9-]+\/"/.test(htmlOf(`nfl/game/${g}`))), "an NFL game page links a team's research page");
  const mlbDir = path.join(OUT, "games/mlb");
  if (fs.existsSync(mlbDir)) {
    const pages = fs.readdirSync(mlbDir).filter((d) => fs.existsSync(path.join(mlbDir, d, "index.html")));
    if (pages.length) assert.ok(pages.some((g) => /href="\/teams\/mlb\/[a-z0-9-]+\/"/.test(htmlOf(`games/mlb/${g}`))), "an MLB game page links a team research page");
  }
  const following = htmlOf("following");
  assert.match(following, /nfl-athlete/, "/following receives the compact research map");
  const players = JSON.parse(fs.readFileSync(path.join(OUT, "data/my/nfl-players.json"), "utf8")).rows;
  assert.ok(players.some((r) => typeof r.researchHref === "string" && r.researchHref.startsWith("/players/nfl/")), "/my player rows carry exact-id research links");
  for (const r of players) if (r.researchHref) assert.ok(exists(r.researchHref.slice(1)), r.researchHref);
  const bouts = fs.existsSync(path.join(OUT, "ufc/bout")) ? fs.readdirSync(path.join(OUT, "ufc/bout")) : [];
  if (bouts.length) assert.ok(bouts.some((b) => /href="\/players\/ufc\/[a-z0-9-]+\/"/.test(htmlOf(`ufc/bout/${b}`))), "a UFC bout links a fighter's research page");
  // No link nested inside a button anywhere on the research pages sampled.
  for (const p of [index.find((e) => e.sport === "NFL" && e.kind === "player").path, index.find((e) => e.kind === "team").path]) {
    assert.doesNotMatch(htmlOf(p.slice(1)), /<button[^>]*>(?:(?!<\/button>)[\s\S])*<a\s/, `${p}: a link inside a button`);
  }
});

test("RX6 no internal leak, no Live request and no provider call in research page code", () => {
  const needles = ["data/internal", "research-projection", "providerAliases", "internal/platform", "/Users/"];
  const sample = index.filter((_, i) => i % 25 === 0);
  for (const e of sample) {
    const html = htmlOf(e.path.slice(1));
    for (const n of needles) assert.ok(!html.includes(n), `${e.path} contains ${n}`);
  }
  const chunks = ["teams", "players"].flatMap((k) => {
    const d = path.join(OUT, "_next/static/chunks/app", k, "[sport]", "[slug]");
    return fs.existsSync(d) ? fs.readdirSync(d).map((f) => fs.readFileSync(path.join(d, f), "utf8")) : [];
  });
  assert.equal(chunks.length, 2, "both research page chunks were found");
  for (const js of chunks) {
    assert.doesNotMatch(js, /\/api\/live|espn\.com\/apis|statsapi\.mlb\.com|site\.api\.espn/, "research pages make no Live or provider request");
  }
});

test("RX7 forecast separation: the forecast section appears only for exact-id published forecasts and is labelled as model output", () => {
  const players = JSON.parse(fs.readFileSync(path.join(OUT, "data/my/nfl-players.json"), "utf8")).rows;
  const withForecast = new Set(players.filter((r) => r.markets.length).map((r) => r.playerId));
  let withSection = 0;
  let without = 0;
  for (const e of index.filter((x) => x.sport === "NFL" && x.kind === "player")) {
    const text = mainText(htmlOf(e.path.slice(1)));
    const has = text.includes("Current GameTime forecast");
    assert.equal(has, withForecast.has(e.id), `${e.path}: forecast section ⇔ a published forecast exists for this exact id`);
    if (has) { withSection += 1; assert.match(text, /model output, not history/i); } else without += 1;
  }
  assert.ok(withSection > 0 && without > 0, `non-vacuous: ${withSection} with, ${without} without`);
  // The factual projection never carries forecast fields.
  for (const s of ["NFL", "UFC"]) assert.doesNotMatch(readProj(`players/${s}.jsonl.gz`), /"(median|p10|p90|probability|winnerChance)":/);
});
