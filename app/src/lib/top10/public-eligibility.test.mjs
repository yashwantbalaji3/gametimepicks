/**
 * PE-1 · /markets public eligibility. The ranked board may only rank forecast families the coverage registry
 * makes publicly eligible on a model basis, never demoted / paused / not-publicEligible / market-implied / UFC
 * families, and it fails closed when the status owners cannot be read. Acceptance asserts WHICH families may
 * be ranked, never a fixed count.
 *
 * Run: npx tsx --test src/lib/top10/public-eligibility.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadEligibilityInputs, partitionRankable, rankingIneligibility } from "./public-eligibility.ts";
import { buildTop10Board } from "./top10-picks.ts";
import { notStarted } from "../../components/markets/model-ranked-list.tsx";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const fresh = (families = []) => ({ generatedAt: "2026-10-07T09:00:00Z", families });
const coverage = {
  markets: [
    { sport: "mlb", market: "player_props", publicEligible: false, predictionSource: "projection_only",
      demotedFamilies: ["batter_hits"], governedFamilies: ["batter_hits"] },
    { sport: "mlb", market: "total", publicEligible: true, predictionSource: "market_anchored" },
    { sport: "nfl", market: "totals", publicEligible: false, predictionSource: "independent_sim" },
    { sport: "nfl", market: "anytime_touchdown", publicEligible: true, predictionSource: "independent_sim" },
    { sport: "nfl", market: "receptions", publicEligible: true, predictionSource: "independent_sim" },
    { sport: "ufc", market: "moneyline", publicEligible: true, predictionSource: "experimental_model" },
  ],
};
const inputs = (scorecard = fresh()) => ({ coverage, scorecard });
const why = (sport, family, i = inputs()) => rankingIneligibility({ sport, family }, i, NOW);

test("a publicly eligible model family is ranked", () => {
  assert.equal(why("nfl", "anytime_touchdown"), null);
});

test("demoted, not-publicEligible and market-implied families are never ranked", () => {
  assert.equal(why("mlb", "batter_hits"), "DEMOTED");
  assert.equal(why("nfl", "totals"), "NOT_PUBLIC_ELIGIBLE");
  assert.equal(why("mlb", "total"), "MARKET_BASIS", "a sportsbook-derived probability is market context, not a model pick (K4)");
});

test("a family BREACHED on the model-health scorecard is paused (Q7: every breached family)", () => {
  assert.equal(why("nfl", "receptions", inputs(fresh([{ id: "nfl_receptions", state: "BREACHED" }]))), "PAUSED");
  assert.equal(why("nfl", "receptions", inputs(fresh([{ id: "nfl_receptions", state: "WATCH" }]))), null);
});

test("UFC is excluded explicitly, even when a registry row would admit it (Q6)", () => {
  assert.equal(why("ufc", "moneyline"), "UFC_EXPERIMENTAL");
});

test("FAILS CLOSED: unreadable registry, missing or stale scorecard, unknown family or sport", () => {
  assert.equal(rankingIneligibility({ sport: "nfl", family: "anytime_touchdown" }, { coverage: null, scorecard: fresh() }, NOW), "STATUS_UNREADABLE");
  assert.equal(rankingIneligibility({ sport: "nfl", family: "anytime_touchdown" }, { coverage, scorecard: null }, NOW), "STATUS_UNREADABLE");
  assert.equal(why("nfl", "anytime_touchdown", inputs({ generatedAt: "2026-10-01T00:00:00Z", families: [] })), "STATUS_UNREADABLE", "older than 72 h");
  assert.equal(why("nfl", "no_such_family"), "UNRESOLVED_FAMILY");
  assert.equal(why("cricket", "anytime_touchdown"), "UNRESOLVED_FAMILY");
  assert.equal(why("nfl", ""), "UNRESOLVED_FAMILY");
});

test("withheld rows are published with their reason; order of the kept rows is preserved", () => {
  const rows = [
    { id: "a", sport: "nfl", family: "anytime_touchdown" },
    { id: "b", sport: "mlb", family: "batter_hits" },
    { id: "c", sport: "nfl", family: "anytime_touchdown" },
  ];
  const { kept, withheld } = partitionRankable(rows, inputs(), NOW);
  assert.deepEqual(kept.map((r) => r.id), ["a", "c"]);
  assert.deepEqual(withheld, [{ id: "b", family: "batter_hits", reason: "DEMOTED" }]);
});

test("a started event is not an upcoming pick on the reader's clock; an unknown start never is", () => {
  const pick = (startsAt) => ({ startsAt });
  assert.equal(notStarted(pick("2026-10-07T20:00:00Z"), NOW), true);
  assert.equal(notStarted(pick("2026-10-07T12:00:00Z"), NOW), false, "starting now = started");
  assert.equal(notStarted(pick("2026-10-07T11:00:00Z"), NOW), false);
  assert.equal(notStarted(pick(null), NOW), false);
});

/* ── AGAINST THE COMMITTED REGISTRY AND BOARDS ───────────────────────────────────────────────────── */

const root = path.join(process.cwd(), "public", "data");
const real = loadEligibilityInputs(root);

test("LIVE · the registry projection loads, and every family it demotes or marks not publicEligible is unrankable", () => {
  assert.ok(Array.isArray(real.coverage?.markets) && real.coverage.markets.length > 0, "coverage projection readable");
  const nowMs = Date.parse(real.scorecard?.generatedAt ?? "");
  for (const m of real.coverage.markets) {
    for (const f of m.demotedFamilies ?? []) assert.equal(rankingIneligibility({ sport: m.sport, family: f }, real, nowMs), "DEMOTED", `${m.sport}:${f}`);
    if (m.publicEligible !== true && !(m.demotedFamilies ?? []).includes(m.market) && m.sport !== "ufc") {
      assert.notEqual(rankingIneligibility({ sport: m.sport, family: m.market }, real, nowMs), null, `${m.sport}:${m.market} is not publicEligible`);
    }
  }
});

test("LIVE · every row the newest boards rank passes the rule; nothing demoted, paused or UFC is ranked", () => {
  const dir = path.join(root, "mlb", "boards");
  if (!fs.existsSync(dir)) return;
  const dates = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort().slice(-3);
  for (const date of dates) {
    const nowMs = Date.parse(`${date}T09:00:00-04:00`);
    const board = buildTop10Board(root, date, nowMs, real);
    for (const tab of ["overall", "safe", "props"]) {
      for (const p of board[tab]) {
        // Each date is judged with the scorecard as committed; a stale scorecard withholds everything.
        assert.equal(rankingIneligibility(p, real, nowMs), null, `${date} · ${tab}: ${p.sport}:${p.family} ranked but ineligible`);
      }
    }
    for (const w of board.withheldIneligible) assert.ok(w.reason, `${date}: withheld ${w.id} names its reason`);
  }
});

test("source · /markets passes the build instant and the list re-checks on the reader's clock", () => {
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/markets/page.tsx"), "utf8");
  assert.match(page, /buildTop10Board\(.*, today, builtAtMs\)/, "the board is built at the same instant the list is seeded with");
  assert.match(page, /eyebrow="Market context"/, "the page is named for what it mostly shows");
  assert.doesNotMatch(page, /eyebrow="Picks"/);
  const list = fs.readFileSync(path.join(process.cwd(), "src/components/markets/model-ranked-list.tsx"), "utf8");
  assert.match(list, /^"use client";/, "the re-check runs in the reader's browser");
  assert.match(list, /setNowMs\(Date\.now\(\)\)/, "after mount the reader's clock replaces the build instant");
  assert.match(list, /filter\(\(p\) => notStarted\(p, nowMs\)\)/, "started rows leave the ranking");
  assert.match(list, /withheldIneligible/, "an empty ranking explains what was withheld");
});
