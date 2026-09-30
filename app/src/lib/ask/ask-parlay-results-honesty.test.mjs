/**
 * Phase E · E-3 — parlays, results and links say only what their owners publish: today's product date by default,
 * an empty day reported as empty, a demoted-family leg never offered as a GameTime projection, no W–L computed over
 * a returned window, every tool-issued link approved, and no market status frozen into the help corpus.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import { makeExecutor } from "./executor.mjs";
import { makeAskLoader, fixtureFetchText } from "./loader.mjs";
import { buildEvidence } from "./evidence.mjs";
import { ASK_ERROR, isApprovedLink } from "./contract.mjs";
import { HELP_CHUNKS } from "./help-source.mjs";

const NOW = () => new Date("2031-10-03T16:00:00Z"); // ET 2031-10-03
const leg = (market) => ({ sport: "MLB", market, marketLabel: market, playerName: "P", side: "Over", line: 0.5, oddsForSide: -110, projection: 1.1, confidence: "High" });
const slip = (id, markets) => ({ slipId: id, profile: "MEDIUM", sport: "MLB", legCount: markets.length, legs: markets.map(leg), score: 0.5, correlationPenalty: 0, payoutPer100: null });
const coverage = { schemaVersion: 1, markets: [{ sport: "mlb", market: "player_props", demotedFamilies: ["batter_hits"], publicEligible: false }] };
const parlays = (byDate) => ({ schemaVersion: 1, dates: Object.keys(byDate), byDate: Object.fromEntries(Object.entries(byDate).map(([d, profiles]) => [d, { date: d, eligibleSports: ["mlb"], profiles }])) });
const run = (doc, args = {}) => makeExecutor({ turn: makeAskLoader(fixtureFetchText({ "/data/ask/v1/parlays.json": doc, "/data/ask/v1/coverage.json": coverage })).beginTurn(), now: NOW })
  .run({ name: "getParlayCandidates", arguments: { riskProfile: "MEDIUM", ...args } });

test("🔴 an omitted date is today's product date; an empty day is reported as nothing published, never as 'no match'", async () => {
  // The NEWEST snapshot (10-04) is not today (10-03): the old default served whichever date was newest.
  const doc = parlays({ "2031-10-02": { MEDIUM: [slip("old", ["synthetic_ok"])] }, "2031-10-03": {}, "2031-10-04": { MEDIUM: [slip("next", ["synthetic_ok"])] } });
  const r = await run(doc);
  assert.equal(r.error, ASK_ERROR.NOT_PUBLISHED);
  assert.equal(r.detail, "no parlay candidates were published for 2031-10-03", "another day's slate is never served as today's");
  assert.deepEqual(r.data.availableDates, ["2031-10-02", "2031-10-04"], "only days that actually published are offered");
});

test("🔴 a slip with a demoted-family leg is withheld and counted; if all are, the answer says why", async () => {
  const mixed = await run(parlays({ "2031-10-03": { MEDIUM: [slip("ok", ["synthetic_ok", "synthetic_ok"]), slip("bad", ["batter_hits", "synthetic_ok"])] } }));
  assert.deepEqual(mixed.data.candidates.map((c) => c.slipId), ["ok"]);
  assert.equal(mixed.data.withheldMarketContext, 1);
  const all = await run(parlays({ "2031-10-03": { MEDIUM: [slip("bad", ["batter_hits"])] } }));
  assert.equal(all.error, ASK_ERROR.NOT_PUBLISHED);
  assert.match(all.detail, /1 parlay candidates were built for 2031-10-03, but every one uses a market-context family \(batter_hits\)/);
  const ev = buildEvidence([{ id: "E1", tool: "getParlayCandidates", status: "OK", data: mixed.data }]);
  assert.ok(ev.facts.some((f) => /1 further candidates for 2031-10-03 were withheld because they use market-context families/.test(f.text)));
});

test("🔴 every link a tool can issue is one the answer validator approves (no retired /parlay-lab/, /bank-builder/ approved)", () => {
  const dir = path.join(process.cwd(), "src/lib/ask/tools");
  // EVERY internal-path string in a tool — in an href field or a lookup map (results.mjs PRODUCT_HREF) — minus
  // asset and API paths, which are never links.
  const hrefs = fs.readdirSync(dir).filter((f) => f.endsWith(".mjs"))
    .flatMap((f) => [...fs.readFileSync(path.join(dir, f), "utf8").matchAll(/"(\/(?:[a-z0-9-]+\/)*)"/g)].map((m) => [f, m[1]]))
    .filter(([, h]) => !/^\/(?:data|api)\//.test(h));
  assert.ok(hrefs.length > 5, "tool links were found");
  for (const [f, h] of hrefs) assert.ok(isApprovedLink(h), `${f}: ${h} would be refused as UNSUPPORTED_LINK`);
  assert.ok(!hrefs.some(([, h]) => h === "/parlay-lab/"), "the retired Parlay Lab route is not issued");
});

test("🔴 the help corpus states no market's CURRENT status — that is the coverage registry's (they used to disagree)", () => {
  const MARKET = /(over\/under|totals?|rushing yards|receiving yards|receptions|anytime touchdown|passing yards|batter hits|strikeouts)/i;
  for (const c of HELP_CHUNKS) {
    for (const sentence of String(c.text).split(/(?<=[.!?])\s+/)) {
      if (!MARKET.test(sentence)) continue;
      assert.doesNotMatch(sentence, /\b(?:is|are)\s+(?:paused|published|not yet published)\b|\bis not\b[^.]*\bpublished\b/i, `help "${c.title}" asserts a status: ${sentence}`);
    }
  }
});
