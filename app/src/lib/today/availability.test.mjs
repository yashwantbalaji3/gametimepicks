import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { deriveGameAvailability, deriveStartState } from "./availability.ts";

const FP = "2026-07-23T23:05:00Z"; // a real first pitch
const BEFORE = Date.parse("2026-07-23T22:00:00Z"); // clock before first pitch
const AFTER = Date.parse("2026-07-24T02:00:00Z"); // clock after first pitch

/** A minimal MLB game detail; overrides tune the attached artifacts. */
function game(over = {}) {
  return {
    sport: "mlb",
    sportLabel: "MLB",
    slug: "away-vs-home-2026-07-23",
    date: "2026-07-23",
    homeTeam: "Home Nine",
    awayTeam: "Away Nine",
    gameLabSimulation: null,
    gameLabMlb: null,
    gameCenter: null,
    reconciled: null,
    dataStatus: null,
    ...over,
  };
}

const FORBIDDEN = /\b(edge|lock|best bet|guaranteed|sure thing|smash|value play|high confidence|likely winner)\b/i;

// ── Tier derivation (states 1–4) ──────────────────────────────────────────────
test("1 · SIMULATION_READY: ready sim that reconciles", () => {
  const a = deriveGameAvailability(game({ gameLabSimulation: { status: "ready" }, reconciled: { ok: true, reason: "ok" }, gameCenter: { firstPitch: FP } }));
  assert.equal(a.level, "simulation");
  assert.equal(a.label, "Simulation ready");
  assert.equal(a.actionLabel, "Open simulation →");
  assert.equal(a.canonicalHref, "/games/mlb/away-vs-home-2026-07-23");
  assert.equal(a.freshnessState, "fresh");
  assert.ok(a.evidence.includes("ready-sim") && a.evidence.includes("reconciled-ok"));
});

test("2 · MODEL_READ: no sim, model leans present", () => {
  const a = deriveGameAvailability(game({ gameLabMlb: { leanCount: 4 } }));
  assert.equal(a.level, "model-read");
  assert.equal(a.label, "Model read");
  assert.equal(a.actionLabel, "View model read →");
  assert.match(a.explanation, /full simulation is not ready/);
  assert.ok(a.evidence.includes("model-leans:4"));
});

test("3 · MARKET_READ: no sim/model, market center present", () => {
  const a = deriveGameAvailability(game({ gameCenter: { firstPitch: FP } }));
  assert.equal(a.level, "market-read");
  assert.equal(a.label, "Market read");
  assert.equal(a.actionLabel, "View market context →");
  assert.equal(a.firstPitchIso, FP);
});

test("4 · REPORT_ONLY: known game, nothing richer proven", () => {
  const a = deriveGameAvailability(game());
  assert.equal(a.level, "report");
  assert.equal(a.label, "Game report");
  assert.equal(a.actionLabel, "Open report →");
  assert.equal(a.canonicalHref, "/games/mlb/away-vs-home-2026-07-23"); // still a safe action
});

// ── REPORT_ONLY reason specificity (states 5–7, 9) ────────────────────────────
test("5 · lineup/props pending → report explains the awaiting-inputs reason", () => {
  const a = deriveGameAvailability(game({ dataStatus: [{ status: "pending", label: "Player props" }] }));
  assert.equal(a.level, "report");
  assert.match(a.explanation, /Awaiting inputs — player-prop lines are still pending/);
});

test("6 · market pending (no game center) → report only, not a fake market read", () => {
  const a = deriveGameAvailability(game({ gameCenter: null, dataStatus: [{ status: "pending" }] }));
  assert.notEqual(a.level, "market-read");
  assert.equal(a.level, "report");
});

test("7 · stale simulation is NOT surfaced as a simulation; freshness=stale", () => {
  const a = deriveGameAvailability(game({ gameLabSimulation: { status: "stale" } }));
  assert.notEqual(a.level, "simulation");
  assert.equal(a.level, "report");
  assert.equal(a.freshnessState, "stale");
  assert.match(a.explanation, /out of date/);
});

test("9 · mismatched identity (reconciled.ok=false) forbids sim/model/market — fail closed", () => {
  // Even with a ready sim AND model AND market, a proven identity mismatch drops to REPORT_ONLY.
  const a = deriveGameAvailability(game({
    gameLabSimulation: { status: "ready" },
    gameLabMlb: { leanCount: 9 },
    gameCenter: { firstPitch: FP },
    reconciled: { ok: false, reason: "sim_gamepk_mismatch" },
  }));
  assert.equal(a.level, "report");
  assert.match(a.explanation, /could not be reconciled/);
  assert.ok(a.evidence.some((e) => e.startsWith("reconcile-failed:")));
});

// ── Start-state (states 8, 10) ────────────────────────────────────────────────
test("8 · game already started → sim preserved for review, start-state started", () => {
  const a = deriveGameAvailability(game({ gameLabSimulation: { status: "ready" }, gameCenter: { firstPitch: FP } }), { nowMs: AFTER });
  assert.equal(a.startState, "started");
  assert.equal(a.actionLabel, "Review simulation →");
  assert.match(a.explanation, /Game started/);
  // a not-yet-started clock reads "scheduled" with the normal action
  const b = deriveGameAvailability(game({ gameLabSimulation: { status: "ready" }, gameCenter: { firstPitch: FP } }), { nowMs: BEFORE });
  assert.equal(b.startState, "scheduled");
  assert.equal(b.actionLabel, "Open simulation →");
});

test("10 · missing start time → firstPitch null, start-state unknown (never guessed)", () => {
  const a = deriveGameAvailability(game({ gameCenter: { firstPitch: null }, gameLabMlb: { leanCount: 2 } }), { nowMs: AFTER });
  assert.equal(a.firstPitchIso, null);
  assert.equal(a.startState, "unknown");
  assert.equal(deriveStartState(null, AFTER), "unknown");
  assert.equal(deriveStartState(FP, undefined), "unknown"); // no clock → unknown, not "scheduled"
});

// ── UNAVAILABLE (state 13 boundary) ───────────────────────────────────────────
test("UNAVAILABLE: no route → no deceptive button", () => {
  const a = deriveGameAvailability(game({ slug: null }));
  assert.equal(a.level, "unavailable");
  assert.equal(a.actionLabel, ""); // no deceptive action
  assert.equal(a.canonicalHref, null);
});

test("UNAVAILABLE: missing a team → cannot render an honest matchup", () => {
  assert.equal(deriveGameAvailability(game({ awayTeam: null })).level, "unavailable");
  assert.equal(deriveGameAvailability(game({ homeTeam: "" })).level, "unavailable");
});

// ── No cross-game leakage + neutrality (all tiers) ────────────────────────────
test("no availability tier ever leaks forbidden certainty vocabulary", () => {
  const variants = [
    game({ gameLabSimulation: { status: "ready" }, gameCenter: { firstPitch: FP } }),
    game({ gameLabMlb: { leanCount: 3 } }),
    game({ gameCenter: { firstPitch: FP } }),
    game(),
    game({ gameLabSimulation: { status: "stale" } }),
    game({ reconciled: { ok: false, reason: "slug_gameid_mismatch" } }),
  ];
  for (const v of variants) {
    for (const now of [undefined, BEFORE, AFTER]) {
      const a = deriveGameAvailability(v, { nowMs: now });
      assert.doesNotMatch(a.label, FORBIDDEN);
      assert.doesNotMatch(a.explanation, FORBIDDEN);
      assert.doesNotMatch(a.actionLabel, FORBIDDEN);
    }
  }
});

test("banned-language guard covers every new Sprint-003 availability surface (source-level)", () => {
  // Phase 10: run the banned-language contract against every new component/lib, comments included.
  const app = process.cwd();
  const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|\bedge\b|best bet|\bvalue play\b|sure thing|risk-free|free money|high confidence|likely winner|\bsmash\b/i;
  const files = [
    "src/lib/today/availability.ts",
    "src/lib/today/slate-games.ts",
    "src/components/today/full-slate.tsx",
    "src/components/mlb/mlb-slate-availability.tsx",
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(app, rel), "utf8").replace(/safe-area(-inset)?/gi, "");
    assert.doesNotMatch(src, BANNED, `banned language in ${rel}`);
  }
});

test("derivation is a pure function of one game — never reads another game's artifacts", () => {
  // Two calls with different inputs never share state; the same input is deterministic.
  const g1 = game({ slug: "a-2026-07-23", gameLabSimulation: { status: "ready" }, gameCenter: { firstPitch: FP } });
  const g2 = game({ slug: "b-2026-07-23" });
  const a1 = deriveGameAvailability(g1);
  const a2 = deriveGameAvailability(g2);
  assert.equal(a1.level, "simulation");
  assert.equal(a2.level, "report");
  assert.deepEqual(deriveGameAvailability(g1), a1); // deterministic
  assert.notEqual(a1.canonicalHref, a2.canonicalHref); // no cross-game href reuse
});
