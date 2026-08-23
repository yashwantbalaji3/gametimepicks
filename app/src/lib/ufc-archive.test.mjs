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
  // P189: /ufc now publishes an experimental fight model, so the PAGE is no longer an archive —
  // but the settled record still must never read as live. The label therefore belongs to the
  // section that holds that record, and is asserted there. The page-level claim was retired
  // because it had become false, not because the invariant lapsed.
  assert.match(page, /Settled archive/, "the settled record sits under its own archive heading");
  assert.match(page, /Archive · no live coverage/, "the no-live-coverage label renders on that section");
  const archiveAt = page.indexOf("Settled archive");
  const recapAt = page.indexOf("<UfcEventResultsRecap");
  assert.ok(archiveAt > -1 && recapAt > archiveAt, "the archive label precedes the record it describes");
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
  /*
   * TWO DEFECTS IN THIS GUARD, BOTH OF THE RECURRING KIND.
   *
   * It matched SUBSTRINGS, so "ledger" contains "edge" and "blocked" contains "lock" — the ` lock `
   * entry with its hand-placed spaces was somebody already noticing half the problem. And it scanned
   * the raw source INCLUDING COMMENTS, so a comment explaining why a claim must not be made would
   * trip the guard against making it. This repo has hit the comment half four times before.
   *
   * Word boundaries make the check MORE precise, not weaker: "edge" as a word is still banned, and
   * the words are still banned everywhere a reader can see them. Comments are stripped first so the
   * guard tests published copy rather than the reasoning behind it.
   */
  const low = page
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .toLowerCase();
  const BANNED = ["guaranteed", "guarantee", "risk-free", "can't miss", "sure thing", "free money", "safest", "lock", "best bet", "positive ev", "edge"];
  for (const w of BANNED) {
    const re = new RegExp(`(^|[^a-z0-9-])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9-]|$)`, "i");
    assert.doesNotMatch(low, re, `banned copy "${w}" must not appear on /ufc`);
  }
});

test("8b · the banned-copy guard is not vacuous", () => {
  // A guard that strips too much passes on everything. This proves it still catches a real hit in
  // published copy, and still ignores one inside a comment.
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").toLowerCase();
  const wordRe = (w) => new RegExp(`(^|[^a-z0-9-])${w}([^a-z0-9-]|$)`, "i");
  assert.match(strip('const a = "our edge today";'), wordRe("edge"), "a real violation in copy must still be caught");
  assert.doesNotMatch(strip("/* the graded ledger explains this */"), wordRe("edge"), "a comment must not trip it");
  assert.doesNotMatch(strip('const b = "the graded ledger";'), wordRe("edge"), "a substring inside another word is not a violation");
  assert.match(strip('const c = "this is a lock";'), wordRe("lock"), "and lock is still banned as a word");
  assert.doesNotMatch(strip('const d = "the route is blocked";'), wordRe("lock"), "blocked is not lock");
});
