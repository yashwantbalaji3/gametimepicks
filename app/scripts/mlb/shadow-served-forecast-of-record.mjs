#!/usr/bin/env node
/**
 * SHADOW · served forecast of record for graded MLB games (TRUTH-001, founder decision 4). READ-ONLY.
 *
 *   npx tsx scripts/mlb/shadow-served-forecast-of-record.mjs --deployments <file> [--margin-sec 60] [--write <dir>]
 *
 * For every graded game inside the deployment record's window, resolves which forecast revision the production site
 * actually served before first pitch (lib/publication-evidence/served-revision.mjs) and compares it with the revision
 * the grader graded (newest GENERATED before first pitch). Nothing is regraded; the grader is unchanged. The point is
 * to measure, on real history, what the evidence rule would change, and where the evidence is not good enough.
 *
 * Candidates: every committed revision of app/public/data/mlb/predictions/<date>.json plus the immutable prediction
 * snapshots. What a deployment served: that file in the deployment's commit. Start: the graded row's scheduled first
 * pitch (no actual start time is captured for MLB yet — stated as the basis, never assumed).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { STATUS, servedForecastOfRecord } from "../../src/lib/publication-evidence/served-revision.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const DEPLOY_FILE = arg("--deployments");
const MARGIN_MS = Number(arg("--margin-sec") ?? 60) * 1000;
/* The record's clock: a READY time can be up to EARLY before and LATE after the truth (defaults: the symmetric margin). */
const EARLY_MS = arg("--early-sec") != null ? Number(arg("--early-sec")) * 1000 : MARGIN_MS;
const LATE_MS = arg("--late-sec") != null ? Number(arg("--late-sec")) * 1000 : MARGIN_MS;
/* States the record may be wrong about (GitHub: FAILURE, no status), and how late such a record can appear. */
const UNTRUSTED = (arg("--untrusted") ?? "").split(",").filter(Boolean);
const UNTRUSTED_LAG_MS = Number(arg("--untrusted-lag-sec") ?? 3600) * 1000;
/* Actual first pitch (an interval), from capture-mlb-actual-first-pitch.mjs; absent → scheduled start only. */
const FIRST_PITCH_FILE = arg("--first-pitch");
const actualByPk = new Map();
if (FIRST_PITCH_FILE) {
  const fpDoc = JSON.parse(fs.readFileSync(path.resolve(FIRST_PITCH_FILE), "utf8"));
  // The interval the true first pitch lies in: the cutoff is its start, and the whole interval is uncertain.
  for (const g of fpDoc.games ?? []) {
    const iv = g.startInterval;
    if (iv?.from && iv?.to) actualByPk.set(g.gamePk, { at: iv.from, precisionMs: Date.parse(iv.to) - Date.parse(iv.from), basis: iv.basis });
  }
}
const OUT = arg("--write");
if (!DEPLOY_FILE) { console.error("REFUSED: --deployments <file> required"); process.exit(2); }
const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }).toString();
const tryJson = (f) => { try { return JSON.parse(f()); } catch { return null; } };

const raw = JSON.parse(fs.readFileSync(path.resolve(DEPLOY_FILE), "utf8"));
/*
 * Two record formats: ours (capture-github-production-deployments.mjs) and the Vercel API capture of #1042
 * (scripts/capture-vercel-production-deployments.mjs: uid / commitSha / created / ready). The Vercel capture's window
 * is the span of deployments it listed — complete between its first and last `created`, not its nominal dates.
 */
const isVercel = Array.isArray(raw.deployments) && raw.deployments.some((d) => "uid" in d);
const evidence = isVercel
  ? (() => {
    const created = raw.deployments.map((d) => d.created).filter(Boolean).sort();
    return {
      window: { from: created[0], to: created[created.length - 1] },
      deployments: raw.deployments.map((d) => ({ id: d.uid, sha: d.commitSha, readyAt: d.state === "READY" ? d.ready ?? null : null, state: d.state, createdAt: d.created ?? null })),
    };
  })()
  : raw;
const deployments = evidence.deployments.map((d) => ({ id: d.id, sha: d.sha, readyAt: d.readyAt, state: d.state, createdAt: d.createdAt ?? null }));
const graded = fs.readFileSync(path.join(APP, "public/data/mlb/results/game-predictions-graded.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const games = new Map();
for (const r of graded) if (!games.has(`${r.date}|${r.gamePk}`)) games.set(`${r.date}|${r.gamePk}`, r);

const rel = (date) => `app/public/data/mlb/predictions/${date}.json`;
const servedCache = new Map();
function servedFile(sha, date) {
  const k = `${sha}|${date}`;
  if (!servedCache.has(k)) servedCache.set(k, tryJson(() => git("show", `${sha}:${rel(date)}`)));
  return servedCache.get(k);
}
const candCache = new Map();
function candidates(date) {
  if (candCache.has(date)) return candCache.get(date);
  const revs = [];
  for (const sha of git("log", "--format=%H", "--", rel(date)).split("\n").filter(Boolean)) {
    const a = tryJson(() => git("show", `${sha}:${rel(date)}`));
    if (a?.generatedAt) revs.push({ id: `git:${sha.slice(0, 12)}`, artifact: a });
  }
  const snapDir = path.join(ROOT, "data/internal/mlb/prediction-snapshots", date);
  for (const f of fs.existsSync(snapDir) ? fs.readdirSync(snapDir).filter((x) => x.endsWith(".json")) : []) {
    const a = tryJson(() => fs.readFileSync(path.join(snapDir, f), "utf8"));
    if (a?.generatedAt) revs.push({ id: `snapshot:${date}/${f}`, artifact: a });
  }
  candCache.set(date, revs);
  return revs;
}

const from = Date.parse(evidence.window.from);
const to = Date.parse(evidence.window.to);
const rows = [];
for (const g of games.values()) {
  const fp = Date.parse(g.firstPitchUtc);
  if (!(fp >= from && fp <= to)) continue;
  const revs = candidates(g.date)
    .map((r) => ({ r, p: (r.artifact.predictions ?? []).find((x) => x.gamePk === g.gamePk) }))
    .filter((x) => x.p && x.p.status !== "unavailable" && x.p.artifactHash);
  const byHash = new Map();
  for (const x of revs.sort((a, b) => Date.parse(a.r.artifact.generatedAt) - Date.parse(b.r.artifact.generatedAt))) {
    if (!byHash.has(x.p.artifactHash)) byHash.set(x.p.artifactHash, { id: x.r.id, generatedAt: x.r.artifact.generatedAt, contentHash: x.p.artifactHash, forecastVersion: x.p.decisionEngineVersion ?? null });
  }
  const res = servedForecastOfRecord({
    start: { scheduledStarts: [g.firstPitchUtc], actualStartTime: actualByPk.get(g.gamePk)?.at ?? null, actualStartPrecisionMs: actualByPk.get(g.gamePk)?.precisionMs ?? 0 },
    deployments,
    evidenceWindow: evidence.window,
    servedAt: (sha) => {
      const a = servedFile(sha, g.date);
      // No dated file in that build proves nothing about what the page showed (an older path, a later backfill):
      // unreadable, never "not served".
      if (!a) return { ok: false };
      return { ok: true, game: (a.predictions ?? []).find((x) => x.gamePk === g.gamePk) ?? null };
    },
    candidates: [...byHash.values()],
    hashOf: (p) => p.artifactHash ?? null,
    recordClock: { earlyMs: EARLY_MS, lateMs: LATE_MS },
    ...(UNTRUSTED.length ? { untrustedStates: { states: UNTRUSTED, lagMs: UNTRUSTED_LAG_MS } } : {}),
  });
  // What the grader graded: the revision named by the graded row.
  const gradedRev = candidates(g.date).find((r) => r.id === g.forecastSource || (g.forecastSource.startsWith("git:") && r.id === `git:${g.forecastSource.slice(4, 16)}`));
  const gradedHash = gradedRev ? (gradedRev.artifact.predictions ?? []).find((x) => x.gamePk === g.gamePk)?.artifactHash ?? null : null;
  rows.push({
    gamePk: g.gamePk, date: g.date, firstPitchUtc: g.firstPitchUtc,
    status: res.status, reason: res.reason ?? null, cutoff: res.cutoff ?? null, cutoffBasis: res.cutoffBasis ?? null,
    servedHash: res.forecastOfRecord?.contentHash ?? null, gradedHash, gradedSource: g.forecastSource,
    agrees: res.status === STATUS.SERVED ? res.forecastOfRecord.contentHash === gradedHash : null,
    publishedAt: res.forecastOfRecord?.publishedAt ?? null, deployment: res.deployment ?? null,
  });
}

const count = (f) => rows.filter(f).length;
const byStatus = Object.fromEntries(Object.values(STATUS).map((s) => [s, count((r) => r.status === s)]).filter(([, n]) => n));
const summary = {
  schema: "gtp.mlb.served-forecast-of-record-shadow@1",
  deployments: path.relative(ROOT, path.resolve(DEPLOY_FILE)),
  window: evidence.window,
  recordClockSec: { early: EARLY_MS / 1000, late: LATE_MS / 1000 },
  untrustedStates: UNTRUSTED.length ? { states: UNTRUSTED, lagSec: UNTRUSTED_LAG_MS / 1000 } : null,
  startBasis: FIRST_PITCH_FILE ? `actual first pitch interval (play-by-play pitch event, 10 s) from ${path.relative(ROOT, path.resolve(FIRST_PITCH_FILE))}` : "scheduled first pitch only",
  games: rows.length,
  byStatus,
  servedAndAgreesWithGrader: count((r) => r.agrees === true),
  servedButGraderGradedADifferentRevision: rows.filter((r) => r.agrees === false).map((r) => ({ gamePk: r.gamePk, date: r.date, gradedSource: r.gradedSource, publishedAt: r.publishedAt })),
  undecided: rows.filter((r) => r.status !== STATUS.SERVED).map((r) => ({ gamePk: r.gamePk, date: r.date, status: r.status, reason: r.reason })),
};
if (OUT) {
  fs.mkdirSync(path.resolve(OUT), { recursive: true });
  fs.writeFileSync(path.join(path.resolve(OUT), "shadow-rows.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(path.resolve(OUT), "shadow-summary.json"), JSON.stringify(summary, null, 2) + "\n");
}
console.log(JSON.stringify({ ...summary, undecided: summary.undecided.length, servedButGraderGradedADifferentRevision: summary.servedButGraderGradedADifferentRevision }, null, 2));
