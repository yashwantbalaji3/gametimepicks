#!/usr/bin/env node
/**
 * v1.7 Phase 7.2 — the shadow dashboard / receipt, derived and never hand-edited.
 *
 *   npx tsx scripts/products/report-selector-shadow.mjs [--now ISO] [--write]
 *
 * Reads data/internal/products/selector-shadow/{ledger.json,state.json,<date>.json}, the live settlement
 * files app/public/data/mr-dub/settled/<date>.json for the same dates, and — when the checkout is a git
 * repository — each day file's FIRST commit (`git log --diff-filter=A`) so a publication rewritten after
 * it was first committed is visible. The report itself is a pure function (shadow-report.mjs); this file
 * only gathers inputs and writes:
 *   docs/V17_SHADOW_REPORT.md
 *   data/internal/products/selector-shadow/report.json
 * Network-free. Touches nothing the live products read.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { buildShadowReport, renderShadowReportMarkdown, publicationFingerprint } from "../../src/lib/products/selector/shadow-report.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const DIR = path.join(REPO, "data", "internal", "products", "selector-shadow");
const SETTLED = path.join(REPO, "app", "public", "data", "mr-dub", "settled");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes("--write");
const NOW = arg("--now", new Date().toISOString());
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };

const dayFiles = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
const days = dayFiles.map((f) => readJson(path.join(DIR, f), null)).filter(Boolean);
const settledByDate = Object.fromEntries(days.map((d) => [d.date, readJson(path.join(SETTLED, `${d.date}.json`), null)]).filter(([, v]) => v));

/** First commit of each day file, and the publication fingerprint of that first-committed content. */
function firstCommitOf(rel) {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--format=%H%x09%cI", "--", rel], { cwd: REPO, encoding: "utf8" }).trim().split("\n").filter(Boolean);
    if (!out.length) return null;
    const [hash, committedAt] = out.at(-1).split("\t"); // the oldest add wins
    const content = execFileSync("git", ["show", `${hash}:${rel}`], { cwd: REPO, encoding: "utf8" });
    return { hash, committedAt, publicationFingerprint: publicationFingerprint(JSON.parse(content)) };
  } catch { return null; }
}
const firstCommits = {};
for (const d of days) { const fc = firstCommitOf(path.posix.join("data", "internal", "products", "selector-shadow", `${d.date}.json`)); if (fc) firstCommits[d.date] = fc; }

const report = buildShadowReport({ ledger: readJson(path.join(DIR, "ledger.json"), null), days, state: readJson(path.join(DIR, "state.json"), null), settledByDate, firstCommits, now: NOW });
const md = renderShadowReportMarkdown(report);
process.stdout.write(md);
if (WRITE) {
  fs.writeFileSync(path.join(REPO, "docs", "V17_SHADOW_REPORT.md"), md);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, "report.json"), JSON.stringify(report, null, 1));
  console.error(`[selector-shadow] wrote docs/V17_SHADOW_REPORT.md + data/internal/products/selector-shadow/report.json`);
} else console.error("[selector-shadow] dry run — pass --write to persist");
