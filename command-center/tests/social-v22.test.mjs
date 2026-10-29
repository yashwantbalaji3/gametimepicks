/**
 * V2.2 standards: the one footer per sport, the shared player-name system, editorial captions with featured players,
 * X-weighted length, and fingerprints that follow caption changes. NBA checks run over the full Oct 28 slate (12 games)
 * at its data commit; skipped if this clone lacks it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { REPO_ROOT } from "../lib/util.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import { nbaPlayers, nbaPregame, touchdowns, topBoard, featuredFor } from "../recap/social-v2.mjs";
import { socialHtml, renderSocial, DISCLOSURES, disclosureFor, SOCIAL_TEMPLATE } from "../render/social-v2.mjs";
import { parseName, nameForms, formsForGroup } from "../recap/player-names.mjs";
import { xLength, publishBundleOf, sealPackage } from "../contracts/post-queue.mjs";
import { nbaPlayersPackage } from "../contracts/social-packages.mjs";
import { tempDir } from "./helpers.mjs";
import { QUEUE_PINNED, hasPinned } from "./queue-fixtures.mjs";

const SLATE = "40a79bf98b6c"; // origin/main 2026-10-28 12:06 PM ET (NBA lane Oct 28)
const hasSlate = (() => { try { execFileSync("git", ["cat-file", "-e", `${SLATE}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" }); return true; } catch { return false; } })();
const skipSlate = hasSlate ? false : "Oct 28 data commit not in this clone";
const visible = (html) => html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>|<svg[\s\S]*?<\/svg>|<[^>]+>/g, " ");

test("the one footer per sport: exact text, and nothing else", () => {
  assert.deepEqual(DISCLOSURES, {
    NFL: "Model projections · Not betting advice · Not affiliated with the NFL or its clubs",
    NBA: "Model projections · Not betting advice · Not affiliated with the NBA or its teams",
    MLB: "Model projections · Not betting advice · Not affiliated with MLB or its clubs",
    UFC: "Model projections · Not betting advice · Not affiliated with UFC",
    EPL: "Model projections · Not betting advice · Not affiliated with the Premier League or its clubs",
  });
  assert.equal(disclosureFor("UFC"), DISCLOSURES.UFC);
  assert.throws(() => disclosureFor("NHL"), /no disclosure configured/, "an unconfigured sport gets no graphic");
  assert.equal(SOCIAL_TEMPLATE, "gtp-social@2.3.3", "every visual change is a new template version, so an earlier design approval (V2.1, 2.2, 2.2.1) does not carry over");
});

test("NBA (all 12 Oct 28 games): one footer, no removed provenance text, one name size per table, values unchanged", { skip: skipSlate }, async () => {
  const src = gitDataSource(REPO_ROOT, SLATE);
  const lane = JSON.parse(src.read("app/public/data/nba/experimental-public/2026-10-28.json"));
  assert.equal(lane.games.length, 12);
  const dir = tempDir();
  const sizes = new Set();
  for (const g of lane.games) {
    const m = nbaPlayers({ src, eventId: g.providerEventId, date: "2026-10-28" });
    assert.ok(m.ok, m.reason);
    const text = visible(socialHtml(m));
    assert.equal(text.split(DISCLOSURES.NBA).length - 1, 1);
    assert.doesNotMatch(text, /Projected medians|as published|not ranked|frozen|ledger|sha256|commit/i);
    // identities and numbers exactly as published, in the published order
    const pub = (side) => g.players[side].filter((p) => p.medians && !["OUT", "DOUBTFUL", "INACTIVE"].includes(String(p.injuryStatus).toUpperCase())).slice(0, 6);
    assert.deepEqual(m.awayPlayers.map((p) => [p.name, p.pts]), pub("away").map((p) => [p.name, p.medians.pts.toFixed(1)]));
    assert.deepEqual(m.homePlayers.map((p) => [p.name, p.pts]), pub("home").map((p) => [p.name, p.medians.pts.toFixed(1)]));
    const r = await renderSocial(m, { outFile: path.join(dir, `${g.providerEventId}.png`) });
    assert.equal(r.width, 1080); assert.equal(r.height, 1350);
    const names = r.fit.filter((f) => f.group === "table");
    assert.equal(names.length, 12, "no player silently dropped");
    assert.ok(names.every((f) => f.fits && f.right <= f.rowRight), "no name overflows into the stats");
    assert.equal(new Set(names.map((f) => `${f.size}|${f.weight}|${f.family}`)).size, 1, "one size, weight and family for every name");
    sizes.add(names[0].size);
    // every name in a column starts on the same x (one grid)
    const lefts = new Set(names.map((f) => f.left));
    assert.equal(lefts.size, 2, `two columns, two left edges: ${[...lefts]}`);
  }
  assert.deepEqual([...sizes], [32], "the same table size in every game");
});

test("NFL Top 3 and Top 5: one name size per format, nothing clipped", { skip: hasPinned ? false : "pinned commit missing" }, async () => {
  const src = gitDataSource(REPO_ROOT, QUEUE_PINNED);
  const dir = tempDir();
  const td = await renderSocial(touchdowns({ src, eventId: "401873023", mode: "pregame", now: "2026-10-28T13:30:00Z" }), { outFile: path.join(dir, "td.png") });
  const last = td.fit.filter((f) => f.group === "td-last");
  assert.equal(last.length, 3);
  assert.equal(new Set(last.map((f) => f.size)).size, 1);
  for (const fam of ["anytime_td", "player_reception_yds", "player_receptions"]) {
    const b = await renderSocial(topBoard({ src, date: "2026-10-25", family: fam }), { outFile: path.join(dir, `${fam}.png`) });
    const rows = b.fit.filter((f) => f.group === "board");
    assert.equal(rows.length, 5);
    assert.ok(rows.every((f) => f.fits));
    assert.equal(new Set(rows.map((f) => f.size)).size, 1, `${fam}: one name size`);
    assert.equal(new Set(rows.map((f) => f.left)).size, 1, `${fam}: one left edge`);
    assert.equal(visible(socialHtml(topBoard({ src, date: "2026-10-25", family: fam }))).split(DISCLOSURES.NFL).length - 1, 1);
  }
});

test("name formatting: suffixes, hyphens, particles, initials and duplicate short forms", () => {
  assert.deepEqual(nameForms("Nickeil Alexander-Walker"), ["Nickeil Alexander-Walker", "N. Alexander-Walker"]);
  assert.deepEqual(nameForms("Kelly Oubre Jr."), ["Kelly Oubre Jr.", "K. Oubre Jr."]);
  assert.deepEqual(nameForms("Karl-Anthony Towns"), ["Karl-Anthony Towns", "K. Towns"]);
  assert.deepEqual(nameForms("Amon-Ra St. Brown"), ["Amon-Ra St. Brown", "A. St. Brown"]);
  assert.deepEqual(nameForms("CJ McCollum"), ["CJ McCollum"], "a two-letter first name is kept, not re-initialled");
  assert.equal(parseName("Trey Murphy III").suffix, "III");
  assert.deepEqual(formsForGroup(["Jalen Williams", "Jaylin Williams"]), [["Jalen Williams"], ["Jaylin Williams"]], "two players never share a short form");
});

test("featured players (V2.3 policy): editorial list first; an injury designation holds for confirmation; else the leading projected scorer with real minutes", () => {
  const P = (id, name, mins, pts, inj = null) => ({ id, name, pts, reb: "5.0", ast: "3.0", expectedMinutes: mins, injuryStatus: inj });
  const mia = [P("1", "Davion Mitchell", 27.3, "10.8"), P("4066261", "Bam Adebayo", 27.2, "14.3")];
  assert.equal(featuredFor("nba", "MIA", mia).player.name, "Bam Adebayo");
  assert.match(featuredFor("nba", "MIA", mia).basis, /editorial list/);
  assert.equal(featuredFor("nba", "MIA", mia).verify, undefined);
  // a listed player with an injury designation stays featured, and the post is held for the founder's confirmation
  const dtd = featuredFor("nba", "MIA", [P("1", "Davion Mitchell", 27.3, "10.8"), P("4066261", "Bam Adebayo", 27.2, "14.3", "Day-To-Day")]);
  assert.equal(dtd.player.name, "Bam Adebayo");
  assert.match(dtd.verify, /Bam Adebayo is listed Day-To-Day: confirm he is playing/);
  // fallback: the highest projected points among 20+ minute players with no designation — not the most minutes
  const bos = [P("9", "Minutes Man", 34, "9.0"), P("8", "Hurt Scorer", 30, "25.0", "Day-To-Day"), P("7", "Bench Scorer", 12, "18.0"), P("6", "Lead Scorer", 29, "21.4")];
  const f = featuredFor("nba", "BOS", bos);
  assert.equal(f.player.name, "Lead Scorer");
  assert.match(f.basis, /highest published projected points, 20\+ projected minutes, no injury designation/);
  assert.equal(featuredFor("nba", "BOS", [P("8", "C D", 30, "20.0", "Out")]).player, null);
});

test("captions: real line breaks, X-weighted length, featured players, and the fingerprint follows the caption", { skip: skipSlate }, () => {
  assert.equal(xLength("🏀 Final"), 8, "an emoji counts 2");
  assert.equal(xLength("a\nb"), 3);
  const src = gitDataSource(REPO_ROOT, SLATE);
  const lane = JSON.parse(src.read("app/public/data/nba/experimental-public/2026-10-28.json"));
  const mia = lane.games.find((g) => g.away.abbr === "MIA");
  const m = nbaPlayers({ src, eventId: mia.providerEventId, date: "2026-10-28" });
  const pkg = sealPackage(nbaPlayersPackage({ date: "2026-10-28", m, extra: { template: SOCIAL_TEMPLATE, assetManifest: "x", dataCommit: SLATE }, laneDate: "2026-10-28" }));
  const a = pkg.captions.find((c) => c.tone === "key players");
  assert.equal(a.text, "🏀 Miami Heat vs Atlanta Hawks tonight\n\nHere's how our model projects a few key players:\n\n🔥 Bam Adebayo: 14.3 PTS | 8.8 REB | 3.5 AST\n🔥 Jalen Johnson: 14.2 PTS | 6.5 REB | 3.7 AST\n\nFull player projections below 👇");
  assert.ok(pkg.captions.every((c) => c.check.ok && c.chars <= 280));
  assert.deepEqual(pkg.featured.map((f) => f.name), ["Bam Adebayo", "Jalen Johnson"]);
  const edited = publishBundleOf(pkg, { ...a, text: a.text.replace("tonight", "today") });
  assert.notEqual(edited.captionSha256, a.publishBundle.captionSha256, "a revised caption is a new fingerprint");
  const p = nbaPregame({ src, eventId: mia.providerEventId, date: "2026-10-28" });
  assert.doesNotMatch(visible(socialHtml(p)), /\d%/, "no NBA probability");
});

test("review fixes: suffix/particle surnames in postgame captions, tied Top 5, branded slots, fallback captions", { skip: hasPinned ? false : "pinned commit missing" }, async () => {
  const { postgame, topBoard: tb } = await import("../recap/social-v2.mjs");
  const { nflPostgamePackage, nflTop5Package } = await import("../contracts/social-packages.mjs");
  const { nflSlot, captionsFor } = await import("../contracts/captions.mjs");
  const { publicLabelOf } = await import("../recap/public-registry.mjs");
  const src = gitDataSource(REPO_ROOT, QUEUE_PINNED);
  const extra = { template: SOCIAL_TEMPLATE, assetManifest: "x", dataCommit: QUEUE_PINNED };
  const kc = sealPackage(nflPostgamePackage({ date: "x", m: postgame({ src, eventId: "401873022", label: publicLabelOf("NFL", src) }), extra }));
  assert.ok(kc.captions.every((c) => /Walker III ❌/.test(c.text) && !/\(III/.test(c.text)), kc.captions[0].text);
  const rec = sealPackage(nflTop5Package({ date: "x", m: tb({ src, date: "2026-10-25", family: "player_receptions" }), extra }));
  assert.ok(rec.captions.every((c) => !/\bleads\b/.test(c.text)), "a tie-broken #1 is not called the leader");
  assert.equal(nflSlot("2026-10-30T00:15:00Z").title, "Thursday Night Football");
  assert.equal(nflSlot("2026-11-27T01:20:00Z").title, "Thursday night", "Thanksgiving night is not TNF");
  assert.equal(nflSlot("2026-09-11T00:20:00Z", 1).title, "Thursday night", "the Week 1 kickoff game is not TNF");
  assert.equal(nflSlot("2026-11-03T01:15:00Z").title, "Monday Night Football");
  const team = (abbr, name) => ({ abbr, name, nickname: name.split(" ").at(-1), city: name.split(" ").slice(0, -1).join(" ") });
  const none = captionsFor.nbaPlayers({ eventId: "1", tipUtc: "2026-10-31T19:00:00Z", away: team("POR", "Portland Trail Blazers"), home: team("UTA", "Utah Jazz"), featured: [{ player: null }, { player: null }] });
  assert.doesNotMatch(none[0].text, /tonight|:\n\nFull/, none[0].text);
  assert.match(none[0].text, /on Saturday/);
});

test("review fix: long compound surnames in Top 3 TD columns render at one shared size", async () => {
  const dir = tempDir();
  const col = (rank, name, team, p) => {
    const n = parseName(name);
    return { rank, name, first: n.first, last: `${n.surname}${n.suffix ? ` ${n.suffix}` : ""}`, team, color: "#203731", ink: "#FFFFFF", accent: "#FFB612", probability: p, probabilityDisplay: `${(p * 100).toFixed(1)}%`, participation: "AVAILABLE_ROLE_UNCERTAIN", outcome: null, id: name };
  };
  const t = { abbr: "GB", name: "Green Bay Packers", city: "Green Bay", nickname: "Packers", color: "#203731", ink: "#FFFFFF", accent: "#FFB612" };
  const m = { format: "touchdowns", league: "NFL", eventId: "x", mode: "pregame", showResults: false, away: t, home: t, kickoffLine: "Sun, Nov 1 · 1:00 PM ET", week: 9,
    candidates: [col(1, "Marquez Valdes-Scantling Jr.", "GB", 0.52), col(2, "Nick Westbrook-Ikhine", "GB", 0.41), col(3, "JuJu Smith-Schuster", "GB", 0.33)] };
  const r = await renderSocial(m, { outFile: path.join(dir, "long.png") });
  const last = r.fit.filter((f) => f.group === "td-last");
  assert.equal(last.length, 3);
  assert.ok(last.every((f) => f.fits), JSON.stringify(last));
  assert.equal(new Set(last.map((f) => f.size)).size, 1);
});

test("NBA stat lines: PTS, REB and AST share one neutral colour (no green/red signal without verified lines)", { skip: skipSlate }, async () => {
  const { loadChromium } = await import("../render/render-png.mjs");
  const src = gitDataSource(REPO_ROOT, SLATE);
  const lane = JSON.parse(src.read("app/public/data/nba/experimental-public/2026-10-28.json"));
  const m = nbaPlayers({ src, eventId: lane.games[0].providerEventId, date: "2026-10-28" });
  const b = await loadChromium().launch();
  try {
    const pg = await b.newPage({ viewport: { width: 1080, height: 1350 } });
    await pg.route("**/*", (r) => r.abort());
    await pg.setContent(socialHtml(m), { waitUntil: "load" });
    const colours = await pg.evaluate(() => [...document.querySelectorAll(".lrow:not(.hd) b")].map((e) => getComputedStyle(e).color));
    assert.ok(colours.length >= 3 * (m.awayPlayers.length + m.homePlayers.length));
    assert.deepEqual([...new Set(colours)], ["rgb(247, 247, 242)"], "every stat value is the template's ink white");
  } finally { await b.close(); }
});
