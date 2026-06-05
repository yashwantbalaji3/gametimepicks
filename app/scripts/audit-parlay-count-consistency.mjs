/**
 * audit-parlay-count-consistency — READ-ONLY. Reconciles every parlay count for
 * a date: generated pool (totalSlips), unique graded slips, publicRiskSections
 * curated subset, the UI's DISPLAYED count (after official filter + volume
 * discipline), and the graded W/L. Classifies the mismatch and recommends a fix.
 * No paid API, no public/model change, no fabrication.
 *
 * Run: cd app && npx tsx scripts/audit-parlay-count-consistency.mjs --date 2026-06-04 --write-report
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
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
const DATE = di >= 0 && argv[di + 1] ? argv[di + 1] : "2026-06-04";
const WRITE = argv.includes("--write-report");
const RISKS = ["low", "medium", "high", "longshot"];

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }

function build() {
  const opt = loadJSON(resolve(DATA, "parlays", "optimizer", `${DATE}.json`));
  const graded = loadJSON(resolve(DATA, "parlays", "optimizer-graded", `${DATE}.json`));
  const summary = loadJSON(resolve(DATA, "parlays", "optimizer-summary.json"));
  if (!opt) return { missing: true, DATE };

  const generated = opt.totalSlips ?? null; // top-bar "N slips"
  const prs = opt.publicRiskSections || {};

  // publicRiskSections per risk/sport + union (the #264 All = union logic)
  const sectionCounts = {};
  let unionTotal = 0;
  const unionByRisk = {};
  for (const r of RISKS) {
    const s = prs[r] || {};
    sectionCounts[r] = { all: (s.all || []).length, mlb: (s.mlb || []).length, nba: (s.nba || []).length, multi: (s.multi || []).length };
    const union = sectionSlipsForSport(s, "all"); // deduped union nba+mlb+multi
    unionByRisk[r] = union.length;
    unionTotal += union.length;
  }

  // UI DISPLAYED count: union -> official filter (drop mixed) -> volume discipline.
  // Mirrors the unfiltered "All" Suggested view (no team/player filter).
  const officialSections = {};
  for (const r of RISKS) {
    const union = sectionSlipsForSport(prs[r] || {}, "all");
    officialSections[r] = filterOfficialSuggestedSlips(union);
  }
  let displayed = {};
  let displayedTotal = 0;
  try {
    const disc = applyVolumeDiscipline(officialSections, PUBLIC_VOLUME_CAPS).sections;
    for (const r of RISKS) { displayed[r] = (disc[r] || []).length; displayedTotal += displayed[r]; }
  } catch (e) {
    displayed = { error: String(e?.message || e) };
  }

  // Graded universe
  const uniqueGraded = (graded?.uniqueSlips || []).length;
  let gW = 0, gL = 0, gP = 0, gPend = 0;
  for (const s of graded?.uniqueSlips || []) {
    const res = (s.legs || []).map((l) => l.result);
    if (res.some((r) => r === "loss")) gL++;
    else if (res.some((r) => r === "unresolved" || r === "pending" || !r)) gPend++;
    else if (res.length && res.every((r) => r === "win")) gW++;
    else gP++;
  }

  // Published-card record (byPublicSection — what users saw, graded)
  const pubRec = summary?.byPublicSection?.byDate?.[DATE] || null;
  let pubW = 0, pubL = 0, pubPend = 0;
  if (pubRec) for (const r of RISKS) { const x = pubRec[r] || {}; pubW += x.wins || 0; pubL += x.losses || 0; pubPend += x.pending || 0; }

  // Classification
  const reasons = [];
  let verdict = "PASS";
  let klass = "CASE 1 — expected but confusing labels";
  if (displayedTotal === 0 && unionTotal > 0) {
    verdict = "FAIL"; klass = "CASE 2 — UI under-display (qualifying cards exist but 0 shown)";
    reasons.push("publicRiskSections has cards but volume discipline removed all of them");
  } else {
    // generated >> displayed and graded-universe != displayed-universe → label confusion
    if (generated != null && displayed && displayedTotal < generated) {
      verdict = "WARN";
      reasons.push(`top-bar "${generated} slips" = generated pool; only ${displayedTotal} official cards displayed (after official filter + volume discipline caps ${JSON.stringify(PUBLIC_VOLUME_CAPS.perSection)} + exposure caps).`);
    }
    if (uniqueGraded && uniqueGraded !== displayedTotal) {
      verdict = verdict === "FAIL" ? "FAIL" : "WARN";
      reasons.push(`graded universe = ${uniqueGraded} unique generated slips (W/L lifetime), NOT the ${displayedTotal} displayed published cards — Results must label which universe it shows.`);
    }
    if (unionTotal < RISKS.length * 3 && (generated || 0) > unionTotal) {
      reasons.push(`shallow slate / quality caps: publicRiskSections union = ${unionTotal} (some sections < 3) — honest, do not pad.`);
    }
  }

  return {
    DATE, generated, sectionCounts, unionByRisk, unionTotal, displayed, displayedTotal,
    uniqueGraded, gW, gL, gP, gPend, pubRec: !!pubRec, pubW, pubL, pubPend,
    verdict, klass, reasons,
  };
}

function md(a) {
  const m = [];
  m.push(`# Parlay Count Consistency — ${a.DATE} (auto-generated)`);
  m.push("");
  m.push("> `audit-parlay-count-consistency.mjs --write-report` · READ-ONLY · no paid API · no fabrication.");
  m.push("");
  m.push(`## Verdict: ${a.verdict} — ${a.klass}`);
  m.push("");
  m.push("## The count chain");
  m.push(`- **Generated pool (top-bar "N slips") = totalSlips = ${a.generated}** — every generated combination across the 4 profile buckets.`);
  m.push(`- **Graded unique slips = ${a.uniqueGraded}** — the deduped generated pool that settlement grades → **${a.gW}W / ${a.gL}L / ${a.gP}P / ${a.gPend} pending**. This drives the lifetime/byDate hit rate.`);
  m.push(`- **publicRiskSections curated subset (union) = ${a.unionTotal}** (per risk: ${RISKS.map((r) => `${r} ${a.unionByRisk[r]}`).join(", ")}).`);
  m.push(`- **DISPLAYED official cards = ${a.displayedTotal}** (after \`filterOfficialSuggestedSlips\` + \`applyVolumeDiscipline\`): ${typeof a.displayed === "object" && !a.displayed.error ? RISKS.map((r) => `${r} ${a.displayed[r]}`).join(", ") : JSON.stringify(a.displayed)}.`);
  m.push(`- **Published-card record (byPublicSection)**: ${a.pubRec ? `${a.pubW}W / ${a.pubL}L / ${a.pubPend} pending — what users actually saw, graded.` : "(not in summary)"}`);
  m.push("");
  m.push("## publicRiskSections by risk × sport");
  m.push("| risk | all | mlb | nba | multi |");
  m.push("|------|----:|----:|----:|------:|");
  for (const r of RISKS) { const c = a.sectionCounts[r]; m.push(`| ${r} | ${c.all} | ${c.mlb} | ${c.nba} | ${c.multi} |`); }
  m.push("");
  m.push("## Why the numbers differ (reasons)");
  for (const r of a.reasons) m.push(`- ${r}`);
  m.push("");
  m.push("## Recommended fix");
  m.push("- **Labels (low-risk copy):** top-bar `\"N slips\"` → `\"N generated combinations\"`; `\"Showing N parlays\"` → `\"Showing N published cards\"`; add `\"Published cards are a curated subset of the generated pool.\"`");
  m.push("- **Empty High/Longshot:** `\"No qualifying <risk> cards for this slate after quality + exposure caps.\"`");
  m.push("- **MLB-only day:** `\"MLB-only slate; NBA had no games.\"`");
  m.push("- **Results scope:** label which universe each number reflects — section/sport breakdowns already use the **published-card** grading (byPublicSection); the lifetime headline uses the **generated pool**. Make that explicit (see results-performance-scope-latest.md).");
  m.push("- **No model/generation change** required; this is a labeling/scope-clarity issue, not an under-display bug.");
  m.push("");
  m.push("*Read-only; no UI changed by this script.*");
  return m.join("\n");
}

const a = build();
if (a.missing) { console.log(`No optimizer file for ${a.DATE}`); }
else {
  console.log(`Parlay count consistency ${a.DATE}: ${a.verdict} — ${a.klass}`);
  console.log(`  generated(totalSlips)=${a.generated} | uniqueGraded=${a.uniqueGraded} (${a.gW}W/${a.gL}L/${a.gPend}pend) | publicUnion=${a.unionTotal} | displayed=${a.displayedTotal}`);
  console.log(`  displayed by risk:`, a.displayed);
  if (WRITE) {
    mkdirSync(DOCS, { recursive: true });
    writeFileSync(resolve(DOCS, `parlay-count-consistency-${a.DATE}.md`), md(a), "utf8");
    writeFileSync(resolve(DOCS, "parlay-count-consistency-latest.md"), md(a), "utf8");
    console.log(`[--write-report] wrote parlay-count-consistency-${a.DATE}.md + -latest.md`);
  }
}
