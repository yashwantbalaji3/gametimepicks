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
  FIELD_DISTINCT_DE00, NEUTRAL_PALETTE, NFL_TEAM_COLORS, TEAM_COLORS_VALIDATED, TEAM_COLOR_EVIDENCE, TEXT_MIN, UI_MIN, clashOf, collides,
  contrastRatio, deltaE2000, deltaE76, fieldClash, fieldDistinct, hexToLab, nflTeamColor, theaterPalette,
} from "./nfl-team-colors.mjs";
import { THEATER_KEYLINE_MIX, THEATER_TURF_MIX, fieldSurfaces, keylineHex, turfHexes } from "./field-geometry.mjs";
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

const EVIDENCE = JSON.parse(read(TEAM_COLOR_EVIDENCE));
const TEAMS = Object.values(NFL_TEAM_COLORS);
const BG = "#0A0705"; // --bg, the page
const PANEL_2 = "#18231D"; // --gtp-card-elevated, under the timeline
const TURF = turfHexes(THEATER_TURF_MIX);
const KEYLINE = keylineHex();
/** Founder role decisions that name a field colour other than the primary (NO and PIT: black is not field-distinct). */
const FOUNDER_ACCENTS = { NO: "#D3BC8D", PIT: "#FFB612", TB: "#C2242B" };
const pairs = () => TEAMS.flatMap((h) => TEAMS.filter((a) => a !== h).map((a) => [h, a]));

test("colour map: 32 teams keyed nfl:<ABBR>, matching the receipts; ON in the dev prototype, on the evidence file's basis", () => {
  assert.equal(TEAM_COLORS_VALIDATED, true, "founder D3 (2026-10-18): team colours on for the dev prototype");
  assert.equal(TEAM_COLOR_EVIDENCE, "src/lib/simulation-theater/nfl-team-colors-evidence.json");
  const keys = Object.keys(NFL_TEAM_COLORS);
  assert.equal(keys.length, 32);
  assert.ok(keys.every((k) => /^nfl:[A-Z]{2,3}$/.test(k)));
  const used = new Set();
  for (const { receipt } of readShadowReceipts(REPO)) { used.add(receipt.home.abbr); used.add(receipt.away.abbr); }
  for (const a of used) assert.ok(nflTeamColor(a), `receipt abbreviation ${a} has an entry`);
  assert.ok(nflTeamColor("WSH") && !nflTeamColor("WAS"));
  // A bare NBA/MLB key can never match: the lookup is namespaced.
  assert.equal(NFL_TEAM_COLORS.DEN, undefined);
  assert.ok(!read("src/components/simulation-theater/TheaterIsland.tsx").includes("team-badge"), "TEAM_COLORS (NBA/MLB) is never used for NFL");
  // still reachable only through the theater, which only the dev route mounts
  const importers = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(tsx?|mjs)$/.test(e.name) || /\.test\./.test(e.name)) continue;
      const body = fs.readFileSync(p, "utf8");
      if (/from\s+["'][^"']*simulation-theater\/(TheaterSection|nfl-team-colors)/.test(body) || /from\s+["']@\/components\/simulation-theater\//.test(body)) importers.push(path.relative(APP, p));
    }
  };
  walk(path.join(APP, "src"));
  assert.deepEqual(importers.filter((f) => !f.startsWith("src/components/simulation-theater/") && !f.startsWith("src/lib/simulation-theater/")).sort(),
    ["src/app/dev/simulation-theater/[eventId]/page.tsx", "src/app/dev/simulation-theater/nba/[eventId]/page.tsx", "src/app/dev/simulation-theater/nba/[eventId]/possession/page.tsx"], "only the dev routes (NFL, the NBA prototype and its possession playback) mount a theater");
});

test("founder roles: NO and PIT black with gold, JAX teal with black and gold, TEN Titans blue / navy / red, TB official reds", () => {
  const roles = (a) => { const c = nflTeamColor(a); return [c.primary, c.secondary, c.accent, c.inkName]; };
  assert.deepEqual(roles("NO"), ["#000000", "#D3BC8D", "#D3BC8D", "white"]);
  assert.deepEqual(roles("PIT"), ["#000000", "#FFB612", "#FFB612", "white"]);
  // iteration 6 (founder: preserve recognizable branding): teal and Titans blue carry JAX and TEN on the field
  assert.deepEqual(roles("JAX"), ["#006778", "#000000", "#006778", "white"]);
  assert.deepEqual(roles("TEN"), ["#4495D2", "#001532", "#4495D2", "dark"]);
  assert.deepEqual(roles("TB"), ["#A71930", "#322F2B", "#C2242B", "white"]);
  assert.ok(!TEAMS.some((t) => [t.primary, t.secondary, t.accent].includes("#D50A0A")), "#D50A0A (the Titans logo's red) is on record, not painted");
  // gold is prominent for the Saints and Steelers: block trim (bar, lettering) and every on-field mark, black is the block
  for (const a of ["NO", "PIT"]) {
    const p = theaterPalette(a, "SF");
    assert.equal(p.home.fill, "#000000");
    assert.equal(p.home.trim, nflTeamColor(a).secondary, `${a}: gold trim on black`);
    assert.equal(p.home.accent, nflTeamColor(a).secondary, `${a}: gold on the field, as is`);
    assert.ok(!fieldDistinct("#000000"), `${a}: black cannot be told from the field surfaces, so gold goes on the field`);
  }
  // the Titans: navy trim on Titans blue, Titans blue on the field (it passes fieldDistinct)
  const ten = theaterPalette("TEN", "HOU");
  assert.equal(ten.home.trim, "#001532");
  assert.equal(ten.home.accent, "#4495D2");
  assert.ok(fieldDistinct("#4495D2"));
  // JAX: teal on the field (field-distinct, keylined); on teal neither gold nor black reaches 4.5:1, so the trim is the ink
  const jax = theaterPalette("JAX", "SF");
  assert.equal(jax.home.fill, "#006778");
  assert.equal(jax.home.accent, "#006778");
  assert.equal(jax.home.trim, "#FFFFFF");
  assert.ok(fieldDistinct("#006778") && Math.min(...[...TURF, PANEL_2].map((x) => deltaE2000("#006778", x))) >= FIELD_DISTINCT_DE00);
  // the evidence file names where each of these came from, and why each field colour is what it is
  for (const a of ["NO", "PIT", "JAX", "TEN", "TB"]) assert.ok(EVIDENCE.teams[a].decision.length > 80, `${a}: decision recorded`);
  for (const a of ["JAX", "TEN"]) assert.match(EVIDENCE.teams[a].fieldColour.reason, /iteration 6, founder/);
  assert.ok(EVIDENCE.teams.TEN.sources.club.names.join(",") === "Titans blue,white,navy,red", "TEN: the brand page's colour proportions");
});

test(`contrast by treatment: block text ≥${TEXT_MIN}:1; for every team and every on-field use the keyline or halo is ≥${UI_MIN}:1 on what it sits on, for all 992 pairings`, () => {
  const css = read("src/components/simulation-theater/theater-css.ts");
  assert.match(css, /THEATER_TURF_MIX\.a/, "the stylesheet paints the turf from THEATER_TURF_MIX");
  assert.match(css, /"--st-keyline": `color-mix\(in srgb, var\(--lava-text\) \$\{THEATER_KEYLINE_MIX\}%, var\(--bg\)\)`/, "the keyline is the token the maths uses");
  assert.equal(THEATER_KEYLINE_MIX, 85);
  const sheet = read("src/components/simulation-theater/theater.css");
  assert.match(sheet, /\[data-st-colors="team"\] \.st-ribbon\{fill-opacity:1;stroke:var\(--st-keyline\)/, "ribbon: keylined");
  assert.match(sheet, /\[data-st-colors="team"\] \.st-seg\{[^}]*inset 0 0 0 1px var\(--st-keyline\)/, "timeline segments: keylined");
  assert.match(sheet, /\[data-st-colors="team"\] \.st-seg\{[^}]*background-image:linear-gradient\(0deg, var\(--st-off\) 0 14px/, "timeline: a full-strength band on drives to come");
  assert.ok(!/\[data-st-colors="team"\] \.st-seg\.is-done\{[^}]*color-mix/.test(sheet), "a played drive shows the official colour undimmed");
  const scene = read("src/components/simulation-theater/FieldScene.tsx");
  assert.match(scene, /fill: off\.fill, stroke: "var\(--st-keyline\)"/, "possession tag: a keylined score-bug block");
  assert.match(scene, /className="st-halo"[^>]*stroke: palette\[zone\]\.ink/, "end-zone outlines: a halo in that end zone's ink");
  assert.ok(!/turfSafeAccent|accentBase/.test(scene + read("src/components/simulation-theater/TheaterIsland.tsx")), "no lightened colour anywhere");
  // the surfaces each use sits on, and the boundary that carries its contrast
  const { turf, panel, page } = fieldSurfaces();
  assert.deepEqual([...turf, panel, page], [...TURF, PANEL_2, BG]);
  for (const t of TEAMS) {
    assert.ok(contrastRatio(t.ink, t.primary) >= TEXT_MIN, `${t.abbr} ink ${contrastRatio(t.ink, t.primary).toFixed(2)}`);
    assert.ok(contrastRatio(t.ink, t.primary) >= contrastRatio(t.ink === "#FFFFFF" ? BG : "#FFFFFF", t.primary), `${t.abbr}: the better ink`);
  }
  const min = { text: Infinity, trim: Infinity, keyline: Infinity, halo: Infinity, glyph: Infinity, fillAloneUnder3: new Set() };
  for (const [h, a] of pairs()) {
    const p = theaterPalette(h.abbr, a.abbr);
    assert.equal(p.mode, "team");
    for (const side of ["home", "away"]) {
      const s = p[side];
      const tag = `${a.abbr}@${h.abbr} ${side}`;
      // score bug, end-zone lettering, possession-tag text: ink / trim on the block
      for (const [k, v] of [["text", contrastRatio(s.ink, s.fill)], ["trim", contrastRatio(s.trim, s.fill)]]) {
        assert.ok(v >= TEXT_MIN, `${tag} ${k} ${v.toFixed(2)}`);
        min[k] = Math.min(min[k], v);
      }
      // ribbon + possession tag (turf), timeline segments (panel), anything at the page: the keyline is the boundary
      for (const [use, bg] of [["ribbon", turf[0]], ["ribbon", turf[1]], ["tag", turf[0]], ["tag", turf[1]], ["timeline", panel], ["page", page]]) {
        const v = contrastRatio(KEYLINE, bg);
        assert.ok(v >= UI_MIN, `${tag} ${use} keyline ${v.toFixed(2)}`);
        min.keyline = Math.min(min.keyline, v);
        if (contrastRatio(s.accent, bg) < UI_MIN) min.fillAloneUnder3.add(s.accent);
      }
      // outlines on an end zone (winner on its own, scoring flash on the other): the halo is that zone's ink
      for (const zone of ["home", "away"]) {
        const v = contrastRatio(p[zone].ink, p[zone].fill);
        assert.ok(v >= UI_MIN, `${tag} outline halo on the ${zone} end zone ${v.toFixed(2)}`);
        min.halo = Math.min(min.halo, v);
      }
      // the glyph and the clash abbreviation chip on a timeline segment: text on the field colour
      const g = contrastRatio(s.accentInk, s.accent);
      assert.ok(g >= TEXT_MIN, `${tag} segment glyph / abbreviation ${g.toFixed(2)}`);
      min.glyph = Math.min(min.glyph, g);
    }
  }
  console.log(`# theater colours: worst block text ${min.text.toFixed(2)}, trim ${min.trim.toFixed(2)}; keyline on turf/panel/page ≥ ${min.keyline.toFixed(2)}; end-zone halo ≥ ${min.halo.toFixed(2)}; segment glyph / abbreviation ≥ ${min.glyph.toFixed(2)}; official on-field colours under 3:1 alone (keyline required): ${min.fillAloneUnder3.size}`);
  assert.ok(min.keyline >= UI_MIN && min.text >= TEXT_MIN && min.trim >= TEXT_MIN && min.glyph >= TEXT_MIN);
  assert.ok(Math.abs(contrastRatio(nflTeamColor("LAC").ink, nflTeamColor("LAC").primary) - 4.69) < 0.02, "LAC is the review's 4.69 minimum");
});

test("one identity: the primary carries the team on the field unless a founder role says otherwise or it cannot be told from the turf or panel", () => {
  const { turf, panel } = fieldSurfaces();
  const kept = [];
  for (const t of TEAMS) {
    const fc = EVIDENCE.teams[t.abbr].fieldColour;
    assert.equal(fc.hex, t.accent, `${t.abbr}: evidence fieldColour = the map's field colour`);
    assert.ok(fc.reason.length > 60, `${t.abbr}: reason recorded`);
    assert.deepEqual(fc.primaryDE00, { turfA: Math.round(deltaE2000(t.primary, turf[0]) * 10) / 10, turfB: Math.round(deltaE2000(t.primary, turf[1]) * 10) / 10, panel: Math.round(deltaE2000(t.primary, panel) * 10) / 10 }, `${t.abbr}: ΔE00 recomputed`);
    if (FOUNDER_ACCENTS[t.abbr]) { assert.equal(t.accent, FOUNDER_ACCENTS[t.abbr], `${t.abbr}: founder role`); continue; }
    if (fieldDistinct(t.primary)) { assert.equal(t.accent, t.primary, `${t.abbr}: primary on the field`); assert.equal(fc.role, "primary"); }
    else {
      assert.equal(t.accent, t.secondary, `${t.abbr}: primary not field-distinct → secondary`);
      assert.equal(fc.role, "secondary");
      assert.ok(Object.values(fc.primaryDE00).some((v) => v < FIELD_DISTINCT_DE00), `${t.abbr}: genuinely indistinguishable from a surface`);
      assert.ok(fieldDistinct(t.secondary), `${t.abbr}: the secondary is`);
      kept.push(t.abbr);
    }
  }
  // iteration 6 re-examined every team with a secondary on the field: each primary is under ΔE00 20 against a surface
  assert.deepEqual(kept.sort(), ["CHI", "CLE", "GB", "HOU", "LV", "NYJ", "PHI"], "exactly these keep the secondary on the field");
  for (const a of ["GB", "NYJ", "PHI"]) assert.ok(Math.min(...turf.map((s) => deltaE2000(nflTeamColor(a).primary, s))) < FIELD_DISTINCT_DE00, `${a}: green on green turf`);
  assert.equal(deltaE2000("#00338D", "#00338D"), 0);
  assert.ok(Math.abs(deltaE2000("#00338D", "#153522") - deltaE2000("#153522", "#00338D")) < 1e-9);
  // BUF (founder, 2026-10-18): royal blue #00338D on the score bug AND the field in all 62 orientations, never red
  const buf = nflTeamColor("BUF");
  const hue = (hex) => { const [, a, b] = hexToLab(hex); return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; };
  assert.equal(buf.primary, "#00338D");
  assert.equal(buf.accent, "#00338D");
  let royal = 0;
  const cued = [];
  for (const o of TEAMS.filter((x) => x.abbr !== "BUF")) {
    for (const [p, side] of [[theaterPalette(o.abbr, "BUF"), "away"], [theaterPalette("BUF", o.abbr), "home"]]) {
      assert.equal(p[side].fill, "#00338D", `BUF ${side} vs ${o.abbr}: score bug royal`);
      assert.equal(p[side].accent, "#00338D", `BUF ${side} vs ${o.abbr}: field royal`);
      assert.ok(!(hue(p[side].accent) < 60 || hue(p[side].accent) > 330), "no red");
      royal++;
      if (p[side].patterned) cued.push(`BUF@${o.abbr}`);
      if (side === "home") assert.equal(p.home.patterned, false, "the home side never carries the cues");
    }
  }
  assert.equal(royal, 62, "BUF keeps royal blue in all 62 orientations");
  // as the away side against a home blue or purple it keeps royal and carries the clash cues instead
  assert.deepEqual(cued, ["BUF@BAL", "BUF@IND", "BUF@LAR", "BUF@MIN", "BUF@NYG"]);
  const fixture = theaterPalette("LV", "BUF");
  assert.equal(fixture.clash, null, "BUF @ LV (a dev fixture) does not clash");
});

test("no colour swap ever: in all 992 pairings each side paints its primary on the block and its declared field colour on the field; every clash puts pattern + abbreviation cues on the away side", () => {
  const P = (a) => nflTeamColor(a).primary;
  const identical = [["ATL", "TB"], ["DAL", "NE"], ["DAL", "SEA"], ["LV", "NO"], ["LV", "PIT"], ["NE", "SEA"], ["NO", "PIT"]];
  const seen = [];
  for (let i = 0; i < TEAMS.length; i++) for (let j = i + 1; j < TEAMS.length; j++) if (TEAMS[i].primary === TEAMS[j].primary) seen.push([TEAMS[i].abbr, TEAMS[j].abbr].sort().join("="));
  assert.deepEqual(seen.sort(), identical.map((p) => p.join("=")).sort(), "exactly these identical primaries");
  assert.equal(P("SEA"), P("NE"));
  let unordered = 0, primaryHits = 0;
  for (let i = 0; i < TEAMS.length; i++) for (let j = i + 1; j < TEAMS.length; j++) { unordered++; if (collides(TEAMS[i].primary, TEAMS[j].primary)) primaryHits++; }
  assert.equal(unordered, 496);
  const n = { pairs: 0, blocks: 0, field: 0, both: 0 };
  for (const [h, a] of pairs()) {
    n.pairs++;
    const p = theaterPalette(h.abbr, a.abbr);
    const tag = `${a.abbr}@${h.abbr}`;
    // NO SWAP: block = primary, field = the declared field colour, for both sides, whatever the opponent
    for (const [side, t] of [["home", h], ["away", a]]) {
      assert.equal(p[side].fill, t.primary, `${tag} ${side}: score bug = primary`);
      assert.equal(p[side].accent, t.accent, `${tag} ${side}: field = declared field colour`);
      assert.equal(p[side].ink, t.ink, `${tag} ${side}: the team's own ink`);
      assert.deepEqual(Object.keys(p[side]).sort(), ["accent", "accentInk", "fill", "ink", "patterned", "trim"], `${tag}: no swap or alternate field`);
    }
    // a clash is the S7 primary rule or the on-field ΔE00 rule; it puts the cues on the AWAY side only
    const clash = collides(h.primary, a.primary) || fieldClash(h.accent, a.accent);
    assert.equal(p.clash !== null, clash, `${tag}: clash recomputed`);
    assert.equal(p.clash, clashOf(h, a));
    assert.equal(p.away.patterned, clash, `${tag}: the away side carries the pattern cue exactly when the pairing clashes`);
    assert.equal(p.home.patterned, false);
    if (clash) n[p.clash]++;
  }
  console.log(`# theater colours: primary collisions ${primaryHits} of 496; of 992 pairings → clash cues on the away side in ${n.blocks + n.field + n.both} (primaries ${n.blocks}, field colours ${n.field}, both ${n.both}); colour swaps 0`);
  assert.equal(n.pairs, 992);
  // Pinned: a change to any of these is a deliberate edit of the map, not drift.
  assert.deepEqual([primaryHits, n.blocks, n.field, n.both], [42, 32, 36, 52]);
  // the guard still catches the dark pairs CIE76 calls distinct
  for (const [x, y] of [["BUF", "IND"], ["DAL", "NYG"], ["IND", "LAR"]]) {
    const A = nflTeamColor(x).accent, B = nflTeamColor(y).accent;
    assert.ok(!collides(A, B) && fieldClash(A, B), `${x}/${y}: CIE76 ${deltaE76(A, B).toFixed(1)}, ΔE00 ${deltaE2000(A, B).toFixed(1)}`);
    assert.ok(theaterPalette(y, x).away.patterned, `${x}@${y}: cued`);
  }
  // the cues themselves: every patterned side renders the stripes (pattern) and its abbreviation (text) — rendered by
  // theater-shell.test.mjs for all 120 clashing pairings; here, that the components read \`patterned\` and nothing else
  const scene = read("src/components/simulation-theater/FieldScene.tsx");
  const island = read("src/components/simulation-theater/TheaterIsland.tsx");
  const parts = read("src/components/simulation-theater/parts.tsx");
  const sheet = read("src/components/simulation-theater/theater.css");
  assert.match(scene, /const cue = team && off\.patterned/, "possession tag + ribbon cue");
  assert.match(scene, /palette\[side\]\.patterned \? \(\s*<rect[^>]*fill=\{`url\(#\$\{id\("cue"\)\}\)`\}/, "end-line stripes");
  assert.match(island, /cue && px != null && px >= SEG_ABBR_MIN_PX \? <span className="st-seg-abbr" aria-hidden="true">\{teams\[ev\.offense\]\.abbr\}/, "timeline abbreviation");
  assert.match(island, /cue \? " is-cue" : ""/, "timeline stripes");
  assert.match(parts, /teamMode && p\.patterned \? " is-cue" : ""/, "score-bug stripes");
  assert.match(sheet, /\.st-seg\.is-cue\{background-image:var\(--st-cue\)/);
  assert.match(sheet, /\.st-seg-abbr\{[^}]*background:var\(--st-off\);color:var\(--st-off-ink\)/, "the abbreviation sits on a solid chip of the field colour");
  assert.ok(!/accentSwap|accentHatched|\.alt\b/.test(scene + island + parts + read("src/lib/simulation-theater/nfl-team-colors.mjs")), "no swap path remains");
  // Every matchup in the committed receipts paints by the same rules, recomputed here. The receipts grow every week
  // (2026-10-20 17:33Z: week-7 receipts turned this red when it compared them with the static evidence list), so the
  // guarantee is checked per receipt matchup — not by equality with a pinned list that rots on the next slate.
  const receiptMatchups = new Set(readShadowReceipts(REPO).map(({ receipt }) => `${receipt.away.abbr}@${receipt.home.abbr}`));
  assert.ok(receiptMatchups.size > 0, "the receipts are read");
  for (const mu of receiptMatchups) {
    const [a, h] = mu.split("@");
    const p = theaterPalette(h, a);
    const clash = collides(nflTeamColor(h).primary, nflTeamColor(a).primary) || fieldClash(nflTeamColor(h).accent, nflTeamColor(a).accent);
    assert.equal(p.clash !== null, clash, `${mu}: clash recomputed`);
    assert.equal(p.away.patterned, clash, `${mu}: cues on the away side exactly when it clashes`);
    assert.equal(p.home.patterned, false, `${mu}: never on the home side`);
  }
  // The evidence file (what was painted when it was written) must still be what the map paints today.
  for (const m of EVIDENCE.matchups) {
    const [a, h] = m.matchup.split("@");
    const p = theaterPalette(h, a);
    assert.equal(m.clash ?? null, p.clash, `${m.matchup} clash`);
    for (const side of ["home", "away"]) {
      const want = { ...p[side] };
      for (const k of Object.keys(want)) if (want[k] === false) delete want[k];
      assert.deepEqual(m[side], want, `${m.matchup} ${side}`);
    }
  }
  // the neutral switch: tokens only; unknown teams fall back to neutral
  for (const [h, a] of [["SF", "WSH"], ["CIN", "DEN"], ["XXX", "YYY"]]) {
    const p = theaterPalette(h, a, { neutral: true });
    assert.equal(p.mode, "neutral");
    assert.deepEqual(p.home, NEUTRAL_PALETTE.home);
    assert.deepEqual(p.away, NEUTRAL_PALETTE.away);
    assert.ok(JSON.stringify(p).indexOf("#") === -1, "neutral output carries tokens only, no team hex");
  }
  assert.deepEqual(theaterPalette("SF", "XXX").away, NEUTRAL_PALETTE.away);
});

test("evidence file: every source recorded, flags recomputed by the rule, every role an official value, changes and on-field treatments reproduced", () => {
  const E = EVIDENCE;
  assert.equal(E.validationDeltaE, 5);
  assert.equal(E.accessed, "2026-10-18");
  assert.deepEqual(Object.entries(E.sources).filter(([, s]) => s.official).map(([k]) => k).sort(), ["club", "nflHeader", "nflLogo"]);
  const abbrs = TEAMS.map((e) => e.abbr).sort();
  assert.deepEqual(Object.keys(E.teams).sort(), abbrs, "every NFL team in the map, and only those");
  const within = (hex, listed) => listed.some((h) => deltaE76(hex, h) <= E.validationDeltaE);
  let official = 0;
  for (const [abbr, v] of Object.entries(E.teams)) {
    const ours = nflTeamColor(abbr);
    const ids = Object.keys(v.sources);
    assert.deepEqual(ids.slice(0, 4), ["tcc", "wiki", "nflHeader", "nflLogo"], `${abbr}: the four common sources`);
    assert.ok(ids.length === 4 || (ids.length === 5 && ids[4] === "club"), `${abbr}: at most one club source`);
    assert.ok(/^https:\/\/teamcolorcodes\.com\/[a-z0-9-]+\/$/.test(v.sources.tcc.url));
    assert.ok(/^https:\/\/www\.nfl\.com\/teams\/[a-z0-9-]+\/$/.test(v.sources.nflHeader.url));
    assert.ok(/^https:\/\/static\.www\.nfl\.com\/league\/api\/clubs\/logos\/[A-Z]{2,3}\.svg$/.test(v.sources.nflLogo.url));
    if (v.sources.club) assert.ok(/^https:\/\/www\.[a-z0-9]+\.com\//.test(v.sources.club.url) && v.sources.club.where);
    for (const [id, s] of Object.entries(v.sources)) assert.ok(s.listed.length >= 1 && s.listed.every((h) => /^#[0-9A-F]{6}$/.test(h)), `${abbr}/${id}: observed hex list`);
    // THE RULE, recomputed: validated ⇔ an official source lists both primary and secondary within ΔE ≤ 5, or two families do
    const agreeing = Object.entries(v.sources).filter(([, s]) => within(ours.primary, s.listed) && within(ours.secondary, s.listed));
    const isOfficial = agreeing.some(([id]) => E.sources[id].official);
    const agree = new Set(agreeing.map(([id]) => E.sources[id].family)).size >= 2;
    assert.equal(v.validated, isOfficial || agree, `${abbr}: the stored validated flag follows the rule`);
    if (isOfficial) official++;
    // roles: the map holds exactly the recorded roles, and each is listed VERBATIM by the official sources named
    assert.deepEqual([v.roles.primary.hex, v.roles.secondary.hex, v.roles.accent.hex, v.roles.ink], [ours.primary, ours.secondary, ours.accent, ours.inkName], `${abbr}: map = evidence roles`);
    assert.equal(v.roles.alternates, undefined, `${abbr}: no alternate role (no colour is swapped for a clash)`);
    assert.equal(ours.alt, undefined, `${abbr}: the runtime map carries no alternate`);
    for (const r of [v.roles.primary, v.roles.secondary, v.roles.accent, ...(v.recordedAlternates ?? [])]) {
      const recomputed = ["nflHeader", "nflLogo", "club"].filter((id) => v.sources[id]?.listed.includes(r.hex));
      assert.deepEqual(r.officialSources, recomputed, `${abbr} ${r.hex}: official sources recomputed`);
      assert.ok(recomputed.length >= 1, `${abbr} ${r.hex}: listed verbatim by an official source`);
    }
    assert.ok(v.decision, `${abbr}: decision recorded`);
  }
  console.log(`# theater colours: validated 32 of 32, every one by an official source (${official}); every role value official-verbatim`);
  assert.equal(official, 32);
  // changes (iteration 5, against d933d84b5e), then the identity pass, then iteration 6, chain: each `before` is the
  // previous `after`, and the last `after` is what the map holds now
  const last = new Map();
  for (const c of [...E.changes, ...E.identityChanges, ...E.brandingChanges]) {
    assert.notEqual(c.before, c.after);
    const k = `${c.abbr}.${c.field}`;
    if (last.has(k)) assert.equal(c.before, last.get(k), `${k}: the chain is unbroken`);
    last.set(k, c.after);
  }
  for (const [k, after] of last) { const [abbr, field] = k.split("."); assert.equal(nflTeamColor(abbr)[field], after, `${k} is now ${after}`); }
  assert.deepEqual([...new Set(E.changes.map((c) => c.abbr))].sort(), ["BAL", "DEN", "HOU", "IND", "JAX", "KC", "NO", "NYG", "NYJ", "PHI", "PIT", "TB", "TEN"]);
  assert.deepEqual(E.identityChanges.map((c) => c.abbr), ["ARI", "ATL", "BAL", "BUF", "DAL", "IND", "LAR", "MIN", "NE", "NYG", "SEA", "SF", "WSH"]);
  assert.ok(E.identityChanges.every((c) => c.field === "accent" && c.after === nflTeamColor(c.abbr).primary));
  assert.deepEqual(E.brandingChanges.map((c) => `${c.abbr} ${c.before}→${c.after}`), ["JAX #D7A22A→#006778", "TEN #D50A0A→#4495D2"]);
  assert.ok(E.brandingChanges.every((c) => c.field === "accent" && c.after === nflTeamColor(c.abbr).primary && fieldDistinct(c.after)));
  assert.equal(E.history.length, 18);
  // every on-field colour: the official value as painted, and the treatment that carries its contrast, recomputed
  assert.ok(!("derivedUi" in E), "no derived (substituted) colour is recorded any more");
  const { turf, panel, page } = fieldSurfaces();
  const r2 = (x) => Math.round(x * 100) / 100;
  const surf = (hex) => ({ turf: r2(Math.min(...turf.map((t) => contrastRatio(hex, t)))), panel: r2(contrastRatio(hex, panel)), page: r2(contrastRatio(hex, page)) });
  const want = TEAMS.map((t) => ({ abbr: t.abbr, role: "accent", official: t.accent, onField: t.accent, fillAlone: surf(t.accent), keyline: surf(KEYLINE) }));
  assert.deepEqual(E.treatments.map(({ abbr, role, official: o, onField, fillAlone, keyline }) => ({ abbr, role, official: o, onField, fillAlone, keyline })), want);
  for (const d of E.treatments) {
    assert.equal(d.onField, d.official, `${d.abbr}: painted as is`);
    assert.ok(Object.values(d.keyline).every((v) => v >= UI_MIN) && d.treatment.startsWith("keyline") && d.use, `${d.abbr}: treatment documented`);
    assert.equal(d.treatment.includes("required"), Math.min(...Object.values(d.fillAlone)) < UI_MIN, `${d.abbr}: required ⇔ the colour alone is under 3:1`);
    assert.ok(Math.abs(d.fieldDE00 - Math.min(...[...turf, panel].map((s) => deltaE2000(d.official, s)))) < 0.051);
  }
  console.log(`# theater colours: on-field treatments ${E.treatments.filter((d) => d.treatment.includes("required")).length} keyline-required of ${E.treatments.length}`);
  // data only: no component or runtime module imports the evidence file
  for (const dir of ["src/components/simulation-theater", "src/lib/simulation-theater", "src/app/dev"]) {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(path.join(APP, dir))) {
      if (!/\.(tsx?|mjs)$/.test(f) || /\.test\./.test(f)) continue;
      assert.ok(!/import[^;]*nfl-team-colors-evidence/.test(fs.readFileSync(f, "utf8")), `${path.relative(APP, f)} must not import the evidence`);
    }
  }
  assert.ok(!fs.existsSync(path.join(APP, "src/lib/simulation-theater/nfl-team-colors-validation.mjs")), "the evidence lives in the JSON, not runtime code");
});
