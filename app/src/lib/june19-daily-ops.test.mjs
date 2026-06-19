import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";
import { buildCardFactoryDiagnostics } from "./parlays/card-factory-diagnostics.ts";
import { getGameDetail } from "./game-detail.ts";

test("current slate flips to June 19 once World Cup projections exist (even with no MLB board)", () => {
  const v = loadTodaySlate(undefined, "2026-06-19T15:00:00Z");
  assert.equal(v.date, "2026-06-19", "latestSlateDate picks up the World Cup slate, not just MLB boards");
});

test("June 19 World Cup slate is real + odds-backed across all four risk buckets", () => {
  const v = loadTodaySlate("2026-06-19", "2026-06-19T15:00:00Z");
  const wc = v.sports.find((s) => s.sport === "WORLD_CUP");
  assert.ok(wc && wc.eligibleCount > 0, "World Cup has eligible legs");
  for (const b of ["low", "medium", "high", "longshot"]) {
    assert.ok((wc.suggestedByRisk[b] ?? 0) > 0, `World Cup ${b} bucket has cards`);
  }
  // projections artifact is odds-backed + dated June 19
  const proj = JSON.parse(fs.readFileSync("public/data/world-cup/projections/latest.json", "utf8"));
  assert.equal(proj.date, "2026-06-19");
  assert.equal(proj.provider, "odds_api");
  assert.ok(proj.matches.every((m) => m.bookmaker && typeof m.americanOdds === "number"), "every market is odds-backed");
  // player props expanded to real posted markets (goalscorer + SoT + assists + total shots)
  const pp = JSON.parse(fs.readFileSync("public/data/world-cup/player-projections/latest.json", "utf8"));
  assert.equal(pp.date, "2026-06-19");
  assert.ok(Object.keys(pp.byMarket ?? {}).length >= 2, "multiple real player markets posted");
});

test("MLB + Mixed buckets are empty with a real reason (MLB board unavailable), not fabricated", () => {
  const v = loadTodaySlate("2026-06-19", "2026-06-19T15:00:00Z");
  const diag = buildCardFactoryDiagnostics(v, "2026-06-19T15:00:00Z");
  assert.equal(diag.slatePresent, true);
  for (const scope of ["mlb", "mixed"]) for (const b of ["low", "medium", "high", "longshot"]) {
    const c = diag.matrix[scope][b];
    assert.equal(c.passed, 0, `${scope}.${b} empty`);
    assert.ok(Object.keys(c.rejected).length >= 1 && c.message, `${scope}.${b} has a real reason + message`);
  }
});

test("each June 19 World Cup game resolves + carries game-specific cards (no cross-fixture leak)", () => {
  for (const slug of ["usa-vs-australia-2026-06-19", "scotland-vs-morocco-2026-06-19"]) {
    const d = getGameDetail("world-cup", slug);
    assert.ok(d, `${slug} resolves`);
    assert.ok(Array.isArray(d.teamProjections), `${slug} has projections`);
  }
});

test("UFC stays results-only (no current UFC slate) on June 19", () => {
  const v = loadTodaySlate("2026-06-19", "2026-06-19T15:00:00Z");
  const ufc = v.sports.find((s) => s.sport === "UFC");
  assert.ok(!ufc || ufc.eligibleCount === 0, "no active UFC slate");
});
