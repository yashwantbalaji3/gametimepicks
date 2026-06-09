/**
 * simulate-selection-policy — card-level backtest of selection policies on
 * SETTLED outcomes. Fully local (no network). Reads the published graded cards
 * (optimizer-graded/<date>.json), which carry real per-leg results, and re-forms
 * cards per lane under a candidate policy, then reports card + leg hit rate.
 *
 * Honesty: only RESTRICTS the already-published leg set (shorter cards, edge
 * caps, odds floors, exposure caps) — the direction every proposed fix takes — so
 * results are not inflated by inventing unseen legs. Re-formation ranks by
 * reliability (recent10 L10, then heavier odds), NEVER by edge (edge is inverted)
 * or confidence (non-predictive). baseline = the actual published cards as-is.
 *
 * Caveats: ~40 cards/lane over 8 days → wide Wilson bounds; reformation assumes
 * the kept legs would still have been offered. Reported, not hidden.
 *
 * Run:
 *   cd app && npx tsx scripts/simulate-selection-policy.mjs --from 2026-06-01 --to 2026-06-08 --policy proposed-combined --write-report
 *   policies: baseline | low-strict-2 | edge-cap-low-med | odds-band-tightening | exposure-caps | proposed-combined
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const LEARN = resolve(DATA, "learning");
const GRADED = resolve(DATA, "parlays", "optimizer-graded");
const argv = process.argv;
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const FROM = arg("--from", "2026-06-01"), TO = arg("--to", "2026-06-08");
const POLICY = arg("--policy", "baseline");
const WRITE = argv.includes("--write-report");
const LANES = ["low", "medium", "high", "longshot"];
const RESTRICTED = new Set(["batter_total_bases", "batter_hits_runs_rbis", "pitcher_strikeouts", "AST"]);

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }
function normRes(r) { r = String(r || "").toLowerCase(); return ["win", "won", "w", "hit"].includes(r) ? "W" : ["loss", "lost", "l", "miss"].includes(r) ? "L" : ["push", "tie"].includes(r) ? "P" : null; }
const z = 1.96;
function wilson(w, n) { if (!n) return [0, 0]; const p = w / n; const a = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n); return [Math.max(0, (p + (z * z) / (2 * n) - a) / (1 + (z * z) / n)), Math.min(1, (p + (z * z) / (2 * n) + a) / (1 + (z * z) / n))]; }
function l10(leg) {
  const s = Array.isArray(leg.recentSeries) ? leg.recentSeries.map(Number).filter(Number.isFinite) : [];
  const line = leg.line, side = String(leg.side || "").toLowerCase();
  if (typeof line !== "number" || s.length < 10 || (side !== "over" && side !== "under")) return null;
  let dec = 0, h = 0; for (const v of s.slice(-10)) { if (v === line) continue; dec++; if (side === "over" ? v > line : v < line) h++; }
  return dec ? h / dec : null;
}
function dateRange(a, b) { const out = []; let d = new Date(a + "T00:00:00Z"); const e = new Date(b + "T00:00:00Z"); while (d <= e) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return out; }

// ---- policy definition ----
function policyRules(name) {
  const base = { maxLegs: { low: 3, medium: 4, high: 5, longshot: 6 }, edgeCapLowMed: Infinity, edgeCapAll: Infinity, lowNoPlusMoney: false, maxRestrictedPerCard: Infinity, maxCardsPerPlayerMarket: Infinity, maxSameGame: Infinity };
  switch (name) {
    case "baseline": return { ...base, _baselineAsPublished: true };
    case "low-strict-2": return { ...base, maxLegs: { ...base.maxLegs, low: 2 } };
    case "edge-cap-low-med": return { ...base, edgeCapLowMed: 15, edgeCapAll: 20 };
    case "odds-band-tightening": return { ...base, lowNoPlusMoney: true };
    case "exposure-caps": return { ...base, maxRestrictedPerCard: 1, maxCardsPerPlayerMarket: 2, maxSameGame: 2 };
    case "proposed-combined": return { ...base, maxLegs: { low: 2, medium: 3, high: 4, longshot: 5 }, edgeCapLowMed: 15, edgeCapAll: 20, lowNoPlusMoney: true, maxRestrictedPerCard: 1, maxCardsPerPlayerMarket: 2, maxSameGame: 2 };
    default: throw new Error(`unknown policy ${name}`);
  }
}

// ---- load published cards ----
const dates = dateRange(FROM, TO);
const byDate = {}; // date -> lane -> [cards]
for (const d of dates) {
  const g = loadJSON(resolve(GRADED, `${d}.json`));
  if (!g || !g.publicRiskSections) continue;
  byDate[d] = {};
  for (const lane of LANES) byDate[d][lane] = ((g.publicRiskSections[lane] || {}).all || []).map((c) => ({
    sameGame: !!c.sameGame,
    legs: (c.legs || []).map((l) => ({ ...l, _r: normRes(l.result), _l10: l_l10(l) })),
  }));
}
function l_l10(l) { return l10(l); }

const rules = policyRules(POLICY);

// ---- simulate one lane-date under the policy ----
function legPasses(leg, lane) {
  const e = leg.edgePct ?? 0;
  if (e >= rules.edgeCapAll) return false;
  if ((lane === "low" || lane === "medium") && e >= rules.edgeCapLowMed) return false;
  if (lane === "low" && rules.lowNoPlusMoney && (leg.oddsForSide ?? -100) >= 100) return false;
  return true;
}
function reliability(leg) { const r = leg._l10; const odds = leg.oddsForSide ?? 0; return (r == null ? 0 : r) * 100 - (odds >= 0 ? odds / 100 : odds / 200); }

const out = { policy: POLICY, from: FROM, to: TO, lanes: {}, overall: { cardW: 0, cardN: 0, legW: 0, legN: 0 }, mix: { market: {}, oddsBand: {}, edgeBucket: {}, restricted: 0, plusMoney: 0, highEdge: 0 }, exposure: { perPlayerMarket: {}, perPlayer: {}, sameGameCards: 0 }, excluded: { wins: 0, losses: 0 } };
const oddsBand = (o) => o == null ? "unknown" : o <= -200 ? "heavy_fav" : o <= -130 ? "favorite" : o < 0 ? "slight_fav" : o < 110 ? "near_even_plus" : "plus_money";
const edgeBucket = (e) => { e = e ?? 0; return e < 0 ? "neg" : e < 5 ? "0-5" : e < 10 ? "5-10" : e < 15 ? "10-15" : e < 20 ? "15-20" : "20+"; };

for (const lane of LANES) {
  const L = { cardW: 0, cardN: 0, legW: 0, legN: 0, legsPerCard: [] };
  const playerMarketCount = {}, playerCount = {};
  for (const d of dates) {
    const cards = (byDate[d] || {})[lane] || [];
    if (rules._baselineAsPublished) {
      for (const c of cards) {
        const decided = c.legs.map((l) => l._r).filter((x) => x === "W" || x === "L");
        const cw = c.legs.some((l) => l._r === "L") ? 0 : (decided.length === c.legs.length && c.legs.length ? 1 : null);
        if (cw != null) { L.cardN++; L.cardW += cw; L.legsPerCard.push(c.legs.length); }
        for (const l of c.legs) { if (l._r === "W" || l._r === "L") { L.legN++; if (l._r === "W") L.legW++; tallyMix(l); } }
        if (c.sameGame) out.exposure.sameGameCards++;
      }
      continue;
    }
    // reform: pool eligible legs, rank by reliability, greedily build cards of maxLegs[lane]
    let pool = [];
    for (const c of cards) for (const l of c.legs) if (legPasses(l, lane)) pool.push({ ...l, _sameGame: c.sameGame });
    pool = pool.filter((l) => l._r === "W" || l._r === "L"); // only decided legs (no pending)
    pool.sort((a, b) => reliability(b) - reliability(a));
    const maxLegs = rules.maxLegs[lane];
    const used = new Set();
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      const card = [i]; used.add(i);
      const games = {}, restr = pool[i].market && RESTRICTED.has(pool[i].market) ? 1 : 0;
      let rcount = restr; const gKey = (l) => l.gameId; games[gKey(pool[i])] = 1;
      for (let j = i + 1; j < pool.length && card.length < maxLegs; j++) {
        if (used.has(j)) continue;
        const l = pool[j];
        const pm = `${l.playerId}|${l.market}`;
        if ((playerMarketCount[pm] || 0) >= rules.maxCardsPerPlayerMarket) continue;
        if (RESTRICTED.has(l.market) && rcount >= rules.maxRestrictedPerCard) continue;
        if ((games[gKey(l)] || 0) >= rules.maxSameGame) continue;
        card.push(j); used.add(j); games[gKey(l)] = (games[gKey(l)] || 0) + 1; if (RESTRICTED.has(l.market)) rcount++;
      }
      if (card.length < 2) break; // need >=2 legs for a parlay
      const legs = card.map((k) => pool[k]);
      for (const l of legs) { const pm = `${l.playerId}|${l.market}`; playerMarketCount[pm] = (playerMarketCount[pm] || 0) + 1; playerCount[l.playerId] = (playerCount[l.playerId] || 0) + 1; }
      const cw = legs.some((l) => l._r === "L") ? 0 : 1;
      L.cardN++; L.cardW += cw; L.legsPerCard.push(legs.length);
      for (const l of legs) { L.legN++; if (l._r === "W") L.legW++; tallyMix(l); }
    }
  }
  L.cardHitRate = L.cardN ? +(L.cardW / L.cardN).toFixed(4) : null;
  L.legHitRate = L.legN ? +(L.legW / L.legN).toFixed(4) : null;
  L.avgLegs = L.legsPerCard.length ? +(L.legsPerCard.reduce((a, b) => a + b, 0) / L.legsPerCard.length).toFixed(2) : null;
  const sorted = L.legsPerCard.slice().sort((a, b) => a - b); L.medianLegs = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const [lo, hi] = wilson(L.cardW, L.cardN); L.cardWilson = [+lo.toFixed(3), +hi.toFixed(3)];
  out.lanes[lane] = L;
  out.overall.cardW += L.cardW; out.overall.cardN += L.cardN; out.overall.legW += L.legW; out.overall.legN += L.legN;
}
function tallyMix(l) {
  out.mix.market[l.market] = (out.mix.market[l.market] || 0) + 1;
  out.mix.oddsBand[oddsBand(l.oddsForSide)] = (out.mix.oddsBand[oddsBand(l.oddsForSide)] || 0) + 1;
  out.mix.edgeBucket[edgeBucket(l.edgePct)] = (out.mix.edgeBucket[edgeBucket(l.edgePct)] || 0) + 1;
  if (RESTRICTED.has(l.market)) out.mix.restricted++;
  if ((l.oddsForSide ?? -100) >= 100) out.mix.plusMoney++;
  if ((l.edgePct ?? 0) >= 15) out.mix.highEdge++;
}
out.overall.cardHitRate = out.overall.cardN ? +(out.overall.cardW / out.overall.cardN).toFixed(4) : null;
out.overall.legHitRate = out.overall.legN ? +(out.overall.legW / out.overall.legN).toFixed(4) : null;

// recommendation
const rec = (() => {
  if (out.overall.cardN < 10) return "needs-more-data";
  return "see-comparison"; // meaningful only vs baseline; the report runner compares
})();
out.recommendation = rec;

const md = `## Simulation: \`${POLICY}\` (${FROM}→${TO})
- overall card hit rate: **${out.overall.cardHitRate != null ? (out.overall.cardHitRate * 100).toFixed(0) + "%" : "n/a"}** (${out.overall.cardW}/${out.overall.cardN}); leg ${out.overall.legHitRate != null ? (out.overall.legHitRate * 100).toFixed(0) + "%" : "n/a"} (${out.overall.legW}/${out.overall.legN})
${LANES.map((ln) => { const L = out.lanes[ln]; return `- **${ln}**: card ${L.cardHitRate != null ? (L.cardHitRate * 100).toFixed(0) + "%" : "n/a"} (${L.cardW}/${L.cardN}, Wilson ${(L.cardWilson[0] * 100).toFixed(0)}-${(L.cardWilson[1] * 100).toFixed(0)}%); leg ${L.legHitRate != null ? (L.legHitRate * 100).toFixed(0) + "%" : "n/a"}; avg legs ${L.avgLegs}`; }).join("\n")}
- exposure: same-game cards ${out.exposure.sameGameCards}; restricted legs ${out.mix.restricted}; plus-money legs ${out.mix.plusMoney}; high-edge(≥15) legs ${out.mix.highEdge}
- odds mix: ${JSON.stringify(out.mix.oddsBand)}
- edge mix: ${JSON.stringify(out.mix.edgeBucket)}
- recommendation: **${rec}** (compare card hit rate vs baseline; small samples → wide Wilson)
`;

console.log(md);
if (WRITE) {
  mkdirSync(DOCS, { recursive: true }); mkdirSync(LEARN, { recursive: true });
  const out_md = resolve(DOCS, "selection-policy-simulation-latest.md");
  writeFileSync(out_md, `# Selection-policy simulation\n\n${md}\n_Card-level backtest on settled outcomes; restrict-only; reformation ranked by reliability not edge. Small samples → wide Wilson bounds._\n`);
  writeFileSync(resolve(LEARN, "selection-simulation-latest.json"), JSON.stringify(out, null, 2));
  console.log("wrote report + json");
}
