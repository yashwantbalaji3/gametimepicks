/**
 * audit-risk-section-display — READ-ONLY guard that the UI displays every risk
 * section the optimizer actually generated. Catches the June-6 class of bug
 * where the optimizer produced 6 High + 6 Longshot MLB cards but volume
 * discipline (cumulative cross-section exposure caps) starved them to 0 on
 * screen.
 *
 * For each risk bucket it compares:
 *   - generated  = publicRiskSections union (after the official sport filter)
 *   - displayed  = applyVolumeDiscipline(...) — exactly what the Suggested view renders
 * FAILS if a bucket is generated (>0) but displayed 0 ONLY because of a filter
 * (i.e. a true UI/discipline starvation), with a reason code. Truly-empty
 * buckets (generated 0) are reported as honest, not failures.
 *
 * Run: cd app && npx tsx scripts/audit-risk-section-display.mjs --date 2026-06-06 [--write-report]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { sectionSlipsForSport } from "../src/lib/suggested-parlay-grouping.ts";
import { applyVolumeDiscipline, PUBLIC_VOLUME_CAPS } from "../src/lib/parlay-volume-discipline.ts";
import { filterOfficialSuggestedSlips } from "../src/lib/sport-capabilities.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const argv = process.argv;
const di = argv.indexOf("--date");
const DATE = di >= 0 && argv[di + 1] ? argv[di + 1] : "2026-06-06";
const WRITE = argv.includes("--write-report");
const RISKS = ["low", "medium", "high", "longshot"];

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }

const opt = loadJSON(resolve(DATA, "parlays", "optimizer", `${DATE}.json`));
if (!opt) { console.log(`No optimizer for ${DATE}`); process.exit(0); }
const prs = opt.publicRiskSections || {};

const official = {};
const generated = {};
for (const r of RISKS) {
  const union = sectionSlipsForSport(prs[r] || {}, "all");
  official[r] = filterOfficialSuggestedSlips(union);
  generated[r] = official[r].length;
}
const disc = applyVolumeDiscipline(official, PUBLIC_VOLUME_CAPS).sections;
const displayed = {};
for (const r of RISKS) displayed[r] = (disc[r] || []).length;

const fails = [];
const warns = [];
for (const r of RISKS) {
  if (generated[r] > 0 && displayed[r] === 0) {
    // generated but nothing shown → a real display/discipline starvation
    fails.push(`${r}: generated ${generated[r]} but displayed 0 — reason: volume_or_exposure_filter_removed_all (UI starvation)`);
  } else if (generated[r] === 0) {
    warns.push(`${r}: generated 0 — honestly empty (reason: insufficient_qualifying_legs); not padded`);
  } else if (displayed[r] < generated[r]) {
    // expected: caps trim a bucket; informational, not a failure
    warns.push(`${r}: generated ${generated[r]} → displayed ${displayed[r]} (reason: per_section_cap / exposure_cap; honest trim)`);
  }
}
const verdict = fails.length ? "FAIL" : "PASS";
console.log(`Risk-section display ${DATE}: ${verdict} | generated ${RISKS.map((r) => `${r}=${generated[r]}`).join(" ")} | displayed ${RISKS.map((r) => `${r}=${displayed[r]}`).join(" ")}`);
for (const f of fails) console.log(`  [FAIL] ${f}`);
for (const w of warns) console.log(`  [info] ${w}`);

if (WRITE) {
  const m = [];
  m.push(`# Risk-Section Display Audit — ${DATE} (auto-generated)`);
  m.push("");
  m.push("> `audit-risk-section-display.mjs --write-report` · READ-ONLY · no paid API · no data/model change.");
  m.push("> FAIL = a risk bucket the optimizer generated renders 0 on screen (UI/discipline starvation).");
  m.push("");
  m.push(`## Verdict: ${verdict}`);
  m.push("");
  m.push("| risk | generated | displayed | note |");
  m.push("|------|----------:|----------:|------|");
  for (const r of RISKS) {
    const note = generated[r] > 0 && displayed[r] === 0 ? "**STARVED**" : generated[r] === 0 ? "honestly empty" : displayed[r] < generated[r] ? "capped (honest)" : "full";
    m.push(`| ${r} | ${generated[r]} | ${displayed[r]} | ${note} |`);
  }
  m.push("");
  for (const f of fails) m.push(`- FAIL: ${f}`);
  m.push("");
  m.push("*Read-only; no change to data/model/grading.*");
  mkdirSync(DOCS, { recursive: true });
  writeFileSync(resolve(DOCS, "risk-section-display-latest.md"), m.join("\n"), "utf8");
  console.log("[--write-report] wrote risk-section-display-latest.md");
}
process.exit(verdict === "FAIL" ? 1 : 0);
