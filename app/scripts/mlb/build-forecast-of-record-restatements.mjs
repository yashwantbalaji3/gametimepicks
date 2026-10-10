#!/usr/bin/env node
/**
 * TRUTH-001 · STAGE B — build the MLB forecast-of-record RESTATEMENT LOG from the served-forecast classification.
 *
 *   npx tsx scripts/mlb/build-forecast-of-record-restatements.mjs            # dry run: print the log
 *   npx tsx scripts/mlb/build-forecast-of-record-restatements.mjs --write    # write it (write-once: refuses to overwrite)
 *   npx tsx scripts/mlb/build-forecast-of-record-restatements.mjs --check    # recompute; exit 1 on any drift
 *
 * Input: data/internal/ops/forecast-of-record-shadow/classification.json (#1046). Only VERIFIED_DIFFERENT_REVISION and
 * VERIFIED_NEVER_PUBLIC games enter; UNVERIFIED games never do. For a different-revision game, the served revision is
 * the dated predictions file inside the serving deployment's commit, and its game entry must carry the served content
 * hash; the after-state is regraded from it by the PRODUCTION grading functions (gradeGameFamilies,
 * gradeProjectedScore) against the same official final. A stored call the served revision did not make is NOT_SERVED
 * at row level (never public); a public call that was never graded is reported, not invented.
 *
 * Founder decision 2 (2026-10-10): local implementation and validation only. Applying needs a separately approved PR.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gradeGameFamilies } from "../../src/lib/mlb/prediction/grade-games.mjs";
import { gradeProjectedScore } from "../../src/lib/mlb/prediction/grade-projected-scores.mjs";
import { RESTATEMENT_KIND, RESTATEMENT_SCHEMA, indexRestatements, rowsOfRecord } from "../../src/lib/mlb/results/restatements.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const ID = "2026-10-10-truth-001";
const OUT_DIR = path.join(ROOT, "data/internal/mlb/forecast-of-record-restatements");
const OUT = path.join(OUT_DIR, `${ID}.json`);
const CLASSIFICATION = "data/internal/ops/forecast-of-record-shadow/classification.json";
const WRITE = process.argv.includes("--write");
const CHECK = process.argv.includes("--check");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }).toString();
const gitJson = (sha, rel) => { try { return JSON.parse(git("show", `${sha}:${rel}`)); } catch { return null; } };
const jsonl = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const GRADED = "app/public/data/mlb/results/game-predictions-graded.jsonl";
const PROJECTED = "app/public/data/mlb/results/game-projected-scores-graded.jsonl";
const ms = (iso) => Date.parse(iso ?? "");

const classification = JSON.parse(fs.readFileSync(path.join(ROOT, CLASSIFICATION), "utf8"));
const classificationCommit = (() => { try { return git("log", "-1", "--format=%H", "--", CLASSIFICATION).trim() || null; } catch { return null; } })();
const graded = jsonl(GRADED);
const projected = jsonl(PROJECTED);

// Earliest revision (git history of the dated predictions file + immutable snapshots) carrying given bytes for a game.
function earliestRevisionWith(date, gamePk, hash) {
  const rel = `app/public/data/mlb/predictions/${date}.json`;
  const revs = [];
  for (const sha of git("log", "--format=%H", "--", rel).split("\n").filter(Boolean)) {
    const a = gitJson(sha, rel);
    const p = a?.predictions?.find((x) => x.gamePk === gamePk);
    if (a?.generatedAt && p?.artifactHash === hash) revs.push({ source: `git:${sha.slice(0, 12)}`, generatedAt: a.generatedAt, artifact: a });
  }
  const dir = path.join(ROOT, "data/internal/mlb/prediction-snapshots", date);
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith(".json")) : []) {
    let a = null;
    try { a = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    const p = a?.predictions?.find((x) => x.gamePk === gamePk);
    if (a?.generatedAt && p?.artifactHash === hash) revs.push({ source: `snapshot:${date}/${f}`, generatedAt: a.generatedAt, artifact: a });
  }
  return revs.sort((x, y) => ms(x.generatedAt) - ms(y.generatedAt))[0] ?? null;
}

const games = [];
const problems = [];
/*
 * HELD (fail closed): a served revision generated AFTER the scheduled start but before the actual first pitch is the
 * forecast of record under Option B (actual start), but the ledger contract requires publishedAt < eventStart, and
 * eventStart is the SCHEDULED start (immutable). Restating it would need a contract decision on eventStart, so the game
 * is held out of the log, listed with the reason, and keeps its stored grade.
 */
const held = [];
const ungradedPublicCalls = [];
for (const c of classification.games) {
  if (c.class !== "VERIFIED_DIFFERENT_REVISION" && c.class !== "VERIFIED_NEVER_PUBLIC") continue;
  const stored = graded.filter((r) => r.gamePk === c.gamePk && r.date === c.date);
  const storedProj = projected.filter((r) => r.gamePk === c.gamePk && r.date === c.date);
  if (!stored.length) { problems.push(`${c.date} ${c.gamePk}: no stored graded rows`); continue; }
  const evidence = {
    classification: CLASSIFICATION, classificationCommit, class: c.class, evidence: c.evidence,
    cutoff: c.cutoff, cutoffBasis: c.cutoffBasis, deployment: c.deployment, servedHash: c.servedHash ?? null,
    publishedAt: c.publishedAt ?? null, gradedSource: c.gradedSource, gradedHash: c.gradedHash,
  };
  if (c.class === "VERIFIED_NEVER_PUBLIC") {
    games.push({
      gamePk: c.gamePk, date: c.date, kind: RESTATEMENT_KIND.NOT_SERVED, evidence,
      rows: [...stored.map((r) => ({ log: "game-predictions-graded", before: r, after: null })), ...storedProj.map((r) => ({ log: "game-projected-scores-graded", before: r, after: null }))],
    });
    continue;
  }
  // The served bytes: the dated predictions file inside the serving deployment's commit.
  const served = gitJson(c.deployment.sha, `app/public/data/mlb/predictions/${c.date}.json`)?.predictions?.find((p) => p.gamePk === c.gamePk) ?? null;
  if (!served || served.artifactHash !== c.servedHash) { problems.push(`${c.date} ${c.gamePk}: the serving build's entry does not carry the served hash`); continue; }
  const rev = earliestRevisionWith(c.date, c.gamePk, c.servedHash);
  if (!rev || !(ms(rev.generatedAt) < ms(c.cutoff))) { problems.push(`${c.date} ${c.gamePk}: no revision generated before the cutoff carries the served bytes`); continue; }
  if (!(ms(rev.generatedAt) < ms(stored[0].firstPitchUtc))) {
    held.push({ gamePk: c.gamePk, date: c.date, reason: "SERVED_REVISION_GENERATED_AFTER_SCHEDULED_START", servedGeneratedAt: rev.generatedAt, scheduledStart: stored[0].firstPitchUtc, cutoff: c.cutoff, cutoffBasis: c.cutoffBasis, note: "forecast of record under the actual-start rule; restating needs a founder decision on the ledger's eventStart" });
    continue;
  }
  const fin = { isFinal: true, homeRuns: stored[0].actual.homeRuns, awayRuns: stored[0].actual.awayRuns };
  const regraded = gradeGameFamilies({ row: served, final: fin, revision: { generatedAt: rev.generatedAt, source: rev.source }, firstPitchUtc: stored[0].firstPitchUtc });
  const rows = [];
  for (const s of stored) {
    const a = regraded.find((x) => x.market === s.market);
    // Keep the owner's settlement fields: the final and when it was graded do not change.
    rows.push({ log: "game-predictions-graded", before: s, after: a ? { ...a, resultSource: s.resultSource, gradedAt: s.gradedAt } : null, ...(a ? {} : { rowKind: RESTATEMENT_KIND.NOT_SERVED }) });
  }
  for (const a of regraded) if (!stored.some((s) => s.market === a.market)) ungradedPublicCalls.push({ gamePk: c.gamePk, date: c.date, market: a.market, pick: a.pick });
  const afterRows = rows.filter((r) => r.after).map((r) => r.after);
  for (const p of storedProj) {
    const g = afterRows.length ? gradeProjectedScore(afterRows, { generatedAt: rev.generatedAt, predictions: [served] }) : { refused: "NO_REGRADED_ROWS" };
    rows.push({ log: "game-projected-scores-graded", before: p, after: g.row ? { ...g.row, resultSource: p.resultSource, gradedAt: p.gradedAt } : null, ...(g.row ? {} : { rowKind: RESTATEMENT_KIND.NOT_SERVED, refused: g.refused }) });
  }
  games.push({ gamePk: c.gamePk, date: c.date, kind: RESTATEMENT_KIND.SERVED_DIFFERENT_REVISION, evidence: { ...evidence, servedRevision: { source: rev.source, generatedAt: rev.generatedAt, artifactHash: c.servedHash } }, rows });
}

// A row the served revision did not carry is NOT_SERVED at row level: split those into their own NOT_SERVED game entry.
const split = [];
for (const g of games) {
  if (g.kind !== RESTATEMENT_KIND.SERVED_DIFFERENT_REVISION) { split.push(g); continue; }
  const missing = g.rows.filter((r) => r.rowKind === RESTATEMENT_KIND.NOT_SERVED).map(({ rowKind, refused, ...r }) => ({ ...r, after: null }));
  const kept = g.rows.filter((r) => r.rowKind !== RESTATEMENT_KIND.NOT_SERVED);
  if (kept.length) split.push({ ...g, rows: kept });
  if (missing.length) split.push({ ...g, kind: RESTATEMENT_KIND.NOT_SERVED, rows: missing, note: "the served revision made no call for these rows" });
}

const doc = {
  schema: RESTATEMENT_SCHEMA,
  restatementId: ID,
  status: "PROPOSED_NOT_APPLIED",
  authority: "Founder decision 2 (2026-10-10): implement and validate locally; applying to Production needs a separately approved PR.",
  basis: "Forecast of record = the revision a READY Production deployment demonstrably served before the actual first pitch (Option B).",
  source: { classification: CLASSIFICATION, classificationCommit },
  games: split,
  held,
  ungradedPublicCalls,
};

// Self-check: the log applies cleanly to the committed grade logs.
const index = indexRestatements([{ file: `${ID}.json`, doc }]);
rowsOfRecord("game-predictions-graded", graded, index);
rowsOfRecord("game-projected-scores-graded", projected, index);

const text = JSON.stringify(doc, null, 1) + "\n";
const summary = {
  games: split.length,
  servedDifferent: split.filter((g) => g.kind === RESTATEMENT_KIND.SERVED_DIFFERENT_REVISION).length,
  notServed: split.filter((g) => g.kind === RESTATEMENT_KIND.NOT_SERVED).length,
  rows: split.reduce((s, g) => s + g.rows.length, 0),
  ungradedPublicCalls: ungradedPublicCalls.length,
  held: held.map((h) => `${h.date} ${h.gamePk} ${h.reason}`),
  problems,
};
if (problems.length) { console.error(JSON.stringify(summary, null, 2)); console.error("REFUSED: problems above — nothing written"); process.exit(1); }
if (CHECK) {
  const committed = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;
  if (committed !== text) { console.error(`DRIFT: ${path.relative(ROOT, OUT)} ${committed == null ? "missing" : "differs from a fresh build"}`); process.exit(1); }
  console.log("RESTATEMENTS_CURRENT");
  process.exit(0);
}
if (WRITE) {
  if (fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8") !== text) { console.error(`REFUSED: ${path.relative(ROOT, OUT)} exists and differs — restatement logs are write-once; a change is a new log`); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, text);
  console.log(`✓ wrote ${path.relative(ROOT, OUT)}`);
}
console.log(JSON.stringify(summary, null, 2));
