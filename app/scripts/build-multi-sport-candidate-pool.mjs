/**
 * build-multi-sport-candidate-pool.mjs — a READ-ONLY, INTERNAL multi-sport candidate pool.
 *
 * Gathers artifact-backed candidate legs from committed MLB + Soccer artifacts and normalizes them into
 * the shared CandidateLeg shape, tagging each with settlement-aware `productEligible`. It creates NO
 * exposure (every leg is a candidate), activates NO product card, and touches NO money. Soccer team +
 * player markets are settleable (API-Football) ⇒ productEligible when data is adequate; MLB markets have
 * no product-card settlement path yet ⇒ analysis/watchlist only.
 *
 * Output (repo-root data/internal — NOT web-served by the static export):
 *   data/internal/multi-sport/candidate-pool/<date>.json
 *
 * Usage:  npx tsx scripts/build-multi-sport-candidate-pool.mjs [--date 2026-07-09] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { getMlbGameCenter } from "../src/lib/mlb-team-markets.ts";
import { getWcGameCenter } from "../src/lib/wc-game-center.ts";
import { getWcExpandedMarkets } from "../src/lib/wc-expanded-markets.ts";
import { loadWorldCupProjections } from "../src/lib/world-cup/projections.ts";
import { normalizeCandidateLeg } from "../src/lib/multi-sport/candidate-leg.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
const OUT_DIR = path.join(REPO, "data", "internal", "multi-sport", "candidate-pool");
const WRITE = process.argv.includes("--write");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();
const MLB_PROP_CAP = 15; // bound the MLB player-prop candidates (documented, not silent)

function pickDate() {
  if (DATE) return DATE;
  const files = fs.readdirSync(BOARDS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace(".json", "") : null;
}
const p4 = (x) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(4)) : undefined);

/** MLB team-market + reliable player-prop candidates (all analysis-only — MLB settlement not wired). */
function mlbCandidates(date) {
  const out = [];
  const boardPath = path.join(BOARDS, `${date}.json`);
  if (!fs.existsSync(boardPath)) return out;
  const board = JSON.parse(fs.readFileSync(boardPath, "utf8"));
  const gameIds = [...new Set((board.leans || []).map((l) => l.gameId))].filter(Boolean);

  for (const gameId of gameIds) {
    const gc = getMlbGameCenter(date, gameId);
    if (!gc) continue;
    const event = `${gc.awayTeam} @ ${gc.homeTeam}`;
    const base = { sport: "MLB", date, gameId, eventName: event, dataQuality: "strong", artifactSource: `mlb/team-markets/${date}.json` };
    if (gc.moneyline && gc.moneyline.favorite !== "even") {
      const home = gc.moneyline.favorite === "home";
      out.push(normalizeCandidateLeg({ ...base, market: "moneyline", side: gc.moneyline.favorite, selection: `${home ? gc.homeTeam : gc.awayTeam} ML`, price: home ? gc.moneyline.homeOdds : gc.moneyline.awayOdds, marketProbability: p4(home ? gc.moneyline.homeWinProb : gc.moneyline.awayWinProb), publicLabel: `${home ? gc.homeTeam : gc.awayTeam} moneyline` }));
    }
    if (gc.total && gc.total.lean !== "balanced") {
      const over = gc.total.lean === "over";
      out.push(normalizeCandidateLeg({ ...base, market: "total", side: gc.total.lean, line: gc.total.line, selection: `${over ? "Over" : "Under"} ${gc.total.line}`, marketProbability: p4(over ? gc.total.overProb : gc.total.underProb), publicLabel: `${over ? "Over" : "Under"} ${gc.total.line} runs` }));
    }
    if (gc.runLine) {
      const home = gc.runLine.favorite === "home";
      out.push(normalizeCandidateLeg({ ...base, market: "run_line", side: gc.runLine.favorite, line: gc.runLine.line, selection: `${home ? gc.homeTeam : gc.awayTeam} ${gc.runLine.line}`, marketProbability: p4(gc.runLine.favoriteCoverProb), publicLabel: `${home ? gc.homeTeam : gc.awayTeam} run line` }));
    }
  }

  // Reliable player-prop market only (batter_hits ~53.8% historically); analysis/watchlist, capped.
  const hits = (board.leans || []).filter((l) => l.marketKey === "batter_hits")
    .sort((a, b) => (b.lean === "Over" ? b.modelProbOver : b.modelProbUnder) - (a.lean === "Over" ? a.modelProbOver : a.modelProbUnder))
    .slice(0, MLB_PROP_CAP);
  for (const l of hits) {
    const over = l.lean === "Over";
    const modelProb = over ? l.modelProbOver : l.modelProbUnder;
    const edge = over ? l.edgePctOver : l.edgePctUnder;
    out.push(normalizeCandidateLeg({
      sport: "MLB", date, gameId: l.gameId, eventName: `${l.awayTeamAbbr} @ ${l.homeTeamAbbr}`,
      market: "batter_hits", side: over ? "over" : "under", line: l.line,
      selection: `${l.playerName} ${l.marketLabel} ${l.lean} ${l.line}`,
      modelProbability: p4(modelProb), marketProbability: p4(typeof modelProb === "number" && typeof edge === "number" ? modelProb - edge / 100 : undefined),
      edgePct: p4(edge), confidence: l.confidence, reliabilityWeight: 0.65,
      dataQuality: typeof l.samples === "number" && l.samples >= 10 ? "strong" : l.samples >= 5 ? "medium" : "thin",
      artifactSource: `mlb/boards/${date}.json`, publicLabel: `${l.playerName} ${l.marketLabel.toLowerCase()}`,
    }));
  }
  return out;
}

/** Soccer candidates from the de-vigged Game Center + expanded markets — settleable via API-Football. */
function soccerCandidates(date) {
  const out = [];
  const proj = loadWorldCupProjections();
  if (!proj || String(proj.date) !== date) return out; // only the current slate
  const matchIds = [...new Set((proj.matches || []).map((m) => String(m.matchId)))];
  for (const mid of matchIds) {
    const gc = getWcGameCenter(mid);
    if (!gc) continue;
    const event = `${gc.homeTeam} vs ${gc.awayTeam}`;
    const base = { sport: "Soccer", date, gameId: mid, eventName: event, dataQuality: "strong", artifactSource: `world-cup/projections/${date}.json` };
    if (gc.matchResult) {
      const t = gc.matchResult.topResult;
      const label = t === "home" ? gc.homeTeam : t === "away" ? gc.awayTeam : "Draw";
      out.push(normalizeCandidateLeg({ ...base, market: "moneyline_90", side: t, selection: `${label} (match result)`, marketProbability: p4(gc.matchResult[t]), publicLabel: `${label} — match result` }));
    }
    if (gc.total && gc.total.lean !== "balanced") {
      const over = gc.total.lean === "over";
      out.push(normalizeCandidateLeg({ ...base, market: "match_total_goals", side: gc.total.lean, line: gc.total.line, selection: `${over ? "Over" : "Under"} ${gc.total.line}`, marketProbability: p4(over ? gc.total.over : gc.total.under), publicLabel: `${over ? "Over" : "Under"} ${gc.total.line} goals` }));
    }
    if (gc.btts && gc.btts.lean !== "balanced") {
      const yes = gc.btts.lean === "yes";
      out.push(normalizeCandidateLeg({ ...base, market: "btts", side: gc.btts.lean, selection: `BTTS ${yes ? "Yes" : "No"}`, marketProbability: p4(yes ? gc.btts.yes : gc.btts.no), publicLabel: `both teams to score — ${yes ? "yes" : "no"}` }));
    }
    if (gc.doubleChance) {
      const opts = [["homeOrDraw", `${gc.homeTeam} or Draw`], ["awayOrDraw", `${gc.awayTeam} or Draw`], ["homeOrAway", `${gc.homeTeam} or ${gc.awayTeam}`]].filter(([k]) => typeof gc.doubleChance[k] === "number");
      if (opts.length) { const [k, label] = opts.sort((a, b) => gc.doubleChance[b[0]] - gc.doubleChance[a[0]])[0]; out.push(normalizeCandidateLeg({ ...base, market: "double_chance", side: k, selection: `${label} (DC)`, marketProbability: p4(gc.doubleChance[k]), publicLabel: `double chance — ${label}` })); }
    }
    if (gc.drawNoBet) {
      const home = gc.drawNoBet.home >= gc.drawNoBet.away;
      out.push(normalizeCandidateLeg({ ...base, market: "draw_no_bet", side: home ? "home" : "away", selection: `${home ? gc.homeTeam : gc.awayTeam} (DNB)`, marketProbability: p4(home ? gc.drawNoBet.home : gc.drawNoBet.away), publicLabel: `draw no bet — ${home ? gc.homeTeam : gc.awayTeam}` }));
    }
    const ex = getWcExpandedMarkets(date, mid);
    if (ex?.asianHandicap) {
      const ah = ex.asianHandicap;
      const homeP = ah.home?.noVigProb, awayP = ah.away?.noVigProb;
      if (typeof homeP === "number" || typeof awayP === "number") {
        const home = (homeP ?? 0) >= (awayP ?? 0);
        out.push(normalizeCandidateLeg({ ...base, market: "asian_handicap", side: home ? "home" : "away", line: ah.line, selection: `${home ? gc.homeTeam : gc.awayTeam} ${ah.line} (AH)`, marketProbability: p4(home ? homeP : awayP), artifactSource: `world-cup/expanded-markets/${date}.json`, publicLabel: `Asian handicap — ${home ? gc.homeTeam : gc.awayTeam} ${ah.line}` }));
      }
    }
    if (ex?.teamTotals) {
      for (const key of ["home", "away"]) {
        const tt = ex.teamTotals[key];
        if (!tt) continue;
        const overP = tt.over?.noVigProb, underP = tt.under?.noVigProb;
        if (typeof overP !== "number" && typeof underP !== "number") continue;
        const over = (overP ?? 0) >= (underP ?? 0);
        out.push(normalizeCandidateLeg({ ...base, market: "team_totals", side: `${key}_${over ? "over" : "under"}`, line: tt.line, selection: `${tt.team} ${over ? "Over" : "Under"} ${tt.line}`, marketProbability: p4(over ? overP : underP), artifactSource: `world-cup/expanded-markets/${date}.json`, publicLabel: `${tt.team} team total ${over ? "over" : "under"} ${tt.line}` }));
      }
    }
  }
  return out;
}

function main() {
  const date = pickDate();
  if (!date) { console.error("[pool] no board found"); process.exit(1); }
  const legs = [...mlbCandidates(date), ...soccerCandidates(date)];

  const bySport = { MLB: 0, Soccer: 0 };
  const byReason = {};
  let eligible = 0;
  for (const l of legs) { bySport[l.sport]++; if (l.productEligible) eligible++; byReason[l.productEligibilityReason] = (byReason[l.productEligibilityReason] ?? 0) + 1; }

  const pool = {
    kind: "multi-sport-candidate-pool", public: false, internal: true, date,
    generatedFrom: { mlb: `boards/${date}.json + team-markets/${date}.json`, soccer: `world-cup/projections/${date}.json + expanded-markets/${date}.json` },
    counts: { total: legs.length, bySport, eligible, ineligible: legs.length - eligible },
    eligibilityByReason: byReason,
    mlbPlayerPropCap: MLB_PROP_CAP,
    legs,
    note: "READ-ONLY analysis pool. No exposure, no product-card activation. MLB legs are analysis/watchlist only (MLB product-card settlement not wired). Soccer legs are productEligible when settleable + data adequate. Separate from the official 19-14 record.",
  };

  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${date}.json`), JSON.stringify(pool, null, 2) + "\n"); }
  console.log(`[pool] ${WRITE ? "WROTE" : "DRY-RUN"} ${date} · ${legs.length} legs (MLB ${bySport.MLB}, Soccer ${bySport.Soccer}) · productEligible ${eligible}`);
  for (const [r, n] of Object.entries(byReason)) console.log(`  · ${n} — ${r}`);
  if (!WRITE) console.log("  (dry run — pass --write to persist)");
}

main();
