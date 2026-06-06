/**
 * audit-results-projection-accuracy — READ-ONLY guard for the Results page's
 * leg-level "Model Projection Accuracy" lead.
 *
 * Verifies:
 *   - leg-level projection hit rate EXISTS when settled leg data exists
 *     (results/lifetime_summary.json = NBA, mlb/results/lifetime_summary.json = MLB)
 *   - MLB & NBA rates are computed from ACTUAL settled leans (cross-checked
 *     against settled_leans.jsonl within tolerance)
 *   - pushes/voids are EXCLUDED from the decisive denominator
 *   - NO pregame/future date in the settled set (newestDate < today)
 *   - the parlay CARD hit rate is still available (optimizer-summary)
 *   - the Results page LEADS with projection accuracy (renders
 *     ProjectionAccuracySummary above the parlay ResultsHero)
 * Verdict: FAIL on missing/contradictory/leaky data; WARN on small sample.
 *
 * Run: cd app && npx tsx scripts/audit-results-projection-accuracy.mjs [--date 2026-06-06] [--write-report]
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const SRC = resolve(__dirname, "..", "src");
const argv = process.argv;
const di = argv.indexOf("--date");
const TODAY = di >= 0 && argv[di + 1] ? argv[di + 1] : "2026-06-06";
const WRITE = argv.includes("--write-report");

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }
function loadJSONL(p) { try { return readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } }
function norm(v) { return String(v || "").trim().toLowerCase(); }

function tally(rows, field) {
  let w = 0, l = 0, push = 0, voidc = 0; const dates = new Set(); let future = 0;
  for (const r of rows) {
    const res = norm(r[field] ?? r.result ?? r.outcome);
    if (r.date) { dates.add(r.date); if (String(r.date) >= TODAY) future++; }
    if (res === "win" || res === "won") w++;
    else if (res === "loss" || res === "lose" || res === "lost") l++;
    else if (res === "push" || res === "tie") push++;
    else if (res === "void" || res === "no action" || res.includes("cancel")) voidc++;
  }
  return { w, l, push, voidc, decisive: w + l, dates, future };
}

const nbaSum = loadJSON(resolve(DATA, "results", "lifetime_summary.json"));
const mlbSum = loadJSON(resolve(DATA, "mlb", "results", "lifetime_summary.json"));
const nbaLeans = loadJSONL(resolve(DATA, "results", "settled_leans.jsonl"));
const mlbLeans = loadJSONL(resolve(DATA, "mlb", "results", "settled_leans.jsonl"));
const optSummary = loadJSON(resolve(DATA, "parlays", "optimizer-summary.json"));

const fails = [], warns = [], info = [];

function check(label, summary, leans, field) {
  if (!summary || !summary.totalSettled) {
    if (leans.length > 0) fails.push(`${label}: settled leans exist (${leans.length}) but lifetime_summary is missing/empty — projection hit rate would not render`);
    else info.push(`${label}: no settled data (ok — shows "not enough settled data")`);
    return null;
  }
  const t = tally(leans, field);
  // cross-check W/L within a small tolerance (summary vs raw leans)
  if (Math.abs(t.w - summary.wins) > 2 || Math.abs(t.l - summary.losses) > 2) {
    fails.push(`${label}: lifetime_summary W/L (${summary.wins}/${summary.losses}) disagrees with settled_leans (${t.w}/${t.l})`);
  }
  if ((summary.pushes ?? 0) > 0 && summary.decisive !== summary.wins + summary.losses) {
    fails.push(`${label}: pushes not excluded from decisive (decisive ${summary.decisive} != W+L ${summary.wins + summary.losses})`);
  }
  if (t.future > 0) fails.push(`${label}: ${t.future} settled leg(s) dated >= today ${TODAY} (pregame/future leakage)`);
  if (summary.newestDate && String(summary.newestDate) >= TODAY) fails.push(`${label}: newestDate ${summary.newestDate} >= today ${TODAY} (pregame in settled set)`);
  const pct = summary.decisive > 0 ? (summary.wins / summary.decisive) * 100 : null;
  if (summary.decisive < 30) warns.push(`${label}: small sample (${summary.decisive} decisive)`);
  info.push(`${label}: ${pct != null ? pct.toFixed(1) + "%" : "—"} (${summary.wins}/${summary.decisive} decisive, ${summary.pushes ?? 0} push) · ${summary.oldestDate}..${summary.newestDate}`);
  return { wins: summary.wins, decisive: summary.decisive, pct };
}

const nba = check("NBA projections", nbaSum, nbaLeans, "result");
const mlb = check("MLB projections", mlbSum, mlbLeans, "outcome");

// overall
if (nba || mlb) {
  const w = (nba?.wins ?? 0) + (mlb?.wins ?? 0);
  const d = (nba?.decisive ?? 0) + (mlb?.decisive ?? 0);
  info.push(`OVERALL projection hit rate: ${d > 0 ? ((w / d) * 100).toFixed(1) + "%" : "—"} (${w}/${d})`);
} else {
  fails.push("no projection hit rate available from any sport");
}

// parlay card metric still present
const cardLifetime = optSummary?.byPublicSection?.lifetime || optSummary?.lifetime;
if (!cardLifetime) warns.push("parlay card lifetime metric (optimizer-summary) not found");
else info.push("parlay card hit rate still available (optimizer-summary) ✅");

// Results page leads with projection accuracy
const page = (() => { try { return readFileSync(resolve(SRC, "app", "results", "page.tsx"), "utf8"); } catch { return ""; } })();
if (!page.includes("ProjectionAccuracySummary")) fails.push("Results page does not render ProjectionAccuracySummary (projection-accuracy lead missing)");
else {
  const pi = page.indexOf("ProjectionAccuracySummary");
  const hi = page.indexOf("<ResultsHero");
  if (hi >= 0 && pi >= 0 && pi > hi) warns.push("ProjectionAccuracySummary appears AFTER ResultsHero — projection lead should be first");
  else info.push("Results page leads with ProjectionAccuracySummary (before parlay hero) ✅");
}

const verdict = fails.length ? "FAIL" : warns.length ? "WARN" : "PASS";
console.log(`Results projection-accuracy: ${verdict} | fails=${fails.length} warns=${warns.length}`);
for (const x of fails) console.log(`  [FAIL] ${x}`);
for (const x of warns) console.log(`  [WARN] ${x}`);
for (const x of info) console.log(`  [info] ${x}`);

if (WRITE) {
  const m = [`# Results Projection-Accuracy Audit (auto-generated)`, "",
    "> `audit-results-projection-accuracy.mjs --write-report` · READ-ONLY · no paid API · no data/model change.", "",
    `## Verdict: ${verdict}`, ""];
  for (const [t, a] of [["Failures", fails], ["Warnings", warns], ["Info", info]]) {
    m.push(`### ${t}`); if (a.length) for (const x of a) m.push(`- ${x}`); else m.push("- none"); m.push("");
  }
  m.push("*Read-only; no change to data/model/grading.*");
  mkdirSync(DOCS, { recursive: true });
  writeFileSync(resolve(DOCS, "results-projection-accuracy-latest.md"), m.join("\n"), "utf8");
  console.log("[--write-report] wrote results-projection-accuracy-latest.md");
}
process.exit(verdict === "FAIL" ? 1 : 0);
