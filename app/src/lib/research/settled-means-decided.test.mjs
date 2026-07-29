/**
 * SPRINT 051 — "settled" is a property of the CONTENT, never of the filename.
 *
 * THE DEFECT THIS PINS, FOUND BY RENDERING THE CONTRACT
 * On 2026-07-28 the settlement-lineage gate correctly refused the MLB slate (a doubleheader identity
 * collision). The optimizer snapshot was still written — 168 legs, every one `pending`, nothing
 * decided. `getOptimizerGradedDates()` lists dates for which a FILE exists, so the global status bar
 * told every visitor "Slate settled · Jul 28" while the System Status page, reading the research
 * contract, said the same date was withheld.
 *
 * Two surfaces disagreeing about whether a day happened is the exact class of failure the canonical
 * contract exists to prevent, and it was invisible until something rendered the contract next to it.
 *
 * Run: npx tsx --test src/lib/research/settled-means-decided.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  getOptimizerGradedDates,
  getOptimizerSettledDates,
} from "../parlay-results.ts";
import { loadTerminal } from "./public-contract-adapter.ts";

const APP = process.cwd();
const GRADED = path.join(APP, "public/data/parlays/optimizer-graded");

const DECIDED = new Set(["win", "loss", "push", "void"]);

/** Count decided vs pending statuses anywhere in a snapshot. */
function tally(node, acc = { decided: 0, pending: 0 }) {
  if (Array.isArray(node)) {
    for (const v of node) tally(v, acc);
  } else if (node && typeof node === "object") {
    const s = typeof node.status === "string" ? node.status.toLowerCase() : null;
    if (s) {
      if (DECIDED.has(s)) acc.decided += 1;
      else if (s === "pending") acc.pending += 1;
    }
    for (const v of Object.values(node)) tally(v, acc);
  }
  return acc;
}

test("a date whose snapshot has NO decided leg is not reported as settled", () => {
  const graded = getOptimizerGradedDates();
  const settled = new Set(getOptimizerSettledDates());

  let checkedUndecided = 0;
  for (const d of graded) {
    const p = path.join(GRADED, `${d}.json`);
    if (!fs.existsSync(p)) continue;
    const t = tally(JSON.parse(fs.readFileSync(p, "utf8")));
    if (t.decided === 0 && t.pending > 0) {
      checkedUndecided += 1;
      assert.equal(settled.has(d), false,
        `${d} has ${t.pending} pending legs and 0 decided, but is reported as settled`);
    }
  }
  assert.ok(checkedUndecided > 0,
    "the fixture set must contain at least one all-pending date (2026-07-28) or this test proves nothing");
});

test("a date with decided legs IS still reported as settled", () => {
  // The obvious over-correction: a stricter rule that quietly drops real settled days.
  const settled = new Set(getOptimizerSettledDates());
  let checkedDecided = 0;
  for (const d of getOptimizerGradedDates()) {
    const p = path.join(GRADED, `${d}.json`);
    if (!fs.existsSync(p)) continue;
    const t = tally(JSON.parse(fs.readFileSync(p, "utf8")));
    if (t.decided > 0) {
      checkedDecided += 1;
      assert.equal(settled.has(d), true, `${d} has ${t.decided} decided legs but was dropped`);
    }
  }
  assert.ok(checkedDecided > 5, "the fixture set must contain real settled dates");
});

test("the settled set is a strict subset of the graded set", () => {
  const graded = new Set(getOptimizerGradedDates());
  for (const d of getOptimizerSettledDates()) {
    assert.ok(graded.has(d), `${d} is reported settled but has no graded snapshot at all`);
  }
});

test("the quarantined date is never in the settled set", () => {
  // The cross-surface assertion: whatever the research contract calls withheld, the status bar must
  // not call settled.
  const quarantined = loadTerminal().quarantines.map((q) => q.date);
  assert.ok(quarantined.length > 0, "the contract must still report a quarantined date");
  const settled = new Set(getOptimizerSettledDates());
  for (const d of quarantined) {
    assert.equal(settled.has(d), false,
      `${d} is withheld by the research contract but reported as settled by the status bar`);
  }
});

test("no built page announces a settled date the contract calls withheld", () => {
  // SPRINT 054. The results hero announced "Settled slate: Jul 28" from getOptimizerGradedDates()
  // while the accounting section on the SAME page reported that date as withheld. The Sprint 051
  // defect, in a second component. This scans the built output so any future component that
  // reintroduces it fails here rather than on a user's screen.
  const OUT = path.join(APP, "out");
  if (!fs.existsSync(OUT)) return; // nothing built in this environment
  const quarantined = loadTerminal().quarantines.map((q) => q.date);
  assert.ok(quarantined.length > 0, "the contract must still report a quarantined date");

  const shortLabels = quarantined.map((d) => {
    const [, m, day] = d.split("-");
    const month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m) - 1];
    return `${month} ${Number(day)}`;
  });

  for (const route of ["index.html", "results/index.html", "system-status/index.html"]) {
    const p = path.join(OUT, route);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const label of shortLabels) {
      assert.ok(
        !text.includes(`Settled slate: ${label}`),
        `${route} announces "Settled slate: ${label}" for a date the contract calls withheld`,
      );
      assert.ok(
        !text.includes(`Settled · ${label}`),
        `${route} announces "Settled · ${label}" for a withheld date`,
      );
    }
  }
});

test("each built page has exactly one h1", () => {
  const OUT = path.join(APP, "out");
  if (!fs.existsSync(OUT)) return;
  for (const route of ["index.html", "results/index.html", "system-status/index.html", "methodology/index.html"]) {
    const p = path.join(OUT, route);
    if (!fs.existsSync(p)) continue;
    const count = (fs.readFileSync(p, "utf8").match(/<h1[\s>]/g) ?? []).length;
    assert.equal(count, 1, `${route} has ${count} h1 elements — a screen reader relies on exactly one`);
  }
});

test("the newest settled date does not run ahead of the research contract", () => {
  // If the bar's latest settled date were newer than the contract's newest fully settled slate, the
  // two surfaces would again be telling different stories about the same day.
  const contractDate = loadTerminal().asOfSettledDate;
  const settled = getOptimizerSettledDates().slice().sort();
  const newest = settled[settled.length - 1] ?? null;
  if (contractDate && newest) {
    assert.ok(newest <= contractDate,
      `the status bar claims settlement through ${newest}, ahead of the contract's ${contractDate}`);
  }
});
