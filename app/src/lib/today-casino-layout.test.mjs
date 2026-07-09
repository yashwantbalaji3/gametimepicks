/**
 * Locks the /today ordering (2026-07-09 rebuild → the DAILY MODEL HUB). /today is now a clean, compact
 * 10-section hub — NOT the old dense everything-page. It leads with a Today-specific slate header, then
 * an at-a-glance status strip, the top model reads, simulation-backed games, and compact product-status
 * modules (Build-a-Pick, Bank Builder, Longshot Lab) + discipline notes + a results reminder + secondary
 * links. The old flagship-flashcard/BB-status-rail/ParlaysExplorer/World-Cup-focus wall is gone; the full
 * flagship ladders/boards are NOT re-rendered here — they surface as one-figure status cards that link out.
 * Source-level checks (suite runs pre-build).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("src/app/today/page.tsx", "utf8");

test("the old dense-board headings/blocks are removed from the compact hub", () => {
  assert.ok(!src.includes("What&apos;s live today"), "old hero heading must be gone");
  // The old dense flagship-flashcard + status-rail + parlays-explorer + WC-focus wall is gone.
  for (const gone of ["Flagship quick links", "TodaysFocusWorldCup", "BankBuilderStatusRail", "ParlaysExplorer", "Today&apos;s flagship products", "readinessModules"]) {
    assert.ok(!src.includes(gone), `old dense-board fragment "${gone}" removed`);
  }
});

test("the Daily Model Hub leads with its own header + at-a-glance, then the top model reads", () => {
  const header = src.indexOf("<TodayDailySlateHeader");
  const glance = src.indexOf("<TodayAtAGlance");
  const picks = src.indexOf("<TodayTopModelPicks");
  assert.ok(header > 0, "Today-specific slate header present");
  assert.ok(glance > 0, "at-a-glance status strip present");
  assert.ok(picks > 0, "top model reads present");
  assert.ok(header < glance, "header leads the at-a-glance strip");
  assert.ok(glance < picks, "at-a-glance precedes the top model reads");
});

test("product status modules link out (no duplicated full flagship ladders/boards on the hub)", () => {
  // Bank Builder / Longshot / Build-a-Pick are COMPACT status modules that link out — the hub never
  // re-renders the full ProductLanesLadder / WC Specials box / Top10 wall (that lives on their own pages).
  for (const mod of ["<BuildAPickModule", "<BankBuilderStatus", "<LongshotLabStatus"]) {
    assert.ok(src.includes(mod), `${mod} status module present`);
  }
  for (const dup of ["ProductLanesLadder", "WorldCupSpecialsBox", "Top10BoardSection", "MoonshotLadderV2"]) {
    assert.ok(!src.includes(dup), `${dup} full flagship surface is not duplicated on the compact hub`);
  }
});

test("the hub closes with discipline notes, a results reminder, and secondary links — in order", () => {
  const sims = src.indexOf("<TodaySimulationLeans");
  const notes = src.indexOf("<NoPlayNotes");
  const results = src.indexOf("<ResultsReminder");
  const links = src.indexOf("<SecondaryLinks");
  assert.ok(sims > 0 && notes > 0 && results > 0 && links > 0, "all closing sections present");
  assert.ok(sims < notes, "simulation-backed games precede the discipline notes");
  assert.ok(notes < results, "discipline notes precede the results reminder");
  assert.ok(results < links, "results reminder precedes the secondary links");
});

test("heat system tokens exist in the design system", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.ok(css.includes("--gtp-bank-heat:") && css.includes("--gtp-bank-lava:"), "heat tokens present");
  assert.ok(css.includes(".gtp-heat-pulse { animation: none; }"), "heat pulse is reduced-motion gated");
});
