/**
 * NBA experimental forecast grader (NBA readiness tracks N2/N3) — PRIVATE RESEARCH ARTIFACT.
 * NBA PRESEASON — EXPERIMENTAL · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * For every forecast date under data/internal/research/nba/experimental/forecasts/, finds finals
 * by providerEventId in (a) app/public/data/nba/results/latest.json (STATUS_FINAL rows with both
 * scores) or (b) corpus-v1.json, and the box score in (c) boxscores/<id>.json (canonical corpus)
 * or (d) experimental/boxscores/<id>.json (fetched here). With --fetch, a graded game whose box
 * score is in neither place is fetched from the ESPN summary endpoint (the same free endpoint the
 * corpus builder uses; ≈4 req/s pacing, 3 retries) and stored under (d) — never into the
 * canonical corpus directory, whose MANIFEST is owned by build-nba-boxscore-corpus.mjs.
 *
 * Grades per game: winner (Brier + log loss, Elo AND sim, separately), score MAE, total MAE, and
 * PER PLAYER the minutes error and the production error CONDITIONAL on actual minutes — reported
 * separately, in separate preseason / regular-season buckets. Appends one entry per forecast date
 * to experimental/ledger.json (re-grading a date replaces its entry; the ledger never double-counts).
 *
 * Run (from app/):
 *   npx tsx scripts/nba/grade-nba-experimental-forecasts.mjs [--write] [--fetch] [--now ISO] [--date YYYY-MM-DD] [--family v0|v0.1]
 *
 * FAMILIES (v1.8 A1): each family grades its own forecasts into its own ledger (experimental/ vs
 * experimental-v0.1/). Fetched box scores are looked up across both families' caches and written only to
 * the grading family's own cache, so a game is fetched once even when two families forecast it.
 * Exit: 0 ok · 1 usage / refused
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gradeForecastGame, summariseGrades, LABELS, familySpec, familyGuard, FAMILIES } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { parseSummary, LabelOrderError } from "../../src/lib/sports/nba/boxscore-parse.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const CORPUS = path.join(NBA, "corpus-v1.json");
const BOXSCORES = path.join(NBA, "boxscores");
const argvEarly = process.argv.slice(2);
const familyArg = (() => { const i = argvEarly.indexOf("--family"); return i === -1 ? "v0" : argvEarly[i + 1] ?? null; })();
let FAMILY;
try { FAMILY = familySpec(familyArg); } catch (e) { console.error(e.message); process.exit(1); }
const EXP = path.join(NBA, FAMILY.dir);
const FORECASTS = path.join(EXP, "forecasts");
const EXP_BOX = path.join(EXP, "boxscores");
const ALL_EXP_BOX = Object.values(FAMILIES).map((f) => path.join(NBA, f.dir, "boxscores"));
const LEDGER = path.join(EXP, "ledger.json");
const RESULTS = path.join(APP, "public", "data", "nba", "results", "latest.json");
const SUMMARY_URL = (id) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(id)}`;
const MIN_GAP_MS = 250, RETRIES = 3, BACKOFF_MS = [1000, 2500, 6000], FETCH_TIMEOUT_MS = 20000;

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
const WRITE = flag("--write");
const FETCH = flag("--fetch");
const ONLY_DATE = opt("--date");
const NOW = opt("--now") ?? new Date().toISOString();
if (!Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now must be ISO"); process.exit(1); }
if (ONLY_DATE && !/^\d{4}-\d{2}-\d{2}$/.test(ONLY_DATE)) { console.error("REFUSED: --date YYYY-MM-DD"); process.exit(1); }
if (!fs.existsSync(FORECASTS)) { console.log(`no forecasts directory for family ${FAMILY.family} — nothing to grade`); process.exit(0); }

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const corpus = readJson(CORPUS);
const corpusById = new Map((corpus.rows ?? []).map((r) => [String(r.providerEventId), r]));
const results = fs.existsSync(RESULTS) ? readJson(RESULTS) : null;
const resultsById = new Map((results?.rows ?? []).filter((r) => /^STATUS_FINAL/.test(r?.statusRaw ?? "")).map((r) => [String(r.providerEventId), r]));

function findFinal(id) {
  const r = resultsById.get(id);
  if (r && Number.isInteger(r.ftHome) && Number.isInteger(r.ftAway)) return { ftHome: r.ftHome, ftAway: r.ftAway, source: "results-capture" };
  const c = corpusById.get(id);
  if (c && Number.isInteger(c.ftHome) && Number.isInteger(c.ftAway)) return { ftHome: c.ftHome, ftAway: c.ftAway, source: "corpus-v1" };
  return null;
}
function findBoxscore(id) {
  for (const [dir, source] of [[BOXSCORES, "corpus"], ...ALL_EXP_BOX.map((d) => [d, "experimental-fetch"])]) {
    const f = path.join(dir, `${id}.json`);
    if (fs.existsSync(f)) { try { return { doc: readJson(f), source }; } catch { /* unreadable → treat as absent */ } }
  }
  return null;
}

/* ─────────────── guarded fetch (only with --fetch, only for a game that already has a final) ─────────────── */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
let lastRequestAt = 0, requestsMade = 0;
async function fetchSummary(id) {
  let last = null;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now(); requestsMade += 1;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(SUMMARY_URL(id), { signal: ctl.signal, headers: { accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) throw new Error(`http_${res.status}`);
      if (!res.ok) return { error: `http_${res.status}` };
      return { summary: JSON.parse(await res.text()) };
    } catch (e) { last = e; await sleep(BACKOFF_MS[attempt] ?? BACKOFF_MS.at(-1)); }
    finally { clearTimeout(timer); }
  }
  return { error: String(last?.message ?? last) };
}

/* ─────────────── grade ─────────────── */
const files = fs.readdirSync(FORECASTS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().filter((f) => !ONLY_DATE || f === `${ONLY_DATE}.json`);
const ledger = fs.existsSync(LEDGER) ? readJson(LEDGER) : { schemaVersion: 1, artifact: "nba-experimental-ledger", family: FAMILY.family, modelVersion: FAMILY.modelVersion, poolRule: FAMILY.poolRule, dataClass: "PRIVATE_RESEARCH", productEligible: false, labels: Object.values(LABELS), entries: [] };
// A LEDGER NEVER MIXES FAMILIES. The sibling directories normally keep them apart, but a path is not a
// proof — so the check reads the document. An unstamped ledger is legacy v0 and is adopted by v0 only.
const ledgerGate = familyGuard({ family: FAMILY.family, doc: ledger, what: "ledger" });
if (!ledgerGate.ok) { console.error(`REFUSED: ${path.relative(path.resolve(APP, ".."), LEDGER)} — ${ledgerGate.detail}`); process.exit(1); }
if (ledgerGate.adopt) { ledger.family = FAMILY.family; ledger.modelVersion = FAMILY.modelVersion; ledger.poolRule = FAMILY.poolRule; }
const entries = [];
for (const file of files) {
  const artifact = readJson(path.join(FORECASTS, file));
  // ...and neither does a GRADING RUN. A forecast that declares another family is refused rather than
  // averaged in: the ledger's summary would otherwise blend two pool rules into one record.
  const artGate = familyGuard({ family: FAMILY.family, doc: artifact, what: "forecast artifact" });
  if (!artGate.ok) { console.error(`REFUSED: ${FAMILY.dir}/forecasts/${file} — ${artGate.detail}`); process.exit(1); }
  const date = artifact.date ?? file.slice(0, 10);
  const graded = [];
  const pending = [];
  const fetched = [];
  for (const game of artifact.games ?? []) {
    const id = String(game.providerEventId);
    const final = findFinal(id);
    if (!final) { pending.push({ providerEventId: id, reason: "no final in results capture or corpus" }); continue; }
    let box = findBoxscore(id);
    if (!box && FETCH) {
      const r = await fetchSummary(id);
      if (r.summary) {
        try {
          const parsed = parseSummary(r.summary, { providerEventId: id, season: null, phase: game.seasonType, dateUtc: game.dateUtc, capturedAt: NOW });
          if (parsed.doc.status && !/FINAL/.test(parsed.doc.status)) { pending.push({ providerEventId: id, reason: `summary status ${parsed.doc.status} not final` }); continue; }
          if (WRITE) { fs.mkdirSync(EXP_BOX, { recursive: true }); fs.writeFileSync(path.join(EXP_BOX, `${id}.json`), JSON.stringify(parsed.doc, null, 1)); }
          box = { doc: parsed.doc, source: "experimental-fetch" };
          fetched.push(id);
        } catch (e) {
          if (e instanceof LabelOrderError) { console.error(`ABORT: ${e.message} on ${id}`); process.exit(2); }
          pending.push({ providerEventId: id, reason: `parse ${e?.message ?? e}` });
        }
      } else pending.push({ providerEventId: id, reason: `fetch ${r.error}` });
    }
    graded.push(gradeForecastGame(game, final, box?.doc ?? null));
  }
  const summary = summariseGrades(graded);
  const entry = { date, gradedAt: NOW, modelVersion: artifact.modelVersion ?? null, inputAsOf: artifact.inputAsOf ?? null, forecastGames: (artifact.games ?? []).length, graded: graded.filter((g) => g.graded).length, pending, fetched, summary, games: graded };
  entries.push(entry);
  console.log(`[${FAMILY.family}] ${date}: forecast ${entry.forecastGames} · graded ${entry.graded} · pending ${pending.length}${FETCH ? ` · fetched ${fetched.length}` : ""}`);
  for (const [label, b] of Object.entries(summary)) if (b.games) console.log(`  ${label}: games ${b.games} · elo brier ${b.winner.elo.brier} ll ${b.winner.elo.logLoss} · sim brier ${b.winner.sim.brier} ll ${b.winner.sim.logLoss} · margin MAE ${b.score.marginMAE} · total MAE ${b.score.totalMAE} · minutes MAE ${b.players.minutesMAE} (rows ${b.players.matchedRows}) · cond pts MAE ${b.players.conditionalMAE.pts}`);
}

if (WRITE) {
  const byDate = new Map(ledger.entries.map((e) => [e.date, e]));
  for (const e of entries) if (e.graded > 0 || !byDate.has(e.date)) byDate.set(e.date, e);
  ledger.entries = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  ledger.updatedAt = NOW;
  ledger.requestsMade = requestsMade;
  fs.mkdirSync(EXP, { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), LEDGER)} (${ledger.entries.length} date entries)`);
} else console.log("dry run — pass --write to append to the ledger");
