/**
 * P184 · The NFL player board must SAY something.
 *
 * It previously applied one fixed line ladder to every player on the field, so a fourth receiver
 * projecting 0.1 carries was measured against the starting back's 7.5-carry line. Every row cleared
 * or missed by a mile and the whole board rendered 100%. A board where every row agrees carries no
 * information, and it looked authoritative while doing it — the worst combination.
 *
 * These guard the property, not the implementation: lines sit where the outcome is uncertain.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ART = path.join(process.cwd(), "public/data/nfl/game-simulations/latest.json");
const artifact = fs.existsSync(ART) ? JSON.parse(fs.readFileSync(ART, "utf8")) : null;
const games = artifact?.games ?? [];

test("the artifact exists and carries player picks", () => {
  assert.ok(games.length > 0, "no NFL simulation artifact — nothing to guard");
  assert.ok(games.every((g) => (g.generatedPicks ?? []).length > 0), "every simulated game must carry picks");
});

test("NO WALL OF CERTAINTY · almost nothing may sit at the extremes", () => {
  for (const g of games) {
    const probs = (g.generatedPicks ?? []).map((p) => p.modelProbability).filter((v) => typeof v === "number");
    if (!probs.length) continue;
    const pinned = probs.filter((v) => v >= 0.98 || v <= 0.02).length;
    const share = pinned / probs.length;
    assert.ok(share <= 0.05,
      `${g.slug}: ${Math.round(share * 100)}% of rows sit at ≥98% or ≤2% — a board that certain is a line-placement bug, not a finding`);
  }
});

test("lines are placed near each player's OWN projection, not on a shared ladder", () => {
  for (const g of games) {
    for (const p of g.generatedPicks ?? []) {
      if (p.market === "anytimeTd" || typeof p.projection !== "number" || typeof p.line !== "number") continue;
      // A line more than 4x (or less than 1/4) the player's own projection is the old ladder bug.
      if (p.projection >= 1) {
        const ratio = p.line / p.projection;
        assert.ok(ratio >= 0.2 && ratio <= 5,
          `${g.slug} ${p.player} ${p.market}: line ${p.line} against projection ${p.projection} — not derived from this player`);
      }
    }
  }
});

test("a real share of the board lands in the INFORMATIVE band", () => {
  const all = games.flatMap((g) => (g.generatedPicks ?? []).map((p) => p.modelProbability)).filter((v) => typeof v === "number");
  assert.ok(all.length > 0);
  const informative = all.filter((v) => v >= 0.55 && v <= 0.9).length;
  assert.ok(informative / all.length >= 0.35,
    `only ${Math.round((informative / all.length) * 100)}% of rows are in the 55–90% band — the board is not telling a reader anything`);
});

test("the same player+market does not repeat a line", () => {
  for (const g of games) {
    const seen = new Set();
    for (const p of g.generatedPicks ?? []) {
      const k = `${p.player}|${p.market}|${p.line}`;
      assert.ok(!seen.has(k), `${g.slug}: duplicate line ${k}`);
      seen.add(k);
    }
  }
});
