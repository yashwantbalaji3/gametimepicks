/**
 * PHASE 1 — Bank Builder proposal-card settled-detection. The approved-card snapshot (BankBuilderProposalCard
 * source) overlays the OFFICIAL settled result from the canonical ladder (won → legs "hit" / lane "won"),
 * never a stale "awaiting settlement" and never a fabricated hit; a genuinely UNSETTLED step falls back to
 * the honest kickoff-derived lifecycle. DISPLAY-ONLY — canonical money is never touched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { makeSettledApprovedRoot } from "../__testsupport__/settled-ladder-root.mjs";

const DATA = path.join(process.cwd(), "public", "data");
const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
const MONEY_MD5 = "affe6b21071f2b3be96bb2774eb347c3";
const POST_SETTLE = Date.UTC(2026, 6, 8, 3, 0); // ~11pm ET July-7, after both games

test("settled July-7 Lane A Step-2 → reads settled ladder state: laneStatus WON, legs hit", async () => {
  const { loadApprovedBankBuilder } = await import("./bank-builder-proposal.ts");
  // The July-21 review restart pushed the settled July-7 cycle into the live ladder's priorLane; reconstruct the
  // pre-restart settled ladder so the official WON/legs-hit result is read from canonical July-7 ladder state.
  const { tmp, dataRoot } = makeSettledApprovedRoot(DATA);
  let ap;
  try {
    ap = loadApprovedBankBuilder(dataRoot, "2026-07-07", POST_SETTLE);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const a = ap.lanes[0];
  assert.equal(a.laneStatus, "won", "settled Step-2 renders WON (from the ladder)");
  assert.notEqual(a.laneStatus, "awaiting_settlement", "no stale awaiting-settlement for a settled card");
  assert.ok(a.legs.every((l) => l.legStatus === "hit"), "both officially-settled legs read hit");
});

test("settled card keeps BOTH leg details visible (Colombia or Draw + Argentina to win)", async () => {
  const { loadApprovedBankBuilder } = await import("./bank-builder-proposal.ts");
  const a = loadApprovedBankBuilder(DATA, "2026-07-07", POST_SETTLE).lanes[0];
  assert.equal(a.legs.length, 2, "both legs still present as history");
  assert.match(a.legs[0].selection, /Colombia or Draw/);
  assert.match(a.legs[1].selection, /Argentina to win/);
});

test("settled state does NOT auto-generate a Step-3 card (only the approved Lane A surfaces)", async () => {
  const { loadApprovedBankBuilder } = await import("./bank-builder-proposal.ts");
  const ap = loadApprovedBankBuilder(DATA, "2026-07-07", POST_SETTLE);
  assert.equal(ap.lanes.length, 1, "exactly one lane (approved Lane A) — no generated Step-3 lane");
  assert.equal(ap.lanes[0].step, 2, "still the settled Step-2 card, not a fresh Step-3");
});

test("UNSETTLED approved step falls back to the kickoff lifecycle — NEVER a fabricated hit (fixture root)", async () => {
  const { loadApprovedBankBuilder } = await import("./bank-builder-proposal.ts");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-bbprop-"));
  try {
    fs.mkdirSync(path.join(tmp, "mr-dub"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "methodology", "launch"), { recursive: true });
    // Approved card for a FUTURE date: Lane A Step 3, legs kick off later than our test "now".
    fs.writeFileSync(path.join(tmp, "mr-dub", "bank-builder-approved.json"), JSON.stringify({
      date: "2026-07-09", stake: 305.57, lanes: [{
        lane: "A", step: 3, kind: "survival", label: "Lane A", combinedOdds: -120, combinedDecimal: 1.83,
        modelProbability: 0.6, confidence: "High", whyLadderPick: "x", whyItCouldFail: "y",
        legs: [
          { market: "moneyline_90", marketLabel: "Match Result", selection: "Team X to win", americanOdds: -150, modelProbability: 0.6, gameSlug: "x-vs-y-2026-07-09", matchup: "X v Y", homeCode: "XX", aligned: true, kickoffUtc: "2026-07-09T20:00:00Z" },
          { market: "double_chance", marketLabel: "Double Chance", selection: "Team Z or Draw", americanOdds: -140, modelProbability: 0.62, gameSlug: "z-vs-w-2026-07-09", matchup: "Z v W", homeCode: "ZZ", aligned: true, kickoffUtc: "2026-07-09T20:00:00Z" },
        ],
      }],
    }));
    // Ladder: Lane A advanced to step 2; step 3 is NOT settled.
    fs.writeFileSync(path.join(tmp, "methodology", "launch", "dual-bank-builder-active.json"), JSON.stringify({
      run: { laneA: { currentStep: 2, laneStatus: "advanced", cycle: 8, steps: [{ step: 1, status: "settled", result: "won" }, { step: 2, status: "settled", result: "won" }] } },
    }));
    // "now" BEFORE the July-9 kickoff → the unsettled card is pregame (unchanged behavior).
    const a = loadApprovedBankBuilder(tmp, "2026-07-09", Date.UTC(2026, 6, 9, 12, 0)).lanes[0];
    assert.equal(a.laneStatus, "pregame", "unsettled + pre-kickoff → pregame (future-day behavior intact)");
    assert.ok(a.legs.every((l) => l.legStatus === "pregame"), "unsettled legs are pregame");
    assert.ok(a.legs.every((l) => l.legStatus !== "hit" && l.legStatus !== "missed"), "NEVER a fabricated hit/miss for an unsettled step");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("proposal-card settled-detection touches NO canonical money", () => {
  assert.equal(md5(path.join(DATA, "mr-dub", "portfolio.json")), MONEY_MD5, "portfolio.json md5 unchanged");
});
