/**
 * Release C guards (Program 174): the classifier is total, ordered correctly, and — the load-
 * bearing property — VALIDATED_PICK is mechanically unreachable from the experimental engine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  classifyTeamOutput, classifyPlayerOutput, OUTPUT_STATES, STATE_MEANING,
  permitsValidatedLanguage, permitsProductLeg, EXPERIMENTAL_STATES,
} from "./output-state.mjs";

const NOW = "2026-08-13T20:00:00Z";
const KICK = "2026-08-13T23:00:00Z";
const forecast = {
  kickoffUtc: KICK,
  home: { abbr: "CIN" }, away: { abbr: "DET" },
  forecastSummary: { winProbability: { home: 0.479, away: 0.521 } },
  marketComparison: { marketHomeWinPct: 0.714 },
};

test("every state carries a reader-facing meaning, and none mentions profit", () => {
  for (const s of OUTPUT_STATES) {
    assert.ok(STATE_MEANING[s], `${s} needs a meaning`);
    assert.doesNotMatch(STATE_MEANING[s], /\b(edge|profit|profitable|lock|best bet|guaranteed)\b/i, `${s} meaning must stay neutral`);
  }
});

test("VALIDATED_PICK IS MECHANICALLY UNREACHABLE from an experimental artifact", () => {
  // no combination of market disagreement, confidence, or copy can reach it
  for (const marketPct of [0.05, 0.5, 0.95]) {
    for (const modelPct of [0.05, 0.5, 0.95]) {
      const out = classifyTeamOutput({
        forecast: { ...forecast, forecastSummary: { winProbability: { home: modelPct, away: 1 - modelPct } } },
        market: { consensus: { homeWinProbNoVig: marketPct } },
        result: null, settlement: null, nowIso: NOW,
      });
      assert.notEqual(out.state, "VALIDATED_PICK", `model ${modelPct} vs market ${marketPct} must never validate`);
      assert.ok(EXPERIMENTAL_STATES.includes(out.state), `got ${out.state}`);
    }
  }
  // it requires an explicit validated block the public-beta engine never emits
  const withBlock = classifyTeamOutput({
    forecast: { ...forecast, validated: { approved: true, modelVersion: "v9", priceAtApproval: -110 } },
    market: null, result: null, settlement: null, nowIso: NOW,
  });
  assert.equal(withBlock.state, "VALIDATED_PICK", "the branch exists — it is simply unreachable without the block");
  // and the committed public artifact carries no such block
  const pub = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/forecasts/latest.json"), "utf8"));
  for (const f of pub.forecasts) assert.equal(f.validated, undefined, `${f.matchup} must carry no validated block`);
});

test("only VALIDATED_PICK permits validated language or a product leg", () => {
  for (const s of OUTPUT_STATES) {
    assert.equal(permitsValidatedLanguage(s), s === "VALIDATED_PICK");
    assert.equal(permitsProductLeg(s), s === "VALIDATED_PICK");
  }
});

test("ordering: settled > final > started > stale > validated > lean > experimental", () => {
  const base = { forecast, market: null, result: null, settlement: null, nowIso: NOW };
  assert.equal(classifyTeamOutput({ ...base, settlement: { settled: true } }).state, "SETTLED");
  assert.equal(classifyTeamOutput({ ...base, result: { statusRaw: "STATUS_FINAL" } }).state, "STARTED");
  assert.equal(classifyTeamOutput({ ...base, nowIso: "2026-08-13T23:30:00Z" }).state, "STARTED", "past kickoff locks");
  assert.equal(classifyTeamOutput({ ...base, forecast: { ...forecast, stale: true } }).state, "STALE");
});

test("a big model/market disagreement is a LEAN — and is explicitly not an edge", () => {
  const out = classifyTeamOutput({ forecast, market: { consensus: { homeWinProbNoVig: 0.714 } }, result: null, settlement: null, nowIso: NOW });
  assert.equal(out.state, "EXPERIMENTAL_LEAN");
  assert.equal(out.gapPp, -23.5);
  assert.equal(out.leansTo, "DET", "the lean points at the side the model favours relative to the market");
  assert.match(out.notAnEdge, /not been shown to beat the market/);
  assert.ok(out.mustAlsoShow.includes("settled experimental record"));
  // a small gap stays a plain experimental forecast
  const small = classifyTeamOutput({ forecast, market: { consensus: { homeWinProbNoVig: 0.50 } }, result: null, settlement: null, nowIso: NOW });
  assert.equal(small.state, "PUBLIC_EXPERIMENTAL");
});

test("no forecast → market view or model-unavailable, never a fabricated forecast", () => {
  assert.equal(classifyTeamOutput({ forecast: null, market: { consensus: {}, kickoffUtc: KICK }, result: null, settlement: null, nowIso: NOW }).state, "MARKET_VIEW");
  assert.equal(classifyTeamOutput({ forecast: null, market: null, result: null, settlement: null, nowIso: NOW }).state, "MODEL_UNAVAILABLE");
});

test("PLAYER · role evidence gates everything; a line never proves participation", () => {
  const p = { projection: { median: 45 }, nowIso: NOW, kickoffUtc: KICK };
  // a posted line with no role evidence is STILL withheld
  const withLine = classifyPlayerOutput({ ...p, roleState: "ROLE_UNCERTAIN", line: 45.5 });
  assert.equal(withLine.state, "ROLE_UNCERTAIN");
  assert.equal(withLine.withheld, true);
  assert.equal(classifyPlayerOutput({ ...p, roleState: "SOURCE_STALE", line: null }).state, "ROLE_UNCERTAIN");
  assert.equal(classifyPlayerOutput({ ...p, roleState: "OUT", line: 45.5 }).state, "ROLE_UNCERTAIN");
  // with role but no line → projection only, and no value claim
  const proj = classifyPlayerOutput({ ...p, roleState: "ACTIVE_EXPECTED", line: null });
  assert.equal(proj.state, "PROJECTION_ONLY");
  assert.equal(proj.noValueClaim, true);
  // with role AND a line → experimental comparison
  assert.equal(classifyPlayerOutput({ ...p, roleState: "ACTIVE_EXPECTED", line: 45.5 }).state, "PUBLIC_EXPERIMENTAL");
  // missing participation never becomes a zero projection
  assert.equal(classifyPlayerOutput({ ...p, projection: null, roleState: "ACTIVE_EXPECTED", line: null }).state, "MODEL_UNAVAILABLE");
});

test("the classifier is pure — it reads no files and no clock of its own", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/nfl/output-state.mjs"), "utf8");
  assert.doesNotMatch(src, /readFileSync|node:fs|Date\.now\(\)|new Date\(\)/, "every input arrives as a parameter");
});

test("REAL ARTIFACTS · tonight's committed forecasts all classify inside the experimental tier", () => {
  const pub = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/forecasts/latest.json"), "utf8"));
  for (const f of pub.forecasts) {
    const out = classifyTeamOutput({
      forecast: f,
      market: f.marketComparison?.state === "MARKET_VIEW" ? { consensus: { homeWinProbNoVig: f.marketComparison.marketHomeWinPct } } : null,
      result: null, settlement: null, nowIso: pub.generatedAt,
    });
    assert.ok(EXPERIMENTAL_STATES.includes(out.state), `${f.matchup} classified ${out.state}`);
    assert.equal(permitsProductLeg(out.state), false, `${f.matchup} must not qualify a product leg`);
  }
});
