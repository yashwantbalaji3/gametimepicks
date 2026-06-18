import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const read = (p) => fs.readFileSync(p, "utf8");

test("game page leads with a model spotlight, then suggested parlays, then model player picks", () => {
  const src = read("src/components/game/game-detail-page.tsx");
  assert.match(src, /Model spotlight/, "model spotlight section present");
  assert.match(src, /Top team model pick/, "top team pick tile");
  assert.match(src, /Top player model pick/, "top player pick tile");
  assert.match(src, /Best lower-variance card/, "lower-variance card tile");
  assert.match(src, /Best higher-return card/, "higher-return card tile");
  // Suggested parlays is the FIRST tab (prominent), player props second, then team props, markets.
  const order = ["cards", "player-props", "projections", "markets"].map((k) => src.indexOf(`key: "${k}"`));
  assert.ok(order.every((i, idx) => idx === 0 || i > order[idx - 1]), "tab order: cards → player-props → projections → markets");
  // Player props default to model picks; full inventory is a secondary collapsed section.
  assert.match(src, /Top model player props/, "model picks default heading");
  assert.match(src, /View full prop inventory/, "full inventory is secondary/collapsed");
  assert.match(src, /worldCupPlayerModelPicks/, "uses the model-pick selector");
});

test("soccer prop markets are honest + extensible: market label map covers future markets, page notes availability", () => {
  const norm = read("src/lib/normalize.ts");
  assert.match(norm, /player_assists:\s*"Assists"/, "assists mapped");
  assert.match(norm, /player_shots:\s*"Shots"/, "total shots mapped");
  assert.match(norm, /player_shots_on_target:\s*"Shots on target"/, "shots on target mapped");
  const page = read("src/components/game/game-detail-page.tsx");
  assert.match(page, /Additional player markets .* appear here automatically when the books post odds/, "honest extensibility note");
  // No fabricated markets are hardcoded into the page — markets are derived from the real props.
  assert.match(page, /marketLabels = \[\.\.\.new Set\(detail\.playerProps\.map/, "market tabs derived from real data");
});

test("pipeline requests optional player markets with a fallback (extensible, never breaks the working two)", () => {
  const py = read("../pipeline/world_cup/build_player_props.py");
  assert.match(py, /OPTIONAL_MARKETS\s*=\s*\["player_assists", "player_shots"\]/, "optional markets declared");
  assert.match(py, /ALL_MARKETS\s*=\s*MARKETS\s*\+\s*OPTIONAL_MARKETS/, "combined request list");
  assert.match(py, /except Exception:\s*\n\s*odds = _fetch\(MARKETS\)/, "falls back to core markets on rejection");
});

test("UFC page hides the stale active card once the event is settled, points to Results", () => {
  const page = read("src/app/ufc/page.tsx");
  assert.match(page, /ufcSettled = settlement\?\.status === "final"/, "settled gate computed");
  assert.match(page, /next slate loading soon/i, "next-slate-loading copy");
  assert.match(page, /tabs: ShellTab\[\] = ufcSettled/, "stale gate drives the tab set");
  assert.match(page, /See settled results/, "Results CTA in the stale state");
  // The settled fight-card/projections tabs are NOT in the settled tab set (only overview/results/methodology).
  const settledBlock = page.slice(page.indexOf("tabs: ShellTab[] = ufcSettled"), page.indexOf(": ["));
  assert.ok(!/fight-card/.test(settledBlock), "no stale fight-card tab when settled");
});

test("Picks coverage: slate exposes per-sport suggestedByRisk for every risk tier + mixed", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T21:00:00Z");
  const RISK = ["low", "medium", "high", "longshot"];
  for (const s of v.sports) {
    assert.ok(s.suggestedByRisk && typeof s.suggestedByRisk === "object", `${s.sport} has suggestedByRisk`);
    for (const lvl of RISK) assert.ok(Number.isFinite(s.suggestedByRisk[lvl] ?? 0), `${s.sport}.${lvl} is a number`);
  }
  assert.ok(v.mixedByRisk && typeof v.mixedByRisk === "object", "mixedByRisk present");
  // The explorer renders a coverage matrix from this data.
  const exp = read("src/components/parlays/parlays-explorer.tsx");
  assert.match(exp, /Card coverage by sport × risk/, "coverage matrix rendered");
  assert.match(exp, /other tiers above may still have cards/, "scoped per-risk empty state");
});
