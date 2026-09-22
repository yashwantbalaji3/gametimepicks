/**
 * FOLLOWING — integration, UX, /following and non-interference (v1.1.2 · §29).
 *
 * Source scans here strip comments first: several of these files explain themselves by naming the
 * very things they must not do, and a guard that reads prose would forbid its own documentation.
 * Where a guard is negative, a positive control proves it can fire.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { FOLLOW_STORAGE_KEY, follow, emptyDocument, isFollowing, normalizeRef } from "./follow-schema.mjs";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const importsOf = (rel) => [...read(rel).matchAll(/^import[^;]*from\s+"([^"]+)";/gm)].map((m) => m[1]);

const NOW = "2026-09-16T17:00:00.000Z";

/* ──────────────────────────── real registry ──────────────────────────── */

/* 2026-09-22: this guard went red on main when the two rolling forecast windows held one finished game
   (ATL, GB) and nothing — the registry had named clubs from the WINDOW, not from the season's published
   files. The live Tuesday state (latest.json 1 event, frozen-latest.json 0 events, dated files 32 clubs)
   is exactly the regression fixture; the registry must resolve all 32 from the dated files alone. */
test("R1 · the registry resolves every club from published artifacts (anti-vacuity)", async () => {
  const { registryCounts, legacyNameMap, mlbTeamRefByName, nflTeamRefByAbbr } = await import("./entity-registry.ts");
  const { mlbTeams, nflTeams } = registryCounts();
  assert.equal(mlbTeams, 30, "all 30 MLB clubs");
  assert.equal(nflTeams, 32, "all 32 NFL clubs");
  // Every legacy migration target is a valid canonical ref.
  const map = legacyNameMap();
  assert.equal(Object.keys(map).length, 32);
  for (const [name, ref] of Object.entries(map)) {
    assert.ok(normalizeRef(ref), `${name} maps to a valid ref`);
    assert.match(ref.id, /^nfl-team-\d+$/);
  }
  // Fail closed on the unknown and on a DIFFERENT source's abbreviation.
  assert.equal(mlbTeamRefByName("Montreal Expos"), null);
  assert.equal(nflTeamRefByAbbr("WAS"), null, "nflverse's WAS is not ESPN's WSH — no silent conflation");
  assert.ok(nflTeamRefByAbbr("WSH"));
});

test("R2 · ⚠ same short name, different sports, different ids", async () => {
  const { mlbTeamRefByName, nflTeamRefByAbbr } = await import("./entity-registry.ts");
  const sf = mlbTeamRefByName("San Francisco Giants");
  const nyg = nflTeamRefByAbbr("NYG");
  assert.ok(sf && nyg);
  assert.notEqual(sf.id, nyg.id);
  const doc = follow(emptyDocument(), sf, NOW).doc;
  assert.equal(isFollowing(doc, nyg), false, "following the baseball Giants does not follow the football Giants");
});

/* ──────────────────────────── surfaces ──────────────────────────── */

test("S1 · MLB game pages follow BOTH clubs by StatsAPI id", () => {
  const page = code("src/components/game/game-detail-page.tsx");
  assert.match(page, /away=\{mlbTeamRefByName\(detail\.fullGameSim\?\.awayTeamName/);
  assert.match(page, /home=\{mlbTeamRefByName\(detail\.fullGameSim\?\.homeTeamName/);
  // One follow row per render path — no duplicate controls (a replace-bug produced one during build).
  assert.equal((page.match(/\{mlbFollowRow\}/g) || []).length, 2, "exactly one row per render path");
});

test("S2 · NFL game pages follow both clubs; NFL boards pass refs, never names", () => {
  assert.match(code("src/app/nfl/game/[eventId]/page.tsx"), /<TeamFollowRow away=\{nflTeamRefByAbbr\(f\.away\.abbr\)\}/);
  assert.match(code("src/components/nfl/weekly-boards.tsx"), /entity=\{teamRefs\[t\] \?\? null\}/);
});

test("S3 · ⚠ NFL player follows use nfl-athlete-<id> and have NO name fallback", () => {
  const board = code("src/components/nfl/player-board.tsx");
  assert.match(board, /nflPlayerRef\(playerId, name\)/);
  assert.match(board, /\{ref \? <FollowToggle/, "an id that is not in the lineage renders no star");
  assert.equal(/nflPlayerRef\(name/.test(board), false, "a name is never passed as the id");
});

test("S4 · ⚠ there is NO MLB player follow surface anywhere", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(tsx|ts|mjs)$/.test(e.name) || /\.test\.mjs$/.test(e.name)) continue;
      const body = fs.readFileSync(full, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (/sport:\s*"MLB",\s*entityType:\s*"player"/.test(body) || /mlb(Player|Person|Athlete)Ref\(/.test(body)) {
        offenders.push(path.relative(APP, full));
      }
    }
  };
  walk(path.join(APP, "src"));
  assert.deepEqual(offenders, [], "an MLB player follow path exists");
  // Positive control: the same scan DOES see the NFL player kind where it legitimately lives.
  assert.match(read("src/lib/follow/follow-schema.mjs"), /sport: "NFL", entityType: "player"/);
});

test("S5 · /live marks followed clubs but never reorders or refetches", () => {
  const hub = code("src/components/live/live-hub.tsx");
  assert.match(hub, /<FollowedMark entities=/);
  // The single batch hook is untouched: still exactly one, still no per-card fetch.
  assert.equal((hub.match(/useLiveSlate\(/g) || []).length, 1);
  assert.equal(/\bfetch\s*\(/.test(hub), false);
  assert.equal(/sort\(|useFollowing\(/.test(hub), false, "the hub does not read preferences to reorder itself");
});

/* ──────────────────────────── control UX ──────────────────────────── */

test("U1 · the control states its action and its entity in words, not only colour", () => {
  const t = code("src/components/follow/follow-toggle.tsx");
  assert.match(t, /aria-label=\{on \? `Unfollow \$\{name\}` : `Follow \$\{name\}`\}/);
  assert.match(t, /"Following" : "Follow"/, "visible words on the labelled variant");
  assert.match(t, /aria-pressed=\{on\}/);
});

test("U2 · 44px touch targets on both variants, and the dense variant does not grow rows", () => {
  const t = code("src/components/follow/follow-toggle.tsx");
  assert.match(t, /minHeight: 44/);
  assert.match(t, /minWidth: labeled \? 104 : 44/);
  assert.match(t, /margin: labeled \? undefined : "-10px -6px"/, "the compact hit area extends past a dense row");
});

test("U3 · toggling does not reflow: Follow and Following share one fixed-width slot", () => {
  assert.match(code("src/components/follow/follow-toggle.tsx"), /minWidth: "8\.5ch"/);
});

test("U4 · before load the control is neutral, and a blocked store disables it honestly", () => {
  const t = code("src/components/follow/follow-toggle.tsx");
  assert.match(t, /const disabled = !ready \|\| !writable/);
  assert.match(t, /Following is unavailable in this browser/);
  // `\u00a0` in a regex matches the NBSP CHARACTER. The source holds the literal character, not the
  // six-character escape — the first version of this probe looked for the escape text and failed on
  // correct code.
  assert.match(t, /!ready \? "\u00a0"/, "no Follow/Following word is shown before the store is read");
});

/* ──────────────────────────── /following ──────────────────────────── */

test("F1 · /following says 'saved on this device' and promises no sync or account", () => {
  const all = read("src/app/following/page.tsx") + read("src/components/follow/following-manager.tsx");
  assert.match(all, /saved on this device/i);
  for (const banned of [/your account/i, /\bsync(ed|s)? (across|to your)/i, /we'll notify/i, /never miss/i, /recommended for you/i, /fans also follow/i]) {
    assert.equal(banned.test(code("src/components/follow/following-manager.tsx")), false, `forbidden claim ${banned}`);
  }
  assert.match(read("src/app/following/page.tsx"), /does not sync to other devices/);
});

test("F2 · categories are exactly the supported ones — no MLB players section", () => {
  const m = code("src/components/follow/following-manager.tsx");
  assert.match(m, /title: "MLB teams"/);
  assert.match(m, /title: "NFL teams"/);
  assert.match(m, /title: "NFL players"/);
  assert.equal(/MLB players|EPL|UFC/.test(m), false, "unsupported categories are absent");
});

test("F3 · clear all takes two deliberate steps", () => {
  const m = code("src/components/follow/following-manager.tsx");
  assert.match(m, /onClick=\{\(\) => setConfirming\(true\)\}/, "the first click only asks");
  assert.match(m, /onClick=\{\(\) => \{ f\.clear\(\); setConfirming\(false\); \}\}/, "only the confirm clears");
  assert.match(m, /Cancel/);
});

test("F4 · the empty state points at existing routes and promises nothing that does not exist", () => {
  const m = code("src/components/follow/following-manager.tsx");
  assert.match(m, /Follow teams and supported players to personalize GameTimePicks on this device/);
  for (const href of ["/live", "/mlb", "/nfl"]) assert.ok(m.includes(`"${href}"`), `empty state links ${href}`);
  assert.equal(/My GameTime/.test(m), false, "does not advertise a product that is not built");
});

test("F5 · unavailable storage and a newer schema each get their own honest state", () => {
  const m = code("src/components/follow/following-manager.tsx");
  assert.match(m, /f\.status === "UNAVAILABLE"/);
  assert.match(m, /f\.status === "UNSUPPORTED_VERSION"/);
  assert.match(m, /leaving them untouched/);
});

/* ──────────────────────────── non-interference ──────────────────────────── */

const FOLLOW_UI = [
  "src/lib/follow/follow-schema.mjs",
  "src/lib/follow/follow-browser.mjs",
  "src/lib/follow/follow-store.ts",
  "src/components/follow/follow-toggle.tsx",
  "src/components/follow/following-manager.tsx",
  "src/components/follow/team-follow-row.tsx",
  "src/components/today/followed-mark.tsx",
];

test("N1 · ⚠ following causes no Live request — no follow module can reach the gateway", () => {
  for (const rel of FOLLOW_UI) {
    const body = code(rel);
    assert.equal(/liveUrl|\/api\/live|useLiveSlate|useLiveEvent/.test(body), false, `${rel} reaches Live`);
    assert.equal(/\bfetch\s*\(/.test(body), false, `${rel} makes a network request`);
  }
  // Positive control: the scan does detect a Live reference where one legitimately exists.
  assert.match(code("src/components/live/use-live-slate.ts"), /liveUrl/);
});

test("N2 · ⚠ Follow and Saved are separate owners — neither store imports the other", () => {
  for (const rel of FOLLOW_UI) {
    assert.equal(importsOf(rel).some((i) => i.includes("saved")), false, `${rel} imports the Saved store`);
  }
  for (const rel of ["src/lib/saved/saved-store.ts", "src/lib/saved/saved-schema.mjs"]) {
    assert.equal(importsOf(rel).some((i) => i.includes("follow")), false, `${rel} imports the Follow store`);
  }
  const { SAVED_STORAGE_KEY } = { SAVED_STORAGE_KEY: "gtp.saved.v1" };
  assert.notEqual(FOLLOW_STORAGE_KEY, SAVED_STORAGE_KEY, "different keys — Saved is not hijacked");
  assert.match(read("src/lib/saved/saved-schema.mjs"), /"gtp\.saved\.v1"/, "the Saved key is unchanged");
});

test("N3 · ⚠ following cannot write a forecast, a settlement, or any file", () => {
  for (const rel of FOLLOW_UI) {
    const body = code(rel);
    assert.equal(/writeFile|appendFile|mkdirSync/.test(body), false, `${rel} writes files`);
    for (const banned of ["settle", "grade", "forecast-join", "full-game", "ledger", "product-day"]) {
      assert.equal(importsOf(rel).some((i) => i.includes(banned)), false, `${rel} imports ${banned}`);
    }
  }
  // The only thing a follow module ever persists is under its own key.
  assert.equal((code("src/lib/follow/follow-browser.mjs").match(/setItem\(/g) || []).length, 2,
    "exactly two writes, both to FOLLOW_STORAGE_KEY (migration + operation)");
  assert.match(code("src/lib/follow/follow-browser.mjs"), /setItem\(FOLLOW_STORAGE_KEY/);
  assert.equal(/setItem\(FOLLOW_LEGACY_KEY/.test(code("src/lib/follow/follow-browser.mjs")), false, "the P251 key is never written");
});

test("N4 · static HTML is identical for every reader — nothing reads storage during render", () => {
  const store = code("src/lib/follow/follow-store.ts");
  // storage() is only called inside useEffect/useCallback bodies, never at module or render top level.
  const topLevel = store.split("\n").filter((l) => /^\S/.test(l) && /localStorage|readFollowing\(/.test(l));
  assert.deepEqual(topLevel, [], "no top-level storage read");
  assert.match(store, /useState<FollowStatus>\("LOADING"\)/, "every reader starts from the same LOADING state");
});

test("C1 · ⚠ the brief no longer promises personalized ordering that does not exist", () => {
  /*
   * P311 copy said followed teams' games "lead the lists below when they play". Nothing reorders by
   * follows — the slate MARKS them and offers an opt-in filter. The sentence promised a capability the
   * product lacks (§23), so it now says what actually happens. Ordering belongs to My GameTime.
   */
  const brief = read("src/components/brief/your-brief.tsx");
  assert.equal(/lead the lists/.test(code("src/components/brief/your-brief.tsx")), false, "the false ordering claim is gone");
  assert.match(brief, /marked ★ on today&rsquo;s slate/);
  // And the claim it now makes is TRUE: the slate really does render the mark.
  assert.match(code("src/components/today/full-slate.tsx"), /<FollowedMark entities=/);
});
