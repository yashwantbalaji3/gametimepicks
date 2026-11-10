/**
 * Founder decision 2026-11-10 (Parlay Lab V3 decision 2): NBA Elo is never an official risk tier. Forward only.
 *   npx tsx --test src/lib/products/level-a/nba-untier.test.mjs
 * Reads the committed NBA lane for 2026-11-10 and the committed Level A record; no price, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildLevelAModel } from "./model.mjs";
import { gradeRecord } from "./grade.mjs";
import { NBA_GW_POLICIES } from "./nba-game-winner-tiers.mjs";
import { eloWinProbabilityOf, eloWinProbabilityText, eloWinProbabilityAttr, eloCalibrationCaveat } from "../../sports/nba/elo-win-probability.mjs";
import { loadEloWinProbabilityContext } from "../../sports/nba/elo-win-probability-context.mjs";
import { committedFinals, LEVEL_A_RECORD_FILE, LEVEL_A_GRADES_FILE } from "../../../../scripts/products/grade-level-a-suggestions.mjs";

globalThis.React = React;
const { default: LevelASuggestions } = await import("../../../components/products/level-a-suggestions.tsx");
const REPO = path.resolve(process.cwd(), "..");
const DAY = "2026-11-10";
const NOW = "2026-11-10T20:00:00Z";
const lane = JSON.parse(fs.readFileSync(path.join(REPO, "app/public/data/nba/experimental-public", `${DAY}.json`), "utf8"));
const MODEL = buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY });
const cardsOf = (m) => [...m.parlayLab.map((t) => t.card), m.bankBuilder?.card, m.moonshot?.card].filter(Boolean);

test("no NBA leg in any tiered card (cross-sport and mixed), and no NBA game-winner tier block", () => {
  assert.ok(lane.games.length > 0, "the committed slate has NBA games");
  assert.equal(MODEL.nbaGameWinners, undefined, "the NBA game-winner tier block is off");
  for (const c of cardsOf(MODEL)) assert.ok(c.legs.every((l) => l.sport !== "nba"), `${c.policy} ${c.tier}`);
  /* even when a caller asks for the block, the mixed engine never takes an NBA leg */
  const forced = buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, nbaGameWinners: { enabled: true }, mixed: { enabled: true } });
  for (const c of cardsOf(forced)) assert.ok(c.legs.every((l) => l.sport !== "nba"));
});

test("research section: every NBA side listed as MODEL PROJECTION with the game page's exact text and a one-line caveat", () => {
  const html = renderToStaticMarkup(React.createElement(LevelASuggestions, { model: MODEL, mode: "parlay-lab" }));
  const ctx = loadEloWinProbabilityContext({ appDir: path.join(REPO, "app") });
  const favoured = lane.games.filter((g) => g.elo?.state === "FAVOURED" && Date.parse(g.tipUtc) > Date.parse(NOW));
  assert.ok(favoured.length > 0);
  for (const g of favoured) {
    const v = eloWinProbabilityOf(g, { enabled: ctx.enabled });
    if (!v) continue;
    /* the game page prints <… data-nba-elo-wp="attr">text</…> through the same accessor (components/nba/elo-win-probability.tsx) */
    assert.ok(html.includes(`data-nba-elo-wp="${eloWinProbabilityAttr(v)}">${eloWinProbabilityText(v).replace(/&/g, "&amp;")}<`), g.providerEventId);
  }
  assert.ok((html.match(/data-model-projection=""/g) ?? []).length >= favoured.length);
  assert.equal((html.match(/data-nba-elo-wp-caveat=""/g) ?? []).length, 1, "the caveat once per list");
  assert.ok(html.includes(eloCalibrationCaveat(ctx)));
  assert.ok(!/data-level-a-card="[^"]*nba:/.test(html), "no card key names an NBA game");
});

test("frozen history is byte-identical: recorded NBA game-winner cards stay in the record and re-grade exactly as committed", () => {
  const recordText = fs.readFileSync(LEVEL_A_RECORD_FILE, "utf8");
  const gradedText = fs.readFileSync(LEVEL_A_GRADES_FILE, "utf8");
  const record = recordText.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const gwPolicies = new Set(Object.values(NBA_GW_POLICIES).map(String));
  const gw = record.filter((e) => gwPolicies.has(e.policy) || e.legs?.some((l) => l.sport === "nba") && e.tier !== "untiered");
  assert.ok(gw.length > 0, "the record holds historical NBA tiered cards");
  assert.ok(gw.every((e) => Date.parse(e.recordedAt) < Date.parse("2026-11-10T19:51:23Z")), "every one predates the founder decision");
  /* re-grading the whole committed record against the committed finals adds nothing that conflicts with what is graded */
  const withDay = record.map((e) => ({ ...e, legs: e.legs.map((l) => ({ ...l, productDay: e.productDay })) }));
  const { conflicts } = gradeRecord({ record: withDay, graded: gradedText.split("\n").filter(Boolean).map((l) => JSON.parse(l)), finals: committedFinals({ repoRoot: REPO, nowIso: NOW }), gradedAt: NOW });
  assert.deepEqual(conflicts, [], "a historical card would grade differently");
  /* this change never edits the record files: a new build only appends (record.mjs appendRecord) */
  assert.equal(fs.readFileSync(LEVEL_A_RECORD_FILE, "utf8"), recordText);
});
