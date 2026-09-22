/**
 * NBA player box-score corpus builder (NBA readiness track N1) — PRIVATE RESEARCH ARTIFACT.
 *
 * For every final in data/internal/research/nba/corpus-v1.json, captures the ESPN summary box score
 * (free, keyless site.api endpoint) and stores it raw-but-normalized as ONE file per game under
 * data/internal/research/nba/boxscores/<providerEventId>.json. Parsing lives in the pure lib
 * src/lib/sports/nba/boxscore-parse.mjs (unit-tested); this script owns only fetch, pacing, retry,
 * resumability and the MANIFEST.
 *
 * Honesty rules: a missing stat is null, never 0; a DNP keeps didNotPlay:true with all-null stats;
 * ESPN's label order is asserted on every team block and the run ABORTS (exit 2) on a mismatch —
 * position-indexed stats are worthless once the columns move. A game whose summary has no player
 * block is still written (boxscoreAvailable:false, players:[]) so it is resumable and counted, not
 * re-fetched forever.
 *
 * Run (from app/):
 *   node scripts/nba/build-nba-boxscore-corpus.mjs --season 2026            # the 2025-26 season
 *   node scripts/nba/build-nba-boxscore-corpus.mjs --season 2025 --dry-run  # list only, no fetch
 *   node scripts/nba/build-nba-boxscore-corpus.mjs --limit 20 --force       # re-capture 20 games
 * Flags: --season <corpus season> · --limit N · --dry-run · --force · --now <ISO> (pins capturedAt)
 * Exit: 0 ok · 1 usage / refused · 2 aborted (25 consecutive failures or label-order mismatch)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSummary, countNullMinutes, EXPECTED_LABELS, LabelOrderError } from "../../src/lib/sports/nba/boxscore-parse.mjs";

const SCRIPT_VERSION = "nba-boxscore-corpus-1.0.0";
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "nba");
const CORPUS = path.join(ROOT, "corpus-v1.json");
const OUT = path.join(ROOT, "boxscores");
const MANIFEST = path.join(OUT, "MANIFEST.json");
const SUMMARY_URL = (id) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(id)}`;

const MIN_GAP_MS = 250;          // ≈4 req/s
const JITTER_MS = 80;
const RETRIES = 3;
const BACKOFF_MS = [1000, 2500, 6000];
const ABORT_AFTER_CONSECUTIVE = 25;
const FETCH_TIMEOUT_MS = 20000;

/* ─────────────── args ─────────────── */
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] ?? null; };
const DRY_RUN = flag("--dry-run");
const FORCE = flag("--force");
const SEASON = opt("--season") != null ? Number(opt("--season")) : null;
const LIMIT = opt("--limit") != null ? Number(opt("--limit")) : null;
const NOW_ARG = opt("--now");
if (opt("--season") != null && !Number.isInteger(SEASON)) { console.error("REFUSED: --season must be an integer corpus season (e.g. 2026)"); process.exit(1); }
if (opt("--limit") != null && (!Number.isInteger(LIMIT) || LIMIT < 1)) { console.error("REFUSED: --limit must be a positive integer"); process.exit(1); }
if (NOW_ARG != null && !Number.isFinite(Date.parse(NOW_ARG))) { console.error("REFUSED: --now must be an ISO timestamp"); process.exit(1); }
const nowIso = () => NOW_ARG ?? new Date().toISOString();

/* ─────────────── corpus ─────────────── */
if (!fs.existsSync(CORPUS)) { console.error(`REFUSED: corpus missing at ${CORPUS}`); process.exit(1); }
const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
const allRows = (corpus.rows ?? []).filter((r) => r?.providerEventId);
const rowById = new Map(allRows.map((r) => [String(r.providerEventId), r]));
const seasonsInCorpus = [...new Set(allRows.map((r) => r.season))].sort();
if (SEASON != null && !seasonsInCorpus.includes(SEASON)) { console.error(`REFUSED: season ${SEASON} not in corpus (have ${seasonsInCorpus.join(", ")})`); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
const fileFor = (id) => path.join(OUT, `${id}.json`);
const hasFile = (id) => fs.existsSync(fileFor(id));

const scoped = allRows.filter((r) => SEASON == null || r.season === SEASON);
let todo = scoped.filter((r) => FORCE || !hasFile(String(r.providerEventId)));
if (LIMIT != null) todo = todo.slice(0, LIMIT);

const prevManifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : null;

if (DRY_RUN) {
  const bySeason = {};
  for (const r of scoped) {
    const s = String(r.season);
    bySeason[s] ??= { inCorpus: 0, captured: 0, wouldFetch: 0 };
    bySeason[s].inCorpus += 1;
    if (hasFile(String(r.providerEventId))) bySeason[s].captured += 1;
  }
  for (const r of todo) bySeason[String(r.season)].wouldFetch += 1;
  console.log(`DRY RUN — season ${SEASON ?? "all"}${LIMIT != null ? ` limit ${LIMIT}` : ""}${FORCE ? " force" : ""}`);
  console.log(JSON.stringify(bySeason, null, 1));
  console.log(`would fetch ${todo.length} game(s); first 10: ${todo.slice(0, 10).map((r) => `${r.providerEventId} ${r.dateUtc.slice(0, 10)} ${r.away} @ ${r.home}`).join(" | ")}`);
  process.exit(0);
}

/* ─────────────── fetch with pacing + retry ─────────────── */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
let lastRequestAt = 0;
let requestsMade = 0;

async function paced() {
  const gap = MIN_GAP_MS + Math.floor(Math.random() * JITTER_MS);
  const wait = lastRequestAt + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

class FetchFailure extends Error {
  constructor(reason, retryable) { super(reason); this.reason = reason; this.retryable = retryable; }
}

async function fetchOnce(id) {
  await paced();
  requestsMade += 1;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(SUMMARY_URL(id), { signal: ctl.signal, headers: { accept: "application/json" } });
    if (res.status === 429 || res.status >= 500) throw new FetchFailure(`http_${res.status}`, true);
    if (!res.ok) throw new FetchFailure(`http_${res.status}`, false);
    const text = await res.text();
    try { return JSON.parse(text); } catch { throw new FetchFailure("invalid_json", true); }
  } catch (e) {
    if (e instanceof FetchFailure) throw e;
    throw new FetchFailure(e?.name === "AbortError" ? "timeout" : `network_${e?.code ?? e?.name ?? "error"}`, true);
  } finally { clearTimeout(timer); }
}

async function fetchWithRetry(id) {
  let last = null;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try { return await fetchOnce(id); } catch (e) {
      last = e;
      if (!e.retryable || attempt === RETRIES) break;
      await sleep(BACKOFF_MS[attempt] ?? BACKOFF_MS.at(-1));
    }
  }
  throw last;
}

/* ─────────────── run ─────────────── */
const run = {
  startedAt: nowIso(), season: SEASON, limit: LIMIT, force: FORCE,
  attempted: 0, written: 0, writtenNoBoxscore: 0, failed: 0, failures: {},
};
const labelSetsSeen = new Set(prevManifest?.labelSets ?? []);
let consecutive = 0;

console.log(`boxscore corpus: season ${SEASON ?? "all"} · ${scoped.length} in scope · ${todo.length} to fetch${FORCE ? " (force)" : ""}`);

for (const [i, row] of todo.entries()) {
  const id = String(row.providerEventId);
  run.attempted += 1;
  let summary;
  try { summary = await fetchWithRetry(id); } catch (e) {
    run.failed += 1; consecutive += 1;
    run.failures[id] = { season: row.season, reason: e?.reason ?? String(e), at: nowIso() };
    console.error(`  FAIL ${id} ${row.dateUtc.slice(0, 10)} ${row.away} @ ${row.home}: ${e?.reason ?? e}`);
    if (consecutive >= ABORT_AFTER_CONSECUTIVE) {
      console.error(`ABORT: ${consecutive} consecutive failures — writing manifest and exiting 2`);
      writeManifest("aborted_consecutive_failures");
      process.exit(2);
    }
    continue;
  }
  consecutive = 0;
  let parsed;
  try {
    parsed = parseSummary(summary, { providerEventId: id, season: row.season, phase: row.phase, dateUtc: row.dateUtc, capturedAt: nowIso() });
  } catch (e) {
    if (e instanceof LabelOrderError) {
      console.error(`ABORT: ${e.message} on event ${id} (expected ${JSON.stringify(EXPECTED_LABELS)})`);
      labelSetsSeen.add(JSON.stringify(e.actual));
      run.failures[id] = { season: row.season, reason: "label_order_mismatch", at: nowIso(), labels: e.actual };
      writeManifest("aborted_label_order_mismatch");
      process.exit(2);
    }
    run.failed += 1;
    run.failures[id] = { season: row.season, reason: `parse_${e?.message ?? "error"}`, at: nowIso() };
    console.error(`  FAIL ${id}: parse error ${e?.message}`);
    continue;
  }
  for (const ls of parsed.labelSets) labelSetsSeen.add(ls);
  fs.writeFileSync(fileFor(id), JSON.stringify(parsed.doc, null, 1));
  run.written += 1;
  if (!parsed.doc.boxscoreAvailable) { run.writtenNoBoxscore += 1; console.log(`  NO BOXSCORE ${id} ${row.dateUtc.slice(0, 10)} ${row.away} @ ${row.home} (status ${parsed.doc.status})`); }
  if ((i + 1) % 50 === 0 || i + 1 === todo.length) console.log(`  ${i + 1}/${todo.length} · written ${run.written} · failed ${run.failed} · requests ${requestsMade}`);
}

writeManifest("ok");
console.log(`done: attempted ${run.attempted} · written ${run.written} (no-boxscore ${run.writtenNoBoxscore}) · failed ${run.failed} · requests ${requestsMade}`);

/* ─────────────── manifest (whole-directory truth, not just this run) ─────────────── */
function writeManifest(outcome) {
  run.finishedAt = nowIso();
  run.requestsMade = requestsMade;
  run.outcome = outcome;

  const bySeason = {};
  for (const s of seasonsInCorpus) bySeason[String(s)] = { inCorpus: 0, captured: 0, capturedNoBoxscore: 0, missing: 0, failed: 0, players: 0, dnpPlayers: 0, playersNullMinutes: 0 };
  const teamMapping = {};
  const failedReasons = {};
  const unknownTeams = new Set();
  let statusCounts = {};

  // Carry forward failures from earlier runs for games still missing and NOT attempted this run.
  const carried = {};
  for (const [id, f] of Object.entries(prevManifest?.failures ?? {})) {
    if (!hasFile(id) && !(id in run.failures) && !todo.some((r) => String(r.providerEventId) === id)) carried[id] = f;
  }
  const failures = { ...carried, ...run.failures };

  for (const r of allRows) {
    const id = String(r.providerEventId);
    const b = bySeason[String(r.season)];
    b.inCorpus += 1;
    if (!hasFile(id)) {
      b.missing += 1;
      if (failures[id]) { b.failed += 1; const reason = failures[id].reason; failedReasons[reason] = (failedReasons[reason] ?? 0) + 1; }
      continue;
    }
    let doc;
    try { doc = JSON.parse(fs.readFileSync(fileFor(id), "utf8")); } catch { b.missing += 1; b.failed += 1; failedReasons.unreadable_file = (failedReasons.unreadable_file ?? 0) + 1; continue; }
    b.captured += 1;
    if (!doc.boxscoreAvailable) b.capturedNoBoxscore += 1;
    statusCounts[doc.status ?? "null"] = (statusCounts[doc.status ?? "null"] ?? 0) + 1;
    b.players += doc.players?.length ?? 0;
    b.dnpPlayers += (doc.players ?? []).filter((p) => p.didNotPlay).length;
    b.playersNullMinutes += countNullMinutes(doc);
    for (const t of doc.teams ?? []) {
      if (t.abbr == null) continue;
      teamMapping[t.abbr] ??= { providerTeamIds: [], canonicalTricode: t.canonicalTricode ?? null, name: t.name };
      if (!teamMapping[t.abbr].providerTeamIds.includes(t.providerTeamId)) teamMapping[t.abbr].providerTeamIds.push(t.providerTeamId);
      if (t.canonicalTricode == null) unknownTeams.add(`${t.abbr} · ${t.name}`);
    }
  }
  const totals = Object.values(bySeason).reduce((acc, b) => { for (const k of Object.keys(b)) acc[k] = (acc[k] ?? 0) + b[k]; return acc; }, {});

  const manifest = {
    schemaVersion: 1,
    artifact: "nba-boxscore-corpus",
    dataClass: "PRIVATE_RESEARCH",
    scriptVersion: SCRIPT_VERSION,
    generatedAt: nowIso(),
    source: "espn_summary",
    sourceCorpus: "corpus-v1.json",
    expectedLabels: EXPECTED_LABELS,
    labelSets: [...labelSetsSeen].sort(),
    labelOrderViolations: [...labelSetsSeen].filter((ls) => ls !== JSON.stringify(EXPECTED_LABELS)),
    seasons: bySeason,
    totals,
    statusCounts,
    failedReasons,
    failures,
    teamMapping: Object.fromEntries(Object.entries(teamMapping).sort(([a], [b]) => a.localeCompare(b))),
    nonNbaTeams: [...unknownTeams].sort(),
    lastRun: run,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log(`MANIFEST.json: ${JSON.stringify(totals)}; label sets ${manifest.labelSets.length}; non-NBA clubs ${manifest.nonNbaTeams.length}`);
}
