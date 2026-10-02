/**
 * Session 5 · B4 — the risk-ladder record is bucketed by each slip's OWN combined price, in the canonical bands.
 *
 * It was bucketed by the optimizer's section key, whose spec is a different price scale (low < +300, medium
 * +300–600, high +600–1000, longshot ≥ +1000). Over 94 graded days the "Low risk (−200 to +100)" row held 497 of
 * 514 slips priced +100–+300, and every published card on /build carried the record of the next band up.
 * Runs the REAL producer in its write-nothing --record-only mode and recomputes independently.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { getRiskBucketForCombinedOdds } from "./risk-odds-bands.mjs";

const GRADED = "public/data/parlays/optimizer-graded";
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const am = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));

test("the producer's per-band record equals an independent recount by each slip's own price", () => {
  if (!fs.existsSync(GRADED)) return;
  const out = JSON.parse(execFileSync(process.execPath, ["scripts/parlays/build-risk-ladder.mjs", "--now", "2026-10-02T02:00:00Z", "--record-only"], { encoding: "utf8" }));
  const want = {};
  let unbanded = 0;
  for (const f of fs.readdirSync(GRADED).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    const doc = JSON.parse(fs.readFileSync(path.join(GRADED, f), "utf8"));
    for (const t of ["low", "medium", "high", "longshot"]) for (const s of doc.publicRiskSections?.[t]?.all ?? []) {
      const legs = s.legs ?? [];
      const priced = legs.length && legs.every((l) => l.oddsForSide != null && Number.isFinite(Number(l.oddsForSide)));
      const band = priced ? getRiskBucketForCombinedOdds(am(legs.reduce((x, l) => x * dec(Number(l.oddsForSide)), 1))) : null;
      if (!band) { unbanded += 1; continue; }
      const st = String(s.status ?? "pending").toLowerCase();
      want[band] ??= { wins: 0, losses: 0 };
      if (st === "win") want[band].wins += 1; else if (st === "loss") want[band].losses += 1;
    }
  }
  for (const t of ["low", "medium", "high", "longshot"]) {
    assert.deepEqual({ wins: out.byTier[t].wins, losses: out.byTier[t].losses }, want[t] ?? { wins: 0, losses: 0 }, `${t}: the record must count the slips priced in ${t}`);
  }
  assert.equal(out.unbanded, unbanded);
});

test("a slip's band follows its price, never the optimizer section it came from", () => {
  // A +250 slip from the optimizer's "low" section is Medium risk by price.
  assert.equal(getRiskBucketForCombinedOdds(250), "medium");
  assert.equal(getRiskBucketForCombinedOdds(450), "high");
});
