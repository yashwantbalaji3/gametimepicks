#!/usr/bin/env node
/**
 * GRADE MLB GAME-LEVEL PREDICTIONS — moneyline / total / run line, from the forecast of record
 * to the official StatsAPI final (Program 196 · Release B1).
 *
 *   npx tsx scripts/mlb/grade-game-predictions.mjs --now <ISO> [--date YYYY-MM-DD] [--from-history] [--write]
 *     [--forecast-of-record served --deployments <file> [--first-pitch <file>] [--clock-early-sec 60]
 *      [--clock-late-sec 600] [--untrusted FAILURE,ABANDONED] [--untrusted-lag-sec 3600]]
 *
 * PROPOSAL (TRUTH-001, Option B — NOT the default; needs Results/OPS-owner review and founder approval):
 * `--forecast-of-record served` grades each game from the revision a READY Production deployment SERVED before the
 * actual start (lib/mlb/prediction/served-forecast-selector.mjs over lib/publication-evidence/served-revision.mjs),
 * and refuses — ungraded, listed with its status — whenever the evidence cannot decide it. Candidates are every
 * committed revision of the dated file plus the snapshots, so it needs full git history (refused on a shallow clone).
 * Without the flag nothing changes: the default rule is still "newest generated before first pitch".
 *
 * TWO SOURCES OF PRE-EVENT TRUTH, ONE RULE. The dated predictions artifact regenerates through the
 * day, so the copy on disk is not evidence about what the model said before first pitch. Evidence
 * is (a) --from-history: every COMMITTED revision of the dated file, recovered via git — the
 * backfill path, refused on a shallow clone because a truncated history would silently shrink the
 * record; and (b) immutable per-run snapshots under data/internal/mlb/prediction-snapshots/<date>/
 * — the forward path, written by the generator from P196 on. Both feed the same selector: newest
 * revision that still PRE-DATES the game's own first pitch.
 *
 * The ledger is append-only; (gamePk, market) never regrades. Games with no qualifying revision
 * are printed as MISSING_PRE_EVENT_ARTIFACT with the reason — named gaps, never reconstructed.
 * NO MONEY: this writes a model-performance record only; it never touches the paper bankroll.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { gradeDate, summariseGameLedger, GAME_GRADING_VERSION } from "../../src/lib/mlb/prediction/grade-games.mjs";
import { makeServedRevisionSelector, summariseRefusals, FORECAST_OF_RECORD_RULE } from "../../src/lib/mlb/prediction/served-forecast-selector.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const LINESCORES = path.join(ROOT, "data/internal/mlb/linescores");
const SNAPSHOTS = path.join(ROOT, "data/internal/mlb/prediction-snapshots");
const PRED_DIR = path.join(APP, "public/data/mlb/predictions");
const BOARDS = path.join(APP, "public/data/mlb/boards");
const LEDGER = path.join(APP, "public/data/mlb/results/game-predictions-graded.jsonl");
const RECORD = path.join(APP, "public/data/mlb/results/game-predictions-record.json");

const arg = (f) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null; };
const NOW = arg("--now");
const ONE_DATE = arg("--date");
const FROM_HISTORY = process.argv.includes("--from-history");
const WRITE = process.argv.includes("--write");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
const FOR_MODE = arg("--forecast-of-record") ?? "newest-generated";
if (!["newest-generated", "served"].includes(FOR_MODE)) { console.error(`REFUSED: --forecast-of-record must be newest-generated or served (got ${FOR_MODE})`); process.exit(2); }
const SERVED = FOR_MODE === "served";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/* ── Pre-event revisions per date ────────────────────────────────────────────────────────────── */

function revisionFromArtifact(artifact, source) {
  if (!artifact?.generatedAt || !Array.isArray(artifact.predictions)) return null;
  return {
    generatedAt: artifact.generatedAt,
    source,
    byGamePk: new Map(artifact.predictions.map((p) => [p.gamePk, p])),
  };
}

function historyRevisions(date) {
  const rel = `app/public/data/mlb/predictions/${date}.json`;
  const shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: ROOT }).toString().trim();
  if (shallow === "true") {
    console.error("REFUSED: --from-history on a shallow clone — a truncated history would silently shrink the record");
    process.exit(3);
  }
  const shas = execFileSync("git", ["log", "--format=%H", "--", rel], { cwd: ROOT }).toString().trim().split("\n").filter(Boolean);
  const revs = [];
  for (const sha of shas) {
    let text;
    try { text = execFileSync("git", ["show", `${sha}:${rel}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString(); } catch { continue; }
    try {
      const rev = revisionFromArtifact(JSON.parse(text), `git:${sha.slice(0, 12)}`);
      if (rev) revs.push(rev);
    } catch { /* a malformed historical revision is not evidence */ }
  }
  return revs;
}

function snapshotRevisions(date) {
  const dir = path.join(SNAPSHOTS, date);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^snapshot-\d{12}\.json$/.test(f)); } catch { /* none yet */ }
  const revs = files
    .map((f) => revisionFromArtifact(readJson(path.join(dir, f)), `snapshot:${date}/${f}`))
    .filter(Boolean);
  /*
   * The CURRENT dated file is also a candidate revision. This is safe by the same rule everything
   * else obeys: the selector grades a game from a revision ONLY when its generatedAt pre-dates that
   * game's first pitch, per game. A morning file validly covers the whole slate; a mid-slate
   * rewrite covers only the games still ahead of it; a post-slate rewrite covers nothing. It
   * matters for the seam dates around P196 where snapshots do not exist yet, and costs nothing
   * after — a snapshot with the same generatedAt simply ties and either copy grades identically.
   */
  const dated = revisionFromArtifact(readJson(path.join(PRED_DIR, `${date}.json`)), `dated-file:${date}`);
  if (dated) revs.push(dated);
  return revs;
}

/* ── Publication evidence (only with --forecast-of-record served) ─────────────────────────────── */

let selectorFor = null;
if (SERVED) {
  const depFile = arg("--deployments");
  if (!depFile) { console.error("REFUSED: --forecast-of-record served needs --deployments <file> (capture-github-production-deployments.mjs)"); process.exit(2); }
  const depDoc = readJson(path.resolve(depFile));
  if (!depDoc?.window?.from || !depDoc?.window?.to || !Array.isArray(depDoc.deployments)) { console.error(`REFUSED: ${depFile} is not a deployment record with a window`); process.exit(2); }
  const deployments = depDoc.deployments.map((d) => ({ id: d.id, sha: d.sha, readyAt: d.readyAt ?? null, state: d.state, createdAt: d.createdAt ?? null }));
  const actualStartByGamePk = new Map();
  const fpFile = arg("--first-pitch");
  if (fpFile) for (const g of readJson(path.resolve(fpFile))?.games ?? []) if (g.startInterval?.from && g.startInterval?.to) actualStartByGamePk.set(g.gamePk, g.startInterval);
  const recordClock = { earlyMs: Number(arg("--clock-early-sec") ?? 60) * 1000, lateMs: Number(arg("--clock-late-sec") ?? 600) * 1000 };
  const untrusted = (arg("--untrusted") ?? "FAILURE,ABANDONED").split(",").filter(Boolean);
  const untrustedStates = { states: untrusted, lagMs: Number(arg("--untrusted-lag-sec") ?? 3600) * 1000 };
  const builtCache = new Map();
  selectorFor = (date) => makeServedRevisionSelector({
    deployments,
    evidenceWindow: depDoc.window,
    actualStartByGamePk,
    recordClock,
    untrustedStates,
    servedGameAt: (sha, gamePk) => {
      const k = `${sha}|${date}`;
      if (!builtCache.has(k)) {
        let a = null;
        try { a = JSON.parse(execFileSync("git", ["show", `${sha}:app/public/data/mlb/predictions/${date}.json`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).toString()); } catch { a = null; }
        builtCache.set(k, a);
      }
      const a = builtCache.get(k);
      if (!a) return { ok: false };
      return { ok: true, game: (a.predictions ?? []).find((x) => x.gamePk === gamePk || String(x.gamePk) === String(gamePk)) ?? null };
    },
  });
  console.log(`forecast of record: ${FORECAST_OF_RECORD_RULE.SERVED} · deployment record ${path.basename(depFile)} [${depDoc.window.from} → ${depDoc.window.to}] · actual starts ${actualStartByGamePk.size} · clock −${recordClock.lateMs / 1000}s/+${recordClock.earlyMs / 1000}s`);
}

/* ── Inputs ──────────────────────────────────────────────────────────────────────────────────── */

const dates = ONE_DATE
  ? [ONE_DATE]
  : fs.readdirSync(LINESCORES).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();

const alreadyGraded = new Set();
const existingRows = [];
if (fs.existsSync(LEDGER)) {
  for (const line of fs.readFileSync(LEDGER, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); existingRows.push(r); alreadyGraded.add(`${r.gamePk}:${r.market}`); } catch { /* not a grade */ }
  }
}

/* ── Grade ───────────────────────────────────────────────────────────────────────────────────── */

const newRows = [];
let missingTotal = 0;
const notOfRecordTotal = [];
console.log(`\nMLB game-prediction grading v${GAME_GRADING_VERSION} · ${FROM_HISTORY ? "git-history backfill" : "snapshot mode"} · ${dates.length} date(s)`);

for (const date of dates) {
  const linescore = readJson(path.join(LINESCORES, `${date}.json`));
  if (!linescore?.games?.length) continue;

  const board = readJson(path.join(BOARDS, `${date}.json`));
  const firstPitchByGamePk = new Map((board?.games ?? []).map((g) => [g.gamePk, g.gameDate]));

  // Served mode reads every candidate (committed revisions AND snapshots): the served one is usually a commit.
  const revisions = SERVED ? [...historyRevisions(date), ...snapshotRevisions(date)] : FROM_HISTORY ? historyRevisions(date) : snapshotRevisions(date);
  if (revisions.length === 0) {
    const finals = linescore.games.filter((g) => g.isFinal).length;
    if (finals > 0) console.log(`  ${date}: ${finals} final(s), 0 pre-event revision(s) — MISSING_PRE_EVENT_ARTIFACT for the whole date`);
    missingTotal += finals;
    continue;
  }

  const { graded, skipped } = gradeDate({ revisions, finals: linescore.games, firstPitchByGamePk, alreadyGraded, selectRevision: selectorFor ? selectorFor(date) : null });
  notOfRecordTotal.push(...skipped.notOfRecord.map((x) => ({ date, ...x })));
  for (const g of graded) { alreadyGraded.add(`${g.gamePk}:${g.market}`); g.resultSource = "statsapi-linescore"; g.gradedAt = NOW; }
  newRows.push(...graded);
  missingTotal += skipped.missingPreEvent.length;
  for (const m of skipped.notOfRecord.slice(0, 6)) console.log(`      NOT_OF_RECORD gamePk=${m.gamePk} ${m.status} — ${m.reason}`);
  if (graded.length || skipped.missingPreEvent.length) {
    console.log(`  ${date}: +${graded.length} graded row(s) from ${revisions.length} revision(s) · notFinal ${skipped.notFinal} · already ${skipped.alreadyGraded} · noPick ${skipped.noPick} · missingPreEvent ${skipped.missingPreEvent.length}`);
    for (const m of skipped.missingPreEvent.slice(0, 4)) console.log(`      MISSING_PRE_EVENT_ARTIFACT gamePk=${m.gamePk} — ${m.reason}`);
  }
}

/* ── Report + write ──────────────────────────────────────────────────────────────────────────── */

const all = [...existingRows, ...newRows];
const families = summariseGameLedger(all);
if (SERVED) {
  const tally = summariseRefusals(notOfRecordTotal);
  const nonZero = Object.entries(tally.byStatus).filter(([, n]) => n > 0).map(([s, n]) => `${s} ${n}`).join(" · ");
  console.log(`\n  not of record (refused by publication evidence, ungraded, never a loss): ${tally.total}${nonZero ? ` — ${nonZero}` : ""}`);
}
console.log(`\n  ledger: ${existingRows.length} existing + ${newRows.length} new = ${all.length} rows · ${missingTotal} game-final(s) missing a pre-event artifact (named, not reconstructed)`);
for (const [m, f] of Object.entries(families)) {
  console.log(`    ${m.padEnd(10)} n=${String(f.n).padStart(4)} W${f.wins}-L${f.losses}${f.pushes ? `-P${f.pushes}` : ""} hit ${f.hitRate == null ? "—" : (f.hitRate * 100).toFixed(1) + "%"}`);
}

if (WRITE) {
  if (newRows.length > 0) {
    fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
    fs.appendFileSync(LEDGER, newRows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  }
  const record = {
    schemaVersion: 1,
    artifact: "mlb-game-predictions-record",
    dataClass: "PUBLIC_MODEL_RECORD",
    moneyClass: "NEVER_MONEY",
    sport: "mlb",
    generatedAt: NOW,
    gradingVersion: GAME_GRADING_VERSION,
    what: SERVED
      ? "Game-level predictions — winner, total and run line from the full-game simulation — graded against official StatsAPI finals, from the revision the public site served before each game's actual start."
      : "Game-level predictions — winner, total and run line from the full-game simulation — graded against official StatsAPI finals, from the newest artifact revision that pre-dates each game's first pitch.",
    caveat: "A model-performance record, separate from the 32,227-row player-prop record and from the settled money record: different questions, different denominators, never combined.",
    families,
    /*
     * P199 fix, found by the record itself: `missingTotal` is scoped to THIS invocation's dates,
     * and the nightly loops one date per invocation — so the LAST date's count (typically an
     * already-graded backfill day: zero) overwrote the cumulative figure. The published number is
     * now DERIVED from the full linescore cache against the ledger on every write: a final gamePk
     * with no graded row and both scores present is a missing pre-event artifact, whoever ran last.
     * (The same single-date-into-cumulative class the NFL settler once had — P195's lesson,
     * relearned in my own script.)
     */
    counts: {
      rows: all.length,
      missingPreEventFinals: (() => {
        const gradedPks = new Set(all.map((r) => String(r.gamePk)));
        let missing = 0;
        for (const f of fs.readdirSync(LINESCORES).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
          for (const g of readJson(path.join(LINESCORES, f))?.games ?? []) {
            if (g.isFinal === true && Number.isInteger(g.homeRuns) && Number.isInteger(g.awayRuns) && !gradedPks.has(String(g.gamePk))) missing += 1;
          }
        }
        return missing;
      })(),
    },
    recent: all
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.gamePk).localeCompare(String(a.gamePk)))
      .slice(0, 60),
  };
  fs.writeFileSync(RECORD, JSON.stringify(record, null, 1) + "\n");
  console.log(`\n✓ appended ${newRows.length} row(s); wrote ${path.relative(APP, RECORD)}`);
} else {
  console.log("\ndry run — pass --write to append the ledger and publish the record");
}
