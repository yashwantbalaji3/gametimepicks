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
  // Before any kickoff → all candidates (pre-event).
  const pre = deriveSpecialsTracker(result, "2026-06-23T10:00:00Z");
  assert.equal(pre.summary.candidateCount, result.cards.length, "all pre-event = candidates before kickoff");
  assert.equal(pre.summary.pendingCount, 0, "none pending before kickoff");
  // After all kickoffs but ungraded → all pending (games started, not settled).
  const mid = deriveSpecialsTracker(result, "2026-06-24T06:00:00Z");
  assert.equal(mid.summary.pendingCount + mid.summary.settledCount, result.cards.length, "started cards are pending or settled, not candidates");
  // Specials never place exposure.
  assert.equal(pre.summary.exposure, 0, "specials exposure always 0 (suggested cards, not placed)");
  assert.match(pre.summary.record, /^\d+–\d+/, "record is a W-L string");
});

test("World Cup Specials are SEPARATE from core / moonshot / crown (no blending)", () => {
  const portfolio = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  // Deriving/showing specials never mutates the core or moonshot accounting.
  assert.deepEqual(portfolio.record, { wins: 10, losses: 2, voids: 0, pending: 0 }, "core record unchanged by specials (Lane A + Lane B settled WON)");
  assert.equal(portfolio.openExposure, 0, "core exposure unchanged by specials ($0 — both lanes settled WON)");
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
