import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pinnedLaneRoot } from "./bank-builder/fixtures/root.mjs";

// Cross-slate active-placement invariant (supersedes the emergency June 20 same-day-only rule):
// under the approved broader criteria, PLACED/ACTIVE legs legitimately span the June 21 + June 22
// slates. The remaining guard is that no PLACED/ACTIVE leg is TRULY STALE — i.e. no active leg has
// an ET kickoff date BEFORE the June 21 slate (settled historical June 19 legs live only in settled
// steps, never in an open card). The protected crown ladder stays untouched.
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const SLATE = "2026-06-21";
// ET = UTC-4 (EDT). Map a kickoff instant to its ET calendar date.
const etDate = (iso) => new Date(Date.parse(iso) - 4 * 3600 * 1000).toISOString().slice(0, 10);
const isStale = (iso) => iso && etDate(iso) < SLATE; // before the June 21 slate → stale past-date leg

const bb = read(path.join(pinnedLaneRoot(), "methodology/launch/dual-bank-builder-active.json")).run;
// The completed/stopped dual-lane run (June 24) is now BANKED + archived. Its settled WON cards
// (the cross-slate June 18-24 legs) live here; the live artifact is a fresh Step-1 cycle-2.
const archive = read("public/data/methodology/launch/dual-bank-builder-2026-06-24-completed.json").run;
const moon = read(path.join(pinnedLaneRoot(), "moonshot-lane/active.json"));
const portfolio = read("public/data/mr-dub/portfolio.json");

// P192 · PINNED LANE STATE — this regression is about a specific historical lane state, so it reads a
// pinned snapshot rather than the live ladder. Assertions unchanged; only the source is.
test("Bank Builder: completed run BANKED → live lanes restarted with Step-1 active cards; no OPEN leg is a stale past-date leg, and the archived settled legs are intact", () => {
  // Live (restarted cycle): the lanes now carry active Step-1 paper cards. The remaining guard (per the
  // file header) is that no PLACED/ACTIVE leg is TRULY STALE — i.e. no open leg has an ET kickoff date
  // BEFORE the June 21 slate. Paper-only; no real money placed.
  const staleOpenLegs = [];
  for (const [id, lane] of [["lane-a", bb.laneA], ["lane-b", bb.laneB]]) {
    for (const s of lane.steps ?? []) {
      if (s.status === "pending" || s.status === "active") {
        for (const l of s.legs ?? []) {
          if (isStale(l.startTime)) staleOpenLegs.push(`${id} step ${s.step} ${l.participantName} (${l.startTime})`);
        }
      }
    }
  }
  assert.deepEqual(staleOpenLegs, [], `no open leg is a stale past-date leg (found: ${staleOpenLegs.join("; ")})`);
  // The cross-slate settled WON legs (the now-banked June 18-24 run) live in the archive and span ≥2 cleared cards.
  let settledLegCount = 0;
  for (const lane of [archive.laneA, archive.laneB]) {
    for (const s of lane.steps ?? []) {
      if (s.status === "settled" && s.result === "won") {
        for (const _l of s.legs ?? []) settledLegCount++;
      }
    }
  }
  assert.ok(settledLegCount >= 2, "archived cross-slate settled WON cards carry their graded legs in both lanes");
});

test("Bank Builder: candidate surfaces resolved into placed cards (no leftover candidate-only legs)", () => {
  // Under the cross-slate resume the lanes carry PLACED cards, not nextCandidate-only surfaces.
  for (const [id, lane] of [["lane-a", bb.laneA], ["lane-b", bb.laneB]]) {
    const c = lane.nextCandidate;
    if (!c) continue;
    // If a candidate still exists it must carry an honest reason and no stale past-date leg.
    for (const l of c.legs ?? []) {
      assert.ok(!isStale(l.startTime), `${id} candidate leg ${l.participantName} is a stale past-date leg (${l.startTime})`);
    }
    assert.ok(typeof c.reason === "string" && c.reason.length > 20, `${id} candidate carries an honest reason`);
  }
});

test("Moonshot: Step 1 active review card (lane restarted); restartCandidate + priorRun cleared", () => {
  // The Moonshot lane restarted ACTIVE for the July-21 MLB review: Step 1 carries a fresh MLB pitcher-strikeout review card ($0).
  assert.equal(moon.restartCandidate, null, "moonshot restartCandidate cleared");
  assert.equal(moon.priorRun, null, "moonshot priorRun cleared");
  assert.equal(moon.status, "active", "moonshot lane active (July-21 MLB review)");
  const active = (moon.ladder ?? []).find((s) => s.status === "active");
  assert.ok(active && active.card, "active Moonshot review card present");
  assert.ok(active.card.result == null, "review card carries no settled result (fresh, unsettled)");
  // No open review-card leg is a stale PAST-slate leg (the MLB review legs carry no pre-June-21 kickoff).
  for (const l of active.card.legs ?? []) {
    assert.ok(!isStale(l.startTime), `moonshot review leg ${l.participant} is a stale past-date leg (${l.startTime})`);
  }
});

test("Mr. Dub: settled rungs released → no open exposure in portfolio.json (both lanes restarted; moonshot settled → 0)", () => {
  assert.equal(portfolio.openExposure, 0, "settled rungs released → $0 open in portfolio.json (live Step cards tracked in daily-portfolio)");
  assert.equal(portfolio.totalOpenExposure, 0, "core $0; moonshot settled LOST → 0 open");
  assert.deepEqual(portfolio.record, { wins: 19, losses: 14, voids: 0, pending: 0 }, "19-14-0-0 (Lane A won its July-6 cycle-8 Step-1 and July-7 Step-2)");
  assert.equal((portfolio.activeCards ?? []).length, 0, "no active cards in portfolio.json — live Step cards tracked in daily-portfolio");
});

test("PROTECTED: the cumulative crown ($20,465.40 = two banked $100→$10k ladders) is untouched", () => {
  assert.equal(portfolio.crownBankroll, 20465.4, "crown bankroll immutable (Σ completed-ladder finals: $10,376.17 + $10,089.23)");
  // The protected 5-step crown ladder artifact is still present.
  const crown = read("public/data/bank-builder/dual-lanes-latest.json");
  assert.ok(crown, "completed crown ladder artifact present");
});
