/**
 * NBA theater · PROJECTED FINAL BOX SCORE (box-score.mjs) on all 15 real samples of the r2 dev copy (3 games × 5):
 * invariants, modeled-only columns, DNP ≠ 0, not-simulated roster players, sortability, determinism, OT, and a mutation
 * per fail-closed code.
 * Run: npx tsx --test src/lib/simulation-theater/nba/box-score.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  BOX_COLUMNS, BOX_SCORE_KINDS, MODELED, NBA_BOX_SCORE_SCHEMA, NBA_BOX_WATERMARK, NOT_MODELED, REQUIRED_SORT_KEYS,
  nbaBoxScore, nextSort, sortBoxRows, teamMinutesFor,
} from "./box-score.mjs";
import { NBA_FIXTURE_SOURCE, NBA_REAL_TEST_FIXTURE_SOURCE, loadNbaTheater } from "./loader.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const IDS = ["401909088", "401909089", "401909090"];
const LOADS = IDS.map((id) => loadNbaTheater(REPO, id, { source: NBA_REAL_TEST_FIXTURE_SOURCE })); // verified copy of real output (TEST FIXTURE)
const ALL = LOADS.flatMap((l) => l.manifest.samples.map((s) => ({ m: l.manifest, s, tag: `${l.eventId} #${s.runIndex} ${s.label}` })));
const clone = (x) => JSON.parse(JSON.stringify(x));
const SIDES = ["away", "home"];
const EXPECTED_COLUMNS = ["MIN", "PTS", "REB", "AST", "3PM", "3PA", "2PM", "FTM"];

test("15 real samples, each builds a selected-run-sample box score with every invariant holding", () => {
  assert.equal(ALL.length, 15);
  const summary = {};
  for (const { m, s, tag } of ALL) {
    const r = nbaBoxScore(s, m);
    assert.equal(r.ok, true, `${tag}: ${JSON.stringify(r.errors)}`);
    const b = r.box;
    assert.equal(b.schema, NBA_BOX_SCORE_SCHEMA);
    assert.equal(b.kind, "selected-run-sample");
    assert.equal(b.watermark, NBA_BOX_WATERMARK);
    assert.equal(b.watermark, "PROJECTED · SIMULATED · NOT ACTUAL GAME STATISTICS · PRIVATE CANDIDATE MODEL");
    const ot = s.overtimePeriods;
    for (const side of SIDES) {
      const t = b.teams[side];
      const sampleRows = s.players[side];
      // player points sum == team score == Σ quarters (incl. OT) == final
      assert.equal(sampleRows.reduce((a, p) => a + p.pts, 0), s.final[side], `${tag} ${side} Σ pts`);
      assert.equal(t.totals.pts, s.final[side]);
      assert.equal(b.periods.reduce((a, p) => a + p[side], 0), s.final[side], `${tag} ${side} Σ periods`);
      // team minutes == 240 + 25·OT EXACTLY, in integer hundredths
      assert.equal(sampleRows.reduce((a, p) => a + Math.round(p.minutes * 100), 0), (240 + 25 * ot) * 100, `${tag} ${side} minutes`);
      assert.equal(t.totals.minutes, teamMinutesFor(ot));
      for (const p of sampleRows) {
        assert.ok(3 * p.threePm <= p.pts, `${tag} ${p.name}: 3·3PM ≤ PTS`);
        assert.ok(p.threePm <= p.threePa, `${tag} ${p.name}: 3PM ≤ 3PA`);
      }
      // the team block of the sample agrees with the column sums
      for (const k of ["pts", "reb", "ast", "threePm", "threePa", "twoPm", "ftm"]) assert.equal(t.totals[k], s.team[side][k], `${tag} ${side} ${k}`);
      assert.equal(t.rows.length, sampleRows.length, "every simulated player has a row");
    }
    assert.equal(b.header.status, `SIMULATED FINAL${ot === 1 ? "/OT" : ot > 1 ? `/${ot}OT` : ""}`);
    assert.equal(b.header.runIndex, s.runIndex);
    assert.equal(b.header.engine, m.modelVersion);
    assert.equal(b.header.inputAsOf, m.inputAsOf);
    assert.equal(b.header.matchup, `${m.teams.away.abbr} @ ${m.teams.home.abbr}`);
    assert.equal(b.header.overtimePeriods, ot);
    assert.match(b.provenance, new RegExp(`Run #${s.runIndex.toLocaleString("en-US")} of 10,000`));
    assert.match(b.provenance, /dev copy sha256 c4612dc4… verified/);
    (summary[m.eventId] ??= []).push(`${s.label}#${s.runIndex} ${b.header.matchup} ${s.final.away}-${s.final.home}${ot ? " OT" : ""} min ${b.teams.away.totals.minutes}/${b.teams.home.totals.minutes}`);
  }
  for (const [id, lines] of Object.entries(summary)) console.log(`# ${id}: ${lines.join(" | ")}`);
});

test("columns: exactly the fields the engine writes, each MODELED; nothing synthesized; the unmodeled stats are listed", () => {
  for (const { m, s } of ALL) {
    const b = nbaBoxScore(s, m).box;
    assert.deepEqual(b.columns.map((c) => c.label), EXPECTED_COLUMNS);
    assert.ok(b.columns.every((c) => c.modeled === MODELED && c.sortable));
    const keys = b.columns.map((c) => c.key);
    for (const side of SIDES) {
      for (const r of [...b.teams[side].rows]) {
        const extra = Object.keys(r).filter((k) => !["providerAthleteId", "name", "status", "modeledMinutes", ...keys].includes(k));
        assert.deepEqual(extra, [], `no synthesized field on ${r.name}`);
        assert.ok(!("fga" in r || "fgPct" in r || "fta" in r || "stl" in r || "starter" in r));
      }
    }
    const listed = b.notModeled.map((x) => x.stat).join(" | ");
    for (const re of [/FGA/, /FTA/, /OREB/, /STL/, /BLK/, /TOV/, /PF/, /\+\/−/, /Starter/, /Per-quarter/]) assert.match(listed, re);
  }
  assert.deepEqual(BOX_COLUMNS.map((c) => c.label), EXPECTED_COLUMNS);
  assert.ok(NOT_MODELED.length >= 7);
});

test("a column absent from the sample is dropped and listed, never filled in", () => {
  const { m, s } = ALL[0];
  const x = clone(s);
  for (const side of SIDES) for (const p of x.players[side]) delete p.threePa;
  const b = nbaBoxScore(x, m).box;
  assert.ok(b, "still builds without 3PA");
  assert.ok(!b.columns.some((c) => c.key === "threePa"));
  assert.ok(b.notModeled.some((n) => n.stat === "3PA" && /not in this sample/.test(n.why)));
  assert.ok(!b.invariantsChecked.includes("THREE_PM_GT_PA"), "3PM ≤ 3PA is checked only when 3PA exists");
  assert.ok(b.teams.home.rows.every((r) => !("threePa" in r)));
});

test("DNP vs 0: a simulated player with 0 minutes is DNP with null stats; a player who played keeps real zeros", () => {
  let dnp = 0;
  let playedZero = 0;
  for (const { m, s, tag } of ALL) {
    const b = nbaBoxScore(s, m).box;
    for (const side of SIDES) {
      for (const r of b.teams[side].rows) {
        const src = s.players[side].find((p) => p.providerAthleteId === r.providerAthleteId);
        if (src.minutes === 0) {
          dnp++;
          assert.equal(r.status, "dnp", `${tag} ${r.name}`);
          assert.equal(r.modeledMinutes, 0);
          for (const c of b.columns) assert.equal(r[c.key], null, `${tag} ${r.name}.${c.key} is null, not 0`);
        } else {
          assert.equal(r.status, "played");
          for (const c of b.columns) assert.equal(typeof r[c.key], "number");
          for (const c of b.columns.filter((c) => c.key !== "minutes")) if (r[c.key] === 0) playedZero++;
        }
      }
    }
  }
  assert.ok(dnp >= 15, `DNP rows across the 15 samples: ${dnp}`);
  assert.ok(playedZero > 0, "played rows carry genuine zeros");
  console.log(`# DNP rows: ${dnp}; genuine zero cells on played rows: ${playedZero}`);
});

test("rostered players the engine did not simulate are 'not-simulated' with their reason, never a row of zeros", () => {
  for (const l of LOADS) {
    for (const s of l.manifest.samples) {
      const b = nbaBoxScore(s, l.manifest).box;
      for (const side of SIDES) {
        const ns = b.teams[side].notSimulated;
        assert.deepEqual(ns.map((x) => x.name), (l.manifest.rosterNotSimulated[side]).map((x) => x.name).sort((a, c) => a.localeCompare(c, "en")));
        const ids = new Set(s.players[side].map((p) => p.providerAthleteId));
        for (const x of ns) {
          assert.equal(x.status, "not-simulated");
          assert.ok(["out", "insufficient-history", "no-expected-minutes"].includes(x.reason));
          assert.ok(!ids.has(x.providerAthleteId), `${x.name} is not also a simulated row`);
          assert.ok(!("pts" in x) && !("minutes" in x));
        }
      }
    }
  }
  const bos = nbaBoxScore(LOADS[0].manifest.samples[0], LOADS[0].manifest).box.teams.away;
  assert.equal(bos.abbr, "BOS");
  assert.deepEqual(bos.notSimulated.find((x) => x.name === "Devin Carter"), { providerAthleteId: "4433188", name: "Devin Carter", status: "not-simulated", reason: "out", injuryStatus: "Out" });
});

test("sortable: every required key both ways is monotone over played rows, DNP last, deterministic ties, input untouched", () => {
  assert.deepEqual([...REQUIRED_SORT_KEYS].sort(), ["ast", "minutes", "pts", "reb", "threePm"]);
  for (const { m, s, tag } of ALL) {
    const b = nbaBoxScore(s, m).box;
    for (const side of SIDES) {
      const rows = b.teams[side].rows;
      const before = JSON.stringify(rows);
      for (const key of b.columns.map((c) => c.key)) {
        for (const dir of ["desc", "asc"]) {
          const out = sortBoxRows(rows, { key, dir });
          assert.equal(out.length, rows.length);
          const firstDnp = out.findIndex((r) => r.status !== "played");
          if (firstDnp >= 0) assert.ok(out.slice(firstDnp).every((r) => r.status === "dnp"), `${tag} ${key} ${dir}: DNP last`);
          const played = out.filter((r) => r.status === "played");
          for (let i = 1; i < played.length; i++) {
            const a = played[i - 1][key];
            const c = played[i][key];
            assert.ok(dir === "desc" ? a >= c : a <= c, `${tag} ${side} ${key} ${dir} at ${i}`);
          }
          // shuffled input → the same order (ties broken by minutes, points, name, id)
          const shuffled = [...rows].reverse();
          assert.deepEqual(sortBoxRows(shuffled, { key, dir }), out, `${tag} ${key} ${dir}: order independent of input order`);
        }
      }
      assert.equal(JSON.stringify(rows), before, "sortBoxRows never mutates");
      // the default row order is modeled minutes, descending
      assert.deepEqual(rows, sortBoxRows(rows, { key: "minutes", dir: "desc" }));
    }
  }
  assert.deepEqual(nextSort({ key: "pts", dir: "desc" }, "pts"), { key: "pts", dir: "asc" });
  assert.deepEqual(nextSort({ key: "pts", dir: "asc" }, "pts"), { key: "pts", dir: "desc" });
  assert.deepEqual(nextSort({ key: "pts", dir: "asc" }, "reb"), { key: "reb", dir: "desc" });
});

test("deterministic: the same sample gives a byte-identical box score; player order in the input does not matter", () => {
  for (const { m, s } of ALL) {
    const a = JSON.stringify(nbaBoxScore(s, m));
    assert.equal(JSON.stringify(nbaBoxScore(clone(s), clone(m))), a);
    const x = clone(s);
    for (const side of SIDES) x.players[side].reverse();
    assert.equal(JSON.stringify(nbaBoxScore(x, m)), a, "input order is irrelevant");
  }
});

test("OT samples: FINAL/OT, OT1 in the quarter-by-quarter, 265 team minutes; the regulation samples have none", () => {
  const ot = ALL.filter(({ s }) => s.overtimePeriods > 0);
  assert.deepEqual(ot.map(({ tag }) => tag), ["401909090 #245 typical", "401909090 #245 close", "401909090 #8204 high"]);
  for (const { m, s } of ot) {
    const b = nbaBoxScore(s, m).box;
    assert.equal(b.header.status, "SIMULATED FINAL/OT");
    assert.deepEqual(b.periods.map((p) => p.label), ["Q1", "Q2", "Q3", "Q4", "OT1"]);
    assert.equal(b.periods[4].ot, true);
    assert.equal(b.teamMinutes, 265);
    for (const side of SIDES) assert.equal(b.teams[side].totals.minutes, 265);
    assert.ok(b.periods[0].home + b.periods[1].home + b.periods[2].home + b.periods[3].home === b.periods[0].away + b.periods[1].away + b.periods[2].away + b.periods[3].away, "regulation was tied");
  }
  for (const { m, s } of ALL.filter(({ s }) => s.overtimePeriods === 0)) {
    const b = nbaBoxScore(s, m).box;
    assert.equal(b.header.status, "SIMULATED FINAL");
    assert.equal(b.periods.length, 4);
    assert.equal(b.teamMinutes, 240);
  }
});

test("leaders: top scorer / rebounder / assister, game-wide and per team, ties all listed", () => {
  for (const { m, s } of ALL) {
    const b = nbaBoxScore(s, m).box;
    for (const k of ["pts", "reb", "ast"]) {
      const all = SIDES.flatMap((side) => s.players[side].filter((p) => p.minutes > 0).map((p) => ({ side, ...p })));
      const best = Math.max(...all.map((p) => p[k]));
      assert.equal(b.leaders.game[k].value, best);
      assert.deepEqual(b.leaders.game[k].players.map((p) => p.name), all.filter((p) => p[k] === best).map((p) => p.name).sort((a, c) => a.localeCompare(c, "en")));
      for (const side of SIDES) assert.equal(b.leaders[side][k].value, Math.max(...s.players[side].filter((p) => p.minutes > 0).map((p) => p[k])));
    }
  }
  const tie = ALL.find(({ tag }) => tag === "401909089 #394 upset");
  assert.deepEqual(nbaBoxScore(tie.s, tie.m).box.leaders.game.pts.players.map((p) => p.name), ["Jalen Brunson", "Joel Embiid"]);
});

test("kinds: only selected-run-sample is built; median and actual are refused with their reasons", () => {
  const { m, s } = ALL[0];
  assert.deepEqual(BOX_SCORE_KINDS, { SAMPLE: "selected-run-sample", MEDIAN: "per-player-median", ACTUAL: "actual" });
  const med = nbaBoxScore(s, m, { kind: "per-player-median" });
  assert.equal(med.ok, false);
  assert.equal(med.box, null);
  assert.equal(med.errors[0].code, "KIND_NOT_BUILT");
  assert.equal(nbaBoxScore(s, m, { kind: "actual" }).errors[0].code, "KIND_ACTUAL_NEVER");
  assert.equal(nbaBoxScore(s, m, { kind: "mean" }).errors[0].code, "KIND_UNKNOWN");
});

test("fail closed: each invariant rejects its mutation (no box, the code named)", () => {
  const { m, s } = ALL.find(({ s }) => s.overtimePeriods === 0);
  const firstPlayed = (x, side = "home") => x.players[side].find((p) => p.minutes > 0);
  const firstDnp = (x) => SIDES.flatMap((side) => x.players[side]).find((p) => p.minutes === 0);
  const cases = [
    ["PLAYER_PTS_SUM", (x) => { const p = firstPlayed(x); p.ftm += 1; p.pts += 1; }],
    ["PERIOD_SUM", (x) => { x.periods[1].home += 2; }],
    ["TIED_FINAL", (x) => { const d = x.final.home - x.final.away; x.final.home -= d; x.periods[3].home -= d; }],
    ["MINUTES_SUM", (x) => { const p = firstPlayed(x); p.minutes = Math.round((p.minutes + 0.01) * 100) / 100; }],
    ["MINUTES_RESOLUTION", (x) => { const ps = x.players.away.filter((p) => p.minutes > 0); ps[0].minutes += 0.004; ps[1].minutes -= 0.004; }],
    ["MINUTES_RANGE", (x) => { const ps = x.players.away.filter((p) => p.minutes > 0); ps[0].minutes += 30; ps[1].minutes -= 30; }],
    ["THREES_GT_PTS", (x) => { const p = firstPlayed(x); p.threePm = Math.floor(p.pts / 3) + 1; p.threePa = Math.max(p.threePa, p.threePm); }],
    ["THREE_PM_GT_PA", (x) => { const p = x.players.home.find((q) => q.threePm > 0); p.threePa = p.threePm - 1; }],
    ["PTS_FORMULA", (x) => { const a = firstPlayed(x, "away"); const b = x.players.away.filter((p) => p.minutes > 0)[1]; a.pts += 1; b.pts -= 1; }],
    ["DNP_WITH_STATS", (x) => { firstDnp(x).reb = 1; }],
    ["TEAM_BLOCK", (x) => { x.team.home.ast += 1; }],
    ["OT_COUNT", (x) => { x.overtimePeriods = 1; }],
    ["NEGATIVE_OR_NONINT", (x) => { firstPlayed(x).reb = -1; }],
    ["FIELD_MISSING", (x) => { delete firstPlayed(x).minutes; }],
    ["DUPLICATE_PLAYER", (x) => { x.players.home[1].providerAthleteId = x.players.home[0].providerAthleteId; }],
    ["SAMPLE_INVALID", (x) => { x.validation = { ok: false, errors: [{ code: "PERIOD_SUM", detail: "x" }], notes: [] }; }],
  ];
  assert.equal(nbaBoxScore(clone(s), m).ok, true, "the baseline passes");
  for (const [code, mutate] of cases) {
    const x = clone(s);
    mutate(x);
    const r = nbaBoxScore(x, m);
    assert.equal(r.ok, false, `${code}: must fail`);
    assert.equal(r.box, null, `${code}: no box`);
    assert.ok(r.errors.some((e) => e.code === code), `${code}: got ${r.errors.map((e) => e.code).join(", ")}`);
  }
  assert.equal(nbaBoxScore(null, m).errors[0].code, "MALFORMED");
});

test("minutes are exact with no rounding allowance (the r2 rounding regression): a 0.01 drift is MINUTES_SUM even off-source", () => {
  // validate-sample's NON-exact mode would only note a ±0.005·players drift; the box score never accepts one
  const { m, s } = ALL[3];
  const x = clone(s);
  const ps = x.players.home.filter((p) => p.minutes > 0);
  ps[0].minutes = Math.round((ps[0].minutes - 0.01) * 100) / 100;
  delete x.validation; // as if handed a raw sample with no adapter verdict
  const r = nbaBoxScore(x, m);
  assert.ok(r.errors.some((e) => e.code === "MINUTES_SUM" && /239\.99 ≠ 240/.test(e.detail)), JSON.stringify(r.errors));
});

test("the synthetic fixture builds too, and says it is a fixture", () => {
  for (const id of IDS) {
    const l = loadNbaTheater(REPO, id, { source: NBA_FIXTURE_SOURCE });
    for (const s of l.manifest.samples.filter((x) => x.validation.ok)) {
      const r = nbaBoxScore(s, l.manifest);
      assert.equal(r.ok, true, `${id} #${s.runIndex}: ${JSON.stringify(r.errors)}`);
      assert.equal(r.box.header.fixture, true);
      assert.match(r.box.provenance, /synthetic test fixture/);
    }
  }
});
