/**
 * Bank Builder V2 · G-1/G-2 — the record is shown with its composition and with what the fold has NOT taken in yet
 * (read-only: nothing credited, no money changed); the June ladder is labelled as itself; and the Bank Builder pool
 * cannot reach a market-context family by any route.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { foldBacklog, foldReceipts } from "./protected-fold.mjs";

globalThis.React = React;
const { default: RecordComposition } = await import("../../components/bank-builder/record-composition.tsx");
const src = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const lane = (product, laneId, result, status = null, legs = []) => ({ product, lane: laneId, result, ...(status ? { status } : {}), legs });
const receipts = [
  { date: "2031-09-22", lanes: [lane("bank-builder", "A", "won"), lane("moonshot", "A", "lost")] },
  { date: "2031-09-23", lanes: [lane("bank-builder", "A", "lost"), lane("moonshot", "A", "pending", "active", [{ matchup: "TOR @ BAL", selection: "Over 7", result: "pending" }, { matchup: "MIL @ PHI", selection: "MIL -1.5", result: "won" }])] },
  { date: "2031-09-24", lanes: [lane("bank-builder", "A", "won"), lane("bank-builder", "B", "awaiting", "awaiting"), lane("bank-builder", "C", "lost", "skipped")] },
];

test("🔴 the backlog mirrors the fold: it halts where the fold halts, names the blocking leg, and counts every decided result after", () => {
  const fold = foldReceipts(receipts, { after: "2031-09-21" });
  assert.equal(fold.haltedAt, "2031-09-23", "the fold itself halts on the pending placed lane");
  const b = foldBacklog(receipts, { after: fold.foldedThrough });
  assert.equal(b.haltedAt, fold.haltedAt, "the disclosure halts where the fold halts");
  assert.deepEqual(b.blocking, [{ product: "moonshot", lane: "A", legs: [{ matchup: "TOR @ BAL", selection: "Over 7" }] }], "only the pending leg is named");
  assert.deepEqual(b.decided["bank-builder"], { won: 1, lost: 1 }, "decided results on and after the halt day — an unplaced (awaiting / skipped) lane is not a result, exactly as the fold treats it");
  const through24 = foldReceipts(receipts.map((r) => ({ ...r, lanes: r.lanes.map((l) => (l.result === "pending" ? { ...l, result: "lost" } : l)) })), { after: "2031-09-21" });
  assert.equal(through24.bankBuilder.lost, 1, "the fold itself never counts the skipped lane's 'lost'");
  assert.deepEqual(b.decided.moonshot, { won: 0, lost: 0 });
});

test("render: the record's window and era composition, and the backlog with its blocking leg", () => {
  const html = renderToStaticMarkup(React.createElement(RecordComposition, {
    recordLabel: "37–36", window: { from: "2026-06-09", to: "2026-09-22" },
    composition: [{ era: "PROTECTED_BASE", counts: { won: 19, lost: 14 }, window: { from: "2026-06-09", to: "2026-07-07" } }, { era: "RECEIPT_ERA", counts: { won: 18, lost: 22 }, window: { from: "2026-08-15", to: "2026-09-22" } }],
    backlog: { after: "2026-09-22", haltedAt: "2026-09-23", blocking: [{ product: "moonshot", lane: "A", legs: [{ matchup: "Toronto Blue Jays @ Baltimore Orioles", selection: "Over 7" }] }], decided: { "bank-builder": { won: 5, lost: 5 }, moonshot: { won: 0, lost: 5 } } },
  }));
  assert.match(html, /Record 37–36/);
  assert.match(html, /July protected base 19–14/);
  assert.match(html, /settled receipts 18–22/);
  assert.match(html, /Not yet in this record: 10 decided Bank Builder results after/);
  assert.match(html, /Toronto Blue Jays @ Baltimore Orioles · Over 7 \(Moonshot lane A\)/);
  const clean = renderToStaticMarkup(React.createElement(RecordComposition, { recordLabel: "37–36", window: null, composition: null, backlog: { after: "x", haltedAt: null, blocking: [], decided: { "bank-builder": { won: 0, lost: 0 } } } }));
  assert.doesNotMatch(clean, /Not yet in this record/, "no backlog line when the fold is current");
});

test("🔴 the page shows the composition; the June ladder no longer sits under the current record", () => {
  const page = src("src/app/bank-builder/page.tsx");
  assert.match(page, /<RecordComposition recordLabel=\{officialRecordLabel\}/);
  assert.match(page, /const foldBacklogView = loadFoldBacklog\(/, "through the one loader — no page opens the record owner inline");
  assert.match(page, /<PreviousHits hits=\{hits\} \/>/, "the legacy ladder is not handed the current record");
  const hits = src("src/components/bank-builder/previous-hits.tsx");
  assert.match(hits, /a completed earlier ladder, not the current record/);
  assert.doesNotMatch(hits, /Record <strong[^>]*>\{recordLabel\}/);
});

test("🔴 G-1 · the Bank Builder pool loads no demoted model picks and passes every leg through the ONE card-leg rule", () => {
  const acc = src("src/lib/daily-portfolio/accounting.ts");
  assert.doesNotMatch(acc, /loadMlbModelPicks\(/, "the demoted player-prop picks are not loaded at all");
  assert.match(acc, /\.filter\(\(p\) => !legIsMarketContext\(\{ sport: String\(p\.sport \?\? "MLB"\)\.toUpperCase\(\), market: p\.marketKey \?\? null \}, marketContext\)\)/);
  assert.doesNotMatch(src("src/lib/daily-portfolio/sport-eligibility.ts"), /model-qualified MLB legs/, "the stated source is market-priced team markets");
});

test("🔴 G-3 · home reads Lane A's rung from the placed-card receipts — the same owner /bank-builder reads", () => {
  const home = src("src/app/page.tsx");
  assert.match(home, /positionFromReceipts\(\{ receipts: readReceipts\(dataRoot, today\), product: "bank-builder", lane: "A"/);
  assert.ok(home.indexOf("laneAPosition.basis ? laneAPosition.nextStep") < home.indexOf("laneAView?.steps.find"), "receipts first; the frozen store only as a fallback");
  assert.match(src("src/app/bank-builder/page.tsx"), /positionFromReceipts\(\{ receipts: bbReceipts, product: "bank-builder", lane: "A"/);
});
