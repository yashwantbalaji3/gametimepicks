/**
 * Dixon-Coles v2 (private forward shadow). Run: cd app && npx tsx --test src/lib/sports/soccer/dixon-coles.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DC_V2_PARAMS, poissonPmf, tau, scoreMatrix, fitDixonColes, forecastFixtures, forecastMatch, decayWeight } from "./dixon-coles.mjs";
import { scoreMatrix as houseScoreMatrix } from "../epl/strength-state.mjs";
import { DC_V2_ESPN_CLUBS, footballDataClub } from "./dixon-coles-aliases.mjs";
import {
  DC_V2_PREREGISTRATION, preregistrationSha256, verifyPreregistration, canonicalJson, sha256Hex,
  newForecastsOnly, appendToDayFile, assertAppendOnly, gradeShadow, decide, seasonOf, pairingKey, mulberry32,
} from "./dixon-coles-shadow-record.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const LOW = new Set(["0-0", "0-1", "1-0", "1-1"]);
const LAMBDAS = [[0.3, 0.2], [1.45, 1.1], [2.8, 0.6], [0.9, 3.4], [4.5, 4.2]];
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
/** A league-average v1 state: unknown clubs get 1.0 multipliers, so the house grid runs at exactly (muHome, muAway). */
const houseAt = (lh, la, rho) => houseScoreMatrix({ muHome: lh, muAway: la, stats: new Map(), modelId: "test" }, "A", "B", { dixonColesRho: rho }).oneXTwo;

test("ρ = 0 reduces EXACTLY to independent Poisson — cell for cell, and against the house v1 grid", () => {
  for (const [lh, la] of LAMBDAS) {
    const m = scoreMatrix(lh, la, 0);
    const ph = [], pa = [];
    for (let k = 0; k <= DC_V2_PARAMS.maxGoals; k++) { ph.push(poissonPmf(lh, k)); pa.push(poissonPmf(la, k)); }
    let z = 0;
    for (let x = 0; x <= DC_V2_PARAMS.maxGoals; x++) for (let y = 0; y <= DC_V2_PARAMS.maxGoals; y++) z += ph[x] * pa[y];
    for (let x = 0; x <= DC_V2_PARAMS.maxGoals; x++) for (let y = 0; y <= DC_V2_PARAMS.maxGoals; y++) {
      assert.equal(tau(x, y, lh, la, 0), 1, `τ(${x},${y}) is exactly 1 at ρ = 0`);
      assert.equal(m.grid[x][y], (ph[x] * pa[y]) / z, `cell ${x}-${y} at λ ${lh}/${la}`);
    }
    const h = houseAt(lh, la, null);
    assert.deepEqual([m.oneXTwo.home, m.oneXTwo.draw, m.oneXTwo.away].map((p) => Number(p.toFixed(6))), [h.home, h.draw, h.away], "same 1X2 as lib/sports/epl/strength-state.mjs");
    assert.equal(m.tauClamped, 0);
  }
});

test("the probability matrix sums to 1, and so do 1X2 and over/under 2.5", () => {
  for (const [lh, la] of LAMBDAS) for (const rho of [-0.2, -0.05, 0, 0.1]) {
    const m = scoreMatrix(lh, la, rho);
    const total = m.grid.flat().reduce((s, p) => s + p, 0);
    assert.ok(Math.abs(total - 1) < 1e-12, `grid sums to ${total} at λ ${lh}/${la} ρ ${rho}`);
    assert.ok(Math.abs(m.oneXTwo.home + m.oneXTwo.draw + m.oneXTwo.away - 1) < 1e-12);
    assert.ok(Math.abs(m.over25 + m.under25 - 1) < 1e-12);
    assert.ok(m.grid.flat().every((p) => p >= 0), "no negative cell");
  }
});

test("τ corrects ONLY 0-0, 1-0, 0-1 and 1-1 — every other cell keeps its independent-Poisson weight", () => {
  for (const [lh, la] of LAMBDAS.slice(0, 4)) for (const rho of [-0.15, 0.1]) {
    const base = scoreMatrix(lh, la, 0), dc = scoreMatrix(lh, la, rho);
    /* After renormalisation every untouched cell scales by the same constant z0/zρ; the four low cells do not. */
    const ratio = base.unnormalisedMass / dc.unnormalisedMass;
    for (let x = 0; x <= DC_V2_PARAMS.maxGoals; x++) for (let y = 0; y <= DC_V2_PARAMS.maxGoals; y++) {
      const cell = `${x}-${y}`;
      if (LOW.has(cell)) {
        assert.notEqual(tau(x, y, lh, la, rho), 1, `${cell} is corrected`);
        assert.ok(Math.abs(dc.grid[x][y] / base.grid[x][y] - ratio) > 1e-6, `${cell} moves relative to the rest`);
      } else {
        assert.equal(tau(x, y, lh, la, rho), 1, `${cell} is untouched`);
        assert.ok(Math.abs(dc.grid[x][y] / base.grid[x][y] - ratio) < 1e-9, `${cell} only renormalises`);
      }
    }
    const h = houseAt(lh, la, rho);
    assert.deepEqual([dc.oneXTwo.home, dc.oneXTwo.draw, dc.oneXTwo.away].map((p) => Number(p.toFixed(6))), [h.home, h.draw, h.away], "the same τ as strength-state.mjs's dixonColesRho path");
  }
  /* The direction the correction exists for: ρ < 0 adds draw mass, ρ > 0 removes it. */
  assert.ok(scoreMatrix(1.4, 1.1, -0.1).oneXTwo.draw > scoreMatrix(1.4, 1.1, 0).oneXTwo.draw);
  assert.ok(scoreMatrix(1.4, 1.1, 0.1).oneXTwo.draw < scoreMatrix(1.4, 1.1, 0).oneXTwo.draw);
});

/** A synthetic league drawn from the Dixon-Coles distribution itself, with a fixed seed. */
function syntheticLeague({ seed, rho, seasons, clubs = 20, mu = 0.1, home = 0.25 }) {
  const rnd = mulberry32(seed);
  const att = [], def = [];
  for (let c = 0; c < clubs; c++) { att.push(rnd() * 0.8 - 0.4); def.push(rnd() * 0.6 - 0.3); }
  const rows = [];
  let t = Date.parse("1990-08-01T15:00:00Z");
  for (let s = 0; s < seasons; s++) for (let h = 0; h < clubs; h++) for (let a = 0; a < clubs; a++) {
    if (h === a) continue;
    t += 3_600_000;
    const g = scoreMatrix(Math.exp(mu + home + att[h] + def[a]), Math.exp(mu + att[a] + def[h]), rho).grid;
    let u = rnd(), cell = [DC_V2_PARAMS.maxGoals, DC_V2_PARAMS.maxGoals];
    outer: for (let x = 0; x < g.length; x++) for (let y = 0; y < g.length; y++) { u -= g[x][y]; if (u <= 0) { cell = [x, y]; break outer; } }
    rows.push({ season: `s${s}`, dateUtc: new Date(t).toISOString(), home: `Club ${h}`, away: `Club ${a}`, ftHome: cell[0], ftAway: cell[1] });
  }
  return rows;
}

test("the fit recovers a planted ρ on synthetic data (and the home term with it)", () => {
  /* 15,200 matches: the sampling SD of ρ̂ is ≈ 0.014 there (10-seed check at 7,600 gave SD 0.020, mean error
     +0.007), so 0.045 is ≈ 3 SD. No decay, so every synthetic match counts fully; κ is the frozen value. */
  const est = {};
  for (const planted of [-0.13, 0.06]) {
    const s = fitDixonColes({ rows: syntheticLeague({ seed: 20260911, rho: planted, seasons: 40 }), cutoffIso: "2100-01-01T00:00:00Z", params: { ...DC_V2_PARAMS, xiPerDay: 0 } });
    assert.ok(s.converged, `converged (${s.sweeps} sweeps)`);
    assert.ok(Math.abs(s.rho - planted) < 0.045, `planted ρ ${planted}, recovered ${s.rho.toFixed(4)}`);
    assert.ok(Math.abs(s.home - 0.25) < 0.05, `planted home 0.25, recovered ${s.home.toFixed(4)}`);
    est[planted] = s.rho;
  }
  assert.ok(est[0.06] - est[-0.13] > 0.1, "two planted values are told apart, in the right order");
});

test("time decay: weight 1 at the cutoff, one half after one half-life, and never for a match after the cutoff", () => {
  assert.equal(decayWeight(0), 1);
  assert.ok(Math.abs(decayWeight(Math.LN2 / DC_V2_PARAMS.xiPerDay) - 0.5) < 1e-12);
  assert.throws(() => decayWeight(-1), /after the cutoff/);
});

test("no lookahead: a forecast uses only rows with dateUtc < kickoff (and the check is not vacuous)", () => {
  const kickoffUtc = "2026-10-03T15:00:00.000Z";
  const history = syntheticLeague({ seed: 7, rho: -0.1, seasons: 3, clubs: 8 }).map((r, i) => ({ ...r, dateUtc: new Date(Date.parse("2023-08-01T15:00:00Z") + i * 86_400_000).toISOString() }));
  const lastBefore = { season: "x", dateUtc: new Date(Date.parse(kickoffUtc) - 1).toISOString(), home: "Club 2", away: "Club 3", ftHome: 1, ftAway: 0 };
  const atKickoff = { season: "x", dateUtc: kickoffUtc, home: "Club 0", away: "Club 1", ftHome: 1, ftAway: 1 };
  const later = [1, 2, 3].map((d) => ({ season: "x", dateUtc: new Date(Date.parse(kickoffUtc) + d * 86_400_000).toISOString(), home: "Club 0", away: `Club ${d + 3}`, ftHome: 0, ftAway: 0 }));
  const run = (rows) => forecastMatch({ rows, home: "Club 0", away: "Club 1", kickoffUtc });
  const a = run([...history, lastBefore, atKickoff, ...later]);
  const flipped = run([...history, lastBefore, { ...atKickoff, ftHome: 7, ftAway: 0 }, ...later.map((r) => ({ ...r, ftHome: 0, ftAway: 6 }))]);
  assert.deepEqual(flipped.forecast.oneXTwo, a.forecast.oneXTwo, "the match's own result and every later one change nothing");
  assert.deepEqual([flipped.state.mu, flipped.state.home, flipped.state.rho], [a.state.mu, a.state.home, a.state.rho]);
  assert.equal(a.state.matchesFitted, history.length + 1, "exactly the rows strictly before kickoff are folded");
  assert.ok(Date.parse(a.state.lastFoldedUtc) < Date.parse(kickoffUtc));
  /* Mutation probe: a row one millisecond before kickoff IS in the information set, so changing it must move the forecast. */
  const probe = run([...history, { ...lastBefore, ftHome: 0, ftAway: 4 }, atKickoff, ...later]);
  assert.notDeepEqual(probe.forecast.oneXTwo, a.forecast.oneXTwo, "the guard can see a row just before kickoff");
  assert.throws(() => forecastFixtures({ rows: history, cutoffIso: kickoffUtc, fixtures: [{ home: "Club 0", away: "Club 1", kickoffUtc: "2026-10-02T15:00:00.000Z" }] }), /before the fit cutoff/);
});

test("the frozen registration: content hash, pin, pinned sources, and the model's parameters all agree", () => {
  const doc = readJson(DC_V2_PREREGISTRATION.path);
  const sha = preregistrationSha256(doc);
  assert.equal(sha, doc.frozenSha256, "the document's own frozenSha256");
  assert.equal(sha, DC_V2_PREREGISTRATION.sha256, "the value pinned in dixon-coles-shadow-record.mjs");
  const sourceBytes = Object.fromEntries(Object.keys(doc.sourceHashes).map((p) => [p, fs.readFileSync(path.join(REPO, p))]));
  assert.deepEqual(Object.keys(doc.sourceHashes).sort(), ["app/src/lib/sports/soccer/dixon-coles-aliases.mjs", "app/src/lib/sports/soccer/dixon-coles.mjs"]);
  const v = verifyPreregistration({ doc, sourceBytes, modelParams: DC_V2_PARAMS });
  assert.deepEqual(v.problems, []);
  assert.equal(canonicalJson(doc.model.parameters), canonicalJson(DC_V2_PARAMS));
  /* Mutation probes: a moved bar, an edited source, or a changed parameter must each be caught. */
  const moved = JSON.parse(JSON.stringify(doc)); moved.acceptance.rules.drawEceMax = 0.035;
  assert.equal(verifyPreregistration({ doc: moved, sourceBytes, modelParams: DC_V2_PARAMS }).ok, false);
  const edited = { ...sourceBytes, "app/src/lib/sports/soccer/dixon-coles.mjs": Buffer.concat([sourceBytes["app/src/lib/sports/soccer/dixon-coles.mjs"], Buffer.from(" ")]) };
  assert.equal(verifyPreregistration({ doc, sourceBytes: edited, modelParams: DC_V2_PARAMS }).ok, false);
  assert.equal(verifyPreregistration({ doc, sourceBytes, modelParams: { ...DC_V2_PARAMS, xiPerDay: 0.002 } }).ok, false);
  assert.equal(sha256Hex(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("the registration keeps v1.2's metric and bar, is forward-only, and changes no league stage", () => {
  const doc = readJson(DC_V2_PREREGISTRATION.path);
  assert.equal(doc.acceptance.rules.drawEceMax, 0.03, "v1.2 L2 threshold");
  assert.equal(doc.acceptance.metric.name, "drawEce", "walk-forward.mjs scorePredictions field name");
  assert.deepEqual(Object.keys(doc.leagues).sort(), ["bundesliga", "laliga", "serie-a"]);
  assert.equal(doc.season, "2026-27");
  assert.ok(Date.parse(doc.frozenAt) > Date.parse("2026-09-11T00:00:00Z"));
  assert.match(doc.evaluationPopulation.rule, /after frozenAt/);
  assert.equal(doc.whatAPassMeans.stageChange, "NONE");
});

test("the ESPN alias table maps every 2026-27 club of each corpus, and only to names the corpus uses", () => {
  for (const key of ["laliga", "serie-a", "bundesliga"]) {
    const rows = readJson(`data/internal/research/soccer/${key}/corpus-football-data-v1.json`).rows;
    const clubs2627 = new Set(rows.filter((r) => r.season === "2026-27").flatMap((r) => [r.home, r.away]));
    const targets = Object.values(DC_V2_ESPN_CLUBS[key]).map((e) => e.footballData);
    assert.equal(new Set(targets).size, targets.length, `${key}: no two ESPN ids map to one club`);
    assert.deepEqual([...new Set(targets)].sort(), [...clubs2627].sort(), `${key}: the table is exactly the 2026-27 corpus clubs`);
  }
  assert.equal(footballDataClub("laliga", { id: "90", displayName: "anything" }), "La Coruna", "keyed by id, not display name");
  assert.equal(footballDataClub("bundesliga", { id: "999999", displayName: "Bayern Munich" }), null, "an unknown id is refused, never guessed from the name");
  assert.throws(() => footballDataClub("ligue-1", { id: "1" }), /no ESPN club table/);
});

const fc = (key, kickoffUtc, forecastAt, probs = { home: 0.45, draw: 0.28, away: 0.27 }) => ({
  pairingKey: key, eventId: `soccer:x:${key}`, matchup: key, homeClub: "h", awayClub: "a", kickoffUtc, forecastAt, probs,
  comparators: { empirical: { home: 0.44, draw: 0.26, away: 0.3 }, v1SplitPoisson: { home: 0.5, draw: 0.24, away: 0.26 } },
});

test("append-only: the first forecast for a match is the forecast; a re-run adds and rewrites nothing", () => {
  const first = appendToDayFile(null, [fc("2026-27|A|B", "2026-09-13T15:00:00.000Z", "2026-09-11T20:00:00.000Z")], { at: "2026-09-11T20:00:00.000Z", header: { league: "x" } });
  const again = newForecastsOnly(first.rows, [fc("2026-27|A|B", "2026-09-13T15:00:00.000Z", "2026-09-12T09:00:00.000Z", { home: 0.9, draw: 0.05, away: 0.05 })]);
  assert.equal(again.fresh.length, 0);
  assert.deepEqual(again.alreadyForecast, ["2026-27|A|B"]);
  assert.equal(appendToDayFile(first, again.fresh, { at: "2026-09-12T09:00:00.000Z", header: {} }), null, "nothing new → nothing to write");
  const second = appendToDayFile(first, [fc("2026-27|C|D", "2026-09-14T15:00:00.000Z", "2026-09-12T09:00:00.000Z")], { at: "2026-09-12T09:00:00.000Z", header: {} });
  assert.deepEqual(second.rows[0], first.rows[0], "the earlier forecast is carried verbatim");
  assert.equal(second.firstWrittenAt, "2026-09-11T20:00:00.000Z");
  assert.equal(second.runs.length, 2);
  assert.throws(() => assertAppendOnly(first.rows, [{ ...first.rows[0], probs: { home: 0.9, draw: 0.05, away: 0.05 } }]), /changed or dropped/);
  assert.throws(() => assertAppendOnly([], [first.rows[0], first.rows[0]]), /two forecasts for one match/);
});

test("grading: forward population only, through grading.mjs, and no verdict before the look or under the floor", () => {
  const frozenAt = "2026-09-11T20:00:00.000Z";
  const files = [{ firstWrittenAt: frozenAt, rows: [
    fc("2026-27|A|B", "2026-09-13T15:00:00.000Z", "2026-09-11T21:00:00.000Z"),
    fc("2026-27|C|D", "2026-09-11T19:00:00.000Z", "2026-09-11T18:00:00.000Z"), // kicked off before frozenAt
    fc("2026-27|E|F", "2026-09-14T15:00:00.000Z", "2026-09-12T09:00:00.000Z"), // rescheduled EARLIER than forecastAt below
    fc("2026-27|G|H", "2026-09-20T15:00:00.000Z", "2026-09-17T09:00:00.000Z"), // no result yet
  ] }];
  const corpus = [
    { season: "2026-27", dateUtc: "2026-09-13T15:00:00.000Z", home: "A", away: "B", ftHome: 1, ftAway: 1, result: "D", market: { close1x2: { home: 0.4, draw: 0.3, away: 0.3 } } },
    { season: "2026-27", dateUtc: "2026-09-11T19:00:00.000Z", home: "C", away: "D", ftHome: 2, ftAway: 0, result: "H", market: {} },
    { season: "2026-27", dateUtc: "2026-09-12T08:00:00.000Z", home: "E", away: "F", ftHome: 0, ftAway: 1, result: "A", market: {} },
  ];
  const g = gradeShadow({ files, corpusRows: corpus, frozenAt, season: "2026-27", previous: [] });
  assert.deepEqual(g.matches.map((m) => m.pairingKey), ["2026-27|A|B"]);
  assert.equal(g.matches[0].result, "D");
  assert.equal(g.matches[0].logLoss, Number((-Math.log(0.28)).toFixed(4)), "grading.mjs gradeMatch definitions");
  const why = Object.fromEntries(g.excluded.map((e) => [e.pairingKey, e.reasons]));
  assert.deepEqual(Object.keys(why).sort(), ["2026-27|C|D", "2026-27|E|F"]);
  assert.ok(why["2026-27|C|D"].includes("scheduled kickoff not after frozenAt"), "a match before frozenAt is outside the population");
  assert.ok(why["2026-27|E|F"].includes("forecast not before the actual kickoff"), "a forecast after the actual (rescheduled) kickoff is excluded");
  assert.deepEqual(g.pending, ["2026-27|G|H"]);
  assert.equal(g.summary.sampleState, "TOO_SMALL_TO_ASSESS");
  assert.equal(gradeShadow({ files, corpusRows: corpus, frozenAt, season: "2026-27", previous: g.matches }).added, 0, "re-grading adds nothing");
  /* The C|D forecast was made before frozenAt for a match before frozenAt: lastPreKickoffForecasts keeps it, the population rule drops it. */
  const rules = { drawEceMax: 0.03, skillMargin: 0.005, minimumSample: 250, resampling: { quantile: 0.95, replicates: 200, seed: 1 } };
  assert.equal(decide({ matches: g.matches, rules, due: false }).state, "INTERIM_DECIDES_NOTHING");
  assert.equal(decide({ matches: g.matches, rules, due: true }).state, "NO_VERDICT_INSUFFICIENT_SAMPLE");
  assert.equal(seasonOf("2026-08-15T17:30:00Z"), "2026-27");
  assert.equal(seasonOf("2027-05-23T17:30:00Z"), "2026-27");
  assert.equal(pairingKey("2026-27", "A", "B"), "2026-27|A|B");
});

test("the decision rule: PASS needs the v1.2 bar; FAIL needs miscalibration beyond resampling noise; else INCONCLUSIVE", () => {
  const rules = { drawEceMax: 0.03, skillMargin: 0.005, minimumSample: 40, resampling: { quantile: 0.95, replicates: 400, seed: 3 } };
  const rnd = mulberry32(11);
  const make = (drawTrue, n) => Array.from({ length: n }, () => {
    const u = rnd();
    const result = u < drawTrue ? "D" : u < drawTrue + (1 - drawTrue) / 2 ? "H" : "A";
    return { result, probs: { home: 0.37, draw: 0.26, away: 0.37 }, comparators: { empirical: { home: 1 / 3, draw: 1 / 3, away: 1 / 3 } } };
  });
  const badly = decide({ matches: make(0.6, 400), rules, due: true });
  assert.equal(badly.state, "FAIL", "a draw rate of 0.60 against forecasts of 0.26 is beyond noise");
  const calibrated = decide({ matches: make(0.26, 4000), rules: { ...rules, skillMargin: -1 }, due: true });
  assert.equal(calibrated.state, "PASS", "a calibrated draw forecast on a large sample clears 0.030");
});

test("the shadow record on disk obeys its own rules (vacuous until the first run writes)", () => {
  const doc = readJson(DC_V2_PREREGISTRATION.path);
  for (const key of Object.keys(doc.leagues)) {
    const dir = path.join(REPO, "data/internal/research/soccer", key, "shadow-dc-v2");
    if (!fs.existsSync(dir)) continue;
    const seen = new Set();
    for (const f of fs.readdirSync(dir).filter((x) => /^forecasts-\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      assert.equal(d.dataClass, "PRIVATE_RESEARCH");
      assert.equal(d.public, false);
      assert.equal(d.preregistrationSha256, doc.frozenSha256, `${f}: written under the frozen registration`);
      for (const r of d.rows) {
        assert.ok(!seen.has(r.pairingKey), `${r.pairingKey}: one forecast per match across every file`); seen.add(r.pairingKey);
        assert.ok(Date.parse(r.forecastAt) < Date.parse(r.kickoffUtc), `${r.pairingKey}: forecast before kickoff`);
        assert.ok(Date.parse(r.kickoffUtc) > Date.parse(doc.frozenAt), `${r.pairingKey}: kicks off after frozenAt`);
        assert.ok(Date.parse(r.fit.lastFoldedUtc) < Date.parse(r.forecastAt), `${r.pairingKey}: fit only on rows before the forecast`);
        assert.ok(Math.abs(r.probs.home + r.probs.draw + r.probs.away - 1) < 1e-5);
      }
    }
  }
  assert.ok(!fs.existsSync(path.join(REPO, "app/public/data/soccer/laliga")) || !fs.readdirSync(path.join(REPO, "app/public/data/soccer/laliga")).some((f) => /dc|dixon/i.test(f)), "nothing Dixon-Coles under app/public");
});
