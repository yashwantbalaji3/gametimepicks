/**
 * MATCHUP EXPLORER + COMPARE — committed projection, boundaries and real-data contracts (v1.4 · §88–§92 §104–§105).
 *
 *  CX1  the committed compare projection is exactly a rebuild of the committed RESEARCH projection (deterministic,
 *       input-order independent) and names that research content hash — refresh order platform → research → compare
 *  CX2  no leak: no internal path, provenance key, other owner's field, personal key, credential or evaluative word
 *  CX3  boundaries: compare modules never import the Data Platform; client compare modules never import server-only
 *       modules or node built-ins; the builder input reads the research projection only
 *  CX4  registry integrity: exact canonical ids, entity slugs = research slugs, matchup sides exist, window, budget,
 *       indexing policy, durability floor (committed ids ⊆ rebuild)
 *  CX5  no pair explosion: compare routes carry one dynamic segment (sport); public asset count is linear in entities
 *  CX6  real data: symmetric Chiefs–Chargers H2H; same-name Manhertz players stay two ids; NFL 2026 never a default
 *       season; a real MLB doubleheader stays two meetings; exact-slug URL parsing (no name / case fallback)
 *  CX7  forecast separation: no compare module outside matchup-forecast.ts reads a forecast owner
 *
 * Run: npx tsx --test src/lib/compare/compare-projection.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { COMPARE_PROJECTION_DIR, EVALUATIVE_TERMS, FORBIDDEN_COMPARE_FIELDS, pairKey } from "./contract.mjs";
import { BLOCKER_COPY, FAMILY_COVERAGE_COPY } from "./copy.mjs";
import { getPlayerCompareEligibility } from "./eligibility.mjs";
import { getHeadToHead } from "./head-to-head.mjs";
import { MATCHUP_INDEXABLE_SPORTS, MATCHUP_PAGE_BUDGET, MATCHUP_WINDOWS } from "./matchup.mjs";
import { assembleCompareProjection, assertNoForbiddenCompareFields } from "./projection-build.mjs";
import { parseCompareQuery } from "./query.mjs";
import { readCompareFile, readPublishedMatchupIds, readResearchInput } from "./research-input.mjs";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.join(APP, "..");
const CMP = path.join(REPO, COMPARE_PROJECTION_DIR);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const walk = (dir, keep, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, keep, acc); else if (keep(e.name)) acc.push(p);
  }
  return acc;
};
const jsonl = (rel) => (readCompareFile(REPO, rel) ?? "").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const input = readResearchInput(REPO);
const committedIds = readPublishedMatchupIds(REPO);

test("CX1 committed compare projection = rebuild of the committed research projection (deterministic, order-free)", () => {
  const built = assembleCompareProjection({ ...input, previousMatchupIds: committedIds });
  const stale = [...built.files.keys()].filter((k) => readCompareFile(REPO, k) !== built.files.get(k));
  assert.deepEqual(stale, [], "run: node scripts/compare/build-compare-projections.mjs (after the research projection)");
  const receipt = JSON.parse(readCompareFile(REPO, "receipt.json"));
  assert.equal(receipt.researchContentSha256, input.researchContentSha256, "built from the CURRENT research projection");
  assert.doesNotMatch(readCompareFile(REPO, "receipt.json"), /"(builtAt|generatedAt|timestamp)"/, "no wall clock");
  // Order independence: every input array reversed → identical bytes.
  const rev = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v].reverse()]));
  const reversed = assembleCompareProjection({ ...input, index: [...input.index].reverse(), teams: rev(input.teams), players: rev(input.players), previousMatchupIds: committedIds });
  for (const k of built.files.keys()) assert.equal(reversed.files.get(k), built.files.get(k), `${k}: input order must not change bytes`);
});

test("CX2 no internal path, other owner's field, personal key, credential or evaluative word leaks", () => {
  const files = walk(CMP, () => true).map((f) => path.relative(CMP, f));
  assert.ok(files.length >= 15, `compare files: ${files.length}`);
  const needles = ["data/internal", "internal/platform", "research-projection", "/Users/", "app/public", "providerAliases", "sourcePath", "gtp.follow", "gtp.saved", "gtp.observation", "ODDS_API_KEY", "API_FOOTBALL_KEY", "espn-players-v1", "player-events-v1"];
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(CMP, rel));
    const s = (rel.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
    for (const n of needles) assert.ok(!s.includes(n), `${rel} contains ${n}`);
    assertNoForbiddenCompareFields(rel, s);
    assert.doesNotMatch(s, /all-time|beat the market|high confidence|best bet|\bedge\b/i, rel);
  }
  const copy = [...Object.values(BLOCKER_COPY).map((f) => f({ kind: "player", sportName: "NFL" })), ...Object.values(FAMILY_COVERAGE_COPY)].join(" ");
  for (const t of EVALUATIVE_TERMS) assert.doesNotMatch(copy, new RegExp(`\\b${t}\\b`, "i"), `compare copy says "${t}"`);
  // Positive controls: the detectors fire.
  assert.throws(() => assertNoForbiddenCompareFields("probe", '{"forecast":{"median":3}}'), /forbidden owner field/);
  assert.throws(() => assertNoForbiddenCompareFields("probe", '{"shadow":true}'), /forbidden owner field/);
  assert.ok(FORBIDDEN_COMPARE_FIELDS.includes("winProbability"));
});

test("CX3 boundaries: no Data Platform import; client compare modules import no server-only module", () => {
  const PLATFORM = /(from\s+|import\(\s*)["'`][^"'`]*data-platform\/|data\/internal\/platform/;
  const compareFiles = [
    ...walk(path.join(APP, "src/lib/compare"), (n) => /\.(tsx?|mjs)$/.test(n) && !n.endsWith(".test.mjs")),
    ...walk(path.join(APP, "src/components/compare"), (n) => /\.tsx?$/.test(n)),
    ...walk(path.join(APP, "src/app/compare"), (n) => /\.tsx?$/.test(n)),
    ...walk(path.join(APP, "src/app/matchups"), (n) => /\.tsx?$/.test(n)),
    ...walk(path.join(APP, "scripts/compare"), (n) => n.endsWith(".mjs")),
  ];
  assert.ok(compareFiles.length >= 20, `compare files: ${compareFiles.length}`);
  assert.deepEqual(compareFiles.filter((f) => PLATFORM.test(stripComments(fs.readFileSync(f, "utf8")))).map((f) => path.relative(APP, f)), []);
  assert.ok(PLATFORM.test('import { openPlatform } from "../data-platform/readers.mjs";'), "positive control");

  const SERVER_ONLY = /from\s+["'`]@\/lib\/compare\/(compare-store|matchup-forecast|research-input)(\.mjs)?["'`]|from\s+["'`]@\/lib\/research-pages\/(projection-store|game-links|forecast-join)["'`]|from\s+["'`]node:|from\s+["'`]@\/lib\/(my\/read-model|game-detail)["'`]/;
  const clients = walk(path.join(APP, "src"), (n) => /\.tsx?$/.test(n)).filter((f) => /^\s*["']use client["']/.test(fs.readFileSync(f, "utf8")));
  const hits = [];
  for (const f of clients) for (const line of fs.readFileSync(f, "utf8").split("\n")) if (SERVER_ONLY.test(line) && !/^\s*import\s+type\b/.test(line)) hits.push(`${path.relative(APP, f)}: ${line.trim()}`);
  assert.deepEqual(hits, []);
  assert.ok(SERVER_ONLY.test('import { matchupHref } from "@/lib/compare/compare-store";'), "positive control");
  // The pure compare modules the browser bundles touch no filesystem, clock or network.
  for (const f of ["contract.mjs", "copy.mjs", "eligibility.mjs", "entities.mjs", "head-to-head.mjs", "matchup.mjs", "player-compare.mjs", "query.mjs", "stat-families.mjs", "team-compare.mjs"]) {
    const s = stripComments(fs.readFileSync(path.join(APP, "src/lib/compare", f), "utf8"));
    assert.doesNotMatch(s, /from\s+["']node:|Date\.now\(|new Date\(|fetch\(|localStorage/, f);
    // Browser-bundled: must not import the research stat-group registry, which names platform family keys (EX1).
    assert.doesNotMatch(s, /stat-groups|data-platform|\b(nfl|mlb|epl|ufc)\.[a-z]+-[a-z-]+\b/, `${f} names a platform family`);
  }
});

test("CX4 registry integrity, windows, budget, indexing policy and the durability floor", () => {
  const research = new Map(input.index.map((e) => [e.id, e]));
  for (const [sport, re] of [["MLB", /^mlb-team-\d+$/], ["NFL", /^nfl-team-\d+$/]]) {
    for (const t of jsonl(`teams/${sport}.jsonl`)) {
      assert.match(t.id, re);
      assert.equal(t.slug, research.get(t.id).slug, "compare slug is the research slug");
      assert.equal(t.path, research.get(t.id).path);
    }
  }
  for (const [sport, re] of [["NFL", /^nfl-athlete-\d+$/], ["EPL", /^epl-athlete-\d+$/], ["MLB", /^mlb-player-\d+$/]]) {
    const players = jsonl(`players/${sport}.jsonl`);
    assert.ok(players.length > 100, `${sport} players ${players.length}`);
    const slugs = new Set();
    for (const p of players) {
      assert.match(p.id, re);
      assert.equal(p.slug, research.get(p.id).slug);
      assert.ok(!slugs.has(p.slug)); slugs.add(p.slug);
      assert.ok(p.stats.length > 0 && p.stats.every((k) => k.startsWith(`${sport}.`)), `${p.id} stats`);
      for (const r of p.rows) assert.equal(r.length, 6 + p.stats.length);
    }
  }
  assert.ok(!fs.existsSync(path.join(CMP, "players/UFC.jsonl.gz")) && !fs.existsSync(path.join(CMP, "teams/EPL.jsonl.gz")), "no UFC player or EPL team compare artifact");
  let total = 0;
  for (const sport of ["MLB", "NFL"]) {
    const teams = new Set(jsonl(`teams/${sport}.jsonl`).map((t) => t.id));
    const entries = jsonl(`matchups/${sport}.jsonl`);
    total += entries.length;
    assert.equal(new Set(entries.map((e) => e.gameId)).size, entries.length, "unique game ids");
    for (const e of entries) {
      assert.match(e.gameId, /^\d+$/);
      assert.ok(teams.has(e.homeTeamId) && teams.has(e.awayTeamId) && e.homeTeamId !== e.awayTeamId);
      assert.equal(e.seasonId, MATCHUP_WINDOWS[sport].seasonId);
      assert.ok(e.startUtc >= MATCHUP_WINDOWS[sport].fromUtc);
      assert.equal(e.path, `/matchups/${sport.toLowerCase()}/${e.gameId}/`);
      assert.equal(e.indexable, MATCHUP_INDEXABLE_SPORTS.includes(sport) && e.priorMeetings > 0);
    }
  }
  assert.ok(total <= MATCHUP_PAGE_BUDGET && total > 0);
  // Durability: the committed ids are a floor — a rebuild that loses one throws (see CP9 for the refusal itself).
  const rebuilt = assembleCompareProjection({ ...input, previousMatchupIds: committedIds });
  for (const s of ["MLB", "NFL"]) {
    const ids = new Set(rebuilt.files.get(`matchups/${s}.jsonl`).split("\n").filter(Boolean).map((l) => JSON.parse(l).gameId));
    assert.ok(committedIds[s].every((id) => ids.has(id)), `${s} durability`);
  }
});

test("CX5 no pair explosion: one dynamic segment per compare route; assets linear in entities", () => {
  const pages = walk(path.join(APP, "src/app/compare"), (n) => n === "page.tsx").map((f) => path.relative(path.join(APP, "src/app"), path.dirname(f)));
  assert.deepEqual(pages.sort(), ["compare", "compare/players/[sport]", "compare/teams/[sport]"]);
  const matchupPages = walk(path.join(APP, "src/app/matchups"), (n) => n === "page.tsx").map((f) => path.relative(path.join(APP, "src/app"), path.dirname(f)));
  assert.deepEqual(matchupPages, ["matchups/[sport]/[gameId]"], "matchups keyed by ONE game id, never a pair of entities");
  const rd = JSON.parse(readCompareFile(REPO, "readiness.json"));
  const entities = Object.values(rd.entities).reduce((a, n) => a + n, 0);
  assert.ok(entities < 2000, "assets are one file per entity; a pair file would be O(n²)");
  for (const s of ["MLB", "NFL"]) assert.match(rd.headToHead[s].storage, /no per-pair file/);
  assert.ok(![...walk(CMP, () => true)].some((f) => /pair|h2h|head-to-head/i.test(path.relative(CMP, f))), "no per-pair artifact");
});

test("CX6 real data: symmetry, same-name identity, honest default season, doubleheader, exact slugs", () => {
  const nfl = new Map(jsonl("teams/NFL.jsonl").map((t) => [t.slug, t]));
  const kc = nfl.get("kansas-city-chiefs"), lac = nfl.get("los-angeles-chargers");
  const ab = getHeadToHead({ a: kc, b: lac }), ba = getHeadToHead({ a: lac, b: kc });
  assert.equal(ab.pair, pairKey("NFL", lac.id, kc.id));
  assert.ok(ab.record.meetings >= 50, `KC-LAC meetings ${ab.record.meetings}`);
  assert.deepEqual(ab.meetings.map((m) => m.gameId), ba.meetings.map((m) => m.gameId));
  assert.equal(ab.record.aWins, ba.record.bWins);
  assert.equal(ab.recordedFrom, "NFL-1999", "depth stated from coverage, not all-time");

  const players = jsonl("players/NFL.jsonl");
  const manhertz = players.filter((p) => p.name === "Chris Manhertz");
  assert.equal(manhertz.length, 2, "two ESPN athletes share the name");
  assert.notEqual(manhertz[0].id, manhertz[1].id);
  const e = getPlayerCompareEligibility(manhertz[0], manhertz[1]);
  assert.ok(!e.blockers.includes("SAME_ENTITY"), "same name is not the same player");

  // NFL 2026 player logs are blocked upstream: no pair can default to (or even share) 2026.
  const sample = players.filter((p) => p.stats.includes("NFL.receivingYards")).slice(0, 40);
  for (let i = 0; i + 1 < sample.length; i += 2) {
    const el = getPlayerCompareEligibility(sample[i], sample[i + 1]);
    assert.ok(!el.sharedSeasons.includes("NFL-2026"), `${sample[i].slug} vs ${sample[i + 1].slug}`);
  }

  // A real MLB same-day doubleheader: both games are meetings, never collapsed.
  const mlb = jsonl("teams/MLB.jsonl");
  let checked = 0;
  for (const a of mlb) {
    const days = new Map();
    for (const r of a.rows) if (r[8]) { const k = `${r[4]}|${String(r[1]).slice(0, 10)}`; days.set(k, [...(days.get(k) ?? []), r[0]]); }
    for (const [k, ids] of days) {
      if (ids.length < 2) continue;
      const b = mlb.find((t) => t.id === k.split("|")[0]);
      const h = getHeadToHead({ a, b });
      for (const id of ids) assert.ok(h.meetings.some((m) => m.gameId === id), `doubleheader game ${id}`);
      checked += 1;
      break;
    }
    if (checked) break;
  }
  assert.equal(checked, 1, "a committed doubleheader exists to test");

  // Exact slug parsing: a display name, a case variant or a near miss is invalid — never resolved.
  const index = JSON.parse(readCompareFile(REPO, "indexes/players-nfl.json"));
  const ok = parseCompareQuery("?a=keenan-allen&b=travis-kelce&stat=receiving-yards", index);
  assert.ok(ok.a.id && ok.b.id && ok.stat === "NFL.receivingYards");
  for (const bad of ["Keenan Allen", "Keenan-Allen", "keenan-alle", "keenan"]) assert.equal(parseCompareQuery(`?a=${encodeURIComponent(bad)}`, index).a.invalid, true, bad);
  assert.equal(parseCompareQuery("?stat=receivingYards", index).statInvalid, true);
  assert.equal(parseCompareQuery("?stat=goals", index).statInvalid, true, "another sport's stat is not a key here");
});

test("CX7 forecast separation: only matchup-forecast.ts reads a forecast owner, and it copies no value", () => {
  const OWNER = /@\/lib\/(my\/read-model|game-detail|sports\/nfl|mlb\/prediction|live\/forecast-join)|forecast-join/;
  const files = walk(path.join(APP, "src/lib/compare"), (n) => /\.(tsx?|mjs)$/.test(n) && !n.endsWith(".test.mjs"));
  const readers = files.filter((f) => OWNER.test(stripComments(fs.readFileSync(f, "utf8")))).map((f) => path.basename(f));
  assert.deepEqual(readers, ["matchup-forecast.ts"]);
  const src = stripComments(fs.readFileSync(path.join(APP, "src/lib/compare/matchup-forecast.ts"), "utf8"));
  assert.doesNotMatch(src, /\.(median|p10|p90|probability|winProb|total|spread)\b/, "a link and names only — no forecast value");
});
