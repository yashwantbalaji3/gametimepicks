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
  assert.match(src, /Model picks by market/, "model picks default heading (per-market layout)");
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

test("UFC: a settled event is never an active surface — /ufc is the settled archive, cards gated off /picks", () => {
  // 2026-07-30 cleanup: the hub this test pinned (stale-gate tab wiring) is retired. The guarantee —
  // a settled card stops presenting as active and the user lands on results — survives structurally:
  // /ufc IS the settled record now, and /picks gates settled UFC cards out of the live slate
  // (also pinned in ufc250-settlement.test.mjs; archive shape pinned in ufc-archive.test.mjs).
  const page = read("src/app/ufc/page.tsx");
  assert.match(page, /settlement\.status === "final" \? settlement : null/, "record renders only from the OFFICIAL final settlement");
  assert.doesNotMatch(page, /ShellTab|next slate loading soon/, "no active-card tab chrome or next-slate framing remains");
  // The exclusion moved with the card composition into lib/picks/suggested-cards.ts (Program 142
  // step 3C) so Build reuses it rather than cloning it. The rule is identical; only its owner moved,
  // and it now protects EVERY surface that shows suggested cards instead of just /picks.
  const loader = read("src/lib/picks/suggested-cards.ts");
  assert.match(loader, /ufcSettled\(\) \? null/, "settled UFC cards stay excluded from every live suggested-card slate");
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
  assert.match(exp, /Suggested parlay coverage/, "coverage matrix rendered");
  assert.match(exp, /Why are some buckets empty/, "diagnostics drawer for empty buckets");
  assert.match(exp, /emptyReason\(lvl\)/, "scoped per-risk empty state uses the real diagnostic reason");
});
