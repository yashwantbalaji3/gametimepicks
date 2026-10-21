/**
 * NBA Theater · POSSESSION PLAYBACK (components, server render): labels, the two panels, official-panel immutability
 * across runs, the box-score columns, the stylesheet guards, and the FLAG-ON public render (simulated with the pure
 * functions + renderToStaticMarkup — the committed flag stays OFF) carrying no private marker beyond the allowlist.
 * Run: npx tsx --test src/components/simulation-theater/nba/possession/possession-render.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: Island } = await import("./NbaPossessionTheater.tsx");
const { OfficialProjectionPanel } = await import("./possession-parts.tsx");
const { loadNbaPossessionTheater } = await import("../../../../lib/simulation-theater/nba/possession/possession-loader.mjs");
const LABELS = await import("../../../../lib/simulation-theater/nba/possession/labels.mjs");
const { BOX_COLUMNS } = await import("../../../../lib/simulation-theater/nba/possession/box.mjs");
const { nbaPublicTheaterOn, nbaPublicTheaterParams } = await import("../../../../lib/simulation-theater/nba/possession/public-route.mjs");
const { NBA_PRIVATE_MARKERS, NBA_THEATER_FLAG_ON_ALLOWLIST, scanExportForNbaPrivate } = await import("../../../../lib/simulation-theater/nba/export-boundary.mjs");
const REP = await import("../../../../lib/simulation-theater/representative-labels.mjs");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const IDS = ["401909088", "401909089", "401909090"];
const LOADS = IDS.map((id) => loadNbaPossessionTheater(REPO, id));
const html = (el) => renderToStaticMarkup(el);
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const render = (load, initialKind = null) => html(React.createElement(Island, { payload: load.payload, palettes: load.palettes, initialKind }));
const officialSection = (h) => {
  const i = h.indexOf('<section class="nbp-panel is-official"');
  assert.ok(i >= 0, "official panel present");
  return h.slice(i, h.indexOf("</section>", i) + "</section>".length);
};

test("every game renders: banner first, the honest engine label, the official panel and the simulation outcome panel", () => {
  for (const load of LOADS) {
    assert.equal(load.ok, true, JSON.stringify(load.error));
    const h = render(load);
    const b = h.indexOf("data-nbp-banner");
    assert.ok(b > 0);
    for (const later of ["data-nbp-official", "data-nbp-outcome", "data-nbp-scoreboard", "data-nbp-feed"]) assert.ok(h.indexOf(later) > b, `banner precedes ${later}`);
    const t = text(h);
    assert.ok(t.includes(LABELS.POSSESSION_BANNER.replace(/'/g, "'")));
    assert.ok(t.includes("Possession-level research simulation (nba-possession-sim-v0) — not the official forecast"));
    assert.ok(t.includes(LABELS.OFFICIAL_PANEL_TITLE) && t.includes(LABELS.OUTCOME_PANEL_TITLE));
    assert.ok(t.includes(LABELS.WHAT_IS_REAL.replace(/'/g, "'")), "what is real possession generation vs decorative is stated");
    assert.ok(t.includes("Decorative court"));
    for (const x of LABELS.POSSESSION_NOT_MODELLED) assert.ok(t.includes(x.replace(/'/g, "'")), x);
    // never claims to be the official forecast or the official representative simulation
    assert.doesNotMatch(t, /Official representative simulation|Official Representative Simulation/);
    // server render = tip-off, paused: scoreboard 0–0, Q1 12:00, Play button
    assert.match(h, /data-nbp-phase="LIVE"/);
    assert.match(t, /Q1 12:00/);
    assert.match(h, /data-nbp-play-toggle="">Play</);
  }
});

test("official panel: the canonical snapshot only — favoured side, model, freeze; win probability, scores, ranges and markets say Withheld", () => {
  for (const load of LOADS) {
    const sec = officialSection(render(load));
    const t = text(sec);
    const fav = load.payload.official.favouredSide === "HOME" ? load.payload.teams.home : load.payload.teams.away;
    assert.ok(t.includes(`${fav.name} (${fav.abbr}`));
    assert.ok(t.includes("Elo rating"));
    assert.ok((t.match(/Withheld/g) ?? []).length >= 5, "win probability, score, margin/total, ranges, markets withheld");
    assert.doesNotMatch(t, /\d+\.\d%/, "no win probability printed");
    assert.ok(t.includes(load.payload.official.models.game));
    assert.match(t, /Frozen 2026-10-20 \d\d:\d\d UTC/);
    assert.ok(sec.includes(`data-nbp-official="${load.payload.official.snapshotId}"`));
  }
});

test("official panel immutability: byte-identical markup for the default run and every what-if (and as a standalone part)", () => {
  for (const load of LOADS) {
    const kinds = load.payload.runs.map((r) => r.kind);
    assert.ok(kinds.length >= 4);
    const base = officialSection(render(load));
    const alone = html(React.createElement(OfficialProjectionPanel, { official: load.payload.official, teams: load.payload.teams }));
    assert.equal(alone, base);
    for (const k of kinds) {
      const h = render(load, k);
      assert.match(h, new RegExp(`data-nbp-run="${k}"`));
      assert.equal(officialSection(h), base, `${load.eventId}: switching to ${k} changed the official panel`);
    }
  }
});

test("default run is labelled a supporting-simulation run; every what-if carries the hypothetical banner", () => {
  for (const load of LOADS) {
    const d = text(render(load));
    assert.ok(d.includes(REP.SUPPORTING_RUN_TITLE));
    assert.match(render(load), /data-nbp-role="default"/);
    for (const r of load.payload.runs.filter((x) => x.hypothetical)) {
      const h = render(load, r.kind);
      assert.match(h, /data-nbp-role="what-if"/);
      assert.ok(text(h).includes(REP.WHAT_IF_BANNER), `${r.kind} carries the what-if banner`);
    }
  }
});

test("simulation outcome panel: box score has exactly the modelled columns; reconciliation passes; comparison with official medians", () => {
  assert.deepEqual(BOX_COLUMNS.map(([, l]) => l), ["MIN", "PTS", "REB", "AST", "3PM", "3PA", "FGM", "FGA", "FTM", "FTA", "STL", "BLK", "TOV", "PF"]);
  for (const load of LOADS) {
    const h = render(load);
    assert.match(h, /data-nbp-reconcile="pass"/);
    for (const id of ["R1-home", "R1-away", "R2-home", "R2-away", "R3-home", "R3-away", "R4-home", "R4-away", "R5"]) assert.match(h, new RegExp(`data-nbp-check="${id}"`));
    assert.match(h, /data-nbp-compare=""/);
    const head = h.slice(h.indexOf('data-nbp-box-team="away"'));
    const ths = [...head.slice(0, head.indexOf("</thead>")).matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
    assert.deepEqual(ths, ["Player", ...BOX_COLUMNS.map(([, l]) => l)]);
    assert.doesNotMatch(text(h), /\bPRA\b|\bEFF\b|\+\/-/, "no column the engine does not model");
  }
});

test("overtime run renders its OT period in the linescore after a tie", () => {
  const load = LOADS.find((l) => l.payload.runs.some((r) => r.kind === "overtime"));
  assert.ok(load, "the slate has an overtime what-if");
  const h = render(load, "overtime");
  assert.match(h, /<th scope="col">OT1<\/th>/);
});

test("stylesheet: tokens only (no colour literal), no font under 11px, motion on role tokens and off under reduced motion", () => {
  const css = fs.readFileSync(path.join(APP, "src/components/simulation-theater/nba/possession/nba-possession.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  const small = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) for (const f of m[2].matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) if (Number(f[1]) < 11) small.push(`${m[1].trim()}: ${f[0]}`);
  assert.deepEqual(small, []);
  for (const m of css.matchAll(/(?:transition|animation):([^;}]+)/g)) {
    if (/^\s*none/.test(m[1])) continue;
    assert.match(m[1], /var\(--motion-[a-z-]+-duration\)/, m[0]);
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\{[^}]*\.nbp-poss-dot\{transition:none\}/);
  assert.match(css, /\.nbp-root\.is-motion-off \.nbp-new\{animation:none\}/);
  // CSS ships un-pruned in every build: the possession stylesheet must carry no export marker (classes only)
  const rawCss = fs.readFileSync(path.join(APP, "src/components/simulation-theater/nba/possession/nba-possession.css"), "utf8");
  for (const m of NBA_PRIVATE_MARKERS) assert.ok(!rawCss.includes(m), `stylesheet carries marker ${m}`);
  for (const f of ["NbaPossessionTheater.tsx", "possession-parts.tsx", "NbaPossessionSection.tsx"]) {
    const src = fs.readFileSync(path.join(APP, "src/components/simulation-theater/nba/possession", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/, `${f}: colour literal`);
  }
});

test("FLAG ON (simulated build): the public page renders the labelled Theater; its HTML + payload carry no private marker beyond the allowlist", () => {
  // the gate: both acts — never on with the committed constant
  assert.equal(nbaPublicTheaterOn({ env: { GTP_NBA_THEATER_PUBLIC: "1" } }), false);
  assert.equal(nbaPublicTheaterOn({ constantEnabled: true, env: { GTP_NBA_THEATER_PUBLIC: "1" } }), true);
  const params = nbaPublicTheaterParams(() => IDS, { constantEnabled: true, env: { GTP_NBA_THEATER_PUBLIC: "1" } });
  assert.deepEqual(params.map((p) => p.eventId), IDS);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nba-public-theater-"));
  const notAllowed = NBA_PRIVATE_MARKERS.filter((m) => !NBA_THEATER_FLAG_ON_ALLOWLIST.includes(m));
  for (const load of LOADS) {
    const page = render(load);
    const rsc = JSON.stringify({ payload: load.payload, palettes: load.palettes }); // what the RSC payload serialises
    for (const m of notAllowed) {
      assert.ok(!page.includes(m), `${load.eventId} HTML carries ${m}`);
      assert.ok(!rsc.includes(m), `${load.eventId} payload carries ${m}`);
    }
    assert.ok(!page.includes("data/internal") && !rsc.includes("data/internal"), "the client never sees a data/internal path");
    fs.mkdirSync(path.join(dir, "nba/simulation", load.eventId), { recursive: true });
    fs.writeFileSync(path.join(dir, "nba/simulation", load.eventId, "index.html"), `<html><body>${page}</body></html>`);
    fs.writeFileSync(path.join(dir, "nba/simulation", load.eventId, "index.txt"), rsc);
  }
  const on = scanExportForNbaPrivate(dir, { publicTheaterOn: true });
  assert.deepEqual(on.leaks, [], "flag-on export clean beyond the allowlist");
  const off = scanExportForNbaPrivate(dir, { publicTheaterOn: false });
  assert.ok(off.leaks.some((l) => l.marker === "nba-possession-sim-v0"), "the same files are leaks in a flag-OFF build");
  // the allowlist is scoped: the engine id on another page is a leak even with the flag on
  fs.writeFileSync(path.join(dir, "index.html"), "<p>nba-possession-sim-v0</p>");
  assert.ok(scanExportForNbaPrivate(dir, { publicTheaterOn: true }).leaks.some((l) => l.file === "index.html"));
  // the private artifact path is never allowed
  fs.writeFileSync(path.join(dir, "nba/simulation", IDS[0], "leak.txt"), "data/internal/research/nba/theater-possession/2026-10-20.json");
  const leak = scanExportForNbaPrivate(dir, { publicTheaterOn: true }).leaks.filter((l) => l.file.endsWith("leak.txt")).map((l) => l.marker);
  assert.ok(leak.includes("theater-possession") && leak.includes("data/internal/research/nba"));
  fs.rmSync(dir, { recursive: true, force: true });
});
