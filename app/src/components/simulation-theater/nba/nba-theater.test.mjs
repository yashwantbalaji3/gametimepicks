/**
 * NBA theater · components: every interpolated value carries its visible illustrative tag (the iteration-8 audit, shared
 * with the NFL theater), the fixture gate refuses a fixture without its banner, the player panel never pro-rates, the
 * court draws no players / ball / shots / possession, and the stylesheet is tokens-only with no label under 11px.
 * Run: npx tsx --test src/components/simulation-theater/nba/nba-theater.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { untaggedInterp } = await import("../interp-audit.mjs");
const { Scoreboard, DiffTimeline, PlayerPanel, BreakCard, OutcomeChips, SelectionRules } = await import("./nba-parts.tsx");
const { default: NbaCourt } = await import("./NbaCourt.tsx");
const { fixtureGate } = await import("./nba-gate.ts");
const { default: NbaTheaterIsland } = await import("./NbaTheaterIsland.tsx");
const { loadNbaTheater, NBA_FIXTURE_SOURCE, NBA_REAL_TEST_FIXTURE_SOURCE, NBA_THEATER_OFFICIAL_SOURCE } = await import("../../../lib/simulation-theater/nba/loader.mjs");
const { compileTimeline, stateAt } = await import("../../../lib/simulation-theater/nba/timeline.mjs");
const { FIXTURE_BANNER } = await import("../../../lib/simulation-theater/nba/adapter-nba-sim-v1.mjs");
const LABELS = await import("../../../lib/simulation-theater/nba/labels.mjs");
const { BoxScoreBody, default: NbaBoxScoreDialog } = await import("./NbaBoxScore.tsx");
const { NBA_BOX_WATERMARK } = await import("../../../lib/simulation-theater/nba/box-score.mjs");
const { nbaProjectedBox } = await import("../../../lib/simulation-theater/nba/projected-box.mjs");
const LABELS_REP = await import("../../../lib/simulation-theater/representative-labels.mjs");
const { runRole } = LABELS_REP;
const { OfficialForecastCard } = await import("../RepresentativeParts.tsx");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const IDS = ["401909088", "401909089", "401909090"];
const LOADS = IDS.map((id) => loadNbaTheater(REPO, id, { source: NBA_REAL_TEST_FIXTURE_SOURCE, officialSource: NBA_THEATER_OFFICIAL_SOURCE })); // measured against the committed OFFICIAL v0.1 file of the same date; real nba-sim-v1-coherent output (verified copy; TEST FIXTURE since the route reads the committed receipt)
const FIX_LOADS = IDS.map((id) => loadNbaTheater(REPO, id, { source: NBA_FIXTURE_SOURCE })); // synthetic test fixture
const html = (el) => renderToStaticMarkup(el);
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("scoreboard: at every 100 ms of every sample (real v1 and fixture), each interpolated value renders with its visible tag", () => {
  let renders = 0;
  let interp = 0;
  for (const load of [...LOADS, ...FIX_LOADS]) {
    const m = load.manifest;
    for (const s of m.samples.filter((x) => x.validation.ok)) {
      const c = compileTimeline(s);
      for (let t = 0; t <= c.tEnd; t += 100) {
        const f = stateAt(c, t);
        const out = html(React.createElement(Scoreboard, { teams: m.teams, palette: load.palettes.team, frame: f, fixture: m.fixture }));
        renders++;
        assert.deepEqual(untaggedInterp(out), [], `#${s.runIndex} t=${t}`);
        if (f.scoreIllustrative) { assert.match(out, /data-st-interp="score"/); interp++; }
        if (f.clockIllustrative) assert.match(out, /data-st-interp="clock"/);
        if (!f.scoreIllustrative && !f.clockIllustrative) assert.doesNotMatch(out, /data-st-interp=/, "a recorded frame marks nothing");
        assert.match(text(out), /Simulated/);
        assert.doesNotMatch(out, /possession|poss-arrow/i, "no possession arrow");
      }
    }
  }
  assert.ok(interp > 1000, `interpolated frames: ${interp}`);
  console.log(`# NBA scoreboard: ${renders} renders, ${interp} with interpolated values, every one tagged`);
});

test("the audit catches a missing tag (negative control on the real component's markup)", () => {
  const load = LOADS[0];
  const s = load.manifest.samples[0];
  const c = compileTimeline(s);
  const out = html(React.createElement(Scoreboard, { teams: load.manifest.teams, palette: load.palettes.team, frame: stateAt(c, 5000), fixture: true }));
  assert.deepEqual(untaggedInterp(out), []);
  const stripped = out.replace(/ data-st-interp-tag=""/g, "");
  assert.ok(untaggedInterp(stripped).length >= 1, "removing the tag must fail the audit");
  const hidden = out.replace(/data-st-interp-tag=""/, 'data-st-interp-tag="" aria-hidden="true"');
  assert.ok(untaggedInterp(hidden).length >= 1, "a hidden tag must fail the audit");
});

test("timeline: the differential line is drawn only through checkpoints and its tag is visible", () => {
  for (const load of LOADS) {
    const s = load.manifest.samples[0];
    const c = compileTimeline(s);
    const out = html(React.createElement(DiffTimeline, { compiled: c, teams: load.manifest.teams, palette: load.palettes.team, t: 3000, width: 600 }));
    assert.deepEqual(untaggedInterp(out), []);
    const d = out.match(/class="nba-tl-line" d="([^"]+)"/)[1];
    assert.equal((d.match(/[ML]/g) ?? []).length, c.checkpoints.length, "one vertex per checkpoint, nothing in between");
    assert.equal((out.match(/class="nba-tl-dot"/g) ?? []).length, c.checkpoints.length);
    assert.equal((out.match(/class="nba-tl-seg(?: is-[a-z]+)*"/g) ?? []).length, s.periods.length, "one segment per quarter (+OT)");
  }
});

test("fixture gate: a fixture without the exact banner text is refused; with it, the banner renders first", () => {
  const load = FIX_LOADS[1];
  assert.equal(load.manifest.fixture, true);
  assert.equal(fixtureGate(load, null).ok, false);
  assert.equal(fixtureGate(load, "test fixture").ok, false);
  assert.equal(fixtureGate(load, FIXTURE_BANNER).ok, true);
  const refused = html(React.createElement(NbaTheaterIsland, { manifest: load.manifest, palettes: load.palettes, fixtureBanner: null }));
  assert.match(refused, /Refused: test fixture without its banner/);
  assert.doesNotMatch(refused, /nba-court|nba-sb-score|nba-players/, "nothing of the theater renders");
  const ok = html(React.createElement(NbaTheaterIsland, { manifest: load.manifest, palettes: load.palettes, fixtureBanner: FIXTURE_BANNER }));
  assert.match(ok, /data-nba-fixture-banner/);
  assert.ok(ok.indexOf("data-nba-fixture-banner") < ok.indexOf("nba-court"), "the banner comes before the court");
  assert.match(text(ok), /TEST FIXTURE — not model output/);
  assert.deepEqual(untaggedInterp(ok), []);
  // a real (non-fixture) manifest needs no banner
  const real = LOADS[1];
  assert.equal(real.manifest.fixture, false);
  assert.equal(fixtureGate(real, null).ok, true);
  const rh = html(React.createElement(NbaTheaterIsland, { manifest: real.manifest, palettes: real.palettes, fixtureBanner: null }));
  assert.doesNotMatch(rh, /data-nba-fixture-banner/);
  assert.match(text(rh), /run #577 of 10,000/, "real output opens on its typical sample");
});

test("player panel: the sample's final game totals, labelled; during playback it says per-quarter splits are not modelled", () => {
  const load = LOADS[0];
  const s = load.manifest.samples[0];
  const live = text(html(React.createElement(PlayerPanel, { sample: s, teams: load.manifest.teams, palette: load.palettes.team, playing: true, playRates: load.manifest.playRates })));
  assert.match(live, new RegExp(`Final line of run #${s.runIndex.toLocaleString("en-US")}`));
  assert.match(live, /Per-quarter player splits are not modelled/);
  assert.match(live, /never pro-rated/);
  const fin = text(html(React.createElement(PlayerPanel, { sample: s, teams: load.manifest.teams, palette: load.palettes.team, playing: false, playRates: load.manifest.playRates })));
  assert.doesNotMatch(fin, /Per-quarter player splits/);
  // values are exactly the sample's (no scaling): every player's points appear
  for (const p of s.players.home) assert.ok(fin.includes(p.name));
  // v1 player numbers sit beside the model's playRate
  assert.match(fin, /plays \d+%/);
  const fx = FIX_LOADS[0];
  assert.doesNotMatch(text(html(React.createElement(PlayerPanel, { sample: fx.manifest.samples[0], teams: fx.manifest.teams, palette: fx.palettes.team, playing: false, playRates: fx.manifest.playRates }))), /plays \d+%/, "no playRate invented for the fixture");
});

test("cards: halftime shows Q1–Q2 only; final shows every period, leaders, run #, rule, model, inputAsOf, simulations, seed, disclosure", () => {
  const load = LOADS[2];
  const m = load.manifest;
  const s = m.samples.find((x) => x.overtimePeriods > 0);
  const half = text(html(React.createElement(BreakCard, { kind: "HALFTIME", manifest: m, sample: s, palette: load.palettes.team, onDismiss: () => {}, variant: "overlay", idBase: "x" })));
  assert.match(half, /Halftime/);
  assert.doesNotMatch(half, /\bQ3\b/);
  const fin = html(React.createElement(BreakCard, { kind: "FINAL", manifest: m, sample: s, palette: load.palettes.team, onDismiss: () => {}, variant: "overlay", idBase: "x" }));
  const ft = text(fin);
  for (const re of [/Final\/OT/, /\bOT1\b/, /Stat leaders/, new RegExp(`Run #${s.runIndex}`), /nba-sim-v1-coherent/, new RegExp(m.inputAsOf), new RegExp(m.simulations.toLocaleString("en-US")), new RegExp(m.seed), /SIMULATED · quarter checkpoints only/, /Real engine output \(CANDIDATE_SHADOW\)/]) assert.match(ft, re);
  assert.match(fin, /aria-label="Hide the final\/ot card"/, "dismissible");
  const sheet = text(html(React.createElement(BreakCard, { kind: "FINAL", manifest: m, sample: s, palette: load.palettes.team, variant: "sheet", idBase: "x" })));
  assert.match(sheet, /Sample, model and disclosure/, "the phone card folds the details");
});

test("outcome selector lists only present samples; rules and run numbers are available on demand", () => {
  const nyk = FIX_LOADS[1];
  const out = text(html(React.createElement(OutcomeChips, { manifest: nyk.manifest, selected: 0, idBase: "x", vertical: true })));
  assert.doesNotMatch(out, /Upset/);
  assert.match(out, /Typical/);
  assert.match(out, /Run #/);
  const rules = text(html(React.createElement(SelectionRules, { manifest: nyk.manifest })));
  assert.match(rules, /Not in this run Upset/);
});

test("court: regulation SVG with both team ends, and NO player dots, ball, shot marks or possession arrow", () => {
  const load = LOADS[1];
  const out = html(React.createElement(NbaCourt, { palette: load.palettes.team, teams: load.manifest.teams, idPrefix: "c" }));
  assert.match(out, /viewBox="-3 -3 100 56"/);
  assert.equal((out.match(/class="nba-rim"/g) ?? []).length, 2);
  assert.equal((out.match(/class="nba-paint"/g) ?? []).length, 2);
  assert.match(out, /No players, ball or shots are drawn/);
  assert.doesNotMatch(out, /player-dot|nba-ball|shot-|possession/i);
  // the clashing away side (PHI) is patterned: hatched paint, striped band
  assert.match(out, /class="nba-end is-away is-cue"/);
  assert.match(out, /fill="url\(#c-hatch-away\)"/);
});

test("stylesheet: tokens only (no colour literal) and no font under 11px except court SVG text gated by container width", () => {
  const css = fs.readFileSync(path.join(APP, "src/components/simulation-theater/nba/nba-theater.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  const small = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sel = m[1].trim();
    for (const f of m[2].matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) {
      if (Number(f[1]) < 11 && !/nba-band-abbr|nba-wordmark/.test(sel)) small.push(`${sel}: ${f[0]}`);
    }
  }
  assert.deepEqual(small, []);
  // court text is in feet (SVG units): hidden below the width at which it would render under 11px
  const pxPerFt = (w) => w / 100;
  assert.ok(pxPerFt(600) * 2.1 >= 11 && /@container \(max-width:599px\)\{\.nba-band-abbr,\.nba-wordmark\{display:none\}\}/.test(css));
  assert.ok(pxPerFt(860) * 1.3 >= 11 && /@container \(max-width:859px\)\{\.nba-wordmark\.is-sub\{display:none\}\}/.test(css));
  const vars = fs.readFileSync(path.join(APP, "src/components/simulation-theater/nba/nba-theater-css.ts"), "utf8");
  assert.doesNotMatch(vars.replace(/\/\*[\s\S]*?\*\//g, ""), /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
});

// ── integration 2026-10-19: the persistent PRIVATE CANDIDATE banner, and a client graph that names no private source ──
const PRIVATE = "EXPERIMENTAL MODEL — PRIVATE CANDIDATE · SIMULATED QUARTER SCORES · NOT A FORECAST";

test("private-candidate banner: exact text, FIRST in the theater for real data, the fixture and every refusal; never dismissible", () => {
  assert.equal(LABELS.NBA_PRIVATE_BANNER, PRIVATE);
  const first = (h) => {
    const i = h.indexOf('data-nba-private-banner=""');
    assert.ok(i > 0, "banner present");
    for (const other of ["data-nba-fixture-banner", "Simulation disclosure", "nba-scoreboard", "nba-unavailable", "Representative outcomes"]) {
      const j = h.indexOf(other);
      if (j >= 0) assert.ok(i < j, `banner precedes ${other}`);
    }
    assert.ok(text(h).includes(PRIVATE));
  };
  for (const load of LOADS) first(html(React.createElement(NbaTheaterIsland, { manifest: load.manifest, palettes: load.palettes, fixtureBanner: null })));
  first(html(React.createElement(NbaTheaterIsland, { manifest: FIX_LOADS[0].manifest, palettes: FIX_LOADS[0].palettes, fixtureBanner: FIXTURE_BANNER })));
  first(html(React.createElement(NbaTheaterIsland, { manifest: FIX_LOADS[0].manifest, palettes: FIX_LOADS[0].palettes, fixtureBanner: null })));
  const section = fs.readFileSync(path.join(APP, "src/components/simulation-theater/nba/NbaTheaterSection.tsx"), "utf8");
  assert.match(section, /<PrivateCandidateBanner \/>\s*<NbaUnavailable/, "the section's refusal state carries it too");
  const parts = fs.readFileSync(path.join(APP, "src/components/simulation-theater/nba/nba-parts.tsx"), "utf8");
  const banner = parts.slice(parts.indexOf("export function PrivateCandidateBanner"), parts.indexOf("/** The fixture banner."));
  assert.ok(banner.length > 50);
  assert.doesNotMatch(banner, /button|onClick|useState|dismiss/i, "never dismissible");
  assert.doesNotMatch(banner, /nba-scoreboard|nba-team|st-bug/);
  // visually distinct from the scoreboard: its own hatched, dashed class, no team fill, no scoreboard numerals
  const css = fs.readFileSync(path.join(APP, "src/components/simulation-theater/nba/nba-theater.css"), "utf8");
  const rule = css.match(/\.nba-private\{[^}]*\}/)?.[0] ?? "";
  assert.match(rule, /dashed/);
  assert.match(rule, /repeating-linear-gradient/);
  assert.doesNotMatch(rule, /--nba-fill|--nba-ink|tabular-nums/);
});

test("the NBA client modules import only client-safe labels: no engine id, artifact name or private data path in the island's graph", () => {
  const CLIENT = ["NbaTheaterIsland.tsx", "nba-parts.tsx", "NbaCourt.tsx", "nba-gate.ts", "nba-theater-css.ts"].map((f) => path.join(APP, "src/components/simulation-theater/nba", f));
  const seen = new Set();
  const stack = [...CLIENT];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of fs.readFileSync(f, "utf8").matchAll(/^import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)) {
      if (m[1]) continue; // type-only imports are erased
      const spec = m[2];
      const base = spec.startsWith("@/") ? path.join(APP, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(f), spec) : null;
      if (!base) continue;
      const hit = [base, `${base}.tsx`, `${base}.ts`, `${base}.mjs`].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
      if (hit) stack.push(hit);
    }
  }
  const rel = [...seen].map((f) => path.relative(APP, f)).sort();
  assert.ok(!rel.some((f) => /adapter-nba-sim-v1|nba\/loader\.mjs|validate-sample/.test(f)), `client graph: ${rel.join(", ")}`);
  for (const f of seen) {
    const src = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(src, /nba-sim-v1-coherent|data\/internal\/research\/nba|experimental-v1/, path.relative(APP, f));
  }
  // Lane A-NBA 2026-10-20: the box score is in that graph (so the same scan covers it), via the island
  assert.ok(rel.includes(path.join("src/components/simulation-theater/nba/NbaBoxScore.tsx")), rel.join(", "));
  assert.ok(rel.includes(path.join("src/lib/simulation-theater/nba/box-score.mjs")), rel.join(", "));
  assert.ok(rel.includes(path.join("src/lib/simulation-theater/nba/projected-box.mjs")), "V2: the three-layer box score is scanned too");
});

// ── Lane A-NBA 2026-10-20 / V2: the THREE-LAYER Projected Box Score (projected-box.mjs) ─────────────────────────────
const SIM_LABELS = ["MIN", "PTS", "REB", "AST", "3PM", "3PA", "2PM", "FGM", "FTM"];
const NM_LABELS = ["FGA", "FTA", "STL", "BLK", "TO"];
const hypOf = (m, s) => runRole(m, s.runIndex, s.title).hypothetical;
const pbox = (m, s, h = hypOf(m, s)) => nbaProjectedBox(s, m, { hypothetical: h });
/** The <tr> of one player in one rendered table (its HTML), by name. */
const rowHtml = (out, name) => out.split("<tr").find((tr) => tr.includes(`<span class="nba-bx-pname">${name}</span>`)) ?? "";
/** The coordinator's snapshot shape (team scores WITHHELD; v0.1 families incl. minutes and combos). */
function withheldShape(m) {
  const x = JSON.parse(JSON.stringify(m));
  x.representative.official.team = { home: null, away: null, margin: null, total: null };
  x.representative.official.teamScores = { state: "WITHHELD", reason: "the official side model and the supporting simulation disagree" };
  x.representative.official.winnerSide = "home";
  for (const p of Object.values(x.representative.players)) {
    p.families.minutes = { expected: 31.25, median: 31.5 };
    p.families.pra = { expected: 22.25, median: 21.5 };
    p.families.ptsReb = { expected: 17.75, median: 17.5 };
    p.families.ptsAst = { expected: 16.25, median: 16 };
  }
  return x;
}

test("box score: watermark first, both teams, three labelled layers, sortable columns with aria-sort, DNP ≠ 0, n/m, provenance", () => {
  let rendered = 0;
  for (const load of LOADS) {
    const m = load.manifest;
    for (const s of m.samples) {
      const r = pbox(m, s, false);
      assert.equal(r.ok, true);
      const out = html(React.createElement(BoxScoreBody, { result: r, palette: load.palettes.team, idBase: "b", manifest: m }));
      const t = text(out);
      rendered++;
      // the watermark: exact text, before any number of the box score
      assert.ok(out.includes(NBA_BOX_WATERMARK));
      assert.equal(NBA_BOX_WATERMARK, "PROJECTED · SIMULATED · NOT ACTUAL GAME STATISTICS · PRIVATE CANDIDATE MODEL");
      assert.ok(out.indexOf("data-nba-boxscore-watermark") < out.indexOf("nba-bx-table"));
      // header facts
      assert.match(t, new RegExp(`SIMULATED FINAL${s.overtimePeriods ? "/OT" : ""} ${m.teams.away.abbr} @ ${m.teams.home.abbr} · run #${s.runIndex.toLocaleString("en-US")} of 10,000`));
      for (const re of [new RegExp(m.modelVersion), new RegExp(m.inputAsOf), /One selected simulated run \(not a median, not an actual game\)/]) assert.match(t, re);
      // quarter-by-quarter incl. OT (simulated layer)
      for (const p of s.periods) assert.match(out, new RegExp(`<th scope="col"( class="is-ot")?>${p.label}</th>`));
      assert.match(out, /<table class="nba-linescore nba-bx-linescore" data-layer="simulated">/);
      // both teams, each a real table with caption, layer group headers, column headers and row headers
      assert.equal((out.match(/class="nba-bx-table nba-px-table"/g) ?? []).length, 2);
      assert.equal((out.match(/data-nba-boxscore-team="(away|home)"/g) ?? []).length, 2);
      assert.equal((out.match(/<caption class="st-sr">[^<]*Official projection \(median\) and Simulated game — one run — simulated run #/g) ?? []).length, 2);
      assert.equal((out.match(/<th scope="colgroup" colSpan="4" class="nba-px-layerhead" data-layer="official">Official projection · median<\/th>/gi) ?? []).length, 2);
      assert.equal((out.match(/<th scope="colgroup" colSpan="9" class="nba-px-layerhead" data-layer="simulated">Simulated game — one run<\/th>/gi) ?? []).length, 2);
      assert.equal((out.match(/<th scope="colgroup" colSpan="5" class="nba-px-layerhead" data-layer="not-modelled">Not modelled<\/th>/gi) ?? []).length, 2);
      for (const label of SIM_LABELS) assert.equal((out.match(new RegExp(`data-layer="simulated" data-modeled="MODELED"[^>]*><button type="button" class="nba-bx-sort"[^>]*>${label}<`, "g")) ?? []).length, 2, label);
      for (const label of ["PTS", "REB", "AST", "3PM"]) assert.equal((out.match(new RegExp(`data-layer="official"[^>]*><button type="button" class="nba-bx-sort" title="[^"]+ · Official projection">${label}<`, "g")) ?? []).length, 2, `official ${label}`);
      for (const label of NM_LABELS) assert.equal((out.match(new RegExp(`data-layer="not-modelled"><abbr class="nba-px-nmhead" title="${label}: not modelled[^"]*">${label}</abbr>`, "g")) ?? []).length, 2, `n/m ${label}`);
      assert.doesNotMatch(out, /<button[^>]*>(FGA|FG%|FTA|STL|BLK|TOV|TO|PF|OREB|DREB|\+\/-)</, "no unmodeled column is sortable or filled");
      // default sort: simulated minutes descending, marked with aria-sort on exactly that header (one per table)
      assert.equal((out.match(/aria-sort="descending"/g) ?? []).length, 2);
      assert.equal((out.match(/aria-sort="ascending"/g) ?? []).length, 0);
      assert.match(out, /<th scope="col" aria-sort="descending" data-layer="simulated" data-modeled="MODELED" class="is-sorted is-first"><button type="button" class="nba-bx-sort" title="Minutes \(0\.01\) · Simulated game — one run">MIN/);
      // rows: every simulated player, DNPs as DNP (no number), not-simulated with the reason
      const nRows = s.players.home.length + s.players.away.length + m.rosterNotSimulated.home.length + m.rosterNotSimulated.away.length;
      assert.equal((out.match(/<tr[^>]*data-status="(played|dnp|not-simulated)"/g) ?? []).length, nRows);
      const dnp = s.players.home.concat(s.players.away).filter((p) => p.minutes === 0).length;
      assert.equal((out.match(/data-status="dnp"/g) ?? []).length, dnp);
      assert.equal((out.match(/<abbr title="Did not play: 0 modeled minutes in this run">DNP<\/abbr>/g) ?? []).length, dnp);
      assert.match(t, /Not simulated · no usable game history/);
      // not-modelled cells: n/m on every row and the totals, never a number
      assert.equal((out.match(/<td class="nba-px-nm" data-layer="not-modelled"[^>]*><span aria-hidden="true">n\/m<\/span><span class="st-sr">not modelled<\/span><\/td>/g) ?? []).length, 5 * (nRows + 2));
      // groups: estimated starters / bench, DNP, availability — estimated groups say so
      assert.match(t, /Likely starters · estimated · Estimated from recent starts · not a recorded lineup · not official/);
      assert.match(out, /<th scope="rowgroup" colSpan="\d+" data-layer="estimated">/);
      assert.match(t, /Not simulated · availability/);
      assert.match(t, /Starter \(est\.\)/);
      // totals: simulated minutes and points; official PTS from the official team term, other official columns not summed
      assert.match(out, /<tfoot><tr><th scope="row" class="nba-bx-name">Team<\/th><td class="nba-px-role"><\/td><td class="nba-px-off is-first" data-layer="official" data-nba-official-team="AVAILABLE">[\d.]+<\/td>(<td class="nba-px-off" data-layer="official"><span aria-hidden="true">—<\/span><span class="st-sr">player projections are not summed into a team total<\/span><\/td>){3}<td class="is-first" data-layer="simulated">(240|265)<\/td><td class="is-pts" data-layer="simulated">\d+<\/td>/);
      // the explanation, the official game line, leaders, not modeled, provenance
      for (const re of [/One simulated game is not the median/, /Official projection · game/, /Top scorer/, /Top rebounder/, /Top assister/, /Not modeled · not shown/, /FGA · FG% · 2PA/, /Starter \/ bench/, /n\/m = not modelled/]) assert.match(t, re);
      assert.match(out, /data-nba-boxscore-provenance=""[^>]*>Run #[\d,]+ of 10,000/);
      assert.match(t, /checked: [A-Z_, ]*TEAM_FGM[A-Z_, ]*FGM_SUM/);
      assert.match(t, /dev copy sha256 c4612dc4… verified/);
      assert.deepEqual(untaggedInterp(out), [], "nothing on the box score is interpolated");
    }
  }
  assert.equal(rendered, 15);
});

test("box score: the official cell is the snapshot's exact value; a played zero renders 0; a DNP keeps its official projection; PTS ascending flips aria-sort; DNP group after played", () => {
  const load = LOADS[0];
  const m = load.manifest;
  const s = m.samples[0];
  const r = pbox(m, s, false);
  const out = html(React.createElement(BoxScoreBody, { result: r, palette: load.palettes.team, idBase: "b", sort: { layer: "simulated", key: "pts", dir: "asc" } }));
  assert.equal((out.match(/aria-sort="ascending"/g) ?? []).length, 2);
  assert.match(out, /aria-sort="ascending" data-layer="simulated" data-modeled="MODELED" class="is-sorted"><button type="button" class="nba-bx-sort" title="Points · Simulated game — one run">PTS/);
  // in each table, the DNP and availability groups follow every played group
  for (const tbl of out.split('class="nba-bx-table nba-px-table"').slice(1)) {
    const groups = [...tbl.split("<tfoot>")[0].matchAll(/data-nba-px-group="([a-z]+)"/g)].map((x) => x[1]);
    const firstOff = groups.findIndex((g) => g === "dnp" || g === "unavailable");
    assert.ok(firstOff < 0 || groups.slice(firstOff).every((g) => g === "dnp" || g === "unavailable"), groups.join(","));
  }
  // a played row with 0 assists shows the digit 0 in the simulated AST cell
  const rows = ["home", "away"].flatMap((side) => r.box.teams[side].groups.flatMap((g) => g.rows));
  const zero = rows.find((x) => x.status === "played" && x.simulated.ast === 0);
  assert.ok(zero, "this sample has a played player with 0 assists");
  const simTds = [...rowHtml(out, zero.name).matchAll(/<td[^>]*data-layer="simulated"[^>]*>([^<]*)<\/td>/g)].map((x) => x[1]);
  assert.equal(simTds[3], "0", simTds.join("|"));
  // official cells print the snapshot value exactly (two decimals at most, never rounded to the run's whole number)
  const withOff = rows.find((x) => x.status === "played" && x.official && !Number.isInteger(x.official.values.pts.median ?? 0)) ?? rows.find((x) => x.official);
  const offTd = rowHtml(out, withOff.name).match(/data-nba-official="pts" title="Official projection: median ([^ ]+) · mean ([^"]+)">([^<]+)<\/td>/);
  assert.ok(offTd, rowHtml(out, withOff.name));
  assert.equal(offTd[3], LABELS_REP.fmtExpectation(m.representative.players[withOff.providerAthleteId].families.pts.median));
  assert.equal(offTd[2], LABELS_REP.fmtExpectation(m.representative.players[withOff.providerAthleteId].families.pts.expected));
  // a DNP in this run still shows its official projection (the forecast does not change with the run)
  const dnp = rows.find((x) => x.status === "dnp" && x.official);
  if (dnp) assert.match(rowHtml(out, dnp.name), /data-nba-official="pts"[^>]*>[\d.]+<\/td>.*<abbr title="Did not play/);
});

test("what-if rule (UI): choosing any hypothetical run never changes an official number — official cells, game line and key are byte-identical across runs", () => {
  for (const load of LOADS) {
    const m = load.manifest;
    const officialBits = (out) => [
      ...out.matchAll(/<td[^>]*data-layer="official"[^>]*>.*?<\/td>/g),
      ...out.matchAll(/<section class="nba-px-official"[\s\S]*?<\/section>/g),
      ...out.matchAll(/data-nba-official-key="[0-9a-f]+"/g),
    ].map((x) => x[0]).join("\n");
    // sort by athlete name in both tables so row order is identical whatever the run
    const render = (s, h) => html(React.createElement(BoxScoreBody, { result: pbox(m, s, h), palette: load.palettes.team, idBase: "w", sort: { layer: "official", key: "pts", dir: "desc" } }));
    const offRun = m.samples.find((s) => s.runIndex === m.representative.officialRunIndex);
    const ref = officialBits(render(offRun, false)).replace(/<tr[^>]*>/g, "");
    let whatIfs = 0;
    for (const s of m.samples) {
      const h = hypOf(m, s);
      if (h) whatIfs++;
      const out = render(s, h);
      // per-player official cells: compare as a multiset keyed by row (DNP grouping can move a row between tbodies)
      const cells = (o) => o.split("<tr").filter((tr) => tr.includes('data-status="')).map((tr) => `${tr.match(/nba-bx-pname">([^<]+)/)?.[1]}|${[...tr.matchAll(/data-nba-official="[^"]+"[^>]*>[^<]*/g)].map((x) => x[0]).join(",")}`).sort();
      assert.deepEqual(cells(out), cells(render(offRun, false)), `${load.eventId} #${s.runIndex}: official cells moved`);
      assert.equal(out.match(/<section class="nba-px-official"[\s\S]*?<\/section>/)[0], render(offRun, false).match(/<section class="nba-px-official"[\s\S]*?<\/section>/)[0]);
      assert.equal(out.match(/data-nba-official-key="([0-9a-f]+)"/)[1], render(offRun, false).match(/data-nba-official-key="([0-9a-f]+)"/)[1]);
      if (h) {
        assert.match(out, /data-st-whatif-banner="">Hypothetical scenario — not the forecast/);
        assert.match(text(out), /This is a hypothetical what-if run\. Choosing it changes only the simulated-game columns; the official projection columns are the same for every run\./);
        assert.match(out, /data-layer="simulated">Simulated game — one run · what-if<\/th>/);
      }
    }
    assert.ok(whatIfs >= 3);
    assert.ok(ref.length > 100);
    // the theater's own official card reads the manifest only: rendering it after every box score gives the same bytes
    const card = html(React.createElement(OfficialForecastCard, { manifest: m, teams: m.teams }));
    for (const s of m.samples) { pbox(m, s); assert.equal(html(React.createElement(OfficialForecastCard, { manifest: m, teams: m.teams })), card); }
  }
});

test("coordinator snapshot: team scores WITHHELD render 'Withheld' and no team number; MIN / PRA / P+R / P+A official columns appear", () => {
  const load = LOADS[2];
  const m = withheldShape(load.manifest);
  const s = m.samples[0];
  const out = html(React.createElement(BoxScoreBody, { result: pbox(m, s), palette: load.palettes.team, idBase: "c", manifest: m }));
  const t = text(out);
  assert.match(out, /data-nba-px-teamscore="WITHHELD"><b class="nba-px-withheld">Withheld<\/b> · the official side model and the supporting simulation disagree/);
  assert.equal((out.match(/data-nba-official-team="WITHHELD"><span class="nba-px-withheld">Withheld<\/span>/g) ?? []).length, 2);
  assert.doesNotMatch(out, /data-st-compare=""/, "no official-vs-run team comparison when the official team score is withheld");
  assert.match(out, /data-nba-px-favoured="">SA</);
  assert.equal((out.match(/<th scope="colgroup" colSpan="8" class="nba-px-layerhead" data-layer="official">/g) ?? []).length, 2);
  for (const label of ["MIN", "PRA", "P\\+R", "P\\+A"]) assert.equal((out.match(new RegExp(`data-layer="official"[^>]*><button type="button" class="nba-bx-sort"[^>]*>${label}<`, "g")) ?? []).length, 2, label);
  assert.match(out, /data-nba-official="minutes" title="Official projection: median 31\.50 · mean 31\.25">31\.50<\/td>/);
  assert.match(t, /SIMULATED FINAL/, "the simulated game is unchanged");
});

test("layer view and statistic: official-only hides simulated and n/m; simulated-only hides official; mean prints means; controls are native radios", () => {
  const load = LOADS[1];
  const m = load.manifest;
  const r = pbox(m, m.samples[0], false);
  const only = (view, stat = "median") => html(React.createElement(BoxScoreBody, { result: r, palette: load.palettes.team, idBase: "v", view, stat }));
  const off = only("official");
  assert.doesNotMatch(off, /<td[^>]*data-layer="(simulated|not-modelled)"/);
  assert.match(off, /<td[^>]*data-layer="official"/);
  assert.match(off, /data-nba-px-view="official"/);
  const sim = only("simulated");
  assert.doesNotMatch(sim, /<td[^>]*data-layer="official"/);
  assert.match(sim, /<td class="nba-px-nm" data-layer="not-modelled"/);
  const mean = only("both", "mean");
  assert.match(mean, /data-layer="official">Official projection · mean<\/th>/);
  const row = r.box.teams.home.groups[0].rows.find((x) => x.official?.values?.pts);
  assert.match(rowHtml(mean, row.name), new RegExp(`data-nba-official="pts"[^>]*>${LABELS_REP.fmtExpectation(row.official.values.pts.mean).replace(".", "\\.")}</td>`));
  // controls: two fieldsets with legends, radios grouped by name, the checked one marked
  const both = only("both");
  assert.match(both, /<fieldset class="nba-px-fs"><legend>Show columns<\/legend>/);
  assert.match(both, /<fieldset class="nba-px-fs"><legend>Official statistic<\/legend>/);
  assert.equal((both.match(/<input type="radio" name="v-view"/g) ?? []).length, 3);
  assert.equal((both.match(/<input type="radio" name="v-stat"/g) ?? []).length, 2);
  assert.match(both, /<input type="radio" name="v-view" checked="" value="both"/);
  // no official forecast: the official view is disabled and the tables fall back to the simulated layer
  const bare = JSON.parse(JSON.stringify(m));
  delete bare.representative;
  const none = html(React.createElement(BoxScoreBody, { result: nbaProjectedBox(bare.samples[0], bare, { hypothetical: true }), palette: load.palettes.team, idBase: "n", view: "official" }));
  assert.match(none, /<input type="radio" name="n-view"[^>]*(disabled=""[^>]*value="official"|value="official"[^>]*disabled="")/);
  assert.match(none, /data-nba-px-view="simulated"/);
  assert.match(none, /data-nba-px-official="none"/);
});

test("box score dialog: role=dialog, aria-modal, labelled and described; Close button; nothing when closed; unavailable fails closed", () => {
  const load = LOADS[2];
  const s = load.manifest.samples[0];
  const r = pbox(load.manifest, s, false);
  const open = html(React.createElement(NbaBoxScoreDialog, { open: true, onClose: () => {}, result: r, palette: load.palettes.team, compact: false, runKey: "k" }));
  assert.match(open, /role="dialog" aria-modal="true" aria-labelledby="[^"]+-title" aria-describedby="[^"]+-wm" data-nba-boxscore=""/);
  assert.match(open, /<h2 id="[^"]+-title" class="nba-bx-title">Projected box score · official representative simulation<\/h2>/);
  // a what-if run's dialog is never "projected": hypothetical title, banner and watermark (consistency 2026-10-20)
  const wi = html(React.createElement(NbaBoxScoreDialog, { open: true, onClose: () => {}, result: pbox(load.manifest, s, true), palette: load.palettes.team, compact: false, runKey: "k", manifest: load.manifest }));
  assert.match(wi, /<h2 id="[^"]+-title" class="nba-bx-title">What-if box score · hypothetical<\/h2>/);
  assert.match(text(wi), /Hypothetical scenario — not the forecast/);
  assert.match(text(wi), /HYPOTHETICAL SCENARIO · NOT THE FORECAST/);
  assert.doesNotMatch(wi, /projected/i, "no \"projected\" anywhere in a what-if box score, captions included (\"Official projection\" is the official layer's name)");
  assert.match(open, /<button type="button" class="st-btn nba-bx-close" aria-keyshortcuts="Escape">Close<\/button>/);
  assert.match(text(open), /SIMULATED FINAL\/OT · OKC @ SA · run #245/);
  const sheet = html(React.createElement(NbaBoxScoreDialog, { open: true, onClose: () => {}, result: r, palette: load.palettes.team, compact: true, runKey: "k" }));
  assert.match(sheet, /class="nba-bx-dialog is-sheet"/);
  assert.equal(html(React.createElement(NbaBoxScoreDialog, { open: false, onClose: () => {}, result: r, palette: load.palettes.team, compact: false, runKey: "k" })), "");
  // a failed box score: the codes, no player table, no numbers from the run
  const bad = JSON.parse(JSON.stringify(s));
  bad.players.home[0].pts += 1;
  const failed = nbaProjectedBox(bad, load.manifest);
  assert.equal(failed.ok, false);
  const fo = html(React.createElement(NbaBoxScoreDialog, { open: true, onClose: () => {}, result: failed, palette: load.palettes.team, compact: false, runKey: "k" }));
  assert.match(fo, /data-nba-boxscore-unavailable/);
  assert.match(text(fo), /Box score unavailable/);
  assert.match(fo, /<code>PLAYER_PTS_SUM<\/code>/);
  assert.doesNotMatch(fo, /nba-bx-table|aria-describedby|data-layer="official"/);
});

test("box score entry points: a 'Box score' control in the theater at any time, and a button on the FINAL card only", () => {
  for (const load of LOADS) {
    const out = html(React.createElement(NbaTheaterIsland, { manifest: load.manifest, palettes: load.palettes, fixtureBanner: null }));
    assert.match(out, /<button type="button" class="st-btn nba-boxbtn" aria-haspopup="dialog">Box score<\/button>/);
    assert.doesNotMatch(out, /data-nba-boxscore=""/, "the dialog is closed until asked for");
  }
  const load = LOADS[1];
  const s = load.manifest.samples[0];
  const fin = html(React.createElement(BreakCard, { kind: "FINAL", manifest: load.manifest, sample: s, palette: load.palettes.team, onDismiss: () => {}, variant: "sheet", idBase: "x", onOpenBoxScore: () => {} }));
  assert.match(fin, /<button type="button" class="st-btn nba-card-boxbtn" aria-haspopup="dialog">Projected box score<\/button>/);
  const half = html(React.createElement(BreakCard, { kind: "HALFTIME", manifest: load.manifest, sample: s, palette: load.palettes.team, onDismiss: () => {}, variant: "overlay", idBase: "x", onOpenBoxScore: () => {} }));
  assert.doesNotMatch(half, /nba-card-boxbtn/, "the halftime card offers no final box score");
});

test("box score styles: sticky player column, horizontal scroll, tabular numerals, 44 px sort targets, full-height phone sheet", () => {
  const css = fs.readFileSync(path.join(APP, "src/components/simulation-theater/nba/nba-theater.css"), "utf8");
  assert.match(css, /\.nba-bx-name\{position:sticky;left:0;/);
  assert.match(css, /\.nba-bx-scroll\{[^}]*overflow-x:auto/);
  assert.match(css, /\.nba-bx-table\{[^}]*font-variant-numeric:tabular-nums/);
  assert.match(css, /\.nba-bx-sort\{[^}]*min-width:44px;min-height:44px/);
  assert.match(css, /@media \(max-width:719px\)\{\s*\.nba-bx-backdrop\{padding:0;align-items:stretch\}\s*\.nba-bx-dialog\{width:100%;max-height:none;height:100%/);
  assert.doesNotMatch(css, /data-nba-boxscore|PRIVATE CANDIDATE MODEL|nba-box-score@|nba-projected-box@|data-nba-px-/, "no export-boundary marker in the CSS (CSS ships un-pruned)");
  // V2: 44 px radio targets with a visible keyboard focus ring; the official layer has a non-colour cue too (its own
  // header text and a left rule in the legend); reduced motion turns off transitions, animations and smooth scrolling
  assert.match(css, /\.nba-px-radio\{[^}]*min-height:44px/);
  assert.match(css, /\.nba-px-radio input:focus-visible\{outline:2px solid var\(--lava-heat\)/);
  assert.match(css, /\.nba-bx-sort:focus-visible\{outline:2px solid/);
  assert.match(css, /\.nba-bx-scroll:focus-visible\{outline:2px solid/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\{\.nba-root \*\{transition:none!important;animation:none!important;scroll-behavior:auto!important\}\}/);
  assert.match(css, /\.nba-px-grouplabel\{position:sticky;left:8px/);
});
