/**
 * backtest-nba-no-history-priors.mjs — determinism, classification on a synthetic fixture, and the 2026-27 read guard.
 * RESEARCH · PRIVATE_RESEARCH · not product code.
 *
 * Run: cd app && npx tsx --test scripts/nba/research/backtest-nba-no-history-priors.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  buildHistory, classifyAthlete, outcomeOf, qualifiesPreseason, buildRecords, summarise, errorStats, assertHistorical,
  loadHistoricalInputs, CLASSES, HISTORY_END_UTC, HISTORICAL_SEASONS, ROOKIE_PRESEASON_RULE,
} from "./backtest-nba-no-history-priors.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const SCRIPT = path.join(HERE, "backtest-nba-no-history-priors.mjs");

/* ── synthetic fixture: backtest season S = 2026 (2025-26), S−1 = 2025, S−2 = 2024 ── */
const TA = "1", TB = "2";
const line = (id, team, minutes) => ({ providerAthleteId: id, name: `P${id}`, providerTeamId: team, starter: minutes >= 28, didNotPlay: false, dnpReason: null, minutes, pts: Math.round(minutes / 2), reb: 3, ast: 2, threePm: 1 });
const dnp = (id, team, reason) => ({ providerAthleteId: id, name: `P${id}`, providerTeamId: team, starter: false, didNotPlay: true, dnpReason: reason, minutes: null });
const box = (id, dateUtc, phase, season, players) => ({ schemaVersion: 1, providerEventId: id, season, phase, dateUtc, boxscoreAvailable: true, teams: [{ providerTeamId: TA, homeAway: "home" }, { providerTeamId: TB, homeAway: "away" }], players });
const tb = () => ["b0", "b1", "b2", "b3", "b4"].map((b) => line(b, TB, 30));
const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 23, 0)).toISOString().slice(0, 16) + "Z";
const FIXTURE = [
  // 2023-24: "ret" and "vet" regulars, "thin" one game
  ...[1, 2, 3, 4, 5].map((d) => box(`s24-${d}`, day(2023, 11, d), 2, 2024, [line("ret", TA, 30), line("vet", TA, 25), ...(d === 1 ? [line("thin", TA, 10)] : []), ...tb()])),
  // 2024-25: "vet" plays; "ret" injured all season; "thin" one game; "pre25" a preseason exhibition only
  box("p25-1", day(2024, 10, 10), 1, 2025, [line("pre25", TA, 12), ...tb()]),
  ...[1, 2, 3, 4, 5].map((d) => box(`s25-${d}`, day(2024, 11, d), 2, 2025, [line("vet", TA, 28), dnp("ret", TA, "LEFT KNEE"), ...(d === 1 ? [line("thin", TA, 8)] : []), ...tb()])),
  // 2025-26 preseason: "rk" 2 apps at 19 (qualifies), "rk2" 1 app at 25 (no), "rk3" 2 apps at 10 (no)
  box("p26-1", day(2025, 10, 5), 1, 2026, [line("rk", TA, 20), line("rk2", TA, 25), line("rk3", TA, 10), ...tb()]),
  box("p26-2", day(2025, 10, 8), 1, 2026, [line("rk", TA, 18), line("rk3", TA, 10), ...tb()]),
  // 2025-26 regular season
  ...[22, 24, 26].map((d) => box(`s26-${d}`, day(2025, 10, d), 2, 2026, [line("vet", TA, 30), line("ret", TA, 28), dnp("thin", TA, "COACH'S DECISION"), line("rk", TA, 12), dnp("rk2", TA, "COACH'S DECISION"), dnp("rk3", TA, "LEFT ANKLE SPRAIN"), line("pre25", TA, 5), ...tb()])),
];

test("classification on a synthetic fixture: rookie-proxy, returner, the rest", () => {
  const h = buildHistory(FIXTURE);
  const cls = (id) => classifyAthlete(h.get(id), 2026);
  assert.equal(cls("rk"), CLASSES.ROOKIE, "no appearance in any season < S");
  assert.equal(cls("rk2"), CLASSES.ROOKIE);
  assert.equal(cls("nobody"), CLASSES.ROOKIE, "no record at all is a rookie-proxy");
  assert.equal(cls("ret"), CLASSES.RETURNER, "0 regular-season apps in S−1, 5 in S−2");
  assert.equal(cls("vet"), CLASSES.VETERAN);
  assert.equal(cls("thin"), CLASSES.VETERAN, "1 app in S−1 and 1 in S−2: thin, not a returner");
  assert.equal(cls("pre25"), CLASSES.VETERAN, "a preseason-only appearance in an earlier season is still an appearance (any phase)");
  assert.equal(classifyAthlete(h.get("ret"), 2025), CLASSES.VETERAN, "relative to S = 2025, S−1 = 2024 qualifies");
  assert.equal(classifyAthlete(h.get("rk"), 2027), CLASSES.VETERAN, "relative to a later season the 2025-26 rookie has history");

  assert.deepEqual(outcomeOf(dnp("x", TA, "COACH'S DECISION")), { actual: 0, kind: "dnp-coach" });
  assert.deepEqual(outcomeOf(dnp("x", TA, "RIGHT CALF STRAIN")), { actual: null, kind: "dnp-other" });
  assert.deepEqual(outcomeOf({ ...line("x", TA, 1), minutes: null }), { actual: null, kind: "null-minutes" });
  assert.deepEqual(outcomeOf(line("x", TA, 0)), { actual: 0, kind: "played" });
  assert.deepEqual({ ...ROOKIE_PRESEASON_RULE }, { minApps: 2, minMpg: 15 });
  assert.equal(qualifiesPreseason({ apps: 2, mpg: 15 }), true);
  assert.equal(qualifiesPreseason({ apps: 1, mpg: 30 }), false);
  assert.equal(qualifiesPreseason({ apps: 4, mpg: 14.9 }), false);
});

test("the rookie rule is the coverage-gap measurement's rule, not a new one", () => {
  const src = fs.readFileSync(path.join(HERE, "measure-nba-projection-coverage.mjs"), "utf8");
  assert.match(src, /facts\.preseason\.apps >= 2 && facts\.preseason\.mpg >= rule\.minMpg/);
  assert.match(src, /id: "PRIMARY mpg>=15 apps>=10 \+preseason", minMpg: 15,/);
});

test("buildRecords on the fixture: real pools, returner == v0.4-lagged, v0.4 == v0.3 elsewhere, outcomes and preseason", () => {
  const built = buildRecords(FIXTURE, { seasons: [2026], firstN: 2 });
  assert.equal(built.teamGames, 4, "2 teams × first 2 games");
  const at = (id, game) => built.records.find((r) => r.id === id && r.game === game && r.teamId === TA);
  assert.equal(at("ret", 1).cls, CLASSES.RETURNER);
  assert.equal(at("ret", 1).v04.lagged, true);
  assert.equal(at("ret", 1).v04.priorSeasonUsed, 2024);
  assert.equal(at("ret", 1).v03.projected, false, "v0.3 reads S and S−1 only → no projection at the opener");
  assert.equal(at("ret", 1).v04.projected, true);
  assert.equal(at("ret", 2).v03.projected, true, "after one 2025-26 game v0.3 picks him up");
  assert.equal(at("rk", 1).v04.projected, false, "rookies get no projection from any family at the opener");
  assert.equal(at("rk", 1).preQualifies, true);
  assert.deepEqual(at("rk", 1).pre, { apps: 2, mpg: 19 });
  assert.equal(at("rk2", 1).preQualifies, false);
  assert.equal(at("rk3", 1).preQualifies, false);
  assert.equal(at("rk2", 1).kind, "dnp-coach"); assert.equal(at("rk2", 1).actual, 0);
  assert.equal(at("rk3", 1).kind, "dnp-other"); assert.equal(at("rk3", 1).actual, null);
  assert.equal(built.identity.rowMismatches.length, 0);
  assert.equal(built.identity.laggedVsReturnerMismatches.length, 0);
  assert.ok(built.identity.teamGamesWithoutLagged >= 2, "team B never has a lagged athlete");
  assert.equal(built.identity.normalisedIdenticalWithoutLagged, built.identity.teamGamesWithoutLagged);
  const rep = summarise(built, { seasons: [2026] });
  assert.equal(rep.seasons[2026].D1.opener.returnerAthleteGames, 1);
  assert.equal(rep.seasons[2026].D1.opener.v04Projected, 1);
  assert.equal(rep.seasons[2026].D2.opener.preseason.qualifiers, 1);
  assert.deepEqual(rep.seasons[2026].D2.opener.excludedQualifier, {});
});

test("bootstrap is seeded and deterministic; a single cluster gets no interval", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ c: `a${i % 12}`, v: ((i * 7) % 11) - 5 }));
  assert.deepEqual(errorStats(rows, "x"), errorStats(rows, "x"));
  const one = errorStats([{ c: "a", v: 3 }, { c: "a", v: 5 }], "y");
  assert.deepEqual(one.maeCi, [null, null]);
  assert.equal(one.fewClusters, true);
});

test("no 2026-27 box score is opened or accepted", () => {
  // the read gate itself
  assert.throws(() => assertHistorical(box("x", "2026-10-21T23:00Z", 2, 2027, [])), /not historical/);
  assert.throws(() => assertHistorical(box("x", "2026-10-21T23:00Z", 2, 2026, [])), /not historical/, "a mislabelled season is caught by the date");
  assert.throws(() => assertHistorical(box("x", "2026-09-01T00:00Z", 1, 2026, [])), /not historical/);
  assert.doesNotThrow(() => assertHistorical(box("x", "2026-06-14T00:30Z", 3, 2026, [])));
  assert.throws(() => buildRecords([...FIXTURE, box("late", "2026-10-22T23:00Z", 2, 2027, tb())], { seasons: [2026], firstN: 1 }), /not historical/);

  // the loader never opens a file outside the corpus's historical rows: the 2026-27 file is not even JSON
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nba-bt-"));
  try {
    fs.mkdirSync(path.join(dir, "boxscores"));
    const hist = [box("101", "2024-01-01T23:00Z", 2, 2024, tb()), box("102", "2025-01-01T23:00Z", 2, 2025, tb())];
    for (const d of hist) fs.writeFileSync(path.join(dir, "boxscores", `${d.providerEventId}.json`), JSON.stringify(d));
    fs.writeFileSync(path.join(dir, "boxscores", "901.json"), "NOT JSON — a 2026-27 file must never be opened");
    const rows = [{ providerEventId: "101", season: 2024 }, { providerEventId: "102", season: 2025 }, { providerEventId: "901", season: 2027 }];
    fs.writeFileSync(path.join(dir, "corpus-v1.json"), JSON.stringify({ rows }));
    const loaded = loadHistoricalInputs(dir);
    assert.deepEqual(loaded.opened, ["101", "102"]);
    assert.equal(loaded.inputs.corpusRowsOtherSeasons, 1);
    // a corpus row mislabelled 2026 whose box score is a 2026-27 game is refused, not read into the backtest
    fs.writeFileSync(path.join(dir, "boxscores", "902.json"), JSON.stringify(box("902", "2026-10-21T23:00Z", 2, 2026, tb())));
    fs.writeFileSync(path.join(dir, "corpus-v1.json"), JSON.stringify({ rows: [...rows, { providerEventId: "902", season: 2026 }] }));
    assert.throws(() => loadHistoricalInputs(dir), /not historical/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }

  // the committed corpus: every opened doc is from 2023-24 … 2025-26
  const real = loadHistoricalInputs(NBA);
  assert.ok(real.inputs.boxscoresRead > 4000);
  assert.ok(Date.parse(real.inputs.maxDateUtcRead) < Date.parse(HISTORY_END_UTC));
  assert.ok(real.boxscores.every((d) => HISTORICAL_SEASONS.includes(d.season) && Date.parse(d.dateUtc) < Date.parse(HISTORY_END_UTC)));
});

test("determinism: two CLI runs write byte-identical JSON with no wall-clock field", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nba-bt-det-"));
  try {
    const outs = [1, 2].map((k) => {
      const f = path.join(dir, `run${k}.json`);
      const r = spawnSync("npx", ["tsx", SCRIPT, "--json", f], { cwd: APP, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      assert.equal(r.status, 0, r.stderr);
      return { json: fs.readFileSync(f, "utf8"), stdout: r.stdout.replace(/wrote .*\n?$/, "") };
    });
    assert.equal(outs[0].json, outs[1].json);
    assert.equal(outs[0].stdout, outs[1].stdout);
    assert.doesNotMatch(outs[0].json, /generatedAt|capturedAt|"now"/);
    const rep = JSON.parse(outs[0].json);
    assert.equal(rep.identity.rowMismatches, 0, "v0.4 == v0.3 for every non-lagged athlete on the historical slates");
    assert.equal(rep.identity.laggedVsReturnerMismatches, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }

  const r = spawnSync("npx", ["tsx", SCRIPT, "--json", path.join(APP, "x.json")], { cwd: APP, encoding: "utf8" });
  assert.notEqual(r.status, 0, "--json inside the repository is refused");
  assert.ok(!fs.existsSync(path.join(APP, "x.json")));
});
