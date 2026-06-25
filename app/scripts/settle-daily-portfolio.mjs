#!/usr/bin/env node
/**
 * Settle the active daily paper portfolio against OFFICIAL results — SEED-MODEL settlement.
 *
 *   npx tsx app/scripts/settle-daily-portfolio.mjs --date 2026-06-23            (dry-run, default)
 *   npx tsx app/scripts/settle-daily-portfolio.mjs --date 2026-06-23 --apply    (mutates canonical state)
 *
 * Grades each ACTIVE Bank Builder lane card from the official results bundle
 * `world-cup/settlement/<date>.json` — graded from API-Football (FT regulation + /fixtures/players),
 * NEVER fabricated. On --apply it advances the canonical ladder + record per the SEED MODEL:
 *
 *   WON      → write the settled step into the active dual-BB ladder (status "settled", result "won",
 *              with `payout` = the rolled balance), record.wins += 1 per won lane. Bankroll + crown are
 *              UNCHANGED — a won step ROLLS (the rolled balance is the lane's display/target, NOT realized
 *              cash; the at-risk amount is the $100 seed). The lane advances to the next rung.
 *   LOST     → write the settled-lost step, record.losses += 1, bankroll -= $100 SEED (the only at-risk
 *              amount), crown UNCHANGED, laneStatus → "stopped".
 *   VOID     → drop the card (seed returned, no record change, lane stays awaiting).
 *   NOT-FINAL → REFUSE the entire apply (no partial / fake settlement).
 *
 * HARD MONEY GUARDS (enforced before any write):
 *   • A WON-only settlement must leave bankroll + crown bit-for-bit unchanged, else abort.
 *   • record.wins must increase by exactly the number of WON lanes; record.losses by exactly the LOST.
 *   • Idempotent: a step already "settled" in the ladder is never re-settled.
 *   • The crown is NEVER written by this script.
 */
import fs from "node:fs";
import path from "node:path";
import { gradeLaneCard, seedModelOutcome, classifyLaneTransition } from "../src/lib/settlement/daily-portfolio-settle.ts";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const date = val("--date", new Date().toISOString().slice(0, 10));
const apply = has("--apply");
const root = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app", "public", "data");

const round2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const DP_FILE = path.join(root, "mr-dub", "daily-portfolio.json");
const PORT_FILE = path.join(root, "mr-dub", "portfolio.json");
const LADDER_FILE = path.join(root, "methodology", "launch", "dual-bank-builder-active.json");
const OFFICIAL_FILE = path.join(root, "world-cup", "settlement", `${date}.json`);

function fail(msg, code = 1) { console.error(`[settle] ${msg}`); process.exit(code); }

let dp, official, portfolio, ladderDoc;
try { dp = readJson(DP_FILE); } catch { fail(`no daily portfolio at ${DP_FILE}`); }
if (dp.date !== date) fail(`daily portfolio is for ${dp.date}, not ${date}`);
try { official = readJson(OFFICIAL_FILE); } catch { fail(`no official results bundle at ${OFFICIAL_FILE} — settlement is gated on official finals (no fake settlement)`, 2); }
try { portfolio = readJson(PORT_FILE); } catch { fail(`no portfolio at ${PORT_FILE}`); }
try { ladderDoc = readJson(LADDER_FILE); } catch { fail(`no active ladder at ${LADDER_FILE}`); }

const gradedCards = (official.graded ?? []).filter((g) => g.product === "bank-builder");

const activeBb = (dp.lanes ?? []).filter((l) => (l.product === "bank-builder" || /Bank/.test(l.productLabel ?? "")) && l.status === "active");

console.log(`=== Settle daily portfolio · ${apply ? "APPLY" : "DRY-RUN"} · ${date} · ${activeBb.length} active Bank Builder lane(s) ===`);
console.log(`Official source: ${official.settlementSource ?? "(unspecified)"}\n`);

/** Grade one active lane against the official bundle (pure grading lives in lib/settlement). */
function planLane(laneCard) {
  const plan = gradeLaneCard(laneCard, official); // { laneLetter, status, payout, reason?, settledLegs }
  const graded = gradedCards.find((g) => new RegExp(`Lane ${plan.laneLetter}\\b`).test(g.card ?? ""));
  return { ...plan, laneCard, graded };
}

const plans = activeBb.map(planLane);
for (const p of plans) {
  const card = p.laneCard;
  console.log(`  Bank Builder Lane ${p.laneLetter} · Step ${card.step} · stake $${fmt(card.stake)} · ${card.legCount} legs → ${String(p.status).toUpperCase()}${p.reason ? ` (${p.reason})` : ""}`);
  for (const lg of card.legs ?? []) {
    const g = (p.graded?.legs ?? []).find((x) => x.odds === lg.odds) ?? {};
    console.log(`     ${lg.matchup} · ${lg.market}: ${lg.selection} (${lg.odds > 0 ? "+" : ""}${lg.odds}) → ${g.result ?? "pending"}${g.reason ? ` · ${g.reason}` : ""}`);
  }
  if (p.status === "won") console.log(`     ⇒ rolls $${fmt(card.stake)} → $${fmt(p.payout)} (won step: bankroll + crown UNCHANGED, record +1)`);
  if (p.status === "lost") console.log(`     ⇒ Lane ${p.laneLetter} STOPS · -$100 seed · record +1 loss`);
}

const pending = plans.filter((p) => p.status === "pending");
console.log(`\nBankroll $${fmt(portfolio.currentBankroll)} · crown $${fmt(portfolio.crownBankroll)} (NEVER touched) · record ${portfolio.record.wins}-${portfolio.record.losses} · core exposure $${fmt(portfolio.openExposure)}`);

if (!apply) {
  console.log(`\nDry-run only — no settlement performed.${pending.length ? ` (${pending.length} lane(s) not yet final — would refuse --apply.)` : " All active lanes are official-final and settle-able."}`);
  process.exit(0);
}

// ---- APPLY ----
if (pending.length) fail(`--apply REFUSED: ${pending.length} lane(s) not officially final. No partial/fake settlement performed.`, 2);

const before = { bankroll: round2(portfolio.currentBankroll), crown: round2(portfolio.crownBankroll), wins: portfolio.record.wins, losses: portfolio.record.losses };
const ladderRun = ladderDoc.run ?? ladderDoc;
const laneKeyFor = (letter) => (letter === "A" ? "laneA" : "laneB");
const awaiting = portfolio.awaitingCards ?? [];
const completions = [];
let wonCount = 0, lostCount = 0;

for (const p of plans) {
  const letter = p.laneLetter;
  const lane = ladderRun[laneKeyFor(letter)];
  if (!lane) fail(`active ladder has no lane ${letter}`);
  const stepNo = p.laneCard.step;
  const idx = (lane.steps ?? []).findIndex((s) => s.step === stepNo);
  if (idx < 0) fail(`active ladder Lane ${letter} has no Step ${stepNo} slot`);
  const existing = lane.steps[idx];
  if (existing.status === "settled") { console.log(`  (idempotent) Lane ${letter} Step ${stepNo} already settled — skipped.`); continue; }

  if (p.status === "won") {
    lane.steps[idx] = {
      step: stepNo, status: "settled", result: "won", slateDate: date,
      combinedOdds: p.laneCard.combinedOdds ?? null,
      laneSurvivalScore: existing.laneSurvivalScore ?? null,
      estimatedHitProbability: existing.estimatedHitProbability ?? null,
      stake: round2(p.laneCard.stake), projectedPayout: p.payout, payout: p.payout,
      freshCard: true, legs: p.settledLegs,
    };
    lane.currentStep = stepNo;
    lane.nextStepStake = p.payout;
    if (lane.laneStatus !== "stopped") lane.laneStatus = "advanced";
    wonCount++;
    // Classify the transition: a win on the FINAL rung COMPLETES the ladder. Dual-lane completion banking
    // is not yet a tested money model, so we record the completion + flag it for the operator rather than
    // silently rolling ~$10k (which would understate the bankroll). The win still counts in the record.
    const clearedBefore = (lane.steps ?? []).filter((s) => s.status === "settled" && s.result === "won" && s.step !== stepNo).length;
    const transition = classifyLaneTransition(clearedBefore, "won");
    const a = awaiting.find((c) => c.laneId === `lane-${letter.toLowerCase()}`);
    if (transition === "complete") {
      lane.laneStatus = "completed";
      const note = `Lane ${letter} COMPLETED the ladder at Step ${stepNo} (official) — final value $${fmt(p.payout)}. Completion banking is OPERATOR-GATED (dual-lane banking is not an auto-applied money model).`;
      if (a) { a.step = stepNo; a.kind = "ladder_completed"; a.note = note; }
      else awaiting.push({ laneId: `lane-${letter.toLowerCase()}`, step: stepNo, kind: "ladder_completed", note });
      completions.push({ laneId: `lane-${letter.toLowerCase()}`, lane: letter, step: stepNo, finalValue: p.payout, slateDate: date });
      console.log(`     ⚑ Lane ${letter} COMPLETED the ladder ($${fmt(p.payout)}) — banking is operator-gated, bankroll NOT auto-moved.`);
    } else {
      const note = `Lane ${letter} Step ${stepNo} cleared (official) — $${fmt(p.laneCard.stake)} rolls to $${fmt(p.payout)}, awaiting the next qualified card.`;
      if (a) { a.step = stepNo; a.kind = "awaiting_next_card"; a.note = note; }
      else awaiting.push({ laneId: `lane-${letter.toLowerCase()}`, step: stepNo, kind: "awaiting_next_card", note });
    }
  } else if (p.status === "lost") {
    lane.steps[idx] = {
      step: stepNo, status: "settled", result: "lost", slateDate: date,
      combinedOdds: p.laneCard.combinedOdds ?? null,
      stake: round2(p.laneCard.stake), projectedPayout: 0, payout: 0,
      freshCard: true, legs: p.settledLegs,
    };
    lane.currentStep = stepNo;
    lane.laneStatus = "stopped";
    lostCount++; // the lost $100 SEED (the at-risk amount, not the rolled balance) is applied by seedModelOutcome below
  } else if (p.status === "void" || p.status === "push") {
    console.log(`  Lane ${letter} Step ${stepNo} VOID — seed returned, no record change, lane stays awaiting.`);
  }
  // NOTE: daily-portfolio.json is a REGENERATED daily artifact (activate-daily-portfolio.mjs reads the
  // advanced ladder), so we deliberately do NOT hand-mutate it here — re-generate it for the new day after
  // settling. This keeps the ladder + portfolio.json as the single source of truth.
}

// Apply record + bankroll via the SEED MODEL (lib-enforced; throws if any lane is still pending).
const outcome = seedModelOutcome({ record: { ...portfolio.record }, bankroll: before.bankroll }, plans);
portfolio.record = outcome.record;
portfolio.currentBankroll = outcome.bankroll; // ONLY lost seeds move the bankroll; won steps roll
portfolio.openExposure = 0;
if (typeof portfolio.totalOpenExposure === "number") portfolio.totalOpenExposure = 0;
portfolio.awaitingCards = awaiting;
// Lane completions are recorded as a pending-operator flag — NEVER auto-banked into bankroll/crown.
if (completions.length) {
  portfolio.pendingLaneCompletions = [...(portfolio.pendingLaneCompletions ?? []), ...completions];
  console.error(`\n[settle] ⚑ ${completions.length} lane(s) COMPLETED the ladder — completion banking is operator-gated and was NOT applied to bankroll/crown. Flagged in portfolio.pendingLaneCompletions.`);
}

// ---- HARD GUARDS (defence-in-depth on top of the lib invariants) ----
if (portfolio.crownBankroll !== before.crown) fail(`ABORT: crown changed ${before.crown} → ${portfolio.crownBankroll} (crown is immutable)`);
if (outcome.lostCount === 0 && portfolio.currentBankroll !== before.bankroll) {
  fail(`ABORT: all lanes WON but bankroll changed ${before.bankroll} → ${portfolio.currentBankroll} (won steps must roll, not realize)`);
}
if (outcome.wonCount !== wonCount || outcome.lostCount !== lostCount) {
  fail(`ABORT: lib/loop settlement disagree (lib ${outcome.wonCount}W/${outcome.lostCount}L vs loop ${wonCount}W/${lostCount}L)`);
}

fs.writeFileSync(LADDER_FILE, JSON.stringify(ladderDoc, null, 2) + "\n");
fs.writeFileSync(PORT_FILE, JSON.stringify(portfolio, null, 2) + "\n");

console.log(`\n[settle] APPLIED ${date}: ${wonCount} won, ${lostCount} lost.`);
console.log(`  record ${before.wins}-${before.losses} → ${portfolio.record.wins}-${portfolio.record.losses}`);
console.log(`  bankroll $${fmt(before.bankroll)} → $${fmt(portfolio.currentBankroll)}  (crown $${fmt(portfolio.crownBankroll)} unchanged)`);
console.log(`  core exposure → $0 · both lanes advanced, awaiting their next qualified card`);
console.log(`  wrote: ${path.relative(process.cwd(), LADDER_FILE)}, ${path.relative(process.cwd(), PORT_FILE)}`);
console.log(`  NEXT: regenerate the daily portfolio for the new day — npx tsx app/scripts/activate-daily-portfolio.mjs --date <next> --apply`);
