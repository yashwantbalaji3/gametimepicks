/**
 * Home "Settled through" = the newest settled date across products and sports (Housekeeping 10-22). Production read
 * "Settled through Oct 15" (the optimizer index alone) while MLB had settled through 10-19 and the products through 10-20.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { newestSettledDate, isSettledRecordCell } from "./settled-through.mjs";

const APP = process.cwd();
const cell = (o) => ({
  family: "product", era: "RECEIPT_ERA", status: "LIVE", displayEligible: { eligible: true },
  counts: { won: 1, lost: 1 }, window: { from: "2026-08-15", to: "2026-10-20" }, ...o,
});

/* The 2026-10-21 shape: optimizer index stopped at 10-15; MLB ledger 10-19; product receipts (NFL included) 10-20. */
const PROJECTION = {
  cells: [
    cell({ cellId: "bank-builder receipts", window: { from: "2026-08-15", to: "2026-10-20" } }),
    cell({ cellId: "moonshot receipts", window: { from: "2026-08-15", to: "2026-10-20" } }),
    cell({ cellId: "mlb ledger", family: "forecast", era: "LIVE_LEDGER", window: { from: "2026-05-16", to: "2026-10-19" } }),
    // never settled-through evidence:
    cell({ cellId: "pending", era: "PENDING_SETTLEMENT", counts: { won: null, lost: null }, window: { from: "2026-10-22", to: "2026-10-22" } }),
    cell({ cellId: "gap", era: "UNRECEIPTED_GAP", status: "DISCLOSED_GAP", counts: { won: null, lost: null }, window: { from: "2026-10-23", to: "2026-10-23" } }),
    cell({ cellId: "lab window", family: "lab", era: "UNSEGMENTED_WINDOW", window: { from: "2026-05-25", to: "2026-10-24" } }),
    cell({ cellId: "frozen", era: "PROTECTED_BASE", status: "FROZEN", window: { from: "2026-06-09", to: "2026-10-25" } }),
    cell({ cellId: "ineligible", displayEligible: { eligible: false }, window: { from: null, to: "2026-10-26" } }),
    cell({ cellId: "cycle", family: "cycle", counts: { won: null, lost: null }, window: { from: "2026-08-15", to: "2026-10-27" } }),
    cell({ cellId: "undated", family: "forecast", era: "LIVE_LEDGER", window: { from: null, to: null } }),
  ],
};
const OPTIMIZER = ["2026-10-13", "2026-10-15", "2026-10-14"];

test("🔴 the newest settled date across products and sports wins — not the optimizer index alone (the 10-22 defect)", () => {
  assert.equal(newestSettledDate({ projection: PROJECTION, optimizerSettledDates: OPTIMIZER }), "2026-10-20");
  assert.equal(newestSettledDate({ projection: null, optimizerSettledDates: OPTIMIZER }), "2026-10-15", "no projection → the optimizer index still answers");
  assert.equal(newestSettledDate({ projection: PROJECTION, optimizerSettledDates: ["2026-10-21"] }), "2026-10-21", "a newer settled optimizer slate counts too");
});

test("🔴 pending, gap, lab, frozen, ineligible, uncounted and undated cells are never 'settled through' evidence", () => {
  const only = (id) => ({ cells: PROJECTION.cells.filter((c) => c.cellId === id) });
  for (const id of ["pending", "gap", "lab window", "frozen", "ineligible", "cycle", "undated"]) {
    assert.equal(newestSettledDate({ projection: only(id) }), null, id);
  }
  assert.equal(newestSettledDate({ projection: only("mlb ledger") }), "2026-10-19");
  assert.equal(isSettledRecordCell(cell({ window: { from: null, to: "2026-10-2" } })), false, "a malformed date is not a date");
});

test("🔴 nothing settled → null (the hero falls back to 'See every settled result')", () => {
  assert.equal(newestSettledDate({}), null);
  assert.equal(newestSettledDate({ projection: { cells: [] }, optimizerSettledDates: [] }), null);
  assert.equal(newestSettledDate({ projection: { cells: "nope" }, optimizerSettledDates: [null, "x"] }), null);
});

/* REPOINTED P0 U1 (2026-10-28). This pinned the hero AND the Recent-results strip to this one site-wide date. The
   strip sits beside the PAPER record, so printing the site-wide newest date there as "Last settled" was the bug: it
   read as the paper ledger's date. The hero keeps this rule (now through the server reader, with both sources); the
   strip prints the paper ledger's own settled-through day. Both come from lib/results/settled-through.mjs. */
test("🔴 Home feeds the hero from this rule (both sources) and the strip from the paper ledger's settled-through", () => {
  const page = fs.readFileSync(path.join(APP, "src/app/page.tsx"), "utf8");
  const server = fs.readFileSync(path.join(APP, "src/lib/results/settled-through-server.ts"), "utf8");
  assert.match(server, /siteLatestResultsDate\(\{ projection: loadResultsProjection\(\), optimizerSettledDates: getOptimizerSettledDates\(\) \}\)/, "the site date still reads both sources");
  assert.match(page, /const latestResultsDate = siteLatestResults\(\);/);
  assert.match(page, /latestResultsDate=\{latestResultsDate\}/, "the hero reads the site date");
  assert.match(page, /settledThrough=\{paperSettlement\.settledThrough\}/, "the strip reads the paper ledger's own date");
  assert.doesNotMatch(page, /getOptimizerSettledDates/, "no second, optimizer-only copy of the date on Home");
});
