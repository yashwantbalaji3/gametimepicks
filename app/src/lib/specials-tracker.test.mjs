import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadWorldCupSpecials } from "./world-cup/world-cup-specials.ts";
import { deriveSpecialsTracker } from "./world-cup/specials-tracker.ts";
import { loadMoonshotLane } from "./moonshot/moonshot-lane.ts";
import { candidateReadiness, ACTIVATION_CUTOFF_MIN } from "./moonshot/activation-rules.ts";

const read = (p) => fs.readFileSync(p, "utf8");

test("World Cup Specials tracker derives candidate/pending/settled from the slate (no exposure)", () => {
  const result = loadWorldCupSpecials();
  assert.ok(result && result.cards.length > 0, "specials loaded");
  // DATE-AGNOSTIC: derive the kickoff window from the loaded cards' leg start times rather than pinning
  // to a specific slate date. A card is a candidate until one of its legs has kicked off; once every
  // card has a started leg it is pending/settled. So:
  //   • pre  = one minute BEFORE the earliest leg across all cards → all candidates
  //   • post = one minute AFTER the latest leg across all cards   → none still a candidate
  const starts = result.cards.flatMap((c) => c.legs.map((l) => Date.parse(l.startTime))).filter(Number.isFinite);
  assert.ok(starts.length > 0, "cards carry real leg kickoff times");
  const preIso = new Date(Math.min(...starts) - 60_000).toISOString();
  const postIso = new Date(Math.max(...starts) + 60_000).toISOString();
  // Before any kickoff → all candidates (pre-event).
  const pre = deriveSpecialsTracker(result, preIso);
  assert.equal(pre.summary.candidateCount, result.cards.length, "all pre-event = candidates before kickoff");
  assert.equal(pre.summary.pendingCount, 0, "none pending before kickoff");
  // After every game has started but ungraded → all pending/settled, none a candidate.
  const mid = deriveSpecialsTracker(result, postIso);
  assert.equal(mid.summary.candidateCount, 0, "no started card is still a candidate");
  assert.equal(mid.summary.pendingCount + mid.summary.settledCount, result.cards.length, "started cards are pending or settled, not candidates");
  // Specials never place exposure.
  assert.equal(pre.summary.exposure, 0, "specials exposure always 0 (suggested cards, not placed)");
  assert.match(pre.summary.record, /^\d+–\d+/, "record is a W-L string");
});

test("World Cup Specials are SEPARATE from core / moonshot / crown (no blending)", () => {
  const portfolio = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  // Deriving/showing specials never mutates the core or moonshot accounting.
  assert.deepEqual(portfolio.record, { wins: 13, losses: 3, voids: 0, pending: 0 }, "core record reflects only the BB settlement, not specials (Lane A won, Lane B lost)");
  assert.equal(portfolio.openExposure, 0, "core exposure unchanged by specials ($0 — both lanes settled)");
  assert.deepEqual(portfolio.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "moonshot record unchanged");
  assert.equal(portfolio.crownBankroll, 10376.17, "crown untouched");
});

test("/world-cup-specials route renders the tracker via shared primitives", () => {
  const page = read("src/app/world-cup-specials/page.tsx");
  assert.match(page, /WorldCupSpecialsTracker/, "route renders the tracker");
  assert.match(page, /PicksSurfaceHeader/, "route uses the shared cinematic header");
  const tracker = read("src/components/specials/world-cup-specials-tracker.tsx");
  assert.match(tracker, /TicketCard/, "tracker uses TicketCard");
  assert.match(tracker, /LegRow/, "tracker uses LegRow");
  assert.match(tracker, /no exposure is placed/, "states specials carry no exposure");
  assert.match(tracker, /Settled review/, "settled cards are review-only, not playable");
});

test("Specials tracker reachable from rail + Specials box CTA (today / world-cup)", () => {
  assert.match(read("src/components/command-rail.tsx"), /href: "\/world-cup-specials"/, "rail has a WC Specials entry");
  assert.match(read("src/components/world-cup/world-cup-specials-box.tsx"), /href="\/world-cup-specials"/, "specials box (today + world-cup) links to the tracker");
});

test("Moonshot activation rule: candidate cannot activate after kickoff (no late exposure)", () => {
  const lane = loadMoonshotLane();
  const cand = (lane.candidates ?? [])[0];
  assert.ok(cand, "a moonshot candidate exists");
  // Earliest leg is England/Ghana at 2026-06-23T20:00:00Z (4 PM ET).
  // Comfortably before kickoff → ready.
  assert.equal(candidateReadiness(cand, "2026-06-23T18:00:00Z").state, "ready", "ready well before kickoff");
  // Within the cutoff window → not activated.
  assert.equal(candidateReadiness(cand, "2026-06-23T19:45:00Z").state, "kickoff_too_close", `within ${ACTIVATION_CUTOFF_MIN}m → blocked`);
  // After a game has kicked off → expired (review only, never placed late).
  assert.equal(candidateReadiness(cand, "2026-06-23T20:30:00Z").state, "expired", "expired after kickoff");
});
