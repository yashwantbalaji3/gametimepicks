/**
 * NBA theater · adapter + validation: the fixture is schema-valid and marked, every contract invariant rejects its
 * mutation, only present samples are offered, and the source switch is one line.
 * Run: npx tsx --test src/lib/simulation-theater/nba/nba-adapter.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { FIXTURE_BANNER, NBA_ENGINE_ID, adaptNbaArtifact, checkHistogram, defaultSampleIndex } from "./adapter-nba-sim-v1.mjs";
import { SAMPLE_LABELS, validateSample } from "./validate-sample.mjs";
import { NBA_FIXTURE_SOURCE, NBA_REAL_TEST_FIXTURE_SOURCE, NBA_THEATER_DATE, NBA_THEATER_SOURCE, loadNbaTheater, readArtifact, usableNbaEvents, v1ArtifactSource } from "./loader.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const FIX_REL = "src/lib/simulation-theater/nba/__fixtures__/nba-sim-v1-fixture.json";
const FIXTURE = JSON.parse(fs.readFileSync(path.join(APP, FIX_REL), "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const base = () => clone(FIXTURE.games[0].forecast.representativeSamples[0]);
const codes = (s, sims = 4000) => validateSample(s, { simulations: sims }).errors.map((e) => e.code);

test("the fixture is marked fixture: true, carries the engine id and adapts with every sample valid", () => {
  assert.equal(FIXTURE.fixture, true);
  assert.match(FIXTURE.fixtureNote, /TEST FIXTURE — not model output/);
  assert.equal(FIXTURE.games.length, 3);
  for (const g of FIXTURE.games) {
    assert.equal(g.forecast.modelVersion, NBA_ENGINE_ID);
    const r = adaptNbaArtifact(FIXTURE, g.providerEventId, { file: FIX_REL });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    assert.equal(r.manifest.fixture, true);
    for (const s of r.manifest.samples) assert.deepEqual(s.validation.errors, [], `${g.providerEventId} ${s.label}`);
    assert.ok(r.manifest.sim.totalHistogram?.length > 20);
  }
  assert.equal(FIXTURE_BANNER, "TEST FIXTURE — not model output");
});

test("the fixture generator is deterministic (re-running it reproduces the committed file byte for byte)", () => {
  // integration 2026-10-19: written to a temp file (the test never rewrites the committed fixture) from the PINNED roster
  // extract, so a later roster capture on main cannot turn this red; the generator no longer reads rosters/latest.json
  const gen = path.join(APP, "src/lib/simulation-theater/nba/__fixtures__/generate-nba-fixture.mjs");
  assert.doesNotMatch(fs.readFileSync(gen, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""), /rosters\/latest\.json/, "the generator reads the pinned roster, not the live capture");
  const before = fs.readFileSync(path.join(APP, FIX_REL), "utf8");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nba-fixture-"));
  for (const out of ["a.json", "b.json"]) {
    execFileSync(process.execPath, [gen, "--out", path.join(dir, out)], { cwd: APP, stdio: "pipe" });
    assert.equal(fs.readFileSync(path.join(dir, out), "utf8"), before, `${out}: byte-identical to the committed fixture`);
  }
  assert.equal(fs.readFileSync(path.join(APP, FIX_REL), "utf8"), before, "the committed fixture is untouched");
});

test("a baseline sample passes; each contract invariant rejects its mutation", () => {
  assert.deepEqual(codes(base()), []);
  const cases = [
    ["PERIOD_SUM", (s) => { s.periods[1].home += 2; }],
    ["TEAM_PTS", (s) => { s.team.home.pts += 1; }],
    ["PLAYER_PTS_SUM", (s) => { const p = s.players.home[0]; p.ftm += 1; p.pts += 1; }],
    ["PLAYER_PTS_FORMULA", (s) => { s.players.away[1].pts += 1; s.players.away[2].pts -= 1; }],
    ["THREE_PM_GT_PA", (s) => { const p = s.players.home[0]; p.threePa = p.threePm - 1; }],
    ["MINUTES_SUM", (s) => { s.players.home[0].minutes += 0.5; }],
    ["MINUTES_RANGE", (s) => { s.players.away[0].minutes += 20; s.players.away[1].minutes -= 20; }],
    ["REB_SUM", (s) => { s.players.home[3].reb += 1; }],
    ["AST_GT_FGM", (s) => { s.team.away.ast = s.team.away.fgm + 1; }],
    ["TEAM_FGM", (s) => { s.team.home.fgm += 1; }],
    ["ZERO_MIN_STATS", (s) => { const p = s.players.home.find((x) => x.minutes === 0); p.reb = 1; }],
    ["TIED_FINAL", (s) => { const lo = s.final.home < s.final.away ? "home" : "away"; const d = Math.abs(s.final.home - s.final.away); s.final[lo] += d; s.periods[3][lo] += d; s.team[lo].pts += d; }],
    ["OT_COUNT", (s) => { s.overtimePeriods += 1; }],
    ["PERIOD_SEQUENCE", (s) => { s.periods[2].label = "Q4"; }],
    ["NEGATIVE_OR_NONINT", (s) => { s.players.home[0].ast = 1.5; }],
    ["LABEL_UNKNOWN", (s) => { s.label = "median"; }],
    ["RUN_INDEX_RANGE", (s) => { s.runIndex = 4000; }],
    ["MALFORMED", (s) => { delete s.team; }],
  ];
  for (const [code, mutate] of cases) {
    const s = base();
    mutate(s);
    assert.ok(codes(s).includes(code), `${code} not raised: ${codes(s).join(",")}`);
  }
  // minutes: an OT sample needs 265 and allows 53
  const ot = clone(FIXTURE.games.flatMap((g) => g.forecast.representativeSamples).find((s) => s.overtimePeriods === 1));
  assert.deepEqual(codes(ot), []);
  const sum = ot.players.home.reduce((a, p) => a + p.minutes, 0);
  assert.ok(Math.abs(sum - 265) < 1e-6, `OT minutes ${sum}`);
});

test("every sample in the fixture satisfies the invariants directly (Σ periods = final = team = Σ players, minutes 240 + 25·OT)", () => {
  for (const g of FIXTURE.games) {
    for (const s of g.forecast.representativeSamples) {
      for (const side of ["home", "away"]) {
        const per = s.periods.reduce((a, p) => a + p[side], 0);
        const ply = s.players[side].reduce((a, p) => a + p.pts, 0);
        const min = s.players[side].reduce((a, p) => a + p.minutes, 0);
        assert.equal(per, s.final[side]);
        assert.equal(ply, s.final[side]);
        assert.equal(s.team[side].pts, s.final[side]);
        assert.ok(Math.abs(min - (240 + 25 * s.overtimePeriods)) < 1e-6);
        for (const p of s.players[side]) {
          assert.equal(p.pts, 3 * p.threePm + 2 * p.twoPm + p.ftm);
          assert.ok(p.threePm <= p.threePa);
        }
      }
      assert.notEqual(s.final.home, s.final.away);
    }
  }
});

test("artifact-level refusals: unmarked fixture, wrong engine, missing game, engine-reported violations, wrong artifact", () => {
  const id = FIXTURE.games[0].providerEventId;
  const unmarked = clone(FIXTURE); delete unmarked.fixture;
  assert.equal(adaptNbaArtifact(unmarked, id, { file: FIX_REL }).error.code, "FIXTURE_UNMARKED");
  const v0 = clone(FIXTURE); v0.games[0].forecast.modelVersion = "nba-preseason-experimental-v0";
  assert.equal(adaptNbaArtifact(v0, id).error.code, "ENGINE_MISMATCH");
  assert.equal(adaptNbaArtifact(FIXTURE, "999").error.code, "NO_GAME");
  const bad = clone(FIXTURE); bad.games[0].forecast.invariants.violations = 2;
  assert.equal(adaptNbaArtifact(bad, id).error.code, "ENGINE_INVARIANTS");
  const other = clone(FIXTURE); other.artifact = "nba-world-model";
  assert.equal(adaptNbaArtifact(other, id).error.code, "ARTIFACT_MISMATCH");
  // a real (unmarked) artifact outside __fixtures__ adapts, and is NOT a fixture
  const real = clone(FIXTURE); delete real.fixture; delete real.fixtureNote;
  const r = adaptNbaArtifact(real, id, { file: "data/internal/research/nba/experimental-v1/forecasts/2026-10-20.json" });
  assert.equal(r.ok, true);
  assert.equal(r.manifest.fixture, false);
  // the forecast block may also sit on the game itself (flat layout)
  const flat = clone(real); Object.assign(flat.games[0], flat.games[0].forecast); delete flat.games[0].forecast;
  assert.equal(adaptNbaArtifact(flat, id).ok, true);
});

test("a sample that fails validation is listed as unavailable (never drawn); duplicate labels are rejected", () => {
  const a = clone(FIXTURE);
  const id = a.games[0].providerEventId;
  a.games[0].forecast.representativeSamples[0].periods[0].home += 3;
  const m = adaptNbaArtifact(a, id).manifest;
  assert.equal(m.samples[0].validation.ok, false);
  assert.equal(defaultSampleIndex(m), 1, "the first VALID sample opens");
  const d = clone(FIXTURE);
  d.games[0].forecast.representativeSamples[1].label = "typical";
  const md = adaptNbaArtifact(d, id).manifest;
  assert.ok(md.samples.some((s) => s.validation.errors.some((e) => e.code === "LABEL_DUPLICATE")));
});

test("the outcome list holds only samples present in the data, in canonical order (upset omitted when absent)", () => {
  for (const g of FIXTURE.games) {
    const m = adaptNbaArtifact(FIXTURE, g.providerEventId).manifest;
    const present = g.forecast.representativeSamples.map((s) => s.label);
    assert.deepEqual(m.samples.map((s) => s.label), SAMPLE_LABELS.filter((l) => present.includes(l)));
  }
  const nyk = adaptNbaArtifact(FIXTURE, "401909089").manifest;
  assert.ok(!nyk.samples.some((s) => s.label === "upset"), "PHI @ NYK has no upset sample in the fixture");
  // shuffled input order is normalised
  const sh = clone(FIXTURE); sh.games[0].forecast.representativeSamples.reverse();
  assert.deepEqual(adaptNbaArtifact(sh, sh.games[0].providerEventId).manifest.samples.map((s) => s.label), ["typical", "close", "high", "low", "upset"]);
});

test("histogram check: probabilities must sum to 1 over integer bins; a bad histogram is dropped with a note, not the sample", () => {
  assert.equal(checkHistogram(FIXTURE.games[0].forecast.sim.totalHistogram).ok, true);
  assert.equal(checkHistogram([{ value: 200, probability: 0.5 }]).ok, false);
  const a = clone(FIXTURE); a.games[0].forecast.sim.totalHistogram[0].probability += 0.2;
  const m = adaptNbaArtifact(a, a.games[0].providerEventId).manifest;
  assert.equal(m.sim.totalHistogram, null);
  assert.match(m.sim.histogramNote, /sum/);
  assert.ok(m.samples.every((s) => s.validation.ok));
});

test("loader: the route reads the COMMITTED private v1 receipt (ONE source line, never a fixture); the r2 copy is a test fixture only; missing fails closed", () => {
  assert.deepEqual(NBA_THEATER_SOURCE, v1ArtifactSource(NBA_THEATER_DATE));
  assert.equal(NBA_THEATER_SOURCE.kind, "artifact");
  assert.ok(!/__fixtures__/.test(NBA_THEATER_SOURCE.path), "the route source is not under __fixtures__");
  assert.equal(NBA_REAL_TEST_FIXTURE_SOURCE.kind, "test-fixture-copy");
  const src = fs.readFileSync(path.join(APP, "src/lib/simulation-theater/nba/loader.mjs"), "utf8");
  const lines = src.split("\n").filter((l) => /^export const NBA_THEATER_SOURCE = /.test(l));
  assert.deepEqual(lines, ["export const NBA_THEATER_SOURCE = v1ArtifactSource(NBA_THEATER_DATE);"], "exactly one SOURCE line, the committed receipt");
  assert.equal(v1ArtifactSource("2026-10-20").path, "data/internal/research/nba/experimental-v1/forecasts/2026-10-20.json");
  assert.deepEqual(usableNbaEvents(REPO, { source: NBA_REAL_TEST_FIXTURE_SOURCE }), ["401909088", "401909089", "401909090"]);
  assert.deepEqual(usableNbaEvents(REPO, { source: NBA_FIXTURE_SOURCE }), ["401909088", "401909089", "401909090"]);
  const t = loadNbaTheater(REPO, "401909089", { source: NBA_REAL_TEST_FIXTURE_SOURCE });
  assert.equal(t.ok, true);
  assert.equal(t.manifest.fixture, false);
  assert.equal(t.palettes.team.mode, "team");
  const missing = loadNbaTheater(REPO, "401909089", { source: v1ArtifactSource("1999-01-01") });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "NO_ARTIFACT");
  assert.deepEqual(usableNbaEvents(REPO, { source: v1ArtifactSource("1999-01-01") }), []);
});

// ── the REAL nba-sim-v1-coherent artifact (dev copy with provenance) ─────────────────────────────────────────────
const REAL_REL = "src/lib/simulation-theater/nba/__fixtures__/nba-sim-v1-real-2026-10-20-r2.json";
const REAL = JSON.parse(fs.readFileSync(path.join(APP, REAL_REL), "utf8"));
const PROV = JSON.parse(fs.readFileSync(path.join(APP, "src/lib/simulation-theater/nba/__fixtures__/nba-sim-v1-real-2026-10-20-r2.provenance.json"), "utf8"));

test("real v1 dev copy (r2): NOT a fixture, sha256 matches its provenance, engine id and inputAsOf as recorded, post-rounding-fix", () => {
  assert.equal(REAL.fixture, undefined, "a real artifact carries no fixture flag");
  assert.equal(REAL.modelVersion, "nba-sim-v1-coherent");
  assert.equal(PROV.modelVersion, REAL.modelVersion);
  assert.equal(PROV.inputAsOf, REAL.inputAsOf);
  assert.equal(PROV.generatedAt, REAL.generatedAt);
  const r = readArtifact(REPO, NBA_REAL_TEST_FIXTURE_SOURCE);
  assert.equal(r.provenance.verified, true, `sha ${r.provenance.actualSha256} ≠ ${PROV.sha256}`);
  assert.equal(PROV.sha256, "c4612dc4e8ab924e6b1f1fc8af9c713d1494f5cf731c6719dbb34f9c8adcc261");
  assert.equal(PROV.minutesExact, true);
  assert.equal(PROV.supersedes.sha256, "45df05d89d2d0eedd9214f5c5dfeb038aaf5740ba881b234fe660145e2cc3e11", "the pre-rounding-fix copy is named as superseded");
  assert.ok(!fs.existsSync(path.join(APP, "src/lib/simulation-theater/nba/__fixtures__/nba-sim-v1-real-2026-10-20.json")), "the pre-fix copy is gone from the tree");
  assert.deepEqual(REAL.games.map((g) => g.providerEventId), ["401909088", "401909089", "401909090"]);
  for (const g of REAL.games) assert.ok(Date.parse(g.receipt?.generatedAt ?? REAL.generatedAt) < Date.parse(g.dateUtc), `${g.providerEventId}: built before tip`);
});

test("real v1 dev copy (r2): CONSERVATION in every one of the 15 samples — side minutes = 240 + 25·OT exactly, Σ player pts = team pts = final = Σ periods; no rounding note", () => {
  const r = readArtifact(REPO, NBA_REAL_TEST_FIXTURE_SOURCE);
  const rows = [];
  for (const g of REAL.games) {
    const a = adaptNbaArtifact(REAL, g.providerEventId, { file: REAL_REL, provenance: r.provenance });
    assert.equal(a.ok, true, JSON.stringify(a.error));
    assert.equal(a.manifest.fixture, false);
    assert.ok(a.manifest.provenance?.sha256);
    assert.equal(a.manifest.samples.length, 5);
    for (const s of a.manifest.samples) {
      const tag = `${g.providerEventId} ${s.label} #${s.runIndex}`;
      assert.deepEqual(s.validation.errors, [], tag);
      assert.deepEqual(s.validation.notes, [], `${tag}: exact source, so no MINUTES_ROUNDED note`);
      for (const side of ["home", "away"]) {
        const mins = s.players[side].reduce((x, p) => x + p.minutes, 0);
        assert.ok(Math.abs(mins - (240 + 25 * s.overtimePeriods)) < 1e-6, `${tag} ${side}: Σ minutes ${mins}`);
        const pts = s.players[side].reduce((x, p) => x + p.pts, 0);
        assert.equal(pts, s.team[side].pts, `${tag} ${side}: Σ player pts`);
        assert.equal(s.team[side].pts, s.final[side], `${tag} ${side}: team = final`);
        assert.equal(s.periods.reduce((x, p) => x + p[side], 0), s.final[side], `${tag} ${side}: Σ periods`);
      }
      rows.push(`${g.providerEventId} ${s.label}#${s.runIndex}${s.overtimePeriods ? ` OT${s.overtimePeriods}` : ""}`);
    }
    assert.ok(Object.keys(a.manifest.playRates.home).length > 5, "playRate per v1 player row");
    assert.ok(a.manifest.sim.totalHistogram.length > 50);
  }
  assert.equal(rows.length, 15);
  console.log(`# real v1 r2: 15 samples conserve minutes and points exactly (${rows.join(", ")})`);
});

test("exact source fails closed: with minutesExact a 0.01-minute drift is MINUTES_SUM (no note), without it the documented allowance applies", () => {
  const r = readArtifact(REPO, NBA_REAL_TEST_FIXTURE_SOURCE);
  const drifted = clone(REAL);
  const ps = drifted.games[0].forecast.representativeSamples[0].players.home;
  const i = ps.findIndex((p) => p.minutes > 1);
  ps[i].minutes = Math.round((ps[i].minutes + 0.01) * 100) / 100;
  const exact = adaptNbaArtifact(drifted, drifted.games[0].providerEventId, { file: REAL_REL, provenance: r.provenance });
  const s0 = exact.manifest.samples.find((s) => s.runIndex === drifted.games[0].forecast.representativeSamples[0].runIndex);
  assert.equal(s0.validation.ok, false);
  assert.ok(s0.validation.errors.some((e) => e.code === "MINUTES_SUM" && /exact source/.test(e.detail)));
  const lax = adaptNbaArtifact(drifted, drifted.games[0].providerEventId, { file: REAL_REL, provenance: { ...r.provenance, minutesExact: false } });
  const s1 = lax.manifest.samples.find((s) => s.runIndex === s0.runIndex);
  assert.equal(s1.validation.ok, true);
  assert.ok(s1.validation.notes.some((n) => n.code === "MINUTES_ROUNDED"));
  // and a points leak fails closed whatever the source
  const leak = clone(REAL);
  const p = leak.games[1].forecast.representativeSamples[0].players.away.find((x) => x.minutes > 10);
  p.ftm += 1; p.pts += 1;
  const bad = adaptNbaArtifact(leak, leak.games[1].providerEventId, { file: REAL_REL, provenance: r.provenance });
  assert.ok(bad.manifest.samples.find((s) => s.runIndex === leak.games[1].forecast.representativeSamples[0].runIndex).validation.errors.some((e) => e.code === "PLAYER_PTS_SUM"));
});

test("a dev copy is refused without verified provenance (missing or tampered sidecar), so nothing unmarked under __fixtures__ passes", () => {
  const id = REAL.games[0].providerEventId;
  assert.equal(adaptNbaArtifact(REAL, id, { file: REAL_REL }).error.code, "FIXTURE_UNMARKED");
  assert.equal(adaptNbaArtifact(REAL, id, { file: REAL_REL, provenance: { verified: false } }).error.code, "FIXTURE_UNMARKED");
  const tampered = loadNbaTheater(REPO, id, { source: NBA_REAL_TEST_FIXTURE_SOURCE, read: { ...readArtifact(REPO, NBA_REAL_TEST_FIXTURE_SOURCE), provenance: { ...PROV, verified: false } } });
  assert.equal(tampered.ok, false);
});

test("minutes rounding allowance: only for values serialized at 0.01, only within 0.005 × players; anything else fails", () => {
  // the r2 copy sums exactly, so plant the pre-fix drift (−0.02 on one side, still at 0.01 resolution) to exercise it
  const s = clone(REAL.games[0].forecast.representativeSamples[0]);
  const j = s.players.home.findIndex((p) => p.minutes > 1);
  s.players.home[j].minutes = Math.round((s.players.home[j].minutes - 0.02) * 100) / 100;
  const v = validateSample(s, { simulations: 10000 });
  assert.equal(v.ok, true);
  assert.ok(v.notes.some((n) => n.code === "MINUTES_ROUNDED"));
  assert.ok(validateSample(s, { simulations: 10000, exactMinutes: true }).errors.some((e) => e.code === "MINUTES_SUM"), "no allowance for an exact source");
  const far = clone(s); far.players.home[0].minutes = Math.round((far.players.home[0].minutes + 0.3) * 100) / 100;
  assert.ok(validateSample(far, { simulations: 10000 }).errors.some((e) => e.code === "MINUTES_SUM"), "0.3 min off is beyond rounding");
  const fine = clone(s); fine.players.home[0].minutes += 0.001; // not at 0.01 resolution: strict 1e-6 applies
  assert.ok(validateSample(fine, { simulations: 10000 }).errors.some((e) => e.code === "MINUTES_SUM"));
});
