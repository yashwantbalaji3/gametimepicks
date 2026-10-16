/**
 * UX Release 1 — defects found by the consolidated browser sweep (2026-10-16, docs/ux/UX_RELEASE_1_TEST_REPORT.md).
 * Each test names its finding (UXR1-xx) and the audit rule it applies. Rendering was verified in Chromium at
 * 320 / 390 / 768 / 1440 px against the static export; these pin the source so the fix cannot quietly revert.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("UXR1-01 (GTP-21/32 follow-up, DS-001 §9): revealing the last row moves focus to the count, never to <body>", () => {
  for (const [p, ref, limit, step, total] of [
    ["src/components/results/results-explorer.tsx", "cardStatusRef", "cardLimit", "CARD_STEP", "selectedCards.length"],
    ["src/components/results/model-results-explorer.tsx", "detailStatusRef", "detailLimit", "DETAIL_STEP", "visibleDetail.length"],
  ]) {
    const s = src(p);
    assert.match(s, new RegExp(`<p ref=\\{${ref}\\} tabIndex=\\{-1\\} role="status" aria-live="polite"`), `${p}: the count is the focus target`);
    assert.match(s, new RegExp(`if \\(${limit} !== ${step} && ${limit} >= ${total.replace(".", "\\.")}\\) ${ref}\\.current\\?\\.focus\\(\\);`), `${p}: focus moves only once everything is shown`);
    // Keyed on the step alone — a filter change (which resets the step) must never pull focus off the filter.
    assert.match(s, new RegExp(`${ref}\\.current\\?\\.focus\\(\\);(?:\\n\\s*//[^\\n]*)*\\n\\s*\\}, \\[${limit}\\]\\);`), `${p}: effect depends on the step only`);
  }
});

test("UXR1-02 (DS-001 §9): every results-day table scrolls inside its own container (no page scroll at 320 px)", () => {
  for (const p of ["src/components/results/results-day.tsx", "src/components/results/suggested-receipts.tsx"]) {
    const s = src(p);
    const tables = (s.match(/<table className="gtp-day-table"/g) ?? []).length;
    const wrapped = (s.match(/<div className="overflow-x-auto">\s*<table className="gtp-day-table"/g) ?? []).length;
    assert.ok(tables > 0, `${p}: POSITIVE CONTROL — the day tables are still here`);
    assert.equal(wrapped, tables, `${p}: ${tables - wrapped} day table(s) without a scroll container`);
  }
});

test("UXR1-03 (DS-001 §9): the MLB line-vs-projection bar fills its row instead of a 9,999 px track clipped to a blank strip", () => {
  const row = src("src/components/mlb/mlb-lean-row.tsx");
  assert.doesNotMatch(row, /width=\{9999\}/, "a 9,999 px track puts the centre tick (the line) ~5,000 px off-screen");
  assert.match(row, /<MlbProjectionGap[\s\S]{0,160}width="100%"/, "the detailed card's bar fills the card");
  assert.match(src("src/components/mlb/mlb-projection-gap.tsx"), /width\?: number \| string;/);
});
