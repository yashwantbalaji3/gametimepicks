#!/usr/bin/env node
/**
 * GameTime Data Platform builder (v1.2).
 *
 *   node scripts/data-platform/build.mjs --all              rebuild every sport, write data/internal/platform/v1/
 *   node scripts/data-platform/build.mjs --sport MLB        rebuild one sport; other sports are re-read from disk
 *   node scripts/data-platform/build.mjs --all --check      rebuild in memory, write nothing, exit 1 if any
 *                                                           committed content file differs (stale or hand-edited)
 *
 * Reads committed artifacts only (no network). Refuses to write when validation fails (exit 2).
 * Wall-clock timing goes to receipts/build-latest.json (not hashed by the manifest, so content stays byte-stable).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createDiagnostics } from "../../src/lib/data-platform/diagnostics.mjs";
import { assemblePlatform, normalizeSportResult, sportFiles, PLATFORM_DIR_VERSION, BUILDER_ID } from "../../src/lib/data-platform/build-core.mjs";
import { SPORT_IDS } from "../../src/lib/data-platform/contract.mjs";
import { readSportFromDisk, readStoreText } from "../../src/lib/data-platform/readers.mjs";
import { stablePretty } from "../../src/lib/data-platform/stable-json.mjs";
import { adaptMlb } from "../../src/lib/data-platform/adapters/mlb.mjs";
import { adaptNfl } from "../../src/lib/data-platform/adapters/nfl.mjs";
import { adaptEpl } from "../../src/lib/data-platform/adapters/epl.mjs";
import { adaptUfc } from "../../src/lib/data-platform/adapters/ufc.mjs";
import { createReader, loadMlb, loadNfl, loadEpl, loadUfc, PLATFORM_DIR, SOURCE_DESCRIPTORS } from "./sources.mjs";

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const CHECK = args.includes("--check");
const ALL = args.includes("--all");
const ONE = arg("--sport");
if (!ALL && !ONE) { console.error("usage: build.mjs --all | --sport <MLB|NFL|EPL|UFC> [--check]"); process.exit(64); }
if (ONE && !SPORT_IDS.includes(ONE)) { console.error(`unknown sport ${ONE}`); process.exit(64); }
const targets = ALL ? [...SPORT_IDS] : [ONE];

const ADAPTERS = { MLB: [loadMlb, adaptMlb], NFL: [loadNfl, adaptNfl], EPL: [loadEpl, adaptEpl], UFC: [loadUfc, adaptUfc] };

const t0 = performance.now();
const timings = {};
const mem = () => Math.round(process.memoryUsage().rss / 1048576);
let peakRss = mem();

const reader = createReader();
const cutoffs = {};
const results = [];
for (const sport of SPORT_IDS) {
  if (!targets.includes(sport)) {
    const existing = readSportFromDisk(PLATFORM_DIR, sport);
    if (!existing) { console.error(`--sport ${ONE}: no committed ${sport} partition to carry forward; run --all`); process.exit(3); }
    results.push(existing);
    const prevSources = JSON.parse(fs.readFileSync(path.join(PLATFORM_DIR, "sources.json"), "utf8"));
    for (const [k, v] of Object.entries(prevSources.cutoffs?.[sport] ?? {})) (cutoffs[sport] ??= {})[k] = v;
    for (const s of prevSources.sources.filter((x) => x.key.startsWith(`${sport.toLowerCase()}.`))) reader.artifacts.set(s.key, s.artifacts);
    continue;
  }
  const [load, adapt] = ADAPTERS[sport];
  const ts = performance.now();
  const { input, cutoffs: c } = load(reader);
  const tl = performance.now();
  peakRss = Math.max(peakRss, mem());
  const diag = createDiagnostics();
  const out = adapt(input, diag);
  const ta = performance.now();
  peakRss = Math.max(peakRss, mem());
  cutoffs[sport] = c;
  results.push(normalizeSportResult({ ...out, diagnostics: diag.list() }));
  timings[sport] = { loadMs: Math.round(tl - ts), normalizeMs: Math.round(ta - tl) };
  if (diag.errors().length) { console.error(`${sport}: adapter reported contract errors`, diag.errors()); process.exit(2); }
}

const sources = {
  schemaVersion: 1,
  note: "Every committed artifact the builder read, fingerprinted. Internal only — repository-relative paths never reach a public projection.",
  cutoffs,
  sources: [...reader.artifacts.keys()].sort().map((key) => ({ key, ...(SOURCE_DESCRIPTORS[key] ?? {}), artifactCount: reader.artifacts.get(key).length, artifacts: reader.artifacts.get(key) })),
};

const tv = performance.now();
const { files, validation, manifest } = assemblePlatform(results, { sources });
timings.assembleAndValidateMs = Math.round(performance.now() - tv);
peakRss = Math.max(peakRss, mem());

if (!validation.ok) {
  console.error("VALIDATION FAILED — nothing written.");
  for (const e of validation.errors) console.error(`  ${e.code} ×${e.count}  ${JSON.stringify(e.samples.slice(0, 3))}`);
  process.exit(2);
}

if (CHECK) {
  const stale = [];
  const expected = new Set(files.keys());
  for (const [p, content] of files) {
    const abs = path.join(PLATFORM_DIR, p);
    if (!fs.existsSync(abs) || readStoreText(abs) !== content) stale.push(p);
  }
  for (const sport of targets) {
    const f = sportFiles(sport);
    for (const dir of [f.gamesDir, f.teamStatsDir, f.playerStatsDir]) {
      const abs = path.join(PLATFORM_DIR, dir);
      if (fs.existsSync(abs)) for (const x of fs.readdirSync(abs)) if (!expected.has(dir + x)) stale.push(`${dir + x} (not produced any more)`);
    }
  }
  console.log(stale.length ? `STALE: ${stale.length} file(s) differ from a rebuild of the committed sources:\n  ${stale.slice(0, 40).join("\n  ")}` : `CHECK OK: ${files.size} files byte-identical to a rebuild`);
  process.exit(stale.length ? 1 : 0);
}

const tw = performance.now();
for (const sport of targets) {
  const f = sportFiles(sport);
  for (const dir of [f.gamesDir, f.teamStatsDir, f.playerStatsDir]) fs.rmSync(path.join(PLATFORM_DIR, dir), { recursive: true, force: true });
}
for (const [p, content] of files) {
  const abs = path.join(PLATFORM_DIR, p);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  // Write only when CONTENT changed, so an identical rebuild leaves git clean even if zlib output would differ.
  if (!fs.existsSync(abs) || readStoreText(abs) !== content) fs.writeFileSync(abs, p.endsWith(".gz") ? zlib.gzipSync(Buffer.from(content), { level: 9 }) : content);
}
timings.writeMs = Math.round(performance.now() - tw);
timings.totalMs = Math.round(performance.now() - t0);

const bytes = manifest.files.reduce((n, f) => n + f.contentBytes, 0);
const storedBytes = manifest.files.reduce((n, f) => n + fs.statSync(path.join(PLATFORM_DIR, f.path)).size, 0);
fs.writeFileSync(path.join(PLATFORM_DIR, "receipts", "build-latest.json"), stablePretty({
  schemaVersion: 1,
  note: "Wall-clock build receipt. NOT content: excluded from manifest hashing; churns on every build.",
  builder: BUILDER_ID,
  storeVersion: PLATFORM_DIR_VERSION,
  builtAt: new Date().toISOString(),
  node: process.version,
  mode: ALL ? "all" : `sport:${ONE}`,
  timings,
  peakRssMb: peakRss,
  contentFiles: manifest.files.length,
  contentBytes: bytes,
  storedBytes,
}));

console.log(`platform ${PLATFORM_DIR_VERSION} built (${ALL ? "all sports" : ONE}) in ${timings.totalMs} ms · peak RSS ${peakRss} MB · ${manifest.files.length} files · content ${(bytes / 1048576).toFixed(1)} MB · stored ${(storedBytes / 1048576).toFixed(1)} MB`);
for (const [s, m] of Object.entries(manifest.sports)) {
  console.log(`  ${s}: teams ${m.teams} · players ${m.players} · games ${m.games} · team-game ${m.teamGameRows} · player-game ${m.playerGameRows} · aliases ${m.aliases} · unresolved ${m.unresolvedIdentityRows} · dropped ${m.droppedRows} · conflicts ${m.sourceConflicts}`);
}
