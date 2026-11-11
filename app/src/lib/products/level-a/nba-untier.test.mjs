/**
 * Founder decision 2026-11-10 (Parlay Lab V3 decision 2): NBA Elo is never an official risk tier. Forward only.
 *   npx tsx --test src/lib/products/level-a/nba-untier.test.mjs
 * Reads the committed NBA lane for 2026-11-10 and the committed Level A record; no price, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
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

/*
 * KNOWN_POST_DECISION_NBA_TIERED: recorded after founder decision 2 by pre-#1306 code; public on /build until #1306
 * deployed 2026-11-11T05:58:37Z; graded as committed. Production deployment 09b121d0a7 (live 2026-11-11T01:13:54Z)
 * served these three cards (the recorder verified them on its pages); the next deployment (2f37511d5c, 02:44Z) was built
 * after their first leg (MIA @ UTAH, 02:00Z) had started, so it no longer showed them. History is immutable: the lines are
 * pinned by sha256 of the exact JSONL line, never edited. Any OTHER post-decision NBA tiered entry still fails.
 */
const KNOWN_POST_DECISION_NBA_TIERED = Object.freeze([
  { recordedAt: "2026-11-11T01:15:39.214Z", policy: "nba-game-winner-tiers@1/parlay-lab", tier: "medium", lineSha256: "8ec9578deb473c85b70d5c7b606e86144dee24f45d3fdb6bf8100a5244612554" },
  { recordedAt: "2026-11-11T01:15:39.214Z", policy: "nba-game-winner-tiers@1/parlay-lab", tier: "high", lineSha256: "b6cfda867f2e24e8ab64922e819e905629bac3a5686db826dfb527f7d1b1dae1" },
  { recordedAt: "2026-11-11T01:15:39.214Z", policy: "nba-game-winner-tiers@1/bank-builder", tier: "medium", lineSha256: "b7c95f8fcd235b81e992956a4dcf6f8c108dffc5a80465eb454159d3a64c1248" },
]);

test("frozen history is byte-identical: recorded NBA game-winner cards stay in the record and re-grade exactly as committed", () => {
  const recordText = fs.readFileSync(LEVEL_A_RECORD_FILE, "utf8");
  const gradedText = fs.readFileSync(LEVEL_A_GRADES_FILE, "utf8");
  const record = recordText.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const gwPolicies = new Set(Object.values(NBA_GW_POLICIES).map(String));
  const lines = recordText.split("\n").filter(Boolean);
  const gwIdx = record.map((e, i) => [e, i]).filter(([e]) => gwPolicies.has(e.policy) || e.legs?.some((l) => l.sport === "nba") && e.tier !== "untiered");
  assert.ok(gwIdx.length > 0, "the record holds historical NBA tiered cards");
  const after = gwIdx.filter(([e]) => !(Date.parse(e.recordedAt) < Date.parse("2026-11-10T19:51:23Z")));
  const known = (e, i) => KNOWN_POST_DECISION_NBA_TIERED.some((k) => k.recordedAt === e.recordedAt && k.policy === e.policy && k.tier === e.tier
    && k.lineSha256 === createHash("sha256").update(lines[i]).digest("hex"));
  assert.deepEqual(after.filter(([e, i]) => !known(e, i)).map(([e]) => `${e.recordedAt} ${e.policy} ${e.tier}`), [], "every other NBA tiered entry predates the founder decision");
  assert.equal(after.length, KNOWN_POST_DECISION_NBA_TIERED.length, "each known exception is present, byte-identical");
  /* re-grading the whole committed record against the committed finals adds nothing that conflicts with what is graded */
  const withDay = record.map((e) => ({ ...e, legs: e.legs.map((l) => ({ ...l, productDay: e.productDay })) }));
  const { conflicts } = gradeRecord({ record: withDay, graded: gradedText.split("\n").filter(Boolean).map((l) => JSON.parse(l)), finals: committedFinals({ repoRoot: REPO, nowIso: NOW }), gradedAt: NOW });
  assert.deepEqual(conflicts, [], "a historical card would grade differently");
  /* this change never edits the record files: a new build only appends (record.mjs appendRecord) */
  assert.equal(fs.readFileSync(LEVEL_A_RECORD_FILE, "utf8"), recordText);
});
