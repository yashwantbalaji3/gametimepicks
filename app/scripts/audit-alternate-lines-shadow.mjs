/**
 * audit-alternate-lines-shadow — READ-ONLY audit of the shadow alternate-line
 * fetch (pipeline/cache/odds/alternate-lines/mlb/<date>.json, gitignored).
 * Joins to the active MLB board for main-line comparison. No paid API, no public
 * writes, no optimizer/UI changes. Writes two docs reports.
 *
 * Run: cd app && npx tsx scripts/audit-alternate-lines-shadow.mjs --date 2026-06-04 --write-report
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { deVigAlternateLine, americanToImplied, classifyVsMainLine } from "../src/lib/alternate-lines.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const argv = process.argv;
const di = argv.indexOf("--date");
const DATE = di >= 0 && argv[di + 1] ? argv[di + 1] : "2026-06-04";
const WRITE = argv.includes("--write-report");
const SHADOW = resolve(ROOT, "pipeline", "cache", "odds", "alternate-lines", "mlb", `${DATE}.json`);

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }

// Main-line board map: playerName|market -> {mainLine, impliedOver, impliedUnder, oddsOver, oddsUnder}
function mainLineIndex(date) {
  const b = loadJSON(resolve(DATA, "mlb", "boards", `${date}.json`));
  const idx = new Map();
  for (const l of b?.leans || []) {
    if (!l.playerName || !l.marketKey) continue;
    const k = `${l.playerName}|${l.marketKey}`;
    if (!idx.has(k)) idx.set(k, { mainLine: l.line, impliedOver: l.impliedOver, impliedUnder: l.impliedUnder, oddsOver: l.oddsOver, oddsUnder: l.oddsUnder });
  }
  return idx;
}

function build() {
  if (!existsSync(SHADOW)) return { missing: true };
  const data = loadJSON(SHADOW);
  const recs = data?.records || [];
  const mainIdx = mainLineIndex(DATE);

  const byMarket = {};
  let pid = 0, gid = 0, twoWay = 0, deviggable = 0;
  const players = new Set();
  const ladders = new Map(); // player|market -> [lines]
  const statusCount = {};
  let lower = 0, same = 0, higher = 0, unknownVsMain = 0;
  for (const r of recs) {
    byMarket[r.sourceMarketKey] = (byMarket[r.sourceMarketKey] || 0) + 1;
    if (r.playerId != null) pid++;
    if (r.gameId != null) gid++;
    const tw = r.overOdds != null && r.underOdds != null;
    if (tw) twoWay++;
    if (deVigAlternateLine(r.overOdds, r.underOdds)) deviggable++;
    players.add(r.playerName);
    const lk = `${r.playerName}|${r.market}`;
    (ladders.get(lk) || ladders.set(lk, []).get(lk)).push(r.line);
    statusCount[r.validationStatus] = (statusCount[r.validationStatus] || 0) + 1;
    // compare to main line
    const main = mainIdx.get(`${r.playerName}|${r.market}`);
    const cls = classifyVsMainLine(r.line, main?.mainLine);
    if (cls === "lower") lower++;
    else if (cls === "higher") higher++;
    else if (cls === "same") same++;
    else unknownVsMain++;
  }
  // ladder shape
  const ladderSizes = [...ladders.values()].map((a) => a.length);
  const multiRung = ladderSizes.filter((s) => s >= 2).length;
  // duplicate exact rungs (player|market|line)
  const seen = new Map();
  let dups = 0;
  for (const r of recs) { const k = `${r.playerName}|${r.market}|${r.line}`; seen.set(k, (seen.get(k) || 0) + 1); }
  for (const v of seen.values()) if (v > 1) dups += v - 1;

  // examples
  const exLadder = [...ladders.entries()].filter(([, v]) => v.length >= 3)[0];
  const exBlocked = recs.find((r) => r.validationStatus !== "valid");

  return {
    date: DATE, fetchedAt: data.fetchedAt, creditsSpent: data.creditsSpent, events: data.eventsFetched,
    n: recs.length, byMarket, players: players.size, ladders: ladders.size, multiRung,
    pid, gid, twoWay, deviggable, statusCount, dups,
    lower, same, higher, unknownVsMain,
    exLadder: exLadder ? { key: exLadder[0], lines: [...new Set(exLadder[1])].sort((a, b) => a - b) } : null,
    exBlocked: exBlocked || null,
    recs, mainIdx,
  };
}

function auditMd(a) {
  const m = [];
  m.push("# Alternate Lines — Shadow Fetch Audit (auto-generated)");
  m.push("");
  m.push("> `app/scripts/audit-alternate-lines-shadow.mjs --write-report` · READ-ONLY.");
  m.push("> Source: gitignored shadow cache (NOT public, NOT committed). One approved");
  m.push("> paid MLB spike. No public/optimizer/projection/UI change.");
  m.push("");
  m.push(`## Spike: ${a.date} (fetched ${a.fetchedAt}; **${a.creditsSpent} credits**, ${a.events} events)`);
  m.push("");
  m.push("## Headline finding");
  m.push(`- **Alternate markets EXIST** (${a.n} rungs across ${a.players} players, ${a.ladders} ladders).`);
  m.push(`- **BUT they are ONE-SIDED (Over-only ladders): two-way completeness = ${a.twoWay}/${a.n} → de-viggable = ${a.deviggable}/${a.n}.**`);
  m.push("- MLB alternate batter props are \"N+ hits / N+ total bases\" Over ladders with no paired Under, so the two-way de-vig (impliedOver/(impliedOver+impliedUnder)) cannot be computed for the alternate rungs.");
  m.push("");
  m.push("## Counts");
  m.push(`- records by source market: ${Object.entries(a.byMarket).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  m.push(`- distinct players: ${a.players} · distinct ladders (player|market): ${a.ladders} · multi-rung ladders (≥2): ${a.multiRung}`);
  m.push(`- validationStatus: ${Object.entries(a.statusCount).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  m.push(`- duplicate exact rungs: ${a.dups}`);
  m.push("");
  m.push("## Resolution / completeness");
  m.push(`- playerId resolved (via board join): **${a.pid}/${a.n}** (${Math.round((100 * a.pid) / a.n)}%)`);
  m.push(`- gameId resolved: **${a.gid}/${a.n}** (${Math.round((100 * a.gid) / a.n)}%)`);
  m.push(`- two-way odds: **${a.twoWay}/${a.n}** · de-viggable: **${a.deviggable}/${a.n}**`);
  m.push("");
  m.push("## Main-line comparison (alt rung vs board main line)");
  m.push(`- lower than main: ${a.lower} · same: ${a.same} · higher than main: ${a.higher} · unknown (no board main): ${a.unknownVsMain}`);
  m.push("");
  if (a.exLadder) m.push(`- example ladder: \`${a.exLadder.key}\` lines = [${a.exLadder.lines.join(", ")}]`);
  m.push("");
  m.push("## Grading readiness");
  m.push("- **Gradable: YES (one-sided).** An Over rung settles vs the existing final stat (`actual > line` → hit), exactly like main-line grading — no new stat source needed.");
  m.push("- **De-viggable: NO.** One-sided rungs have no paired Under, so the two-way de-vig (the basis of the hardened launch gate) cannot be computed. Only RAW implied prob (vig-inclusive) is available.");
  m.push("");
  m.push("## Shadow-watchlist eligibility");
  m.push("- **NOT eligible** under the current methodology. The launch gate requires beating the **de-vigged** market with a corrected CI; one-sided alt rungs cannot be de-vigged, so they cannot clear that gate. Using raw (vig-inclusive) implied would be a weaker, biased baseline and is not used as a quality signal.");
  m.push("");
  m.push("## Verdict / recommendation");
  m.push("- **STOP — do not proceed to launch-oriented shadow grading of these alternate lines.** They are one-sided (de-vig blocked). This matches the documented STOP condition (\"provider returns one-sided/unusable lines\").");
  m.push("- Options to revisit later (each its own decision): (a) source a **two-way** alternate feed (paired Under) if the provider offers it for other markets/books; (b) build a one-sided **calibration** method that compares Over-rung hit rate to RAW implied (explicitly weaker, vig-inclusive — not a market-beat claim); (c) use alt rungs only as a **display ladder** (higher line → lower de-vigged-from-main probability → bigger payout) with neutral copy, NOT as a validated edge.");
  m.push("");
  m.push("*Read-only; shadow data is local-only (gitignored). No public/model/data change.*");
  m.push("");
  return m.join("\n");
}

function simMd(a) {
  const m = [];
  m.push("# Alternate Lines — June-4 Shadow Simulation (auto-generated)");
  m.push("");
  m.push("> READ-ONLY · shadow-only · no public output. Documents what the alternate");
  m.push("> ladders WOULD offer; nothing is surfaced or wired.");
  m.push("");
  m.push(`## ${a.date} — ${a.n} alt rungs, ${a.ladders} ladders, ${a.creditsSpent} credits`);
  m.push("");
  m.push("### Why no public change / no launch simulation");
  m.push("- The alt ladders are **one-sided (Over-only)** → **not de-viggable** two-way.");
  m.push("- The hardened launch gate is built on a **de-vigged** market beat; it cannot be applied to one-sided rungs.");
  m.push("- Therefore there is **no de-vig probability ladder** to simulate against, and **no shadow-watchlist candidacy** from alternates today.");
  m.push("");
  m.push("### What IS true (neutral, no claims)");
  m.push("- Alt rungs are **gradable** off the existing final stat.");
  m.push("- For a player, a higher alt line carries longer Over odds (bigger payout, lower probability) and a lower alt line shorter odds — a **payout/probability tradeoff**, expressed as a number, NOT as \"safe\" or \"better\".");
  m.push(`- Main-line comparison: ${a.lower} rungs below the board main line, ${a.higher} above, ${a.same} equal, ${a.unknownVsMain} with no board main.`);
  m.push("");
  m.push("### Example ladders (raw Over implied %, vig-inclusive — NOT de-vigged)");
  // show a few example ladders with raw implied
  const byLadder = new Map();
  for (const r of a.recs) { const k = `${r.playerName}|${r.market}`; (byLadder.get(k) || byLadder.set(k, []).get(k)).push(r); }
  let shown = 0;
  for (const [k, rungs] of byLadder) {
    if (rungs.length < 3 || shown >= 5) continue;
    const sorted = [...rungs].sort((x, y) => x.line - y.line);
    const main = a.mainIdx.get(k);
    m.push(`- **${k}**${main ? ` (board main ${main.mainLine})` : ""}: ` + sorted.map((r) => `${r.line}@${r.overOdds} (raw ${americanToImplied(r.overOdds) != null ? Math.round(100 * americanToImplied(r.overOdds)) + "%" : "—"})`).join(" · "));
    shown++;
  }
  m.push("");
  m.push("### Recommendation");
  m.push("- Do NOT proceed to launch-oriented grading/validation of these alternates (one-sided → de-vig blocked).");
  m.push("- If alternates are desired as a **display** ladder only, that is a separate, neutral-copy UI decision (no edge claim) — not covered here.");
  m.push("");
  m.push("*Shadow-only; no public effect; no fabrication.*");
  m.push("");
  return m.join("\n");
}

const a = build();
if (a.missing) {
  console.log(`No shadow file at ${SHADOW}. Run fetch-alternate-lines-shadow.mjs first.`);
} else {
  console.log(`alt-lines shadow audit ${a.date}: ${a.n} rungs, ${a.ladders} ladders, two-way ${a.twoWay}/${a.n}, deviggable ${a.deviggable}/${a.n}, pid ${a.pid}/${a.n}`);
  console.log(`main-line: lower ${a.lower} same ${a.same} higher ${a.higher} unknown ${a.unknownVsMain} | dups ${a.dups}`);
  if (WRITE) {
    mkdirSync(DOCS, { recursive: true });
    writeFileSync(resolve(DOCS, "alternate-lines-shadow-latest.md"), auditMd(a), "utf8");
    writeFileSync(resolve(DOCS, "alternate-lines-june4-simulation-latest.md"), simMd(a), "utf8");
    console.log("[--write-report] wrote alternate-lines-shadow-latest.md + alternate-lines-june4-simulation-latest.md");
  }
}
