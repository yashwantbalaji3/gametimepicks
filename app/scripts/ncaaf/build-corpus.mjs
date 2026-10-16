/**
 * NCAAF · build the scores-only historical corpus (NCAAF-001.7). PRIVATE_RESEARCH.
 *
 * Reads ONLY the cached ESPN responses written by probe-espn-coverage.mjs (no network: a season whose cache is
 * incomplete is REFUSED, not fetched), re-normalises them with espn-events.mjs, and writes:
 *
 *   data/internal/research/ncaaf/corpus/v1/games-<season>.jsonl   one row per played final (corpus.mjs schema)
 *   data/internal/research/ncaaf/corpus/v1/manifest.json          counts, exclusions by id + reason, sha256 of
 *                                                                 every output file and of the input snapshot
 *
 * Re-running on the same cache is byte-identical (the manifest's generatedAt is the pinned --now).
 *
 * Run: node scripts/ncaaf/build-corpus.mjs --now 2026-10-09T18:00:00Z --seasons 2016-2025 [--check]
 *   --check: build in memory and exit 1 if any committed file differs (reproducibility gate).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESPN_CFB_GROUPS, mergeEventRows, normalizeScoreboardEvent } from "../../src/lib/sports/ncaaf/espn-events.mjs";
import { CORPUS_SCHEMA_VERSION, buildSeasonCorpus, serializeRows, summarizeCorpus } from "../../src/lib/sports/ncaaf/corpus.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const CACHE = path.join(ROOT, "data", "internal", "research", "ncaaf", ".cache", "raw", "espn", "coverage");
const OUT = path.join(ROOT, "data", "internal", "research", "ncaaf", "corpus", "v1");

const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const CHECK = process.argv.includes("--check");
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const m = /^(\d{4})-(\d{4})$/.exec(arg("--seasons", ""));
if (!m || Number(m[1]) > Number(m[2])) { console.error("REFUSED: --seasons YYYY-YYYY required"); process.exit(1); }
const SEASONS = Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i);

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const readCache = (rel) => {
  const f = path.join(CACHE, rel);
  if (!fs.existsSync(f)) return null;
  return { text: fs.readFileSync(f, "utf8"), json: JSON.parse(fs.readFileSync(f, "utf8")) };
};
const idsFromRefs = (body) => (body?.items ?? []).map((it) => /\/teams\/(\d+)/.exec(it?.$ref ?? "")?.[1]).filter(Boolean);

const files = new Map(); // relative output path → content
const seasons = {};
for (const season of SEASONS) {
  const first = readCache(`${season}/2-1-80.json`);
  if (!first?.json?.body) { console.error(`REFUSED: ${season} has no cached week-1 response — run probe-espn-coverage.mjs first`); process.exit(1); }
  const cal = first.json.body.leagues?.[0]?.calendar ?? [];
  const weeks = [[2, cal.find((c) => String(c.value) === "2")?.entries ?? []], [3, cal.find((c) => String(c.value) === "3")?.entries ?? []]]
    .flatMap(([st, entries]) => entries.map((e) => [st, Number(e.value)]));

  const rows = [];
  const inputHashes = [];
  let refused = 0;
  for (const [st, wk] of weeks) {
    for (const grp of [ESPN_CFB_GROUPS.FBS, ESPN_CFB_GROUPS.FCS]) {
      const rel = `${season}/${st}-${wk}-${grp}.json`;
      const c = readCache(rel);
      if (!c?.json?.body) { console.error(`REFUSED: ${season} cache incomplete (${rel}) — a partial season would read as a complete one`); process.exit(1); }
      inputHashes.push(`${rel}:${sha256(c.text)}`);
      for (const e of c.json.body.events ?? []) {
        const n = normalizeScoreboardEvent(e, { capturedAt: c.json.capturedAt, sourceGroup: grp });
        if (n.row) rows.push(n.row); else refused++;
      }
    }
  }
  const fbs = readCache(`${season}/membership-80.json`), fcs = readCache(`${season}/membership-81.json`);
  if (!fbs?.json?.body || !fcs?.json?.body) { console.error(`REFUSED: ${season} membership not cached`); process.exit(1); }
  inputHashes.push(`${season}/membership-80.json:${sha256(fbs.text)}`, `${season}/membership-81.json:${sha256(fcs.text)}`);

  const { events, conflicts } = mergeEventRows(rows);
  if (conflicts.length) { console.error(`REFUSED: ${season} has ${conflicts.length} provider conflicts (${conflicts.slice(0, 5).join(",")})`); process.exit(1); }
  const built = buildSeasonCorpus(season, events, { fbs: idsFromRefs(fbs.json.body), fcs: idsFromRefs(fcs.json.body) });

  const body = serializeRows(built.rows);
  const name = `games-${season}.jsonl`;
  files.set(name, body);
  seasons[season] = {
    file: name,
    sha256: sha256(body),
    inputSnapshotSha256: sha256(inputHashes.sort().join("\n")),
    inputFiles: inputHashes.length,
    providerEventsMerged: events.length,
    providerEventsRefusedByNormaliser: refused,
    membershipReconciled: { fbs: built.membership.fbs.size, fcs: built.membership.fcs.size },
    ...summarizeCorpus(built.rows, built.excluded),
    excludedEvents: built.excluded.map((x) => `${x.eventId}:${x.reason}`),
  };
  console.log(`${season}: ${built.rows.length} games (${JSON.stringify(seasons[season].byPairing)}) · excluded ${built.excluded.length}`);
}

const manifest = {
  schemaVersion: CORPUS_SCHEMA_VERSION,
  sport: "ncaaf",
  dataClass: "HISTORICAL_RESULTS_CORPUS",
  authorization: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  source: "ESPN public scoreboard (cached responses from probe-espn-coverage.mjs; raw bodies never committed)",
  asOfRule: "A row is a fact only after its game ends. A forecast for slate day D (America/New_York date) may read only rows with slateDate < D (corpus.mjs rowsKnownBefore).",
  scopeNotes: [
    "Played finals only; forfeits, cancellations, postponements and anything unfinished are excluded and listed by id.",
    "Division per season = provider group membership reconciled to teams that played; NON_D1 opponents appear only in games with a Division I team.",
    "No rosters, injuries, odds, weather or ratings: this corpus cannot support those features.",
  ],
  seasons,
};
files.set("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

if (CHECK) {
  const diffs = [...files].filter(([name, content]) => !fs.existsSync(path.join(OUT, name)) || fs.readFileSync(path.join(OUT, name), "utf8") !== content).map(([n]) => n);
  if (diffs.length) { console.error(`CHECK FAILED: ${diffs.join(", ")} differ from a fresh build`); process.exit(1); }
  console.log(`CHECK OK: ${files.size} files reproduce byte-for-byte`);
  process.exit(0);
}
fs.mkdirSync(OUT, { recursive: true });
for (const [name, content] of files) fs.writeFileSync(path.join(OUT, name), content);
const total = Object.values(seasons).reduce((s, x) => s + x.games, 0);
console.log(`wrote ${files.size} files to ${path.relative(ROOT, OUT)} · ${total} games`);
