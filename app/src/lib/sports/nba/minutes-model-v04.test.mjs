/**
 * v0.4 CANDIDATE (NOT ARMED) lagged role prior (minutes-model-v04.mjs) — and the proof that v0.1 and v0.3 are byte-identical
 * with it in the tree. NBA REGULAR SEASON — CANDIDATE SHADOW (NOT ARMED) · PRIVATE_RESEARCH.
 * Design: docs/nba/NBA_PROJECTION_COVERAGE_GAP_2026-10-22.md.
 *
 * Run: npx tsx --test src/lib/sports/nba/minutes-model-v04.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { indexRoleHistoryV04, gatePoolV04, PARAMS_V04, MINUTES_MODEL_V04_VERSION, POOL_V04_VERSION } from "./minutes-model-v04.mjs";
import { indexRoleHistory, roleEstimate, gatePoolV03, PARAMS as V03_PARAMS } from "./minutes-model-v03.mjs";
import { MIN_GAMES_FOR_RATES } from "./minutes-model.mjs";
import { buildForecastArtifact, familySpec, FAMILIES, CANDIDATE_FAMILIES, unarmedWriteRefusal } from "./experimental-forecast.mjs";
import { foldBoxscores } from "./season-fold.mjs";
import { stampReceipt, canonicalJson } from "./forecast-receipt.mjs";
import { owingFamilies } from "../../../../scripts/nba/decide-nba-forecast-window.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

/* ─────────────── synthetic history: NOW is 2026-27 (S = 2027, S−1 = 2026, S−2 = 2025, S−3 = 2024) ─────────────── */
const NOW = "2026-10-21T14:00:00Z";
const TOR = "28", MIA = "14";
const line = (id, team, minutes) => ({ providerAthleteId: id, name: `P${id}`, providerTeamId: team, starter: minutes >= 28, didNotPlay: false, dnpReason: null, minutes, pts: Math.round(minutes * 0.5), reb: Math.round(minutes * 0.2), ast: Math.round(minutes * 0.1), threePm: 1 });
const dnp = (id, team, reason) => ({ providerAthleteId: id, name: `P${id}`, providerTeamId: team, starter: false, didNotPlay: true, dnpReason: reason, minutes: null });
const box = (id, dateUtc, phase, season, players) => ({ schemaVersion: 1, providerEventId: id, season, phase, dateUtc, boxscoreAvailable: true, teams: [{ providerTeamId: TOR, homeAway: "home" }, { providerTeamId: MIA, homeAway: "away" }], players });
const dayIn = (year, i) => new Date(Date.UTC(year, 10, 1) + i * 86_400_000).toISOString().slice(0, 16) + "Z";
const mia = () => ["m0", "m1", "m2", "m3", "m4"].map((m) => line(m, MIA, 30));
// "vet": every season.  "ret": 2024-25 (S−2) at 34 min, all of 2025-26 out (injury DNPs).  "thin": 2 games of S−1, a
// full S−2.  "old": only 2023-24 (S−3).  "rk": no history.  Playoff and preseason rows in S−2 carry absurd minutes.
const S2 = Array.from({ length: 40 }, (_, i) => box(`a${i}`, dayIn(2024, i), 2, 2025, [line("vet", TOR, 30), line("ret", TOR, 34), line("thin", TOR, 24), ...mia()]));
const S2_POST = [box("ap0", "2025-04-25T23:00Z", 3, 2025, [line("ret", TOR, 48), ...mia()]), box("app0", "2024-10-10T23:00Z", 1, 2025, [line("ret", TOR, 2), ...mia()])];
const S1 = Array.from({ length: 40 }, (_, i) => box(`b${i}`, dayIn(2025, i), 2, 2026, [line("vet", TOR, 28), dnp("ret", TOR, "INJURY"), ...(i < 2 ? [line("thin", TOR, 8)] : []), ...mia()]));
const S3 = Array.from({ length: 20 }, (_, i) => box(`c${i}`, dayIn(2023, i), 2, 2024, [line("old", TOR, 30), ...mia()]));
const BOX = [...S3, ...S2, ...S2_POST, ...S1];
const rosterTeam = (providerTeamId, ids) => ({ providerTeamId, espnAbbr: "X", canonicalTricode: "X", state: "CAPTURED", reason: null, playerCount: ids.length, capturedAt: "2026-10-21T06:00:00Z", players: ids.map((id) => ({ providerAthleteId: id, displayName: `R${id}`, position: "G", experienceYears: id === "rk" ? 0 : 5, injuryStatus: null })), refused: [] });
const ROSTERS = { artifact: "nba-roster-capture", contractVersion: "nba-roster-contract-v1", asOf: "2026-10-21T06:00:00Z", capturedAt: "2026-10-21T06:00:00Z", teams: [rosterTeam(TOR, ["vet", "ret", "thin", "old", "rk"]), rosterTeam(MIA, ["m0", "m1", "m2", "m3", "m4"])] };

test("FROZEN: v0.4's one new constant, its version strings and its UNARMED candidate spec", () => {
  assert.deepEqual({ ...PARAMS_V04 }, { ...V03_PARAMS, MAX_PRIOR_LAG: 2 }, "v0.3's constants unchanged; MAX_PRIOR_LAG = 2 is the only addition (founder approval before arming)");
  assert.equal(PARAMS_V04.MIN_GAMES_FOR_RATES, MIN_GAMES_FOR_RATES, "the qualifying threshold is the frozen v0 constant");
  assert.equal(MINUTES_MODEL_V04_VERSION, "nba-minutes-model-v0.4-lagged-role-prior");
  assert.equal(POOL_V04_VERSION, "nba-roster-gated-pool-v0.4");
  assert.deepEqual({ ...CANDIDATE_FAMILIES["v0.4"] }, { family: "v0.4", poolRule: "roster-gated", dataRule: "corpus-v1+boxscores-2026-27", role: "CANDIDATE_SHADOW", modelVersion: "nba-experimental-v0.4-lagged-role-prior", dir: "experimental-v0.4", minutesRule: "v0.4-lagged-role-prior", alignsWith: "v0.1", armed: false });
  assert.ok(!("v0.4" in FAMILIES), "not armed → never in FAMILIES, so the pipeline never owes, fetches or grades it");
  assert.equal(familySpec("v0.4"), CANDIDATE_FAMILIES["v0.4"]);
  assert.deepEqual(owingFamilies(FAMILIES).map((f) => f.family), ["v0", "v0.1", "v0.2", "v1"]);
  const nbaRoot = NBA + path.sep;
  assert.match(unarmedWriteRefusal(familySpec("v0.4"), { write: true, outFile: null, nbaRoot }), /NOT ARMED/);
  assert.match(unarmedWriteRefusal(familySpec("v0.4"), { outFile: path.join(NBA, "experimental-v0.4", "forecasts", "x.json"), nbaRoot }), /NOT ARMED/);
});

test("LAGGED PRIOR: a returner who missed S−1 takes S−2 as his prior; v0.3 leaves him INSUFFICIENT_HISTORY", () => {
  const i3 = indexRoleHistory(BOX, { asOfDateUtc: NOW, population: "regular" });
  const i4 = indexRoleHistoryV04(BOX, { asOfDateUtc: NOW, population: "regular" });
  const p3 = gatePoolV03({ rosters: ROSTERS, providerTeamId: TOR, boxscores: BOX, asOfDateUtc: NOW, injuries: [], roleIndex: i3 });
  const p4 = gatePoolV04({ rosters: ROSTERS, providerTeamId: TOR, boxscores: BOX, asOfDateUtc: NOW, injuries: [], roleIndex: i4 });
  const row = (p, id) => p.rows.find((r) => r.providerAthleteId === id);
  assert.equal(row(p3, "ret").minutesState, "INSUFFICIENT_HISTORY", "v0.3: 40 injury DNPs in S−1 and nothing else in its window");
  assert.equal(row(p4, "ret").minutesState, "MODELLED");
  assert.equal(row(p4, "ret").expectedMinutes, 34, "S−2 regular season only: the 48-min playoff and 2-min preseason rows are excluded");
  assert.equal(row(p4, "ret").priorGames, 40);
  assert.equal(row(p4, "ret").priorWeight, 0.25, "the lagged season is worth PRIOR_GAMES = 10 appearances, exactly as v0.3's S−1");
  assert.equal(row(p4, "ret").priorSeasonUsed, 2025);
  assert.equal(row(p4, "ret").playRate, 1, "injury DNPs are availability, not role (v0.3 rule)");
  assert.equal(row(p4, "thin").priorSeasonUsed, 2025, "2 S−1 appearances < MIN_GAMES_FOR_RATES → the most recent qualifying season");
  assert.equal(row(p4, "thin").expectedMinutes, 24);
  assert.equal(row(p4, "old").minutesState, "INSUFFICIENT_HISTORY", "S−3 is beyond MAX_PRIOR_LAG = 2");
  assert.equal(row(p4, "rk").minutesState, "INSUFFICIENT_HISTORY", "a rookie stays null, never 0");
  assert.equal(row(p4, "rk").expectedMinutes, null);
  assert.deepEqual(p4.gate.laggedPrior.map((x) => x.providerAthleteId).sort(), ["ret", "thin"]);
  assert.equal(p4.gate.poolVersion, POOL_V04_VERSION);
  assert.equal(p4.modelVersion, MINUTES_MODEL_V04_VERSION);
  // UNCHANGED FOR A QUALIFYING S−1: v0.4's record and estimate for "vet" are v0.3's, field for field
  assert.deepEqual(i4.byAthlete.get("vet"), i3.byAthlete.get("vet"), "the v0.3 record, untouched");
  assert.ok(!i4.lagged.has("vet"));
  const { priorSeasonUsed, priorLagSeasons, ...vet4 } = row(p4, "vet");
  assert.deepEqual(vet4, row(p3, "vet"));
  assert.deepEqual([priorSeasonUsed, priorLagSeasons], [2026, 1]);
  assert.deepEqual(roleEstimate(i4.byAthlete.get("vet"), i4), roleEstimate(i3.byAthlete.get("vet"), i3));
});

test("NO LEAKAGE: only games strictly before the instant count, in the lagged season as everywhere (instant moved back)", () => {
  const early = "2024-11-15T00:00:00Z"; // S = 2025, S−1 = 2024, S−2 = 2023 (empty)
  const i4 = indexRoleHistoryV04(BOX, { asOfDateUtc: early, population: "regular" });
  assert.equal(i4.currentSeason, 2025);
  assert.deepEqual([...i4.lagged.keys()], [], "S−2 = 2023 holds nothing, so nobody is lagged");
  const r = gatePoolV04({ rosters: { ...ROSTERS, asOf: "2024-11-14T23:00:00Z", capturedAt: "2024-11-14T23:00:00Z" }, providerTeamId: TOR, boxscores: BOX, asOfDateUtc: early, injuries: [], roleIndex: i4 });
  const ret = r.rows.find((x) => x.providerAthleteId === "ret");
  assert.deepEqual([ret.currentGames, ret.priorGames], [14, 0], "2024-11-01 … 11-14 only; nothing from 11-15 on, and no later season");
  assert.equal(r.rows.find((x) => x.providerAthleteId === "old").priorGames, 20, "S−1 = 2024 qualifies → v0.3's prior, not lagged");
  assert.throws(() => gatePoolV04({ rosters: ROSTERS, providerTeamId: TOR, boxscores: BOX, asOfDateUtc: NOW, roleIndex: indexRoleHistory(BOX, { asOfDateUtc: NOW, population: "regular" }) }), /indexRoleHistoryV04/);
});

/* ─────────────── v0.1 and v0.3 are byte-identical with v0.4 in the tree ─────────────── */
const ROSTER_FILE = { "8faecd4e44c6ea10": "2026-10-19.json", "60ff1802bf95776d": "2026-10-20.json", "9c2baafed1c9686f": "2026-10-21.json" };
/**
 * sha256(canonicalJson(game)) of every v0.3 game REPLAYED on the receipts' committed inputs (the dated roster captures,
 * the injury fixtures, corpus + fetched box scores captured by the instant), computed with origin/main @ 70a8e07017
 * BEFORE minutes-model-v04.mjs existed. No v0.3 receipt exists for either date, so the replay is the identity reference.
 */
const V03_REPLAY = {
  "2026-10-20T12:29:28Z": { folded: 67, games: { "401909088": "72d4ca954854321f3e52491f286aed75df9b3e0df11673787c95a966b30a4085" } },
  "2026-10-20T14:17:02Z": { folded: 67, games: { "401909089": "53792fbe8958877f01f3697dd341dc04b7d45d863d0c58bdab41e01b03ef2603", "401909090": "831ed3709585d47a4f5e6bf117a140e015513f9b7ab1a8d37462efeff75f075d" } },
  "2026-10-21T14:28:31Z": { folded: 70, games: {
    "401909091": "d53fc6e758e27b583692f86d2a7130b5acaf3f80b71bc9f2bf971963a281c672", "401909092": "2de9ccb663623928be434dd1926676b6afa1944a05f7f7e13a17a0ac87e679e6",
    "401909834": "e7b2b84af5a3d8b36c7ddb88b8a8c7848746c30ebd86d758ee25e9ca2def1f22", "401909835": "554929e0efb1e464925f429b89ce2c1f91e843cb351c9b648cd32432de87559b",
    "401909836": "a74e8e397bf1e31dc3cd7f9566e3bf329dd215584a076005d4eb2ed2726e95e7", "401909837": "9b377f9894ad616a8cc9e4e340db601f28c25a2d4c520dba3e96accff2bbdfa6",
    "401909838": "4b64949db1940caba627fc0e84063b75c0710c42168bd7334e4a051053f22475", "401909839": "13a941db30d8a11ba1d35db3fd0a99cdd685002902bc095f747f44df46ab68db",
    "401909840": "8760708ad0d73fe1fc7aa3d2fceafc288e7f330da5717bf573e7c6cd1126d0f8", "401909841": "bd99b260aa63db8f48cd0b6b3aa3fdd010654870bcdd0a86649b786d5bbac13d",
    "401909842": "137054b3dd9a4fd125b98ea16681ed41fcfe9ee39fa4042cc7eb78580a2f5d2d" } },
};
let cache = null;
const load = () => (cache ??= (() => {
  const dir = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(d, f))) : []);
  return { corpus: readJson(path.join(NBA, "corpus-v1.json")), corpusBox: dir(path.join(NBA, "boxscores")), fetched: Object.values(FAMILIES).flatMap((f) => dir(path.join(NBA, f.dir, "boxscores"))) };
})());

for (const date of ["2026-10-20", "2026-10-21"]) {
  test(`BYTE-IDENTICAL ${date}: every v0.1 game re-derives its committed payloadSha256, and every v0.3 replay game equals its pre-v0.4 hash`, () => {
    const { corpus, corpusBox, fetched } = load();
    const doc = readJson(path.join(NBA, "experimental-v0.1", "forecasts", `${date}.json`));
    const byFreeze = new Map();
    for (const g of doc.games) { const k = g.receipt.generatedAt; if (!byFreeze.has(k)) byFreeze.set(k, []); byFreeze.get(k).push(g); }
    let v01 = 0, v03 = 0;
    for (const [now, games] of byFreeze) {
      const ri = games[0].receipt.inputs;
      const rText = fs.readFileSync(path.join(NBA, "rosters", ROSTER_FILE[ri.rosters.sha256.slice(0, 16)]));
      const iText = fs.readFileSync(path.join(NBA, "v0.3-candidate", "fixtures", `injuries-${ri.injuries.sha256.slice(0, 16)}.json`));
      assert.equal(sha(rText), ri.rosters.sha256);
      assert.equal(sha(iText), ri.injuries.sha256);
      const scheduleRows = games.map((g) => ({ providerEventId: g.providerEventId, dateUtc: g.dateUtc, seasonType: g.seasonType, neutralSite: g.neutralSite, venue: g.venue, home: { abbr: g.home.abbr, name: g.home.name, providerTeamId: g.home.providerTeamId }, away: { abbr: g.away.abbr, name: g.away.name, providerTeamId: g.away.providerTeamId } }));
      const common = { date, now, scheduleRows, corpusRows: corpus.rows, injuries: JSON.parse(iText).entries ?? null, rosters: JSON.parse(rText), simulations: games[0].forecast.simulations };
      const a1 = buildForecastArtifact({ ...common, boxscores: corpusBox, family: "v0.1" }).artifact;
      for (const stored of games) {
        const built = a1.games.find((x) => x.providerEventId === stored.providerEventId);
        assert.equal(stampReceipt(built, { family: "v0.1", modelVersion: a1.modelVersion, now, inputs: stored.receipt.inputs }).receipt.payloadSha256, stored.receipt.payloadSha256, `${stored.providerEventId}: v0.1 changed`);
        v01 += 1;
      }
      const fold = foldBoxscores(corpusBox, fetched, { now });
      assert.equal(fold.added, V03_REPLAY[now].folded, "the committed fetched box scores captured by the instant are the ones the reference was built on");
      const a3 = buildForecastArtifact({ ...common, boxscores: fold.docs, family: "v0.3" }).artifact;
      for (const g of a3.games) { assert.equal(sha(canonicalJson(g)), V03_REPLAY[now].games[g.providerEventId], `${g.providerEventId}: v0.3 changed`); v03 += 1; }
      // and v0.4 on the same inputs: a different family stamp, the v0.4 pool on every side, the same Elo as v0.1
      const a4 = buildForecastArtifact({ ...common, boxscores: fold.docs, family: "v0.4" }).artifact;
      assert.equal(a4.family, "v0.4");
      assert.equal(a4.minutesModelVersion, MINUTES_MODEL_V04_VERSION);
      assert.equal(a4.poolVersion, POOL_V04_VERSION);
      for (const g of a4.games) {
        assert.deepEqual(g.forecast.elo, a1.games.find((x) => x.providerEventId === g.providerEventId).forecast.elo, "Elo is v0.1's");
        for (const side of ["home", "away"]) assert.equal(g[side].pool.poolVersion, POOL_V04_VERSION);
      }
    }
    assert.equal(v01, doc.games.length);
    assert.equal(v03, doc.games.length);
  });
}

test("BUILDER (real script, committed 2026-10-21 inputs): v0.4 replays only to --out outside the repo; --write and forecasts/ are refused", () => {
  const script = path.join(APP, "scripts", "nba", "build-nba-experimental-forecasts.mjs");
  const v01 = readJson(path.join(NBA, "experimental-v0.1", "forecasts", "2026-10-21.json"));
  const ri = v01.games[0].receipt.inputs;
  const files = ["--schedule-file", path.join(APP, "public", "data", "nba", "schedule", "capture-2026-10-21T1428.json"), "--rosters-file", path.join(NBA, "rosters", "2026-10-21.json"), "--injuries-file", path.join(NBA, "v0.3-candidate", "fixtures", `injuries-${ri.injuries.sha256.slice(0, 16)}.json`)];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nba-v04-replay-"));
  const base = ["--family", "v0.4", "--date", "2026-10-21", "--simulations", "100", "--now", v01.games[0].receipt.generatedAt];
  const run = (args) => spawnSync(process.execPath, [script, ...base, ...files, ...args], { cwd: APP, encoding: "utf8" });
  // the unarmed guard runs before any input is read: --write with no --out is refused outright
  const noOut = spawnSync(process.execPath, [script, ...base, "--write"], { cwd: APP, encoding: "utf8" });
  assert.equal(noOut.status, 1);
  assert.match(noOut.stderr, /NOT ARMED/);
  const intoForecasts = run(["--out", path.join(NBA, "experimental-v0.4", "forecasts", "2026-10-21.json")]);
  assert.equal(intoForecasts.status, 1);
  assert.ok(!fs.existsSync(path.join(NBA, "experimental-v0.4")), "nothing is ever written under experimental-v0.4/");
  const out = path.join(tmp, "v0.4-2026-10-21.json");
  const ok = run(["--out", out]);
  assert.equal(ok.status, 0, ok.stderr);
  const doc = readJson(out);
  assert.equal(doc.family, "v0.4");
  assert.equal(doc.games.length, v01.games.length);
  for (const g of doc.games) assert.equal(g.receipt.inputs.alignedWith.family, "v0.1", "same cutoff as the official family");
  const lagged = doc.games.flatMap((g) => ["home", "away"].flatMap((s) => g[s].pool.laggedPrior.map((x) => x.name)));
  assert.ok(lagged.length >= 1, "the committed 2026-10-21 rosters hold returners whose prior is S−2");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("ISOLATION: no lane / snapshot / product / route / theater source names v0.4", () => {
  const SRC = path.join(APP, "src");
  const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);
  const isCode = (f) => /\.(m?js|tsx?)$/.test(f) && !/\.test\.m?js$|\.spec\.tsx?$/.test(f);
  const surfaces = [
    path.join(SRC, "lib", "sports", "nba", "experimental-public-lane.mjs"),
    path.join(SRC, "lib", "consistency", "official-snapshot.mjs"),
    path.join(APP, "scripts", "nba", "build-nba-experimental-public.mjs"),
    path.join(APP, "scripts", "nba", "publish-nba-experimental-lane.mjs"),
    ...walk(path.join(SRC, "lib", "products")).filter(isCode),
    ...walk(path.join(SRC, "lib", "simulation-theater")).filter(isCode),
    ...walk(path.join(SRC, "app")).filter(isCode),
    ...walk(path.join(SRC, "components")).filter(isCode),
  ].filter((f) => fs.existsSync(f));
  assert.ok(surfaces.length > 50, `scanned ${surfaces.length} files`);
  const MARKERS = /experimental-v0\.4|minutes-model-v04|nba-experimental-v0\.4|lagged-role-prior|["']v0\.4["']/;
  assert.deepEqual(surfaces.filter((f) => MARKERS.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(APP, f)), []);
});
