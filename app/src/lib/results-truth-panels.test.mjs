/**
 * TRUTH-001 — Results panels state the record they actually describe.
 *
 * Run: npx tsx --test src/lib/results-truth-panels.test.mjs
 *
 *   C1  /results "What the model is learning" read a 2026-06-07 artifact no job regenerates (no generatedAt) and
 *       listed NBA Points as "Working" at 53.7% while the ledger says 47.3%. Now withheld unless current.
 *   C2  /results/model-audit led with a gold "Cross-sport" tile pooling frozen NBA with live MLB (50.2% over
 *       52,928) — the blend eb3590fead removed from /results. Each sport now stands alone; NBA says it is frozen.
 *   C3  The /results accuracy footnote said "since 2026-05-27" above lifetime figures that start May 15/16.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { insightsAreCurrent, getMarketReliabilityInsights, MAX_INSIGHTS_LAG_DAYS } from "./market-reliability.ts";
import { windowsText } from "../components/projection-accuracy-summary.tsx";

const APP = process.cwd();
const json = (rel) => JSON.parse(fs.readFileSync(path.join(APP, "public/data", rel), "utf8"));
const src = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("C1 · the committed June artifact has no generation time, so it is withheld", () => {
  const raw = json("audit/market-reliability.json");
  assert.equal(raw.generatedAt, undefined, "premise: the artifact never stated when it was written");
  const newest = json("mlb/results/lifetime_summary.json").newestDate;
  assert.equal(getMarketReliabilityInsights(newest), null);
  assert.equal(getMarketReliabilityInsights(null), null, "no settled date to judge against → withheld");
});

test("C1 · the currency rule", () => {
  assert.equal(insightsAreCurrent("2026-10-08T06:00:00Z", "2026-10-08"), true);
  assert.equal(insightsAreCurrent("2026-10-01T00:00:00Z", "2026-10-08"), true, `${MAX_INSIGHTS_LAG_DAYS} days is the limit`);
  assert.equal(insightsAreCurrent("2026-09-30T23:00:00Z", "2026-10-08"), false);
  assert.equal(insightsAreCurrent("2026-06-07T06:54:28Z", "2026-10-08"), false, "the real June artifact");
  assert.equal(insightsAreCurrent("not a date", "2026-10-08"), false);
});

test("C2 · model-audit renders no pooled cross-sport figure, and NBA states its frozen window", () => {
  const page = src("src/app/results/model-audit/page.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(page, /sports\.cross/);
  assert.doesNotMatch(page, /label="Cross-sport"/);
  assert.match(page, /\(frozen\)/);
  const audit = json("audit/model_audit.json");
  assert.ok(audit.sports.nba.sampleSize.newestDate < audit.sports.mlb.sampleSize.newestDate, "premise: NBA stopped, MLB is live");
});

test("C3 · the footnote states each record's own window, from the lifetime summaries", () => {
  const mlb = json("mlb/results/lifetime_summary.json");
  const nba = json("results/lifetime_summary.json");
  const text = windowsText([{ label: "MLB", from: mlb.oldestDate, to: mlb.newestDate }, { label: "NBA", from: nba.oldestDate, to: nba.newestDate }]);
  assert.equal(text, `MLB ${mlb.oldestDate} → ${mlb.newestDate} · NBA ${nba.oldestDate} → ${nba.newestDate}`);
  assert.ok(nba.oldestDate < "2026-05-27" && mlb.oldestDate < "2026-05-27", "premise: both records start before the parlay era date the footnote used to print");
  assert.equal(windowsText([]), "");
  const page = src("src/app/results/page.tsx");
  assert.match(page, /windows=\{\[/);
  assert.match(page, /mlbLeg\?\.oldestDate/);
});
