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
const { packPlaybackPayload } = await import("../../../../lib/simulation-theater/nba/possession/wire.mjs");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const IDS = ["401909088", "401909089", "401909090"];
const LOADS = IDS.map((id) => loadNbaPossessionTheater(REPO, id));
const html = (el) => renderToStaticMarkup(el);
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
// the island's props exactly as NbaPossessionSection passes them (the packed payload + the team palette)
const islandProps = (load) => ({ wire: packPlaybackPayload(load.payload), palette: load.palettes.team });
const render = (load, initialKind = null) => html(React.createElement(Island, { ...islandProps(load), initialKind }));
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
    // founder directive 2026-10-23 public readiness: the engine named by name + id, in the registry vocabulary
    assert.ok(t.includes("Game Simulation engine: NBA possession engine (nba-possession-sim-v0) — not the Official Forecast, not the NBA v1 Challenger (evaluation only)"));
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

test("default run is labelled one run of the unvalidated research possession engine (not Gate V2's v1 label); every what-if carries the hypothetical banner", () => {
  for (const load of LOADS) {
    const d = text(render(load));
    assert.ok(d.includes(LABELS.DEFAULT_RUN_TITLE), "the default run names the research engine");
    assert.ok(!d.includes(REP.SUPPORTING_RUN_TITLE), "Gate V2's v1 run label is not used for the possession engine");
    assert.match(render(load), /data-nbp-role="default"/);
    for (const r of load.payload.runs.filter((x) => x.hypothetical)) {
      const h = render(load, r.kind);
      assert.match(h, /data-nbp-role="what-if"/);
      assert.ok(text(h).includes(LABELS.WHAT_IF_BANNER), `${r.kind} carries the What-if Scenario banner`); // founder directive 2026-10-23 public readiness
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
  // the gate: both acts. The committed constant is true (flipped 2026-10-21 with the approval file), so the env act decides;
  // a false constant still keeps every env OFF.
  assert.equal(nbaPublicTheaterOn({ env: { GTP_NBA_THEATER_PUBLIC: "1" } }), true);
  assert.equal(nbaPublicTheaterOn({ env: {} }), false);
  assert.equal(nbaPublicTheaterOn({ constantEnabled: false, env: { GTP_NBA_THEATER_PUBLIC: "1" } }), false);
  assert.equal(nbaPublicTheaterOn({ constantEnabled: true, env: { GTP_NBA_THEATER_PUBLIC: "1" } }), true);
  const params = nbaPublicTheaterParams(() => IDS, { constantEnabled: true, env: { GTP_NBA_THEATER_PUBLIC: "1" } });
  assert.deepEqual(params.map((p) => p.eventId), IDS);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nba-public-theater-"));
  const notAllowed = NBA_PRIVATE_MARKERS.filter((m) => !NBA_THEATER_FLAG_ON_ALLOWLIST.includes(m));
  for (const load of LOADS) {
    const page = render(load);
    const rsc = JSON.stringify(islandProps(load)); // what the RSC payload serialises (the island's props)
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

test("labelling (founder directive 2026-10-23 public readiness; G12 wording superseded): the banner says Game Simulation, not the Official Forecast, not a real or live game — once, near the playback; the engine panel names the engine and carries the notes; nothing implies a real or live game", () => {
  // ROLE_C_LABEL stays the engine's gate identity (theater-replay-engine.mjs pins it) but is no longer rendered
  assert.equal(LABELS.ROLE_C_LABEL, "Research Possession Simulation — Unvalidated");
  assert.deepEqual([...LABELS.ROLE_C_NOTE], [
    "This Game Simulation is generated by the NBA possession engine (nba-possession-sim-v0) from the same frozen inputs as the Official Forecast.",
    "It is not the Official Forecast.",
    "Each run is a hypothetical game — one possible outcome, not a prediction and not a guarantee.",
    "A different simulated score does not change the Official Forecast.",
  ]);
  for (const load of LOADS) {
    for (const kind of [null, "upset", "high", "low"]) {
      const out = render(load, kind);
      const text = out.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
      const where = `${load.payload?.eventId ?? "?"} ${kind ?? "default"}`;
      assert.equal((text.match(/Research Possession Simulation/gi) ?? []).length, 0, `${where}: the superseded label is not rendered`);
      assert.equal((text.match(/NOT A REAL OR LIVE GAME/g) ?? []).length, 1, `${where}: stated once, near the playback`);
      assert.match(text, /GAME SIMULATION · NOT THE OFFICIAL FORECAST · NOT A REAL OR LIVE GAME/, `${where}: the banner`);
      assert.equal((text.match(/Game Simulation engine: NBA possession engine \(nba-possession-sim-v0\)/g) ?? []).length, 1, `${where}: the engine named once, name + id`);
      assert.ok(text.indexOf(LABELS.ENGINE_LABEL) > text.indexOf("About this simulation"), `${where}: in the engine panel`);
      assert.ok(text.includes(LABELS.VERIFIED_NOTE.replace(/'/g, "'")) && text.includes(LABELS.ACCURACY_NOTE.replace(/'/g, "'")), `${where}: technically verified vs Model Performance, stated once in the panel`);
      for (const line of LABELS.ROLE_C_NOTE) assert.ok(text.includes(line), `${where}: the note says "${line}"`);
      assert.match(text, /Simulation outcome · this run(?! · Research)/, `${where}: the outcome panel carries the short label`);
      assert.doesNotMatch(text, /\bunvalidated\b/i, `${where}: the doubt is stated once, as Model Performance — not as a label`);
      assert.doesNotMatch(text, /one supporting-simulation run|supporting simulation\b(?! engine)/i, `${where}: no Gate V2 v1 run label on this engine`);
      // nothing implies a real or live game (the banner's own "NOT A REAL OR LIVE GAME" excepted)
      const rest = text.replace(/NOT A REAL OR LIVE GAME/g, "").replace(/overtime is rarer than in real games/g, "").replace(/not a real result/g, "");
      assert.doesNotMatch(rest, /\blive\b|\breal game|in real time|happening now|\bLIVE\b/i, `${where}: no live/real-game wording`);
    }
  }
});

test("page weight (PR 1167): the island's share of a page (server markup + its props escaped in the flight) is ≤ 150KB, and its props are the packed wire", () => {
  for (const load of LOADS) {
    const props = islandProps(load);
    const flight = JSON.stringify(JSON.stringify(props)).length - 2; // the props as an escaped string inside the HTML
    const kb = (render(load).length + flight) / 1024;
    assert.ok(kb <= 150, `${load.eventId}: island markup + props ${kb.toFixed(1)}KB`);
    assert.ok(!("events" in props.wire.runs[0]) && props.wire.runs.every((r) => r.log.schema === "nba-possession-events@1"), "no unpacked event log on the wire");
    assert.ok(!("neutral" in props), "only the palette the island paints with");
  }
});

test("founder UX scope: on court now (five per team, from the event log), player contributions, controls, alternative runs", () => {
  for (const load of LOADS) {
    const h = render(load);
    const t = text(h);
    for (const side of ["home", "away"]) {
      const m = h.match(new RegExp(`data-nbp-oncourt-team="${side}"[\\s\\S]*?</ul>`));
      assert.ok(m, `${side} on-court list rendered`);
      assert.equal((m[0].match(/<li/g) ?? []).length, 5, `${side}: five players on court at tip-off`);
    }
    assert.ok(t.includes("player contributions and box score"), "the running box score is labelled player contributions");
    for (const ctl of ["Restart", "Final", "Play"]) assert.ok(t.includes(ctl), `control ${ctl}`);
    for (const s of ["1×", "2×", "4×", "8×"]) assert.ok(t.includes(s), `speed ${s}`);
    assert.ok((h.match(/data-nbp-run-kind=/g) ?? []).length >= 4, "labelled alternative runs offered");
    assert.ok(h.includes("data-nbp-compare"), "official-vs-simulated comparison");
  }
});

test("inputs-as-of disclosure (release owner 2026-10-21, identical cutoffs): the official freeze, never a claim about v1's inputs", () => {
  // founder directive 2026-10-23 public readiness: registry casing ("Official Forecast") and term ("simulation")
  assert.equal(LABELS.INPUTS_AS_OF_NOTE, "the Official Forecast's freeze for this game: the simulation has no later information than the Official Forecast had");
  for (const load of LOADS) {
    for (const kind of [null, "upset"]) {
      const t = text(render(load, kind));
      assert.match(t, /Inputs as of \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC \(the Official Forecast's freeze for this game: the simulation has no later information than the Official Forecast had\)/, `${load.payload?.eventId}: the freeze line`);
      assert.doesNotMatch(t, /same as-of inputs|inputs the NBA v1|v1 Challenger \(evaluation only\) used/i, "the retired v1-inputs claim never appears");
    }
  }
  // the instant printed is the official freeze recorded with the runs
  for (const load of LOADS) assert.equal(load.payload.engine.inputAsOf, load.payload.official.frozenAt.replace(/\.000Z$/, "Z"));
});


test("scenario transparency (founder 2026-10-21): the default run is described as a SELECTED illustrative scenario — never a random draw or independent confirmation; every what-if stays hypothetical", () => {
  assert.match(LABELS.DEFAULT_RUN_SUBTITLE, /selected illustrative run/); // founder directive 2026-10-23 public readiness: "scenario" is reserved for What-if Scenarios
  assert.match(LABELS.DEFAULT_RUN_SUBTITLE, /among the runs the Elo favourite won/);
  assert.match(LABELS.DEFAULT_RUN_SUBTITLE, /not a random draw/);
  assert.match(LABELS.DEFAULT_RUN_SUBTITLE, /not an independent confirmation of the Official Forecast/);
  for (const load of LOADS) {
    const t = text(render(load));
    assert.ok(t.includes(LABELS.DEFAULT_RUN_SUBTITLE), `${load.eventId}: the default run carries the transparency note`);
    assert.doesNotMatch(t, /\b(random(ly)? (chosen|selected|sampled) run|typical run|confirms the (official )?forecast)\b/i, `${load.eventId}: no unbiased-draw or confirmation wording`);
    for (const kind of ["upset", "high", "low", "overtime"]) {
      if (!load.payload.runs?.some?.((r) => r.kind === kind) && !JSON.stringify(load.payload).includes(`"kind":"${kind}"`)) continue;
      assert.ok(text(render(load, kind)).includes(LABELS.WHAT_IF_BANNER), `${load.eventId} ${kind}: What-if Scenario banner`); // founder directive 2026-10-23 public readiness
    }
  }
});
