/**
 * Stage 13 prep (Soccer). The /soccer/[league] header must not claim "the same model as our Premier League page"
 * unless the league's published artifact and the EPL's published artifact name the same model id. On 2026-10-07
 * Ligue 1 published epl-model-v1-split-poisson and the EPL published epl-model-v2-elo-poisson, so the claim was false.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { soccerLeaguePages } from "./leagues.mjs";

const APP = process.cwd();
const page = fs.readFileSync(path.join(APP, "src/components/soccer/league-forecast-page.tsx"), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, "");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(APP, "public/data/soccer", rel), "utf8"));

test("the league page never says it uses the same model as the Premier League while the model ids differ", () => {
  const eplIds = new Set((readJson("epl/forecasts/latest.json").rows ?? []).map((r) => r.modelId).filter(Boolean));
  for (const l of soccerLeaguePages()) {
    const id = readJson(`${l.key}/forecasts/latest.json`).model?.id;
    assert.ok(id, `${l.key}: published artifact names no model id`);
    if (!(eplIds.size === 1 && eplIds.has(id))) assert.doesNotMatch(page, /same model as our Premier League/i, `${l.key} runs ${id}, the EPL runs ${[...eplIds].join(", ")}`);
  }
});
