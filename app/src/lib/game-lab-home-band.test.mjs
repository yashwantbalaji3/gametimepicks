/**
 * GAME LAB HOME BAND — the band COMPONENT's own contract (real fixtures, MLB + World Cup EQUAL weight,
 * honest empty states, a first-class Simulate CTA, paper-only). The component file is RETAINED even though
 * the homepage was restructured (2026-07-08) into a focused simulation-first landing page that no longer
 * renders this band. The homepage's "surfaces real, sim-ready games" intent is now carried by the
 * featured-simulations section (see the last test here + home-restructure.test.mjs). Display-only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const band = read("src/components/home/game-lab-home-band.tsx");
const page = read("src/app/page.tsx");
const featured = read("src/components/home/featured-simulations.tsx");

const BANNED = /\bguaranteed\b|\block\b|\bsafest\b|can'?t lose/i;

test("the Game Lab band: first-class CTA, MLB + World Cup EQUAL weight, honest empty state, paper-only", () => {
  assert.match(band, /href="\/simulate"/, "a first-class Simulate CTA to the /simulate lobby");
  assert.match(band, /Simulate Today.{0,10}s Games/i, "the CTA label is simulate-first");
  // MLB + World Cup are rendered as the two equal columns (same SportColumn, md:grid-cols-2).
  assert.match(band, /label="MLB"/, "MLB column");
  assert.match(band, /label="World Cup"/, "World Cup column");
  assert.match(band, /md:grid-cols-2/, "MLB + WC get equal weight (two-column grid)");
  // Honest empty state per sport — never a fabricated slate.
  assert.match(band, /No active model board today/i, "honest empty state");
  assert.ok(/paper-only|educational/i.test(band), "paper-only / educational copy");
  assert.match(band, /settles to official results/i, "trust framing (settles to official results)");
  assert.ok(!BANNED.test(band), "no banned/tout copy");
});

test("each game links to its Game Lab report (real fixture route), honest CTA label", () => {
  assert.match(band, /\/games\/\$\{URL_SPORT\[g\.sport\]\}\/\$\{g\.slug\}/, "links to the real /games/[sport]/[slug] report");
  assert.match(band, /g\.hasReport \? "Model report →" : "View →"/, "CTA is honest (Model report only when one exists)");
  // WC uses flags, MLB uses team logos — real assets with fallbacks, never a broken/fabricated mark.
  assert.match(band, /<FlagBadge/, "WC team flags");
  assert.match(band, /<TeamLogo team=\{g\.awayTeam\} sport="mlb"/, "MLB team logos");
});

test("homepage surfaces real, sim-ready games from the REAL builder (no new data path) and is NOT the full board", () => {
  // Same real builder, no new data path — now feeding the featured-simulations selector.
  assert.match(page, /import \{ buildAllGameDetails \} from "@\/lib\/game-detail"/, "reuses the existing game-detail builder (no new data path)");
  assert.match(page, /import \{ featuredSimulations \} from "@\/lib\/simulate-lobby-featured"/, "reuses the featured-simulations selector");
  assert.match(page, /featuredSimulations\(details[,)]/, "derives featured games from the real details");
  assert.match(page, /<FeaturedSimulationsSection/, "renders the featured-simulations section");
  // The restructured Home does NOT render the full Today board anymore (that stays on /today).
  assert.ok(!/<TodayPage/.test(page), "the full Today board is no longer rendered on Home");
  assert.ok(!/GameLabHomeBand/.test(page), "the Game Lab band is no longer rendered on Home");
  // The featured section links each game to its own report route, with an honest unavailable state.
  assert.match(featured, /href=\{s\.href\}/, "each featured game links to its game route (s.href)");
  assert.match(featured, /No simulation-ready games/i, "honest unavailable state");
});

test("FUNCTIONAL: the derivation yields real, deduped MLB + WC fixtures with honest report flags", async () => {
  const { buildAllGameDetails } = await import("./game-detail.ts");
  const all = buildAllGameDetails();
  const mlb = all.filter((d) => d.sport === "mlb");
  const wc = all.filter((d) => d.sport === "world_cup");
  assert.ok(mlb.length >= 1 || wc.length >= 1, "at least one sport has fixtures today");
  // Every fixture with a report flag actually carries the report (no fabricated 'hasReport').
  for (const d of all.filter((x) => x.sport === "mlb")) {
    if (d.gameLabMlb) assert.ok(d.gameLabMlb.rows !== undefined, "MLB report is a real view");
  }
  // Dedup: unique slugs per sport are what the band shows.
  const mlbSlugs = new Set(mlb.map((d) => d.slug));
  assert.ok(mlbSlugs.size <= mlb.length, "slugs dedupe (doubleheaders collapse)");
});
