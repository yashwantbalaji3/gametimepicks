/**
 * NBA theater V2 · THREE-LAYER PROJECTED BOX SCORE (projected-box.mjs) on all 15 real samples of the r2 dev copy and on
 * the committed receipt: layer separation, the run's arithmetic invariants (player pts = team pts, 2·2PM + 3·3PM + FTM =
 * PTS, 3PM ≤ 3PA, FGM = 2PM + 3PM, minutes = 240 + 25·OT incl. a synthetic double overtime), "not modelled" columns,
 * the estimated role rule, the coordinator's v0.1-official snapshot shape (team scores WITHHELD, MIN/PRA/P+R/P+A
 * families), NO_OFFICIAL, fail-closed codes, and the what-if rule: choosing a hypothetical run never changes an
 * official number.
 * Run: npx tsx --test src/lib/simulation-theater/nba/projected-box.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  GROUPS, LAYER, LAYER_LABEL, NBA_PROJECTED_BOX_SCHEMA, NOT_MODELLED_COLUMNS, OFFICIAL_COLUMNS, REPRESENTATIVE_VS_MEDIAN, ROLE_METHOD, TEAM_SCORE_STATE,
  estimateRoles, nbaProjectedBox, nextProjectedSort, officialGameLine, officialLayerKey, officialLayerOf, sortProjectedRows,
} from "./projected-box.mjs";
import { NBA_BOX_WATERMARK, NBA_BOX_WATERMARK_WHAT_IF, nbaBoxScore } from "./box-score.mjs";
import { NBA_FIXTURE_SOURCE, NBA_REAL_TEST_FIXTURE_SOURCE, loadNbaTheater } from "./loader.mjs";
import { runRole } from "../representative-labels.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const IDS = ["401909088", "401909089", "401909090"];
const LOADS = IDS.map((id) => loadNbaTheater(REPO, id, { source: NBA_REAL_TEST_FIXTURE_SOURCE }));
const RECEIPT_LOADS = IDS.map((id) => loadNbaTheater(REPO, id)).filter((l) => l.ok); // the committed receipt the route reads
const ALL = [...LOADS, ...RECEIPT_LOADS].flatMap((l) => l.manifest.samples.map((s) => ({ m: l.manifest, s, tag: `${l.file.split("/").pop()} ${l.eventId} #${s.runIndex} ${s.label}` })));
const clone = (x) => JSON.parse(JSON.stringify(x));
const SIDES = ["away", "home"];
const rowsOf = (box, side) => box.teams[side].groups.flatMap((g) => g.rows);
const hyp = (m, s) => runRole(m, s.runIndex, s.title).hypothetical;

/** The coordinator's NBA official snapshot (2026-10-20): Elo side + v0.1 player medians/means; team scores WITHHELD. */
function coordinatorShape(m, { declare = true } = {}) {
  const x = clone(m);
  const o = x.representative.official;
  o.team = { home: null, away: null, margin: null, total: null };
  o.projectedScore = { home: null, away: null, convention: null };
  o.winnerSide = "home";
  if (declare) o.teamScores = { state: "WITHHELD", reason: "the official side model and the supporting simulation disagree" };
  for (const p of Object.values(x.representative.players)) {
    const f = p.families;
    const med = (k) => f[k]?.median ?? 0;
    f.minutes = { expected: 27.31, median: 27.4 };
    f.pra = { expected: 20.25, median: med("pts") + med("reb") + med("ast") + 0.5 };
    f.ptsReb = { expected: 15.5, median: med("pts") + med("reb") + 0.25 };
    f.ptsAst = { expected: 14.75, median: med("pts") + med("ast") + 0.75 };
    p.conditioning = "AS_PROJECTED";
    p.playRate = null;
  }
  return x;
}

test("every real sample (r2 dev copy + committed receipt) builds; schema, three labelled layers, columns in layer order", () => {
  assert.ok(ALL.length >= 15, `${ALL.length} samples`);
  for (const { m, s, tag } of ALL) {
    const r = nbaProjectedBox(s, m, { hypothetical: hyp(m, s) });
    assert.equal(r.ok, true, `${tag}: ${JSON.stringify(r.errors)}`);
    const b = r.box;
    assert.equal(b.schema, NBA_PROJECTED_BOX_SCHEMA);
    assert.equal(b.schema, "nba-projected-box@1");
    assert.equal(b.layers.official.label, "Official projection");
    assert.equal(b.layers.simulated.label, "Simulated game — one run");
    assert.equal(b.layers.estimated.label, "Estimated · not official");
    assert.equal(b.layers.simulated.runIndex, s.runIndex);
    // columns: official first, then simulated, then not modelled; never interleaved
    const order = b.columns.map((c) => c.layer);
    const rank = { official: 0, simulated: 1, "not-modelled": 2 };
    assert.deepEqual(order, [...order].sort((a, c) => rank[a] - rank[c]), `${tag}: ${order.join(",")}`);
    assert.deepEqual(b.columns.filter((c) => c.layer === LAYER.SIMULATED).map((c) => c.label), ["MIN", "PTS", "REB", "AST", "3PM", "3PA", "2PM", "FGM", "FTM"]);
    assert.deepEqual(b.columns.filter((c) => c.layer === LAYER.NOT_MODELLED).map((c) => c.label), ["FGA", "FTA", "STL", "BLK", "TO"]);
    assert.ok(b.columns.filter((c) => c.layer === LAYER.NOT_MODELLED).every((c) => !c.sortable && /not modelled/.test(c.title)));
    // today's v1-based snapshot carries pts/reb/ast/3PM per player
    assert.deepEqual(b.columns.filter((c) => c.layer === LAYER.OFFICIAL).map((c) => c.label), ["PTS", "REB", "AST", "3PM"]);
    assert.equal(b.watermark, hyp(m, s) ? NBA_BOX_WATERMARK_WHAT_IF : NBA_BOX_WATERMARK);
  }
});

test("simulated layer: the run's own whole numbers, and every arithmetic identity holds per player and per team", () => {
  for (const { m, s, tag } of ALL) {
    const b = nbaProjectedBox(s, m).box;
    const sim = nbaBoxScore(s, m).box;
    const ot = s.overtimePeriods;
    assert.equal(b.sim.periods.length, 4 + ot, `${tag}: Q1–Q4 + ${ot} OT`);
    assert.deepEqual(b.sim.periods.slice(4).map((p) => p.label), Array.from({ length: ot }, (_, i) => `OT${i + 1}`));
    for (const side of SIDES) {
      const rows = rowsOf(b, side);
      const played = rows.filter((r) => r.status === "played");
      const t = b.teams[side].totals.simulated;
      // player pts = team pts = Σ periods = final
      assert.equal(played.reduce((a, r) => a + r.simulated.pts, 0), s.final[side], `${tag} ${side} Σ pts`);
      assert.equal(t.pts, s.final[side]);
      assert.equal(b.sim.periods.reduce((a, p) => a + p[side], 0), s.final[side]);
      // minutes = 240 + 25·OT exactly (hundredths)
      assert.equal(played.reduce((a, r) => a + Math.round(r.simulated.minutes * 100), 0), (240 + 25 * ot) * 100, `${tag} ${side} minutes`);
      assert.equal(t.minutes, 240 + 25 * ot);
      for (const r of played) {
        const p = r.simulated;
        assert.equal(2 * p.twoPm + 3 * p.threePm + p.ftm, p.pts, `${tag} ${r.name}: 2·2PM + 3·3PM + FTM = PTS`);
        assert.ok(p.threePm <= p.threePa, `${tag} ${r.name}: 3PM ≤ 3PA`);
        assert.equal(p.fgm, p.twoPm + p.threePm, `${tag} ${r.name}: FGM = 2PM + 3PM`);
        for (const v of Object.values(p)) assert.ok(v >= 0);
        for (const k of ["pts", "reb", "ast", "threePm", "threePa", "twoPm", "ftm", "fgm"]) assert.ok(Number.isInteger(p[k]), `${tag} ${r.name}.${k} whole`);
        // the same numbers as the run's own box score (nothing re-derived, nothing rounded)
        const src = sim.teams[side].rows.find((x) => x.providerAthleteId === r.providerAthleteId);
        for (const k of ["minutes", "pts", "reb", "ast", "threePm", "threePa", "twoPm", "ftm"]) assert.equal(p[k], src[k]);
      }
      assert.equal(2 * t.twoPm + 3 * t.threePm + t.ftm, t.pts, `${tag} ${side} team formula`);
      assert.equal(t.fgm, s.team[side].fgm, `${tag} ${side}: team FGM = the run's team block`);
      // DNP and not-simulated rows carry no simulated number, never a 0
      for (const r of rows.filter((x) => x.status !== "played")) assert.equal(r.simulated, null, `${tag} ${r.name}`);
      // no unmodelled field anywhere
      for (const r of rows) for (const k of NOT_MODELLED_COLUMNS.map((c) => c.key)) assert.ok(!(r.simulated && k in r.simulated) && !(r.official?.values && k in r.official.values));
    }
    assert.ok(b.layers.simulated.invariantsChecked.includes("FGM_SUM") && b.layers.simulated.invariantsChecked.includes("TEAM_FGM"));
  }
});

test("OT accounting: a synthetic double overtime is FINAL/2OT with 290 team minutes; a missing OT minute fails closed", () => {
  const base = ALL.find(({ s }) => s.overtimePeriods === 1);
  assert.ok(base, "the r2 copy has an overtime sample");
  const x = clone(base.s);
  x.periods.push({ period: 6, label: "OT2", home: 0, away: 0 });
  x.overtimePeriods = 2;
  for (const side of SIDES) {
    const top = x.players[side].filter((p) => p.minutes > 0).sort((a, b) => b.minutes - a.minutes).slice(0, 5);
    for (const p of top) p.minutes = Math.round((p.minutes + 5) * 100) / 100;
  }
  const r = nbaProjectedBox(x, base.m);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.box.sim.header.status, "SIMULATED FINAL/2OT");
  assert.equal(r.box.sim.teamMinutes, 290);
  for (const side of SIDES) assert.equal(r.box.teams[side].totals.simulated.minutes, 290);
  assert.deepEqual(r.box.sim.periods.map((p) => p.label), ["Q1", "Q2", "Q3", "Q4", "OT1", "OT2"]);
  const short = clone(x);
  short.players.home.find((p) => p.minutes > 5).minutes -= 5;
  const bad = nbaProjectedBox(short, base.m);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.code === "MINUTES_SUM" && /285\.00 ≠ 290/.test(e.detail)), JSON.stringify(bad.errors));
});

test("official layer: exact snapshot values by athlete id, never rounded, never summed into team totals", () => {
  for (const { m, s, tag } of ALL) {
    const b = nbaProjectedBox(s, m).box;
    const players = m.representative.players;
    let matched = 0;
    for (const side of SIDES) {
      for (const r of rowsOf(b, side)) {
        const e = players[String(r.providerAthleteId)];
        if (!e) { assert.equal(r.official, null, `${tag} ${r.name}`); continue; }
        matched++;
        for (const [k, v] of Object.entries(r.official.values)) {
          assert.equal(v.median, e.families[k].median, `${tag} ${r.name}.${k} median exact`);
          assert.equal(v.mean, e.families[k].expected, `${tag} ${r.name}.${k} mean exact`);
        }
      }
      // official team totals: points only (from the official team term), nothing else summed
      assert.deepEqual(Object.keys(b.teams[side].totals.official).sort(), ["pts", "state"]);
      assert.deepEqual(b.teams[side].totals.official.pts, { median: m.representative.official.team[side].median, mean: m.representative.official.team[side].expected });
    }
    assert.ok(matched > 15, `${tag}: ${matched} official rows`);
    assert.equal(b.officialGame.teamScores.state, TEAM_SCORE_STATE.AVAILABLE);
  }
});

test("what-if rule: the official layer is identical for every stored run (official or hypothetical) and building never mutates the manifest", () => {
  for (const load of [...LOADS, ...RECEIPT_LOADS]) {
    const m = load.manifest;
    const before = JSON.stringify(m);
    const offIdx = m.representative.officialRunIndex;
    assert.ok(Number.isInteger(offIdx), `${load.eventId}: an official representative exists`);
    const ref = officialLayerOf(nbaProjectedBox(m.samples.find((s) => s.runIndex === offIdx), m, { hypothetical: false }).box);
    let whatIfs = 0;
    for (const s of m.samples) {
      for (const h of [false, true]) {
        const b = nbaProjectedBox(s, m, { hypothetical: h }).box;
        assert.deepEqual(officialLayerOf(b), ref, `${load.eventId} #${s.runIndex} hypothetical=${h}: official layer moved`);
        assert.equal(officialLayerKey(b), officialLayerKey(nbaProjectedBox(m.samples[0], m).box));
      }
      if (hyp(m, s)) whatIfs++;
    }
    assert.ok(whatIfs >= 3, `${load.eventId}: ${whatIfs} what-if runs exercised`);
    assert.equal(JSON.stringify(m), before, `${load.eventId}: manifest mutated`);
    // and the simulated layer DOES move between runs (the test would be vacuous otherwise)
    const keys = new Set(m.samples.map((s) => JSON.stringify(nbaProjectedBox(s, m).box.teams.home.totals.simulated)));
    assert.ok(keys.size > 1);
  }
});

test("coordinator snapshot shape: team scores WITHHELD (null), v0.1 families incl. MIN / PRA / P+R / P+A, Elo side — builds, prints no team number", () => {
  for (const load of LOADS) {
    const m = coordinatorShape(load.manifest);
    for (const s of m.samples) {
      const r = nbaProjectedBox(s, m, { hypothetical: hyp(m, s) });
      assert.equal(r.ok, true, JSON.stringify(r.errors));
      const b = r.box;
      assert.deepEqual(b.columns.filter((c) => c.layer === LAYER.OFFICIAL).map((c) => c.label), OFFICIAL_COLUMNS.map((c) => c.label));
      assert.deepEqual(OFFICIAL_COLUMNS.map((c) => c.label), ["MIN", "PTS", "REB", "AST", "3PM", "PRA", "P+R", "P+A"]);
      assert.equal(b.officialGame.teamScores.state, "WITHHELD");
      assert.equal(b.officialGame.teamScores.reason, "the official side model and the supporting simulation disagree");
      for (const k of ["home", "away", "margin", "total"]) assert.equal(b.officialGame.teamScores[k], null);
      for (const side of SIDES) assert.deepEqual(b.teams[side].totals.official, { state: "WITHHELD", pts: null });
      assert.equal(b.officialGame.winnerSide, "home");
      // the simulated layer is untouched by the official change
      assert.deepEqual(b.teams.home.totals.simulated, nbaProjectedBox(s, load.manifest).box.teams.home.totals.simulated);
      const any = rowsOf(b, "home").find((x) => x.official);
      assert.deepEqual(any.official.values.minutes, { median: 27.4, mean: 27.31 });
      assert.equal(any.official.conditioning, "AS_PROJECTED");
    }
  }
  // undeclared: all team terms null ⇒ still WITHHELD, with the neutral default reason
  const g = officialGameLine(coordinatorShape(LOADS[0].manifest, { declare: false }));
  assert.equal(g.teamScores.state, "WITHHELD");
  assert.match(g.teamScores.reason, /publishes no team score/);
});

test("NO_OFFICIAL: no representative ⇒ no official column, the simulated layer still builds, every run a what-if", () => {
  const m = clone(LOADS[1].manifest);
  delete m.representative;
  const r = nbaProjectedBox(m.samples[0], m, { hypothetical: true });
  assert.equal(r.ok, true);
  assert.equal(r.box.officialGame.state, "NO_OFFICIAL");
  assert.equal(r.box.layers.official.available, false);
  assert.equal(r.box.columns.filter((c) => c.layer === LAYER.OFFICIAL).length, 0);
  assert.ok(SIDES.every((side) => rowsOf(r.box, side).every((x) => x.official === null)));
  assert.equal(r.box.watermark, NBA_BOX_WATERMARK_WHAT_IF);
});

test("estimated role: ≤ 5 starters per team, each starterRate ≥ 0.5 and ranked first; labelled estimated; absent inputs ⇒ one Players group", () => {
  for (const { m, s, tag } of ALL) {
    const b = nbaProjectedBox(s, m).box;
    assert.deepEqual(b.layers.estimated.fields, ["role"]);
    assert.equal(b.layers.estimated.method.id, ROLE_METHOD.id);
    for (const side of SIDES) {
      const rows = rowsOf(b, side).filter((r) => r.status !== "not-simulated");
      const inputs = m.roleInputs[side];
      const starters = rows.filter((r) => r.role === "starter");
      assert.ok(starters.length >= 1 && starters.length <= 5, `${tag} ${side}: ${starters.length}`);
      for (const r of starters) assert.ok(inputs[r.providerAthleteId].starterRate >= 0.5);
      const minStarter = Math.min(...starters.map((r) => inputs[r.providerAthleteId].starterRate));
      for (const r of rows.filter((x) => x.role === "bench")) assert.ok(inputs[r.providerAthleteId]?.starterRate == null || inputs[r.providerAthleteId].starterRate <= minStarter, `${tag} ${r.name}`);
      assert.ok(rowsOf(b, side).filter((r) => r.status === "not-simulated").every((r) => r.role === null));
      const groups = b.teams[side].groups.map((g) => g.id);
      assert.deepEqual(groups, ["starters", "bench", "dnp", "unavailable"].filter((g) => groups.includes(g)));
      for (const g of b.teams[side].groups) {
        assert.equal(g.label, GROUPS[g.id]);
        if (g.id === "starters" || g.id === "bench") { assert.equal(g.layer, LAYER.ESTIMATED); assert.match(g.label, /estimated/); }
        if (g.id === "dnp") assert.ok(g.rows.every((r) => r.status === "dnp"));
      }
    }
  }
  // the rule itself: ties broken by expected minutes, then id; the threshold holds
  const roles = estimateRoles(["a", "b", "c", "d", "e", "f", "g"], { a: { starterRate: 1, expectedMinutes: 30 }, b: { starterRate: 1, expectedMinutes: 34 }, c: { starterRate: 1, expectedMinutes: 20 }, d: { starterRate: 0.9 }, e: { starterRate: 0.6 }, f: { starterRate: 1, expectedMinutes: 10 }, g: { starterRate: 0.4 } });
  assert.deepEqual(Object.entries(roles).filter(([, v]) => v.role === "starter").map(([k]) => k).sort(), ["a", "b", "c", "d", "f"]);
  assert.equal(estimateRoles(["a"], { a: { starterRate: 0.4 } }).a.role, "bench");
  assert.equal(estimateRoles(["a"], {}), null);
  // the synthetic fixture has no starterRate: no role, one Players group
  const fx = loadNbaTheater(REPO, IDS[0], { source: NBA_FIXTURE_SOURCE });
  const fb = nbaProjectedBox(fx.manifest.samples.find((s) => s.validation.ok), fx.manifest).box;
  assert.deepEqual(fb.layers.estimated.fields, []);
  for (const side of SIDES) {
    assert.equal(fb.teams[side].rolesDerivable, false);
    assert.equal(fb.teams[side].groups[0].id, "players");
    assert.ok(rowsOf(fb, side).every((r) => r.role === null));
  }
});

test("fail closed: a run invariant, TEAM_FGM, and a malformed official value each refuse the whole box", () => {
  const { m, s } = ALL.find(({ s }) => s.overtimePeriods === 0);
  const cases = [
    ["PLAYER_PTS_SUM", (x) => { const p = x.s.players.home.find((q) => q.minutes > 0); p.ftm += 1; p.pts += 1; }],
    ["TEAM_FGM", (x) => { x.s.team.away.fgm += 1; }],
    ["THREE_PM_GT_PA", (x) => { const p = x.s.players.home.find((q) => q.threePm > 0); p.threePa = p.threePm - 1; }],
    ["OFFICIAL_VALUE", (x) => { const id = Object.keys(x.m.representative.players)[0]; x.m.representative.players[id].families.pts.median = -1; }],
    ["OFFICIAL_VALUE", (x) => { const id = Object.keys(x.m.representative.players)[0]; x.m.representative.players[id].families.reb.expected = "7"; }],
  ];
  assert.equal(nbaProjectedBox(s, m).ok, true);
  for (const [code, mutate] of cases) {
    const x = { s: clone(s), m: clone(m) };
    mutate(x);
    const r = nbaProjectedBox(x.s, x.m);
    assert.equal(r.ok, false, code);
    assert.equal(r.box, null);
    assert.ok(r.errors.some((e) => e.code === code), `${code}: ${r.errors.map((e) => e.code).join(", ")}`);
  }
});

test("sorting: by either layer, monotone with value-less rows last; deterministic; input untouched", () => {
  const { m, s } = ALL[0];
  const b = nbaProjectedBox(s, m).box;
  const rows = rowsOf(b, "home");
  const snap = JSON.stringify(rows);
  for (const sort of [{ layer: "official", key: "pts", dir: "desc" }, { layer: "official", key: "reb", dir: "asc", stat: "mean" }, { layer: "simulated", key: "pts", dir: "desc" }, { layer: "simulated", key: "minutes", dir: "asc" }]) {
    const out = sortProjectedRows(rows, sort);
    const val = (r) => (sort.layer === "official" ? r.official?.values?.[sort.key]?.[sort.stat === "mean" ? "mean" : "median"] ?? null : r.simulated?.[sort.key] ?? null);
    const vals = out.map(val);
    const firstNull = vals.indexOf(null);
    const head = firstNull < 0 ? vals : vals.slice(0, firstNull);
    assert.ok(firstNull < 0 || vals.slice(firstNull).every((v) => v === null), `${JSON.stringify(sort)}: nulls last`);
    for (let i = 1; i < head.length; i++) assert.ok(sort.dir === "desc" ? head[i - 1] >= head[i] : head[i - 1] <= head[i]);
    assert.deepEqual(sortProjectedRows(rows, sort).map((r) => r.name), out.map((r) => r.name));
  }
  assert.equal(JSON.stringify(rows), snap);
  assert.deepEqual(nextProjectedSort({ layer: "simulated", key: "pts", dir: "desc" }, "simulated", "pts"), { layer: "simulated", key: "pts", dir: "asc" });
  assert.deepEqual(nextProjectedSort({ layer: "simulated", key: "pts", dir: "desc" }, "official", "pts"), { layer: "official", key: "pts", dir: "desc" });
});

test("wording: the representative-vs-median explanation names both layers and never says 'projected'; labels are distinct", () => {
  const all = [REPRESENTATIVE_VS_MEDIAN.title, REPRESENTATIVE_VS_MEDIAN.lead, ...REPRESENTATIVE_VS_MEDIAN.points].join(" ");
  assert.match(all, /Official projection/);
  assert.match(all, /Simulated game — one run/);
  assert.match(all, /median/);
  assert.doesNotMatch(all, /projected/i);
  assert.equal(new Set(Object.values(LAYER_LABEL)).size, Object.values(LAYER_LABEL).length);
  assert.ok(!/official/i.test(LAYER_LABEL.estimated.replace("not official", "")), "the estimated label never reads as official");
});
