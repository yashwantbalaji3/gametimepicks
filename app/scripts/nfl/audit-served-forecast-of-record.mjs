#!/usr/bin/env node
/**
 * AUDIT · served NFL forecast of record vs the graded revision (CANON-01, founder 2026-11-09; Option B). READ-ONLY.
 *
 *   node scripts/nfl/audit-served-forecast-of-record.mjs --deployments <github production-deployments file> [--out <file>]
 *
 * For every graded NFL game (app/public/data/nfl/reconciliation/<week>.json, state FINAL) inside the deployment record's
 * window, resolves which forecast revision the Production site actually SERVED before kickoff
 * (lib/publication-evidence/served-revision.mjs, the founder's Option B rule) and compares it with the revision the
 * reconciliation graded (`published.generatedAt`). Nothing is regraded, rewritten or promoted: a mismatch is REPORTED
 * with its evidence (founder: historical grading changes only through a separate, approved, audited correction).
 *
 *   candidates  every committed revision receipt of the game (data/internal/nfl/forecast-receipts/<date>/<id>[-rev-HHMMZ].json),
 *               identified by its own generatedAt + forecast summary
 *   served      the game's forecast in the build's public union (forecasts/latest.json, else frozen-latest.json) at
 *               the serving deployment's commit — what the game page rendered
 *   cutoff      the scheduled kickoff (no actual NFL start is captured: stated as the basis, never assumed)
 *   clock       GitHub's record vs Vercel: up to 19 s early, 7 min late (TRUTH-001 validation)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { STATUS, servedForecastOfRecord } from "../../src/lib/publication-evidence/served-revision.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const DEPLOY_FILE = arg("--deployments");
if (!DEPLOY_FILE) { console.error("REFUSED: --deployments <file> required"); process.exit(2); }
const OUT = arg("--out");
const raw = JSON.parse(fs.readFileSync(path.resolve(DEPLOY_FILE), "utf8"));
const deployments = raw.deployments.map((d) => ({ id: String(d.id), sha: d.sha, readyAt: d.readyAt ?? null, state: d.state, createdAt: d.createdAt ?? null }));
const window = raw.window;

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
/* A revision is its CONTENT: the forecast summary and the model's input hash. A run on unchanged inputs republishes the
   same forecast under a new generatedAt and writes no receipt (build-nfl-public-forecasts.mjs: "identical inputs →
   identical forecast"), so a generatedAt-only difference is the same forecast, not a different one. */
const hashOf = (f) => (f?.forecastSummary ? crypto.createHash("sha256").update(JSON.stringify({ h: f.model?.inputHash ?? null, s: f.forecastSummary })).digest("hex").slice(0, 16) : null);

/* what each build served: the public union at that commit (cached per sha) */
const unionAt = new Map();
function servedUnion(sha) {
  if (unionAt.has(sha)) return unionAt.get(sha);
  const show = (rel) => { try { return JSON.parse(execFileSync("git", ["show", `${sha}:${rel}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 2e8, stdio: ["ignore", "pipe", "ignore"] })); } catch { return null; } };
  const latest = show("app/public/data/nfl/forecasts/latest.json");
  const frozen = show("app/public/data/nfl/forecasts/frozen-latest.json");
  const v = latest || frozen ? { latest, frozen } : null;
  unionAt.set(sha, v);
  return v;
}

/* every revision receipt of a game */
const RECEIPTS = path.join(ROOT, "data/internal/nfl/forecast-receipts");
const receiptsOf = new Map();
for (const d of fs.readdirSync(RECEIPTS).sort()) {
  const dir = path.join(RECEIPTS, d);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const id = f.split(/[-.]/)[0];
    const r = read(path.join(dir, f));
    if (r?.generatedAt) (receiptsOf.get(id) ?? receiptsOf.set(id, []).get(id)).push({ file: `${d}/${f}`, r });
  }
}

const games = [];
for (const f of fs.readdirSync(path.join(APP, "public/data/nfl/reconciliation")).filter((x) => x.endsWith(".json")).sort()) {
  const doc = read(path.join(APP, "public/data/nfl/reconciliation", f));
  for (const g of doc?.games ?? []) if (g?.state === "FINAL" && g.published?.generatedAt) games.push({ week: f.replace(/\.json$/, ""), ...g });
}

const from = Date.parse(window.from), to = Date.parse(window.to);
const rows = [];
for (const g of games) {
  const id = String(g.providerEventId);
  const kick = g.kickoffUtc;
  if (!(Date.parse(kick.replace(/Z$/, ":00Z")) >= from && Date.parse(kick.replace(/Z$/, ":00Z")) <= to)) continue;
  const revs = receiptsOf.get(id) ?? [];
  const byHash = new Map();
  for (const { file, r } of revs.sort((a, b) => Date.parse(a.r.generatedAt) - Date.parse(b.r.generatedAt))) {
    const h = hashOf(r);
    if (h && !byHash.has(h)) byHash.set(h, { id: file, generatedAt: r.generatedAt, contentHash: h });
  }
  // the public union files are committed revisions too: a revision a build served is a candidate even when its receipt
  // was never written (seen 2026-10-25: 23:27:16Z served, no receipt)
  const kMs = Date.parse(kick.replace(/Z$/, ":00Z"));
  for (const d of deployments) {
    const t = Date.parse(d.readyAt ?? d.createdAt ?? "");
    if (d.state !== "READY" || !(t > kMs - 8 * 864e5 && t < kMs + 3600e3)) continue;
    const u = servedUnion(d.sha);
    for (const doc of [u?.latest, u?.frozen]) {
      const x = (doc?.forecasts ?? []).find((y) => String(y.providerEventId) === id);
      const h = hashOf(x);
      if (h && !byHash.has(h)) byHash.set(h, { id: `union@${d.sha.slice(0, 10)}`, generatedAt: x.generatedAt, contentHash: h });
    }
  }
  const res = servedForecastOfRecord({
    start: { scheduledStarts: [...new Set([kick, ...revs.map((x) => x.r.kickoffUtc).filter(Boolean)])].map((k) => k.replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")) },
    deployments, evidenceWindow: window,
    servedAt: (sha) => {
      const u = servedUnion(sha);
      if (!u) return { ok: false };
      const pick = (doc) => (doc?.forecasts ?? []).find((x) => String(x.providerEventId) === id) ?? null;
      return { ok: true, game: pick(u.latest) ?? pick(u.frozen) };
    },
    candidates: [...byHash.values()], hashOf,
    recordClock: { earlyMs: 19_000, lateMs: 420_000 },
  });
  const graded = revs.find((x) => x.r.generatedAt === g.published.generatedAt) ?? null;
  const gradedHash = graded ? hashOf(graded.r) : [...byHash.values()].find((c) => c.generatedAt === g.published.generatedAt)?.contentHash ?? null;
  rows.push({
    providerEventId: id, matchup: g.matchup, week: g.week, kickoffUtc: kick, gradedRevision: g.published.generatedAt, gradedReceipt: graded?.file ?? null,
    status: res.status, reason: res.reason ?? null, servedRevision: res.forecastOfRecord?.generatedAt ?? null, publishedAt: res.forecastOfRecord?.publishedAt ?? null,
    agrees: res.status === STATUS.SERVED ? res.forecastOfRecord.contentHash === gradedHash : null,
    deployment: res.deployment ?? null,
  });
}

const count = (f) => rows.filter(f).length;
const summary = {
  schema: "gtp.canon-01.nfl-served-vs-graded@1", deployments: path.relative(ROOT, path.resolve(DEPLOY_FILE)), window,
  graded: rows.length, served: count((r) => r.status === STATUS.SERVED), agrees: count((r) => r.agrees === true), disagrees: count((r) => r.agrees === false),
  byStatus: Object.fromEntries([...new Set(rows.map((r) => r.status))].map((s) => [s, count((r) => r.status === s)])),
};
console.log(JSON.stringify(summary, null, 1));
for (const r of rows.filter((x) => x.agrees === false)) console.log(`  DISAGREES ${r.providerEventId} ${r.matchup}: graded ${r.gradedRevision}, served ${r.servedRevision} (deployment ${r.deployment?.id} READY ${r.deployment?.readyAt})`);
if (OUT) fs.writeFileSync(path.resolve(OUT), JSON.stringify({ ...summary, rows }, null, 1));
