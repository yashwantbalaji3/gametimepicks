/**
 * audit-suggested-parlay-publishing-depth — READ-ONLY. Traces the full publish
 * funnel for a slate and reports exactly where published-card depth is lost:
 *
 *   source buckets (distinct slips by composition)
 *     → publicRiskSections (curated subset, per risk × sport)
 *       → official filter (drops mixed/multi — current guardrail)
 *         → volume discipline (perSection + totalMax + exposure caps)
 *           → DISPLAYED cards
 *
 * Emits displayLossByStep + a PASS/WARN/FAIL verdict on whether the slate has
 * enough valid SOURCE volume to support the product targets (so the report can
 * say "the bottleneck is the display policy, not the slate"). No paid API, no
 * generation/grading/model change, no fabrication.
 *
 * Run: cd app && npx tsx scripts/audit-suggested-parlay-publishing-depth.mjs --date 2026-06-05 [--write-report]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { sectionSlipsForSport } from "../src/lib/suggested-parlay-grouping.ts";
import { applyVolumeDiscipline, PUBLIC_VOLUME_CAPS } from "../src/lib/parlay-volume-discipline.ts";
import { filterOfficialSuggestedSlips, isMixedSportSlip, sportsOnSlip } from "../src/lib/sport-capabilities.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const argv = process.argv;
const di = argv.indexOf("--date");
const DATE = di >= 0 && argv[di + 1] ? argv[di + 1] : "2026-06-05";
const WRITE = argv.includes("--write-report");
const RISKS = ["low", "medium", "high", "longshot"];

// Product targets (when valid source volume exists). Honest: these are display
// targets, NOT a guarantee any section can be filled — the audit reports the gap.
const TARGETS = { mlbCards: 10, mixedCards: 10 }; // NBA = "available" (one-game slates are honestly small)

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }
function slipKey(s) {
  return (s.legs || [])
    .map((l) => `${l.playerId ?? l.playerName ?? ""}|${l.market ?? ""}|${l.line ?? ""}|${l.side ?? ""}`)
    .sort().join(";");
}
function comp(s) {
  const k = sportsOnSlip(s);
  if (k.length > 1) return "mixed";
  return k[0] || "?";
}

function build() {
  const opt = loadJSON(resolve(DATA, "parlays", "optimizer", `${DATE}.json`));
  if (!opt) return { missing: true, DATE };

  // 1) SOURCE: distinct slips across every bucket's nba/mlb/multi sub-buckets.
  const source = new Map();
  const buckets = opt.buckets || {};
  for (const bk of Object.keys(buckets)) {
    for (const sub of ["nba", "mlb", "multi"]) {
      for (const s of buckets[bk]?.[sub] ?? []) source.set(slipKey(s), s);
    }
  }
  const srcComp = { mlb: 0, nba: 0, mixed: 0 };
  for (const s of source.values()) srcComp[comp(s)] = (srcComp[comp(s)] ?? 0) + 1;

  // 2) publicRiskSections: distinct + per risk×sport.
  const prs = opt.publicRiskSections || {};
  const prsDistinct = new Map();
  const prsByRisk = {};
  for (const r of RISKS) {
    const s = prs[r] || {};
    prsByRisk[r] = { nba: (s.nba || []).length, mlb: (s.mlb || []).length, multi: (s.multi || []).length, all: (s.all || []).length };
    for (const sub of ["nba", "mlb", "multi"]) for (const sl of s[sub] ?? []) prsDistinct.set(slipKey(sl), sl);
  }
  const prsComp = { mlb: 0, nba: 0, mixed: 0 };
  for (const s of prsDistinct.values()) prsComp[comp(s)] = (prsComp[comp(s)] ?? 0) + 1;

  // 3) union per risk (the All view) → 4) official filter → 5) volume discipline.
  const unionByRisk = {};
  const officialSections = {};
  let unionTotal = 0, mixedDropped = 0;
  for (const r of RISKS) {
    const union = sectionSlipsForSport(prs[r] || {}, "all");
    unionByRisk[r] = union.length;
    unionTotal += union.length;
    mixedDropped += union.filter((s) => isMixedSportSlip(s)).length;
    officialSections[r] = filterOfficialSuggestedSlips(union);
  }
  const officialTotal = RISKS.reduce((n, r) => n + officialSections[r].length, 0);

  const disc = applyVolumeDiscipline(officialSections, PUBLIC_VOLUME_CAPS).sections;
  const displayed = {};
  let displayedTotal = 0;
  for (const r of RISKS) { displayed[r] = (disc[r] || []).length; displayedTotal += displayed[r]; }

  const displayLossByStep = {
    source: source.size,
    publicRiskSections: prsDistinct.size,
    afterOfficialFilter: officialTotal,
    afterVolumeDiscipline: displayedTotal,
    droppedByOfficialFilter_mixed: mixedDropped,
    droppedByVolumeDiscipline: officialTotal - displayedTotal,
  };

  // Verdict: does SOURCE volume support targets? (independent of display policy)
  const reasons = [];
  let verdict = "PASS";
  const mlbSource = srcComp.mlb, mixedSource = srcComp.mixed;
  if (mlbSource >= TARGETS.mlbCards && displayLossByStep.afterVolumeDiscipline < TARGETS.mlbCards) {
    verdict = "WARN";
    reasons.push(`SOURCE has ${mlbSource} distinct MLB-only slips (≥ target ${TARGETS.mlbCards}) but only ${displayedTotal} cards display — bottleneck is the DISPLAY policy (volume discipline caps perSection ${JSON.stringify(PUBLIC_VOLUME_CAPS.perSection)}, totalMax ${PUBLIC_VOLUME_CAPS.totalMax}), not the slate.`);
  }
  if (mixedSource >= TARGETS.mixedCards && mixedDropped > 0) {
    reasons.push(`SOURCE has ${mixedSource} distinct mixed slips and publicRiskSections carries ${prsComp.mixed}, but ALL mixed are dropped by filterOfficialSuggestedSlips (single-sport-only guardrail). Publishing ~${TARGETS.mixedCards} mixed cards requires a product decision to allow Mixed as official suggested.`);
  }
  if (prsComp.mlb < TARGETS.mlbCards) {
    reasons.push(`publicRiskSections holds only ${prsComp.mlb} distinct MLB-only slips (curated at ~4/risk in generation); to display ${TARGETS.mlbCards}-15 MLB cards the display must also draw from the deeper bucket pool (${srcComp.mlb} distinct MLB) — still read-only, no regeneration.`);
  }

  return {
    DATE, totalSlips: opt.totalSlips, sourcePools: opt.sourcePools,
    srcComp, prsComp, prsByRisk, unionByRisk, unionTotal,
    displayed, displayedTotal, displayLossByStep, verdict, reasons,
  };
}

function md(a) {
  const m = [];
  m.push(`# Suggested-Parlay Publishing Depth — ${a.DATE} (auto-generated)`);
  m.push("");
  m.push("> `audit-suggested-parlay-publishing-depth.mjs --write-report` · READ-ONLY · no paid API · no generation/grading/model change · no fabrication.");
  m.push("");
  m.push(`## Verdict: ${a.verdict}`);
  m.push("");
  m.push("## Publish funnel (distinct slips)");
  m.push("| step | count |");
  m.push("|------|------:|");
  m.push(`| source buckets (nba+mlb+multi, deduped) | ${a.displayLossByStep.source} |`);
  m.push(`| publicRiskSections (curated subset) | ${a.displayLossByStep.publicRiskSections} |`);
  m.push(`| after official filter (mixed dropped) | ${a.displayLossByStep.afterOfficialFilter} |`);
  m.push(`| after volume discipline → **DISPLAYED** | **${a.displayLossByStep.afterVolumeDiscipline}** |`);
  m.push("");
  m.push(`- dropped by official filter (mixed): **${a.displayLossByStep.droppedByOfficialFilter_mixed}**`);
  m.push(`- dropped by volume discipline: **${a.displayLossByStep.droppedByVolumeDiscipline}**`);
  m.push("");
  m.push("## Composition (distinct)");
  m.push(`- source: MLB-only ${a.srcComp.mlb} · NBA-only ${a.srcComp.nba} · mixed ${a.srcComp.mixed}`);
  m.push(`- publicRiskSections: MLB-only ${a.prsComp.mlb} · NBA-only ${a.prsComp.nba} · mixed ${a.prsComp.mixed}`);
  m.push(`- sourcePools (leans): ${JSON.stringify(a.sourcePools)}`);
  m.push("");
  m.push("## DISPLAYED by risk");
  m.push(RISKS.map((r) => `- ${r}: ${a.displayed[r]}`).join("\n"));
  m.push("");
  m.push("## Why depth is lost");
  for (const r of a.reasons) m.push(`- ${r}`);
  m.push("");
  m.push("*Read-only; no UI/data changed by this script.*");
  return m.join("\n");
}

const a = build();
if (a.missing) { console.log(`No optimizer file for ${a.DATE}`); }
else {
  console.log(`Publishing depth ${a.DATE}: ${a.verdict}`);
  console.log(`  funnel: source=${a.displayLossByStep.source} → publicRiskSections=${a.displayLossByStep.publicRiskSections} → official=${a.displayLossByStep.afterOfficialFilter} → displayed=${a.displayLossByStep.afterVolumeDiscipline}`);
  console.log(`  source composition: MLB-only=${a.srcComp.mlb} NBA-only=${a.srcComp.nba} mixed=${a.srcComp.mixed}`);
  console.log(`  publicRiskSections: MLB-only=${a.prsComp.mlb} NBA-only=${a.prsComp.nba} mixed=${a.prsComp.mixed}`);
  console.log(`  displayed by risk:`, a.displayed);
  console.log(`  dropped: official-filter(mixed)=${a.displayLossByStep.droppedByOfficialFilter_mixed} volume-discipline=${a.displayLossByStep.droppedByVolumeDiscipline}`);
  for (const r of a.reasons) console.log(`  • ${r}`);
  if (WRITE) {
    mkdirSync(DOCS, { recursive: true });
    writeFileSync(resolve(DOCS, `suggested-parlay-publishing-depth-${a.DATE}.md`), md(a), "utf8");
    writeFileSync(resolve(DOCS, "suggested-parlay-publishing-depth-latest.md"), md(a), "utf8");
    console.log(`[--write-report] wrote suggested-parlay-publishing-depth-${a.DATE}.md + -latest.md`);
  }
}
