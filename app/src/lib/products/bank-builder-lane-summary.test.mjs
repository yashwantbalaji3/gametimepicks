/**
 * Audit F10: every Bank Builder lane summary names its lane, from the same receipts /bank-builder reads.
 * Run: npx tsx --test src/lib/products/bank-builder-lane-summary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { bankBuilderLaneSummary, bankBuilderLaneSummaryFrom } from "./bank-builder-lane-summary.mjs";
import { positionFromReceipts, readReceipts } from "./ladder-position.mjs";
import { BANK_BUILDER_LADDER } from "../bank-builder-ladder.ts";

const L = BANK_BUILDER_LADDER;
const rec = (date, lane, step, result) => ({ date, lanes: [{ product: "bank-builder", lane, step, status: "active", result, stake: 100, potentialReturn: result === "won" ? L.find((r) => r.step === step).goal : 0 }] });

test("names both lanes, each at its own receipt position", () => {
  const s = bankBuilderLaneSummaryFrom({ receipts: [rec("2026-10-10", "A", 1, "won"), rec("2026-10-11", "B", 1, "lost")], ladder: L });
  assert.equal(s.phrase, "Lane A awaiting Step 2 · Lane B awaiting Step 1");
});

test("an open card is said as open, not as awaiting", () => {
  const s = bankBuilderLaneSummaryFrom({ receipts: [rec("2026-10-10", "A", 1, "won"), rec("2026-10-12", "A", 2, "pending")], ladder: L });
  assert.match(s.phrase, /^Lane A Step 2 card open · Lane B awaiting Step 1$/);
});

test("no placed receipt at all: no phrase (the caller keeps its own fallback)", () => {
  assert.equal(bankBuilderLaneSummaryFrom({ receipts: [], ladder: L }).phrase, null);
});

test("the committed receipts: the summary agrees with the per-lane positions /bank-builder draws", () => {
  const root = path.resolve(process.cwd(), "public/data");
  const today = "2099-01-01";
  const s = bankBuilderLaneSummary({ dataRoot: root, today, ladder: L });
  const receipts = readReceipts(root, today);
  for (const lane of ["A", "B"]) {
    const p = positionFromReceipts({ receipts, product: "bank-builder", lane, ladder: L, seed: L[0].start });
    assert.equal(s.lanes.find((x) => x.lane === lane).nextStep, p.nextStep, lane);
  }
  if (s.phrase) assert.match(s.phrase, /^Lane A .+ · Lane B .+$/);
});

test("Today reads its Bank Builder summary from this helper, and its fallback names the lane", () => {
  const page = fs.readFileSync(path.resolve(process.cwd(), "src/app/today/page.tsx"), "utf8");
  assert.match(page, /bankBuilderLaneSummary\(\{ dataRoot, today, ladder: BANK_BUILDER_LADDER/);
  assert.match(page, /const bbStepPhrase = bbLanes\.phrase \?\? \(awaitingRung != null \? `Lane A awaiting Step \$\{awaitingRung\}`/);
});

test("Home, Today and /bank-builder state the same two lanes from the same receipts", () => {
  const read = (f) => fs.readFileSync(path.resolve(process.cwd(), f), "utf8");
  // Home and Today both phrase the summary through the helper, with the same arguments.
  for (const f of ["src/app/page.tsx", "src/app/today/page.tsx"]) {
    assert.match(read(f), /bankBuilderLaneSummary\(\{ dataRoot, today, ladder: BANK_BUILDER_LADDER as never \}\)/, f);
    assert.doesNotMatch(read(f), /bbStepPhrase = awaitingRung != null \? `awaiting Step/, `${f}: no unnamed single-lane summary`);
  }
  // /bank-builder draws each lane from positionFromReceipts over readReceipts(dataRoot, today) — the helper's own source.
  const bb = read("src/app/bank-builder/page.tsx");
  for (const lane of ["A", "B"]) assert.match(bb, new RegExp(`${lane}: positionFromReceipts\\(\\{ receipts: bbReceipts, product: "bank-builder", lane: "${lane}"`));
  assert.match(bb, /const bbReceipts = readReceipts\(dataRoot, today\)/);
  // And on the committed receipts the three agree: the helper's phrase is exactly the two positions /bank-builder draws.
  const root = path.resolve(process.cwd(), "public/data");
  const day = "2099-01-01";
  const receipts = readReceipts(root, day);
  const pos = (lane) => positionFromReceipts({ receipts, product: "bank-builder", lane, ladder: L, seed: L[0].start });
  const s = bankBuilderLaneSummary({ dataRoot: root, today: day, ladder: L });
  if (s.phrase) {
    const say = (lane) => (pos(lane).state === "held" ? `Lane ${lane} Step ${pos(lane).nextStep} card open` : `Lane ${lane} awaiting Step ${pos(lane).nextStep}`);
    assert.equal(s.phrase, `${say("A")} · ${say("B")}`);
  }
});
