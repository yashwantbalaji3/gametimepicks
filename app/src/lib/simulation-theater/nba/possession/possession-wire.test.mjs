/**
 * NBA Theater · POSSESSION PLAYBACK · the event codec (event-codec.mjs, storage-grade) and the island's wire format
 * (wire.mjs), PR 1167 page weight: lossless for every stored run of every game (JSON byte-identical, key order included),
 * the island's derived frames / box / feed / comparison unchanged, refusals for anything not rebuildable, import-free.
 * Run: npx tsx --test src/lib/simulation-theater/nba/possession/possession-wire.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { EVENT_CODEC_SCHEMA, EVENT_LEDGER, packEvents, unpackEvents } from "./event-codec.mjs";
import { packPlaybackPayload, unpackPlaybackPayload } from "./wire.mjs";
import { compilePossessionTimeline, frameAt, nextPlayT, onCourtAt, prevPlayT } from "./playback.mjs";
import { boxRows, compareWithOfficial, foldRun, reconcileBox } from "./box.mjs";
import { playLine } from "./play-text.mjs";
import { drawFromStoredRun, loadNbaPossessionTheater, readPossessionArtifact, storedRunProblems } from "./possession-loader.mjs";
import { loadPublicPossessionTheater } from "./public-loader.mjs";
import { checkPossessionDraw } from "../../../sports/nba/research/possession-sim/invariants.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const IDS = ["401909088", "401909089", "401909090"];
const DATE = "2026-10-20"; // the committed slate (the public loader defaults to the build's ET date)
const DOC = readPossessionArtifact(REPO, DATE).doc;
const clone = (x) => JSON.parse(JSON.stringify(x));
const eventsOf = (r) => (Array.isArray(r.events) ? r.events : unpackEvents(r.events)); // works before and after packed storage
const rostersOf = (g) => [g.rosters.home.map((p) => String(p.providerAthleteId)), g.rosters.away.map((p) => String(p.providerAthleteId))];
const LOADS = IDS.map((id) => loadPublicPossessionTheater(REPO, id, { date: DATE }));
const escaped = (x) => JSON.stringify(JSON.stringify(x)).length - 2; // a string inside the RSC flight: quotes escaped

test("event codec: every stored run of every game round-trips byte for byte (key order included) and stays valid (P1–P11, ledger, digest)", () => {
  let runs = 0;
  for (const g of DOC.games) {
    const rosters = rostersOf(g);
    for (const r of g.runs) {
      const events = eventsOf(r);
      const p = packEvents(events);
      assert.equal(p.schema, EVENT_CODEC_SCHEMA);
      const back = unpackEvents(p);
      assert.equal(JSON.stringify(back), JSON.stringify(events), `${g.providerEventId} ${r.kind}`);
      assert.deepEqual(back, events);
      // the invariant checker and the stored-run validation over the UNPACKED log
      const rebuilt = { ...r, events: back };
      assert.deepEqual(storedRunProblems(rebuilt, rosters), [], `${g.providerEventId} ${r.kind}`);
      assert.deepEqual(checkPossessionDraw(drawFromStoredRun(rebuilt, rosters), rosters), []);
      // deterministic: the same log packs to the same bytes; the packed form is plain JSON
      assert.equal(JSON.stringify(packEvents(clone(events))), JSON.stringify(p));
      assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
      runs += 1;
    }
  }
  assert.ok(runs >= 15, `${runs} stored runs`);
});

test("event codec refuses what it cannot rebuild exactly (score, index, period, final, unknown type / field, flag type) and a foreign schema", () => {
  const events = eventsOf(DOC.games[0].runs[0]);
  const shot = events.findIndex((e) => e.type === "shot" && e.made);
  const probes = {
    score: (ev) => { ev[shot].s[0] += 1; },
    index: (ev) => { ev[5].i = 99; },
    period: (ev) => { ev[5].q = 3; },
    final: (ev) => { ev[ev.length - 1].final = [0, 0]; },
    type: (ev) => { ev[5].type = "timeout"; },
    field: (ev) => { ev[5].note = "x"; },
    flag: (ev) => { ev[shot].made = 1; },
    playerType: (ev) => { ev[shot].player = Number(ev[shot].player); },
  };
  for (const [name, mutate] of Object.entries(probes)) {
    const ev = clone(events);
    mutate(ev);
    assert.throws(() => packEvents(ev), /packEvents/, name);
  }
  assert.throws(() => unpackEvents({ ...packEvents(events), schema: "nba-possession-events@0" }), /schema/);
  assert.deepEqual(EVENT_LEDGER.map(([t]) => t).sort(), ["foul", "free_throw", "game_end", "jump_ball", "period_end", "period_start", "rebound", "shot", "sub", "turnover"]);
});

test("wire: unpack(pack(payload)) is the payload byte for byte, for both loaders and every game", () => {
  for (const id of IDS) {
    for (const load of [loadPublicPossessionTheater(REPO, id, { date: DATE }), loadNbaPossessionTheater(REPO, id)]) {
      assert.equal(load.ok, true, JSON.stringify(load.error));
      const wire = packPlaybackPayload(load.payload);
      assert.equal(JSON.stringify(unpackPlaybackPayload(wire)), JSON.stringify(load.payload), id);
      assert.equal(wire.schema, load.payload.schema);
      for (const r of wire.runs) assert.equal(r.log.schema, EVENT_CODEC_SCHEMA);
    }
  }
  // a run whose rule is not its kind's selection rule keeps it verbatim
  const p = clone(LOADS[0].payload);
  p.runs[1].rule = "a different rule";
  assert.equal(packPlaybackPayload(p).runs[1].rule, "a different rule");
  assert.equal(JSON.stringify(unpackPlaybackPayload(packPlaybackPayload(p))), JSON.stringify(p));
  // the pack refuses a payload it cannot rebuild
  const bad = clone(LOADS[0].payload);
  bad.runs[0].events[3].s = [99, 99];
  assert.throws(() => packPlaybackPayload(bad), /packEvents/);
});

test("wire: the island's derived frames, on-court lists, box, reconciliation, comparison and feed are identical old vs new", () => {
  for (const load of LOADS) {
    const old = load.payload;
    const neu = unpackPlaybackPayload(JSON.parse(JSON.stringify(packPlaybackPayload(old)))); // through JSON, as the flight
    const names = (p) => new Map([...p.rosters.home, ...p.rosters.away].map((x) => [x.id, x.name ?? null]));
    const rosters = (p) => [p.rosters.home.map((x) => x.id), p.rosters.away.map((x) => x.id)];
    const abbr = [old.teams.home.abbr, old.teams.away.abbr];
    for (let ri = 0; ri < old.runs.length; ri += 1) {
      const view = (p) => {
        const run = p.runs[ri];
        const c = compilePossessionTimeline(run);
        const ts = [0, 1, 500, 12345, c.tEnd / 3, c.tEnd / 2, c.tEnd - 1, c.tEnd, ...c.periodStarts, ...c.breaks.map((b) => b.startT + 1)];
        const frames = ts.flatMap((t) => [frameAt(c, t), frameAt(c, t, { step: true }), nextPlayT(c, t), prevPlayT(c, t)]);
        const ks = [0, 7, 100, Math.floor(run.events.length / 2), run.events.length - 1];
        const fin = foldRun(run.events, rosters(p));
        return JSON.stringify({
          c: { ...c, events: c.events.map((e) => [e.k, e.t]) }, frames, on: ks.map((k) => onCourtAt(c, k)),
          live: ks.map((k) => boxRows(foldRun(run.events, rosters(p), k + 1), rosters(p), names(p))),
          box: boxRows(fin, rosters(p), names(p)), rec: reconcileBox(fin, { final: [run.final.home, run.final.away], overtimePeriods: run.overtimePeriods }),
          cmp: compareWithOfficial(boxRows(fin, rosters(p), names(p)), p.official),
          feed: run.events.map((e) => playLine(e, names(p), abbr)),
        });
      };
      assert.equal(view(neu), view(old), `${old.eventId} ${old.runs[ri].kind}`);
    }
  }
});

test("page weight: the island's props (packed payload + its one palette) are under 90KB per game escaped, under a quarter of the old payload", () => {
  for (const load of LOADS) {
    const props = { wire: packPlaybackPayload(load.payload), palette: load.palettes.team };
    const kb = escaped(props) / 1024;
    assert.ok(kb <= 90, `${load.eventId}: island props ${kb.toFixed(1)}KB escaped`);
    assert.ok(escaped(props) * 4 < escaped({ payload: load.payload, palettes: load.palettes }), `${load.eventId}: the wire is not a quarter of the old props`);
  }
});

test("browser-safe: the codec imports nothing, the wire imports only the codec", () => {
  const specs = (f) => [...fs.readFileSync(path.join(APP, "src/lib/simulation-theater/nba/possession", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.deepEqual(specs("event-codec.mjs"), []);
  assert.deepEqual(specs("wire.mjs"), ["./event-codec.mjs"]);
});
