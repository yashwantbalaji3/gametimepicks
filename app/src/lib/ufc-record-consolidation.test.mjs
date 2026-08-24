/**
 * UFC record consolidation guards (Program 196 · Release C).
 *
 * Three defects this release fixed, pinned so they cannot rot back:
 *   1. The current graded record was gated INSIDE the retired era's settlement conditional — the
 *      wrong artifact going missing would have hidden the live record behind an archive's empty
 *      state. The current record must render before, and independent of, the `settled ?` branch.
 *   2. The page claimed the model "has never been SCORED against a no-vig line" while the graded
 *      ledger below scored exactly that, bout by bout.
 *   3. ESPN's scoreboard default page size truncated a 13-bout card to 7 — the entire main card,
 *      headliner included, silently absent while every returned row read STATUS_FINAL. Every
 *      scoreboard call must carry limit=1000.
 *
 * Run: npx tsx --test src/lib/ufc-record-consolidation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const page = read("src/app/ufc/page.tsx");

test("ONE record region: eras labelled, archive behind a named disclosure, boundary stated", () => {
  assert.match(page, /Current era · fight model vs de-vigged price/, "the current era is labelled as what it is");
  assert.match(page, /retired moneyline era — one settled card/, "the archive disclosure names its era and its size");
  assert.match(page, /The two eras never share a metric/, "the comparability boundary is stated on the page");
  assert.match(page, /Settled archive/, "the archive keeps its heading");
});

test("the current record renders BEFORE and independent of the retired era's settlement gate", () => {
  const graded = page.indexOf("GradedPicksSection record={ufcGraded}");
  const settledBranch = page.indexOf("{settled ? (");
  assert.ok(graded > -1 && settledBranch > -1, "both surfaces exist");
  assert.ok(graded < settledBranch, "the graded record must not live inside the archive's conditional — the wrong artifact going missing would hide it");
});

test("the page no longer denies the comparison it renders", () => {
  assert.ok(!page.includes("has never been SCORED against a no-vig line"), "the expired claim is gone");
  assert.match(page, /IS scored against the de-vigged\s+line/, "the current state is stated instead");
  assert.match(page, /cumulative comparison currently favours the market/, "and the direction of the early sample is named, not hidden");
});

test("every UFC scoreboard call carries limit=1000 — the default page size ate a main card", () => {
  for (const rel of ["scripts/ufc/capture-ufc-results.mjs", "scripts/ufc/capture-ufc-events.mjs", "scripts/ufc/build-ufc-card.mjs", "scripts/ufc/fetch-ufc-history.mjs"]) {
    const src = read(rel);
    for (const m of src.matchAll(/mma\/ufc\/scoreboard\?[^`"']*/g)) {
      assert.ok(m[0].includes("limit=1000"), `${rel}: scoreboard call without limit=1000 → ${m[0].slice(0, 80)}`);
    }
  }
});

test("the model-vs-market summary keeps a CUMULATIVE block the latest card cannot displace", () => {
  const s = JSON.parse(read("../data/internal/research/ufc/model-vs-market/summary.json"));
  assert.ok(s.cumulative, "cumulative exists beside latestRun");
  assert.ok(s.cumulative.n >= s.latestRun.n, "cumulative covers at least the latest run");
  const ledger = read("../data/internal/research/ufc/model-vs-market/graded.jsonl").split("\n").filter((l) => l.trim());
  const decisive = ledger.map((l) => JSON.parse(l)).filter((r) => r.void !== true && r.model?.logLoss != null && r.market?.logLoss != null);
  assert.equal(s.cumulative.n, decisive.length, "cumulative n recounts the ledger exactly — a drifted summary is a hand-written number");
});
