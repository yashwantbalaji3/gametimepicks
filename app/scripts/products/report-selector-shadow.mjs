#!/usr/bin/env node
/**
 * v1.7 Phase 7.2 — the shadow dashboard / receipt, derived and never hand-edited.
 *
 *   npx tsx scripts/products/report-selector-shadow.mjs [--now ISO] [--write]
 *
 * Reads data/internal/products/selector-shadow/{ledger.json,state.json,<date>.json}, the live settlement
 * files app/public/data/mr-dub/settled/<date>.json for the same dates, and — when the checkout is a git
 * repository — each day file's FIRST commit (`git log --diff-filter=A`) so a publication rewritten after
 * it was first committed is visible. For a live leg whose receipt predates stored gamePks, the game it was
 * on is proven from that slate's odds schedule and board by the settler's own resolver, so a doubleheader
 * is never compared by team names. The report itself is a pure function (shadow-report.mjs); this file
 * only gathers inputs and writes:
 *   docs/V17_SHADOW_REPORT.md
 *   data/internal/products/selector-shadow/report.json
 * Network-free. Touches nothing the live products read.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildShadowReport, renderShadowReportMarkdown, publicationFingerprint } from "../../src/lib/products/selector/shadow-report.mjs";
import { firstAddCommit, shallowBoundaries } from "../../src/lib/products/selector/first-commit.mjs";
import { resolveLegGameIdentity } from "../../src/lib/products/mlb-team-market-grading.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const DIR = path.join(REPO, "data", "internal", "products", "selector-shadow");
const SETTLED = path.join(REPO, "app", "public", "data", "mr-dub", "settled");
const MLB = path.join(REPO, "app", "public", "data", "mlb");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes("--write");
const NOW = arg("--now", new Date().toISOString());
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };

const dayFiles = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
const days = dayFiles.map((f) => readJson(path.join(DIR, f), null)).filter(Boolean);
const settledByDate = Object.fromEntries(days.map((d) => [d.date, readJson(path.join(SETTLED, `${d.date}.json`), null)]).filter(([, v]) => v));

/** Per date, per live leg id with no stored gamePk: the game the slate's own artifacts prove (or null). */
const liveIdentityByDate = {};
for (const [date, settled] of Object.entries(settledByDate)) {
  const slate = { schedule: readJson(path.join(MLB, "schedule", `${date}.json`), null)?.games ?? null, board: readJson(path.join(MLB, "boards", `${date}.json`), null) };
  const out = {};
  for (const ln of settled.lanes ?? []) for (const l of ln.legs ?? []) {
    if (!l.id || Number(l.gamePk) > 0) continue;
    const id = resolveLegGameIdentity(l, slate);
    if (id) out[l.id] = { gamePk: id.resolved ? id.gamePk : null, doubleheader: !!id.doubleheader };
  }
  liveIdentityByDate[date] = out;
}

/** First commit of each day file, and the publication fingerprint of that first-committed content (null = UNVERIFIED). */
const boundaries = shallowBoundaries(REPO);
if (boundaries.size) console.error(`report-selector-shadow: shallow checkout (${boundaries.size} boundary commit(s)) — a file first seen at the boundary is UNVERIFIED, never INTACT`);
const firstCommits = {};
for (const d of days) {
  const fc = firstAddCommit(REPO, path.posix.join("data", "internal", "products", "selector-shadow", `${d.date}.json`), JSON.parse, boundaries);
  if (fc) firstCommits[d.date] = { hash: fc.hash, committedAt: fc.committedAt, publicationFingerprint: publicationFingerprint(fc.content) };
}

const report = buildShadowReport({ ledger: readJson(path.join(DIR, "ledger.json"), null), days, state: readJson(path.join(DIR, "state.json"), null), settledByDate, liveIdentityByDate, firstCommits, now: NOW });
const md = renderShadowReportMarkdown(report);
process.stdout.write(md);
if (WRITE) {
  fs.writeFileSync(path.join(REPO, "docs", "V17_SHADOW_REPORT.md"), md);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, "report.json"), JSON.stringify(report, null, 1));
  console.error(`[selector-shadow] wrote docs/V17_SHADOW_REPORT.md + data/internal/products/selector-shadow/report.json`);
} else console.error("[selector-shadow] dry run — pass --write to persist");
