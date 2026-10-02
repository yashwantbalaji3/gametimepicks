/**
 * Session 5 · B10 — an operator-approved Bank Builder leg with no recorded provider or probability carries null,
 * never "consensus" and never 0 (settlement reads impliedProbability ?? modelConfidence, so a 0 became a 0%).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { approvedBankBuilderLanes } from "./accounting.ts";

test("missing provider and probability stay missing on an approved lane", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-approved-"));
  try {
    fs.mkdirSync(path.join(root, "mr-dub"), { recursive: true });
    fs.writeFileSync(path.join(root, "mr-dub", "bank-builder-approved.json"), JSON.stringify({
      date: "2031-07-07", stake: 100,
      lanes: [{ lane: "A", step: 1, legs: [
        { gameSlug: "g1", market: "mlb_moneyline", matchup: "A v B", selection: "A", americanOdds: -150 },
        { gameSlug: "g2", market: "mlb_moneyline", matchup: "C v D", selection: "C", americanOdds: -120, provider: "draftkings", modelProbability: 0.55 },
      ] }],
    }));
    const [lane] = approvedBankBuilderLanes(root, "2031-07-07");
    assert.equal(lane.legs[0].provider, null, "no recorded book is not 'consensus'");
    assert.equal(lane.legs[0].modelConfidence, null, "no recorded probability is not 0");
    assert.equal(lane.legs[1].provider, "draftkings");
    assert.equal(lane.legs[1].modelConfidence, 0.55);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
