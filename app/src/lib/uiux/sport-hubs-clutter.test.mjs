/**
 * Overnight W8 (2026-10-28) — sport hubs and game pages: clutter and consistency.
 *
 * Source-level guards (the rendered export is not available to unit runs; the rendered guards in this folder still
 * hold the built pages). Each test names the defect it refuses:
 *   - NFL win-chance bars sum to ~97% and nothing said where the rest went → a tie note wherever the bars render;
 *   - the same slate listed three to five times on a hub → one listing of the games;
 *   - developer tokens (model ids, hashes, revision ids, engine names) in the reading path → only inside the one
 *     collapsed "Technical details".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { unassignedTieShare, tieNote, tieNoteForList, TIE_NOTE_THRESHOLD } from "../sports/nfl/tie-note.mjs";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
/** Code with comments stripped — a comment recording a removed sentence must not satisfy or trip a guard. */
const code = (rel) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/** Text between the first `<MoreDisclosure title="Technical details"` and its closing tag. */
function technicalDetails(src) {
  const at = src.indexOf('<MoreDisclosure title="Technical details"');
  if (at < 0) return "";
  return src.slice(at, src.indexOf("</MoreDisclosure>", at));
}

// ── 1 · the NFL tie note ──────────────────────────────────────────────────────────────────────────────────────

test("tie share: stated below 99.5%, silent at or above it, never invented from missing sides", () => {
  assert.equal(TIE_NOTE_THRESHOLD, 0.995);
  assert.ok(Math.abs(unassignedTieShare({ home: 0.648, away: 0.326 }) - 0.026) < 1e-9);
  assert.equal(unassignedTieShare({ home: 0.6, away: 0.395 }), null, "99.5% exactly is not stated");
  assert.equal(unassignedTieShare({ home: 0.6, away: 0.4 }), null);
  assert.equal(unassignedTieShare({ home: 0.6 }), null, "a missing side is not a tie share");
  assert.equal(unassignedTieShare(null), null);
  assert.equal(unassignedTieShare({ home: 1.2, away: -0.4 }), null, "not probabilities");
  assert.equal(tieNote({ home: 0.648, away: 0.326 }), "About 3% chance of a tie after regulation is not assigned to either team.");
  assert.equal(tieNote({ home: 0.6, away: 0.4 }), null);
  assert.equal(tieNote({ home: 0.5, away: 0.494 }), "About 1% chance of a tie after regulation is not assigned to either team.", "never 'about 0%'");
  assert.equal(
    tieNoteForList([{ home: 0.638, away: 0.34 }, { home: 0.499, away: 0.47 }, { home: 0.6, away: 0.4 }, null]),
    "Win chances add up to less than 100%: about 2–3% chance of a tie after regulation is not assigned to either team.",
  );
  assert.equal(tieNoteForList([{ home: 0.6, away: 0.4 }]), null, "nothing to state");
});

test("committed NFL data: every published win-chance pair under 99.5% gets a note, and the note never changes a number", () => {
  const index = JSON.parse(read("public/data/nfl/index.json"));
  let short = 0;
  for (const e of index.events ?? []) {
    const wp = e.winProbability;
    if (!wp) continue;
    const before = JSON.stringify(wp);
    const note = tieNote(wp);
    assert.equal(JSON.stringify(wp), before, "the helper must not touch the published numbers");
    if (wp.home + wp.away < 0.995) {
      short += 1;
      assert.match(note ?? "", /^About \d+% chance of a tie after regulation is not assigned to either team\.$/, `${e.matchup}: no note`);
    } else assert.equal(note, null, `${e.matchup}: a note where nothing is unassigned`);
  }
  assert.ok(short > 0, "the committed slate still carries the ~3% tie share — otherwise this test proves nothing");
});

test("the tie note renders where the NFL bars render: the hub's games, and the game page hero", () => {
  const hub = code("src/app/nfl/page.tsx");
  const games = hub.slice(hub.indexOf('<section id="nfl-games"'), hub.indexOf("</section>", hub.indexOf('<section id="nfl-games"')));
  assert.match(games, /<HubHeader model=\{__hubModel\} \/>[\s\S]*\{weekTieNote \? <p data-tie-note=""/, "under the games' bars");
  assert.match(hub, /tieNoteForList\(__hubModel\.rows\.flatMap/, "from the very splits the cards draw");
  const hero = code("src/components/nfl/forecast/game-hero.tsx");
  assert.match(hero, /const tieLine = tieNote\(r\.winProbability\)/);
  assert.match(hero, /\{tieLine \? <p className="nf-faint" data-tie-note=""/);
  assert.doesNotMatch(hero, /<div style=\{\{ flex: 1, background/, "the home bar no longer silently absorbs the tie share");
});

// ── 2 · one header, one listing ──────────────────────────────────────────────────────────────────────────────

test("NFL hub: one header (no second hero mid-page) and one Technical details", () => {
  const hub = code("src/app/nfl/page.tsx");
  assert.doesNotMatch(hub, /<SportOverviewHero[\s>]/, "no second hero");
  assert.equal((hub.match(/<MoreDisclosure title="Technical details"/g) ?? []).length, 1, "one Technical details");
  assert.doesNotMatch(hub, /title="Model details, coverage and audits"/);
  // The coverage table, calibration, participation, audit and product evaluations live inside it.
  const tech = technicalDetails(hub);
  for (const anchor of ['id="nfl-coverage"', 'id="nfl-audit"', 'id="nfl-product-receipts"', 'id="nfl-products"', "<IntervalCalibrationPanel"]) {
    assert.ok(tech.includes(anchor), `${anchor} sits inside Technical details`);
  }
  // The finals list is folded reference, and its matching rule is said in plain words.
  assert.match(hub, /<MoreDisclosure title="Recent final scores"[\s\S]*id="nfl-results"/);
  /* The JSX before Technical details (the coverage table's rows are data rendered inside it). */
  assert.doesNotMatch(hub.slice(hub.indexOf("\n  return ("), hub.indexOf('<MoreDisclosure title="Technical details"')), /quarantined/, "no 'quarantined' in the reading path");
});

// ── 3 · developer tokens only inside Technical details ───────────────────────────────────────────────────────

test("NFL hub: no ISO or Z timestamps printed — every time on the page is ET", () => {
  const hub = code("src/app/nfl/page.tsx");
  assert.doesNotMatch(hub, /\.slice\(0, 16\)\.replace\("T", " "\)\}Z/, "weather stamp in Z");
  assert.doesNotMatch(hub, /captured \$\{(?:schedule\.generatedAt|markets\.capturedAt)\}/, "raw ISO capture stamps");
  assert.doesNotMatch(hub, /\$\{iso\.slice\(11, 16\)\}Z/, "the capture label printed a Z clock");
  assert.doesNotMatch(hub, /\{etDay\(f\.kickoffUtc\)\} ·/, "the report list printed an ISO day");
});

test("NFL game page: model id, input hash and revision ids sit inside Technical details; the limit and disclaimer stay visible", () => {
  const page = code("src/app/nfl/game/[eventId]/page.tsx");
  const tech = technicalDetails(page);
  assert.ok(tech.length > 0, "the page has a Technical details disclosure");
  for (const token of ["{f.model.id} v{f.model.version}", "{f.model.inputHash}", "archived.graded.revision", "archived.graded.inputHash", "Player-family model provenance"]) {
    assert.ok(tech.includes(token), `${token} is inside Technical details`);
    const outside = page.replace(tech, "");
    assert.ok(!outside.includes(token), `${token} also renders outside Technical details`);
  }
  const after = page.slice(page.indexOf("</MoreDisclosure>", page.indexOf('<MoreDisclosure title="Technical details"')));
  assert.match(after.slice(0, 600), /card\?\.honestLimit/, "the model's measured limit stays visible");
  assert.match(after.slice(0, 900), /\{f\.disclaimer\}/, "the paper-only disclaimer stays visible");
  const panel = code("src/components/nfl/forecast/simulation-panel.tsx");
  const panelTech = technicalDetails(panel);
  assert.match(panelTech, /World Model V2 \{sim\.version\}/, "the engine name reads only in the panel's Technical details");
  assert.ok(!panel.replace(panelTech, "").includes("World Model V2"), "and nowhere else in the panel");
});

test("NFL simulation page: engine version, seed algorithm and receipt id sit inside Technical details; times are ET", () => {
  const report = code("src/components/nfl/simulation-v2-report.tsx");
  const tech = technicalDetails(report);
  for (const token of ["{r.simulationEngine} {r.simulationEngineVersion}", "{r.baseSeed} · {r.seedStrategy}", "{r.simulationReceiptId}"]) {
    assert.ok(tech.includes(token), `${token} is inside Technical details`);
    assert.ok(!report.replace(tech, "").includes(token), `${token} also renders outside it`);
  }
  assert.doesNotMatch(report, /\} UTC`/, "no UTC stamp");
  const after = report.slice(report.indexOf("</MoreDisclosure>"));
  assert.match(after, /Not modelled:[\s\S]*Educational and paper-only; not betting advice\./, "the not-modelled list and disclaimer stay visible");
});
