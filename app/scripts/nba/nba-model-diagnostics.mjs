#!/usr/bin/env node
/**
 * NBA daily model diagnostics + champion/challenger report (PRIVATE). OFFLINE: reads only the families' ledgers.
 * Changes nothing: no forecast, ledger, registry or promotion record is written. Proposals are text only.
 *
 *   node scripts/nba/nba-model-diagnostics.mjs [--family v0.1|all] [--date YYYY-MM-DD] [--now ISO] [--write]
 *        [--ledger-root DIR] [--out-dir DIR] [--bootstrap-b 2000]
 *   --date        the settled slate (default: the ET date before --now)
 *   --ledger-root where the family ledgers live (default data/internal/research/nba; pass the grader's --out-dir for
 *                 an integration run)
 * Writes (with --write) <out-dir>/diagnostics/<date>.<family>.{json,md} and <out-dir>/champion-challenger/<date>.json
 * (default out-dir data/internal/research/nba/reports).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { etDateOf, FAMILIES } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { currentEntriesAnySchema, underReviewIds } from "../../src/lib/sports/nba/experimental-grading-ledger.mjs";
import { buildDiagnostics, diagnosticsMarkdown, distributionScoreTable, distributionTableMarkdown } from "../../src/lib/sports/nba/model-diagnostics.mjs";
import { LABELS as POP_LABELS } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { evaluateChampionChallenger } from "../../src/lib/sports/nba/champion-challenger.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const NBA = path.join(REPO, "data", "internal", "research", "nba");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
const NOW = opt("--now") ?? new Date().toISOString();
if (!Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now must be ISO"); process.exit(1); }
const DATE = opt("--date") ?? etDateOf(new Date(Date.parse(NOW) - 86_400_000).toISOString());
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.error("REFUSED: --date YYYY-MM-DD"); process.exit(1); }
const famArg = opt("--family") ?? "all";
const fams = famArg === "all" ? Object.keys(FAMILIES) : [famArg];
for (const f of fams) if (!FAMILIES[f]) { console.error(`REFUSED: unknown family ${f}`); process.exit(1); }
const ROOT = opt("--ledger-root") ? path.resolve(opt("--ledger-root")) : NBA;
const OUT = opt("--out-dir") ? path.resolve(opt("--out-dir")) : path.join(NBA, "reports");
const B = opt("--bootstrap-b") ? Number(opt("--bootstrap-b")) : 2000;
// Finals under review (record `conflicts`) are excluded from every finding and every pair (review #5).
const RESULTS_DIR = opt("--results-dir") ? path.resolve(opt("--results-dir")) : path.join(APP, "public", "data", "nba", "results");
const finalsRecords = Object.fromEntries((fs.existsSync(RESULTS_DIR) ? fs.readdirSync(RESULTS_DIR) : []).filter((f) => /^finals-\d{4}-\d{2}\.json$/.test(f)).map((f) => [f, JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), "utf8"))]));
const underReview = underReviewIds(finalsRecords);
if (!Number.isInteger(B) || B < 100) { console.error("REFUSED: --bootstrap-b integer ≥ 100"); process.exit(1); }

const readLedger = (fam) => {
  for (const base of [ROOT, NBA]) {
    const f = path.join(base, FAMILIES[fam].dir, "ledger.json");
    if (fs.existsSync(f)) return { doc: JSON.parse(fs.readFileSync(f, "utf8")), file: f };
  }
  return null;
};
const writeOut = (f, text) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); console.log(`wrote ${path.relative(REPO, f).startsWith("..") ? f : path.relative(REPO, f)}`); };

const current = {};
for (const fam of Object.keys(FAMILIES)) {
  const l = readLedger(fam);
  current[fam] = l ? currentEntriesAnySchema(l.doc).filter((e) => e.date <= DATE) : [];
}
for (const fam of fams) {
  const r = buildDiagnostics({ family: fam, date: DATE, generatedAt: NOW, entries: current[fam], bootstrap: { B }, underReview });
  const sys = r.slate.findings.filter((f) => f.status === "SYSTEMATIC").length;
  const s = r.slate.surprises;
  console.log(`[diagnostics ${fam}] ${DATE}: slate games ${r.slate.games} · slate systematic findings ${sys} · DNP ${s.predictedButDnp.length} · absent ${s.predictedButAbsent.length} · unpredicted ${s.playedButUnpredicted.length} · finals under review ${s.dataChecks.finalsUnderReview.length}`);
  for (const [label, p] of Object.entries(r.populations)) console.log(`  ${label}: season games ${p.seasonToDate.games} · systematic ${p.seasonToDate.findings.filter((f) => f.status === "SYSTEMATIC").map((f) => f.key).join(", ") || "none"}`);
  if (flag("--write")) {
    writeOut(path.join(OUT, "diagnostics", `${DATE}.${fam}.json`), JSON.stringify(r, null, 1) + "\n");
    writeOut(path.join(OUT, "diagnostics", `${DATE}.${fam}.md`), diagnosticsMarkdown(r));
  } else if (fams.length === 1) console.log(diagnosticsMarkdown(r));
}

// PRIVATE engine × market distribution-score table (diagnostic, promotes nothing), every population.
{
  const tables = Object.values(POP_LABELS).map((label) => distributionScoreTable({ families: current, date: DATE, label, underReview }));
  for (const t of tables) for (const r of t.rows.filter((x) => ["pts", "margin"].includes(x.market))) console.log(`[distribution ${t.population}] ${r.engine} ${r.market}: CRPS ${r.crps.mean} (n ${r.crps.n}, levels ${r.crps.levels.join("/")}) · IS80 ${r.is80.mean} (n ${r.is80.n})`);
  if (flag("--write")) {
    writeOut(path.join(OUT, "diagnostics", `${DATE}.distribution-scores.json`), JSON.stringify({ label: "diagnostic, promotes nothing", tables }, null, 1) + "\n");
    writeOut(path.join(OUT, "diagnostics", `${DATE}.distribution-scores.md`), `# NBA distribution scores — ${DATE} (PRIVATE · diagnostic, promotes nothing)\n\n${tables.map(distributionTableMarkdown).join("\n")}`);
  }
}
const cc = evaluateChampionChallenger({ champion: "v0.1", challengers: ["v0.2", "v1"], families: Object.fromEntries(Object.entries(current).map(([k, es]) => [k, es.filter((e) => e.status === "GRADED").map((e) => e.grade)])), computedAt: NOW, bootstrap: { B }, underReview });
cc.asOfSlate = DATE;
for (const [ch, c] of Object.entries(cc.comparisons)) {
  console.log(`[champion v0.1 vs ${ch}] paired regular-season pre-tip games ${c.pairedGames} · excluded ${JSON.stringify(c.excluded)} · overall ${c.overall}`);
  for (const v of c.verdicts) console.log(`  ${v.market}: ${v.verdict} (n ${v.n} / min ${v.minN})${v.reasons.length && v.verdict !== "INSUFFICIENT_N" ? ` — ${v.reasons.join("; ")}` : ""}`);
}
{
  const w = cc.winnerHeads;
  const f = (m) => `${m.diff} (95% CI ${m.ci95.join(" to ")}, n ${m.n}) ${m.direction}`;
  console.log(`[winner heads, identical frozen forward games] n ${w.n} · mean pHome Elo ${w.meanPHome.elo} · v0.1 sim ${w.meanPHome.v01Sim} · v1 sim ${w.meanPHome.v1Sim} · realised ${w.meanPHome.realisedHomeWinRate}`);
  console.log(`  log loss v1−Elo ${f(w.logLoss.v1SimMinusElo)} · v0.1−Elo ${f(w.logLoss.v01SimMinusElo)} · v1−v0.1 ${f(w.logLoss.v1SimMinusV01Sim)}`);
  for (const c of cc.proposedChallengers) console.log(`[proposed challenger, text only] ${c.text}`);
}
if (flag("--write")) writeOut(path.join(OUT, "champion-challenger", `${DATE}.json`), JSON.stringify(cc, null, 1) + "\n");
else console.log("dry run — pass --write to persist");
