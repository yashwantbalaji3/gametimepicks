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
const { loadNbaTheater, NBA_FIXTURE_SOURCE } = await import("../../../lib/simulation-theater/nba/loader.mjs");
const { compileTimeline, stateAt } = await import("../../../lib/simulation-theater/nba/timeline.mjs");
const { FIXTURE_BANNER } = await import("../../../lib/simulation-theater/nba/adapter-nba-sim-v1.mjs");
const LABELS = await import("../../../lib/simulation-theater/nba/labels.mjs");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const IDS = ["401909088", "401909089", "401909090"];
const LOADS = IDS.map((id) => loadNbaTheater(REPO, id)); // real nba-sim-v1-coherent output (verified dev copy)
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
});
