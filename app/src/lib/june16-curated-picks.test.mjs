/**
 * Curated-picks revamp contract: World Cup shows MODEL-RANKED picks grouped by game (not a raw
 * prop dump), with portraits/flags; the Bank Builder meter shows the $100→$10K path + run timeline;
 * player props are never Bank Builder eligible. Source + data checks (suite runs pre-build).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

test("World Cup Player Picks tab leads with the model matrix, then curated, raw inventory last", () => {
  const page = read("src/app/world-cup/page.tsx");
  assert.ok(page.includes("ModelPlayerPropsMatrix"), "renders the model-only props matrix");
  assert.ok(page.includes("WorldCupCuratedPicks"), "renders the curated component");
  assert.ok(page.includes("loadWorldCupCuratedGames"), "loads curated games");
  const matrix = page.indexOf("<ModelPlayerPropsMatrix");
  const curated = page.indexOf("<WorldCupCuratedPicks");
  const inventory = page.indexOf("Available sportsbook markets — not model recommendations");
  assert.ok(matrix > 0 && curated > 0 && inventory > 0, "matrix, curated, and inventory all present");
  assert.ok(matrix < curated, "model matrix renders before curated picks");
  assert.ok(curated < inventory, "curated picks render before the raw market inventory");
  assert.ok(page.includes('label: "Player Picks"'), "tab named Player Picks");
});

test("curated layer groups by game with top team + player picks and eligibility", () => {
  const lib = read("src/lib/curated-picks.ts");
  assert.ok(/topTeamPicks/.test(lib) && /topPlayerPicks/.test(lib), "grouped picks per game");
  assert.ok(/eligibility/.test(lib) && /bankBuilder/.test(lib), "eligibility flags");
  // player props are never Bank Builder eligible
  assert.ok(/bankBuilder:\s*false.*limited-data|limited-data player props are never/.test(lib),
    "player props not Bank Builder eligible");
  assert.ok(/curatedScore/.test(lib), "picks are model-ranked");
});

test("curated component renders portraits + flags for every entity", () => {
  const c = read("src/components/world-cup/curated-picks.tsx");
  assert.ok(c.includes("PlayerAvatar"), "player portraits");
  assert.ok(c.includes("FlagBadge"), "team flags");
  assert.ok(c.includes("View full game"), "per-game CTA");
});

test("Bank Builder meter shows the $100→$10K path + three-run timeline", () => {
  const m = read("src/components/bank-builder/bank-builder-meter.tsx");
  for (const rung of ["$100", "$200", "$500", "$1.4K", "$3.5K", "$10K"]) {
    assert.ok(m.includes(rung), `rung ${rung}`);
  }
  assert.ok(/Run #1/.test(m) && /Run #2/.test(m) && /Run #3/.test(m), "three runs");
  assert.ok(/reduced-motion safe|gtp-heat-pulse/.test(m), "animated but reduced-motion safe");
});

test("V2 evaluation reflects the relaxed launch rules (>=1 WC leg/lane, survival-first)", () => {
  const py = read("../pipeline/daily/bank_builder_v2_eligibility.py");
  assert.ok(/REQUIRE_WORLD_CUP_LEG_PER_LANE/.test(py), "requires a World Cup leg per lane");
  assert.ok(/LANE_DECIMAL_LO,\s*LANE_DECIMAL_HI\s*=\s*1\.12/.test(py), "survival-first return floor");
  const evalDoc = JSON.parse(read("public/data/bank-builder/v2-evaluation-latest.json"));
  assert.ok(["launch", "evaluating"].includes(evalDoc.decision));
  // when launched, the lanes exist; when evaluating, no Run #3 overwrote the closed Run #2
  if (evalDoc.decision !== "launch") {
    const dual = JSON.parse(read("public/data/bank-builder/dual-lanes-latest.json"));
    assert.ok(dual.runNumber === 2 || dual.status === "settled" || dual.status === "closed",
      "no Run #3 written on a no-launch");
  }
});
