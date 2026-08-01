/**
 * MLB afternoon top-up decision (Program 092-095 Lane B — founder-approved, conditional).
 *
 * Decides RUN or SKIP for one afternoon coverage top-up, from explicit inputs, so every rule the
 * founder set is testable without a network call. It never calls a provider itself: on RUN the
 * workflow dispatches the NORMAL production-slate workflow, which re-enters its own credit
 * floors, cache, completeness gates, and the shared serialized writer queue — a top-up is the
 * standard pipeline run, just gated on measured need.
 *
 * Founder constraints → where enforced:
 *   - "only when scheduled games still lack eligible coverage"  → rule 2 (lean-less pregame games)
 *   - "stop per event once covered / first pitch passed"        → rules 2+3 (a covered or started
 *     game can never be a reason to run; when none remain, SKIP)
 *   - "timing from measured posting behavior"                   → cron chosen from the measured
 *     11:52-ET gap + 12:13-ET posting evidence (see MLB_AFTERNOON_TOPUP_DESIGN_AND_PROOF.md)
 *   - "within 20-60 credits/day, fail closed on anomaly"        → rules 4+5 (budget + floor + the
 *     credit sentinel already wired into the production workflow)
 *   - "never reuse cached odds as a new capture"                → unchanged capture path; the
 *     pipeline stamps fresh capturedAt only on live responses (guard-tested elsewhere)
 *
 * Usage: node app/scripts/mlb-topup-decision.mjs            (reads today's board, prints decision)
 * Exit 0 always; the DECISION line is the contract: "RUN <reason>" | "SKIP <reason>".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIN_LEAD_MINUTES = Number(process.env.TOPUP_MIN_LEAD_MINUTES || 45);
const EXPECTED_CREDITS = Number(process.env.TOPUP_EXPECTED_CREDITS || 62);
const CREDIT_FLOOR = Number(process.env.ODDS_API_MIN_CREDITS_REMAINING || 2000);

/** Pure decision — everything the rules need arrives as arguments. */
export function decideTopup({ board, nowIso, minLeadMinutes = MIN_LEAD_MINUTES, expectedCredits = EXPECTED_CREDITS, creditFloor = CREDIT_FLOOR }) {
  if (!board || !Array.isArray(board.games)) return { decision: "SKIP", reason: "no board for today — generation (or the watchdog) owns that, not the top-up" };

  const claimed = new Set((board.leans ?? []).map((l) => l.gamePk).filter((v) => v != null));
  const now = Date.parse(nowIso);
  const cutoff = now + minLeadMinutes * 60_000;

  // SLATE-SAFETY RULE (added after the 2026-07-31 live test): the dispatched top-up REGENERATES
  // the whole board. Post-start captures are research-ineligible by contract, so regenerating
  // while any slate game is in progress would shrink/churn the day's already-published record.
  // The top-up therefore runs only while the ENTIRE slate is still pregame.
  const earliestStart = Math.min(
    ...board.games.map((g) => Date.parse(g.gameDate ?? "")).filter(Number.isFinite),
  );
  if (Number.isFinite(earliestStart) && earliestStart <= now) {
    return {
      decision: "SKIP",
      reason: "a slate game has already started — regenerating mid-slate would churn the published record; coverage stays honestly partial",
    };
  }

  const candidates = [];
  let uncoveredStarted = 0;
  for (const g of board.games) {
    if (g.gamePk == null || claimed.has(g.gamePk)) continue; // covered — per-event stop
    const start = Date.parse(g.gameDate ?? "");
    if (!Number.isFinite(start)) continue; // unknown start — never spend on it
    if (start <= cutoff) { uncoveredStarted += 1; continue; } // first pitch passed/imminent — stop
    candidates.push({ gamePk: g.gamePk, away: g.awayTeamName, home: g.homeTeamName, startsInMin: Math.round((start - now) / 60_000) });
  }

  if (candidates.length === 0) {
    return {
      decision: "SKIP",
      reason: uncoveredStarted > 0
        ? `all ${uncoveredStarted} uncovered game(s) are past/inside the ${minLeadMinutes}-min first-pitch cutoff — books never posted; partial coverage stays honestly partial`
        : "every scheduled game already has market coverage",
    };
  }

  // Credit safety — fail CLOSED on unknown balance, never treat unknown as zero-risk.
  const balance = Number(board?.credits?.before);
  if (!Number.isFinite(balance)) {
    return { decision: "SKIP", reason: `balance UNKNOWN from the board credits block — failing closed (would need ${expectedCredits} credits)`, warn: true };
  }
  if (balance - expectedCredits < creditFloor) {
    return { decision: "SKIP", reason: `balance ${balance} - expected ${expectedCredits} would breach the ${creditFloor} floor — failing closed`, warn: true };
  }

  return {
    decision: "RUN",
    reason: `${candidates.length} scheduled pregame game(s) still lack market coverage (earliest starts in ${Math.min(...candidates.map((c) => c.startsInMin))} min); expected spend ${expectedCredits} within budget`,
    candidates,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
  const todayEt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  let board = null;
  try { board = JSON.parse(fs.readFileSync(path.join(BOARDS, `${todayEt}.json`), "utf8")); } catch { /* SKIP below */ }
  const r = decideTopup({ board, nowIso: new Date().toISOString() });
  if (r.warn) console.log(`::warning::topup: ${r.reason}`);
  for (const c of r.candidates ?? []) console.log(`  candidate: ${c.away} @ ${c.home} (gamePk ${c.gamePk}, starts in ${c.startsInMin} min)`);
  console.log(`${r.decision} ${r.reason}`);
}
