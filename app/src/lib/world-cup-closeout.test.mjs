/**
 * WORLD CUP CLOSEOUT (2026-07-21). The 2026 FIFA World Cup is complete. It is NOT an active nav destination,
 * NOT an active sport in the coverage directory, NOT a live product surface, and NO active paper-product leg
 * may use a World Cup market. It may remain reachable only as an archive (from results / methodology). These
 * checks pin the closeout so a future refresh can't silently re-surface it as active. Money is untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const readJson = (rel) => { try { return JSON.parse(read(rel)); } catch { return null; } };

test("World Cup is NOT in the active navigation (primary nav + desktop rail)", () => {
  for (const f of ["src/components/nav.tsx", "src/components/command-rail.tsx"]) {
    const s = read(f);
    assert.ok(!/href: "\/world-cup"/.test(s), `${f}: no active /world-cup nav item`);
    assert.ok(!/href: "\/world-cup-specials"/.test(s), `${f}: no active /world-cup-specials nav item`);
  }
});

test("World Cup is NOT an active sport in the coverage directory", () => {
  const cov = read("src/lib/sports-coverage.ts");
  assert.ok(!/key: "fifa-world-cup"/.test(cov), "fifa-world-cup is removed from the active sports coverage");
});

test("World Cup is NOT a current schedule-only tab in the events hub (completed → delisted)", () => {
  const sched = read("src/lib/event-schedules.ts");
  const order = sched.match(/EVENT_LEAGUE_ORDER:\s*LeagueKey\[\]\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(order, "EVENT_LEAGUE_ORDER is defined");
  assert.ok(!/"fifa-world-cup"/.test(order[1]), "fifa-world-cup is delisted from the events hub order");
});

test("World Cup is NOT a current filter chip on /simulate or /picks (archived → gated on eligible cards)", () => {
  // /simulate all-games board: the CHIPS array has no world_cup.
  const games = read("src/components/games-experience.tsx");
  assert.match(games, /const CHIPS = \[[^\]]*\]/, "CHIPS is defined");
  assert.ok(!/const CHIPS = \[[^\]]*"world_cup"[^\]]*\]/.test(games), "games-experience CHIPS has no world_cup");
  // /picks parlay selector: WC tab is gated out when it has no eligible cards.
  const parlays = read("src/components/parlays/parlays-explorer.tsx");
  assert.match(parlays, /filter\(\(s\) => s\.sport !== "WORLD_CUP" \|\| s\.eligibleCount > 0\)/, "parlays-explorer gates archived WC out of the sport selector");
});

test("World-Cup-only products are RETIRED in the registry (ids retained for history)", () => {
  const reg = read("src/lib/products/registry.ts");
  assert.match(reg, /id: "wc-specials"[\s\S]*?status: "retired"/, "WC Specials is retired");
  // Moonshot is no longer described as a World Cup product — it runs current MLB legs.
  assert.ok(!/id: "moonshot"[\s\S]{0,160}?World Cup/.test(reg), "Moonshot is not described as a World Cup product");
});

test("NO active paper-product leg uses a World Cup market (Bank Builder + Moonshot)", () => {
  const WC = /world[_ -]?cup|goal[_ ]?scorer|goalscorer|\bshots\b|\bassists\b|anytime/i;
  const bb = readJson("public/data/methodology/launch/dual-bank-builder-active.json");
  for (const laneKey of ["laneA", "laneB"]) {
    const lane = bb?.run?.[laneKey];
    const step = Array.isArray(lane?.steps) ? lane.steps.find((s) => s?.status === "active" && Array.isArray(s?.legs) && s.legs.length) : null;
    for (const l of step?.legs ?? []) {
      assert.equal(String(l.sport ?? "").toLowerCase() === "mlb", true, `${laneKey} active leg is MLB (got ${l.sport})`);
      assert.ok(!WC.test(`${l.marketType} ${l.label} ${l.matchup}`), `${laneKey} active leg is not a WC market: ${l.label}`);
    }
  }
  const ms = readJson("public/data/moonshot-lane/active.json");
  const card = ms?.ladder?.[0]?.card;
  for (const l of card?.legs ?? []) {
    assert.equal(String(l.sport ?? "").toLowerCase() === "mlb", true, `Moonshot active leg is MLB (got ${l.sport})`);
    assert.ok(!WC.test(`${l.market} ${l.participant} ${l.fixture}`), `Moonshot active leg is not a WC market: ${l.participant}`);
  }
});

test("money untouched (closeout is display/product-nav only)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
