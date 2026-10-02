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
  /* The ladder's own `tierRecord` is the optimizer CANDIDATE population (model detail since D1) — never stated here.
     With no published-card record in the projection, no record sentence exists at all. */
  assert.doesNotMatch(text, /tierRecord|hit rate|wins|losses|candidate/i);
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

test("the planner prompt never asks a risk style before showing the official cards (Production 2026-10-02)", () => {
  // "What are today's suggested parlays?" was answered with "Could you please let me know your preferred risk style".
  const src = fs.readFileSync("src/lib/ask/planner.mjs", "utf8");
  assert.match(src, /asks to BUILD or explore parlay candidates and has stated no risk preference/);
  assert.match(src, /Never ask this for today's official Suggested Parlays, Bank Builder or Moonshot/);
  assert.doesNotMatch(src, /"- If the user asks for parlays and has stated no risk preference/);
});

test("'why is this leg in the Bank Builder?' is answered in the product's own published words", async () => {
  const withWhy = structuredClone(parlays);
  withWhy.official.portfolios["2031-09-30"].lanes[0].why = ["Safest-fit (MLB): chosen to MAXIMIZE the chance all 2 legs land — a market-implied 36% chance (what the prices imply, not a forecast)."];
  withWhy.official.portfolios["2031-09-30"].lanes[0].correlationNote = "Correlation checked: no shared game with Lane B.";
  const ex = makeExecutor({ turn: makeAskLoader(fixtureFetchText({ "/data/ask/v1/parlays.json": withWhy })).beginTurn(), now: NOW });
  await ex.run({ id: "c1", name: "getOfficialProductCards", arguments: { product: "BANK_BUILDER" } });
  const text = buildEvidence(ex.evidence).facts.map((f) => f.text).join("\n");
  assert.match(text, /the product's own reason for this card: Safest-fit \(MLB\): chosen to MAXIMIZE the chance all 2 legs land/);
  assert.match(text, /Correlation checked: no shared game with Lane B\./);
});

test("LIVE: published lanes carry their own why-words into the projection, verbatim", () => {
  const p = "../data/ask-projection/v1/parlays.json";
  if (!fs.existsSync(p)) return;
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  const pub = Object.values(doc.official?.portfolios ?? {}).find((x) => x.source === "published");
  if (!pub) return;
  const src = JSON.parse(fs.readFileSync("public/data/mr-dub/daily-portfolio.json", "utf8"));
  for (const l of pub.lanes) {
    const own = src.lanes.find((x) => x.product === l.product && x.lane === l.lane);
    assert.deepEqual(l.why, (own?.whyThisCard ?? []).slice(0, 4), `${l.product} ${l.lane}: why-words must be the product's own`);
  }
});

/* ── Session 7 — published-card tier records and a real history window ─────────────────────────────── */
const withRecord = (rec) => ({ ...parlays, official: { ...official, suggestedRecord: rec } });
const execWith = (doc) => makeExecutor({ turn: makeAskLoader(fixtureFetchText({ "/data/ask/v1/parlays.json": doc })).beginTurn(), now: NOW });
const PUB = { population: "PUBLISHED_CARDS", sport: "mlb", since: "2031-08-17", settledDays: 30, overall: { wins: 21, losses: 88, pushes: 0 }, byTier: { low: { tierLabel: "Low Risk", wins: 3, losses: 5, pushes: 0 }, medium: { tierLabel: "Medium Risk", wins: 9, losses: 31, pushes: 1 } } };

test("'How have Low Risk cards performed?' answers with the PUBLISHED-card Low Risk record only", async () => {
  const ex = execWith(withRecord(PUB));
  const r = await ex.run({ id: "c1", name: "getOfficialProductCards", arguments: { product: "SUGGESTED_PARLAYS", riskTier: "LOW" } });
  assert.deepEqual(Object.keys(r.data.products.suggestedParlays.record.byTier), ["low"]);
  assert.equal(r.data.products.suggestedParlays.record.overall, null, "a tier question does not get the overall figure to add up");
  const text = buildEvidence(ex.evidence).facts.map((f) => f.text).join("\n");
  assert.match(text, /Low Risk published cards since 2031-08-17: 3–5 \(wins–losses\); this counts only published cards/);
  assert.doesNotMatch(text, /Medium Risk published cards/);
});

test("a record whose population is not PUBLISHED_CARDS is never stated (the candidate pool cannot leak in)", async () => {
  const r = await execWith(withRecord({ ...PUB, population: "CANDIDATE_POOL" })).run({ id: "c1", name: "getOfficialProductCards", arguments: { product: "SUGGESTED_PARLAYS" } });
  assert.equal(r.data.products.suggestedParlays.record, null);
});

test("a risk level's record answers on a day with no ladder; without a tier, that day stays NOT PUBLISHED", async () => {
  const ex = execWith(withRecord(PUB));
  const r = await ex.run({ id: "c1", name: "getOfficialProductCards", arguments: { product: "SUGGESTED_PARLAYS", riskTier: "MEDIUM", date: "2031-09-28" } });
  assert.equal(r.status, "OK");
  assert.equal(r.data.products.suggestedParlays.state, "NOT PUBLISHED");
  const text = buildEvidence(ex.evidence).facts.map((f) => f.text).join("\n");
  assert.match(text, /no official Suggested Parlays ladder was published for 2031-09-28/);
  assert.match(text, /Medium Risk published cards since 2031-08-17: 9–31–1 \(wins–losses–pushes\)/);
  const plain = await execWith(withRecord(PUB)).run({ id: "c1", name: "getOfficialProductCards", arguments: { product: "SUGGESTED_PARLAYS", date: "2031-09-28" } });
  assert.equal(plain.status, "UNSUPPORTED");
});

test("the offline router sends a risk level's performance to the official cards tool with that tier", async () => {
  const provider = createFakeProvider();
  const plan = async (q) => JSON.parse((await provider.plan({ user: `QUESTION: ${q}` })).text);
  for (const [q, tier] of [["How have Low Risk cards performed?", "LOW"], ["What's the Longshot record?", "LONGSHOT"], ["How has medium risk done?", "MEDIUM"]]) {
    const p = await plan(q);
    const call = p.calls.find((c) => c.name === "getOfficialProductCards");
    assert.ok(call, `${q} → ${JSON.stringify(p.calls)}`);
    assert.equal(call.arguments.riskTier, tier);
  }
});

test("the projection keeps a bounded multi-week history of official cards (not 3 days)", () => {
  const src = fs.readFileSync(new URL("../../../scripts/ask/build-ask-projections.mjs", import.meta.url), "utf8");
  const m = /const OFFICIAL_HISTORY_DAYS = (\d+);/.exec(src);
  assert.ok(m && Number(m[1]) >= 14 && Number(m[1]) <= 60, "history window must be bounded and at least two weeks");
  assert.match(src, /function buildOfficialCards\(days = OFFICIAL_HISTORY_DAYS\)/);
});
