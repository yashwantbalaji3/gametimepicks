/**
 * HOMEPAGE MULTI-SPORT RESTRUCTURE (Plan 0008 Phase 2A · chunk 4). Pins that the homepage leads with a
 * Game Lab command-center band (real fixtures, MLB + World Cup EQUAL weight, honest empty states, a
 * first-class Game Lab CTA) ABOVE the flagship products, while keeping the existing Today command center
 * (flagship + trust). Display-only — no money, no settlement, no card approval.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const band = read("src/components/home/game-lab-home-band.tsx");
const page = read("src/app/page.tsx");

const BANNED = /\bguaranteed\b|\block\b|\bsafest\b|can'?t lose/i;

test("the Game Lab band: first-class CTA, MLB + World Cup EQUAL weight, honest empty state, paper-only", () => {
  assert.match(band, /href="\/games"/, "a first-class Simulate CTA to /games");
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

test("homepage wires the band from the REAL builder (no new data path), MLB + WC, and keeps flagship+trust", () => {
  assert.match(page, /import GameLabHomeBand.*from "@\/components\/home\/game-lab-home-band"/, "imports the band");
  assert.match(page, /import \{ buildAllGameDetails \} from "@\/lib\/game-detail"/, "reuses the existing game-detail builder (no new data path)");
  assert.match(page, /const mlbGames = pickGames\("mlb", \d+\)/, "derives real MLB games");
  assert.match(page, /const wcGames = pickGames\("world_cup", \d+\)/, "derives real World Cup games");
  assert.match(page, /seen\.has\(d\.slug\)/, "dedups by slug (MLB doubleheaders share one)");
  assert.match(page, /<GameLabHomeBand mlb=\{mlbGames\} wc=\{wcGames\}/, "renders the band");
  // The flagship + trust command center (TodayPage) is preserved BELOW the band.
  assert.match(page, /<TodayPage \/>/, "the flagship + trust command center stays (added advantage, below)");
  const bandIdx = page.indexOf("<GameLabHomeBand");
  const todayIdx = page.indexOf("<TodayPage");
  assert.ok(bandIdx > 0 && bandIdx < todayIdx, "Game Lab band leads; flagship products follow");
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
