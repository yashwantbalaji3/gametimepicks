/**
 * build-admin-status.mjs — derive a single machine-readable ops status file from CANONICAL data only.
 *
 *   npx tsx app/scripts/build-admin-status.mjs [--now 2026-07-06T18:00:00Z]
 *
 * Writes app/public/data/admin/status.json — the backbone a future admin dashboard AND Claude ops agents
 * read to answer "what is the state, and what is the next action?". READ-ONLY + derived:
 *   • it reads portfolio.json / daily-portfolio.json / boards / settlement artifacts and REPORTS them,
 *   • it NEVER writes canonical money (portfolio.json md5 is snapshotted before/after and asserted equal),
 *   • it fabricates nothing — every field comes from a real artifact or is null.
 * A lightweight money invariant (crown − drawdown === bankroll, daily activeBankroll === canonical) is
 * reported as a gate; the authoritative gates remain verify-money-integrity / forensic / health.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(APP, "public", "data");
const argNow = (() => { const i = process.argv.indexOf("--now"); return i >= 0 ? process.argv[i + 1] : null; })();
const nowIso = argNow ?? new Date().toISOString();
// --out <path> redirects the write (e.g. a temp file) so tests can exercise the builder WITHOUT mutating
// the committed public/data/admin/status.json. Defaults to the canonical path.
const argOut = (() => { const i = process.argv.indexOf("--out"); return i >= 0 ? process.argv[i + 1] : null; })();

const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")); } catch { return null; } };
const md5 = (rel) => { try { return crypto.createHash("md5").update(fs.readFileSync(path.join(DATA, rel))).digest("hex"); } catch { return null; } };
const round2 = (n) => (typeof n === "number" ? Math.round(n * 100) / 100 : n);

const portfolioMd5Before = md5("mr-dub/portfolio.json");

const pf = readJson("mr-dub/portfolio.json");
const dp = readJson("mr-dub/daily-portfolio.json");
const wcBoard = readJson("world-cup/round-of-32/board-latest.json");

// Latest MLB board + WC settlement (by filename date).
const listDated = (dir) => { try { return fs.readdirSync(path.join(DATA, dir)).filter((f) => /^2\d{3}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch { return []; } };
const latestMlb = listDated("mlb/boards").at(-1) ?? null;
const mlbBoard = latestMlb ? readJson(`mlb/boards/${latestMlb}`) : null;
const latestSettlementFile = listDated("world-cup/settlement").at(-1) ?? null;
const latestSettlement = latestSettlementFile ? readJson(`world-cup/settlement/${latestSettlementFile}`) : null;

// ── Canonical money (verbatim from portfolio.json) ──────────────────────────────────────────────
const rec = pf?.record ?? { wins: 0, losses: 0, voids: 0, pending: 0 };
const canonical = pf ? {
  record: `${rec.wins}-${rec.losses}${rec.voids ? `-${rec.voids}` : ""}${rec.pending ? `-${rec.pending}` : ""}`,
  bankroll: round2(pf.currentBankroll), crown: round2(pf.crownBankroll), drawdown: round2(pf.drawdown),
  profit: round2(pf.settledProfit), roiMultiple: pf.roiMultiple ?? null, portfolioMd5: portfolioMd5Before,
} : null;

// ── Lightweight money invariants (report only; authoritative gates run separately) ──────────────
const gateReconciles = pf ? Math.abs((pf.crownBankroll - pf.drawdown) - pf.currentBankroll) < 0.01 : false;
const gateDailyTracks = pf && dp ? Math.abs((dp.activeBankroll ?? NaN) - pf.currentBankroll) < 0.01 : false;
const moneyGate = { crownMinusDrawdownEqualsBankroll: gateReconciles, dailyTracksCanonical: gateDailyTracks, pass: gateReconciles && gateDailyTracks };

// ── Today's active products (from the daily portfolio; verbatim) ────────────────────────────────
const lanes = Array.isArray(dp?.lanes) ? dp.lanes : [];
const laneSummary = (product) => lanes.filter((l) => l.product === product).map((l) => ({
  lane: l.lane, status: l.status, step: l.step ?? null, legs: (l.legs ?? []).length,
  combinedOdds: l.combinedOdds ?? null, stake: l.stake ?? null, potentialReturn: l.potentialReturn ?? null,
  selections: (l.legs ?? []).map((leg) => leg.selection).filter(Boolean),
}));
const bbLanes = laneSummary("bank-builder");
const moonLanes = laneSummary("moonshot");

// ── Product readiness (derived, honest — "not wired" when an artifact is absent) ─────────────────
const wcSpecials = readJson("world-cup/world-cup-specials.json");
const bbActive = bbLanes.filter((l) => l.status === "active").length;
const moonActive = moonLanes.filter((l) => l.status === "active").length;
const wcGames = (wcBoard?.games ?? []).length;
const mlbGames = (mlbBoard?.games ?? []).length;
const productReadiness = {
  bankBuilder: bbActive ? `active · ${bbActive} lane(s)` : bbLanes.length ? "awaiting approval" : "no card today",
  moonshot: moonActive ? `active · ${moonActive} lane(s)` : moonLanes.length ? "awaiting approval" : "no card today",
  top10: wcGames || mlbGames ? "live" : "data pending",
  worldCup: wcGames ? `live · ${wcGames} game(s)` : "dormant (no board)",
  mlb: mlbGames ? `live · ${mlbGames} game(s)` : "dormant (no board)",
  wcSpecials: wcSpecials ? `${(wcSpecials.cards ?? wcSpecials.specials ?? []).length} card(s)` : "not wired",
};
const activeProductCount = [bbActive > 0, moonActive > 0, wcGames > 0, mlbGames > 0].filter(Boolean).length;
const pendingApprovalCount = [...bbLanes, ...moonLanes].filter((l) => l.status !== "active").length;

// ── Workflow health (from the ops heartbeat written by ops-notify.mjs; honest "not wired" if absent) ─
//
// A heartbeat is a DEAD-MAN'S SWITCH: its value is the freshness of the signal, not the last recorded
// verdict. This previously copied `ok`/`status` through verbatim, so /ops published `ok: true, status:
// "pass"` from a heartbeat that had not been written for 17 days — a green dashboard asserting health from
// a signal that had stopped. Reporting nothing would have been safer than that.
//
// Now it fails closed: past STALE_AFTER_HOURS the run is reported as stale and NOT ok, whatever the last
// recorded verdict said. The last known verdict is kept alongside for context, never as the live one.
// The daily pipeline runs at least once a day, so a gap beyond 36h means a full cycle was missed.
const HEARTBEAT_STALE_AFTER_HOURS = 36;
const heartbeat = readJson("ops/heartbeat.json");
const heartbeatAgeHours = (() => {
  const t = Date.parse(heartbeat?.lastRunAt ?? "");
  if (!Number.isFinite(t)) return null;
  return Math.round(((Date.parse(nowIso) - t) / 3_600_000) * 10) / 10;
})();
const heartbeatStale = heartbeatAgeHours == null || heartbeatAgeHours > HEARTBEAT_STALE_AFTER_HOURS;
const workflowHealth = !heartbeat
  ? { note: "not wired — no ops heartbeat found (ops-notify.mjs writes it on a clean automated run)" }
  : heartbeatStale
    ? {
        lastRunAt: heartbeat.lastRunAt ?? null,
        ageHours: heartbeatAgeHours,
        ok: false,
        status: "stale",
        staleAfterHours: HEARTBEAT_STALE_AFTER_HOURS,
        lastKnown: { ok: heartbeat.ok ?? null, status: heartbeat.status ?? null, phase: heartbeat.phase ?? null },
        note: "the heartbeat has stopped — this is the AGE of the last signal, not a live health verdict",
      }
    : {
        lastRunAt: heartbeat.lastRunAt ?? null,
        ageHours: heartbeatAgeHours,
        ok: heartbeat.ok ?? null,
        status: heartbeat.status ?? null,
        phase: heartbeat.phase ?? null,
      };

// ── Next dates (derived from the slate) ─────────────────────────────────────────────────────────
const addDays = (iso, n) => { const [y, m, d] = (iso ?? "").split("-").map(Number); if (!y) return null; const t = Date.UTC(y, m - 1, d) + n * 86400000; const dt = new Date(t); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`; };
const nextSettlementDate = dp?.date ?? null;              // today's games settle after they go final
const nextRefreshDate = addDays(dp?.date, 1);              // the next slate

// ── Slate pointer — MUST follow the newest successful slate board, never lag ─────────────────────
// The daily-portfolio date (dp.date) is a MONEY-state pointer that legitimately lags when no card is
// placed; using it for the SLATE date is what let the July-24 incident show a 07-21 slate while the real
// MLB board was 07-24. Derive the slate date from the newest generated board (MLB or WC), capped at the
// current ET date so a pre-generated future board can't jump the pointer ahead. Guarded by
// admin-status-slate-pointer.test.mjs — this pointer can never silently lag behind the real slate again.
const etToday = new Date(nowIso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const mlbSlateDate = latestMlb ? latestMlb.replace(".json", "") : null;
const wcSlateDate = typeof wcBoard?.date === "string" ? wcBoard.date : null;
const slateDate =
  [mlbSlateDate, wcSlateDate].filter((d) => typeof d === "string" && d <= etToday).sort().at(-1) ??
  dp?.date ??
  null;

// ── Missing-data + stale-route warnings (derived) ───────────────────────────────────────────────
const warnings = [];
if (!wcGames) warnings.push("World Cup board is empty (dormant or needs a refresh).");
if (!mlbGames) warnings.push("MLB board is empty (dormant or needs a refresh).");
if (!moneyGate.dailyTracksCanonical) warnings.push("Daily portfolio activeBankroll ≠ canonical bankroll — roll forward.");
// Slate freshness keys off the real slate pointer (newest board), NOT the daily-portfolio date — a lagging
// daily portfolio means "no card placed yet" (surfaced in nextAction), not stale slate data.
if (slateDate && slateDate < etToday) warnings.push(`Slate (${slateDate}) is behind today (${etToday}) — refresh/roll forward.`);
// Surface a stopped heartbeat as a WARNING too, so it appears on /ops rather than only inside a nested field.
if (heartbeat && heartbeatStale) {
  warnings.push(
    heartbeatAgeHours == null
      ? "Ops heartbeat has no readable lastRunAt — workflow health is unknown, not healthy."
      : `Ops heartbeat is ${heartbeatAgeHours}h old (>${HEARTBEAT_STALE_AFTER_HOURS}h) — an automated cycle was missed.`,
  );
}

// ── Daily checklist (derived completion — the runbook is the source of truth) ───────────────────
const dailyChecklist = [
  { step: "Money gate green", done: moneyGate.pass },
  { step: "Slate is current", done: !!slateDate && slateDate >= etToday },
  { step: "Products generated (WC or MLB)", done: wcGames > 0 || mlbGames > 0 },
  { step: "Bank Builder card decided (active or no-play)", done: bbActive > 0 || bbLanes.length === 0 },
  { step: "No missing-data warnings", done: warnings.length === 0 },
];

// ── Next action heuristic (derived; the runbook is the source of truth) ─────────────────────────
let nextAction;
if (!moneyGate.pass) nextAction = "⚠ MONEY GATE: daily portfolio is stale or bankroll does not reconcile — roll forward / investigate before anything else.";
else if (bbLanes.some((l) => l.status === "active")) nextAction = `Monitor the active Bank Builder lane(s); after ${dp?.date ?? "today"}'s games are official-final, run the nightly settlement (settle_soccer_day.sh --apply).`;
else nextAction = `No active Bank Builder lane for ${dp?.date ?? "today"} — review the daily proposal and approve a card or confirm the no-play.`;

const status = {
  _note: "Machine-readable ops status derived from CANONICAL data. Read-only; never a source of truth for money. Regenerate with build-admin-status.mjs.",
  generatedAt: nowIso,
  canonical,
  moneyGate,
  slate: {
    date: slateDate,
    // dailyPortfolioDate is the money-state pointer (the last placed/settled card's date); it can lag the
    // slate date and that is expected — the settlement heuristics below key off it, not off `date`.
    dailyPortfolioDate: dp?.date ?? null,
    activeBankroll: round2(dp?.activeBankroll), openExposure: round2(dp?.openExposure),
    worldCupGames: (wcBoard?.games ?? []).length, mlbGames: (mlbBoard?.games ?? []).length, mlbSlate: latestMlb ? latestMlb.replace(".json", "") : null,
  },
  productReadiness,
  products: {
    bankBuilder: { activeLanes: bbActive, lanes: bbLanes },
    moonshot: { activeLanes: moonActive, lanes: moonLanes },
  },
  counts: { activeProducts: activeProductCount, pendingApprovals: pendingApprovalCount },
  workflowHealth,
  warnings,
  dailyChecklist,
  lastSettlement: latestSettlement ? { date: latestSettlementFile.replace(".json", ""), matches: (latestSettlement.matches ?? latestSettlement.games ?? []).length } : null,
  nextSettlementDate,
  nextRefreshDate,
  nextAction,
  gates: { note: "Authoritative gates: verify-money-integrity.mjs · forensic-money-audit.mjs · health-check.mjs · smoke-test-production.mjs. This file reports a lightweight cross-check only." },
};

const OUT_PATH = argOut ?? path.join(DATA, "admin", "status.json");
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(status, null, 2) + "\n");

// ── Canonical-money guard: this script must NEVER move money. ────────────────────────────────────
const portfolioMd5After = md5("mr-dub/portfolio.json");
if (portfolioMd5Before !== portfolioMd5After) { console.error(`✗ portfolio.json md5 changed (${portfolioMd5Before} → ${portfolioMd5After}) — build-admin-status must be read-only. ABORT.`); process.exit(1); }

console.log(`✓ admin/status.json written · ${canonical?.record ?? "?"} · $${canonical?.bankroll ?? "?"} · slate ${status.slate.date} · money-gate ${moneyGate.pass ? "PASS" : "FAIL"}`);
console.log(`  next: ${nextAction}`);
