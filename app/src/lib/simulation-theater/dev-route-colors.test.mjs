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
  FIELD_DISTINCT_DE00, NEUTRAL_PALETTE, NFL_TEAM_COLORS, TEAM_COLORS_VALIDATED, TEAM_COLOR_EVIDENCE, TEXT_MIN, UI_MIN, collides,
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
const FOUNDER_ACCENTS = { JAX: "#D7A22A", NO: "#D3BC8D", PIT: "#FFB612", TEN: "#D50A0A", TB: "#C2242B" };
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
    ["src/app/dev/simulation-theater/[eventId]/page.tsx"], "only the dev route mounts the theater");
});

test("founder roles: NO and PIT black with gold, JAX teal with black and gold, TEN Titans blue / navy / red, TB official reds", () => {
  const roles = (a) => { const c = nflTeamColor(a); return [c.primary, c.secondary, c.accent, c.inkName]; };
  assert.deepEqual(roles("NO"), ["#000000", "#D3BC8D", "#D3BC8D", "white"]);
  assert.deepEqual(roles("PIT"), ["#000000", "#FFB612", "#FFB612", "white"]);
  assert.deepEqual(roles("JAX"), ["#006778", "#000000", "#D7A22A", "white"]);
  assert.deepEqual(roles("TEN"), ["#4495D2", "#001532", "#D50A0A", "dark"]);
  assert.deepEqual(roles("TB"), ["#A71930", "#322F2B", "#C2242B", "white"]);
  assert.ok(!TEAMS.some((t) => [t.primary, t.secondary, t.accent].includes("#D50A0A") && t.abbr !== "TEN"), "#D50A0A only as the Titans logo's red");
  // gold is prominent for the Saints and Steelers: block trim (bar, lettering) and every on-field accent
  for (const a of ["NO", "PIT"]) {
    const p = theaterPalette(a, "SF");
    assert.equal(p.home.fill, "#000000");
    assert.equal(p.home.trim, nflTeamColor(a).secondary, `${a}: gold trim on black`);
    assert.equal(p.home.accent, nflTeamColor(a).secondary, `${a}: gold on the field, as is`);
  }
  // the Titans: navy trim on Titans blue; the logo's red on the field, as is (keylined, never lightened)
  const ten = theaterPalette("TEN", "HOU");
  assert.equal(ten.home.trim, "#001532");
  assert.equal(ten.home.accent, "#D50A0A");
  // JAX: gold carries the team on the field; on teal neither gold nor black reaches 4.5:1, so the trim is the ink
  const jax = theaterPalette("JAX", "SF");
  assert.equal(jax.home.fill, "#006778");
  assert.equal(jax.home.accent, "#D7A22A");
  assert.equal(jax.home.trim, "#FFFFFF");
  // the evidence file names where each of these came from
  for (const a of ["NO", "PIT", "JAX", "TEN", "TB"]) assert.ok(EVIDENCE.teams[a].decision.length > 80, `${a}: decision recorded`);
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
      // the glyph on the current timeline segment
      const g = contrastRatio(s.accentInk, s.accent);
      assert.ok(g >= UI_MIN, `${tag} segment glyph ${g.toFixed(2)}`);
      min.glyph = Math.min(min.glyph, g);
    }
  }
  console.log(`# theater colours: worst block text ${min.text.toFixed(2)}, trim ${min.trim.toFixed(2)}; keyline on turf/panel/page ≥ ${min.keyline.toFixed(2)}; end-zone halo ≥ ${min.halo.toFixed(2)}; segment glyph ≥ ${min.glyph.toFixed(2)}; official on-field colours under 3:1 alone (keyline required): ${min.fillAloneUnder3.size}`);
  assert.ok(Math.abs(contrastRatio(nflTeamColor("LAC").ink, nflTeamColor("LAC").primary) - 4.69) < 0.02, "LAC is the review's 4.69 minimum");
});

test("one identity: the primary carries the team on the field unless a founder role says otherwise or it cannot be told from the turf", () => {
  const { turf, panel } = fieldSurfaces();
  const kept = [];
  for (const t of TEAMS) {
    if (FOUNDER_ACCENTS[t.abbr]) { assert.equal(t.accent, FOUNDER_ACCENTS[t.abbr], `${t.abbr}: founder role`); continue; }
    if (fieldDistinct(t.primary)) assert.equal(t.accent, t.primary, `${t.abbr}: primary on the field`);
    else {
      assert.equal(t.accent, t.secondary, `${t.abbr}: primary not field-distinct → secondary`);
      assert.ok(fieldDistinct(t.secondary), `${t.abbr}: the secondary is`);
      kept.push(t.abbr);
    }
  }
  assert.deepEqual(kept.sort(), ["CHI", "CLE", "GB", "HOU", "LV", "NYJ", "PHI"], "exactly these keep the secondary on the field");
  for (const a of ["GB", "NYJ", "PHI"]) assert.ok(Math.min(...[...turf, panel].map((s) => deltaE2000(nflTeamColor(a).primary, s))) < FIELD_DISTINCT_DE00, `${a}: green on green`);
  // CIEDE2000 reference pair (Sharma, Wu & Dalal 2005, pair 1 via Lab ≈ hex is not exact, so check symmetry and identity)
  assert.equal(deltaE2000("#00338D", "#00338D"), 0);
  assert.ok(Math.abs(deltaE2000("#00338D", "#153522") - deltaE2000("#153522", "#00338D")) < 1e-9);
  // BUF: royal blue everywhere — score bug, end zone, ribbon, timeline — in its own fixture and every matchup without an accent clash
  const hue = (hex) => { const [, a, b] = hexToLab(hex); return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; };
  const buf = nflTeamColor("BUF");
  const fixture = theaterPalette("LV", "BUF");
  assert.equal(fixture.away.fill, buf.primary);
  assert.equal(fixture.away.accent, buf.primary, "BUF @ LV: the field paints the official royal blue");
  let clean = 0;
  const swapped = [];
  for (const o of TEAMS.filter((x) => x.abbr !== "BUF")) {
    for (const [p, side] of [[theaterPalette(o.abbr, "BUF"), "away"], [theaterPalette("BUF", o.abbr), "home"]]) {
      if (p[side].accentSwap || p[side].accentHatched) { swapped.push(`BUF@${o.abbr} ${p[side].accentSwap ?? "hatched"}`); continue; }
      clean++;
      const dH = Math.abs(hue(p[side].accent) - hue(buf.primary));
      assert.ok(Math.min(dH, 360 - dH) < 1, `BUF ${side} vs ${o.abbr}: on-field hue = primary hue`);
      assert.ok(!(hue(p[side].accent) < 60 || hue(p[side].accent) > 330), "no red");
      assert.equal(p[side].fill === buf.primary ? p[side].accent : buf.primary, buf.primary);
    }
  }
  // only the clash rule moves BUF off royal: as the away side against a home blue or purple (fieldClash)
  assert.deepEqual(swapped, ["BUF@BAL #C60C30", "BUF@IND #C60C30", "BUF@LAR #C60C30", "BUF@MIN #C60C30", "BUF@NYG #C60C30"]);
  assert.equal(clean, 57, `BUF keeps royal blue in ${clean} of 62 orientations`);
});

test("collisions (CIE76 ΔE < 20; on the field also ΔE00 < 10): identical primaries, secondary or hatch for blocks; accent swap or hatch on the field; every 2026 matchup", () => {
  const P = (a) => nflTeamColor(a).primary;
  const identical = [["ATL", "TB"], ["DAL", "NE"], ["DAL", "SEA"], ["LV", "NO"], ["LV", "PIT"], ["NE", "SEA"], ["NO", "PIT"]];
  const seen = [];
  for (let i = 0; i < TEAMS.length; i++) for (let j = i + 1; j < TEAMS.length; j++) if (TEAMS[i].primary === TEAMS[j].primary) seen.push([TEAMS[i].abbr, TEAMS[j].abbr].sort().join("="));
  assert.deepEqual(seen.sort(), identical.map((p) => p.join("=")).sort(), "exactly these identical primaries");
  let unordered = 0, primaryHits = 0;
  for (let i = 0; i < TEAMS.length; i++) for (let j = i + 1; j < TEAMS.length; j++) { unordered++; if (collides(TEAMS[i].primary, TEAMS[j].primary)) primaryHits++; }
  assert.equal(unordered, 496);
  const n = { pairs: 0, secondary: 0, hatched: 0, swap: 0, accentHatched: 0 };
  for (const [h, a] of pairs()) {
    n.pairs++;
    const p = theaterPalette(h.abbr, a.abbr);
    assert.equal(p.home.fill, h.primary, "home always paints its primary");
    if (collides(h.primary, a.primary)) {
      if (collides(h.primary, a.secondary)) { assert.ok(p.away.hatched); assert.equal(p.away.fill, a.primary); n.hatched++; }
      else { assert.equal(p.away.fill, a.secondary); n.secondary++; }
    } else assert.equal(p.away.fill, a.primary);
    if (p.away.accentHatched) n.accentHatched++;
    else assert.ok(!fieldClash(p.home.accent, p.away.accent), `${a.abbr}@${h.abbr}: on-field accents distinguishable`);
    if (p.away.accentSwap) {
      n.swap++;
      assert.ok([a.secondary, a.primary, ...a.alt].includes(p.away.accentSwap), "the swap is an official colour of the team");
      assert.equal(p.away.accent, p.away.accentSwap, "painted as is");
      assert.ok(fieldDistinct(p.away.accentSwap), "and visible on the turf");
    }
  }
  console.log(`# theater colours: primary collisions ${primaryHits} of 496; of 992 pairings → away secondary ${n.secondary}, hatched end zone ${n.hatched}, accent swap ${n.swap}, hatched timeline ${n.accentHatched}`);
  assert.equal(n.pairs, 992);
  // Pinned: a change to any of these is a deliberate edit of the map, not drift.
  // identity pass: more primaries on the field, and the ΔE00 < 10 clash guard for dark pairs → swaps 65 → 68 and
  // hatched timelines 77 → 32 (no derived colour can fail SWAP_MAX_ADJUST any more; a swap only needs to be
  // field-distinct and clash-free)
  assert.deepEqual([primaryHits, n.secondary, n.hatched, n.swap, n.accentHatched], [42, 84, 0, 68, 32]);
  // the guard catches the dark pairs CIE76 calls distinct
  for (const [x, y] of [["BUF", "IND"], ["DAL", "NYG"], ["IND", "LAR"], ["TB", "TEN"]]) {
    const A = nflTeamColor(x).accent, B = nflTeamColor(y).accent;
    assert.ok(!collides(A, B) && fieldClash(A, B), `${x}/${y}: CIE76 ${deltaE76(A, B).toFixed(1)}, ΔE00 ${deltaE2000(A, B).toFixed(1)}`);
  }
  const SEA = theaterPalette("SEA", "NE");
  assert.equal(SEA.away.fill, nflTeamColor("NE").secondary);
  // every matchup in the 2026 receipts: the evidence file records what is painted, recomputed here
  const receiptMatchups = new Set(readShadowReceipts(REPO).map(({ receipt }) => `${receipt.away.abbr}@${receipt.home.abbr}`));
  assert.deepEqual(EVIDENCE.matchups.map((m) => m.matchup).sort(), [...receiptMatchups].sort());
  for (const m of EVIDENCE.matchups) {
    const [a, h] = m.matchup.split("@");
    const p = theaterPalette(h, a);
    for (const side of ["home", "away"]) {
      const { mode: _m, ...want } = { mode: 0, ...p[side] };
      for (const k of Object.keys(want)) if (want[k] === false) delete want[k];
      assert.deepEqual(m[side], want, `${m.matchup} ${side}`);
    }
    assert.ok(!fieldClash(p.home.accent, p.away.accent) || p.away.accentHatched, m.matchup);
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
    assert.deepEqual((v.roles.alternates ?? []).map((x) => x.hex), ours.alt, `${abbr}: alternates`);
    for (const r of [v.roles.primary, v.roles.secondary, v.roles.accent, ...(v.roles.alternates ?? [])]) {
      const recomputed = ["nflHeader", "nflLogo", "club"].filter((id) => v.sources[id]?.listed.includes(r.hex));
      assert.deepEqual(r.officialSources, recomputed, `${abbr} ${r.hex}: official sources recomputed`);
      assert.ok(recomputed.length >= 1, `${abbr} ${r.hex}: listed verbatim by an official source`);
    }
    assert.ok(v.decision, `${abbr}: decision recorded`);
  }
  console.log(`# theater colours: validated 32 of 32, every one by an official source (${official}); every role value official-verbatim`);
  assert.equal(official, 32);
  // changes (iteration 5, against d933d84b5e), then the identity pass, chain: each `before` is the previous `after`,
  // and the last `after` is what the map holds now
  const last = new Map();
  for (const c of [...E.changes, ...E.identityChanges]) {
    assert.notEqual(c.before, c.after);
    const k = `${c.abbr}.${c.field}`;
    if (last.has(k)) assert.equal(c.before, last.get(k), `${k}: the chain is unbroken`);
    last.set(k, c.after);
  }
  for (const [k, after] of last) { const [abbr, field] = k.split("."); assert.equal(nflTeamColor(abbr)[field], after, `${k} is now ${after}`); }
  assert.deepEqual([...new Set(E.changes.map((c) => c.abbr))].sort(), ["BAL", "DEN", "HOU", "IND", "JAX", "KC", "NO", "NYG", "NYJ", "PHI", "PIT", "TB", "TEN"]);
  assert.deepEqual(E.identityChanges.map((c) => c.abbr), ["ARI", "ATL", "BAL", "BUF", "DAL", "IND", "LAR", "MIN", "NE", "NYG", "SEA", "SF", "WSH"]);
  assert.ok(E.identityChanges.every((c) => c.field === "accent" && c.after === nflTeamColor(c.abbr).primary));
  assert.equal(E.history.length, 18);
  // every on-field colour: the official value as painted, and the treatment that carries its contrast, recomputed
  assert.ok(!("derivedUi" in E), "no derived (substituted) colour is recorded any more");
  const { turf, panel, page } = fieldSurfaces();
  const r2 = (x) => Math.round(x * 100) / 100;
  const surf = (hex) => ({ turf: r2(Math.min(...turf.map((t) => contrastRatio(hex, t)))), panel: r2(contrastRatio(hex, panel)), page: r2(contrastRatio(hex, page)) });
  const want = TEAMS.flatMap((t) => [["accent", t.accent], ...t.alt.map((h) => ["alternate", h])].map(([role, hex]) => ({ abbr: t.abbr, role, official: hex, onField: hex, fillAlone: surf(hex), keyline: surf(KEYLINE) })));
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
