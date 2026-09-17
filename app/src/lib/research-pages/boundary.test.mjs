/**
 * TEAM + PLAYER RESEARCH — boundaries and committed projection (v1.3 · §71–§73 · §114).
 *
 *  RB1  pages, components and research page-side modules never import the Data Platform or read its store
 *  RB2  client modules never import server-only research modules (projection reader, game links, forecast join) or node:fs
 *  RB3  the committed projection is exactly what a rebuild from the committed platform produces (deterministic, no hand edits)
 *  RB4  the projection was built from the CURRENT committed platform manifest
 *  RB5  no leak: no internal path, provenance key, provider alias, forecast/settlement/personal field, or credential
 *  RB6  registry integrity: exact canonical ids, unique slugs per (kind, sport), budget, index ⇔ partitions agree
 *  RB7  the platform reader the builder depends on refuses a store or record of a foreign schemaVersion
 *
 * Run: npx tsx --test src/lib/research-pages/boundary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import os from "node:os";

import { openPlatform, readSportFromDisk, readStoreText } from "../data-platform/readers.mjs";
import { assembleResearchProjection, assertNoForbiddenFields } from "./projection-build.mjs";
import { RESEARCH_PROJECTION_DIR, RESEARCH_SPORTS, FORBIDDEN_PROJECTION_FIELDS } from "./contract.mjs";
import { RESEARCH_PAGE_BUDGET } from "./eligibility.mjs";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.join(APP, "..");
const PROJ = path.join(REPO, RESEARCH_PROJECTION_DIR);
const PLATFORM = path.join(REPO, "data/internal/platform/v1");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const walk = (dir, keep, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, keep, acc); else if (keep(e.name)) acc.push(p);
  }
  return acc;
};
const readProj = (rel) => {
  const buf = fs.readFileSync(path.join(PROJ, rel));
  return (rel.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
};

// This module (the test) is the ONLY research-package file allowed to read the platform, and only to prove RB3/RB4.
const PLATFORM_IMPORT = /(from\s+|import\(\s*)["'`][^"'`]*data-platform\//;
const STORE_PATH = /data\/internal\/platform|internal["'`],\s*["'`]platform/;

test("RB1 research pages, components and page-side modules never touch the Data Platform", () => {
  const files = [
    ...walk(path.join(APP, "src/app/teams"), (n) => /\.(tsx?|mjs)$/.test(n)),
    ...walk(path.join(APP, "src/app/players"), (n) => /\.(tsx?|mjs)$/.test(n)),
    ...walk(path.join(APP, "src/components/research-pages"), (n) => /\.(tsx?|mjs)$/.test(n)),
    ...walk(path.join(APP, "src/lib/research-pages"), (n) => /\.(tsx?|mjs)$/.test(n) && !n.endsWith(".test.mjs")),
  ];
  assert.ok(files.length >= 14, `research files found: ${files.length}`);
  const hits = files.filter((f) => { const s = stripComments(fs.readFileSync(f, "utf8")); return PLATFORM_IMPORT.test(s) || STORE_PATH.test(s); });
  assert.deepEqual(hits.map((f) => path.relative(APP, f)), []);
  // positive control
  assert.ok(PLATFORM_IMPORT.test('import { openPlatform } from "@/lib/data-platform/readers.mjs";'));
});

test("RB2 client modules never import server-only research modules or the filesystem", () => {
  const SERVER_ONLY = /from\s+["'`]@\/lib\/research-pages\/(projection-store|game-links|forecast-join)["'`]|from\s+["'`]node:(fs|path|zlib)["'`]|from\s+["'`]@\/lib\/my\/read-model["'`]/;
  const clients = walk(path.join(APP, "src"), (n) => /\.tsx?$/.test(n)).filter((f) => /^\s*["']use client["']/.test(fs.readFileSync(f, "utf8")));
  assert.ok(clients.length > 20);
  const hits = [];
  for (const f of clients) {
    const src = fs.readFileSync(f, "utf8");
    // `import type` is erased at compile time and ships nothing.
    for (const line of src.split("\n")) if (SERVER_ONLY.test(line) && !/^\s*import\s+type\b/.test(line)) hits.push(`${path.relative(APP, f)}: ${line.trim()}`);
  }
  assert.deepEqual(hits, []);
  assert.ok(SERVER_ONLY.test('import { teamBySlug } from "@/lib/research-pages/projection-store";'));
});

test("RB3+RB4 the committed projection equals a rebuild from the committed platform, which is the current one", () => {
  const manifestText = fs.readFileSync(path.join(PLATFORM, "manifest.json"), "utf8");
  const seasons = JSON.parse(readStoreText(path.join(PLATFORM, "seasons.json"))).records;
  const sports = Object.fromEntries(RESEARCH_SPORTS.map((s) => [s, readSportFromDisk(PLATFORM, s)]));
  const a = assembleResearchProjection({ manifestSha256: sha(manifestText), seasons, sports });
  // Order independence on a slice (a full second assembly costs seconds of unit-phase CI time): same records,
  // every input array reversed → identical bytes. No filesystem iteration order or ingestion order can leak in.
  const slice = (v, rev) => {
    const keep = new Set(v.players.slice(0, 120).map((p) => p.id));
    const o = (arr) => (rev ? [...arr].reverse() : arr);
    return { ...v, teams: o(v.teams), games: o(v.games), teamGameStats: o(v.teamGameStats), players: o(v.players.filter((p) => keep.has(p.id))), playerGameStats: o(v.playerGameStats.filter((r) => keep.has(r.playerId))) };
  };
  const f1 = assembleResearchProjection({ manifestSha256: "probe", seasons, sports: Object.fromEntries(Object.entries(sports).map(([k, v]) => [k, slice(v, false)])) });
  const f2 = assembleResearchProjection({ manifestSha256: "probe", seasons, sports: Object.fromEntries(Object.entries(sports).map(([k, v]) => [k, slice(v, true)])) });
  assert.deepEqual([...f1.files.keys()], [...f2.files.keys()]);
  for (const k of f1.files.keys()) assert.equal(f1.files.get(k), f2.files.get(k), `${k}: input order must not change bytes`);
  const stored = (p) => (p.endsWith(".jsonl") ? `${p}.gz` : p);
  const stale = [...a.files.keys()].filter((k) => readProj(stored(k)) !== a.files.get(k));
  assert.deepEqual(stale, [], "run: node scripts/research/build-research-projections.mjs (after a platform refresh)");
  const receipt = JSON.parse(readProj("receipt.json"));
  assert.equal(receipt.platformManifestSha256, sha(manifestText), "the projection must be built from the committed platform manifest");
  assert.doesNotMatch(readProj("receipt.json"), /"(builtAt|generatedAt|timestamp)"/, "no wall clock in the receipt");
});

test("RB5 the projection leaks nothing internal, no other owner's field, and no personal or credential state", () => {
  const files = walk(PROJ, () => true).map((f) => path.relative(PROJ, f));
  assert.ok(files.length >= 12);
  const sourceKeys = JSON.parse(fs.readFileSync(path.join(PLATFORM, "sources.json"), "utf8")).sources.map((s) => s.key);
  const needles = ["data/internal", "internal/platform", "/Users/", "app/public", "player-events-v1", "id-bridge", "espn-players-v1", "providerAliases", "gtp.follow", "gtp.saved", "gtp.observation", "ODDS_API_KEY", "API_FOOTBALL_KEY", ...sourceKeys.map((k) => `"${k}"`)];
  for (const rel of files) {
    const s = readProj(rel);
    for (const n of needles) assert.ok(!s.includes(n), `${rel} contains ${n}`);
    assertNoForbiddenFields(rel, s);
    assert.doesNotMatch(s, /career|all-time|beat the market|high confidence|\bedge\b/i, rel);
  }
  // mutation-style control: the detector fires on a leak shape
  assert.throws(() => assertNoForbiddenFields("probe", '{"gradedAt":"2026-01-01"}'), /forbidden owner field/);
  assert.ok(FORBIDDEN_PROJECTION_FIELDS.includes("src"));
});

test("RB6 registry integrity: exact canonical ids, unique slugs, budget, index and partitions agree", () => {
  const index = JSON.parse(readProj("index.json"));
  assert.equal(index.schemaVersion, 1);
  const ID = { team: { MLB: /^mlb-team-\d+$/, NFL: /^nfl-team-\d+$/, EPL: /^epl-team-\d+$/ }, player: { MLB: /^mlb-player-\d+$/, NFL: /^nfl-athlete-\d+$/, EPL: /^epl-athlete-\d+$/, UFC: /^ufc-athlete-\d+$/ } };
  const seen = new Set();
  const ids = new Set();
  for (const e of index.entries) {
    assert.match(e.id, ID[e.kind][e.sport], `${e.kind} ${e.sport} ${e.id}`);
    assert.match(e.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    const key = `${e.kind}|${e.sport}|${e.slug}`;
    assert.ok(!seen.has(key), `duplicate slug ${key}`);
    seen.add(key);
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    assert.equal(e.path, `/${e.kind === "team" ? "teams" : "players"}/${e.sport.toLowerCase()}/${e.slug}/`);
  }
  assert.ok(index.entries.length <= RESEARCH_PAGE_BUDGET);
  for (const s of RESEARCH_SPORTS) {
    for (const kind of ["teams", "players"]) {
      const rel = `${kind}/${s}.jsonl.gz`;
      if (!fs.existsSync(path.join(PROJ, rel))) { assert.ok(kind === "teams" && s === "UFC"); continue; }
      const recs = readProj(rel).split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const fromIndex = index.entries.filter((e) => e.sport === s && e.kind === kind.slice(0, -1));
      assert.deepEqual(recs.map((r) => `${r.id}|${r.slug}|${r.indexable}`).sort(), fromIndex.map((e) => `${e.id}|${e.slug}|${e.indexable}`).sort(), rel);
    }
  }
  // Indexable only where content is meaningful: never an EPL team (no results) or an MLB player (captured categories only).
  assert.ok(!index.entries.some((e) => e.indexable && ((e.kind === "team" && e.sport === "EPL") || (e.kind === "player" && e.sport === "MLB"))));
});

test("RB7 the platform reader refuses a foreign schemaVersion (manifest and record), so the builder cannot project it", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-rb7-"));
  try {
    for (const f of ["manifest.json", "sports.json", "leagues.json", "seasons.json"]) fs.copyFileSync(path.join(PLATFORM, f), path.join(tmp, f));
    fs.mkdirSync(path.join(tmp, "teams"), { recursive: true });
    const teams = readStoreText(path.join(PLATFORM, "teams/NFL.jsonl.gz")).split("\n").filter(Boolean);
    // A record from a future schema inside an otherwise current store.
    const bumped = [JSON.stringify({ ...JSON.parse(teams[0]), schemaVersion: 2 }), ...teams.slice(1)].join("\n") + "\n";
    fs.writeFileSync(path.join(tmp, "teams/NFL.jsonl.gz"), zlib.gzipSync(Buffer.from(bumped)));
    assert.throws(() => readSportFromDisk(tmp, "NFL"), /schemaVersion 2 is not readable/);
    // A manifest from a future schema.
    const m = JSON.parse(fs.readFileSync(path.join(tmp, "manifest.json"), "utf8"));
    fs.writeFileSync(path.join(tmp, "manifest.json"), JSON.stringify({ ...m, schemaVersion: 2 }));
    assert.throws(() => openPlatform(tmp), /schemaVersion 2 is not readable/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
