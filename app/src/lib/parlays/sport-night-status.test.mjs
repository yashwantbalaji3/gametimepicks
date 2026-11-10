/**
 * UX-06/07: the Parlay Center on a night MLB is over. The MLB off-season reason is MLB's alone; NBA and NFL state their own
 * night in the Level A registry's words; no tier copy claims the whole site has no games; no pick vocabulary.
 *   npx tsx --test src/lib/parlays/sport-night-status.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sportNightStatus, OFF_SEASON_TIER_REASON, NBA_VISITOR_CLAUSE, NFL_CLOSED_TEXT } from "./sport-night-status.ts";
import { MODEL_SUGGESTION_CAPABILITIES } from "../sport-capability-registry.ts";

const MLB_OVER = "The MLB season is over — the 2026 World Series ended on 2026-10-31. Cards return when games do.";
const reg = (k) => MODEL_SUGGESTION_CAPABILITIES.find((c) => c.key === k);
const PAGE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../app/build/page.tsx"), "utf8");

test("(1) an NBA-only night: the MLB season text appears only in the MLB line; the tier reason is sport-neutral", () => {
  const lines = sportNightStatus({ mlbOffSeasonReason: MLB_OVER, nbaGames: 6, nflGames: 0 });
  const nonMlb = lines.filter((l) => l.sport !== "mlb").map((l) => l.text).join(" ");
  assert.equal(lines.find((l) => l.sport === "mlb").text, MLB_OVER);
  assert.ok(!/MLB season is over/i.test(nonMlb));
  assert.ok(!/MLB|season is over/i.test(OFF_SEASON_TIER_REASON));
  assert.equal(lines.find((l) => l.sport === "nba").state, "SLATE");
  assert.equal(lines.find((l) => l.sport === "nfl").text, "No games on tonight’s slate.");
  /* the page passes the neutral reason to every tier and to the no-card state, never the MLB reason */
  assert.ok(PAGE.includes("reason: OFF_SEASON_TIER_REASON"));
  assert.ok(!/reason: offSeasonReason\b/.test(PAGE) && !/reason=\{offSeasonReason \?\?/.test(PAGE));
});

test("(2) each sport's copy matches its Level A registry state and reason", () => {
  const [, nba, nfl] = sportNightStatus({ mlbOffSeasonReason: MLB_OVER, nbaGames: 1, nflGames: 2 });
  assert.equal(nba.suggestions, reg("nba").state);
  assert.equal(nba.text, `1 game tonight. The official Elo sides are on the NBA page. ${NBA_VISITOR_CLAUSE}`);
  assert.ok(reg("nba").reason.includes(NBA_VISITOR_CLAUSE), "the NBA clause is the registry's own words");
  assert.equal(nfl.suggestions, reg("nfl").state);
  assert.equal(reg("nfl").state, "CLOSED");
  assert.equal(nfl.text, `2 games tonight. ${NFL_CLOSED_TEXT}`);
  assert.ok(reg("nfl").reason.startsWith("No reader for the NFL official game forecast has been reviewed"), "the NFL text restates the registry's CLOSED reason");
  /* visitor copy never names a model version or an internal axis */
  for (const l of [nba, nfl]) assert.ok(!/v\d+\.\d|Level [AB]\b/.test(l.text), l.text);
  /* nothing here opens a sport: NBA untiered, NFL closed, exactly as recorded */
  assert.equal(reg("nba").probabilityPublished, false);
});

test("(3) vocabulary: no recommendation, edge, lock or confidence words in any line or the tier reason", () => {
  const all = [OFF_SEASON_TIER_REASON, ...sportNightStatus({ mlbOffSeasonReason: MLB_OVER, nbaGames: 6, nflGames: 14 }).map((l) => l.text)].join(" ");
  for (const w of [/\brecommend/i, /\bedge\b/i, /\blocks?\b/i, /\bconfiden(t|ce)\b/i, /\bguarantee/i, /\bsure thing\b/i, /\bbest bet\b/i])
    assert.ok(!w.test(all.replace(/not a betting recommendation/gi, "")), `forbidden word ${w}`);
});
