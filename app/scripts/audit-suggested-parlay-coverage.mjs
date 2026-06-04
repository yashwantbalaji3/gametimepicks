/**
 * Suggested-parlay coverage audit — OFFLINE, READ-ONLY.
 *
 * Verifies the Suggested-parlay sport views for a slate: the "All" view (union
 * of nba+mlb+multi) is never smaller than its child tabs, counts per risk×sport,
 * duplicate slipIds, unsupported sports, mixed-bucket purity, and sections below
 * the 3-card target. It reads ONLY the optimizer payload + the pure grouping
 * helper. Writes nothing unless `--write-report`.
 *
 * Run (from app/):
 *   npx tsx scripts/audit-suggested-parlay-coverage.mjs [--date YYYY-MM-DD] [--write-report]
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  sectionSlipsForSport,
  countSportViews,
  allCoversChildren,
  slipKey,
  RISK_KEYS,
  TARGET_MIN,
  DISPLAY_CAP,
} from "../src/lib/suggested-parlay-grouping.ts";

const args = process.argv.slice(2);
const WRITE = args.includes("--write-report");
const dateArg = (() => { const i = args.indexOf("--date"); return i >= 0 ? args[i + 1] : null; })();
const OPT_DIR = "public/data/parlays/optimizer";
const REPORT = "../docs/audits/suggested-parlay-coverage-latest.md";

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

function latestOptimizerDate() {
  if (!existsSync(OPT_DIR)) return null;
  const names = readdirSync(OPT_DIR).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
  return names.length ? names[names.length - 1].replace(".json", "") : null;
}

const date = dateArg || latestOptimizerDate();
const payload = date ? readJson(join(OPT_DIR, `${date}.json`)) : null;

const results = [];
const add = (level, check, detail) => results.push({ level, check, detail });

if (!payload || !payload.publicRiskSections) {
  add("FAIL", "load", `no optimizer payload with publicRiskSections for ${date ?? "(no date)"}`);
} else {
  const psr = payload.publicRiskSections;
  add("INFO", "scope", `date ${date} · totalSlips ${payload.totalSlips ?? "?"} · risk keys: ${Object.keys(psr).join(", ")}`);

  // counts per view (union-based)
  const counts = countSportViews(psr);
  add("INFO", "view-counts", `All ${counts.all} · NBA ${counts.nba} · MLB ${counts.mlb} · Mixed ${counts.multi} (All = deduped union of single-sport buckets).`);

  // GATE: all >= each child
  if (allCoversChildren(counts)) add("PASS", "all-covers-children", `All (${counts.all}) ≥ NBA (${counts.nba}), MLB (${counts.mlb}), Mixed (${counts.multi}).`);
  else add("FAIL", "all-covers-children", `All (${counts.all}) is smaller than a child view — union is broken.`);

  // compare to the STORED `all` bucket (the bug source) for visibility
  let storedAll = 0; for (const rk of RISK_KEYS) storedAll += (psr[rk]?.all ?? []).length;
  add("INFO", "stored-all-bucket", `stored \`all\` bucket holds ${storedAll} slip(s) (separate capped curation; the UI now uses the union of ${counts.all} instead).`);

  // per risk × sport counts + below-target sections
  for (const rk of RISK_KEYS) {
    const row = {};
    for (const v of ["all", "nba", "mlb", "multi"]) row[v] = sectionSlipsForSport(psr[rk], v).length;
    add("INFO", `risk:${rk}`, `All ${row.all} · NBA ${row.nba} · MLB ${row.mlb} · Mixed ${row.multi}`);
    for (const v of ["nba", "mlb", "multi"]) {
      if (row[v] > 0 && row[v] < TARGET_MIN) add("WARN", `below-target:${rk}:${v}`, `${rk}/${v} has ${row[v]} (<${TARGET_MIN}) — honest limited section (slate has few clean ${v} combos).`);
      if (row[v] > DISPLAY_CAP) add("INFO", `over-cap:${rk}:${v}`, `${rk}/${v} has ${row[v]} (>${DISPLAY_CAP}); UI caps display to ${DISPLAY_CAP}.`);
    }
  }

  // duplicate slipIds within any single view
  let dupTotal = 0;
  for (const v of ["all", "nba", "mlb", "multi"]) {
    const seen = new Set(); let dups = 0;
    for (const rk of RISK_KEYS) for (const s of sectionSlipsForSport(psr[rk], v)) { const k = slipKey(s); if (seen.has(k)) dups++; else seen.add(k); }
    if (dups > 0) dupTotal += dups;
  }
  if (dupTotal === 0) add("PASS", "dedup", "no duplicate slipIds within any view.");
  else add("FAIL", "dedup", `${dupTotal} duplicate slipId(s) within a view.`);

  // unsupported sports + mixed purity
  const SUPPORTED = new Set(["nba", "mlb"]);
  let unsupported = 0, mixedImpure = 0;
  for (const rk of RISK_KEYS) {
    for (const s of (psr[rk]?.nba ?? [])) { const sp = new Set((s.legs ?? []).map((l) => l.sport)); if (sp.size > 1) mixedImpure++; }
    for (const s of (psr[rk]?.mlb ?? [])) { const sp = new Set((s.legs ?? []).map((l) => l.sport)); if (sp.size > 1) mixedImpure++; }
    for (const s of sectionSlipsForSport(psr[rk], "all")) for (const l of (s.legs ?? [])) if (l.sport && !SUPPORTED.has(String(l.sport).toLowerCase())) unsupported++;
  }
  add(unsupported === 0 ? "PASS" : "FAIL", "supported-sports", `${unsupported} unsupported-sport leg(s) in suggested views.`);
  add("INFO", "mixed-in-single", `${mixedImpure} mixed slip(s) appear in a single-sport bucket (official filter drops mixed downstream).`);
}

const order = { FAIL: 0, WARN: 1, PASS: 2, INFO: 3 };
const fails = results.filter((r) => r.level === "FAIL");
const warns = results.filter((r) => r.level === "WARN");
const overall = fails.length ? "FAIL" : warns.length ? "WARN" : "PASS";

const lines = [`Suggested-parlay coverage audit (read-only)`, `overall: ${overall} · ${results.filter(r=>r.level==='PASS').length} pass · ${warns.length} warn · ${fails.length} fail`, ""];
for (const r of [...results].sort((a, b) => order[a.level] - order[b.level])) lines.push(`[${r.level}] ${r.check}: ${r.detail}`);
console.log(lines.join("\n"));

if (WRITE) {
  const md = ["# Suggested Parlay Coverage Audit (Latest)", "",
    "> Auto-generated by `app/scripts/audit-suggested-parlay-coverage.mjs` (read-only).",
    "> Verifies the All view = union of NBA+MLB+Mixed (All ≥ each child). Do not hand-edit.", "",
    `**Overall: ${overall}** · date ${date}`, "", "| Level | Check | Detail |", "|-------|-------|--------|"];
  for (const r of [...results].sort((a, b) => order[a.level] - order[b.level] || a.check.localeCompare(b.check))) md.push(`| ${r.level} | ${r.check} | ${String(r.detail).replace(/\|/g, "\\|")} |`);
  md.push("");
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync("../docs/audits", { recursive: true });
  writeFileSync(REPORT, md.join("\n"));
  console.log(`\nWrote ${REPORT}`);
}
process.exit(fails.length ? 1 : 0);
