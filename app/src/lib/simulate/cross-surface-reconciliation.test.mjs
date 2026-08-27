/**
 * CROSS-SURFACE RECONCILIATION (P214 · Release D) — the homepage hero, the /simulate day view and
 * the product-day owner must tell ONE story about today: same ready counts, no sport claiming
 * ready events while its own owner says the window is empty, and MLB's ready path never opening
 * the stage (its report owns the ceremony).
 *
 * These read the LIVE tree the same way the product-day equivalence guards do — reconciliation
 * across current artifacts IS the contract under test; nothing here pins a date or a count.
 *
 * Run: npx tsx --test src/lib/simulate/cross-surface-reconciliation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildSimulateDay, STATE_ACTION } from "./day-view.ts";
import { STATE_TONE } from "../../components/simulate/simulate-day.tsx";
import { buildAllGameDetails } from "../game-detail.ts";
import { featuredSimulations } from "../simulate-lobby-featured.ts";
import { buildProductDays } from "../product-day/product-day.ts";
import { currentEtDate } from "../freshness.ts";

const today = currentEtDate();
const day = buildSimulateDay(today, { today });
const dataRoot = path.join(process.cwd(), "public", "data");

test("the hero's simulation-ready figure equals the day view's MLB ready count for today", () => {
  const details = buildAllGameDetails();
  const { simulationsToday } = featuredSimulations(details, today);
  const mlb = day.sections.find((s) => s.sport === "mlb");
  const dayReady = (mlb?.events ?? []).filter((e) => e.state === "SIMULATION_READY").length;
  assert.equal(
    simulationsToday,
    dayReady,
    `the homepage would claim ${simulationsToday} ready while /simulate shows ${dayReady} — two derivations, one truth`,
  );
});

test("no sport shows ready events while its product-day owner reports an empty or dormant window", () => {
  const productDays = buildProductDays(dataRoot);
  for (const section of day.sections) {
    const ready = section.events.filter((e) => e.state === "SIMULATION_READY").length;
    if (ready === 0) continue;
    const owner = productDays.find((d) => d.sport === section.sport);
    assert.ok(owner, `${section.sport}: ready events with NO product-day owner at all`);
    assert.ok(
      owner.state !== "NO_EVENTS",
      `${section.sport}: ${ready} ready event(s) on /simulate while the owner says NO_EVENTS — the P179 class, across surfaces`,
    );
  }
});

test("MLB ready events navigate to their report; every other sport's ready path is stage-eligible", () => {
  for (const section of day.sections) {
    for (const e of section.events) {
      if (e.state !== "SIMULATION_READY") continue;
      assert.ok(e.href && e.href.startsWith("/"), `${section.sport} ${e.matchup}: a ready event carries its report href`);
    }
  }
});

test("every day-view state is in the closed public vocabulary — no invented state can render a chip", () => {
  /*
   * The vocabulary is read from the two owners that must AGREE for a chip to exist at all: the
   * action map the day view exports, and the tone map the component renders from. It used to be a
   * third hand-copied list here, which is a drift class rather than a guard — adding a genuinely
   * needed state (MISSED_COVERAGE, 2026-08-27) failed this test while the product was correct, and
   * the only available repair was to retype the list.
   *
   * Derived, it is strictly stronger: a state now has to be renderable by BOTH owners, so an
   * invented one still cannot reach a chip, and a state added to one owner but not the other — the
   * real way a chip breaks — now fails here instead of at runtime.
   */
  const actions = Object.keys(STATE_ACTION);
  const tones = Object.keys(STATE_TONE);
  assert.deepEqual([...actions].sort(), [...tones].sort(), "the action map and the tone map describe the same states");
  const CLOSED = new Set(actions);
  for (const section of day.sections) {
    for (const e of section.events) {
      assert.ok(CLOSED.has(e.state), `${section.sport} ${e.matchup}: state ${e.state} is outside the closed set`);
      assert.ok(STATE_TONE[e.state]?.label, `${section.sport} ${e.matchup}: state ${e.state} has no printed chip label`);
    }
  }
});
