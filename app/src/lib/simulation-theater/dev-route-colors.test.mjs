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
  NEUTRAL_PALETTE, NFL_TEAM_COLORS, SWAP_MAX_ADJUST, TEAM_COLORS_VALIDATED, TEAM_COLOR_EVIDENCE, TEXT_MIN, UI_MIN, collides,
  contrastRatio, deltaE76, nflTeamColor, theaterPalette,
} from "./nfl-team-colors.mjs";
import { THEATER_TURF_MIX, turfHexes, turfSafeAccent } from "./field-geometry.mjs";
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
  // the Titans: navy trim on Titans blue; red on the field
  const ten = theaterPalette("TEN", "HOU");
  assert.equal(ten.home.trim, "#001532");
  assert.equal(ten.home.accentBase, "#D50A0A");
  // JAX: gold carries the team on the field; on teal neither gold nor black reaches 4.5:1, so the trim is the ink
  const jax = theaterPalette("JAX", "SF");
  assert.equal(jax.home.fill, "#006778");
  assert.equal(jax.home.accent, "#D7A22A");
  assert.equal(jax.home.trim, "#FFFFFF");
  // the evidence file names where each of these came from
  for (const a of ["NO", "PIT", "JAX", "TEN", "TB"]) assert.ok(EVIDENCE.teams[a].decision.length > 80, `${a}: decision recorded`);
  assert.ok(EVIDENCE.teams.TEN.sources.club.names.join(",") === "Titans blue,white,navy,red", "TEN: the brand page's colour proportions");
});

test(`contrast: block text ≥${TEXT_MIN}:1 and on-field accents ≥${UI_MIN}:1 on both turf stripes, the page and the timeline panel, for all 992 pairings`, () => {
  const css = read("src/components/simulation-theater/theater-css.ts");
  assert.match(css, /THEATER_TURF_MIX\.a/, "the stylesheet paints the turf from THEATER_TURF_MIX");
  for (const t of TEAMS) {
    assert.ok(contrastRatio(t.ink, t.primary) >= TEXT_MIN, `${t.abbr} ink ${contrastRatio(t.ink, t.primary).toFixed(2)}`);
    assert.ok(contrastRatio(t.ink, t.primary) >= contrastRatio(t.ink === "#FFFFFF" ? BG : "#FFFFFF", t.primary), `${t.abbr}: the better ink`);
  }
  const min = { text: Infinity, trim: Infinity, turf: Infinity, page: Infinity, panel: Infinity };
  for (const [h, a] of pairs()) {
    const p = theaterPalette(h.abbr, a.abbr);
    assert.equal(p.mode, "team");
    for (const side of ["home", "away"]) {
      const s = p[side];
      const tag = `${a.abbr}@${h.abbr} ${side}`;
      for (const [k, v] of [["text", contrastRatio(s.ink, s.fill)], ["trim", contrastRatio(s.trim, s.fill)]]) {
        assert.ok(v >= TEXT_MIN, `${tag} ${k} ${v.toFixed(2)}`);
        min[k] = Math.min(min[k], v);
      }
      for (const [k, bgHex] of [["turf", TURF[0]], ["turf", TURF[1]], ["page", BG], ["panel", PANEL_2]]) {
        const v = contrastRatio(s.accent, bgHex);
        assert.ok(v >= UI_MIN, `${tag} accent ${s.accent} on ${k} ${v.toFixed(2)}`);
        min[k] = Math.min(min[k], v);
      }
    }
  }
  console.log(`# theater colours: worst block text ${min.text.toFixed(2)}, trim ${min.trim.toFixed(2)}; worst accent on turf ${min.turf.toFixed(2)}, page ${min.page.toFixed(2)}, panel ${min.panel.toFixed(2)}`);
  assert.ok(Math.abs(contrastRatio(nflTeamColor("LAC").ink, nflTeamColor("LAC").primary) - 4.69) < 0.02, "LAC is the review's 4.69 minimum");
});

test("collisions (CIE76 ΔE < 20): identical primaries, secondary or hatch for blocks; accent swap or hatch on the field; every 2026 matchup", () => {
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
    else assert.ok(!collides(p.home.accent, p.away.accent), `${a.abbr}@${h.abbr}: on-field accents distinguishable`);
    if (p.away.accentSwap) {
      n.swap++;
      assert.ok([a.secondary, a.primary, ...a.alt].includes(p.away.accentSwap), "the swap is an official colour of the team");
      assert.ok(deltaE76(p.away.accentSwap, p.away.accent) <= SWAP_MAX_ADJUST);
    }
  }
  console.log(`# theater colours: primary collisions ${primaryHits} of 496; of 992 pairings → away secondary ${n.secondary}, hatched end zone ${n.hatched}, accent swap ${n.swap}, hatched timeline ${n.accentHatched}`);
  assert.equal(n.pairs, 992);
  // Pinned: a change to any of these is a deliberate edit of the map, not drift.
  assert.deepEqual([primaryHits, n.secondary, n.hatched, n.swap, n.accentHatched], [42, 84, 0, 65, 77]);
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
    assert.ok(!collides(p.home.accent, p.away.accent) || p.away.accentHatched, m.matchup);
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

test("evidence file: every source recorded, flags recomputed by the rule, every role an official value, changes and derived accents reproduced", () => {
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
  // changes (iteration 5, against d933d84b5e) and history (iteration 4): each `after` is what the map holds now, or was
  for (const c of E.changes) {
    assert.notEqual(c.before, c.after);
    assert.equal(nflTeamColor(c.abbr)[c.field], c.after, `${c.abbr} ${c.field} is now ${c.after}`);
  }
  assert.deepEqual([...new Set(E.changes.map((c) => c.abbr))].sort(), ["BAL", "DEN", "HOU", "IND", "JAX", "KC", "NO", "NYG", "NYJ", "PHI", "PIT", "TB", "TEN"]);
  assert.equal(E.history.length, 18);
  // every derived on-field accent, recomputed (the official value stays the brand reference)
  const derived = [];
  for (const t of TEAMS) for (const hex of [t.accent, ...t.alt]) {
    const r = turfSafeAccent(hex, TURF, contrastRatio, UI_MIN);
    if (r.derived) derived.push({ abbr: t.abbr, official: hex, onField: r.accent });
    const p = theaterPalette(t.abbr, "SF");
    if (hex === t.accent) assert.equal(p.home.accent, r.accent, `${t.abbr}: the field paints the turf-safe accent`);
  }
  assert.deepEqual(E.derivedUi.map(({ abbr, official: o, onField }) => ({ abbr, official: o, onField })), derived);
  for (const d of E.derivedUi) assert.ok(d.turfRatio >= UI_MIN && d.deltaE >= 0 && d.use, `${d.abbr}: derived use documented`);
  console.log(`# theater colours: derived on-field accents ${derived.map((d) => `${d.abbr} ${d.official}→${d.onField}`).join(", ")}`);
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
