/**
 * UFC SETTLED ARCHIVE invariants. /ufc retired its hub (UFC is SCAFFOLD_ONLY in the capability
 * registry — nothing predictive may publish) and became a dated archive of the one officially
 * settled card. These migrate the guarantees the hub's gate tests used to carry:
 *
 *  1. the settled record stays visible (accountability — published outcomes are never erased),
 *  2. the page is fail-closed on the OFFICIAL settlement artifact,
 *  3. no predictive surface exists: no projection/suggested-card/expanded/odds artifact is read,
 *     no upcoming-event framing renders, and the retired chrome components stay deleted,
 *  4. the model remains unvalidated in the committed artifacts, so nothing may present it.
 *
 * Run: npx tsx --test src/lib/ufc-archive.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(p, "utf8");
const page = read("src/app/ufc/page.tsx");
const recap = read("src/components/ufc/event-results-recap.tsx");

test("1 · /ufc renders the settled record through the official recap, clearly dated + archive-labelled", () => {
  assert.match(page, /UfcEventResultsRecap/, "the settled recap component renders the record");
  assert.match(page, /results-settled-latest\.json/, "the record comes from the settlement artifact");
  assert.match(page, /settledAt/, "the page derives a visible settled date");
  assert.match(page, /settled archive/i, "the page names itself an archive");
  assert.match(page, /Archive · no live coverage/, "the no-live-coverage label renders");
  // Known-positive on the recap itself: official winners + graded results are what it shows.
  assert.match(recap, /officially settled/, "recap frames the event as officially settled");
  assert.match(recap, /officialWinner/, "recap renders the official winner of every fight");
});

test("2 · the page is FAIL-CLOSED on the official settlement (no final status → no record shown)", () => {
  assert.match(page, /settlement\.status === "final" \? settlement : null/, "only an official final settlement renders");
  assert.match(page, /No officially settled UFC record is available/, "the empty state is explicit, not blank");
});

test("3 · no predictive surface: the archive reads ONLY settlement (+ schedule for the no-claim note)", () => {
  for (const artifact of [
    "projections-latest.json",
    "suggested-parlays-latest.json",
    "expanded-projections-latest.json",
    "odds-latest.json",
    "readiness-latest.json",
    "ops-status-latest.json",
  ]) {
    assert.ok(!page.includes(artifact), `archive page must not read ${artifact}`);
  }
  // No hub chrome: tabs, shells, engines and the simulator entry are retired.
  for (const banned of [
    "SportShell",
    "MultiSportReportShell",
    "ufcEventToReports",
    "ufc-prediction-engine",
    "modelProbability",
    'label: "Projections"',
    'label: "Suggested Cards"',
    'label: "Markets"',
    "Next ·",
  ]) {
    assert.ok(!page.includes(banned), `archive page must not carry "${banned}"`);
  }
});

test("4 · the retired chrome components stay deleted (the surface cannot quietly return)", () => {
  for (const rel of [
    "src/components/ufc/ufc-fight-night-hero.tsx",
    "src/components/ufc/expanded-fight-cards.tsx",
    "src/components/ufc/ufc-predictions-v2.tsx",
    "src/components/ufc/ufc-simulation-animation.tsx",
    "src/components/home/ufc-prediction-preview.tsx",
    "src/lib/home/ufc-preview.ts",
  ]) {
    assert.ok(!fs.existsSync(path.join(process.cwd(), rel)), `${rel} was retired with the hub and must stay deleted`);
  }
});

test("5 · a later, never-settled card is a no-claim note — never a next/current event", () => {
  assert.match(page, /sched\.eventName !== settled\.event/, "the note keys off a settled-name mismatch");
  assert.match(page, /no official settlement was ingested/, "states the settlement gap plainly");
  assert.match(page, /no record\s+is claimed/, "claims nothing for the unsettled card");
});

test("6 · the archive frames the record honestly: outcome log with denominator, not validation", () => {
  assert.match(page, /settled\.fights\.length\} graded fights/, "the denominator is the real graded-fight count");
  assert.match(page, /not model validation/, "a single-card record is never framed as validation");
  assert.match(page, /retired unvalidated/, "the model's unvalidated retirement is stated");
});

test("7 · the gate is still real: committed artifacts remain unvalidated (nothing may present the model)", () => {
  const ops = JSON.parse(read("public/data/ufc/ops-status-latest.json"));
  const proj = JSON.parse(read("public/data/ufc/projections-latest.json"));
  assert.equal(proj.moneylineValidated, false, "moneyline never validated");
  assert.equal(ops.publicPicksVisible, false, "public picks never unlocked");
  assert.ok((ops.cleanGradedRows ?? 0) < (ops.targetRowsForPublicMoneyline ?? 150), "below the validation threshold");
});

test("8 · no banned promotional copy on the archive", () => {
  const low = page.toLowerCase();
  for (const w of ["guaranteed", "guarantee", "risk-free", "can't miss", "sure thing", "free money", "safest", " lock ", "best bet", "positive ev", "edge"]) {
    assert.ok(!low.includes(w), `banned copy "${w}" must not appear on /ufc`);
  }
});
