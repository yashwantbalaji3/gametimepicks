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
// Pick the newest NON-FUTURE board, not "the newest board, discarded if future".
//
// The earlier form took latestMlb (the newest file on disk) and then filtered it against etToday. Once a
// board for TOMORROW exists — which happens routinely, the pipeline pre-generates — that filter emptied the
// list and the pointer fell all the way back to dp.date, the lagging MONEY-state date. That is precisely
// the July-24 incident this logic exists to prevent, re-created by a future board instead of a stale one.
// Caught by admin-status-slate-pointer.test.mjs, which pins the clock to 2026-07-24 while a 2026-07-25
// board sits on disk. Now: consider EVERY dated board and take the newest one at or before today.
const newestNonFuture = (dates) =>
  dates.filter((d) => typeof d === "string" && d <= etToday).sort().at(-1) ?? null;
const mlbBoardDates = listDated("mlb/boards").map((f) => f.replace(".json", ""));
const slateDate =
  newestNonFuture([...mlbBoardDates, wcSlateDate].filter(Boolean)) ?? dp?.date ?? null;


// ── Sportsbook source freshness (ARTIFACT-level only) ───────────────────────────────────────────
// The market feed carries no row-level timestamps (measured 0% on every live row), so freshness is
// a property of the FILE. This mirrors src/lib/markets/freshness.ts rather than importing it: the
// slate-pointer guard invokes this script with plain `node`, which cannot load TypeScript. A parity
// test pins the two implementations together so they cannot drift.
const sportsbookSource = (dir) => {
  const artifactDate = listDated(dir).map((f) => f.replace(".json", "")).at(-1) ?? null;
  if (!artifactDate) return { source: dir, state: "MISSING", artifactDate: null, generatedAt: null, ageDays: null };
  let generatedAt = null;
  try {
    generatedAt = JSON.parse(fs.readFileSync(path.join(DATA, dir, `${artifactDate}.json`), "utf8")).generatedAt ?? null;
  } catch { /* unreadable artifact ⇒ no timestamp claim */ }
  const ageDays = Math.round((Date.parse(`${etToday}T00:00:00Z`) - Date.parse(`${artifactDate}T00:00:00Z`)) / 86400000);
  // A future-dated artifact fails closed rather than reading as current.
  const state = ageDays < 0 ? "ANOMALY" : ageDays === 0 ? "CURRENT" : "STALE";
  return { source: dir, state, artifactDate, generatedAt, ageDays };
};
const sportsbook = {
  note: "Artifact-level freshness only — the market feed carries no row-level timestamps, so no per-market recency can be claimed.",
  sources: ["mlb/team-markets", "mlb/player-props"].map(sportsbookSource),
};

// ── Missing-data + stale-route warnings (derived) ───────────────────────────────────────────────
const warnings = [];
if (!wcGames) warnings.push("World Cup board is empty (dormant or needs a refresh).");
for (const src of sportsbook.sources) {
  if (src.state !== "CURRENT") {
    warnings.push(`Sportsbook source ${src.source} is ${src.state}${src.ageDays != null ? ` (${src.ageDays}d old)` : ""}.`);
  }
}
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


// ── SPRINT 037A · TODAY READINESS ────────────────────────────────────────────────────────────────
// `workflowHealth` answers "did the last workflow finish?", which is a different question from "is
// today's slate ready?". On 2026-07-28 at 09:28 ET it read {status:"pass", phase:"nightly-settle"}
// while ZERO artifacts existed for the day — correct on its own terms and useless to a founder asking
// whether the site is current.
//
// This block answers the founder's question directly, and is SCHEDULE-AWARE so it never cries wolf: a
// missing artifact before its generator is due is `pending`, not `late`. Times are the real crons.
const READINESS_STAGES = [
  // VERIFIED against the workflows that actually stage each path, not assumed. An early draft credited
  // the schedule to mlb-pregame-capture (07:00 ET) and produced a false "late" at 09:30; git history and
  // the `git add` lines show morning-projections.yml:216 and mlb-daily-production.yml:161 write it.
  { key: "schedule",    dir: "mlb/schedule",               dueEtHour: 9,  dueEtMinute: 30, by: "morning-projections" },
  { key: "board",       dir: "mlb/boards",                 dueEtHour: 9,  dueEtMinute: 30, by: "morning-projections" },
  { key: "teamMarkets", dir: "mlb/team-markets",           dueEtHour: 10, dueEtMinute: 15, by: "mlb-daily-production" },
  { key: "playerProps", dir: "mlb/player-props",           dueEtHour: 10, dueEtMinute: 15, by: "mlb-daily-production" },
  { key: "simulations", dir: "mlb/full-game-simulations",  dueEtHour: 10, dueEtMinute: 15, by: "mlb-daily-production" },
  { key: "predictions", dir: "mlb/predictions",            dueEtHour: 10, dueEtMinute: 15, by: "mlb-daily-production" },
];
/** Grace before a missing artifact is called late — a workflow needs time to actually run. */
const READINESS_GRACE_MINUTES = 45;

function etParts(iso) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

const nowEt = etParts(nowIso);
const todayReadinessStages = READINESS_STAGES.map((st) => {
  const present = fs.existsSync(path.join(DATA, st.dir, `${nowEt.date}.json`));
  const dueMinutes = st.dueEtHour * 60 + st.dueEtMinute + READINESS_GRACE_MINUTES;
  const overdue = nowEt.minutes > dueMinutes;
  return {
    stage: st.key,
    present,
    // `pending` is an honest third state: absent but not yet due. Reporting it as a failure would
    // train the reader to ignore this block every morning.
    state: present ? "ready" : overdue ? "late" : "pending",
    dueEt: `${String(st.dueEtHour).padStart(2, "0")}:${String(st.dueEtMinute).padStart(2, "0")}`,
    producedBy: st.by,
  };
});

const lateStages = todayReadinessStages.filter((s) => s.state === "late");
const readyStages = todayReadinessStages.filter((s) => s.state === "ready");
const todayReadiness = {
  _note: "Answers 'is TODAY's slate ready?' — distinct from workflowHealth, which answers 'did the last workflow finish?'.",
  etDate: nowEt.date,
  etTime: `${String(Math.floor(nowEt.minutes / 60)).padStart(2, "0")}:${String(nowEt.minutes % 60).padStart(2, "0")}`,
  stages: todayReadinessStages,
  readyCount: readyStages.length,
  totalStages: todayReadinessStages.length,
  lateCount: lateStages.length,
  // GREEN only when everything due has arrived. RED when something is genuinely overdue. YELLOW while
  // the day is still filling in — the normal morning state, and not a fault.
  signal: lateStages.length > 0 ? "RED" : readyStages.length === todayReadinessStages.length ? "GREEN" : "YELLOW",
  summary:
    lateStages.length > 0
      ? `${lateStages.length} stage(s) overdue: ${lateStages.map((s) => `${s.stage} (due ${s.dueEt} ET via ${s.producedBy})`).join(", ")}`
      : readyStages.length === todayReadinessStages.length
        ? "every stage for today has been produced"
        : `${readyStages.length}/${todayReadinessStages.length} produced; the rest are not due yet`,
};

// ── SPRINT 048 · learning-loop observability ─────────────────────────────────────────────────────
//
// The prediction-history exporter froze on 2026-07-08 and nobody noticed for three weeks. Nothing went
// red; the corpus simply stopped growing while every downstream calibration conclusion kept being
// computed on it. Scheduling it (Sprint 048) prevents that instance. This makes the NEXT one visible:
// /ops now reports whether the learning loop actually has complete data, derived from the artifacts
// rather than from whether a workflow exited zero.
//
// Read-only and fail-soft: a missing artifact reports UNKNOWN, never a fabricated "pass".
function readLearningLoop() {
  const base = path.join(APP, "..", "data/internal/mlb/model-learning");
  const read = (rel) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(base, rel), "utf8"));
    } catch {
      return null;
    }
  };

  const freshness = read("learning-freshness.json");
  const registry = read("registry.json");
  const autopsy = read("autopsy/latest.json");

  if (!freshness && !registry) {
    return {
      signal: "UNKNOWN",
      summary: "no learning-loop artifacts on disk — the loop has never run here",
      freshness: null, registry: null, lastAutopsyDate: null,
    };
  }

  const healthy = freshness?.healthy === true;
  const statuses = registry?.markets
    ? Object.fromEntries(Object.entries(registry.markets).map(([m, v]) => [m, v.status]))
    : null;
  const disabled = statuses ? Object.entries(statuses).filter(([, v]) => v === "DISABLED").map(([m]) => m) : [];

  return {
    // GREEN only when the corpus genuinely covers the ledger. A stale corpus is YELLOW, not green —
    // it is not an outage, but every conclusion drawn from it is out of date.
    signal: freshness == null ? "UNKNOWN" : healthy ? "GREEN" : "YELLOW",
    summary: freshness == null
      ? "freshness has not been evaluated"
      : healthy
        ? `learning data complete through ${freshness.asOfSettledDate} (${freshness.stats?.corpusRows ?? "?"} rows)`
        : `learning data INCOMPLETE: ${(freshness.problems ?? []).join("; ")}`,
    freshness: freshness
      ? {
          healthy, asOfSettledDate: freshness.asOfSettledDate,
          corpusRows: freshness.stats?.corpusRows ?? null,
          ledgerRows: freshness.stats?.ledgerRows ?? null,
          lagDays: freshness.stats?.lagDays ?? null,
          problems: freshness.problems ?? [],
        }
      : null,
    registry: registry
      ? { asOfSettledDate: registry.asOfSettledDate, totalDecisiveRows: registry.totalDecisiveRows, statuses, disabledMarkets: disabled }
      : null,
    lastAutopsyDate: autopsy?.date ?? null,
    lastAutopsyRecommendation: autopsy?.recommendation ?? null,
  };
}

const learningLoop = readLearningLoop();

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
  sportsbook,
  productReadiness,
  products: {
    bankBuilder: { activeLanes: bbActive, lanes: bbLanes },
    moonshot: { activeLanes: moonActive, lanes: moonLanes },
    // P211: the day's typed lifecycle + watchdog, read VERBATIM from the daily receipt writer's
    // artifact (one writer owns the derivation; this file only surfaces it). A missing receipt is
    // itself the finding — typed here exactly the way the watchdog would type it.
    dailyLifecycle: (() => {
      const receipt = (() => { try { return JSON.parse(fs.readFileSync(path.join(APP, "..", "data", "internal", "products", "receipts", `${slateDate}.json`), "utf8")); } catch { return null; } })();
      if (!receipt) {
        return {
          receiptDate: slateDate, present: false,
          watchdog: ["bank-builder", "moonshot"].map((product) => ({ product, kind: "MISSING_DAILY_EVALUATION", detail: `no daily receipt exists for ${slateDate}` })),
          states: null,
        };
      }
      return {
        receiptDate: receipt.date, present: true, generatedAt: receipt.generatedAt,
        watchdog: receipt.watchdog ?? [],
        states: Object.fromEntries((receipt.products ?? []).filter((p) => p.lifecycle).map((p) => [p.product, { state: p.lifecycle.state, policyVersion: p.lifecycle.policyVersion }])),
      };
    })(),
  },
  counts: { activeProducts: activeProductCount, pendingApprovals: pendingApprovalCount },
  workflowHealth,
  todayReadiness,
  learningLoop,
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
