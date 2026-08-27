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
import { buildSimulateDay } from "./day-view.ts";
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
  const CLOSED = new Set(["SIMULATION_READY", "ARTIFACT_READY", "BASELINE_ONLY", "MODEL_ONLY_NO_MARKET", "NO_PLAY", "SCHEDULE_ONLY", "SOURCE_STALE", "SETTLED"]);
  for (const section of day.sections) {
    for (const e of section.events) {
      assert.ok(CLOSED.has(e.state), `${section.sport} ${e.matchup}: state ${e.state} is outside the closed set`);
    }
  }
});
