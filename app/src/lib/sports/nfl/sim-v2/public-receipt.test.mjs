/**
 * Simulation V2 on a public page (founder P0 · 2026-10-05): which receipt a reader may see, and what the page may say.
 * The record is the latest receipt generated BEFORE kickoff; it is shown only with 0 incoherent runs and ≥ 10,000 runs;
 * a failing record shows nothing (an older receipt is never substituted). The page stays separate from the canonical
 * forecast, reads no market number, and labels representative runs as not the forecast.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { MIN_PUBLIC_RUNS, readShadowReceipts, showableSimulationEvents, simulationOfRecord } from "./public-receipt.mjs";

const APP = process.cwd();
const ROOT = path.resolve(APP, "..");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const base = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/sim-v2/shadow/2026-10-05/401872979.json"), "utf8"));
const entry = (over = {}, file = "x.json") => ({ file, receipt: { ...structuredClone(base), ...over } });

test("tonight's ATL @ NO record is showable: pre-kickoff, 10,000 runs, 0 incoherent, SHADOW, market not an input", () => {
  const rec = simulationOfRecord(readShadowReceipts(ROOT), "401872979");
  assert.ok(rec, "a pre-kickoff receipt exists");
  assert.deepEqual(rec.refusals, []);
  assert.equal(rec.showable, true);
  const r = rec.receipt;
  assert.ok(Date.parse(r.generatedAt) < Date.parse(r.eventStart), "generated before kickoff");
  assert.ok(r.runCount >= MIN_PUBLIC_RUNS);
  assert.equal(r.validation.failedRuns, 0);
  assert.equal(r.validation.sampleCount, r.runCount);
  assert.equal(r.promotionState, "SHADOW");
  assert.match(r.marketUse, /^NOT_AN_INPUT/);
  assert.ok(showableSimulationEvents(readShadowReceipts(ROOT)).includes("401872979"));
});

test("the record is the LATEST pre-kickoff receipt; anything at or after kickoff is never the record", () => {
  const early = entry({ generatedAt: "2026-10-05T02:13:06Z" }, "a.json");
  const late = entry({ generatedAt: "2026-10-05T23:40:00Z", simulationReceiptId: "late" }, "b.json");
  const atKick = entry({ generatedAt: "2026-10-06T00:15:00Z", simulationReceiptId: "atKick" }, "c.json");
  const live = entry({ generatedAt: "2026-10-06T01:00:00Z", simulationReceiptId: "live" }, "d.json");
  assert.equal(simulationOfRecord([early, late, atKick, live], "401872979").receipt.simulationReceiptId, "late");
  assert.equal(simulationOfRecord([atKick, live], "401872979"), null, "no pre-kickoff receipt: no record");
});

test("FAIL CLOSED: an incoherent or short record shows nothing, and an older receipt is never substituted", () => {
  const good = entry({ generatedAt: "2026-10-05T02:13:06Z" }, "a.json");
  const incoherent = entry({ generatedAt: "2026-10-05T20:00:00Z", validation: { ...base.validation, failedRuns: 3, failureCodes: { "S0:REC_NE_CMP": 3 } } }, "b.json");
  const r1 = simulationOfRecord([good, incoherent], "401872979");
  assert.equal(r1.showable, false);
  assert.ok(r1.refusals.some((x) => /incoherent runs: 3/.test(x)));
  assert.deepEqual(showableSimulationEvents([good, incoherent]), [], "the older coherent receipt does not stand in");
  const short = entry({ generatedAt: "2026-10-05T20:00:00Z", runCount: 2000, validation: { ...base.validation, sampleCount: 2000 } }, "c.json");
  assert.equal(simulationOfRecord([good, short], "401872979").showable, false, "fewer than 10,000 runs is refused");
  const market = entry({ generatedAt: "2026-10-05T20:00:00Z", marketUse: "consensus moneyline" }, "d.json");
  assert.equal(simulationOfRecord([good, market], "401872979").showable, false, "a market input is refused");
  const promoted = entry({ generatedAt: "2026-10-05T20:00:00Z", promotionState: "PUBLIC" }, "e.json");
  assert.equal(simulationOfRecord([good, promoted], "401872979").showable, false, "no receipt may promote itself");
  assert.equal(simulationOfRecord([good], "401872979").showable, true, "control: the coherent record alone is shown");
});

const report = fs.readFileSync(path.join(APP, "src/components/nfl/simulation-v2-report.tsx"), "utf8");
const page = fs.readFileSync(path.join(APP, "src/app/nfl/simulation/[eventId]/page.tsx"), "utf8");
const link = fs.readFileSync(path.join(APP, "src/components/nfl/simulation-v2-link.tsx"), "utf8");
const gamePage = fs.readFileSync(path.join(APP, "src/app/nfl/game/[eventId]/page.tsx"), "utf8");

test("the page is generated only for showable records and 404s otherwise (dynamicParams=false)", () => {
  assert.match(strip(page), /showableSimulationEvents\(entries\(\)\)/);
  assert.match(strip(page), /dynamicParams = false/);
  assert.match(strip(page), /if \(!rec\?\.showable\) notFound\(\)/);
  assert.match(strip(link), /if \(!rec\?\.showable\) return null/, "the game-page link never points at a page the build refused");
});

test("separate from the canonical forecast: its own labelled card, the scorecard label untouched, experimental wording", () => {
  assert.match(gamePage, /expected statistical summaries · not one simulated game/, "the canonical scorecard keeps its truthful label");
  assert.match(report, /Game Time Forecast · our main model · not part of this simulation/);
  assert.match(report, /Simulation V2 · experimental/);
  assert.match(report, /not our main forecast/);
  assert.match(report, /has not been shown to be more accurate/);
  assert.match(report, /Representative simulation — not the forecast/);
  assert.match(link, /separate from this forecast/);
});

test("no market number is read or shown (probe: a market read is caught)", () => {
  const MARKET = /marketComparison|moneyline|impliedProbability|overOdds|yesOdds|sportsbook line|marketHomeWinPct/;
  for (const [name, src] of [["report", report], ["page", page], ["link", link]]) assert.ok(!MARKET.test(strip(src)), `${name} reads a market field`);
  assert.ok(MARKET.test("s.marketComparison.marketHomeWinPct"), "probe");
});
