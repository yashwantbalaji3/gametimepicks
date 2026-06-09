/**
 * update-selection-learning — DAILY learning loop (runs AFTER settlement).
 *
 * Reads ONLY settled outcomes (never current-day pending) and the published
 * graded cards, computes per-segment performance with Wilson lower bounds +
 * small-sample shrinkage, and emits a CONSERVATIVE, FAIL-CLOSED selection-policy
 * artifact the optimizer can later read. It does NOT modify the optimizer or
 * publish anything — it only writes a recommendation artifact + a report.
 *
 * Guardrails (Phase 4): min sample before any change; Wilson LB (not raw rate);
 * shrink small samples toward the universe baseline; downgrades faster than
 * upgrades; can never lengthen cards beyond hard maxima, allow banned/unsupported
 * markets, put stale/missing form in Low/Bank, allow odds-only NBA, or override
 * UFC fail-closed. If evidence is insufficient, sets noLiveWire=true so the
 * optimizer keeps its conservative static fallback.
 *
 * Run:
 *   cd app && npx tsx scripts/update-selection-learning.mjs --through-date 2026-06-08 --write-report
 *   npx tsx scripts/update-selection-learning.mjs --window 8 --write-report
 *   npx tsx scripts/update-selection-learning.mjs --dry-run
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const LEARN = resolve(DATA, "learning");
const GRADED = resolve(DATA, "parlays", "optimizer-graded");
const SETTLED = resolve(DATA, "mlb", "results", "settled_leans.jsonl");

const argv = process.argv;
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const WINDOW = parseInt(arg("--window", "8"), 10);
const WRITE = argv.includes("--write-report");
const DRY = argv.includes("--dry-run");

const POLICY_VERSION = 1;
// Thresholds (Phase 4 starting points). Wilson LB drives every status.
const MIN_N_ALLOWED = 40, MIN_N_RESTRICTED = 20;
const WLB_ALLOWED = 0.52, WLB_RESTRICTED = 0.47, WLB_HIGHRISK = 0.43;
const HARD_MAX_LEGS = { low: 2, medium: 3, high: 3, longshot: 3 }; // never exceed
const BANK_MAX_LEGS = 2;

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }
const z = 1.96;
function wilsonLB(w, n) {
  if (!n) return 0;
  const p = w / n;
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / (1 + (z * z) / n);
}
function normRes(r) {
  r = String(r || "").toLowerCase();
  if (["win", "won", "w", "hit", "true"].includes(r)) return "W";
  if (["loss", "lost", "l", "miss", "false"].includes(r)) return "L";
  if (["push", "tie", "void"].includes(r)) return "P";
  return null; // pending / unknown → excluded, never a loss
}
function datesInWindow(through) {
  const out = [];
  const end = new Date(through + "T00:00:00Z");
  for (let i = 0; i < WINDOW; i++) {
    const d = new Date(end); d.setUTCDate(end.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out.sort();
}

// ---- determine through-date = latest settled date present ----
let through = arg("--through-date", null);
if (!through) {
  const dates = new Set();
  for (const line of readFileSync(SETTLED, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const d = JSON.parse(line); if (d.date) dates.add(d.date); } catch {}
  }
  through = [...dates].sort().slice(-1)[0];
}
const WIN = datesInWindow(through);
const WIN_SET = new Set(WIN);

// ---- load settled universe (results only; pending excluded) ----
const universe = [];
for (const line of readFileSync(SETTLED, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let d; try { d = JSON.parse(line); } catch { continue; }
  if (!WIN_SET.has(d.date)) continue;
  const r = normRes(d.outcome);
  if (r) universe.push({ ...d, _r: r });
}

// ---- load published graded cards in window ----
const pubLegs = [], pubCards = [];
for (const date of WIN) {
  const g = loadJSON(resolve(GRADED, `${date}.json`));
  if (!g || !g.publicRiskSections) continue;
  for (const lane of ["low", "medium", "high", "longshot"]) {
    const cards = (g.publicRiskSections[lane] || {}).all || [];
    for (const c of cards) {
      const legs = c.legs || [];
      const legRes = legs.map((l) => normRes(l.result));
      const decided = legRes.filter((x) => x === "W" || x === "L");
      const cardR = legRes.includes("L") ? "L" : (decided.length === legs.length && legs.length ? "W" : null);
      pubCards.push({ date, lane, nLegs: legs.length, sameGame: !!c.sameGame, _r: cardR,
        restrictedLegs: legs.filter((l) => l.isVolatileMlb || ["batter_total_bases", "batter_hits_runs_rbis", "pitcher_strikeouts", "AST"].includes(l.market)).length });
      for (let i = 0; i < legs.length; i++) {
        const l = legs[i], r = legRes[i];
        if (r === "W" || r === "L") pubLegs.push({ ...l, lane, date, _r: r });
      }
    }
  }
}

// ---- segment helper ----
function agg(rows, keyFn) {
  const m = {};
  for (const x of rows) {
    const k = keyFn(x); if (k == null) continue;
    (m[k] ||= { wins: 0, losses: 0, n: 0 });
    if (x._r === "W") m[k].wins++; else if (x._r === "L") m[k].losses++;
    if (x._r === "W" || x._r === "L") m[k].n++;
  }
  for (const k of Object.keys(m)) {
    const s = m[k]; s.hitRate = s.n ? +(s.wins / s.n).toFixed(4) : null;
    s.wilsonLB = +wilsonLB(s.wins, s.n).toFixed(4);
  }
  return m;
}
const oddsBand = (o) => o == null ? "unknown" : o <= -200 ? "heavy_fav" : o <= -130 ? "favorite" : o < 0 ? "slight_fav" : o < 110 ? "near_even_plus" : "plus_money";
const edgeBucket = (e) => { e = e ?? 0; return e < 0 ? "neg" : e < 5 ? "0-5" : e < 10 ? "5-10" : e < 15 ? "10-15" : e < 20 ? "15-20" : "20+"; };
const formBucket = (n) => (n ?? 0) >= 8 ? "full(>=8)" : (n ?? 0) >= 5 ? "partial(5-7)" : "thin(<5)";

const baseline = (() => { const w = universe.filter((x) => x._r === "W").length; return universe.length ? w / universe.length : 0.5; })();

// Universe (broad sample) + published (product) segments
const seg = {
  universe_byMarket: agg(universe, (x) => x.marketKey),
  universe_byConfidence: agg(universe, (x) => x.confidence),
  universe_byEdgeBucket: agg(universe, (x) => edgeBucket(x.edgePct)),
  universe_byRole: agg(universe, (x) => x.playerRole),
  published_byRiskLane: agg(pubLegs, (x) => x.lane),
  published_byMarket: agg(pubLegs, (x) => x.market),
  published_byOddsBand: agg(pubLegs, (x) => oddsBand(x.oddsForSide)),
  published_byEdgeBucket: agg(pubLegs, (x) => edgeBucket(x.edgePct)),
  published_byRecentForm: agg(pubLegs, (x) => formBucket(x.recent10Count)),
  published_byCardLength: agg(pubCards, (x) => `${x.nLegs}-leg`),
  published_cardsByLane: agg(pubCards, (x) => x.lane),
};

// ---- recommended market status (FAIL-CLOSED, Wilson-driven, shrunk) ----
function shrink(w, n) { const k = 20; return (w + baseline * k) / (n + k); } // toward universe baseline
// Baseline-relative AND Wilson-floored. Window size shifts absolute Wilson bounds,
// so anchor "allowed/disabled" to distance-from-universe-baseline and use the
// Wilson LB only as a hard floor. Fail-closed: ambiguous → the tighter status.
function recommendStatus(s) {
  if (!s || s.n < MIN_N_RESTRICTED) return "insufficient_sample";
  const wlb = s.wilsonLB, rate = s.hitRate, sh = shrink(s.wins, s.n);
  // clearly below the market it's priced in, or Wilson floor catastrophic → disabled
  if (sh < baseline - 0.04 || wlb < WLB_HIGHRISK) return "disabled";
  // clearly above baseline + adequate sample + Wilson not below break-even → allowed
  if (sh >= baseline + 0.03 && s.n >= MIN_N_ALLOWED && wlb >= 0.495) return "allowed";
  // around/above baseline → usable only with the player-consistency gate
  if (sh >= baseline - 0.01) return "restricted";
  return "high_risk_only";
}
const marketRecs = {};
for (const mk of new Set([...Object.keys(seg.universe_byMarket)])) {
  const s = seg.universe_byMarket[mk];
  marketRecs[mk] = { ...s, shrunk: +shrink(s.wins, s.n).toFixed(4), recommendedStatus: recommendStatus(s) };
}
// Inverted-edge detection
const eb = seg.universe_byEdgeBucket;
const invertedEdge = (eb["15-20"]?.wilsonLB ?? 1) < (eb["0-5"]?.hitRate ?? 0) || (eb["20+"]?.hitRate ?? 1) < baseline;
// Confidence predictive?
const cv = Object.values(seg.universe_byConfidence).map((s) => s.hitRate).filter((x) => x != null);
const confSpread = cv.length ? Math.max(...cv) - Math.min(...cv) : 0;
const confidencePredictive = confSpread >= 0.05;

const warnings = [];
const totalDecided = universe.length;
if (totalDecided < 200) warnings.push(`small training universe (${totalDecided} legs) — policy stays conservative`);
if (invertedEdge) warnings.push("edge signal is INVERTED at high values — edge capped, not used to promote");
if (!confidencePredictive) warnings.push(`confidence non-predictive (spread ${(confSpread * 100).toFixed(1)}pts) — excluded from ranking`);
for (const mk of Object.keys(marketRecs)) if (marketRecs[mk].recommendedStatus === "insufficient_sample") warnings.push(`market ${mk}: insufficient sample (${marketRecs[mk].n})`);

const noLiveWire = totalDecided < 200 || pubLegs.length < 30;

// ---- the conservative recommended policy ----
const policy = {
  policyVersion: POLICY_VERSION,
  generatedAt: null, // stamped by caller/commit; kept null to stay deterministic for resume
  latestSettledDate: through,
  trainingWindowStart: WIN[0],
  trainingWindowEnd: WIN[WIN.length - 1],
  trainingWindowDays: WINDOW,
  sampleSizes: { universeLegs: universe.length, publishedLegs: pubLegs.length, publishedCards: pubCards.length },
  universeBaselineHitRate: +baseline.toFixed(4),
  noLiveWire,
  // hard, non-overridable guards the optimizer must always enforce
  hardGuards: {
    maxLegsByLane: HARD_MAX_LEGS,
    bankBuilderMaxLegs: BANK_MAX_LEGS,
    bankBuilderHeavyFavoriteOnly: true,
    lowNoPlusMoney: true,
    lowOddsFloor: -130,
    maxRestrictedLegsPerCard: 1,
    excludeEdgePctFromLowMedium: 15,
    excludeEdgePctAll: 20,
    nbaRequiresRealStatsProvider: true,
    ufcFailClosed: true,
    staleFormBlockedFromLowBank: true,
    confidenceUsedForRanking: false,
  },
  recommendedMarketStatus: marketRecs,
  calibration: {
    edgeInverted: invertedEdge,
    confidencePredictive,
    confidenceSpread: +confSpread.toFixed(4),
    byEdgeBucket: seg.universe_byEdgeBucket,
    byConfidence: seg.universe_byConfidence,
  },
  segments: seg,
  warnings,
  notes: "Recommendation artifact only. Optimizer reads this in a later PR; until then it documents policy. Fail-closed: if noLiveWire, optimizer keeps its static conservative policy.",
};

// ---- card-length parlay-math projection (decision support) ----
const laneLeg = seg.published_byRiskLane;
const cardProjection = {};
for (const lane of ["low", "medium", "high", "longshot"]) {
  const lr = laneLeg[lane]?.hitRate;
  if (lr == null) continue;
  cardProjection[lane] = {
    legHitRate: lr,
    proj2leg: +(lr ** 2).toFixed(3),
    proj3leg: +(lr ** 3).toFixed(3),
    currentMaxLegsRec: HARD_MAX_LEGS[lane],
  };
}
policy.cardLengthProjection = cardProjection;

// ---- write artifact + report ----
function pct(s) { return s && s.hitRate != null ? `${(s.hitRate * 100).toFixed(0)}% (${s.wins}/${s.n}, WLB ${(s.wilsonLB * 100).toFixed(0)}%)` : "n/a"; }
const report = `# Daily selection learning — through ${through}

Training window: **${WIN[0]} → ${WIN[WIN.length - 1]}** (${WINDOW}d). Universe legs:
**${universe.length}** (baseline ${(baseline * 100).toFixed(1)}%). Published legs:
**${pubLegs.length}**, cards: **${pubCards.length}**. noLiveWire=**${noLiveWire}**.

## Recommended market status (Wilson-LB driven, fail-closed)
${Object.entries(marketRecs).sort((a, b) => b[1].n - a[1].n).map(([m, s]) => `- **${m}** → \`${s.recommendedStatus}\` — ${pct(s)} shrunk ${(s.shrunk * 100).toFixed(0)}%`).join("\n")}

## Calibration
- Edge inverted at high values: **${invertedEdge}** ${Object.entries(seg.universe_byEdgeBucket).map(([k, s]) => `${k}:${pct(s)}`).join(" · ")}
- Confidence predictive: **${confidencePredictive}** (spread ${(confSpread * 100).toFixed(1)}pts) ${Object.entries(seg.universe_byConfidence).map(([k, s]) => `${k}:${pct(s)}`).join(" · ")}

## Published leg hit rate by lane
${Object.entries(seg.published_byRiskLane).map(([k, s]) => `- ${k}: ${pct(s)}`).join("\n")}

## Card length (parlay-math projection from observed leg rate)
${Object.entries(cardProjection).map(([k, v]) => `- ${k}: leg ${(v.legHitRate * 100).toFixed(0)}% → 2-leg ~${(v.proj2leg * 100).toFixed(0)}%, 3-leg ~${(v.proj3leg * 100).toFixed(0)}% (rec max ${v.currentMaxLegsRec})`).join("\n")}

## Warnings
${warnings.map((w) => `- ${w}`).join("\n") || "- none"}

_Recommendation artifact only — no production logic changed by this script._
`;

if (DRY) {
  console.log(report);
  console.log("\n[dry-run] would write:", resolve(LEARN, "selection-policy-latest.json"));
} else {
  mkdirSync(LEARN, { recursive: true });
  const json = JSON.stringify(policy, null, 2);
  writeFileSync(resolve(LEARN, "selection-policy-latest.json"), json);
  writeFileSync(resolve(LEARN, `selection-policy-${through}.json`), json);
  console.log("wrote", resolve(LEARN, "selection-policy-latest.json"));
  if (WRITE) { mkdirSync(DOCS, { recursive: true }); writeFileSync(resolve(DOCS, "daily-selection-learning-latest.md"), report); console.log("wrote report"); }
}
console.log(`\nthrough=${through} universe=${universe.length} pubLegs=${pubLegs.length} noLiveWire=${noLiveWire} edgeInverted=${invertedEdge} confPredictive=${confidencePredictive}`);
