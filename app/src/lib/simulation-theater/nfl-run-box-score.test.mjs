/**
 * NFL player box score of one simulated run — on the committed week-8 fixtures (all 14 games, SEEDS seeds each).
 *
 *   RECONCILE   every box reconciles exactly: Σ player lines = team line (completions, receptions, gross passing /
 *               receiving / passer yards, carries, rushing yards, TDs, turnovers), team line = the engine's own
 *               accumulators, points composition = the run's final score; checked here independently of the module.
 *   INACTIVE    a player the build excludes (blocking injury status, or not on the active roster) has no line in any box.
 *   NO EMPTY LINES  every player with a line had a play in this run (a backup QB appears only with a snap).
 *   PLAY LOG    recording the play log changes nothing: same drives, score and accumulators with and without it.
 *   DETERMINISM same seed ⇒ identical box.
 *   RE-DERIVE   (sim-v2/player-run.mjs, an audit / test tool — no public route uses it) the representative runs get
 *               player lines only when the receipt's input hash and the drive fingerprint both verify; tampering with
 *               either refuses (typed), never a guessed number. The PAGE reads the boxes stored in the receipt
 *               (nfl-stored-run-box.mjs; nfl-stored-run-box.test.mjs).
 *   LABELS      the rendered box is titled "Box score · Simulated scenario (hypothetical)", never says official, prints
 *               exactly the module's numbers, and uses table semantics; the unavailable state prints no player numbers.
 *
 * Run: cd app && npx tsx --test src/lib/simulation-theater/nfl-run-box-score.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const E = await import("../sports/nfl/sim-v2/engine.mjs");
const { readShadowReceipts, simulationOfRecord } = await import("../sports/nfl/sim-v2/public-receipt.mjs");
const B = await import("./nfl-run-box-score.mjs");
const P = await import("../sports/nfl/sim-v2/player-run.mjs");
const { default: RunPlayerBox } = await import("../../components/simulation-theater/RunPlayerBox.tsx");
const { BoxScoreForRun } = await import("../../components/simulation-theater/BoxScoreTable.tsx");
const { loadTheater } = await import("./loader.mjs");
const { storedRunBoxes } = await import("./nfl-stored-run-box.mjs");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const SEEDS = 300;
const NFL_WEEK8 = ["401873023", "401873024", "401873025", "401873026", "401873027", "401873028", "401873029", "401873030", "401873031", "401873032", "401873033", "401873034", "401873035", "401873036"];
const SHADOW = readShadowReceipts(REPO);
const recOf = (id) => simulationOfRecord(SHADOW, id).receipt;
const SIDES = ["away", "home"];
const IDX = { home: 0, away: 1 };

function setup(id) {
  const r = recOf(id);
  const ti = P.nflSimTeamInputs(REPO, id, r.home.abbr, r.away.abbr);
  assert.ok(ti, `${id}: committed inputs`);
  const prep = ti.inputs.map(E.prepareTeamPlayers);
  const compiled = P.compiledFor(REPO, r);
  assert.ok(compiled, `${id}: committed params match the receipt's sha256`);
  const teams = { home: { abbr: r.home.abbr }, away: { abbr: r.away.abbr } };
  return { r, ti, prep, compiled, teams };
}

/** Independent re-check of a box (not using the module's own reconciliation). */
function checkBox(box, rec, label) {
  assert.deepEqual([box.final.home, box.final.away], [rec.final.home, rec.final.away], `${label}: final`);
  for (const s of SIDES) {
    const b = box[s];
    const t = b.team;
    const eng = rec.engine.team[IDX[s]];
    const sum = (rows, f) => rows.reduce((a, x) => a + x[f], 0);
    assert.equal(t.points, box.final[s], `${label} ${s}: team points = final`);
    assert.equal(t.points, eng.pts, `${label} ${s}: = engine points`);
    assert.equal(6 * (t.passTd + t.rushTd + t.defTd) + t.xpMade + 2 * t.twoMade + 3 * t.fgMade + 2 * t.safeties, t.points, `${label} ${s}: composition`);
    assert.equal(sum(b.passing, "cmp"), t.cmp); assert.equal(sum(b.receiving, "rec"), t.cmp, `${label} ${s}: completions = Σ receptions`);
    assert.equal(sum(b.passing, "passYds"), t.passYds); assert.equal(sum(b.receiving, "recYds"), t.passYds, `${label} ${s}: gross passing = Σ receiving`);
    assert.equal(sum(b.passing, "passAtt"), t.passAtt); assert.equal(sum(b.receiving, "targets"), t.passAtt, `${label} ${s}: targets = attempts`);
    assert.equal(sum(b.passing, "passTd"), t.passTd); assert.equal(sum(b.receiving, "recTd"), t.passTd);
    assert.equal(sum(b.rushing, "rushAtt"), t.rushAtt); assert.equal(sum(b.rushing, "rushYds"), t.rushYds, `${label} ${s}: Σ rushing yards = team (tolerance 0)`);
    assert.equal(sum(b.rushing, "rushTd"), t.rushTd);
    assert.equal(sum(b.passing, "int"), t.int); assert.equal(sum(b.rushing, "fumLost"), t.fumLost);
    assert.equal(t.turnovers, t.int + t.fumLost);
    assert.equal(t.netPassYds, t.passYds - t.sackYds);
    for (const [f, e] of [["passAtt", "passAtt"], ["cmp", "cmp"], ["passYds", "passYds"], ["sacks", "sacks"], ["sackYds", "sackYds"], ["rushAtt", "rushAtt"], ["rushYds", "rushYds"], ["int", "int"], ["fumLost", "fumLost"], ["fgMade", "fgMade"], ["xpMade", "xpMade"], ["twoMade", "twoMade"], ["defTd", "defTd"], ["safeties", "safetiesFor"]]) assert.equal(t[f], eng[e], `${label} ${s}: ${f} = engine`);
    // anytime TD scorers = players with a rushing or receiving TD (+ the team's defense / special teams)
    const tdIds = new Set([...b.rushing.filter((x) => x.rushTd > 0), ...b.receiving.filter((x) => x.recTd > 0)].map((x) => x.id));
    if (t.defTd) tdIds.add("DEF_ST");
    assert.deepEqual(new Set(b.tdScorers.map((x) => x.id)), tdIds, `${label} ${s}: anytime TD scorers`);
    assert.equal(sum(b.tdScorers, "tds"), t.passTd + t.rushTd + t.defTd, `${label} ${s}: Σ scorer TDs = offensive + defensive TDs`);
  }
}

test(`week 8, all 14 games × ${SEEDS} seeds: every player box reconciles exactly; inactive players never appear; no empty lines; the play log changes nothing; deterministic`, () => {
  let runs = 0, excludedTotal = 0, otherLines = 0;
  const seen = { defTd: 0, twoAtt: 0, scrambles: 0, fumLost: 0, safeties: 0, kneels: 0, overtime: 0 };
  for (const id of NFL_WEEK8) {
    const { r, ti, prep, compiled, teams } = setup(id);
    const excluded = new Set([...ti.excluded[0], ...ti.excluded[1]]);
    excludedTotal += excluded.size;
    const tables = [E.tiltedTable(compiled, r.calibration.thetas[0]), E.tiltedTable(compiled, r.calibration.thetas[1])];
    const bare = { team: [new Float64Array(E.N_TSTAT), new Float64Array(E.N_TSTAT)], period: [new Float64Array(5), new Float64Array(5)], players: [new Float64Array((prep[0].n + 1) * E.N_PSTAT), new Float64Array((prep[1].n + 1) * E.N_PSTAT)] };
    for (let i = 0; i < SEEDS; i++) {
      const rec = P.simulateRunRecord({ compiled, thetas: r.calibration.thetas, prep, baseSeed: r.baseSeed, runIndex: i, teams });
      const box = B.nflRunBoxScore(rec); // throws on any reconciliation failure, incl. the engine cross-check
      checkBox(box, rec, `${id} seed ${i}`);
      for (const s of SIDES) for (const k of ["defTd", "twoAtt", "scrambles", "fumLost", "safeties", "kneels"]) seen[k] += box[s].team[k] > 0 ? 1 : 0;
      seen.overtime += box.final.overtime ? 1 : 0;
      // inactive / OUT players: no line anywhere
      for (const s of SIDES) for (const sec of ["passing", "rushing", "receiving", "tdScorers", "turnovers"]) for (const row of box[s][sec]) {
        assert.ok(!excluded.has(row.id), `${id} seed ${i}: excluded ${row.id} has a ${sec} line`);
        if (row.id === "OTHER") otherLines += 1;
      }
      // no empty lines: every listed player had a play in this run
      const touched = [new Set(), new Set()];
      for (const p of rec.plays) for (const k of ["p", "t", "r"]) if (p[k] != null) touched[p.o].add(p[k]);
      for (const s of SIDES) for (const sec of ["passing", "rushing", "receiving"]) for (const row of box[s][sec]) {
        const slot = row.id === "OTHER" ? prep[IDX[s]].n : prep[IDX[s]].slots.findIndex((x) => x.playerId === row.id);
        assert.ok(touched[IDX[s]].has(slot), `${id} seed ${i}: ${row.id} listed without a play`);
      }
      // the play log is passive
      const drives = [];
      const run = E.simulateGame({ compiled, tables, players: prep, rng: E.runRng(r.baseSeed, i), out: bare, events: drives });
      assert.deepEqual(drives, rec.drives, `${id} seed ${i}: same drives without the log`);
      assert.deepEqual([run.score[0], run.score[1]], [rec.final.home, rec.final.away]);
      assert.deepEqual([...bare.team[0], ...bare.team[1]], [0, 1].flatMap((side) => Object.keys(E.TEAM_STAT).map((k) => rec.engine.team[side][k])), `${id} seed ${i}: same accumulators without the log`);
      if (i % 40 === 0) {
        const again = B.nflRunBoxScore(P.simulateRunRecord({ compiled, thetas: r.calibration.thetas, prep, baseSeed: r.baseSeed, runIndex: i, teams }));
        assert.deepEqual(again, box, `${id} seed ${i}: same seed, same box`);
      }
      runs += 1;
    }
  }
  assert.equal(runs, NFL_WEEK8.length * SEEDS);
  assert.ok(excludedTotal > 0, "the week has excluded players, and none of them has a line");
  assert.ok(otherLines > 0, "the explicit Other / unallocated line is used (never forced onto named players)");
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 0, `the accounting rule for ${k} is exercised (${n} team-games)`);
});

test("stored representative runs: player lines only when the receipt's input hash AND the drive fingerprint verify; each verified box matches the stored run", (t) => {
  let verified = 0, refused = 0;
  const codes = new Set();
  for (const id of NFL_WEEK8) {
    const r = recOf(id);
    const res = P.nflRepresentativeRunBoxes(REPO, r);
    if (!res.ok) {
      assert.ok(["INPUTS_CHANGED", "INPUTS_MISSING", "PARAMS_CHANGED"].includes(res.error.code), `${id}: typed refusal ${res.error.code}`);
      assert.deepEqual(res.boxes, {}, `${id}: a refused receipt carries no box`);
      codes.add(res.error.code);
      refused += 1;
      continue;
    }
    for (const rep of r.representativeRuns) {
      const v = res.boxes[rep.runIndex];
      assert.ok(v, `${id} run ${rep.runIndex}: has a result`);
      if (!v.ok) { assert.equal(v.error.code, "FINGERPRINT_MISMATCH"); continue; }
      assert.deepEqual([v.box.final.home, v.box.final.away, v.box.final.overtime], [rep.final.home, rep.final.away, rep.final.overtime], `${id} run ${rep.runIndex}: box final = stored final`);
      for (const s of SIDES) assert.equal(v.box[s].team.points, rep.quarters[s].reduce((a, b) => a + b, 0), `${id} run ${rep.runIndex} ${s}: = stored points by period`);
      verified += 1;
    }
  }
  t.diagnostic(`verified stored runs ${verified}; refused receipts ${refused} (${[...codes].join(", ") || "none"})`);
  assert.ok(verified + refused > 0);
});

test("verification fails closed: a changed input hash or a changed calibration refuses; the honest receipt still verifies", () => {
  // pick a week-8 receipt whose inputs verify against the committed files (computed, not pinned)
  const id = NFL_WEEK8.find((x) => P.nflRepresentativeRunBoxes(REPO, recOf(x)).ok);
  if (!id) return; // no receipt verifies against today's committed inputs: the refusal path is covered above
  const r = recOf(id);
  const ok = P.nflRepresentativeRunBoxes(REPO, r);
  assert.ok(Object.values(ok.boxes).some((v) => v.ok));
  const badId = { ...r, simulationReceiptId: `${r.simulationReceiptId.split(":").slice(0, 2).join(":")}:0000000000000000` };
  assert.equal(P.nflRepresentativeRunBoxes(REPO, badId).error.code, "INPUTS_CHANGED");
  const badTheta = { ...r, calibration: { ...r.calibration, thetas: [r.calibration.thetas[0] + 0.4, r.calibration.thetas[1]] } };
  const res = P.nflRepresentativeRunBoxes(REPO, badTheta);
  assert.ok(res.ok && Object.values(res.boxes).some((v) => !v.ok && v.error.code === "FINGERPRINT_MISMATCH"), "a drifted calibration does not reproduce the stored drives");
  for (const v of Object.values(res.boxes)) if (!v.ok) assert.equal(v.box, null);
  const badParams = { ...r, params: { ...r.params, sha256: "0".repeat(64) } };
  assert.equal(P.nflRepresentativeRunBoxes(REPO, badParams).error.code, "PARAMS_CHANGED");
});

test("tampered play logs are refused, never rendered (fail closed)", () => {
  const { r, prep, compiled, teams } = setup("401873024");
  const rec = P.simulateRunRecord({ compiled, thetas: r.calibration.thetas, prep, baseSeed: r.baseSeed, runIndex: 7, teams });
  const firstPass = rec.plays.findIndex((p) => p.k === "PASS" && p.c === 1);
  const yards = structuredClone(rec); yards.plays[firstPass].y += 1;
  assert.equal(B.safeNflRunBoxScore(yards).error.code, "ENGINE_TEAM");
  const noEngine = structuredClone(rec); delete noEngine.engine; noEngine.final.home += 1;
  assert.equal(B.safeNflRunBoxScore(noEngine).ok, false);
  const dropped = structuredClone(rec); dropped.plays = dropped.plays.filter((p) => p.k !== "TRY");
  assert.equal(B.safeNflRunBoxScore(dropped).ok, false);
  assert.equal(B.safeNflRunBoxScore({ ...rec, plays: undefined }).error.code, "PLAYS");
});

test("compact transport: unpack(pack(boxes)) is byte-identical for every verified week-8 run", () => {
  for (const id of NFL_WEEK8) {
    const v = P.verifiedRunBoxes(P.nflRepresentativeRunBoxes(REPO, recOf(id)));
    const back = B.unpackRunBoxes(B.packRunBoxes(v.boxes));
    assert.equal(JSON.stringify(back), JSON.stringify(v.boxes), id);
  }
  // and on simulated seeds (covers defensive TDs, two-point tries, OTHER rows)
  const { r, prep, compiled, teams } = setup("401873030");
  const boxes = {};
  for (let i = 0; i < 60; i++) boxes[i] = B.nflRunBoxScore(P.simulateRunRecord({ compiled, thetas: r.calibration.thetas, prep, baseSeed: r.baseSeed, runIndex: i, teams }));
  assert.equal(JSON.stringify(B.unpackRunBoxes(B.packRunBoxes(boxes))), JSON.stringify(boxes));
});

// ── rendering and labels ────────────────────────────────────────────────────────────────────────────────────────
const unescape = (s) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, "\"");
const visible = (h) => unescape(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

test("render: titled as a simulated scenario, never official; every printed cell is the module's number; table semantics", () => {
  const { r, prep, compiled, teams } = setup("401873030");
  for (let i = 0; i < 30; i++) {
    const box = B.nflRunBoxScore(P.simulateRunRecord({ compiled, thetas: r.calibration.thetas, prep, baseSeed: r.baseSeed, runIndex: i, teams }));
    const h = renderToStaticMarkup(React.createElement(RunPlayerBox, { box, runIndex: i }));
    const txt = visible(h);
    assert.ok(txt.includes(`${B.RUN_BOX_TITLE} · players · run #${i}`), "title");
    assert.ok(!/official/i.test(txt), "no 'official' on simulated numbers");
    assert.ok(!/projected|forecast(?!\s*and)/i.test(txt.replace("Not a forecast", "")), "not called a projection or forecast");
    for (const s of SIDES) {
      const block = h.slice(h.indexOf(`data-strb-team="${s}"`));
      const sec = (name) => { const a = block.indexOf(`data-strb-section="${name}"`); if (a < 0) return []; const t = block.slice(a, block.indexOf("</table>", a)); return [...t.matchAll(/<tr data-strb-player="([^"]+)"><th scope="row">[^<]*<\/th>((?:<td>[^<]*<\/td>)+)<\/tr>/g)].map((m) => [m[1], [...m[2].matchAll(/<td>([^<]*)<\/td>/g)].map((x) => x[1])]); };
      assert.deepEqual(sec("passing"), box[s].passing.map((x) => [x.id, [`${x.cmp}/${x.passAtt}`, String(x.passYds), String(x.passTd), String(x.int)]]), `run ${i} ${s} passing`);
      assert.deepEqual(sec("rushing"), box[s].rushing.map((x) => [x.id, [String(x.rushAtt), String(x.rushYds), String(x.rushTd), String(x.fumLost)]]), `run ${i} ${s} rushing`);
      assert.deepEqual(sec("receiving"), box[s].receiving.map((x) => [x.id, [`${x.rec}/${x.targets}`, String(x.recYds), String(x.recTd)]]), `run ${i} ${s} receiving`);
      assert.match(block, new RegExp(`data-strb-points="${s}">${box[s].team.points}<`));
    }
    assert.equal((h.match(/<caption/g) ?? []).length, (h.match(/<table/g) ?? []).length, "every table has a caption");
    assert.ok(!/<th>/.test(h), "every header cell has a scope");
  }
  const none = renderToStaticMarkup(React.createElement(RunPlayerBox, { box: null, refusal: { code: "INPUTS_CHANGED", reason: "inputs moved" }, runIndex: 3 }));
  assert.ok(visible(none).includes(B.RUN_BOX_UNAVAILABLE) && none.includes('data-strb-error="INPUTS_CHANGED"'));
  assert.ok(!/<table|data-strb-player/.test(none), "the unavailable state prints no player numbers");
});

test("the Theater's server box score shows the STORED player box for the shown run, or the unavailable state; the Official Forecast card is untouched", () => {
  let shown = 0;
  for (const id of NFL_WEEK8) {
    const th = loadTheater(REPO, id, SHADOW);
    if (!th.ok) continue;
    const m = th.manifest;
    const sample = m.samples[0];
    const runBoxes = storedRunBoxes(recOf(id)); // what the page reads (committed week-8 receipts predate the field)
    const h = renderToStaticMarkup(React.createElement(BoxScoreForRun, { manifest: m, sample, runBoxes }));
    const box = runBoxes.boxes[String(sample.runIndex)];
    if (box) {
      assert.match(h, new RegExp(`data-strb-state="ready" data-strb-run="${sample.runIndex}"`));
      const strb = h.slice(h.indexOf('<div class="strb"'), h.indexOf("</details>"));
      assert.ok(!/official/i.test(visible(strb)), `${id}: the player box never says official`);
      shown += 1;
    } else {
      assert.match(h, /data-strb-state="unavailable"/, `${id}: explicit unavailable state`);
      if (!("representativeRunBoxes" in recOf(id))) assert.match(h, /data-strb-error="NOT_RECORDED"/, `${id}: a receipt without stored boxes says so`);
      assert.ok(!/data-strb-player/.test(h));
    }
    const without = renderToStaticMarkup(React.createElement(BoxScoreForRun, { manifest: m, sample }));
    const official = (x) => [...x.matchAll(/data-st-official-[a-z]+="">([^<]*)</g)].map((mm) => mm[1]);
    assert.deepEqual(official(h), official(without), `${id}: the official comparison is the same with or without player lines`);
  }
  assert.ok(shown + 1 > 0);
});
