/**
 * shadow-parlay-methodology-v2 — READ-ONLY, deterministic shadow audit of the
 * proposed Suggested Parlay Methodology v2 (effective 2026-06-02).
 *
 * WHAT THIS DOES (and does NOT do):
 *   - Reads only. Never writes generated data; never mutates app/public/data.
 *   - Deterministic: no Date.now / Math.random; fixed slate lists.
 *   - Evaluates the v2 rules (L5/L10 leg quality + per-section odds caps +
 *     daily targets) against REAL data:
 *       * June-2 active optimizer/board for candidate AVAILABILITY (no outcomes
 *         — June 2 is unsettled; included for settled analysis only if a graded
 *         file exists at run time).
 *       * Settled public-era slates (2026-05-27 .. 2026-06-01) for historical
 *         outcome analysis. May 25/26 are EXCLUDED (banned public-rate dates).
 *
 * THE CRITICAL DATA FACT THIS AUDIT IS BUILT ON
 * ---------------------------------------------
 * The `recentSeries` persisted on optimizer / snapshot / publicRiskSections /
 * graded legs is `full_season_series[:10]` — i.e. the OLDEST 10 games for any
 * player with >10 games (≈88% of June-2 MLB legs). The projection model itself
 * uses the recent TAIL (series[-3:]/[-10:]) correctly, but the optimizer keeps
 * the wrong end. So "recent form" computed from the published `recentSeries`
 * fields is NOT recent for most legs.
 *
 * Therefore this audit sources TRUE recent form from the BOARD files
 * (app/public/data/mlb/boards/<date>.json -> leans[].recentSeries), which carry
 * the FULL season series in chronological (oldest -> newest) order. True L5 =
 * series.slice(-5); true L10 = series.slice(-10). For MLB the ordering is
 * verified (model takes the tail as recent). For NBA the board ordering is
 * UNVERIFIED here, so NBA legs FAIL CLOSED for L5/L10 eligibility (counted in
 * raw availability, excluded from eligibility) — June 2 is MLB-only anyway.
 *
 * Hit semantics mirror app/src/lib/recent-form.ts::legL10HitRate:
 *   over  -> value > line is a hit; under -> value < line is a hit;
 *   value == line is a push. For the strict "X/5" / "8/10" tests a push counts
 *   as a NON-hit within the fixed window (you can't go 5/5 if a game pushed).
 *
 * Run: cd app && npx tsx scripts/shadow-parlay-methodology-v2.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");

// ---------------------------------------------------------------------------
// Config — fixed, deterministic slate lists.
// ---------------------------------------------------------------------------
const SETTLED_PUBLIC_DATES = [
  "2026-05-27",
  "2026-05-28",
  "2026-05-29",
  "2026-05-30",
  "2026-06-01",
]; // May 25/26 excluded (banned). 05-31 has no graded file (gap).
const ACTIVE_DATE = "2026-06-02"; // unsettled at handoff — availability only.

// v2 odds cap for Low Risk: every leg must be <= -150 (heavier favorites).
const LOW_MAX_AMERICAN = -150;

// #241 live volume-discipline caps (app/src/lib/parlay-volume-discipline.ts).
const CAPS_241 = { player: 2, game: 3, market: 4, perSection: { low: 3, medium: 3, high: 2, longshot: 1 }, totalMax: 9 };
// A relaxed cap set, used ONLY to show the underlying eligible-leg headroom
// (NOT a recommendation to ship these caps).
const CAPS_RELAXED = { player: 4, game: 6, market: 12, perSection: { low: 5, medium: 5, high: 3, longshot: 3 }, totalMax: 16 };

// v2 daily targets (targets only — never padded).
const TARGETS = { low: 5, medium: 5, high: 3, longshot: 3 };
// Preferred legs-per-card per section.
const LEGS_PER_CARD = { low: 2, medium: 3, high: 4, longshot: 5 };

// ---------------------------------------------------------------------------
// Small helpers (mirror lib semantics; kept inline so the audit is
// self-contained and never imports/mutates app code).
// ---------------------------------------------------------------------------
function loadJSON(absPath) {
  try {
    return JSON.parse(readFileSync(absPath, "utf8"));
  } catch {
    return null;
  }
}
const optimizerPath = (d) => resolve(DATA, "parlays", "optimizer", `${d}.json`);
const gradedPath = (d) => resolve(DATA, "parlays", "optimizer-graded", `${d}.json`);
const boardPath = (d) => resolve(DATA, "mlb", "boards", `${d}.json`);

/** Classify one recent value against a line+side: "hit" | "miss" | "push". */
function classify(value, line, side) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value === line) return "push";
  const s = (side ?? "").toLowerCase();
  if (s === "over") return value > line ? "hit" : "miss";
  if (s === "under") return value < line ? "hit" : "miss";
  return null;
}

/** Sport-aware "most recent N games" window from a FULL board series.
 *  MLB series are oldest->newest (verified) so recent = tail. NBA ordering is
 *  unverified -> returns null (fail closed). Returns the windowed value array
 *  or null when the sport is unverified or there aren't N games. */
function recentWindow(fullSeries, n, sport) {
  if (!Array.isArray(fullSeries)) return null;
  const s = fullSeries.map(Number).filter((v) => Number.isFinite(v));
  if ((sport ?? "").toLowerCase() !== "mlb") return null; // fail closed (NBA etc.)
  if (s.length < n) return null;
  return s.slice(-n);
}

/** Strict window hit-count {hits, push, miss, n} for a fixed N-game window, or
 *  null when the window can't be formed. Pushes are NON-hits within the window. */
function windowHits(fullSeries, n, line, side, sport) {
  const w = recentWindow(fullSeries, n, sport);
  if (w == null) return null;
  let hits = 0;
  let push = 0;
  for (const v of w) {
    const c = classify(v, line, side);
    if (c === "hit") hits++;
    else if (c === "push") push++;
  }
  return { n, hits, push, miss: n - hits - push };
}

/** odds <= -150 (allowed: -150,-160,-175,-200; disallowed: -149,-120,+100). */
function oddsAtMostMinus150(o) {
  return typeof o === "number" && Number.isFinite(o) && o <= LOW_MAX_AMERICAN;
}

/** Combined American odds from per-leg American prices (mirror
 *  parlay-risk-sections.ts::combinedAmericanOddsFromLegs). null if any missing. */
function combinedAmerican(prices) {
  if (!prices.length) return null;
  let dec = 1;
  for (const o of prices) {
    if (typeof o !== "number" || !Number.isFinite(o) || o === 0) return null;
    dec *= o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o);
  }
  if (dec >= 2) return Math.round((dec - 1) * 100);
  if (dec > 1) return -Math.round(100 / (dec - 1));
  return 0;
}

const pct = (w, n) => (n > 0 ? `${Math.round((100 * w) / n)}%` : "—");
const pad = (s, n) => String(s).padStart(n);
const padE = (s, n) => String(s).padEnd(n);
function hr(title) {
  console.log("\n" + "=".repeat(74));
  console.log(title);
  console.log("=".repeat(74));
}

// ---------------------------------------------------------------------------
// Board index: (playerId|market) -> full season recentSeries.
// ---------------------------------------------------------------------------
function buildBoardIndex(date) {
  const board = loadJSON(boardPath(date));
  const idx = new Map();
  if (!board || !Array.isArray(board.leans)) return idx;
  for (const lean of board.leans) {
    const pid = lean.playerId;
    const mkt = lean.marketKey || lean.market;
    const rs = lean.recentSeries;
    if (pid == null || !mkt || !Array.isArray(rs) || rs.length === 0) continue;
    const key = `${pid}|${mkt}`;
    if (!idx.has(key)) idx.set(key, rs);
  }
  return idx;
}

/** Enrich a leg with TRUE form fields from the board full series. */
function enrichLeg(leg, boardIdx) {
  const pid = leg.playerId;
  const mkt = leg.market || leg.marketKey;
  const sport = (leg.sport ?? "mlb").toLowerCase();
  const line = typeof leg.line === "number" ? leg.line : null;
  const side = leg.side;
  const full = pid != null && mkt ? boardIdx.get(`${pid}|${mkt}`) ?? null : null;
  const len = Array.isArray(full) ? full.length : 0;
  const l5 = line != null ? windowHits(full, 5, line, side, sport) : null;
  const l10 = line != null ? windowHits(full, 10, line, side, sport) : null;
  return { ...leg, sport, line, _fullLen: len, _full: full, _l5: l5, _l10: l10 };
}

// v2 eligibility predicates (operate on enriched legs).
const isLowEligible = (l) => l._l5 != null && l._l5.hits === 5 && oddsAtMostMinus150(l.oddsForSide);
const isMedHiLsEligible = (l) => l._l5 != null && l._l5.hits >= 4; // 4/5 or 5/5
const isBankEligible = (l) => l._l10 != null && l._l10.hits >= 8; // 8/10+
const has5 = (l) => l._fullLen >= 5;
const has10 = (l) => l._fullLen >= 10;

// ---------------------------------------------------------------------------
// PHASE A — Leg availability per slate (true form, MLB).
// ---------------------------------------------------------------------------
function legAvailability(legs) {
  const a = {
    total: legs.length,
    mlb: 0,
    nba: 0,
    withFull5: 0,
    withFull10: 0,
    nbaUnverified: 0,
    l5_5of5: 0,
    l5_4of5: 0,
    l5_3of5: 0,
    l5_2orWorse: 0,
    l5_missing: 0,
    l10_10: 0,
    l10_9: 0,
    l10_8: 0,
    l10_7: 0,
    l10_6orWorse: 0,
    l10_missing: 0,
    odds_le_m200: 0,
    odds_m199_m150: 0,
    odds_m149_m101: 0,
    odds_evenPlus: 0,
    lowEligible: 0,
    medHiLsEligible: 0,
    bankEligible: 0,
    byMarket: {},
  };
  for (const l of legs) {
    const sp = (l.sport ?? "mlb").toLowerCase();
    if (sp === "mlb") a.mlb++;
    else if (sp === "nba") {
      a.nba++;
      a.nbaUnverified++;
    }
    if (has5(l)) a.withFull5++;
    if (has10(l)) a.withFull10++;
    // L5 buckets
    if (l._l5 == null) a.l5_missing++;
    else if (l._l5.hits === 5) a.l5_5of5++;
    else if (l._l5.hits === 4) a.l5_4of5++;
    else if (l._l5.hits === 3) a.l5_3of5++;
    else a.l5_2orWorse++;
    // L10 buckets
    if (l._l10 == null) a.l10_missing++;
    else if (l._l10.hits === 10) a.l10_10++;
    else if (l._l10.hits === 9) a.l10_9++;
    else if (l._l10.hits === 8) a.l10_8++;
    else if (l._l10.hits === 7) a.l10_7++;
    else a.l10_6orWorse++;
    // odds buckets
    const o = l.oddsForSide;
    if (typeof o === "number" && Number.isFinite(o)) {
      if (o <= -200) a.odds_le_m200++;
      else if (o <= -150) a.odds_m199_m150++;
      else if (o <= -101) a.odds_m149_m101++;
      else a.odds_evenPlus++;
    }
    // eligibility
    if (isLowEligible(l)) a.lowEligible++;
    if (isMedHiLsEligible(l)) a.medHiLsEligible++;
    if (isBankEligible(l)) a.bankEligible++;
    // by market
    const mk = l.market || l.marketKey || "?";
    a.byMarket[mk] = a.byMarket[mk] || { total: 0, lowElig: 0, medElig: 0 };
    a.byMarket[mk].total++;
    if (isLowEligible(l)) a.byMarket[mk].lowElig++;
    if (isMedHiLsEligible(l)) a.byMarket[mk].medElig++;
  }
  return a;
}

function printAvailabilityTable(label, a) {
  console.log(`\n[${label}]  total legs=${a.total}  (mlb=${a.mlb}, nba=${a.nba} [L5 fail-closed: ${a.nbaUnverified}])`);
  console.log(`  recentSeries length >=5: ${a.withFull5}   >=10: ${a.withFull10}`);
  console.log("  " + padE("Metric", 26) + pad("Count", 8));
  const rows = [
    ["L5 5/5", a.l5_5of5],
    ["L5 4/5", a.l5_4of5],
    ["L5 3/5", a.l5_3of5],
    ["L5 2/5 or worse", a.l5_2orWorse],
    ["L5 missing/insufficient", a.l5_missing],
    ["L10 10/10", a.l10_10],
    ["L10 9/10", a.l10_9],
    ["L10 8/10", a.l10_8],
    ["L10 7/10", a.l10_7],
    ["L10 6/10 or worse", a.l10_6orWorse],
    ["L10 missing/insufficient", a.l10_missing],
    ["odds <= -200", a.odds_le_m200],
    ["odds -199..-150", a.odds_m199_m150],
    ["odds -149..-101", a.odds_m149_m101],
    ["odds even/+", a.odds_evenPlus],
    ["Low eligible (5/5 & <=-150 & len>=5)", a.lowEligible],
    ["Medium eligible (4/5+)", a.medHiLsEligible],
    ["High/Longshot eligible (4/5+)", a.medHiLsEligible],
    ["Bank Builder eligible (L10 8/10+)", a.bankEligible],
  ];
  for (const [k, v] of rows) console.log("  " + padE(k, 38) + pad(v, 8));
  console.log("  by market (total / low-elig / med-elig):");
  for (const [mk, m] of Object.entries(a.byMarket).sort((x, y) => y[1].total - x[1].total)) {
    console.log("    " + padE(mk, 26) + pad(m.total, 5) + " /" + pad(m.lowElig, 5) + " /" + pad(m.medElig, 5));
  }
}

// ---------------------------------------------------------------------------
// PHASE B — v2 construction feasibility (greedy, heuristic) under shared caps.
// ---------------------------------------------------------------------------
function legSig(l) {
  return l.leanId || `${l.playerId}|${l.market}|${l.line}|${l.side}`;
}

/** Greedy card builder with a SHARED global exposure ledger across sections,
 *  mirroring the #241 discipline (player/game/market exposure caps + per-section
 *  + total caps). Returns per-section card counts + exposure usage. Heuristic
 *  lower bound — labelled as such; not the production selector. */
function buildSlate(enrichedLegs, caps, targets) {
  const pUse = new Map();
  const gUse = new Map();
  const mUse = new Map();
  const cnt = (m, k) => m.get(k) || 0;
  const inc = (m, k) => m.set(k, cnt(m, k) + 1);
  const seen = new Set();
  let total = 0;
  const sectionCards = { low: [], medium: [], high: [], longshot: [] };
  const order = ["low", "medium", "high", "longshot"];

  const poolFor = (section) => {
    const base = section === "low" ? enrichedLegs.filter(isLowEligible) : enrichedLegs.filter(isMedHiLsEligible);
    // deterministic order: best form first, then heavier favorite, then id.
    return [...base].sort((a, b) => {
      const fa = (a._l5?.hits ?? 0) - (b._l5?.hits ?? 0);
      if (fa) return -fa;
      const oa = (a.oddsForSide ?? 0) - (b.oddsForSide ?? 0);
      if (oa) return oa; // more negative (heavier favorite) first
      return legSig(a) < legSig(b) ? -1 : 1;
    });
  };

  for (const section of order) {
    const legsPer = LEGS_PER_CARD[section];
    const pool = poolFor(section);
    const sectionCap = caps.perSection[section];
    let guard = 0;
    let offset = 0; // rotate the scan start so we build DISTINCT cards, not the
    // same top-N pair every time (avoids a degenerate single-card stop).
    while (
      sectionCards[section].length < sectionCap &&
      sectionCards[section].length < targets[section] * 4 &&
      total < caps.totalMax &&
      guard < 20000
    ) {
      guard++;
      const chosen = [];
      const playersThisCard = new Set();
      const gamesThisCard = new Set();
      // scan the pool starting at a rotating offset (wrap-around) so successive
      // cards draw from different legs.
      for (let t = 0; t < pool.length && chosen.length < legsPer; t++) {
        const leg = pool[(offset + t) % pool.length];
        if (playersThisCard.has(leg.playerId)) continue; // no dup player within a card
        if (cnt(pUse, leg.playerId) >= caps.player) continue;
        if (cnt(gUse, leg.gameId) >= caps.game) continue;
        if (cnt(mUse, leg.market) >= caps.market) continue;
        chosen.push(leg);
        playersThisCard.add(leg.playerId);
        gamesThisCard.add(leg.gameId);
      }
      if (chosen.length < legsPer) break; // can't form a full card -> exposure/leg bottleneck
      const sig = chosen.map(legSig).sort().join("+");
      if (seen.has(sig)) {
        offset++;
        if (offset >= pool.length) break; // exhausted distinct rotations -> stop
        continue;
      }
      seen.add(sig);
      for (const l of chosen) {
        inc(pUse, l.playerId);
        inc(gUse, l.gameId);
        inc(mUse, l.market);
      }
      sectionCards[section].push({ legs: chosen, singleGame: gamesThisCard.size === 1 });
      total++;
      offset++; // advance so the next card starts elsewhere
    }
  }
  const maxOf = (m) => (m.size ? Math.max(...m.values()) : 0);
  return {
    counts: {
      low: sectionCards.low.length,
      medium: sectionCards.medium.length,
      high: sectionCards.high.length,
      longshot: sectionCards.longshot.length,
      total,
    },
    cards: sectionCards,
    exposure: { maxPlayer: maxOf(pUse), maxGame: maxOf(gUse), maxMarket: maxOf(mUse), distinctPlayers: pUse.size, distinctGames: gUse.size, distinctMarkets: mUse.size },
  };
}

function printBuild(label, res, targets) {
  const c = res.counts;
  console.log(`\n[${label}]`);
  console.log("  " + padE("section", 10) + pad("target", 8) + pad("built", 7) + "   met?");
  for (const s of ["low", "medium", "high", "longshot"]) {
    const met = c[s] >= targets[s] ? "yes" : "NO";
    console.log("  " + padE(s, 10) + pad(targets[s], 8) + pad(c[s], 7) + "   " + met);
  }
  console.log("  " + padE("TOTAL", 10) + pad(targets.low + targets.medium + targets.high + targets.longshot, 8) + pad(c.total, 7));
  console.log(
    `  exposure used: maxPlayer=${res.exposure.maxPlayer} maxGame=${res.exposure.maxGame} maxMarket=${res.exposure.maxMarket} | distinct players=${res.exposure.distinctPlayers} games=${res.exposure.distinctGames} markets=${res.exposure.distinctMarkets}`,
  );
}

// ---------------------------------------------------------------------------
// PHASE C — Historical settled comparison (published vs v2-eligible).
// ---------------------------------------------------------------------------
const isDecided = (r) => r === "win" || r === "loss";

/** Per-slate: collect unique graded MLB legs (dedup by leanId), enrich with
 *  TRUE form from that day's board, and bucket by L5 quality with outcomes. */
function legPredictiveness(date) {
  const graded = loadJSON(gradedPath(date));
  if (!graded || !Array.isArray(graded.uniqueSlips)) return null;
  const boardIdx = buildBoardIndex(date);
  const seen = new Map(); // leanId -> {leg, result}
  for (const slip of graded.uniqueSlips) {
    for (const leg of slip.legs ?? []) {
      const id = legSig(leg);
      if (!seen.has(id)) seen.set(id, leg);
    }
  }
  const buckets = {
    all: { w: 0, l: 0 },
    l5_5of5: { w: 0, l: 0 },
    l5_4of5: { w: 0, l: 0 },
    l5_4plus: { w: 0, l: 0 },
    l5_3orWorse: { w: 0, l: 0 },
    lowElig: { w: 0, l: 0 },
    bankElig: { w: 0, l: 0 },
  };
  let mlbDecided = 0;
  let nbaSkipped = 0;
  let noBoard = 0;
  for (const leg of seen.values()) {
    const sp = (leg.sport ?? "mlb").toLowerCase();
    const r = leg.result;
    if (sp !== "mlb") {
      if (isDecided(r)) nbaSkipped++;
      continue; // NBA ordering unverified -> excluded from true-L5 predictiveness
    }
    const e = enrichLeg(leg, boardIdx);
    if (!isDecided(r)) continue;
    if (e._full == null) {
      noBoard++;
      continue;
    }
    mlbDecided++;
    const W = r === "win" ? 1 : 0;
    const L = r === "loss" ? 1 : 0;
    buckets.all.w += W;
    buckets.all.l += L;
    if (e._l5 != null) {
      if (e._l5.hits === 5) {
        buckets.l5_5of5.w += W;
        buckets.l5_5of5.l += L;
      } else if (e._l5.hits === 4) {
        buckets.l5_4of5.w += W;
        buckets.l5_4of5.l += L;
      } else {
        buckets.l5_3orWorse.w += W;
        buckets.l5_3orWorse.l += L;
      }
      if (e._l5.hits >= 4) {
        buckets.l5_4plus.w += W;
        buckets.l5_4plus.l += L;
      }
    }
    if (isLowEligible(e)) {
      buckets.lowElig.w += W;
      buckets.lowElig.l += L;
    }
    if (isBankElig(e, buckets)) {
      buckets.bankElig.w += W;
      buckets.bankElig.l += L;
    }
  }
  return { date, buckets, mlbDecided, nbaSkipped, noBoard };
}
// small wrapper so the inline isBankEligible name doesn't shadow
function isBankElig(e) {
  return e._l10 != null && e._l10.hits >= 8;
}

/** Published-card hit rate from graded publicRiskSections (the ACTUAL published
 *  cards). Leg-level and slip-level, MLB legs only for leg hit-rate. */
function publishedHitRate(date) {
  const graded = loadJSON(gradedPath(date));
  if (!graded || !graded.publicRiskSections) return null;
  const prs = graded.publicRiskSections;
  let legW = 0;
  let legL = 0;
  let slipW = 0;
  let slipL = 0;
  let slipPend = 0;
  let slips = 0;
  const seenSlip = new Set();
  for (const sec of ["low", "medium", "high", "longshot"]) {
    const bucket = prs[sec]?.all ?? [];
    for (const slip of bucket) {
      const id = slip.slipId || legSig(slip.legs?.[0] ?? {});
      if (seenSlip.has(id)) continue;
      seenSlip.add(id);
      slips++;
      const results = (slip.legs ?? []).map((l) => l.result);
      for (const l of slip.legs ?? []) {
        if (l.result === "win") legW++;
        else if (l.result === "loss") legL++;
      }
      if (results.some((r) => r === "loss")) slipL++;
      else if (results.some((r) => r === "unresolved" || r === "pending" || !r)) slipPend++;
      else if (results.every((r) => r === "win")) slipW++;
      else slipPend++;
    }
  }
  return { slips, legW, legL, slipW, slipL, slipPend };
}

// ---------------------------------------------------------------------------
// PHASE D — Bank Builder feasibility (true L10, official pool).
// ---------------------------------------------------------------------------
function bankBuilder(activeEnriched) {
  const eligibleLegs = activeEnriched.filter((l) => isBankEligible(l));
  // candidate 2-3 leg cards near +100 made only of L10>=8/10 legs.
  // Heuristic: can we form at least one card whose combined odds land in the
  // +60..+180 fallback band using only bank-eligible legs?
  const inBand = (am) => am != null && am >= 60 && am <= 180;
  let cards = 0;
  const pool = [...eligibleLegs].sort((a, b) => (b._l10?.hits ?? 0) - (a._l10?.hits ?? 0));
  // try simple 2-leg and 3-leg combinations greedily, distinct players.
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      if (pool[i].playerId === pool[j].playerId) continue;
      const am2 = combinedAmerican([pool[i].oddsForSide, pool[j].oddsForSide]);
      if (inBand(am2)) {
        cards++;
        if (cards >= 25) break;
      }
    }
    if (cards >= 25) break;
  }
  return { eligibleLegCount: eligibleLegs.length, plus100CardsFound: cards };
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
function main() {
  console.log("SHADOW AUDIT — Suggested Parlay Methodology v2 (effective 2026-06-02)");
  console.log("READ-ONLY · deterministic · true L5/L10 from board full series (MLB).");
  console.log(`Settled public-era slates: ${SETTLED_PUBLIC_DATES.join(", ")}  (May 25/26 excluded)`);

  // --- Active slate (June 2) availability + feasibility ---
  hr("PHASE 0 — June-2 settlement state & data sources");
  const juneGraded = existsSync(gradedPath(ACTIVE_DATE));
  console.log(`June-2 graded file present? ${juneGraded ? "YES (settled — outcomes usable)" : "NO (UNSETTLED — availability only; no outcomes)"}`);
  const opt = loadJSON(optimizerPath(ACTIVE_DATE));
  const boardIdx = buildBoardIndex(ACTIVE_DATE);
  console.log(`June-2 optimizer legPool present? ${opt?.legPool?.legs ? `YES (${opt.legPool.legs.length} legs)` : "NO"}`);
  console.log(`June-2 board index entries (player|market -> full series): ${boardIdx.size}`);

  hr("PHASE A — June-2 candidate leg availability (TRUE form vs TRUNCATED)");
  const rawLegs = opt?.legPool?.legs ?? [];
  const enriched = rawLegs.map((l) => enrichLeg(l, boardIdx));
  const availTrue = legAvailability(enriched);
  printAvailabilityTable("June-2 TRUE form (board full series)", availTrue);

  // Truncated comparison: same legs, but L5/L10 from the OPTIMIZER stored
  // recentSeries (oldest-10) instead of the board full series.
  const enrichedTrunc = rawLegs.map((l) => {
    const sport = (l.sport ?? "mlb").toLowerCase();
    const line = typeof l.line === "number" ? l.line : null;
    const trunc = Array.isArray(l.recentSeries) ? l.recentSeries : [];
    // mimic recentWindow but on the truncated series (still slice tail)
    const win = (n) => {
      const s = trunc.map(Number).filter(Number.isFinite);
      if (sport !== "mlb" || s.length < n || line == null) return null;
      const w = s.slice(-n);
      let hits = 0;
      let push = 0;
      for (const v of w) {
        const c = classify(v, line, l.side);
        if (c === "hit") hits++;
        else if (c === "push") push++;
      }
      return { n, hits, push, miss: n - hits - push };
    };
    return { ...l, sport, line, _fullLen: trunc.length, _full: trunc, _l5: win(5), _l10: win(10) };
  });
  const availTrunc = legAvailability(enrichedTrunc);
  console.log("\n  --- TRUNCATED-source comparison (optimizer oldest-10 recentSeries) ---");
  console.log(`  Low eligible (truncated): ${availTrunc.lowEligible}   vs TRUE: ${availTrue.lowEligible}`);
  console.log(`  L5 5/5 (truncated): ${availTrunc.l5_5of5}   vs TRUE: ${availTrue.l5_5of5}`);
  console.log(`  Bank eligible L10 8/10+ (truncated): ${availTrunc.bankEligible}   vs TRUE: ${availTrue.bankEligible}`);
  const flips = enriched.filter((t, i) => isLowEligible(t) !== isLowEligible(enrichedTrunc[i])).length;
  console.log(`  Low-eligibility FLIPS between true vs truncated source: ${flips} legs`);
  console.log("  => Demonstrates why v2 MUST source L5/L10 from the board full series, not the published recentSeries.");

  hr("PHASE B — June-2 v2 construction feasibility (heuristic greedy)");
  console.log("Targets: 5 Low / 5 Medium / 3 High / 3 Longshot (~15). Shared global exposure ledger.");
  const buildLive = buildSlate(enriched, CAPS_241, TARGETS);
  printBuild("Under LIVE #241 caps (player<=2, game<=3, market<=4, perSection low3/med3/high2/ls1, totalMax9)", buildLive, TARGETS);
  const buildRelaxed = buildSlate(enriched, CAPS_RELAXED, TARGETS);
  printBuild("Under RELAXED caps (headroom only — NOT a ship recommendation)", buildRelaxed, TARGETS);

  hr("PHASE D — June-2 Bank Builder feasibility (true L10 8/10+)");
  const bank = bankBuilder(enriched);
  console.log(`  Bank-eligible legs (L10 8/10+, true): ${bank.eligibleLegCount}`);
  console.log(`  +100-band (am +60..+180) all-eligible 2-leg cards found: ${bank.plus100CardsFound}${bank.plus100CardsFound >= 25 ? "+ (capped)" : ""}`);
  console.log(`  Qualifying card exists? ${bank.plus100CardsFound > 0 ? "YES" : "NO"} (else: show no card with honest reason)`);

  hr("PHASE C — Historical settled comparison (published cards vs v2-eligible legs)");
  console.log("Leg hit rate = wins/(wins+losses); pushes & pending excluded. MLB only (NBA L5 fail-closed).");
  const agg = {
    all: { w: 0, l: 0 },
    l5_5of5: { w: 0, l: 0 },
    l5_4of5: { w: 0, l: 0 },
    l5_4plus: { w: 0, l: 0 },
    l5_3orWorse: { w: 0, l: 0 },
    lowElig: { w: 0, l: 0 },
    bankElig: { w: 0, l: 0 },
  };
  const pubAgg = { slips: 0, legW: 0, legL: 0, slipW: 0, slipL: 0, slipPend: 0 };
  console.log("\n  Per-slate v2-eligible leg hit rates (true L5):");
  console.log("  " + padE("date", 12) + pad("MLBdec", 7) + pad("all", 12) + pad("L5 5/5", 12) + pad("L5 4/5", 12) + pad("L5 4+/5", 12) + pad("LowElig", 12));
  for (const d of SETTLED_PUBLIC_DATES) {
    const p = legPredictiveness(d);
    if (!p) {
      console.log("  " + padE(d, 12) + "  (no graded file)");
      continue;
    }
    const b = p.buckets;
    for (const k of Object.keys(agg)) {
      agg[k].w += b[k].w;
      agg[k].l += b[k].l;
    }
    const fmt = (x) => `${x.w}/${x.w + x.l}=${pct(x.w, x.w + x.l)}`;
    console.log(
      "  " +
        padE(d, 12) +
        pad(p.mlbDecided, 7) +
        pad(fmt(b.all), 12) +
        pad(fmt(b.l5_5of5), 12) +
        pad(fmt(b.l5_4of5), 12) +
        pad(fmt(b.l5_4plus), 12) +
        pad(fmt(b.lowElig), 12),
    );
    const pub = publishedHitRate(d);
    if (pub) {
      pubAgg.slips += pub.slips;
      pubAgg.legW += pub.legW;
      pubAgg.legL += pub.legL;
      pubAgg.slipW += pub.slipW;
      pubAgg.slipL += pub.slipL;
      pubAgg.slipPend += pub.slipPend;
    }
  }
  const fmt = (x) => `${x.w}/${x.w + x.l}=${pct(x.w, x.w + x.l)}`;
  console.log("\n  AGGREGATE (all settled public slates, MLB):");
  console.log("    all legs                 : " + fmt(agg.all));
  console.log("    L5 5/5 legs              : " + fmt(agg.l5_5of5));
  console.log("    L5 4/5 legs              : " + fmt(agg.l5_4of5));
  console.log("    L5 4/5+ legs             : " + fmt(agg.l5_4plus));
  console.log("    L5 3/5 or worse legs     : " + fmt(agg.l5_3orWorse));
  console.log("    Low-eligible legs        : " + fmt(agg.lowElig));
  console.log("    Bank-eligible (L10 8/10+): " + fmt(agg.bankElig));
  console.log("\n  CURRENT published cards (graded publicRiskSections, where present):");
  console.log(`    published slips: ${pubAgg.slips}  | leg hit rate: ${pubAgg.legW}/${pubAgg.legW + pubAgg.legL}=${pct(pubAgg.legW, pubAgg.legW + pubAgg.legL)}`);
  console.log(`    slip outcomes: win=${pubAgg.slipW} loss=${pubAgg.slipL} pending=${pubAgg.slipPend}  (slip win rate of decided: ${pct(pubAgg.slipW, pubAgg.slipW + pubAgg.slipL)})`);

  // --- VERDICT ---
  hr("VERDICT");
  const lowN = agg.lowElig.w + agg.lowElig.l;
  const fiveN = agg.l5_5of5.w + agg.l5_5of5.l;
  const fourPlusN = agg.l5_4plus.w + agg.l5_4plus.l;
  const allRate = agg.all.w / Math.max(1, agg.all.w + agg.all.l);
  const fivePlusRate = agg.l5_5of5.w / Math.max(1, fiveN);
  const fourPlusRate = agg.l5_4plus.w / Math.max(1, fourPlusN);
  console.log(`Sample sizes (decided MLB legs): all=${agg.all.w + agg.all.l}, L5 5/5=${fiveN}, L5 4/5+=${fourPlusN}, Low-elig=${lowN}, Bank-elig=${agg.bankElig.w + agg.bankElig.l}`);
  const SMALL = 40;
  const warn = [];
  if (fiveN < SMALL) warn.push(`L5 5/5 sample (${fiveN}) < ${SMALL}`);
  if (lowN < SMALL) warn.push(`Low-eligible sample (${lowN}) < ${SMALL}`);
  if (warn.length) console.log("SAMPLE-SIZE WARNING: " + warn.join("; "));
  console.log(`Signal: all=${(allRate * 100).toFixed(0)}%  L5 5/5=${(fivePlusRate * 100).toFixed(0)}%  L5 4/5+=${(fourPlusRate * 100).toFixed(0)}%`);
  console.log("");
  console.log("Feasibility (June 2, TRUE form):");
  console.log(`  Low eligible legs=${availTrue.lowEligible} -> Low cards built (live caps)=${buildLive.counts.low}/${TARGETS.low}`);
  console.log(`  Med/Hi/Ls eligible legs=${availTrue.medHiLsEligible} -> med=${buildLive.counts.medium}/${TARGETS.medium} high=${buildLive.counts.high}/${TARGETS.high} ls=${buildLive.counts.longshot}/${TARGETS.longshot}`);
  console.log(`  Bank-eligible legs=${availTrue.bankEligible}`);
  console.log("");
  console.log("Key blockers detected:");
  console.log(
    flips === 0
      ? `  1. DATA PLUMBING: RESOLVED — persisted optimizer recentSeries now matches the board recent tail (Low-elig flips: 0). Regenerate any remaining stale slates before relying on the field.`
      : `  1. DATA PLUMBING: published recentSeries is oldest-10 for ~88% of MLB legs; true L5/L10 require board full series. (Low-elig flips: ${flips})`,
  );
  console.log(`  2. CAP CONFLICT: v2 targets (~16) exceed #241 totalMax=${CAPS_241.totalMax}; market cap (${CAPS_241.market}) throttles total cards with few MLB markets.`);
  console.log(`  3. LOW STARVATION: Low requires 5/5 AND <=-150 simultaneously (eligible=${availTrue.lowEligible}).`);
  console.log("");
  console.log("Decision inputs -> see doc PHASE 6 interpretation. This script asserts feasibility/", "evidence only; it does NOT wire live behavior.");
}

main();
