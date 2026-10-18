/**
 * Simulation Theater V2 · the development route gate and the NFL team colour map (founder D2, D3).
 *
 * Run: npx tsx --test src/lib/simulation-theater/dev-route-colors.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { DISABLED_PLACEHOLDER, contentParams, devRoutesEnabled, devStaticParams } from "./dev-routes.mjs";
import { FIXTURE_EVENT_IDS, MAX_FIXTURES, fixtureUsable, loadTheater, usableFixtures } from "./loader.mjs";
import {
  NEUTRAL_PALETTE, NFL_TEAM_COLORS, TEAM_COLORS_VALIDATED, collides, contrastRatio, deltaE76, nflTeamColor, theaterPalette,
} from "./nfl-team-colors.mjs";
import { THEATER_TURF_MIX, turfHexes } from "./field-geometry.mjs";
import { readShadowReceipts } from "../sports/nfl/sim-v2/public-receipt.mjs";
import { ROUTE_TABLE } from "../audits/route-inventory.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const PAGE = "src/app/dev/simulation-theater/[eventId]/page.tsx";

test("without GTP_DEV_ROUTES=1 the route emits 0 fixture params (only the inert placeholder) and reads no receipt", () => {
  let reads = 0;
  const getIds = () => { reads++; return [...FIXTURE_EVENT_IDS]; };
  for (const env of [{}, { GTP_DEV_ROUTES: "0" }, { GTP_DEV_ROUTES: "true" }, { NEXT_PUBLIC_INTERNAL_ROUTES: "1" }]) {
    assert.equal(devRoutesEnabled(env), false);
    const params = devStaticParams(getIds, env);
    assert.deepEqual(contentParams(params), [], JSON.stringify(env));
    assert.deepEqual(params, [{ eventId: DISABLED_PLACEHOLDER }]);
  }
  assert.equal(reads, 0, "a default build never even reads the receipts for this route");
  assert.ok(!FIXTURE_EVENT_IDS.includes(DISABLED_PLACEHOLDER));
});

test("with GTP_DEV_ROUTES=1 it emits ≤3 fixture ids, each a validated receipt of record", () => {
  const params = devStaticParams(() => usableFixtures(REPO), { GTP_DEV_ROUTES: "1" });
  assert.ok(params.length >= 1 && params.length <= MAX_FIXTURES);
  const entries = readShadowReceipts(REPO);
  for (const { eventId } of params) {
    assert.ok(FIXTURE_EVENT_IDS.includes(eventId));
    const t = loadTheater(REPO, eventId, entries);
    assert.ok(fixtureUsable(t), `${eventId} usable`);
    assert.ok(t.manifest.samples.some((s) => s.finalScore?.overtime), `${eventId} carries an overtime run`);
  }
  console.log(`# theater: dev fixtures ${params.map((p) => p.eventId).join(", ")}`);
  assert.deepEqual(devStaticParams(() => ["a", "b", "c", "d"], { GTP_DEV_ROUTES: "1" }).map((p) => p.eventId), ["a", "b", "c"]);
});

test("the page 404s unless enabled, is noindex, unlinked, and the prune removes /dev from any build without the opt-in", () => {
  const src = read(PAGE);
  assert.match(src, /generateStaticParams\(\)\s*\{\s*return devStaticParams\(/);
  assert.match(src, /dynamicParams = false/);
  assert.match(src, /if \(!devRoutesEnabled\(\) \|\| params\.eventId === DISABLED_PLACEHOLDER/);
  assert.match(src, /notFound\(\)/);
  assert.match(src, /robots: \{ index: false, follow: false/);
  const prune = read("scripts/prune-internal-routes.mjs");
  assert.match(prune, /GTP_DEV_ROUTES === "1" \? \[\] : \["dev"\]/, "the prune sweeps out/dev unless the build opted in");
  assert.match(prune, /\.\.\.DEV_ROUTES/);
  const entry = ROUTE_TABLE["/dev/simulation-theater/[eventId]"];
  assert.equal(entry?.classification, "internal");
  assert.equal(entry?.family, true);
  // Unlinked: no source file outside the route and the theater's own modules names the path.
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(tsx?|mjs)$/.test(e.name) || /\.test\./.test(e.name)) continue;
      const rel = path.relative(APP, p);
      if (rel.startsWith("src/app/dev/") || rel.startsWith("src/lib/simulation-theater/") || rel === "src/lib/audits/route-inventory.mjs") continue;
      if (/["'`]\/dev\/simulation-theater/.test(fs.readFileSync(p, "utf8"))) offenders.push(rel);
    }
  };
  walk(path.join(APP, "src"));
  assert.deepEqual(offenders, [], "nothing links the development route");
});

test("colour map: 32 teams keyed nfl:<ABBR>, matching the abbreviations the receipts use; unvalidated", () => {
  assert.equal(TEAM_COLORS_VALIDATED, false);
  const keys = Object.keys(NFL_TEAM_COLORS);
  assert.equal(keys.length, 32);
  assert.ok(keys.every((k) => /^nfl:[A-Z]{2,3}$/.test(k)));
  const used = new Set();
  for (const { receipt } of readShadowReceipts(REPO)) { used.add(receipt.home.abbr); used.add(receipt.away.abbr); }
  for (const a of used) assert.ok(nflTeamColor(a), `receipt abbreviation ${a} has an entry`);
  assert.ok(nflTeamColor("WSH") && !nflTeamColor("WAS"));
  for (const e of Object.values(NFL_TEAM_COLORS)) assert.ok(e.source && /teamcolorcodes|NFL\.com/.test(e.source), `${e.abbr} names its source`);
  // A bare NBA/MLB key can never match: the lookup is namespaced.
  assert.equal(NFL_TEAM_COLORS.DEN, undefined);
  assert.ok(!fs.readFileSync(path.join(APP, "src/components/simulation-theater/TheaterIsland.tsx"), "utf8").includes("team-badge"), "TEAM_COLORS (NBA/MLB) is never used for NFL");
});

test("contrast: ink ≥4.5:1 on every primary; accent ≥3:1 on the page; turf-stripe contrast reported", () => {
  const BG = "#0A0705";
  const DEEP = "#2EA066"; // --vault-accent-deep
  const mix = (a, b, pct) => {
    const h = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
    const [p, q] = [h(a), h(b)];
    return `#${p.map((v, i) => Math.round(v * pct / 100 + q[i] * (1 - pct / 100)).toString(16).padStart(2, "0")).join("")}`;
  };
  const turf = [mix(DEEP, BG, THEATER_TURF_MIX.a), mix(DEEP, BG, THEATER_TURF_MIX.b)];
  assert.deepEqual(turf.map((h) => h.toUpperCase()), turfHexes(THEATER_TURF_MIX), "the library's turf maths matches this test's independent mix");
  const css = read("src/components/simulation-theater/theater-css.ts");
  assert.match(css, /THEATER_TURF_MIX\.a/, "the stylesheet paints the turf from THEATER_TURF_MIX");
  const lowTurf = [];
  for (const e of Object.values(NFL_TEAM_COLORS)) {
    assert.ok(contrastRatio(e.ink, e.primary) >= 4.5, `${e.abbr} ink ${contrastRatio(e.ink, e.primary).toFixed(2)}`);
    assert.ok(contrastRatio(e.accent, BG) >= 3, `${e.abbr} accent on page ${contrastRatio(e.accent, BG).toFixed(2)}`);
    const worst = Math.min(...turf.map((t) => contrastRatio(e.accent, t)));
    if (worst < 3) lowTurf.push(`${e.abbr} ${worst.toFixed(2)}`);
  }
  console.log(`# theater: accents below 3:1 on a turf stripe (to settle before validation, ST1-03): ${lowTurf.join(", ") || "none"}`);
  assert.ok(Math.abs(contrastRatio(NFL_TEAM_COLORS["nfl:LAC"].ink, NFL_TEAM_COLORS["nfl:LAC"].primary) - 4.69) < 0.02, "LAC is the review's 4.69 minimum");
});

test("collisions (CIE76 ΔE < 20): the identical primaries; neutral output while unvalidated; hatch rule", () => {
  const P = (a) => nflTeamColor(a).primary;
  // Iteration 4's official values moved DAL to navy (= NE = SEA), TB to #A71930 (= ATL) and JAX to #000000 (= LV).
  const identical = [["ATL", "TB"], ["CIN", "DEN"], ["DAL", "NE"], ["DAL", "SEA"], ["JAX", "LV"], ["NE", "SEA"]];
  for (const [a, b] of identical) assert.equal(deltaE76(P(a), P(b)), 0, `${a} = ${b}`);
  const all = Object.values(NFL_TEAM_COLORS);
  const seen = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (all[i].primary === all[j].primary) seen.push([all[i].abbr, all[j].abbr].sort());
  assert.deepEqual(seen.map((p) => p.join("=")).sort(), identical.map((p) => p.join("=")).sort(), "no other identical primaries");
  const teams = Object.values(NFL_TEAM_COLORS);
  let pairs = 0, hits = 0;
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) { pairs++; if (collides(teams[i].primary, teams[j].primary)) hits++; }
  console.log(`# theater: primary-vs-primary collisions ${hits} of ${pairs} pairs (review reports 48 of 496)`);
  assert.equal(pairs, 496);
  // Neutral while unvalidated, for every pairing, including unknown teams.
  for (const [h, a] of [["SF", "WSH"], ["CIN", "DEN"], ["XXX", "YYY"]]) {
    const p = theaterPalette(h, a);
    assert.equal(p.mode, "neutral");
    assert.deepEqual(p.home, NEUTRAL_PALETTE.home);
    assert.deepEqual(p.away, NEUTRAL_PALETTE.away);
    assert.ok(JSON.stringify(p).indexOf("#") === -1, "neutral output carries tokens only, no team hex");
  }
  // The dev preview: colliding primaries → away secondary; when that collides too → hatched.
  const sea = theaterPalette("SEA", "NE", { previewUnvalidated: true });
  assert.equal(sea.mode, "team-unvalidated");
  assert.equal(sea.home.fill, P("SEA"));
  assert.equal(sea.away.fill, nflTeamColor("NE").secondary);
  const cin = theaterPalette("CIN", "DEN", { previewUnvalidated: true });
  assert.equal(cin.away.fill, nflTeamColor("DEN").secondary);
  const unknown = theaterPalette("SF", "XXX", { previewUnvalidated: true });
  assert.deepEqual(unknown.away, NEUTRAL_PALETTE.away);
  // hatch: synthesize via two teams whose away secondary also collides with the home primary, if any exist
  const hatched = [];
  for (const h of teams) for (const a of teams) {
    if (h === a) continue;
    const p = theaterPalette(h.abbr, a.abbr, { previewUnvalidated: true });
    if (p.away.hatched) hatched.push(`${a.abbr}@${h.abbr}`);
    if (collides(h.primary, a.primary) && collides(h.primary, a.secondary)) assert.ok(p.away.hatched);
  }
  console.log(`# theater: hatched away end zones in preview: ${hatched.length}`);
});

test("per-team validation (iterations 3–4): every source recorded, flags follow the rule recomputed here; counts pinned; global flag stays false", async () => {
  const { TEAM_COLOR_VALIDATION, VALIDATION_DELTA_E, VALIDATION_ACCESSED, VALIDATION_SOURCES, COLOR_CHANGES, colorAgreement } = await import("./nfl-team-colors-validation.mjs");
  assert.equal(TEAM_COLORS_VALIDATED, false, "the founder decides; per-team results never flip the global flag");
  assert.equal(VALIDATION_DELTA_E, 5);
  const abbrs = Object.values(NFL_TEAM_COLORS).map((e) => e.abbr).sort();
  assert.deepEqual(Object.keys(TEAM_COLOR_VALIDATION).sort(), abbrs, "every NFL team in the map, and only those");
  // Official means league- or club-published; the two references are not.
  assert.deepEqual(Object.entries(VALIDATION_SOURCES).filter(([, s]) => s.official).map(([k]) => k).sort(), ["club", "nflHeader", "nflLogo"]);
  const within = (hex, listed) => listed.some((h) => deltaE76(hex, h) <= 5);
  const review = [], officialTeams = [], referenceOnly = [];
  for (const [abbr, v] of Object.entries(TEAM_COLOR_VALIDATION)) {
    const ids = v.sources.map((s) => s.id);
    assert.deepEqual(ids.slice(0, 4), ["tcc", "wiki", "nflHeader", "nflLogo"], `${abbr}: the four common sources`);
    assert.ok(ids.length === 4 || (ids.length === 5 && ids[4] === "club"), `${abbr}: at most one club source`);
    assert.ok(/^https:\/\/teamcolorcodes\.com\/[a-z0-9-]+\/$/.test(v.sources[0].url), `${abbr}: teamcolorcodes team page`);
    assert.match(v.sources[1].url, /Module:Gridiron_color\/data/);
    assert.ok(/^https:\/\/www\.nfl\.com\/teams\/[a-z0-9-]+\/$/.test(v.sources[2].url), `${abbr}: NFL.com team page`);
    assert.ok(/^https:\/\/static\.www\.nfl\.com\/league\/api\/clubs\/logos\/[A-Z]{2,3}\.svg$/.test(v.sources[3].url), `${abbr}: league-hosted logo`);
    if (v.sources[4]) assert.ok(/^https:\/\/www\.[a-z0-9]+\.com\//.test(v.sources[4].url) && v.sources[4].where, `${abbr}: club page and location`);
    for (const s of v.sources) {
      assert.equal(s.accessed, VALIDATION_ACCESSED);
      assert.equal(typeof s.official, "boolean");
      assert.ok(s.listed.length >= 1 && s.listed.every((h) => /^#[0-9A-F]{6}$/.test(h)), `${abbr}/${s.id}: observed hex list`);
    }
    // THE RULE, recomputed here from the recorded lists (independent of the module's own helper):
    // validated ⇔ one official source lists both the primary and the secondary within ΔE ≤ 5,
    //             or two sources from different families (wiki counts as NFL.com's family) both do.
    const ours = nflTeamColor(abbr);
    const agreeing = v.sources.filter((s) => within(ours.primary, s.listed) && within(ours.secondary, s.listed));
    const official = agreeing.some((s) => s.official);
    const agree = new Set(agreeing.map((s) => s.family)).size >= 2;
    for (const s of v.sources) assert.equal(s.agree, agreeing.includes(s), `${abbr}/${s.id}: per-source agree`);
    assert.equal(v.official, official, `${abbr}: official`);
    assert.equal(v.agree, agree, `${abbr}: agree`);
    assert.equal(v.validated, official || agree, `${abbr}: the stored validated flag follows the rule`);
    assert.equal(colorAgreement(abbr).validated, v.validated);
    assert.equal(v.primary.ours, ours.primary);
    assert.equal(v.secondary.ours, ours.secondary);
    assert.ok(v.note, `${abbr}: a note`);
    if (!v.validated) review.push(`${abbr} (${v.note})`);
    else (official ? officialTeams : referenceOnly).push(abbr);
  }
  const validated = Object.values(TEAM_COLOR_VALIDATION).filter((v) => v.validated).length;
  console.log(`# theater colours: validated ${validated} of 32 (official ${officialTeams.length}, two references only ${referenceOnly.join(", ") || "none"}) · needs review ${32 - validated}`);
  for (const r of review) console.log(`# theater colours: needs review ${r}`);
  assert.equal(validated + review.length, 32);
  // Pinned counts: a change to any of these is a deliberate edit, not drift.
  assert.equal(validated, 32);
  assert.equal(review.length, 0);
  assert.deepEqual(referenceOnly, ["NYJ"], "NYJ's secondary black is listed by no official source (recorded in its note)");
  // The 19 that iteration 3 validated stay validated; the 13 it flagged each carry their resolution.
  const ITER3_VALIDATED = ["ARI", "ATL", "BUF", "CIN", "CLE", "DEN", "DET", "GB", "IND", "KC", "LAC", "MIA", "MIN", "NE", "NYG", "NYJ", "PHI", "SEA", "WSH"];
  const ITER3_REVIEW = ["BAL", "CAR", "CHI", "DAL", "HOU", "JAX", "LAR", "LV", "NO", "PIT", "SF", "TB", "TEN"];
  assert.equal(ITER3_VALIDATED.length + ITER3_REVIEW.length, 32);
  for (const a of ITER3_VALIDATED) assert.equal(TEAM_COLOR_VALIDATION[a].validated, true, `${a} stays validated`);
  for (const a of ITER3_REVIEW) {
    assert.ok(TEAM_COLOR_VALIDATION[a].official, `${a}: resolved against an official source`);
    assert.ok(/^(No change|Primary changed|Secondary)/.test(TEAM_COLOR_VALIDATION[a].note), `${a}: the note says what was decided`);
  }
  // Every recorded change is in the map, and was a real change; nothing outside the 13 changed.
  for (const c of COLOR_CHANGES) {
    assert.ok(ITER3_REVIEW.includes(c.abbr), `${c.abbr} was one of the 13`);
    assert.notEqual(c.before, c.after);
    assert.equal(nflTeamColor(c.abbr)[c.field], c.after, `${c.abbr} ${c.field} is now ${c.after}`);
  }
  assert.deepEqual([...new Set(COLOR_CHANGES.map((c) => c.abbr))], ["BAL", "CHI", "DAL", "HOU", "JAX", "LAR", "NO", "PIT", "TB", "TEN"]);
  for (const e of Object.values(NFL_TEAM_COLORS)) {
    const changed = COLOR_CHANGES.some((c) => c.abbr === e.abbr);
    assert.equal(/NFL\.com/.test(e.source), changed, `${e.abbr}: the source string says whether the row was revised`);
  }
  // nothing in the theater's components imports the validation data (no paint change, no bundle cost)
  for (const f of fs.readdirSync(path.join(APP, "src/components/simulation-theater"))) {
    if (/\.(tsx?|mjs)$/.test(f)) assert.ok(!fs.readFileSync(path.join(APP, "src/components/simulation-theater", f), "utf8").includes("nfl-team-colors-validation"), f);
  }
});
