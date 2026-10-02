/**
 * Session 5 · Phase B — Ask reads the OFFICIAL published cards (getOfficialProductCards), never reconstructs them.
 * Before: "What is today's Bank Builder?" had no source; "today's suggested parlays" came from the optimizer's
 * candidate pool, a different population from the ladder /build publishes.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { makeExecutor } from "./executor.mjs";
import { makeAskLoader, fixtureFetchText } from "./loader.mjs";
import { buildEvidence } from "./evidence.mjs";
import { laneState } from "./tools/official-cards.mjs";
import { createFakeProvider } from "./provider-fake.mjs";

const NOW = () => new Date("2031-09-30T16:00:00Z"); // ET 2031-09-30
const official = {
  suggestedDates: ["2031-09-29", "2031-09-30"],
  suggested: {
    "2031-09-30": {
      date: "2031-09-30", generatedAt: "2031-09-30T11:00:00Z",
      cards: [{ tier: "medium", tierLabel: "Medium risk", slipId: "s1", combinedAmerican: 127, status: "pending", legs: [{ player: "Zack Gelof", team: "ATH", opponent: "HOU", marketLabel: "Hits", side: "Over", line: 0.5, odds: -172, result: null }] }],
      skipped: [{ tier: "low", tierLabel: "Low risk", reason: "no priced card in this tier on today's slate" }],
      withheldMarketContext: 0,
    },
  },
  portfolioDates: ["2031-09-30"],
  portfolios: {
    "2031-09-30": {
      date: "2031-09-30", generatedAt: "2031-09-30T16:42:00Z", source: "published",
      lanes: [
        { product: "bank-builder", productLabel: "Bank Builder", lane: "A", step: 4, status: "active", combinedOdds: 153, reason: null, legs: [{ matchup: "Boston Red Sox @ New York Yankees", selection: "Boston Red Sox +1.5", market: "Run Line", odds: -198, book: "draftkings", probabilityBasis: "market-implied", kickoffEt: "8:00 PM ET" }] },
        { product: "moonshot", productLabel: "Moonshot", lane: "A", step: 1, status: "awaiting", combinedOdds: null, reason: "fewer than 2 eligible legs — awaiting a full card", legs: [] },
      ],
    },
  },
};
const parlays = { schemaVersion: 1, artifact: "ask-parlays", dates: [], byDate: {}, official };
const exec = () => makeExecutor({ turn: makeAskLoader(fixtureFetchText({ "/data/ask/v1/parlays.json": parlays })).beginTurn(), now: NOW });

test("today's official cards: the published ladder card and its no-card tier, verbatim", async () => {
  const ex = exec();
  const r = await ex.run({ id: "c1", name: "getOfficialProductCards", arguments: { product: "SUGGESTED_PARLAYS" } });
  assert.equal(r.status, "OK");
  assert.equal(r.data.products.suggestedParlays.cards[0].combinedAmerican, 127);
  const text = buildEvidence(ex.evidence).facts.map((f) => f.text).join("\n");
  assert.match(text, /2031-09-30 official Medium risk card, 1 legs, combined \+127 American/);
  assert.match(text, /Low risk: no card was published — the ladder's own reason: no priced card in this tier/);
  assert.match(text, /does not model correlation/);
  assert.doesNotMatch(text, /tierRecord|hit rate|wins|losses/i, "the ladder's tier record is the optimizer population — not this tool's to state");
});

test("'show me the lowest-risk option' with no Low risk card says so — it never substitutes another tier", async () => {
  const r = await exec().run({ id: "c1", name: "getOfficialProductCards", arguments: { product: "SUGGESTED_PARLAYS", riskTier: "LOW" } });
  assert.equal(r.data.products.suggestedParlays.state, "NO QUALIFYING CARD");
  assert.deepEqual(r.data.products.suggestedParlays.cards, []);
});

test("Bank Builder placed card and Moonshot NO CARD PLACED — no-card is published, never pending", async () => {
  const ex = exec();
  await ex.run({ id: "c1", name: "getOfficialProductCards", arguments: {} });
  const text = buildEvidence(ex.evidence).facts.map((f) => f.text).join("\n");
  assert.match(text, /Bank Builder lane A \(step 4\): CARD PLACED, combined \+153 American, 1 legs/);
  assert.match(text, /Boston Red Sox \+1\.5 \(Run Line, Boston Red Sox @ New York Yankees\), priced -198 at draftkings, its probability is the market's implied price/);
  assert.match(text, /Moonshot lane A \(step 1\): NO CARD PLACED — the product's own reason: fewer than 2 eligible legs/);
  assert.doesNotMatch(text, /Moonshot[^\n]*pending/i);
  assert.equal(laneState({ status: "awaiting", legs: [] }), "NO CARD PLACED");
  assert.equal(laneState({ status: "lost", result: "lost", legs: [{}] }), "LOST");
});

test("a day nothing was published is NOT_PUBLISHED, with the latest published date — never a reconstruction", async () => {
  const r = await exec().run({ id: "c1", name: "getOfficialProductCards", arguments: { date: "2031-09-28" } });
  assert.equal(r.status, "UNSUPPORTED");
  assert.equal(r.data?.products?.suggestedParlays?.latestPublishedDate ?? r.products?.suggestedParlays?.latestPublishedDate, "2031-09-30");
});

test("the planner routes official-card questions to the official tool, records to getProductRecord", async () => {
  const provider = createFakeProvider();
  const plan = async (q) => JSON.parse((await provider.plan({ user: `QUESTION: ${q}` })).text);
  for (const [q, product] of [["What is today's Bank Builder?", "BANK_BUILDER"], ["What is today's Moonshot?", "MOONSHOT"], ["Why is there no Moonshot card today?", "MOONSHOT"], ["What are today's suggested parlays?", "SUGGESTED_PARLAYS"], ["Show me the lowest-risk option from today's suggested cards", "SUGGESTED_PARLAYS"]]) {
    const p = await plan(q);
    assert.equal(p.intent, "PRODUCT_CARDS", q);
    assert.equal(p.calls.at(-1).name, "getOfficialProductCards", q);
    assert.equal(p.calls.at(-1).arguments.product, product, q);
  }
  assert.equal((await plan("What is Bank Builder's record?")).calls.at(-1).name, "getProductRecord");
});

test("LIVE: the built projection carries the official block from the published artifacts", () => {
  const p = "../data/ask-projection/v1/parlays.json";
  if (!fs.existsSync(p)) return;
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.ok(doc.official, "no official block — Ask would have no authoritative read path");
  const ladderDir = "public/data/parlays/risk-ladder";
  for (const d of doc.official.suggestedDates) {
    const l = JSON.parse(fs.readFileSync(`${ladderDir}/${d}.json`, "utf8"));
    assert.equal(doc.official.suggested[d].cards.length, (l.cards ?? []).length, `${d}: the projection must carry exactly the published cards`);
    assert.ok(!("tierRecord" in (doc.official.suggested[d].cards[0] ?? {})), "the optimizer-population record is not carried");
  }
  for (const lane of Object.values(doc.official.portfolios).flatMap((x) => x.lanes)) {
    for (const k of ["stake", "exposure", "potentialReturn", "activeBankroll"]) assert.ok(!(k in lane), `money field ${k} must not reach Ask`);
  }
});
