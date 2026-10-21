/**
 * NBA experimental forecast grader (NBA readiness tracks N2/N3) — PRIVATE RESEARCH ARTIFACT. GRADER v2.
 * dataClass PRIVATE_RESEARCH · productEligible: false. Every rule lives in experimental-grading-ledger.mjs (tested).
 *
 * FINALS (v2 — the rolling-window defect): the write-once season record app/public/data/nba/results/finals-<season>.json
 * FIRST, then the rolling results/latest.json (same-night fallback, before the record takes the final), then corpus-v1.
 * A game is pending only while no source holds its final — it no longer expires after the 9-day window.
 *
 * BOX SCORES: canonical corpus boxscores/<id>.json, then any family's fetch cache <family dir>/boxscores/<id>.json.
 * With --fetch: a final with no box score is fetched from the free ESPN summary endpoint (≈4 req/s, 3 retries) into
 * THIS family's cache (never the canonical corpus directory, whose MANIFEST build-nba-boxscore-corpus.mjs owns), with the
 * summary's period count recorded beside it. STAT CORRECTIONS (v2): a fetched (non-corpus) box score inside the bounded
 * re-check window (RECHECK: 72 h after tip, at most every 6 h) is fetched again; a changed payload is written to
 * <family dir>/boxscores/corrections/<id>.<hash12>.json (the original file is never rewritten) and logged as a
 * BOXSCORE_CORRECTION with old/new content hashes; the game's re-grade appends a CORRECTION entry that supersedes.
 *
 * OVERTIME (v2): summary period count → box-score team minutes → corpus flag → null (NOT_MEASURED).
 *
 * LEDGER (v2 — append-only): <family dir>/ledger.json schema 2. The schema-1 `entries` (date-level, v1) are frozen
 * content-identical (canonical JSON); per-game grades are APPENDED to `gradeEntries` (INITIAL | PENDING_RESOLVED | CORRECTION + supersedes).
 * The `validation` block (grader-metrics.mjs) is derived from the current view each run. The append-only guard runs
 * before every write and refuses the write on any violation.
 *
 * Run (from app/):
 *   npx tsx scripts/nba/grade-nba-experimental-forecasts.mjs [--write] [--fetch] [--no-recheck] [--now ISO]
 *        [--date YYYY-MM-DD] [--family v0|v0.1|v0.2|v1] [--out-dir DIR]
 *   --out-dir DIR  read-only integration mode: the ledger and every cache write go under DIR/<family dir>/ (the repo's
 *                  ledger is read as the starting point and never written).
 *   --summary-dir DIR  offline replay (needs --out-dir): "fetch" reads DIR/<id>.json instead of the network.
 *   --results-dir DIR  (needs --out-dir) read the finals record / rolling window from DIR instead of app/public/….
 * Exit: 0 ok · 1 usage / refused · 2 provider label order changed (PAUSE, prereg §10)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gradeForecastGame, summariseGrades, LABELS, familySpec, familyGuard, FAMILIES } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { parseSummary, LabelOrderError } from "../../src/lib/sports/nba/boxscore-parse.mjs";
import { validationFromGrades } from "../../src/lib/sports/nba/grader-metrics.mjs";
import {
  GRADER_VERSION, RECHECK, finalLookup, resolveOvertime, periodsFromSummary, boxscoreContentHash, diffBoxscores, recheckDue,
  emptyExperimentalLedger, upgradeLedger, appendGameResults, appendBoxscoreCheck, latestCorrectionAcross, lastCheckAtAcross, currentGrades,
  experimentalLedgerAppendOnlyViolations, restDaysFor, boxscorePointsCheck, ledgerText, finalTeamsMatch, underReviewIds,
} from "../../src/lib/sports/nba/experimental-grading-ledger.mjs";
import { receiptIntegrity } from "../../src/lib/sports/nba/forecast-receipt.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const NBA = path.join(REPO, "data", "internal", "research", "nba");
const CORPUS = path.join(NBA, "corpus-v1.json");
const BOXSCORES = path.join(NBA, "boxscores");
const RESULTS_ARG = (() => { const a = process.argv.slice(2); const i = a.indexOf("--results-dir"); return i === -1 ? null : a[i + 1] ?? null; })();
// --results-dir DIR (needs --out-dir): read finals-<season>.json / latest.json from DIR (e.g. a newer main's copies).
const RESULTS_DIR = RESULTS_ARG ? path.resolve(RESULTS_ARG) : path.join(APP, "public", "data", "nba", "results");
const SUMMARY_URL = (id) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(id)}`;
const MIN_GAP_MS = 250, RETRIES = 3, BACKOFF_MS = [1000, 2500, 6000], FETCH_TIMEOUT_MS = 20000;

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
let FAMILY;
try { FAMILY = familySpec(opt("--family") ?? "v0"); } catch (e) { console.error(e.message); process.exit(1); }
const WRITE = flag("--write");
const FETCH = flag("--fetch");
const RECHECK_ON = FETCH && !flag("--no-recheck");
const ONLY_DATE = opt("--date");
const NOW = opt("--now") ?? new Date().toISOString();
const OUT_DIR = opt("--out-dir") ? path.resolve(opt("--out-dir")) : null;
const SUMMARY_DIR = opt("--summary-dir") ? path.resolve(opt("--summary-dir")) : null;
if (RESULTS_ARG && !OUT_DIR) { console.error("REFUSED: --results-dir only with --out-dir — an alternate finals source never writes the repo's ledgers"); process.exit(1); }
if (SUMMARY_DIR && !OUT_DIR) { console.error("REFUSED: --summary-dir (offline replay) only with --out-dir — a replay never writes the repo's ledgers"); process.exit(1); }
if (!Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now must be ISO"); process.exit(1); }
if (ONLY_DATE && !/^\d{4}-\d{2}-\d{2}$/.test(ONLY_DATE)) { console.error("REFUSED: --date YYYY-MM-DD"); process.exit(1); }

const EXP = path.join(NBA, FAMILY.dir);
const FORECASTS = path.join(EXP, "forecasts");
const WRITE_ROOT = OUT_DIR ? path.join(OUT_DIR, FAMILY.dir) : EXP;
const EXP_BOX = path.join(WRITE_ROOT, "boxscores");
const CORRECTIONS_DIR = path.join(EXP_BOX, "corrections");
const LEDGER_IN = OUT_DIR && fs.existsSync(path.join(WRITE_ROOT, "ledger.json")) ? path.join(WRITE_ROOT, "ledger.json") : path.join(EXP, "ledger.json");
const LEDGER_OUT = path.join(WRITE_ROOT, "ledger.json");
const ALL_EXP_BOX = [...(OUT_DIR ? Object.values(FAMILIES).map((f) => path.join(OUT_DIR, f.dir, "boxscores")) : []), ...Object.values(FAMILIES).map((f) => path.join(NBA, f.dir, "boxscores"))];
if (!fs.existsSync(FORECASTS)) { console.log(`no forecasts directory for family ${FAMILY.family} — nothing to grade`); process.exit(0); }

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const rel = (f) => path.relative(REPO, f);
/** Box-score paths in the ledger are relative to the NBA research root (or to --out-dir), so both modes resolve them. */
const relNba = (f) => (OUT_DIR && f.startsWith(OUT_DIR + path.sep) ? path.relative(OUT_DIR, f) : f.startsWith(NBA + path.sep) ? path.relative(NBA, f) : rel(f));

/* ─────────────── inputs ─────────────── */
const finalsRecords = {};
for (const f of fs.existsSync(RESULTS_DIR) ? fs.readdirSync(RESULTS_DIR) : []) {
  const m = /^finals-(\d{4}-\d{2})\.json$/.exec(f);
  if (m) { try { finalsRecords[m[1]] = readJson(path.join(RESULTS_DIR, f)); } catch (e) { console.error(`REFUSED: unreadable finals record ${f}: ${e.message}`); process.exit(1); } }
}
const results = fs.existsSync(path.join(RESULTS_DIR, "latest.json")) ? readJson(path.join(RESULTS_DIR, "latest.json")) : null;
const corpus = readJson(CORPUS);
// The rolling window is read for FINAL rows only (results-publishable.test.mjs pins this premise for every reader).
const lookupFinal = finalLookup({ finalsRecords, resultsRows: (results?.rows ?? []).filter((r) => /^STATUS_FINAL/.test(r?.statusRaw ?? "")), corpusRows: corpus.rows ?? [] });
// Prior tips per team (rest / back-to-back slices, prereg §9): every recorded final of every loaded season.
const priorTips = new Map();
for (const rec of Object.values(finalsRecords)) for (const f of rec.finals ?? []) for (const side of ["home", "away"]) {
  const id = f[side]?.providerTeamId; if (id == null) continue;
  if (!priorTips.has(String(id))) priorTips.set(String(id), []);
  priorTips.get(String(id)).push(f.dateUtc);
}

function findBoxscore(id) {
  for (const [dir, source] of [[BOXSCORES, "corpus"], ...ALL_EXP_BOX.map((d) => [d, "experimental-fetch"])]) {
    const f = path.join(dir, `${id}.json`);
    if (fs.existsSync(f)) { try { return { doc: readJson(f), source, file: f }; } catch { /* unreadable → absent */ } }
  }
  return null;
}
// Review #2 — ONE canonical corrected box score: every family's ledger is read for corrections and checks, so all
// families grade a game on the same box score (the newest correction anywhere) and one family's check spares the rest.
const otherLedgers = Object.values(FAMILIES).filter((f) => f.family !== FAMILY.family).map((f) => {
  for (const base of [OUT_DIR, NBA].filter(Boolean)) {
    const file = path.join(base, f.dir, "ledger.json");
    if (fs.existsSync(file)) { try { return upgradeLedger(readJson(file)); } catch { /* unreadable → none */ } }
  }
  return null;
}).filter(Boolean);
const underReview = underReviewIds(finalsRecords);
function correctedBoxscore(ledger, id) {
  const c = latestCorrectionAcross([ledger, ...otherLedgers], id);
  if (!c?.new?.file) return null;
  for (const base of [OUT_DIR, NBA].filter(Boolean)) {
    const f = path.join(base, c.new.file);
    if (fs.existsSync(f)) { try { return { doc: readJson(f), source: "experimental-correction", file: f }; } catch { /* fall through */ } }
  }
  return null;
}

/* ─────────────── guarded fetch (only with --fetch, only for a game that already has a final) ─────────────── */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
let lastRequestAt = 0, requestsMade = 0;
async function fetchSummary(id) {
  if (SUMMARY_DIR) {
    // Offline replay (tests / integration): the payload a fetch would have returned, read from DIR/<id>.json.
    const f = path.join(SUMMARY_DIR, `${id}.json`);
    return fs.existsSync(f) ? { summary: readJson(f) } : { error: "http_404 (replay: no payload)" };
  }
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
/** Fetch + parse one summary into a stored doc (periods recorded beside the parser's output). */
async function fetchBoxDoc(id, game) {
  const r = await fetchSummary(id);
  if (!r.summary) return { error: `fetch ${r.error}` };
  try {
    const parsed = parseSummary(r.summary, { providerEventId: id, season: null, phase: game.seasonType, dateUtc: game.dateUtc, capturedAt: NOW });
    if (parsed.doc.status && !/FINAL/.test(parsed.doc.status)) return { error: `summary status ${parsed.doc.status} not final` };
    const periods = periodsFromSummary(r.summary);
    return { doc: { ...parsed.doc, ...(periods ? { periods: { count: periods, source: "espn-summary-period" } } : {}) } };
  } catch (e) {
    if (e instanceof LabelOrderError) { console.error(`ABORT (PAUSE, prereg §10): ${e.message} on ${id}`); process.exit(2); }
    return { error: `parse ${e?.message ?? e}` };
  }
}
const writeJson = (f, doc) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(doc, null, 1)); };

/* ─────────────── grade ─────────────── */
const beforeText = fs.existsSync(LEDGER_IN) ? fs.readFileSync(LEDGER_IN, "utf8") : null;
const before = beforeText ? JSON.parse(beforeText) : null;
let ledger = before ? upgradeLedger(before) : emptyExperimentalLedger(FAMILY);
// A LEDGER NEVER MIXES FAMILIES — the check reads the document, not the path. An unstamped ledger is legacy v0.
const ledgerGate = familyGuard({ family: FAMILY.family, doc: ledger, what: "ledger" });
if (!ledgerGate.ok) { console.error(`REFUSED: ${rel(LEDGER_IN)} — ${ledgerGate.detail}`); process.exit(1); }
if (ledgerGate.adopt) { ledger.family = FAMILY.family; ledger.modelVersion = FAMILY.modelVersion; ledger.poolRule = FAMILY.poolRule; }
ledger.labels ??= Object.values(LABELS);

const files = fs.readdirSync(FORECASTS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().filter((f) => !ONLY_DATE || f === `${ONLY_DATE}.json`);
const items = [];
const pendingWrites = new Map(); // path → doc (one write per path per run)
let corrections = 0, checks = 0, underReviewSkipped = 0;
const underReviewIdsSeen = new Set();
/** Where a correction payload lives: reuse a stored file with the SAME content (a flapping A→B→A→B box), never rewrite. */
function correctionFile(id, doc, hash) {
  const f = path.join(CORRECTIONS_DIR, `${id}.${hash.slice(0, 12)}.json`);
  if (pendingWrites.has(f)) return { file: f, reused: true };
  if (fs.existsSync(f)) {
    let same = false;
    try { same = boxscoreContentHash(readJson(f)) === hash; } catch { same = false; }
    return same ? { file: f, reused: true } : { error: `stored ${relNba(f)} holds different content` };
  }
  pendingWrites.set(f, doc);
  return { file: f, reused: false };
}
for (const file of files) {
  const artifact = readJson(path.join(FORECASTS, file));
  const artGate = familyGuard({ family: FAMILY.family, doc: artifact, what: "forecast artifact" });
  if (!artGate.ok) { console.error(`REFUSED: ${FAMILY.dir}/forecasts/${file} — ${artGate.detail}`); process.exit(1); }
  const date = artifact.date ?? file.slice(0, 10);
  const graded = [], pending = [], fetched = [];
  for (const game of artifact.games ?? []) {
    const id = String(game.providerEventId);
    const final = lookupFinal(id, { dateUtc: game.dateUtc });
    const pend = (reason) => { pending.push(id); items.push({ providerEventId: id, date, status: "PENDING", pendingReason: reason }); };
    if (final.state === "PENDING") { pend("NO_FINAL (finals record, results capture, corpus)"); continue; }
    // Review #1: a final the record refused stays ungraded, with the record's own reason.
    if (final.state === "REFUSED") { pend(`FINAL_REFUSED_BY_RECORD (${final.source}): ${final.reason}`); continue; }
    // Review #5 + release owner: a final under `conflicts` is UNDER REVIEW — no new ledger entry (any legacy grade stands),
    // excluded from metrics and pairing. Restating a recorded final is the founder's decision.
    if (final.state === "FINAL_UNDER_REVIEW" || underReview.has(id)) { underReviewSkipped += 1; underReviewIdsSeen.add(id); console.log(`  ${id}: FINAL_UNDER_REVIEW (${final.source}, conflicts) — no ledger entry; any legacy grade stands`); continue; }
    if (finalTeamsMatch(final, game) === false) { pend(`TEAM_ID_MISMATCH: final ${final.homeTeamId}/${final.awayTeamId} vs forecast ${game.home?.providerTeamId}/${game.away?.providerTeamId}`); continue; }
    let box = correctedBoxscore(ledger, id) ?? findBoxscore(id);
    if (!box && FETCH) {
      const r = await fetchBoxDoc(id, game);
      const f = path.join(EXP_BOX, `${id}.json`);
      if (r.doc && !fs.existsSync(f) && !pendingWrites.has(f)) {
        pendingWrites.set(f, r.doc);
        box = { doc: r.doc, source: "experimental-fetch", file: f };
        fetched.push(id);
      } else console.log(`  ${id}: box score not stored (${r.error ?? `${relNba(f)} exists but is unreadable`}) — graded without player rows`);
    } else if (box && RECHECK_ON && box.source !== "corpus") {
      const due = recheckDue({ tipUtc: game.dateUtc, now: NOW, lastCheckedAt: lastCheckAtAcross([ledger, ...otherLedgers], id) ?? box.doc?.capturedAt ?? null });
      if (due.due) {
        const r = await fetchBoxDoc(id, game);
        checks += 1;
        if (r.doc) {
          const oldHash = boxscoreContentHash(box.doc), newHash = boxscoreContentHash(r.doc);
          const old = { hash: oldHash, file: relNba(box.file), capturedAt: box.doc?.capturedAt ?? null };
          if (oldHash === newHash) ledger = appendBoxscoreCheck(ledger, { providerEventId: id, checkedAt: NOW, outcome: "UNCHANGED", hash: oldHash });
          else {
            // Review #4: a refusal here is per GAME (logged, the game keeps its current box score), never per family.
            const cf = correctionFile(id, r.doc, newHash);
            if (cf.error) ledger = appendBoxscoreCheck(ledger, { providerEventId: id, checkedAt: NOW, outcome: "CHECK_FAILED", detail: cf.error });
            else {
              ledger = appendBoxscoreCheck(ledger, { providerEventId: id, checkedAt: NOW, outcome: "CORRECTION", hash: newHash, old, new: { hash: newHash, file: relNba(cf.file), capturedAt: NOW, reusedStoredFile: cf.reused }, changes: diffBoxscores(box.doc, r.doc) });
              box = { doc: r.doc, source: "experimental-correction", file: cf.file };
              corrections += 1;
              console.log(`  ${id}: BOX SCORE CORRECTION ${oldHash.slice(0, 12)} → ${newHash.slice(0, 12)}${cf.reused ? " (stored payload reused)" : ""}`);
            }
          }
        } else ledger = appendBoxscoreCheck(ledger, { providerEventId: id, checkedAt: NOW, outcome: "CHECK_FAILED", detail: r.error });
      }
    }
    const ot = resolveOvertime({ final, boxscore: box?.doc ?? null });
    const g = gradeForecastGame(game, { ...final, ...ot }, box?.doc ?? null);
    if (!g.graded) { pend(g.reason); continue; }
    // Pre-tip = a VERIFIED receipt (payload hash matches, generatedAt < tip), recorded beside the inputAsOf check.
    const ri = receiptIntegrity(game);
    g.timing = { ...g.timing, receipt: ri.state, ...(ri.problems ? { receiptProblems: ri.problems } : {}) };
    const boxscoreHash = box ? boxscoreContentHash(box.doc) : null;
    g.context = {
      finalState: final.state,
      boxscoreHash,
      boxscorePoints: boxscorePointsCheck(box?.doc ?? null, { homeTeamId: game.home?.providerTeamId, awayTeamId: game.away?.providerTeamId, ftHome: final.ftHome, ftAway: final.ftAway }),
      restDays: { home: restDaysFor({ teamId: game.home?.providerTeamId, tipUtc: game.dateUtc, priorTips }), away: restDaysFor({ teamId: game.away?.providerTeamId, tipUtc: game.dateUtc, priorTips }) },
    };
    graded.push(g);
    items.push({ providerEventId: id, date, status: "GRADED", grade: g, inputs: { finalSource: final.source, finalState: final.state, boxscoreSource: box?.source ?? null, boxscoreHash, boxscoreFile: box ? relNba(box.file) : null } });
  }
  console.log(`[${FAMILY.family}] ${date}: forecast ${(artifact.games ?? []).length} · graded ${graded.length} · pending ${pending.length}${FETCH ? ` · fetched ${fetched.length}` : ""}`);
  for (const [label, b] of Object.entries(summariseGrades(graded))) if (b.games) console.log(`  ${label}: games ${b.games} · elo brier ${b.winner.elo.brier} ll ${b.winner.elo.logLoss} (n ${b.winner.elo.n}) · sim brier ${b.winner.sim.brier} ll ${b.winner.sim.logLoss} (n ${b.winner.sim.n}) · margin MAE ${b.score.marginMAE} · total MAE ${b.score.totalMAE} · minutes MAE ${b.players.minutesMAE} (rows ${b.players.matchedRows})`);
}

const { ledger: next, appended } = appendGameResults(ledger, items, { gradedAt: NOW, graderVersion: GRADER_VERSION });
next.graderVersion = GRADER_VERSION;
next.recheck = { ...RECHECK, enabled: RECHECK_ON };
next.validation = validationFromGrades(currentGrades(next), { computedAt: NOW, underReview });
next.validation.excluded.underReviewNoEntry = [...underReviewIdsSeen].sort();
next.updatedAt = appended.length || checks ? NOW : before?.updatedAt ?? NOW;
next.requestsMade = requestsMade;
const violations = experimentalLedgerAppendOnlyViolations({ before, after: next });
if (violations.length) { console.error(`REFUSED (append-only guard): ${violations.join("; ")}`); process.exit(1); }
const lineage = appended.reduce((m, e) => ({ ...m, [e.lineageReason]: (m[e.lineageReason] ?? 0) + 1 }), {});
console.log(`appended ${appended.length} grade entr${appended.length === 1 ? "y" : "ies"} ${JSON.stringify(lineage)} · box-score re-checks ${checks} · corrections ${corrections} · under review (no entry) ${underReviewSkipped} · requests ${requestsMade}`);
for (const [label, m] of Object.entries(next.validation.byLabel)) console.log(`[validation] ${label}: games ${m.games} · pre-tip ${m.timing.preTip}/${m.games} · sim brier ${m.winner.sim.brier} ece ${m.winner.sim.ece} (n ${m.winner.sim.n}) · OT ${m.overtime.n} measured / ${m.overtime.notMeasured} not · margin cov80 ${m.margin.coverage80} (n ${m.margin.coverage80N}) · states ${Object.entries(m.states).map(([k, s]) => `${k}=${s.state}`).join(" ")}`);

if (!WRITE) { console.log("dry run — pass --write to append to the ledger"); process.exit(0); }
const nowText = fs.existsSync(LEDGER_IN) ? fs.readFileSync(LEDGER_IN, "utf8") : null;
if (nowText !== beforeText) { console.error("REFUSED: ledger changed during this run"); process.exit(1); }
for (const [f, doc] of pendingWrites) {
  // Decided per game in the loop; a file that appeared since (a concurrent writer) is never overwritten.
  if (fs.existsSync(f)) { console.error(`REFUSED: ${rel(f)} appeared during this run — a stored box score is never rewritten`); process.exit(1); }
  writeJson(f, doc);
}
fs.mkdirSync(path.dirname(LEDGER_OUT), { recursive: true });
const text = ledgerText(next);
if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(next)) { console.error("REFUSED: ledger serialisation does not round-trip"); process.exit(1); }
fs.writeFileSync(LEDGER_OUT, text);
console.log(`wrote ${OUT_DIR ? LEDGER_OUT : rel(LEDGER_OUT)} (${next.gradeEntries.length} grade entries · legacy entries ${next.entries?.length ?? 0} untouched)${pendingWrites.size ? ` + ${pendingWrites.size} box-score file(s)` : ""}`);
