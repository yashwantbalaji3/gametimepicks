/**
 * Page-weight budgets (Program 207 · Phase 11).
 *
 * Evidence-based ceilings, not synthetic scores: /results shipped 8.1MB of HTML (1,743 inline
 * avatar leg-rows across 10 date sections) before the P207 cap-to-3-with-linked-archive fix took
 * it to ~2.8MB with every record one click away. The budgets sit above current measurements with
 * headroom for daily growth and FAIL when a regression drags a page back toward the old weight.
 * Skips when no export exists (the suite must not demand a build it didn't make).
 *
 * Run: npx tsx --test src/lib/uiux/page-weight.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { BUDGET_KB, FAMILY_BUDGET_KB } from "./page-weight-budgets.mjs";

const out = path.join(process.cwd(), "out");

test("high-traffic pages stay inside their evidence-based weight budgets", (t) => {
  if (!fs.existsSync(path.join(out, "index.html"))) { t.skip("no export in this run"); return; }
  for (const [rel, kb] of Object.entries(BUDGET_KB)) {
    const p = path.join(out, rel);
    if (!fs.existsSync(p)) continue;
    const size = fs.statSync(p).size / 1024;
    assert.ok(size <= kb, `${rel}: ${Math.round(size)}KB exceeds the ${kb}KB budget — the last breach was 1,743 inline avatar rows; fix at the render owner, never by hiding records`);
  }
});

test("every page a budgeted route family emits stays inside the family ceiling", (t) => {
  if (!fs.existsSync(path.join(out, "index.html"))) { t.skip("no export in this run"); return; }
  for (const [dir, kb] of Object.entries(FAMILY_BUDGET_KB)) {
    const base = path.join(out, dir);
    const pages = fs.existsSync(base) ? fs.readdirSync(base).map((d) => path.join(base, d, "index.html")).filter((p) => fs.existsSync(p)) : [];
    assert.ok(pages.length > 0, `${dir}: the family emitted no pages — a ceiling over nothing is vacuous`);
    for (const p of pages) {
      const size = fs.statSync(p).size / 1024;
      assert.ok(size <= kb, `${path.relative(out, p)}: ${Math.round(size)}KB exceeds the ${dir}/* ${kb}KB family budget — fix at the render owner, never by hiding records`);
    }
  }
});
