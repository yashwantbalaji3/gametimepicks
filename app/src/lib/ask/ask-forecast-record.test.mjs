/**
 * Session 13 · Ask V2 over the Forecast Record — getForecastFamilyPerformance and getForecastHistory against fixture
 * bytes in the exact shape the projection builder emits; the evidence sentences they produce; the router; and the
 * Ask mutation probes (each with a control): market probability never labelled ours, pending/withdrawn never a miss,
 * a projection never given a W–L, a filtered list never turned into a record, follow-up entity carried.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ASK_FORECAST_KINDS, ASK_FORECAST_ROW, ASK_STATUS, askAssetPath, ASK_INTENTS, ASK_DAILY_FILES } from "./contract.mjs";
import { ASK_TOOLS } from "./registry.mjs";
import { buildEvidence } from "./evidence.mjs";
import { getForecastFamilyPerformance, getForecastHistory } from "./tools/forecast-record.mjs";
import { createFakeProvider } from "./provider-fake.mjs";

const INDEX = {
  schemaVersion: 1, artifact: "ask-forecast-record", available: true, asOf: "2026-10-04T14:18:35Z",
  kpis: { forecasts: 10, measured: 6 },
  families: [
    { sport: "NFL", family: "player_reception_yds", label: "Receiving yards", kind: "CONTINUOUS_PROJECTION", counts: { published: 6, withdrawn: 0, measured: 4, pending: 1, void: 1, unmeasured: 0 }, n: 4, mae: 18.5, medianAbsError: 15, rmse: 22.1, bias: 3.2, coverage: { n: 4, inside: 0.75, target: 0.8 }, pickRecord: { win: 2, loss: 1, push: 0, basis: ["IMPLIED_SIDE_OF_FROZEN_LINE"] }, latestEvent: "2026-10-04T17:00Z", href: "/results/forecasts/nfl/player-reception-yds/" },
    { sport: "NFL", family: "anytime_td", label: "Anytime touchdown", kind: "BINARY_PROBABILITY", counts: { published: 4, withdrawn: 1, measured: 2, pending: 0, void: 1, unmeasured: 1 }, n: 2, brier: 0.163, logLoss: 0.506, meanForecast: 0.238, observedRate: 0.209, ece: 0.047, pickRecord: null, latestEvent: "2026-10-04T17:00Z", href: "/results/forecasts/nfl/anytime-td/" },
  ],
  gaps: [{ sport: "NFL", family: "nfl_score_shape", reason: "no settlement owner" }],
  shards: { nfl: 5 },
};
const K = (k) => ASK_FORECAST_KINDS.indexOf(k);
const row = (o) => ASK_FORECAST_ROW.map((c) => o[c] ?? null);
const SHARD = {
  schemaVersion: 1, artifact: "ask-forecast-rows", sport: "nfl", columns: [...ASK_FORECAST_ROW], kinds: [...ASK_FORECAST_KINDS],
  dict: { families: [["NFL", "player_reception_yds"], ["NFL", "anytime_td"]], subjects: [["nfl-athlete-4430807", "Jaxon Smith-Njigba", "SEA"], ["nfl-athlete-1", "Other Guy", "SEA"]], matchups: ["SEA @ ARI", "SEA vs LAR"] },
  rows: [
    row({ family: 0, date: "2026-10-04", subject: 0, matchup: 0, kind: K("CONTINUOUS_PROJECTION"), projection: 87, rangeLow: 40, rangeHigh: 130, state: "PENDING" }),
    row({ family: 0, date: "2026-09-28", subject: 0, matchup: 1, kind: K("CONTINUOUS_PROJECTION"), projection: 91, rangeLow: 45, rangeHigh: 135, state: "SETTLED", finalValue: 102, absoluteError: 11, directional: "WIN" }),
    row({ family: 0, date: "2026-09-21", subject: 0, matchup: 1, kind: K("CONTINUOUS_PROJECTION"), projection: 84, rangeLow: 40, rangeHigh: 128, state: "WITHDRAWN" }),
    row({ family: 0, date: "2026-09-14", subject: 0, matchup: 1, kind: K("CONTINUOUS_PROJECTION"), projection: 72, rangeLow: 30, rangeHigh: 110, state: "SETTLED", finalValue: 60, absoluteError: 12 }),
    row({ family: 1, date: "2026-09-28", subject: 0, matchup: 1, kind: K("BINARY_PROBABILITY"), probability: 0.31, state: "SETTLED", finalValue: 1, observed: 1, brier: 0.4761 }),
  ],
};
const ctx = (index = INDEX, shard = SHARD) => ({
  turn: { load: async (p) => (p === askAssetPath.forecastRecord() ? { ok: true, json: index } : p === askAssetPath.forecastRows("nfl") ? { ok: true, json: shard } : { ok: false }) },
});
const textOf = (env, tool) => buildEvidence([{ tool, status: env.status, links: env.links, data: env }]).facts.map((f) => f.text).join(" | ");

test("contract: two V2 intents, two registered tools, the record's files are daily (never committed / never stale)", () => {
  assert.ok(ASK_INTENTS.includes("FORECAST_HISTORY") && ASK_INTENTS.includes("MODEL_PERFORMANCE"));
  assert.ok(ASK_TOOLS.getForecastFamilyPerformance && ASK_TOOLS.getForecastHistory);
  for (const f of ["forecast-record.json", "forecast-record/nfl.json", "forecast-record/epl.json"]) assert.ok(ASK_DAILY_FILES.includes(f), f);
});

test("probe: EPL correct score reads as a top-1 exact-score hit rate, never as 'our likeliest outcome happened' (control: 1X2 keeps it)", async () => {
  const fam = (family, label, topClassLabel) => ({ sport: "EPL", family, label, kind: "MULTICLASS_PROBABILITY", counts: { published: 46, withdrawn: 0, measured: 46, pending: 0, void: 0, unmeasured: 0 }, n: 46, brier: 0.95, logLoss: 2.1, topClassAccuracy: 0.087, topClassLabel, uniformReference: { logLoss: 2.3979, brier: 0.9091 }, pickRecord: null, latestEvent: "2026-09-20T14:00Z", href: `/results/forecasts/epl/${family}/` });
  const index = { ...INDEX, families: [fam("epl_1x2", "Match result (1X2)", null), fam("epl_scoreline", "Correct score (top-10 table)", "top-1 exact-score hit rate (how often our single likeliest listed score was the exact final)")], gaps: [] };
  const r = await getForecastFamilyPerformance({ sport: "EPL" }, ctx(index));
  assert.equal(r.families.find((f) => f.family === "epl_scoreline").topClassLabel, "top-1 exact-score hit rate (how often our single likeliest listed score was the exact final)");
  const t = textOf(r, "getForecastFamilyPerformance");
  assert.match(t, /Correct score \(top-10 table\) forecasts[^|]*our top-1 exact-score hit rate \(how often our single likeliest listed score was the exact final\) is 8\.7%/);
  assert.doesNotMatch(t, /Correct score[^|]*likeliest outcome happened/);
  assert.match(t, /Match result \(1X2\) forecasts[^|]*our likeliest outcome happened 8\.7% of the time/, "control");
});

test("family performance: each kind in its own yardstick; no pooled number; the pick record only where published", async () => {
  const r = await getForecastFamilyPerformance({ sport: "NFL" }, ctx());
  assert.equal(r.status, ASK_STATUS.OK);
  const rec = r.families.find((f) => f.family === "player_reception_yds");
  assert.equal(rec.mae, 18.5);
  assert.equal(rec.brier, undefined, "a projection carries no Brier");
  const td = r.families.find((f) => f.family === "anytime_td");
  assert.equal(td.brier, 0.163);
  assert.equal(td.mae, undefined);
  assert.equal(td.pickRecord, null);
  const t = textOf(r, "getForecastFamilyPerformance");
  assert.match(t, /missed by 18\.5 on average/);
  assert.match(t, /Brier of 0\.163/);
  assert.match(t, /no single accuracy figure across forecast types/);
  assert.match(t, /none of those counts as a miss/);
  assert.match(t, /pick record is 2–1/);
  assert.doesNotMatch(t, /% accurate|overall accuracy/i);
  const none = await getForecastFamilyPerformance({ sport: "UFC" }, ctx());
  assert.equal(none.status, ASK_STATUS.UNSUPPORTED, "a sport with no measured family is unsupported, never 0/0");
});

test("history: the filters read what WE projected; pending / withdrawn are never misses; a list is not a record", async () => {
  const r = await getForecastHistory({ sport: "NFL", playerId: "nfl-athlete-4430807", family: "player_reception_yds", minProjection: 80, limit: 3 }, ctx());
  assert.equal(r.status, ASK_STATUS.OK);
  assert.equal(r.matched, 3, "87, 91 and 84 are over 80; 72 is not");
  assert.deepEqual(r.rows.map((x) => x.projection), [87, 91, 84]);
  const t = textOf(r, "getForecastHistory");
  assert.match(t, /this list is not a record/);
  assert.match(t, /not final yet, which is not a miss/);
  assert.match(t, /withdrawn before kickoff, which is not a miss/);
  assert.match(t, /the actual was 102, a miss of 11/);
  assert.doesNotMatch(t, /\b\d+(\.\d+)? ?% (hit|accura)/i, "no hit rate over a filtered window");
  const other = await getForecastHistory({ sport: "NFL", playerId: "nfl-athlete-1" }, ctx());
  assert.equal(other.matched, 0, "control: another player's rows never leak in");
  assert.equal((await getForecastHistory({ sport: "NFL" }, ctx())).status, ASK_STATUS.ERROR, "no subject → refused, never the whole league");
});

test("probe: a projection never gets a W–L unless a pick was published (control: the published pick does)", async () => {
  const r = await getForecastHistory({ sport: "NFL", playerId: "nfl-athlete-4430807", family: "player_reception_yds", limit: 10 }, ctx());
  const t = textOf(r, "getForecastHistory");
  assert.match(t, /the published pick was a WIN/, "control");
  const shard = JSON.parse(JSON.stringify(SHARD));
  shard.rows[3][ASK_FORECAST_ROW.indexOf("directional")] = null;
  const t2 = textOf(await getForecastHistory({ sport: "NFL", playerId: "nfl-athlete-4430807", family: "player_reception_yds", limit: 10 }, ctx(INDEX, shard)), "getForecastHistory");
  assert.equal((t2.match(/published pick/g) ?? []).length, 1, "the unpicked projection carries no pick word");
});

test("probe: no market probability is ever ours — the projection rows carry none, and the leak is caught if added", async () => {
  assert.ok(!ASK_FORECAST_ROW.some((c) => /market|implied|odds|book/i.test(c)), "control: no market column exists");
  const leak = [...ASK_FORECAST_ROW, "marketImpliedProbability"];
  assert.ok(leak.some((c) => /market|implied|odds|book/i.test(c)), "probe: a market column is detected");
});

test("router: history and performance questions reach their tools", async () => {
  const plan = async (q) => {
    const out = await createFakeProvider({}).plan({ user: `QUESTION: ${q}` });
    const t = typeof out.text === "string" ? out.text : JSON.stringify(out.text);
    return JSON.parse(t);
  };
  const h = await plan("How did Jaxon Smith-Njigba do the last 3 times we projected him over 80 receiving yards?");
  assert.equal(h.intent, "FORECAST_HISTORY");
  const call = h.calls.find((c) => c.name === "getForecastHistory");
  assert.deepEqual([call.arguments.family, call.arguments.minProjection, call.arguments.limit], ["player_reception_yds", 80, 3]);
  assert.equal(h.calls[0].name, "resolveEntity");
  const m = await plan("How well calibrated is your NFL anytime touchdown model?");
  assert.equal(m.intent, "MODEL_PERFORMANCE");
  assert.deepEqual(m.calls[0].arguments, { sport: "NFL", family: "anytime_td" });
});

test("follow-up: 'what about his receptions?' keeps the carried player id (no re-resolve); control: no earlier history turn", async () => {
  const plan = async (user) => JSON.parse((await createFakeProvider({}).plan({ user })).text);
  const user = [
    "EARLIER IN THIS CONVERSATION (the user's own turns):",
    "- How did Jaxon Smith-Njigba do the last 3 times we projected him over 80 receiving yards?",
    "",
    "ALREADY RESOLVED (use these ids directly — do not resolve these names again):",
    "- Jaxon Smith-Njigba: nfl-athlete-4430878 (NFL player)",
    "",
    "QUESTION: What about his receptions?",
  ].join("\n");
  const p = await plan(user);
  assert.equal(p.intent, "FORECAST_HISTORY");
  assert.deepEqual(p.calls.map((c) => c.name), ["getForecastHistory"], "the carried id is used directly");
  assert.deepEqual([p.calls[0].arguments.playerId, p.calls[0].arguments.family], ["nfl-athlete-4430878", "player_receptions"]);
  const cold = await plan("QUESTION: What about his receptions?");
  assert.notEqual(cold.intent, "FORECAST_HISTORY", "control: with no earlier forecast-history turn, a pronoun is not resolved to anyone");
});
