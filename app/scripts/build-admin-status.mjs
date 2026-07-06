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
    date: dp?.date ?? null,
    activeBankroll: round2(dp?.activeBankroll), openExposure: round2(dp?.openExposure),
    worldCupGames: (wcBoard?.games ?? []).length, mlbGames: (mlbBoard?.games ?? []).length, mlbSlate: latestMlb ? latestMlb.replace(".json", "") : null,
  },
  products: {
    bankBuilder: { activeLanes: bbLanes.filter((l) => l.status === "active").length, lanes: bbLanes },
    moonshot: { activeLanes: moonLanes.filter((l) => l.status === "active").length, lanes: moonLanes },
  },
  lastSettlement: latestSettlement ? { date: latestSettlementFile.replace(".json", ""), matches: (latestSettlement.matches ?? latestSettlement.games ?? []).length } : null,
  nextAction,
  gates: { note: "Authoritative gates: verify-money-integrity.mjs · forensic-money-audit.mjs · health-check.mjs · smoke-test-production.mjs. This file reports a lightweight cross-check only." },
};

fs.mkdirSync(path.join(DATA, "admin"), { recursive: true });
fs.writeFileSync(path.join(DATA, "admin", "status.json"), JSON.stringify(status, null, 2) + "\n");

// ── Canonical-money guard: this script must NEVER move money. ────────────────────────────────────
const portfolioMd5After = md5("mr-dub/portfolio.json");
if (portfolioMd5Before !== portfolioMd5After) { console.error(`✗ portfolio.json md5 changed (${portfolioMd5Before} → ${portfolioMd5After}) — build-admin-status must be read-only. ABORT.`); process.exit(1); }

console.log(`✓ admin/status.json written · ${canonical?.record ?? "?"} · $${canonical?.bankroll ?? "?"} · slate ${status.slate.date} · money-gate ${moneyGate.pass ? "PASS" : "FAIL"}`);
console.log(`  next: ${nextAction}`);
