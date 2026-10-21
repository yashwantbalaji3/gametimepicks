/**
 * NBA Theater · POSSESSION PLAYBACK (lib): the stored artifact, the run selection, the playback timeline, the box score
 * and its reconciliation, the payload and the loader's refusals.
 * Run: npx tsx --test src/lib/simulation-theater/nba/possession/possession-theater.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { POSSESSION_ARTIFACT_SCHEMA, POSSESSION_CHECKER, possessionArtifactPath } from "./artifact-contract.mjs";
import { DEFAULT_POOL_SIZE, POSSESSION_RUN_KIND, POSSESSION_SELECTION_RULES, nearestRank, poolFeatures, selectPossessionRuns } from "./selection.mjs";
import { POSSESSION_SPEEDS, compilePossessionTimeline, frameAt, lastEventAt, nextPlayT, onCourtAt, possessionTransport, prevPlayT } from "./playback.mjs";
import { boxRows, compareWithOfficial, foldRun, reconcileBox } from "./box.mjs";
import { playLine } from "./play-text.mjs";
import { buildPlaybackPayload, officialPanel } from "./payload.mjs";
import { drawFromStoredRun, loadNbaPossessionTheater, possessionRouteEvents, readPossessionArtifact, storedRunProblems } from "./possession-loader.mjs";
import { POSSESSION_ENGINE_ID } from "./labels.mjs";
import { checkPossessionDraw } from "../../../sports/nba/research/possession-sim/invariants.mjs";
import { nbaOfficial } from "../../official-representative.mjs";
import { officialTargets } from "../../../consistency/representative.mjs";
import { createTransport, transport } from "../../transport-machine.mjs";
import { NBA_PRIVATE_MARKERS } from "../export-boundary.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const DATE = "2026-10-20";
const IDS = ["401909088", "401909089", "401909090"];
const ART = readPossessionArtifact(REPO, DATE);
const DOC = ART.doc;
const clone = (x) => JSON.parse(JSON.stringify(x));
const rostersOf = (g) => [g.rosters.home.map((p) => String(p.providerAthleteId)), g.rosters.away.map((p) => String(p.providerAthleteId))];
const readDoc = (rel) => {
  const b = fs.readFileSync(path.join(REPO, rel));
  return { doc: JSON.parse(b.toString("utf8")), path: rel, sha256: crypto.createHash("sha256").update(b).digest("hex") };
};
// the Theater loader's own call (official v0.1 file + the supporting v1 file, file-bytes hashes)
const snapshotOf = (id) => nbaOfficial(id, {
  official: readDoc(`data/internal/research/nba/experimental-v0.1/forecasts/${DATE}.json`),
  supporting: readDoc(`data/internal/research/nba/experimental-v1/forecasts/${DATE}.json`),
}).snapshot;

test("artifact: committed, private, the contract's schema, the engine id, fit report hash, and every game of the slate", () => {
  assert.ok(DOC, `${possessionArtifactPath(DATE)} readable`);
  assert.equal(DOC.schema, POSSESSION_ARTIFACT_SCHEMA);
  assert.equal(DOC.dataClass, "PRIVATE_RESEARCH");
  assert.equal(DOC.productEligible, false);
  assert.equal(DOC.feedsProducts, false);
  assert.equal(DOC.modelVersion, POSSESSION_ENGINE_ID);
  const fit = fs.readFileSync(path.join(REPO, DOC.engine.fitReport.path));
  assert.equal(crypto.createHash("sha256").update(fit).digest("hex"), DOC.engine.fitReport.sha256, "fit report hash matches the committed report");
  assert.deepEqual(DOC.games.map((g) => g.providerEventId), IDS);
  assert.ok(Number.isFinite(Date.parse(DOC.generatedAt)));
});

test("as of tip: inputs are the v1 receipt's (asOf = receipt instant < tip; v1 replay byte-identical; roster / injury blobs by hash)", () => {
  const v1 = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/nba/experimental-v1/forecasts", `${DATE}.json`), "utf8"));
  for (const g of DOC.games) {
    const rg = v1.games.find((x) => String(x.providerEventId) === g.providerEventId);
    assert.equal(g.inputAsOf, rg.receipt.generatedAt);
    assert.ok(Date.parse(g.inputAsOf) < Date.parse(g.dateUtc), "inputs strictly before tip");
    assert.equal(g.inputs.v1Receipt.payloadSha256, rg.receipt.payloadSha256);
    assert.equal(g.inputs.rosters.sha256, rg.receipt.inputs.rosters.sha256);
    assert.equal(g.inputs.injuries.sha256, rg.receipt.inputs.injuries.sha256);
    assert.match(g.inputs.rosters.gitBlobCommit, /^[0-9a-f]{40}$/);
    assert.match(g.inputs.v1Receipt.profileRebuild, /BYTE_IDENTICAL/);
    assert.equal(g.inputs.boxscores.docs, rg.receipt.inputs.boxscores.docs);
    assert.match(g.inputs.engineInputsSha256, /^[0-9a-f]{64}$/);
  }
});

test("EVERY stored run passes checkPossessionDraw (P1–P11) rebuilt from its own log + ledger, and its box digest", () => {
  let runs = 0;
  for (const g of DOC.games) {
    assert.equal(g.pool.checkedDraws, DEFAULT_POOL_SIZE);
    assert.equal(g.pool.violations, 0);
    const rosters = rostersOf(g);
    for (const r of g.runs) {
      assert.deepEqual(storedRunProblems(r, rosters), [], `${g.providerEventId} run ${r.runIndex}`);
      assert.deepEqual(checkPossessionDraw(drawFromStoredRun(r, rosters), rosters), []);
      assert.deepEqual(r.checker.families, POSSESSION_CHECKER.families);
      runs += 1;
    }
  }
  assert.ok(runs >= 12, `${runs} stored runs`);
});

test("a tampered stored run is refused (mutation probes: score, clock, ledger, digest, roster)", () => {
  const g = DOC.games[0];
  const rosters = rostersOf(g);
  const base = g.runs[0];
  const probes = {
    score: (r) => { const e = r.events.find((x) => x.type === "shot" && x.made); e.s = [e.s[0] + 1, e.s[1]]; },
    clockRises: (r) => { const e = r.events.filter((x) => x.q === 1 && x.type === "shot")[5]; e.c = 7199; },
    ledger: (r) => { r.ledger[0][0][1] += 1; },
    digest: (r) => { r.boxDigest = "0".repeat(64); },
    foreignPlayer: (r) => { const e = r.events.find((x) => x.type === "shot"); e.player = "999999999"; },
    sixOnCourt: (r) => { r.events[0].lineups[0] = [...r.events[0].lineups[0].slice(0, 4), r.events[0].lineups[0][0]]; },
  };
  for (const [name, f] of Object.entries(probes)) {
    const r = clone(base);
    f(r);
    assert.ok(storedRunProblems(r, rosters).length > 0, `probe ${name} must be refused`);
  }
  // the loader refuses the whole game on one bad run
  const bad = clone(DOC);
  bad.games[0].runs[1].boxDigest = "f".repeat(64);
  const t = loadNbaPossessionTheater(REPO, g.providerEventId, { read: { file: "x", doc: bad } });
  assert.equal(t.ok, false);
  assert.equal(t.error.code, "INVARIANT_VIOLATION");
});

test("deterministic default selection: re-deriving the picks from the stored pool features gives the stored runs; the default is won by the official side", () => {
  for (const g of DOC.games) {
    const features = g.pool.features.map(([runIndex, home, away, ot, distance]) => ({ runIndex, home, away, total: home + away, ot, distance }));
    assert.equal(features.length, g.poolSize);
    const snap = snapshotOf(g.providerEventId);
    assert.equal(snap.snapshotId, g.official.snapshotId);
    const side = snap.game.winner.side;
    const sel = selectPossessionRuns(features, side);
    assert.deepEqual(sel.picks.map((p) => [p.kind, p.runIndex]), g.runs.map((r) => [r.kind, r.runIndex]), g.providerEventId);
    assert.deepEqual(selectPossessionRuns([...features].reverse(), side).picks, sel.picks, "order of the pool does not matter");
    const def = g.runs.find((r) => r.kind === POSSESSION_RUN_KIND.DEFAULT);
    assert.equal(def.final[0] > def.final[1] ? "HOME" : "AWAY", side, "default run won by the official favoured side");
    const up = g.runs.find((r) => r.kind === POSSESSION_RUN_KIND.UPSET);
    assert.notEqual(up.final[0] > up.final[1] ? "HOME" : "AWAY", side, "upset run won by the other side");
    // the default is the closest same-side run of the WHOLE pool
    const sameSide = features.filter((f) => (f.home > f.away ? "HOME" : "AWAY") === side);
    assert.equal(Math.min(...sameSide.map((f) => f.distance)), def.distance);
    // the stored distance is recomputed from the run's OWN event log against the official targets
    const fold = foldRun(def.events, rostersOf(g));
    const lines = rostersOf(g).flatMap((ids, t) => ids.map((id) => ({ providerAthleteId: id, ...fold.players[t].get(id) })));
    const f = poolFeatures({ runIndex: def.runIndex, final: def.final, overtimePeriods: def.overtimePeriods, lines }, officialTargets(snap));
    assert.equal(f.distance, def.distance);
    // high / low around the pool quantiles; overtime run really has OT
    assert.equal(sel.poolTotals.p90, nearestRank(features.map((x) => x.total), 0.9));
    const hi = g.runs.find((r) => r.kind === "high"), lo = g.runs.find((r) => r.kind === "low");
    assert.ok(hi.final[0] + hi.final[1] > lo.final[0] + lo.final[1]);
    const ot = g.runs.find((r) => r.kind === "overtime");
    if (ot) assert.ok(ot.overtimePeriods >= 1);
    assert.equal(new Set(g.runs.map((r) => r.runIndex)).size, g.runs.length, "no run carries two roles");
  }
});

test("selection rules: pure, documented, ties → lowest runIndex, no official side → no default, missing OT recorded", () => {
  const f = [
    { runIndex: 3, home: 100, away: 90, total: 190, ot: 0, distance: 1 },
    { runIndex: 1, home: 100, away: 90, total: 190, ot: 0, distance: 1 },
    { runIndex: 2, home: 90, away: 100, total: 190, ot: 0, distance: 0.5 },
    { runIndex: 4, home: 120, away: 118, total: 238, ot: 0, distance: 2 },
  ];
  const s = selectPossessionRuns(f, "HOME");
  assert.deepEqual(s.picks.map((p) => [p.kind, p.runIndex]), [["default", 1], ["upset", 2], ["high", 4], ["low", 3]]);
  assert.deepEqual(s.missing.map((m) => m.kind), ["overtime"]);
  const n = selectPossessionRuns(f, null);
  assert.ok(!n.picks.some((p) => p.kind === "default"));
  for (const k of Object.values(POSSESSION_RUN_KIND)) assert.equal(typeof POSSESSION_SELECTION_RULES[k], "string");
});

test("playback: event times never decrease; every period starts / ends where the log says; the final frame is the log's final", () => {
  for (const g of DOC.games) {
    for (const r of g.runs) {
      const c = compilePossessionTimeline(r);
      assert.equal(c.periods.length, 4 + r.overtimePeriods);
      for (let k = 1; k < c.events.length; k += 1) assert.ok(c.events[k].t >= c.events[k - 1].t);
      const fin = frameAt(c, c.tEnd);
      assert.equal(fin.phase, "FINAL");
      assert.deepEqual([fin.score.home, fin.score.away], r.final);
      // linescore from the frames = the stored periods
      assert.deepEqual(fin.periodScores.map((p) => p.home), r.periods[0]);
      assert.deepEqual(fin.periodScores.map((p) => p.away), r.periods[1]);
      // at each period end the frame's score is the cumulative period sum, and the clock reads 0
      let cum = [0, 0];
      for (const [i, p] of c.periods.entries()) {
        cum = [cum[0] + r.periods[0][i], cum[1] + r.periods[1][i]];
        const f = frameAt(c, p.endT);
        assert.deepEqual([f.score.home, f.score.away], cum, `${g.providerEventId}#${r.runIndex} end of ${p.label}`);
        assert.equal(f.clockDs, 0);
      }
      // OT only after a tie at the end of regulation
      if (r.overtimePeriods) { const end4 = r.periods[0].slice(0, 4).reduce((a, b) => a + b, 0) - r.periods[1].slice(0, 4).reduce((a, b) => a + b, 0); assert.equal(end4, 0); }
      // the clock never rises inside a period and every frame is a real event's state
      let prev = null;
      for (let t = c.periods[0].startT; t < c.periods[0].endT; t += 997) {
        const f = frameAt(c, t);
        if (prev) assert.ok(f.clockDs <= prev.clockDs);
        const e = c.events[f.k];
        assert.deepEqual([f.score.home, f.score.away], e.s);
        assert.ok(f.clockDs <= e.c, "the clock at t never reads above the last play's clock");
        assert.equal(frameAt(c, t, { step: true }).clockDs, e.c, "step mode shows the play's own clock");
        prev = f;
      }
    }
  }
});

test("playback: possession arrow = the engine's next possession; lineups = period_start + subs (always five)", () => {
  const r = DOC.games[1].runs[0];
  const c = compilePossessionTimeline(r);
  let checked = 0;
  for (let k = 0; k < c.events.length - 1; k += 1) {
    const e = c.events[k], n = c.events[k + 1];
    if (n.q === e.q && !["period_end", "game_end", "jump_ball"].includes(n.type) && !["period_end", "game_end"].includes(e.type)) { assert.equal(c.possAfter[k], n.poss); checked += 1; }
    const on = onCourtAt(c, k);
    assert.equal(on[0].length, 5); assert.equal(on[1].length, 5);
  }
  assert.ok(checked > 300);
  // a made basket hands the ball over (unless an and-one follows)
  const made = c.events.findIndex((e, k) => e.type === "shot" && e.made && c.events[k + 1]?.type !== "foul" && c.events[k + 1]?.q === e.q && c.events[k + 1]?.type !== "period_end");
  assert.equal(c.possAfter[made], 1 - c.events[made].team);
});

test("transport: 1× / 2× / 4× / 8× are identical at equal t; next / previous play and quarter; never autoplays", () => {
  const c = compilePossessionTimeline(DOC.games[0].runs[0]);
  let m = createTransport({ tEnd: c.tEnd, driveStarts: c.periodStarts });
  assert.equal(m.state, "IDLE");
  assert.deepEqual([...POSSESSION_SPEEDS], [1, 2, 4, 8]);
  for (const s of POSSESSION_SPEEDS) { const x = possessionTransport(transport, m, "SPEED", { speed: s }); assert.equal(x.speed, s); }
  assert.equal(possessionTransport(transport, m, "SPEED", { speed: 16 }), m, "unknown speed refused");
  let fast = possessionTransport(transport, possessionTransport(transport, m, "SPEED", { speed: 8 }), "PLAY");
  for (let i = 0; i < 10; i += 1) fast = transport(fast, "TICK", { dt: 50 });
  assert.equal(fast.t, 4000);
  let slow = possessionTransport(transport, m, "PLAY");
  for (let i = 0; i < 80; i += 1) slow = transport(slow, "TICK", { dt: 50 });
  assert.deepEqual(frameAt(c, fast.t), frameAt(c, slow.t));
  const q2 = transport(m, "NEXT_DRIVE");
  assert.equal(q2.t, c.periods[1].startT);
  const n = nextPlayT(c, 0);
  assert.ok(n > 0 && c.events.some((e) => e.t === n));
  assert.equal(prevPlayT(c, n), 0);
  assert.equal(lastEventAt(c, -1), -1);
});

test("box score = the fold of the log; reconciliation passes on every stored run and fails on a tampered fold", () => {
  for (const g of DOC.games) {
    const rosters = rostersOf(g);
    for (const r of g.runs) {
      const fold = foldRun(r.events, rosters);
      const rec = reconcileBox(fold, r);
      assert.equal(rec.ok, true, `${g.providerEventId}#${r.runIndex}: ${rec.checks.filter((x) => !x.ok).map((x) => x.id)}`);
      const rows = boxRows(fold, rosters, new Map());
      for (const side of ["home", "away"]) {
        const t = side === "home" ? 0 : 1;
        assert.equal(rows[side].reduce((s, p) => s + p.pts, 0), r.final[t]);
        assert.equal(rows[side].reduce((s, p) => s + p.ds, 0), 5 * (28800 + 3000 * r.overtimePeriods), "minutes = 240 + 25·OT");
        for (const p of rows[side]) { assert.ok(p.fgm <= p.fga && p.threePm <= p.threePa && p.ftm <= p.fta && p.threePm <= p.fgm); assert.equal(p.pts, 2 * p.fgm + p.threePm + p.ftm); }
      }
      // the live box at the last event is the final box
      assert.deepEqual(boxRows(foldRun(r.events, rosters, r.events.length), rosters, new Map()), rows);
    }
  }
  const g = DOC.games[0];
  const fold = foldRun(g.runs[0].events, rostersOf(g));
  const line = [...fold.players[0].values()].find((l) => l.fgm > 0);
  line.pts += 1;
  const rec = reconcileBox(fold, g.runs[0]);
  assert.equal(rec.ok, false);
  assert.ok(rec.checks.some((c) => c.id === "R1-home" && !c.ok) && rec.checks.some((c) => c.id === "R2-home" && !c.ok));
});

test("comparison with the official forecast: one row per official player, official medians copied, run values from the fold", () => {
  const g = DOC.games[1];
  const snap = snapshotOf(g.providerEventId);
  const off = officialPanel(snap);
  const rows = boxRows(foldRun(g.runs[0].events, rostersOf(g)), rostersOf(g), new Map());
  const cmp = compareWithOfficial(rows, off);
  assert.equal(cmp.length, snap.players.length);
  for (const c of cmp) {
    const sp = snap.players.find((p) => String(p.playerId) === c.playerId);
    const pts = c.families.find((f) => f.family === "pts");
    assert.equal(pts.official, sp.families.pts.median);
    const r = [...rows.home, ...rows.away].find((x) => x.providerAthleteId === c.playerId);
    assert.equal(pts.run, r ? r.pts : null);
  }
});

test("play-by-play text restates the event only (no invented detail)", () => {
  const names = new Map([["1", "Jalen Brunson"], ["2", "Josh Hart"], ["3", "Joel Embiid"]]);
  const ab = ["NY", "PHI"];
  assert.equal(playLine({ type: "shot", team: 0, player: "1", value: 3, made: true, assist: "2", block: null }, names, ab).text, "J. Brunson makes a 3-point shot (assist: J. Hart)");
  assert.equal(playLine({ type: "shot", team: 0, player: "1", value: 2, made: false, assist: null, block: "3" }, names, ab).text, "J. Brunson misses a 2-point shot · blocked by J. Embiid");
  assert.equal(playLine({ type: "rebound", team: 1, player: null, kind: "defensive" }, names, ab).text, "PHI team defensive rebound");
  assert.equal(playLine({ type: "free_throw", team: 0, player: "1", made: false, n: 2, of: 2 }, names, ab).text, "J. Brunson misses free throw 2 of 2");
  for (const g of DOC.games) for (const r of g.runs) for (const e of r.events) assert.doesNotMatch(playLine(e, new Map(), ab).text, /dunk|layup|feet|timeout|alley/i);
});

test("payload: the client gets no private path / hash / supporting-engine id; the default is a labelled research-engine run; what-ifs are hypothetical", () => {
  const ALWAYS = NBA_PRIVATE_MARKERS.filter((m) => !["nba-possession-sim-v0", "nba-possession-playback@", "data-nbp-"].includes(m));
  for (const id of IDS) {
    const t = loadNbaPossessionTheater(REPO, id);
    assert.equal(t.ok, true, JSON.stringify(t.error));
    const json = JSON.stringify(t.payload);
    for (const m of [...ALWAYS, "PRIVATE_RESEARCH", "data/internal", "gitBlobCommit", "payloadSha256", "experimental-v1", DOC.engine.fitReport.sha256]) assert.ok(!json.includes(m), `${id} payload carries ${m}`);
    const def = t.payload.runs.filter((r) => !r.hypothetical);
    assert.equal(def.length, 1);
    assert.equal(def[0].kind, "default");
    assert.equal(def[0].role, "SUPPORTING_RUN");
    for (const r of t.payload.runs.filter((x) => x.kind !== "default")) { assert.equal(r.hypothetical, true); assert.equal(r.role, "WHAT_IF"); }
    assert.equal(t.payload.selection.defaultKind, "default");
    assert.equal(t.payload.official.favouredSide, snapshotOf(id).game.winner.side);
    assert.ok(Object.keys(t.payload.official.withheld).includes("winProbability"));
  }
  assert.deepEqual(possessionRouteEvents(REPO), IDS);
});

test("official panel immutability (data): the panel is built from the snapshot only — identical whichever run is shown, and with the runs removed", () => {
  const g = DOC.games[2];
  const snap = snapshotOf(g.providerEventId);
  const panel = officialPanel(snap);
  const a = buildPlaybackPayload(g, panel).official;
  const b = buildPlaybackPayload({ ...g, runs: [...g.runs].reverse() }, panel).official;
  const c = buildPlaybackPayload({ ...g, runs: [] }, panel).official;
  const d = buildPlaybackPayload({ ...g, runs: g.runs.map((r) => ({ ...r, final: [0, 1] })) }, panel).official;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(JSON.stringify(a), JSON.stringify(c));
  assert.equal(JSON.stringify(a), JSON.stringify(d));
  assert.equal(a.snapshotId, snap.snapshotId);
});

test("loader refusals: no artifact, game absent, wrong schema, official forecast changed since selection, default off the official side", () => {
  const id = IDS[0];
  assert.equal(loadNbaPossessionTheater(REPO, id, { read: { file: "x", doc: null, error: "ENOENT" } }).error.code, "NO_ARTIFACT");
  assert.equal(loadNbaPossessionTheater(REPO, "123", { read: ART }).error.code, "NO_POSSESSION_RUNS");
  assert.equal(loadNbaPossessionTheater(REPO, id, { read: { file: "x", doc: { ...DOC, dataClass: "PUBLIC" } } }).error.code, "NO_ARTIFACT");
  const changed = clone(DOC); changed.games[0].official.snapshotId = "0".repeat(64);
  assert.equal(loadNbaPossessionTheater(REPO, id, { read: { file: "x", doc: changed } }).error.code, "OFFICIAL_CHANGED");
  const swapped = clone(DOC);
  const g = swapped.games[0];
  const up = g.runs.find((r) => r.kind === "upset"), de = g.runs.find((r) => r.kind === "default");
  up.kind = "default"; de.kind = "upset";
  // (the embedded official panel still matches, so the side constraint is what refuses)
  assert.equal(loadNbaPossessionTheater(REPO, id, { read: { file: "x", doc: swapped } }).error.code, "SIDE_CONSTRAINT");
});

test("public loader: same payload as the full loader (byte-identical), reading only the possession artifact; embedded panel drift is refused", async () => {
  const { loadPublicPossessionTheater, publicPossessionEvents } = await import("./public-loader.mjs");
  for (const id of IDS) {
    const full = loadNbaPossessionTheater(REPO, id);
    const pub = loadPublicPossessionTheater(REPO, id);
    assert.equal(pub.ok, true, JSON.stringify(pub.error));
    assert.equal(JSON.stringify(pub.payload), JSON.stringify(full.payload), `${id}: public payload ≠ full payload`);
    assert.equal(JSON.stringify(pub.palettes), JSON.stringify(full.palettes));
  }
  assert.deepEqual(publicPossessionEvents(REPO), IDS);
  const drift = clone(DOC);
  drift.games[0].official.panel.favouredSide = "AWAY";
  assert.equal(loadNbaPossessionTheater(REPO, IDS[0], { read: { file: "x", doc: drift } }).error.code, "OFFICIAL_PANEL_DRIFT");
  assert.equal(loadPublicPossessionTheater(REPO, IDS[0], { read: { file: "x", doc: drift } }).error.code, "SIDE_CONSTRAINT");
  const noPanel = clone(DOC); delete noPanel.games[0].official.panel;
  assert.equal(loadPublicPossessionTheater(REPO, IDS[0], { read: { file: "x", doc: noPanel } }).error.code, "NO_OFFICIAL_PANEL");
  // the public loader names no receipt file (those change every forecast window and are not build inputs)
  const src = fs.readFileSync(path.join(APP, "src/lib/simulation-theater/nba/possession/public-loader.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src, /experimental-v|\.\.\/loader\.mjs|official-representative|official-snapshot/);
});
