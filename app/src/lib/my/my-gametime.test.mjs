/**
 * MY GAMETIME — read model, request invariants, route, safety (v1.1.3 · §33.2, 33.5–33.10).
 *
 * Source scans strip comments first (these files explain themselves by naming what they must not do).
 * Negative guards carry a positive control so a scan that finds nothing cannot pass vacuously.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const code = (rel) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const importsOf = (rel) => [...read(rel).matchAll(/^import[^;]*from\s+"([^"]+)";/gm)].map((m) => m[1]);
// The shared scanner: rendered string literals from CODE only. Extracting quoted text from raw source read
// this suite's own header comment ("NO \"SINCE YOUR LAST VISIT\"") as a violation on its first run.
import { renderedStrings } from "../live/testing/source-scan.mjs";

const PAGE = "src/components/my/my-gametime.tsx";
const MODEL = "src/lib/my/read-model.ts";

/* ─────────────────────────── read model on REAL artifacts ─────────────────────────── */

test("RM1 · the read model builds from real artifacts with every row joined to a canonical id", async () => {
  const { buildMyReadModel } = await import("./read-model.ts");
  const m = buildMyReadModel({ nowIso: "2026-09-16T18:00:00Z" });
  assert.ok(m.upcoming.length > 0, "upcoming rows exist — otherwise this proves nothing");
  assert.ok(m.results.length > 0, "result rows exist");
  for (const g of m.upcoming) {
    const re = g.sport === "MLB" ? /^mlb-team-\d+$/ : /^nfl-team-\d+$/;
    assert.ok(re.test(g.homeId ?? "") || re.test(g.awayId ?? ""), `${g.sport} ${g.gameId} carries a canonical id`);
  }
  for (const r of m.results) {
    assert.ok(Number.isInteger(r.homeScore) && Number.isInteger(r.awayScore), `${r.gameId} has integer scores`);
  }
  assert.equal(m.coverage.upcomingUnidentified, 0, "no schedule row lacked a canonical id");
  assert.equal(m.coverage.resultsUnidentified, 0, "no canonical result lacked a canonical id");
});

test("RM7 · ⚠ an MLB result is dated by its GAME, never by when it was graded", async () => {
  // Found in browser QA: a Sep 15 game graded after midnight ET rendered as "Final · Sep 16" beside the
  // same matchup's live Sep 16 game. The graded row carries firstPitchUtc; the card date must come from it.
  const { buildMyReadModel } = await import("./read-model.ts");
  const m = buildMyReadModel({ nowIso: "2026-09-16T18:00:00Z" });
  const graded = new Map();
  for (const line of read("public/data/mlb/results/game-predictions-graded.jsonl").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (!graded.has(String(row.gamePk))) graded.set(String(row.gamePk), row);
  }
  const et = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
  const mlb = m.results.filter((r) => r.sport === "MLB");
  assert.ok(mlb.length > 0, "MLB results exist — otherwise this proves nothing");
  let lateGraded = 0;
  for (const r of mlb) {
    const row = graded.get(r.gameId);
    assert.equal(et(r.resultAt), row.date, `${r.gameId} is dated on its game's ET date`);
    if (row.gradedAt && et(row.gradedAt) !== row.date) lateGraded++;
  }
  assert.ok(lateGraded > 0, "positive control: at least one game was graded on a later ET date, so gradedAt would have failed");
});

test("RM2 · ⚠ the read model is PUBLIC data only — no preference, no present-tense claim", async () => {
  const { buildMyReadModel } = await import("./read-model.ts");
  const m = buildMyReadModel({ nowIso: "2026-09-16T18:00:00Z" });
  const blob = JSON.stringify(m);
  for (const banned of ["gtp.follow", "gtp.saved", "followed", "isLive", "hasStarted", "isUpcoming"]) {
    assert.equal(blob.includes(banned), false, `the static read model must not carry "${banned}"`);
  }
  // No reader-specific source is read to build it.
  assert.equal(/localStorage|useFollowing|useSavedForecasts/.test(code(MODEL)), false);
});

test("RM3 · ⚠ MLB totals stay PAUSED — no combined total in the read model or the players file", async () => {
  const { buildMyReadModel, buildMyPlayerRows } = await import("./read-model.ts");
  const blob = JSON.stringify(buildMyReadModel({ nowIso: "2026-09-16T18:00:00Z" })) + JSON.stringify(buildMyPlayerRows());
  assert.equal(blob.includes("totalRuns"), false);
  assert.equal(/over\/under|\bo\/u\b/i.test(code(PAGE)), false, "the page renders no totals concept");
});

test("RM4 · ⚠ NFL results come from the FINAL-only settlement adapter, ids joined by EVENT id not abbreviation", () => {
  const src = code(MODEL);
  // The call sits inside a TypeScript cast — `(loadCurrentNflResults as …)({ nowIso` — so match the NAME and
  // the argument separately rather than one literal that a cast breaks.
  const call = src.split("\n").find((l) => l.includes("loadCurrentNflResults") && l.includes("({ nowIso"));
  assert.ok(call, "canonical adapter decides which NFL results exist (called with the build instant)");
  assert.match(src, /idsByEvent\.get\(String\(r\.providerEventId\)\)/, "numeric team ids attached by provider event id");
  assert.equal(/nflTeamRefByAbbr|RefByAbbr\(r\.(home|away)/.test(src), false, "never via the abbreviation");
});

test("RM5 · ⚠ MLB results come from the settlement owner's GRADED rows — never a live provider final", () => {
  const src = code(MODEL);
  assert.match(src, /game-predictions-graded\.jsonl/);
  assert.equal(/\/api\/live|useLiveSlate|envelope/.test(src), false, "Recent Results never reads the Live feed");
});

test("RM6 · ⚠ player rows carry PUBLISHED families only, read from each board", async () => {
  const { buildMyPlayerRows } = await import("./read-model.ts");
  const rows = buildMyPlayerRows();
  assert.ok(rows.length > 0, "player rows exist — otherwise this proves nothing");
  // Collect, per board, which families were NOT published, and prove none reached a row.
  const nonPublishedByBoard = new Map();
  const idx = JSON.parse(read("public/data/nfl/player-board/latest.json"));
  for (const b of idx.boards) {
    const board = JSON.parse(read(`public/data/nfl/player-board/${b.providerEventId}.json`));
    nonPublishedByBoard.set(board.matchup, new Set(Object.entries(board.families).filter(([, f]) => f.state !== "PUBLISHED").map(([k]) => k)));
  }
  let checked = 0;
  for (const r of rows) {
    const banned = nonPublishedByBoard.get(r.matchup) ?? new Set();
    for (const m of r.markets) {
      assert.equal(banned.has(m.key), false, `${r.name}: ${m.key} is not PUBLISHED on ${r.matchup}`);
      checked++;
    }
  }
  assert.ok(checked > 100, "many markets were checked");
  // Positive control: at least one board really does withhold a family (e.g. passing yards ESTIMATE).
  assert.ok([...nonPublishedByBoard.values()].some((s) => s.size > 0), "the gate had something to refuse");
});

/* ─────────────────────────── request invariants (§11, §33.2) ─────────────────────────── */

test("REQ1 · ⚠ zero MLB team follows ⇒ the Live module never mounts ⇒ zero Live requests", () => {
  const src = code(PAGE);
  assert.match(src, /\{followsAnyMlbTeam\(followed\) \? \(\s*<LiveNowModule/, "the only mount is gated on an MLB TEAM follow");
  // useLiveSlate is called inside the child only — never in the page body, where it would always run.
  const page = src.slice(src.indexOf("export default function MyGameTime"));
  assert.equal(/useLiveSlate\(/.test(page), false, "the page body must not call the Live hook unconditionally");
  assert.equal((src.match(/useLiveSlate\(/g) || []).length, 1, "exactly one Live hook instance in the whole page");
});

test("REQ2 · ⚠ 1 or 20 followed teams → the same ONE batch request (no per-follow fanout)", () => {
  const src = code(PAGE);
  // The hook is called once with the sport only — never inside a map over follows.
  assert.match(src, /useLiveSlate\("mlb"\)/);
  assert.equal(/followed\.map\([^)]*useLiveSlate|\.map\([^)]*liveUrl/.test(src), false, "no request per followed team");
  assert.equal(/liveUrl\(|\/api\/live/.test(src), false, "the page never builds a Live URL itself");
  // The batch hook itself requests the slate with sport only (asserted in hub.test.mjs too).
  assert.match(code("src/components/live/use-live-slate.ts"), /liveUrl\(\{\s*sport\s*\}\)/);
});

test("REQ3 · following or saving cannot trigger a Live request", () => {
  for (const rel of ["src/lib/follow/follow-store.ts", "src/lib/follow/follow-browser.mjs", "src/lib/saved/saved-store.ts"]) {
    assert.equal(/liveUrl|\/api\/live|useLiveSlate/.test(code(rel)), false, `${rel} reaches Live`);
  }
});

test("REQ4 · ⚠ NFL follows never create a Live request — public NFL Live stays impossible", () => {
  const src = code(PAGE);
  assert.equal(/useLiveSlate\("nfl"\)|sport:\s*"nfl"/.test(src), false);
  // The mount predicate counts MLB TEAMS only.
  assert.match(code("src/lib/my/selectors.mjs"), /followedIdSet\(followed, \{ sport: "MLB", entityType: "team" \}\)\.size > 0/);
});

test("REQ5 · the players file is fetched ONLY when an NFL player is followed", () => {
  const src = code(PAGE);
  assert.match(src, /\{followsPlayers \? <PlayersModule/, "the fetching module mounts only for a player follow");
  assert.match(src, /const PLAYERS_URL = "\/data\/my\/nfl-players\.json"/, "a LITERAL path (keeps the /data sweep from pruning it)");
  const page = src.slice(src.indexOf("export default function MyGameTime"));
  assert.equal(/fetch\(/.test(page), false, "the page body fetches nothing unconditionally");
});

/* ─────────────────────────── owners reused, not duplicated (§33.5) ─────────────────────────── */

test("OWN1 · ⚠ Saved and Following are REUSED — no second store, no merge, no auto-save/auto-follow", () => {
  const imports = importsOf(PAGE);
  assert.ok(imports.includes("@/lib/saved/saved-store"), "uses the Saved owner");
  assert.ok(imports.includes("@/lib/follow/follow-store"), "uses the Follow owner");
  const src = code(PAGE);
  assert.equal(/localStorage/.test(src), false, "My GameTime keeps no storage of its own");
  assert.equal(/\.save\(|\.unsave\(|\.toggle\(|\.clear\(/.test(src), false, "the page never saves, unsaves, follows or clears");
});

test("OWN2 · Saved preview keeps the Saved owner's order and links management to /saved", () => {
  const src = code(PAGE);
  assert.match(src, /items\.slice\(0, PREVIEW\)/, "a preview of the owner's own order — not re-sorted");
  assert.equal(/items\.sort|\.sort\([^)]*savedAt/.test(src), false, "no re-ranking of saved forecasts");
  assert.match(src, /href: "\/saved", label: "Manage saved/);
});

/* ─────────────────────────── first-run + hydration (§33.3, 33.8) ─────────────────────────── */

test("FR1 · nothing personal renders until BOTH stores have been read", () => {
  assert.match(code(PAGE), /if \(!follow\.ready \|\| !saved\.ready\)/);
  assert.match(code(PAGE), /Reading this device/);
});

test("FR2 · a dedicated first-run state, with the approved copy and CTA order", () => {
  const src = code(PAGE);
  assert.match(src, /state === "FIRST_RUN"/);
  assert.match(src, /Make GameTimePicks yours/);
  const followIdx = src.indexOf('href="/following"');
  const liveIdx = src.indexOf('href="/live"', src.indexOf("Make GameTimePicks yours"));
  assert.ok(followIdx > 0 && liveIdx > followIdx, "Choose what to follow comes before Browse Live");
});

test("FR3 · modules mount by what the reader actually has — no stack of empty modules", () => {
  const src = code(PAGE);
  assert.match(src, /\{followsTeams \? <UpNextModule/);
  assert.match(src, /\{saved\.items\.length \? <SavedModule/, "saved-only readers still get Saved");
  assert.match(src, /\{followsTeams \? <ResultsModule/);
});

test("FR4 · ⚠ a broken Follow store is isolated — Saved still renders", () => {
  const src = code(PAGE);
  assert.match(src, /followStoreBroken/);
  assert.match(src, /Saved forecasts below are unaffected/);
  // Saved's mount does not depend on the follow store. Checked on the MOUNT EXPRESSION itself: a regex
  // spanning "followStoreBroken … SavedModule" matched across unrelated JSX (which has no semicolons).
  const savedMount = /\{([^{}]*)\? <SavedModule/.exec(src);
  assert.ok(savedMount, "the Saved mount was found — otherwise this guard proves nothing");
  assert.equal(savedMount[1].trim(), "saved.items.length", "Saved mounts on its own store alone");
  assert.equal(/follow/i.test(savedMount[1]), false, "no follow-store condition gates Saved");
});

test("FR5 · live empty states are DISTINCT, not one 'No games'", () => {
  const src = code(PAGE);
  assert.match(src, /None of the MLB teams you follow is playing right now/);
  assert.match(src, /No MLB games are live right now/);
  assert.match(src, /Live data is unavailable right now/);
});

/* ─────────────────────────── route, nav, indexing (§33.9) ─────────────────────────── */

test("NAV1 · /my is a secondary destination and the five primaries are unchanged", async () => {
  const { destinationsFor, NAV_DESTINATIONS } = await import("../navigation.ts");
  assert.equal(destinationsFor("mobile").length, 5);
  assert.equal(destinationsFor("top").length, 5);
  const my = NAV_DESTINATIONS.filter((d) => d.href === "/my");
  assert.equal(my.length, 1, "exactly one My GameTime entry");
  assert.deepEqual([...my[0].surfaces].sort(), ["footer", "rail"]);
});

test("NAV2 · ⚠ the personal family is noindex AND absent from the sitemap — no contradiction", async () => {
  for (const rel of ["src/app/my/page.tsx", "src/app/following/page.tsx", "src/app/saved/page.tsx"]) {
    assert.match(read(rel), /robots: \{ index: false, follow: false \}/, `${rel} is noindex`);
  }
  const { ROUTE_TABLE } = await import("../audits/route-inventory.mjs");
  for (const r of ["/my", "/following", "/saved"]) {
    assert.equal(ROUTE_TABLE[r].indexable, false, `${r} is flagged non-indexable`);
  }
  assert.match(read("src/app/sitemap.ts"), /v\.indexable !== false/, "the sitemap honours the flag");
  // Positive control: an ordinary public route is still indexable.
  assert.notEqual(ROUTE_TABLE["/live"].indexable, false);
});

test("NAV3 · no follow state ever reaches a URL", () => {
  const src = code(PAGE);
  assert.equal(/searchParams|URLSearchParams|\?follow|\?ids=|encodeURIComponent\(.*followed/.test(src), false);
});

/* ─────────────────────────── safety (§33.10) ─────────────────────────── */

const MY_SOURCES = [PAGE, MODEL, "src/lib/my/selectors.mjs", "src/app/my/page.tsx", "src/app/data/my/nfl-players.json/route.ts"];

test("SAFE1 · ⚠ no forecast, settlement or file writes anywhere in My GameTime", () => {
  for (const rel of MY_SOURCES) {
    const src = code(rel);
    assert.equal(/writeFileSync|appendFileSync|mkdirSync|\.setItem\(/.test(src), false, `${rel} writes`);
    assert.equal(/\b(gradeGame|settleGame|gradeNflLeg\(|writeSettlement)\b/.test(src), false, `${rel} grades or settles`);
  }
});

test("SAFE2 · ⚠ no Since-Your-Last-Visit capability or vocabulary ships", () => {
  const SYLV = /since (your )?last visit|since you were away|new since|unread|lastVisit|lastSeen/i;
  for (const rel of MY_SOURCES) {
    const src = code(rel) + "\n" + renderedStrings(read(rel));
    assert.equal(SYLV.test(src), false, `${rel} carries SYLV`);
  }
  // Positive control: the scan DOES catch it in code or rendered copy.
  assert.equal(SYLV.test(renderedStrings('const x = "3 new since your last visit";')), true);
  assert.equal(SYLV.test("const lastSeen = 1;"), true);
});

test("SAFE3 · no recommendation, alert, account or sync claim", () => {
  const strings = (read(PAGE) + read("src/app/my/page.tsx")).match(/"[^"]*"|>[^<{}]+</g)?.join(" ") ?? "";
  for (const rx of [/recommended/i, /for you\b/i, /based on your activity/i, /AI-curated/i, /notif/i, /your account/i, /\bsync/i, /never miss/i]) {
    assert.equal(rx.test(strings), false, `forbidden copy ${rx}`);
  }
  assert.match(strings, /on this device/i, "persistence is described truthfully");
});

test("SAFE4 · no analytics provider is enabled and no preference array is tracked", () => {
  const src = code(PAGE);
  assert.equal(/track\(|sendBeacon/.test(src), false, "My GameTime sends no analytics events");
  assert.equal(process.env.NEXT_PUBLIC_ANALYTICS_ENABLED ?? "", "", "the build does not switch analytics on");
});

test("SAFE5 · ⚠ no provider host and no live probability language on the page", () => {
  const src = read(PAGE);
  assert.equal(/statsapi\.mlb\.com|site\.api\.espn\.com/.test(src), false);
  for (const rx of [/\bon pace\b/i, /\bon track\b/i, /live win probability/i, /live edge/i, /\block\b(?!ed)/i]) {
    assert.equal(rx.test((src.match(/"[^"]*"|>[^<{}]+</g) ?? []).join(" ")), false, `forbidden ${rx}`);
  }
});
