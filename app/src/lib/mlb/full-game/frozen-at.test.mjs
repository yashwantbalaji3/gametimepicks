/**
 * GTP-23 — a displayed "forecast frozen at" instant is never later than the game's first pitch.
 *
 * CLE @ TB, 2026-10-13: first pitch 00:00Z, the game's forecast carried unchanged (hash 1e1b937d…),
 * the slate's `generatedAt` rewritten by lineup refreshes to 02:06Z — and the live panel read
 * "Forecast frozen at 10:06 PM ET". The producer's per-game ledger said 23:47Z all along.
 *
 * Run: cd app && npx tsx --test src/lib/mlb/full-game/frozen-at.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { forecastFrozenAt } from "./sim-provenance.ts";
import { loadFullGameArtifact } from "./read.ts";

const ROOT = path.join(process.cwd(), "public", "data");
const DIR = path.join(ROOT, "mlb", "full-game-simulations");

const game = (o = {}) => ({
  gamePk: 1, firstPitch: "2026-10-14T00:00:00Z", artifactHash: "h1",
  completeness: { startedBeforeGeneration: false }, ...o,
});
const meta = (o = {}) => ({ date: "2026-10-13", modelVersion: null, simulationVersion: null, runCount: null, generatedAt: "2026-10-14T02:06:58Z", frozenPregame: null, ...o });

test("the hash-bound ledger entry wins over a later slate clock", () => {
  const m = meta({ frozenPregame: { 1: { forecastGeneratedAt: "2026-10-13T23:47:13Z", artifactHash: "h1" } } });
  assert.equal(forecastFrozenAt(game(), m), "2026-10-13T23:47:13Z");
});

test("a ledger entry for DIFFERENT bytes, or one after first pitch, vouches for nothing", () => {
  assert.equal(forecastFrozenAt(game(), meta({ frozenPregame: { 1: { forecastGeneratedAt: "2026-10-13T23:47:13Z", artifactHash: "other" } } })), null);
  assert.equal(forecastFrozenAt(game(), meta({ frozenPregame: { 1: { forecastGeneratedAt: "2026-10-14T00:30:00Z", artifactHash: "h1" } } })), null);
});

test("an uncarried pregame game uses the slate clock; a post-pitch clock is never offered", () => {
  assert.equal(forecastFrozenAt(game(), meta({ generatedAt: "2026-10-13T22:00:00Z" })), "2026-10-13T22:00:00Z");
  assert.equal(forecastFrozenAt(game(), meta()), null, "carried without a ledger entry: no time, not 10:06 PM");
  assert.equal(forecastFrozenAt(game({ completeness: { startedBeforeGeneration: true } }), meta({ generatedAt: "2026-10-13T22:00:00Z" })), null);
  assert.equal(forecastFrozenAt(null, meta()), null);
});

test("EVERY committed MLB slate: no game resolves to a freeze instant after its first pitch", () => {
  let checked = 0, resolved = 0;
  for (const f of fs.readdirSync(DIR).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    const a = loadFullGameArtifact(ROOT, f.slice(0, 10));
    if (!a) continue;
    for (const g of a.byGamePk.values()) {
      checked++;
      const at = forecastFrozenAt(g, a.meta);
      if (!at) continue;
      resolved++;
      if (g.firstPitch) assert.ok(Date.parse(at) <= Date.parse(g.firstPitch), `${f} ${g.gamePk}: frozen ${at} after first pitch ${g.firstPitch}`);
    }
  }
  assert.ok(checked > 0 && resolved > 0, "no committed slate was exercised");
});

test("WIRED: the live panel, report header, report footer and /live roster all read the resolver", () => {
  const read = (p) => fs.readFileSync(p, "utf8");
  assert.match(read("src/components/game/game-detail-page.tsx"), /forecastGeneratedAt=\{forecastFrozenAt\(detail\.fullGameSim/);
  assert.doesNotMatch(read("src/components/game/game-detail-page.tsx"), /forecastGeneratedAt=\{detail\.fullGameSimMeta\?\.generatedAt/);
  const report = read("src/components/game/mlb-full-game-report.tsx");
  assert.doesNotMatch(report, /generated \$\{formatEtTime\(meta\.generatedAt\)\}/, "the footer printed the slate clock");
  assert.match(report, /forecastFrozenAt\(g, meta\)/);
  assert.doesNotMatch(read("src/lib/live/hub-data.ts"), /forecastGeneratedAt: slate\?\.generatedAt/);
  assert.match(read("src/components/saved/saved-list.tsx"), /board updated/);
});
