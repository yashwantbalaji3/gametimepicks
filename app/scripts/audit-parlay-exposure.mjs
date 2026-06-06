/**
 * audit-parlay-exposure — READ-ONLY exposure / odds-band / L5-trend profile of
 * the DISPLAYED Suggested parlays (the cards a user actually sees, after the
 * official filter + volume discipline). Doubles as the Phase-0 before-snapshot
 * and a regression guard for player/leg concentration + Low-Risk odds policy.
 *
 * Reports per slate:
 *   - displayed cards by risk section
 *   - player / exact-leg / market / game exposure across displayed cards (+ max %)
 *   - odds bands per leg by risk section (heavy_fav … high_plus_money)
 *   - Low-Risk plus-money count (policy: Low should be negative-odds/favorites)
 *   - L5 hit-rate profile of Low-Risk legs (from recentGames)
 * Verdict:
 *   - FAIL if a player exceeds maxPlayerPct of displayed cards, OR an exact leg
 *     exceeds maxLegPct, OR Low Risk contains a plus-money (> +100) leg.
 *   - WARN on softer concentration.
 *
 * Run: cd app && npx tsx scripts/audit-parlay-exposure.mjs --date 2026-06-06 [--write-report]
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
const MAX_PLAYER_PCT = 0.30; // a single player in >30% of displayed cards → FAIL
const MAX_LEG_PCT = 0.25;    // a single exact leg in >25% of displayed cards → FAIL

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }

function oddsBand(o) {
  if (typeof o !== "number") return "unknown";
  if (o <= -200) return "heavy_favorite";
  if (o <= -130) return "favorite";
  if (o <= -105) return "mild_favorite";
  if (o <= 105) return "near_even";
  if (o <= 150) return "plus_money";
  return "high_plus_money";
}
function isPlusMoney(o) { return typeof o === "number" && o > 100; }

function l5HitRate(leg) {
  const rg = Array.isArray(leg.recentGames) ? leg.recentGames.slice(-5) : [];
  const line = leg.line;
  const side = (leg.side || "").toLowerCase();
  if (typeof line !== "number" || rg.length === 0 || (side !== "over" && side !== "under")) return null;
  let dec = 0, hit = 0;
  for (const g of rg) {
    const v = g?.value;
    if (typeof v !== "number" || v === line) continue;
    dec++;
    if (side === "over" ? v > line : v < line) hit++;
  }
  return dec === 0 ? null : { rate: hit / dec, hit, dec };
}

const opt = loadJSON(resolve(DATA, "parlays", "optimizer", `${DATE}.json`));
if (!opt) { console.log(`No optimizer for ${DATE}`); process.exit(0); }
const prs = opt.publicRiskSections || {};

const official = {};
for (const r of RISKS) official[r] = filterOfficialSuggestedSlips(sectionSlipsForSport(prs[r] || {}, "all"));
const disc = applyVolumeDiscipline(official, PUBLIC_VOLUME_CAPS).sections;

const displayedBySection = {};
const allCards = [];
for (const r of RISKS) {
  displayedBySection[r] = (disc[r] || []).length;
  for (const s of disc[r] || []) allCards.push({ risk: r, slip: s });
}
const totalCards = allCards.length;

// exposure
const playerCt = new Map(), legCt = new Map(), marketCt = new Map(), gameCt = new Map(), teamCt = new Map();
const inc = (m, k) => { if (k) m.set(k, (m.get(k) || 0) + 1); };
for (const { slip } of allCards) {
  const players = new Set(), legs = new Set(), markets = new Set(), games = new Set(), teams = new Set();
  for (const lg of slip.legs || []) {
    players.add(lg.playerName || `id:${lg.playerId}`);
    legs.add(`${lg.playerName}|${lg.market}|${lg.side}|${lg.line}`);
    if (lg.market) markets.add(lg.market);
    if (lg.gameId != null) games.add(String(lg.gameId));
    if (lg.team) teams.add(lg.team);
  }
  players.forEach((k) => inc(playerCt, k));
  legs.forEach((k) => inc(legCt, k));
  markets.forEach((k) => inc(marketCt, k));
  games.forEach((k) => inc(gameCt, k));
  teams.forEach((k) => inc(teamCt, k));
}
const topN = (m, n = 10) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const maxPlayer = topN(playerCt, 1)[0] || ["—", 0];
const maxLeg = topN(legCt, 1)[0] || ["—", 0];
const maxPlayerPct = totalCards ? maxPlayer[1] / totalCards : 0;
const maxLegPct = totalCards ? maxLeg[1] / totalCards : 0;

// odds bands per section + Low plus-money + Low L5
const bandsBySection = {};
let lowPlusMoney = [];
const lowL5 = [];
for (const r of RISKS) {
  bandsBySection[r] = {};
  for (const s of disc[r] || []) {
    for (const lg of s.legs || []) {
      const b = oddsBand(lg.oddsForSide);
      bandsBySection[r][b] = (bandsBySection[r][b] || 0) + 1;
      if (r === "low") {
        if (isPlusMoney(lg.oddsForSide)) lowPlusMoney.push(`${lg.playerName} ${lg.market} ${lg.side} ${lg.line} @ ${lg.oddsForSide}`);
        const h = l5HitRate(lg);
        lowL5.push({ p: lg.playerName, m: lg.market, odds: lg.oddsForSide, l5: h ? `${h.hit}/${h.dec}` : "n/a" });
      }
    }
  }
}

const fails = [], warns = [];
if (maxPlayerPct > MAX_PLAYER_PCT) fails.push(`player "${maxPlayer[0]}" appears in ${maxPlayer[1]}/${totalCards} cards (${Math.round(maxPlayerPct * 100)}% > ${MAX_PLAYER_PCT * 100}% cap)`);
if (maxLegPct > MAX_LEG_PCT) fails.push(`exact leg "${maxLeg[0]}" appears in ${maxLeg[1]}/${totalCards} cards (${Math.round(maxLegPct * 100)}% > ${MAX_LEG_PCT * 100}% cap)`);
if (lowPlusMoney.length) fails.push(`Low Risk contains ${lowPlusMoney.length} plus-money (> +100) leg(s): ${lowPlusMoney.slice(0, 5).join(" · ")}`);

const verdict = fails.length ? "FAIL" : warns.length ? "WARN" : "PASS";
console.log(`Parlay exposure ${DATE}: ${verdict} | displayed ${totalCards} (${RISKS.map((r) => `${r} ${displayedBySection[r]}`).join(", ")})`);
console.log(`  max player exposure: ${maxPlayer[0]} ${maxPlayer[1]}/${totalCards} (${Math.round(maxPlayerPct * 100)}%) · max exact-leg: ${maxLeg[1]}/${totalCards} (${Math.round(maxLegPct * 100)}%)`);
console.log(`  top players: ${topN(playerCt, 6).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`  Low odds bands: ${JSON.stringify(bandsBySection.low)} · Low plus-money legs: ${lowPlusMoney.length}`);
console.log(`  High odds bands: ${JSON.stringify(bandsBySection.high)} · Longshot: ${JSON.stringify(bandsBySection.longshot)}`);
console.log(`  Low L5: ${lowL5.map((x) => `${x.p}(${x.l5}@${x.odds})`).join(" · ")}`);
for (const f of fails) console.log(`  [FAIL] ${f}`);
for (const w of warns) console.log(`  [WARN] ${w}`);

if (WRITE) {
  const m = [];
  m.push(`# Parlay Exposure / Odds / Trend Audit — ${DATE} (auto-generated)`);
  m.push("");
  m.push("> `audit-parlay-exposure.mjs --write-report` · READ-ONLY · no paid API · no data/model change.");
  m.push(`> FAIL if one player > ${MAX_PLAYER_PCT * 100}% of displayed cards, one exact leg > ${MAX_LEG_PCT * 100}%, or Low Risk has a plus-money (> +100) leg.`);
  m.push("");
  m.push(`## Verdict: ${verdict} — displayed ${totalCards} cards`);
  m.push(`- by section: ${RISKS.map((r) => `${r} ${displayedBySection[r]}`).join(", ")}`);
  m.push(`- max player exposure: **${maxPlayer[0]} ${maxPlayer[1]}/${totalCards} (${Math.round(maxPlayerPct * 100)}%)**`);
  m.push(`- max exact-leg exposure: ${maxLeg[1]}/${totalCards} (${Math.round(maxLegPct * 100)}%)`);
  m.push("");
  m.push("### Top players by exposure");
  for (const [k, v] of topN(playerCt, 10)) m.push(`- ${k}: ${v} card(s) (${Math.round((v / totalCards) * 100)}%)`);
  m.push("");
  m.push("### Odds bands by section");
  m.push("| section | bands |"); m.push("|---|---|");
  for (const r of RISKS) m.push(`| ${r} | ${JSON.stringify(bandsBySection[r])} |`);
  m.push("");
  m.push(`### Low-Risk plus-money legs: ${lowPlusMoney.length}`);
  for (const x of lowPlusMoney) m.push(`- ${x}`);
  m.push("");
  m.push("### Low-Risk L5 hit rates");
  for (const x of lowL5) m.push(`- ${x.p} · ${x.m} · ${x.odds} · L5 ${x.l5}`);
  m.push("");
  for (const f of fails) m.push(`- FAIL: ${f}`);
  for (const w of warns) m.push(`- WARN: ${w}`);
  m.push("");
  m.push("*Read-only; no change to data/model/grading.*");
  mkdirSync(DOCS, { recursive: true });
  writeFileSync(resolve(DOCS, "parlay-exposure-latest.md"), m.join("\n"), "utf8");
  console.log("[--write-report] wrote parlay-exposure-latest.md");
}
process.exit(verdict === "FAIL" ? 1 : 0);
