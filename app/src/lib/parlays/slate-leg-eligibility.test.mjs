/**
 * Stop-condition regression (2026-10-06): before first pitch, every demoted MLB prop leg (Hits, Hits + Runs + RBIs,
 * Total Bases, Strikeouts) reached Build Your Own as "model-qualified" and /today's Parlay Center tile counted cards
 * built from them, because the live leg pool only checked that the event had not started. The pool now applies the
 * same F-1 card-leg rule /build already uses (card-leg-eligibility.mjs), and fails closed.
 *
 * Runs from app/ so the committed boards and the committed coverage registry resolve.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { loadTodaySlate } from "./ui-loader.ts";
import { withholdMarketContextLegs, loadCommittedCoverage, marketContextFamilies } from "./card-leg-eligibility.mjs";
import { ARCHIVE_MECHANICS_COVERAGE } from "./fixtures/archive-mechanics-coverage.mjs";

const APP = process.cwd();
const DEMOTED_LABELS = ["Hits", "Hits + Runs + RBIs", "Total Bases", "Strikeouts"];
// Oct 5 2026, 11:00 ET: the MLB board is published and no game has started — the dangerous window.
const DATE = "2026-10-05";
const PREGAME = "2026-10-05T15:00:00Z";

test("the committed registry still demotes the four MLB prop families this regression is about", () => {
  const fam = marketContextFamilies(loadCommittedCoverage(path.resolve(APP, "..")));
  for (const f of ["batter_hits", "batter_hits_runs_rbis", "batter_total_bases", "pitcher_strikeouts"]) {
    assert.ok(fam.has(`MLB:${f}`), `MLB:${f} is demoted to market context`);
  }
});

test("🔴 pregame, demoted MLB prop legs that otherwise look valid are NOT in the Build Your Own pool", () => {
  // Same slate, same pregame instant, with an empty registry: the legs exist, are pre-event and odds-backed. This
  // proves the committed run below removes them for their FAMILY, not because their event has started.
  const without = loadTodaySlate(DATE, PREGAME, undefined, ARCHIVE_MECHANICS_COVERAGE);
  const demotedThere = without.eligibleLegs.filter((l) => l.sport === "MLB" && DEMOTED_LABELS.includes(l.market));
  assert.ok(demotedThere.length > 0, "the archived Oct 5 board carries pregame demoted-family legs");
  for (const l of demotedThere) assert.ok(Date.parse(l.startTime) > Date.parse(PREGAME), `${l.legId} is pregame`);

  const v = loadTodaySlate(DATE, PREGAME);
  const leaked = v.eligibleLegs.filter((l) => l.sport === "MLB" && DEMOTED_LABELS.includes(l.market));
  assert.deepEqual(leaked.map((l) => l.legId), [], "no demoted-family leg is selectable in Build Your Own");
});

test("🔴 pregame, /today's Parlay Center counts no card built from a demoted family", () => {
  // /today's tile value is `loadTodaySlate().allSuggested.length` ("N suggested cards").
  const without = loadTodaySlate(DATE, PREGAME, undefined, ARCHIVE_MECHANICS_COVERAGE);
  assert.ok(without.allSuggested.length > 0, "without the rule the same slate produced model cards");
  const v = loadTodaySlate(DATE, PREGAME);
  for (const c of v.allSuggested) {
    for (const l of c.legs) assert.ok(!(l.sport === "MLB" && DEMOTED_LABELS.includes(l.market)), `${c.parlayId} carries ${l.market}`);
  }
  const mlb = v.sports.find((s) => s.sport === "MLB");
  assert.equal(mlb?.eligibleCount ?? 0, 0, "every MLB leg on this board is a demoted family");
});

test("both surfaces read this one pool — no second eligibility path", () => {
  const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
  assert.match(read("src/app/build/custom/page.tsx"), /buildEngineLegAtoms\(engineSlateForLegs\.eligibleLegs/);
  assert.match(read("src/app/today/page.tsx"), /const engineSuggested = engineSlate\.allSuggested\.length/);
  assert.match(read("src/lib/parlays/ui-loader.ts"), /withholdMarketContextLegs\(/);
});

test("the tests-only coverage override is never passed by a page or producer", () => {
  const hits = execSync(`grep -rn "loadTodaySlate(" src --include=*.ts --include=*.tsx --include=*.mjs`, { cwd: APP, encoding: "utf8" })
    .split("\n").filter((l) => l && !/\.test\.mjs:/.test(l) && !/export function loadTodaySlate/.test(l) && /ARCHIVE_MECHANICS_COVERAGE|coverageOverride|loadTodaySlate\([^)]*,[^)]*,[^)]*,/.test(l));
  assert.deepEqual(hits, []);
});

// ── The pure rule ──────────────────────────────────────────────────────────────────────────────────
const coverage = { markets: [{ sport: "mlb", demotedFamilies: ["batter_hits"] }, { sport: "mlb", demotedFamilies: [] }] };
const future = "2099-01-01T00:00:00Z";
const leg = (o) => ({ sport: "MLB", marketType: "Hits", startTime: future, ...o });
const labels = new Map([["MLB|Hits", new Set(["batter_hits"])], ["MLB|Home Runs", new Set(["batter_home_runs"])], ["MLB|Twin", new Set(["a", "b"])]]);

test("a product-eligible MLB family is kept; a demoted one is withheld however far off its start is", () => {
  const { kept, withheldCount } = withholdMarketContextLegs([
    leg({ legId: "hits" }),
    leg({ legId: "hr", marketType: "Home Runs" }),
    leg({ legId: "ml", marketType: "Moneyline", marketKey: "moneyline" }),
  ], coverage, labels);
  assert.deepEqual(kept.map((l) => l.legId), ["hr", "ml"]);
  assert.equal(withheldCount, 1);
});

test("legs of sports with no demoted family pass unchanged", () => {
  const wc = [{ legId: "w1", sport: "WORLD_CUP", marketType: "btts" }, { legId: "n1", sport: "NFL", marketType: "anything" }];
  assert.deepEqual(withholdMarketContextLegs(wc, coverage, labels).kept, wc);
});

test("fails closed: no registry keeps nothing; an unknown or ambiguous MLB family is withheld", () => {
  assert.deepEqual(withholdMarketContextLegs([leg({ legId: "x", marketType: "Home Runs" })], null, labels).kept, []);
  assert.deepEqual(withholdMarketContextLegs([leg({ legId: "u", marketType: "Unknown Prop" })], coverage, labels).kept, []);
  assert.deepEqual(withholdMarketContextLegs([leg({ legId: "t", marketType: "Twin" })], coverage, labels).kept, []);
});
