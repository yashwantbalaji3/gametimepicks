/**
 * NBA roster capture (NBA readiness track N-4, free roster owner) — PRIVATE RESEARCH ARTIFACT.
 * NBA PRESEASON — EXPERIMENTAL · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * Fetches all 30 team rosters from ESPN's keyless site endpoint, SEQUENTIALLY with a polite gap,
 * preserves every raw payload verbatim, and writes the normalised artifact of roster-parse.mjs:
 *
 *   data/internal/research/nba/rosters/raw/<YYYY-MM-DD>/<providerTeamId>.json   raw, untouched
 *   data/internal/research/nba/rosters/<YYYY-MM-DD>.json                          normalised (dated)
 *   data/internal/research/nba/rosters/latest.json                                normalised (pointer copy)
 *
 * A failed team is recorded MISSING in the artifact (never an empty roster); the run still writes
 * the artifact so the gap is visible. Exit 2 when ZERO teams were captured (latest.json is then
 * left untouched — a total outage must not overwrite a good capture). Nothing here is public or
 * product-eligible; no page reads data/internal/**.
 *
 * Run (from app/):
 *   node scripts/nba/capture-nba-rosters.mjs --now 2026-09-22T06:00:00Z            # capture all 30
 *   node scripts/nba/capture-nba-rosters.mjs --now <ISO> --only 14,15 --dry-run    # list only
 *   node scripts/nba/capture-nba-rosters.mjs --from-raw 2026-09-22 --now <ISO>      # rebuild from raw, no network
 * Flags: --now <ISO> (required; pins capturedAt) · --only <id,id> · --dry-run · --from-raw <date>
 * Exit: 0 ok (missing teams recorded) · 1 usage / refused · 2 zero teams captured
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESPN_NBA_TEAMS } from "../../src/lib/sports/nba/roster-contract.mjs";
import { buildRosterArtifact, serializeRosterArtifact, rosterContentKey } from "../../src/lib/sports/nba/roster-parse.mjs";

const SCRIPT_VERSION = "nba-roster-capture-1.0.0";
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "nba", "rosters");
const RAW = path.join(ROOT, "raw");
const URL_FOR = (id) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${encodeURIComponent(id)}/roster`;

const MIN_GAP_MS = 400;
const JITTER_MS = 150;
const RETRIES = 3;
const BACKOFF_MS = [1000, 2500, 6000];
const FETCH_TIMEOUT_MS = 20000;

/* ─────────────── args ─────────────── */
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
const NOW = opt("--now");
const DRY_RUN = flag("--dry-run");
const FROM_RAW = opt("--from-raw");
const ONLY = opt("--only") != null ? new Set(opt("--only").split(",").map((x) => x.trim()).filter(Boolean)) : null;
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required (pins capturedAt)"); process.exit(1); }
if (opt("--only") != null && (!ONLY || ONLY.size === 0)) { console.error("REFUSED: --only needs a comma-separated list of ESPN team ids"); process.exit(1); }
if (FROM_RAW != null && !/^\d{4}-\d{2}-\d{2}$/.test(FROM_RAW)) { console.error("REFUSED: --from-raw YYYY-MM-DD"); process.exit(1); }
const known = new Set(ESPN_NBA_TEAMS.map((t) => t.providerTeamId));
if (ONLY) { const bad = [...ONLY].filter((id) => !known.has(id)); if (bad.length) { console.error(`REFUSED: --only ids not in the 30-team registry: ${bad.join(", ")}`); process.exit(1); } }

const DATE = NOW.slice(0, 10);
const teams = ESPN_NBA_TEAMS.filter((t) => ONLY == null || ONLY.has(t.providerTeamId));

if (DRY_RUN) {
  console.log(`DRY RUN — would fetch ${teams.length} team roster(s) at ≈${(1000 / MIN_GAP_MS).toFixed(1)} req/s: ${teams.map((t) => `${t.providerTeamId}/${t.canonicalTricode}`).join(" ")}`);
  console.log(`raw → ${path.relative(path.resolve(APP, ".."), path.join(RAW, DATE))}/<teamId>.json · normalised → rosters/${DATE}.json + latest.json`);
  process.exit(0);
}

/* ─────────────── fetch with pacing + retry ─────────────── */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
let lastRequestAt = 0;
let requestsMade = 0;

async function fetchOnce(id) {
  const gap = MIN_GAP_MS + Math.floor(Math.random() * JITTER_MS);
  const wait = lastRequestAt + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  requestsMade += 1;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(URL_FOR(id), { signal: ctl.signal, headers: { accept: "application/json" } });
    if (res.status === 429 || res.status >= 500) return { retryable: true, error: `http_${res.status}` };
    if (!res.ok) return { retryable: false, error: `http_${res.status}` };
    const text = await res.text();
    try { return { text, payload: JSON.parse(text) }; } catch { return { retryable: true, error: "invalid_json" }; }
  } catch (e) {
    return { retryable: true, error: e?.name === "AbortError" ? "timeout" : `network_${e?.code ?? e?.name ?? "error"}` };
  } finally { clearTimeout(timer); }
}

async function fetchWithRetry(id) {
  let last = null;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    const r = await fetchOnce(id);
    if (r.payload) return r;
    last = r;
    if (!r.retryable || attempt === RETRIES) break;
    await sleep(BACKOFF_MS[attempt] ?? BACKOFF_MS.at(-1));
  }
  return last;
}

/* ─────────────── run ─────────────── */
const results = [];
if (FROM_RAW) {
  const dir = path.join(RAW, FROM_RAW);
  if (!fs.existsSync(dir)) { console.error(`REFUSED: raw dir missing ${dir}`); process.exit(1); }
  for (const t of teams) {
    const f = path.join(dir, `${t.providerTeamId}.json`);
    if (!fs.existsSync(f)) { results.push({ providerTeamId: t.providerTeamId, payload: null, fetchError: `raw file missing ${path.basename(f)}` }); continue; }
    try { results.push({ providerTeamId: t.providerTeamId, payload: JSON.parse(fs.readFileSync(f, "utf8")) }); }
    catch (e) { results.push({ providerTeamId: t.providerTeamId, payload: null, fetchError: `raw unreadable: ${e?.message ?? e}` }); }
  }
  console.log(`rebuild from raw ${FROM_RAW}: ${results.length} team file(s) read, no network`);
} else {
  const rawDir = path.join(RAW, DATE);
  fs.mkdirSync(rawDir, { recursive: true });
  console.log(`roster capture · ${teams.length} team(s) · now ${NOW} · raw → ${path.relative(path.resolve(APP, ".."), rawDir)}`);
  for (const t of teams) {
    const r = await fetchWithRetry(t.providerTeamId);
    if (r.payload) {
      fs.writeFileSync(path.join(rawDir, `${t.providerTeamId}.json`), r.text);
      results.push({ providerTeamId: t.providerTeamId, payload: r.payload });
      console.log(`  ${t.providerTeamId.padStart(2)} ${t.canonicalTricode} · ${Array.isArray(r.payload?.athletes) ? r.payload.athletes.length : "?"} athlete(s) · provider ts ${r.payload?.timestamp ?? "null"}`);
    } else {
      results.push({ providerTeamId: t.providerTeamId, payload: null, fetchError: r.error });
      console.error(`  ${t.providerTeamId.padStart(2)} ${t.canonicalTricode} · FAILED ${r.error}`);
    }
  }
}

const artifact = buildRosterArtifact({ teamResults: results, capturedAt: NOW });
artifact.scriptVersion = SCRIPT_VERSION;
artifact.requestsMade = requestsMade;
artifact.rawDir = FROM_RAW ? `rosters/raw/${FROM_RAW}/` : `rosters/raw/${DATE}/`;
if (ONLY) artifact.partialCapture = { only: [...ONLY].sort() };
const m = artifact.manifest;
console.log(`captured ${m.teamsCaptured}/${m.teamsInRegistry} team(s) · ${m.players} player(s) · missing ${m.teamsMissing} · refused rows ${m.rowsRefused.length} · on >1 team ${m.athletesOnMultipleTeams.length} · duplicate names ${m.duplicateDisplayNames.length} · out of bounds ${m.teamsOutOfBounds.length}`);
for (const x of m.missingTeams) console.error(`  MISSING ${x.providerTeamId} ${x.canonicalTricode}: ${x.reason}`);
for (const x of m.teamsOutOfBounds) console.log(`  FLAG ${x.canonicalTricode}: ${x.playerCount} players (bounds ${x.bounds.min}–${x.bounds.max})`);

if (m.teamsCaptured === 0) {
  console.error("ABORT: zero teams captured — latest.json left untouched (exit 2)");
  process.exit(2);
}
if (ONLY) {
  console.log("partial capture (--only): dated artifact written, latest.json NOT updated");
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(path.join(ROOT, `${DATE}.partial.json`), serializeRosterArtifact(artifact));
  process.exit(0);
}

fs.mkdirSync(ROOT, { recursive: true });
const latestPath = path.join(ROOT, "latest.json");
let previousKey = null;
if (fs.existsSync(latestPath)) { try { previousKey = rosterContentKey(JSON.parse(fs.readFileSync(latestPath, "utf8"))); } catch { previousKey = null; } }
const changed = previousKey == null || previousKey !== rosterContentKey(artifact);
artifact.changedSinceLatest = changed;
const bytes = serializeRosterArtifact(artifact);
fs.writeFileSync(path.join(ROOT, `${DATE}.json`), bytes);
fs.writeFileSync(latestPath, bytes);
console.log(`wrote rosters/${DATE}.json + rosters/latest.json (${(bytes.length / 1024).toFixed(0)} KB) · content ${changed ? "CHANGED" : "unchanged"} vs previous latest · requests ${requestsMade}`);
