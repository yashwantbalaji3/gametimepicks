/**
 * RESEARCH LAB — committed projection, boundaries and real-data contracts (v1.5 · §106–§121 unit).
 *
 *  LX1  the committed Lab projection is exactly a rebuild of the committed COMPARE projection (deterministic,
 *       input-order independent) and names that compare content hash — refresh order platform → research → compare → lab
 *  LX2  no leak: no internal path, provenance key, provider name, other owner's field, personal key or credential
 *  LX3  boundaries: no Lab module imports the Data Platform; no client-reachable Lab module imports a node built-in,
 *       a server-only module or a forecast/Live/settlement owner; the builder input reads compare + the research registry only
 *  LX4  projection integrity: one row per canonical game id, every index resolves, slugs are the upstream slugs,
 *       and every emitted route is a durable Matchup Explorer page that the compare registry publishes
 *  LX5  no route or asset explosion: one Lab route, a bounded number of public assets, none per query or per row
 *  LX6  real data: the Chiefs–Chargers 2025 neutral-site opener is neutral; the 2025 KC season record matches the
 *       Season Explorer row; a real MLB doubleheader stays two games; NFL 2026 is absent from player rows
 *  LX7  coverage drives the UI: every season a mode offers has rows, every offered stat has rows in its season,
 *       and every blocked sport carries a coded reason
 *  LX8  owner boundary: no Lab artifact carries a forecast, a Live state, a settlement grade or a reader preference
 *
 * Run: npx tsx --test src/lib/lab/lab-projection.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { LAB_ASSET_PREFIX, LAB_BUDGET, LAB_EVALUATIVE_TERMS, LAB_MODE_SPORTS, LAB_PROJECTION_DIR, LAB_ROUTE, labAssetPath, labBlocker } from "./contract.mjs";
import { GAME, HOST_KNOWN, PLAYER, SEASON } from "./fields.mjs";
import { COVERAGE_COPY, ERROR_COPY } from "./copy.mjs";
import { assembleLabProjection, assertNoForbiddenLabFields } from "./projection-build.mjs";
import { readLabFile, readLabInput } from "./compare-input.mjs";
import { labDataset } from "./dataset.mjs";
import { executeLabQuery } from "./engine.mjs";
import { parseLabQuery, validateLabQuery } from "./query.mjs";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.join(APP, "..");
const LAB = path.join(REPO, LAB_PROJECTION_DIR);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const walk = (dir, keep = () => true, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, keep, acc); else if (keep(e.name)) acc.push(p);
  }
  return acc;
};
const doc = (rel) => JSON.parse(readLabFile(REPO, rel));
const index = (mode, sport) => doc(`indexes/${mode}-${sport.toLowerCase()}.json`);
const part = (mode, sport, season) => doc(mode === "players" ? `players/${sport}/${season}.json` : `${mode}/${sport}.json`);

const input = readLabInput(REPO);

test("LX1 committed lab projection = rebuild of the committed compare projection (deterministic, order-free)", () => {
  const built = assembleLabProjection(input);
  const stale = [...built.files.keys()].filter((k) => readLabFile(REPO, k) !== built.files.get(k));
  assert.deepEqual(stale, [], "run: node scripts/lab/build-lab-projections.mjs (after platform → research → compare)");
  const receipt = doc("receipt.json");
  assert.equal(receipt.compareContentSha256, input.compareContentSha256, "built from the CURRENT compare projection");
  assert.equal(receipt.researchContentSha256, input.researchContentSha256, "built from the CURRENT research projection");
  assert.doesNotMatch(readLabFile(REPO, "receipt.json"), /"(builtAt|generatedAt|timestamp)"/, "no wall clock in content identity");
  // Order independence: every input array reversed → identical bytes.
  const rev = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v].reverse()]));
  const reversed = assembleLabProjection({ ...input, teams: rev(input.teams), players: rev(input.players), matchups: rev(input.matchups), registry: [...input.registry].reverse() });
  for (const k of built.files.keys()) assert.equal(reversed.files.get(k), built.files.get(k), `${k}: input order must not change bytes`);
});

test("LX2 no internal path, provenance key, provider name, personal key or credential leaks", () => {
  const files = walk(LAB).map((f) => path.relative(LAB, f));
  assert.ok(files.length >= 25, `lab files: ${files.length}`);
  const needles = [
    "data/internal", "internal/platform", "research-projection", "compare-projection", "/Users/", "/home/", "app/public",
    "providerAliases", "sourcePath", "src\":", "gtp.follow", "gtp.saved", "gtp.observation", "ODDS_API_KEY", "API_FOOTBALL_KEY",
    "espn", "statsapi", "nflverse", "openfootball", "gsis", "pfr", "the-odds-api",
  ];
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(LAB, rel));
    const s = (rel.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
    for (const n of needles) assert.ok(!s.toLowerCase().includes(n.toLowerCase()), `${rel} contains ${n}`);
    assertNoForbiddenLabFields(rel, s);
    assert.doesNotMatch(s, /all-time|beat the market|best bet|hit rate|power ranking/i, rel);
  }
  const copy = [...Object.values(ERROR_COPY).map((f) => f()), ...Object.values(COVERAGE_COPY)].join(" ");
  for (const t of LAB_EVALUATIVE_TERMS) assert.doesNotMatch(copy, new RegExp(`\\b${t}\\b`, "i"), `lab copy says "${t}"`);
});

test("LX3 boundaries: no platform read, no server module or node built-in in a browser-reachable Lab module", () => {
  // Product modules only. This file names the internal store path in its own leak needles and in the pattern
  // below, so including tests would make this guard — and the platform's own B1, which scans raw source — trip on
  // an assertion instead of on a real read (the v1.4 CX3 self-trip, repeated).
  const isTest = (n) => n.endsWith(".test.mjs") || n.endsWith(".test.ts");
  const modules = walk(path.join(APP, "src/lib/lab"), (n) => (n.endsWith(".mjs") || n.endsWith(".ts")) && !isTest(n));
  assert.ok(modules.length >= 6, `lab modules: ${modules.length}`);
  // B1 is NOT widened: nothing under lib/lab, and no Lab script, reads the Data Platform.
  for (const f of [...modules, ...walk(path.join(APP, "scripts/lab"), (n) => n.endsWith(".mjs") && !isTest(n))]) {
    const s = stripComments(fs.readFileSync(f, "utf8"));
    assert.doesNotMatch(s, /data-platform\/readers|data\/internal\/platform|openPlatform|readStore\(/, `${path.basename(f)} reads the Data Platform`);
  }
  // Browser-reachable modules: the query grammar, the engine, the dataset, the field registry and the copy.
  for (const name of ["contract.mjs", "fields.mjs", "query.mjs", "engine.mjs", "dataset.mjs", "copy.mjs"]) {
    const s = stripComments(fs.readFileSync(path.join(APP, "src/lib/lab", name), "utf8"));
    assert.doesNotMatch(s, /from "node:(fs|path|zlib|crypto|child_process)"/, `${name} imports a node built-in`);
    assert.doesNotMatch(s, /projection-store|compare-store|lab-store|game-links|forecast-join|my\/read-model|data-mlb|sports\/(ufc|epl)\//, `${name} imports a server-only module`);
    assert.doesNotMatch(s, /\/api\/live|api\/live|fetch\(/, `${name} makes a request`);
    assert.doesNotMatch(s, /localStorage|sessionStorage|indexedDB/i, `${name} touches device storage`);
    assert.doesNotMatch(s, /Date\.now|new Date\(\)/, `${name} reads a clock`);
  }
  // The builder input reads the two upstream projections and nothing else.
  const ci = stripComments(fs.readFileSync(path.join(APP, "src/lib/lab/compare-input.mjs"), "utf8"));
  assert.match(ci, /COMPARE_PROJECTION_DIR/);
  assert.match(ci, /RESEARCH_PROJECTION_DIR/);
  assert.doesNotMatch(ci, /http|fetch|execFile|spawn/);
  // Projection assembly is pure.
  const pb = stripComments(fs.readFileSync(path.join(APP, "src/lib/lab/projection-build.mjs"), "utf8"));
  assert.doesNotMatch(pb, /from "node:|Date\.now|new Date\(|fetch\(/);
});

test("LX4 projection integrity: unique game ids, resolving indexes, upstream slugs, durable routes only", () => {
  const registrySlug = new Map(input.registry.map((e) => [`${e.kind}|${e.sport}|${e.id}`, e.slug]));
  const matchupPaths = new Set(Object.values(input.matchups).flat().map((m) => m.path));
  for (const sport of LAB_MODE_SPORTS.games) {
    const d = part("games", sport);
    const ids = new Set(d.rows.map((r) => r[GAME.ID]));
    assert.equal(ids.size, d.rows.length, `${sport} games: a game id appears twice`);
    for (const t of d.teams) assert.equal(t[0], registrySlug.get(`team|${sport}|${t[1]}`), `${sport} ${t[1]}: slug is not the upstream slug`);
    for (const r of d.rows) {
      assert.ok(d.teams[r[GAME.A]] && d.teams[r[GAME.B]], "team index resolves");
      assert.ok(d.seasons[r[GAME.SEASON]], "season index resolves");
      assert.ok(Number.isInteger(r[GAME.SCORE_A]) && Number.isInteger(r[GAME.SCORE_B]), "a game row is a recorded final");
      // A route is emitted ONLY when the durable compare registry publishes that page — never synthesised.
      if (r[GAME.PATH]) assert.ok(matchupPaths.has(r[GAME.PATH]), `${r[GAME.PATH]} is not a published Matchup Explorer page`);
    }
  }
  for (const sport of LAB_MODE_SPORTS.players) {
    const idx = index("players", sport);
    for (const e of idx.entities) assert.equal(e[0], registrySlug.get(`player|${sport}|${e[1]}`), `${sport} ${e[1]}: slug is not the upstream slug`);
    for (const t of idx.teams) if (t[0]) assert.equal(t[0], registrySlug.get(`team|${sport}|${t[1]}`), `${sport} ${t[1]}: team slug is not the upstream slug`);
    for (const season of idx.seasons) {
      const d = part("players", sport, season);
      const seen = new Set();
      for (const r of d.rows) {
        const k = `${r[PLAYER.PLAYER]}|${r[PLAYER.ID]}`;
        assert.ok(!seen.has(k), `${sport} ${season}: duplicate player-game ${k}`);
        seen.add(k);
        assert.ok(d.players[r[PLAYER.PLAYER]], "player index resolves");
      }
    }
  }
  for (const sport of LAB_MODE_SPORTS.seasons) {
    const d = part("seasons", sport);
    for (const r of d.rows) assert.equal(r[SEASON.W] + r[SEASON.L] + r[SEASON.T], r[SEASON.FINALS], `${sport}: W+L+T is not the finals count`);
  }
});

test("LX5 no route or asset explosion: one route, a bounded asset count, none per query or per row", () => {
  // ONE Lab route family. A query is state, not a page.
  const routes = walk(path.join(APP, "src/app/research"), (n) => n === "page.tsx").map((f) => path.relative(path.join(APP, "src/app"), f));
  assert.deepEqual(routes.sort(), ["research/lab/page.tsx", "research/page.tsx"], "the Lab must add exactly one route");
  assert.equal(LAB_ROUTE, "/research/lab/");
  // Public assets: one index per mode+sport plus one partition per games/seasons sport and per player season.
  const modes = Object.entries(LAB_MODE_SPORTS);
  const expectedIndexes = modes.reduce((n, [, sports]) => n + sports.length, 0);
  const expectedPartitions = LAB_MODE_SPORTS.games.length + LAB_MODE_SPORTS.seasons.length
    + LAB_MODE_SPORTS.players.reduce((n, s) => n + index("players", s).seasons.length, 0);
  const files = walk(LAB).map((f) => path.relative(LAB, f));
  const partitions = files.filter((f) => /^(games|players|seasons)\//.test(f)).length;
  assert.equal(files.filter((f) => f.startsWith("indexes/")).length, expectedIndexes);
  assert.equal(partitions, expectedPartitions);
  // The count is linear in seasons, never in rows or queries: assert the ratio explicitly.
  const totalRows = modes.reduce((n, [mode, sports]) => n + sports.reduce((m, s) => m + index(mode, s).totalRows, 0), 0);
  assert.ok(totalRows > 90000, `rows ${totalRows}`);
  assert.ok(partitions <= 30, `${partitions} partitions for ${totalRows} rows`);
  // Every public asset path the contract can produce is inside the one prefix.
  for (const p of [labAssetPath.index("games", "MLB"), labAssetPath.games("NFL"), labAssetPath.players("NFL", "NFL-2025"), labAssetPath.seasons("MLB")]) {
    assert.ok(p.startsWith(`${LAB_ASSET_PREFIX}/`), p);
  }
});

test("LX6 real data: the 2025 KC–LAC neutral opener, the KC 2025 record, a real doubleheader, no NFL 2026 player rows", () => {
  const nflGames = index("games", "NFL");
  const gamesDs = labDataset("games", nflGames, part("games", "NFL"), 2);
  const runQ = (search, idx, ds) => {
    const { query } = parseLabQuery(search, idx);
    const v = validateLabQuery(query, idx);
    assert.equal(v.valid, true, `${search}: ${JSON.stringify(v.errors)}`);
    return executeLabQuery(v.query, ds);
  };
  // The 2025 Chiefs–Chargers opener was played at a neutral site: the source proves no host, so it is neutral on
  // BOTH sides and can never be counted as a home game for either team.
  const pair = runQ("?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs&opp=los-angeles-chargers&sort=date-asc", nflGames, gamesDs);
  assert.ok(pair.totalMatched >= 2, `KC–LAC 2025 meetings: ${pair.totalMatched}`);
  const opener = pair.rows[0];
  assert.equal(opener.hostKnown, false);
  assert.equal(opener.perspective.homeAway, "N");
  assert.equal(runQ("?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs&ha=H", nflGames, gamesDs).rows.some((r) => r.gameId === opener.gameId), false);
  assert.equal(runQ("?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs&ha=A", nflGames, gamesDs).rows.some((r) => r.gameId === opener.gameId), false);
  // Game Finder and Season Explorer must agree about the same season, or one of them is wrong.
  const kcGames = runQ("?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs", nflGames, gamesDs);
  const wins = kcGames.rows.filter((r) => r.perspective.result === "W").length;
  const losses = kcGames.rows.filter((r) => r.perspective.result === "L").length;
  const scored = kcGames.rows.reduce((n, r) => n + r.perspective.scored, 0);
  const nflSeasons = index("seasons", "NFL");
  const seasonRow = runQ("?mode=seasons&sport=nfl&season=NFL-2025&team=kansas-city-chiefs", nflSeasons, labDataset("seasons", nflSeasons, part("seasons", "NFL"), 1)).rows[0];
  assert.equal(seasonRow.finals, kcGames.totalMatched, "Season Explorer finals ≠ Game Finder rows");
  assert.equal(seasonRow.wins, wins);
  assert.equal(seasonRow.losses, losses);
  assert.equal(seasonRow.scored, scored);
  // A real MLB doubleheader stays two games with two ids on one date.
  const mlbGames = index("games", "MLB");
  const mlbDs = labDataset("games", mlbGames, part("games", "MLB"), 2);
  const byDate = new Map();
  for (const r of part("games", "MLB").rows) {
    const key = `${r[GAME.DATE].slice(0, 10)}|${[r[GAME.A], r[GAME.B]].sort().join("-")}`;
    byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }
  const doubles = [...byDate.values()].filter((n) => n > 1).length;
  assert.ok(doubles > 0, "no MLB doubleheader found — the dedupe key may have collapsed one");
  assert.equal(runQ("?mode=games&sport=mlb&season=all", mlbGames, mlbDs).totalMatched, part("games", "MLB").rows.length);
  // NFL 2026 player logs are blocked upstream: the season is absent from the projection, so it cannot be offered.
  assert.equal(index("players", "NFL").seasons.includes("NFL-2026"), false);
  assert.equal(index("players", "EPL").seasons.includes("EPL-2026-27"), false);
  assert.ok(fs.existsSync(path.join(LAB, "players/NFL/NFL-2025.json.gz")));
  assert.equal(fs.existsSync(path.join(LAB, "players/NFL/NFL-2026.json.gz")), false);
});

test("LX7 coverage drives the UI: every offered season and stat has rows; every blocked sport is explained", () => {
  for (const [mode, sports] of Object.entries(LAB_MODE_SPORTS)) {
    for (const sport of sports) {
      const idx = index(mode, sport);
      assert.ok(idx.seasons.length > 0, `${mode}/${sport} offers no season`);
      for (const s of idx.seasons) assert.ok(idx.rowsBySeason[s] > 0, `${mode}/${sport} offers ${s} with no rows`);
      assert.ok(idx.coverage.notes.every((n) => COVERAGE_COPY[n]), `${mode}/${sport} coverage note without copy: ${idx.coverage.notes}`);
      if (mode === "players") {
        for (const s of idx.seasons) {
          assert.ok(idx.seasonFamilies[s]?.length > 0, `${sport} ${s} offers no stat`);
          for (const k of idx.seasonFamilies[s]) assert.ok(idx.families.includes(k), `${sport} ${s}: ${k} is not a family`);
        }
        // A family with no rows in a season is not offered for it — measured, not assumed.
        const d = part("players", sport, idx.seasons[0]);
        for (const k of idx.families) {
          const i = idx.families.indexOf(k);
          const has = d.rows.some((r) => typeof r[PLAYER.VALUES + i] === "number");
          assert.equal(idx.seasonFamilies[idx.seasons[0]].includes(k), has, `${sport} ${idx.seasons[0]} ${k}`);
        }
      }
    }
  }
  const readiness = doc("readiness.json");
  for (const [mode, sports] of Object.entries({ games: ["EPL", "UFC"], players: ["UFC"], seasons: ["EPL", "UFC"] })) {
    for (const sport of sports) {
      assert.equal(readiness[mode][sport].shipped, false, `${mode}/${sport}`);
      assert.equal(readiness[mode][sport].blocker, labBlocker(mode, sport), `${mode}/${sport}`);
      assert.equal(readiness[mode][sport].rows, 0);
      assert.equal(fs.existsSync(path.join(LAB, `${mode}/${sport}.json.gz`)), false, `${mode}/${sport} must have no artifact`);
    }
  }
  assert.equal(LAB_BUDGET.maxPartitions, 2);
});

test("LX8 owner boundary: no forecast, Live state, settlement grade or reader preference in any Lab artifact", () => {
  const forbidden = [
    "forecast", "prediction", "probability", "winProbability", "confidence", "p10", "p90", "odds", "price", "line",
    "liveState", "inning", "clock", "settled", "gradedAt", "followed", "saved", "observedAt", "modelStatus", "shadow",
  ];
  for (const f of walk(LAB)) {
    const buf = fs.readFileSync(f);
    const s = (f.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
    for (const key of forbidden) assert.ok(!s.includes(`"${key}"`), `${path.relative(LAB, f)} carries "${key}"`);
  }
  // Only the matchup REGISTRY path may point outside the research pages; no Lab artifact names a forecast route.
  for (const sport of LAB_MODE_SPORTS.games) {
    for (const r of part("games", sport).rows) {
      if (r[GAME.PATH]) assert.match(r[GAME.PATH], /^\/matchups\//, r[GAME.PATH]);
    }
  }
  // Positive control: the guard really can fail.
  assert.throws(() => assertNoForbiddenLabFields("probe", '{"forecast":1}'), /forbidden owner field/);
  assert.throws(() => assertNoForbiddenLabFields("probe", '{"gradedAt":"x"}'), /forbidden owner field/);
  // HOST_KNOWN is a single bit and nothing else is packed into flags.
  assert.equal(HOST_KNOWN, 1);
});
