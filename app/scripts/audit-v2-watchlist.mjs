/**
 * audit-v2-watchlist — INTERNAL-ONLY, READ-ONLY, deterministic.
 *
 * Identifies the active-slate legs that match the strongest *watchlist* v2
 * condition (the MLB "Low gate": L5 5/5 recent form AND chosen-side odds <= -150)
 * and shows whether they already appear in the published Suggested Parlays. This
 * is OBSERVATIONAL ONLY: it does not change projections, the optimizer, Suggested
 * Parlays, public data, or the UI. The Low gate is `shadow_watchlist` (it fails
 * the hardened launch gates — see audit-v2-candidate-search), so NOTHING here is
 * applied live.
 *
 * Writes (docs only):
 *   docs/audits/v2-watchlist-latest.md          — leg-level watchlist
 *   docs/audits/v2-june4-simulation-latest.md   — "what v2 would do" simulation
 *
 * Run: cd app && npx tsx scripts/audit-v2-watchlist.mjs [--write-report]
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const WRITE = (typeof process !== "undefined" ? process.argv : []).includes("--write-report");
const LOW_MAX_AMERICAN = -150;
const DATE_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }
function datesInDir(d) {
  let f = [];
  try { f = readdirSync(d); } catch { f = []; }
  return f.map((x) => (DATE_FILE_RE.exec(x) || [])[1]).filter(Boolean).sort();
}
const americanToImplied = (o) =>
  typeof o === "number" && Number.isFinite(o) && o !== 0 ? (o < 0 ? -o / (-o + 100) : 100 / (o + 100)) : null;
function l5hits(series, line, side) {
  if (!Array.isArray(series)) return null;
  const s = series.map(Number).filter(Number.isFinite);
  if (s.length < 5 || typeof line !== "number") return null;
  const w = s.slice(-5);
  const sd = (side || "").toLowerCase();
  let h = 0;
  for (const v of w) { if (v === line) continue; if (sd === "over" ? v > line : v < line) h++; }
  return h;
}
const sig = (pid, market, line, side) => `${pid}|${market}|${line}|${(side || "").toLowerCase()}`;

// Active slate = latest optimizer date.
const ACTIVE = (datesInDir(resolve(DATA, "parlays", "optimizer")).slice(-1)[0]) || null;

function publishedLegSignatures(date) {
  const o = loadJSON(resolve(DATA, "parlays", "optimizer", `${date}.json`));
  const set = new Set();
  const prs = o?.publicRiskSections || {};
  for (const risk of ["low", "medium", "high", "longshot"]) {
    for (const view of ["all", "nba", "mlb", "multi"]) {
      for (const slip of prs[risk]?.[view] || []) {
        for (const leg of slip.legs || []) {
          set.add(sig(leg.playerId, leg.market || leg.marketKey, leg.line, leg.side));
        }
      }
    }
  }
  return set;
}

function watchlistLegs(date) {
  const board = loadJSON(resolve(DATA, "mlb", "boards", `${date}.json`));
  const out = [];
  if (!board || !Array.isArray(board.leans)) return out;
  for (const ln of board.leans) {
    const side = ln.lean;
    if (side !== "Over" && side !== "Under") continue;
    const odds = side === "Over" ? ln.oddsOver : ln.oddsUnder;
    const l5 = l5hits(ln.recentSeries, ln.line, side);
    if (l5 !== 5) continue;
    if (!(typeof odds === "number" && odds <= LOW_MAX_AMERICAN)) continue;
    const io = ln.impliedOver, iu = ln.impliedUnder;
    const devig = typeof io === "number" && typeof iu === "number" ? (side === "Over" ? io : iu) / (io + iu) : americanToImplied(odds);
    out.push({
      player: ln.playerName, team: ln.playerTeamAbbr, opp: ln.opponentAbbr,
      gameId: ln.gameId, market: ln.marketKey, line: ln.line, side,
      odds, devig, l5, sig: sig(ln.playerId, ln.marketKey, ln.line, side),
    });
  }
  // deterministic order: market, then heaviest favorite, then player
  return out.sort((a, b) => (a.market < b.market ? -1 : a.market > b.market ? 1 : (a.odds - b.odds) || (a.player < b.player ? -1 : 1)));
}

function build() {
  if (!ACTIVE) return null;
  const settled = existsSync(resolve(DATA, "parlays", "optimizer-graded", `${ACTIVE}.json`));
  const published = publishedLegSignatures(ACTIVE);
  const legs = watchlistLegs(ACTIVE);
  for (const l of legs) l.inPublished = published.has(l.sig);
  const byMarket = {};
  const byGame = {};
  for (const l of legs) {
    byMarket[l.market] = (byMarket[l.market] || 0) + 1;
    byGame[l.gameId] = (byGame[l.gameId] || 0) + 1;
  }
  return {
    date: ACTIVE, settled, legs, byMarket, byGame,
    inPublished: legs.filter((l) => l.inPublished).length,
    publishedTotal: published.size,
  };
}

function pct(x) { return x == null ? "—" : `${Math.round(x * 100)}%`; }

function watchlistMd(b) {
  const m = [];
  m.push("# v2 Watchlist — INTERNAL ONLY (auto-generated)");
  m.push("");
  m.push("> `app/scripts/audit-v2-watchlist.mjs --write-report` · READ-ONLY · deterministic.");
  m.push("> **INTERNAL ONLY — no public effect.** Does NOT change projections, optimizer,");
  m.push("> Suggested Parlays, public data, or UI. The Low gate is `shadow_watchlist`");
  m.push("> (fails the hardened launch gates), so nothing here is applied live.");
  m.push("");
  m.push(`## Active slate: ${b.date} (settled? ${b.settled ? "yes" : "no — pregame"})`);
  m.push("");
  m.push("### Watchlist condition");
  m.push("- **Segment:** `mlb_low_gate_5of5_and_-150` — MLB legs whose chosen side went");
  m.push("  **5/5 over the last 5 games (true L5 from the board series)** AND whose");
  m.push("  chosen-side odds are **≤ −150** (heavy favorite).");
  m.push("- **Why watchlist (not launch):** beats the naive 95% CI but fails the");
  m.push("  Bonferroni-corrected CI, the adjusted p-value, and single-date overdependence.");
  m.push("  Required next evidence: more settled slates until the corrected CI lower bound");
  m.push("  clears de-vig without single-date reliance.");
  m.push("");
  m.push(`### June-4 watchlist legs: **${b.legs.length}** (already in published Suggested Parlays: **${b.inPublished}**)`);
  m.push("");
  if (!b.legs.length) {
    m.push("_No legs match the watchlist condition on this slate._");
  } else {
    m.push("| player | team | opp | market | line | side | odds | de-vig | L5 | in published? |");
    m.push("|--------|------|-----|--------|-----:|------|-----:|------:|---:|:-------------:|");
    for (const l of b.legs) {
      m.push(`| ${l.player} | ${l.team} | ${l.opp} | ${l.market} | ${l.line} | ${l.side} | ${l.odds} | ${pct(l.devig)} | ${l.l5}/5 | ${l.inPublished ? "yes" : "no"} |`);
    }
  }
  m.push("");
  m.push("### Counts");
  m.push(`- by market: ${Object.entries(b.byMarket).map(([k, v]) => `${k}=${v}`).join(", ") || "(none)"}`);
  m.push(`- distinct games: ${Object.keys(b.byGame).length}`);
  m.push(`- published Suggested-Parlay legs total: ${b.publishedTotal}`);
  m.push("");
  m.push("**Internal only. No public effect. v2 stays not-live.**");
  m.push("");
  return m.join("\n");
}

function simulationMd(b) {
  const m = [];
  m.push("# v2 June-4 Simulation — INTERNAL ONLY (auto-generated)");
  m.push("");
  m.push("> `app/scripts/audit-v2-watchlist.mjs --write-report` · READ-ONLY · deterministic.");
  m.push("> Simulates what the watchlist gate **would** surface on the active slate.");
  m.push("> **Nothing is applied:** no write to `app/public/data`, no optimizer/projection/");
  m.push("> UI change. v2 is not live.");
  m.push("");
  m.push(`## Active slate: ${b.date}`);
  m.push("");
  m.push("### What the watchlist gate would flag");
  m.push(`- **${b.legs.length}** MLB legs match the Low-gate watchlist condition (L5 5/5 & odds ≤ −150).`);
  m.push(`- By market: ${Object.entries(b.byMarket).map(([k, v]) => `${k}=${v}`).join(", ") || "(none)"}.`);
  m.push(`- Across ${Object.keys(b.byGame).length} game(s).`);
  m.push(`- **${b.inPublished}** of these are already in the current published Suggested Parlays; ${b.legs.length - b.inPublished} are not.`);
  m.push("");
  m.push("### Hypothetical change if the gate were live (NOT applied)");
  m.push("- The Low gate is **`shadow_watchlist`**, not a launch candidate, so **no live");
  m.push("  re-ranking, additions, or removals are made.** Official Suggested Parlays for");
  m.push("  June 4 continue to use the **current-live** model.");
  m.push("- If (hypothetically) the Low section were restricted to watchlist legs, it would");
  m.push("  draw from the legs above — but that is exactly the unconfirmed edge the hardened");
  m.push("  gates reject, so it is not done.");
  m.push("");
  m.push("### Why no live change");
  m.push("- The watchlist segment fails the corrected CI + adjusted p + single-date checks");
  m.push("  on the settled sample (7 slates). It needs **more settled MLB slates** before");
  m.push("  the corrected lower bound clears de-vig without single-date reliance.");
  m.push("");
  m.push("### NBA note");
  m.push("- June 4 is an **NBA off-day** (ESPN: 0 NBA events; games fall on Jun 3 & Jun 5).");
  m.push("  NBA absence does not affect this MLB-only simulation and is not a data failure.");
  m.push("");
  m.push("**Internal only. No public effect.**");
  m.push("");
  return m.join("\n");
}

const b = build();
if (!b) {
  console.log("No active optimizer slate found — nothing to score.");
} else {
  console.log(`v2 watchlist — active ${b.date}: ${b.legs.length} watchlist legs (${b.inPublished} already published). by market: ${JSON.stringify(b.byMarket)}`);
  if (WRITE) {
    mkdirSync(DOCS, { recursive: true });
    writeFileSync(resolve(DOCS, "v2-watchlist-latest.md"), watchlistMd(b), "utf8");
    writeFileSync(resolve(DOCS, "v2-june4-simulation-latest.md"), simulationMd(b), "utf8");
    console.log(`[--write-report] wrote v2-watchlist-latest.md + v2-june4-simulation-latest.md`);
  } else {
    console.log("(tip: pass --write-report to persist the internal docs)");
  }
}
