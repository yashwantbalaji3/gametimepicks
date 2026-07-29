/**
 * SPRINT 046 — every settle rate PRINTED IN A PAGE must still match the ledger.
 *
 * WHY THIS EXISTS, AND WHY THE EXISTING GUARD WAS NOT ENOUGH
 * Sprint 036 added `confidence-rate-accuracy.test.mjs`, which recomputes the three category settle
 * rates from the committed ledger and fails when `confidenceCaption()` drifts. That guard works, and
 * it is currently green.
 *
 * It guards ONE function. Sprint 046's audit found the same three numbers hardcoded again as literal
 * JSX in `board/page.tsx` (twice) and `about/page.tsx`, where nothing recomputed them. Category C had
 * moved from 51.7% to 51.0% in the ledger; the function-level caption followed, the page literals did
 * not. A user reading the board saw a number that had been wrong for weeks while CI stayed green.
 *
 * The lesson is that guarding the accessor is not the same as guarding the claim. This scans the
 * rendered source for settle-rate claims and checks each against the ledger, so a second copy of the
 * number cannot quietly diverge from the first.
 *
 * TOLERANCE 0.5pp, matching the Sprint 036 guard. When this fails the fix is to correct the page —
 * never to widen the tolerance.
 *
 * Run: npx tsx --test src/lib/published-rate-claims.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const APP = process.cwd();
const LEDGER = path.join(APP, "public/data/mlb/results/settled_leans.jsonl");
const TOLERANCE_PP = 0.5;

/** Files that render settle-rate claims to users. Add to this list, never remove to make a test pass. */
const SURFACES = ["src/app/board/page.tsx", "src/app/about/page.tsx"];

/**
 * Category → confidence tier. The product labels are A/B/C; the ledger stores High/Medium/Low.
 * Kept explicit because the mapping is the kind of thing that gets inverted silently.
 */
const CATEGORY_TIER = { A: "High", B: "Medium", C: "Low" };

async function tierRates() {
  const tally = { High: { w: 0, n: 0 }, Medium: { w: 0, n: 0 }, Low: { w: 0, n: 0 } };
  const rl = readline.createInterface({ input: fs.createReadStream(LEDGER), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.outcome !== "Win" && r.outcome !== "Loss") continue;
    const t = tally[r.confidence];
    if (!t) continue;
    t.n += 1;
    if (r.outcome === "Win") t.w += 1;
  }
  return Object.fromEntries(
    Object.entries(tally).map(([k, v]) => [k, v.n === 0 ? null : (100 * v.w) / v.n]),
  );
}

/**
 * Extract every "settled NN.N%" style claim together with the category it describes.
 *
 * Deliberately narrow: it only matches a claim that names a category, so unrelated percentages on the
 * page (coverage, freshness) are not swept in and forced to match a settle rate they never described.
 */
function claimsIn(source) {
  const out = [];
  // "Category C" ... "settled 51.7%"  /  "Category C" ... "Settled at 51.7%"
  const re = /Category\s+([ABC])[\s\S]{0,400}?[Ss]ettled(?:\s+at)?\s+(\d{1,2}\.\d)%/g;
  for (const m of source.matchAll(re)) out.push({ category: m[1], claimed: Number(m[2]) });
  return out;
}

test("every settle rate printed on a page still matches the ledger", async () => {
  const rates = await tierRates();
  const failures = [];
  let checked = 0;

  for (const rel of SURFACES) {
    const file = path.join(APP, rel);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const { category, claimed } of claimsIn(src)) {
      const tier = CATEGORY_TIER[category];
      const actual = rates[tier];
      if (actual == null) continue;
      checked += 1;
      const drift = Math.abs(claimed - actual);
      if (drift > TOLERANCE_PP) {
        failures.push(
          `${rel}: Category ${category} (${tier}) claims ${claimed.toFixed(1)}% but the ledger says ` +
            `${actual.toFixed(1)}% — drift ${drift.toFixed(2)}pp`,
        );
      }
    }
  }

  assert.ok(checked > 0, "no settle-rate claims found — the scan regex has drifted from the markup");
  assert.deepEqual(failures, [], `stale published settle rate(s):\n  ${failures.join("\n  ")}`);
});

test("the scan actually finds the claims it is meant to guard", () => {
  // A guard that silently matches nothing passes forever. This pins the extraction itself.
  const sample = `
    <div><span>Category A</span> — model and market differed by 5pp+ · settled 49.3%</div>
    <div><span>Category C</span> — differed by under 2.5pp · settled 51.0%</div>
  `;
  const found = claimsIn(sample);
  assert.equal(found.length, 2, `expected 2 claims, got ${JSON.stringify(found)}`);
  assert.deepEqual(found[0], { category: "A", claimed: 49.3 });
  assert.deepEqual(found[1], { category: "C", claimed: 51.0 });
});

test("a drifted claim is detected, not rounded away", () => {
  // Known-negative: prove the comparison has teeth at the tolerance boundary.
  const drift = Math.abs(51.7 - 51.0);
  assert.ok(drift > TOLERANCE_PP, "0.7pp must exceed the 0.5pp tolerance — this is the real drift that shipped");
  assert.ok(Math.abs(51.2 - 51.0) <= TOLERANCE_PP, "0.2pp must stay inside tolerance");
});
