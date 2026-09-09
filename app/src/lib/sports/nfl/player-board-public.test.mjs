/**
 * P245 — the public player board's contract: promotion-gated publication, absence conditioning,
 * one availability state per row, and no research payload.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const DIR = path.join(APP, "public/data/nfl/player-board");
const SRC = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-player-board.mjs"), "utf8");

const boards = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter((f) => /^\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")))
  : [];

test("gates are READ from receipts, never a hardcoded publish list", () => {
  assert.match(SRC, /promo\.state === "PUBLIC_ELIGIBLE"/, "props families publish exactly on their promotion state");
  assert.match(SRC, /h\.model\.logLoss < b\.logLoss/, "the TD gate re-derives beats-both-baselines from the receipt");
  assert.doesNotMatch(SRC, /families\.player_rush_yds\s*=\s*\{[^}]*state:\s*"PUBLISHED"/, "no family is published by name");
  assert.match(SRC, /never derived from anytime probabilities/, "ordered TD outcomes stay disabled with the reason");
});

test("LIVE · every published board obeys the contract (skip-free when boards exist)", () => {
  for (const b of boards) {
    // A withheld family names its bar; a published one names its basis; an ESTIMATE (P250-GD2,
    // the owner's display decision) names BOTH the failed bar and its reader-facing caveat.
    for (const [key, f] of Object.entries(b.families)) {
      if (f.state === "PUBLISHED") assert.ok(f.basis, `${key} publishes without naming its receipt`);
      else if (f.state === "ESTIMATE") {
        assert.ok(f.reason, `${key} displays as an estimate without its failed bar`);
        assert.ok(f.caveat, `${key} displays as an estimate without a caveat`);
      }
      else assert.ok(f.reason, `${key} withheld without a named bar`);
    }
    const published = new Set(Object.entries(b.families).filter(([, f]) => f.state === "PUBLISHED" || f.state === "ESTIMATE").map(([k]) => k));
    for (const p of b.players) {
      assert.ok(p.playerId && p.name && p.team, "identity is complete");
      assert.ok(Object.keys(p.markets).length > 0, `${p.name}: a row with no markets is padding`);
      for (const m of Object.keys(p.markets)) {
        assert.ok(published.has(m), `${p.name}: market ${m} renders without a published family`);
      }
      // CONFIRMED ABSENCE CONDITIONS OUTPUT: an INACTIVE player carries no volume projection.
      if (p.participation === "INACTIVE") {
        assert.deepEqual(Object.keys(p.markets), ["anytime_td"], `${p.name} is listed out and must carry only the void-conditioned TD number`);
        assert.ok(p.volumeNote, "the withholding is explained on the row");
      }
      // Probabilities are probabilities; volumes are nonnegative and ordered.
      const td = p.markets.anytime_td;
      if (td) assert.ok(td.probability > 0 && td.probability < 1, `${p.name}: TD probability out of range`);
      const rush = p.markets.player_rush_yds;
      if (rush) {
        assert.ok(rush.p10 >= 0 && rush.p10 <= rush.median && rush.median <= rush.p90, `${p.name}: rush quantiles disordered`);
      }
    }
    // No duplicate player rows (the duplicate-join corruption class).
    const ids = b.players.map((p) => `${p.playerId}:${p.team}`);
    assert.equal(new Set(ids).size, ids.length, "duplicate player rows");
    // No research payload.
    const raw = JSON.stringify(b);
    for (const banned of ["data/internal", "PRIVATE_RESEARCH", "apiKey"]) {
      assert.ok(!raw.includes(banned), `board carries "${banned}"`);
    }
  }
});

test("CORRUPTION · the wrong-player-join and stale-membership classes are structurally blocked", () => {
  // Rows come only from the artifact's own per-team blocks — the team on the row is the block it
  // was read from, so a player cannot be joined into the other team's list.
  assert.match(SRC, /Object\.entries\(doc\.research\?\.perTeam \?\? \{\}\)/, "rows derive from per-team blocks");
  assert.match(SRC, /players\.find\(\(p\) => p\.playerId === row\.playerId && p\.team === abbr\)/, "the TD merge keys on player AND team");
  // The strongest availability evidence wins one row — never two states for one player.
  assert.match(SRC, /RANK\[tdBlock\.participation\]/, "availability states reconcile to the strongest evidence");
});

test("P246 · confirmed-out players are excluded from the DEFAULT view (client chrome — source pin)", () => {
  // Built-HTML greps cannot see a client-side default (the vacuous-guard class), so the
  // component source is pinned: the default state hides INACTIVE rows and only an explicit,
  // labelled toggle shows their conditional-on-playing numbers.
  const ui = fs.readFileSync(path.join(APP, "src/components/nfl/player-board.tsx"), "utf8");
  assert.match(ui, /useState\(false\);\n\s+const outCount/, "the listed-out toggle defaults OFF");
  assert.match(ui, /includeOut \? true : p\.participation !== "INACTIVE"/, "the default filter excludes confirmed-out players");
  assert.match(ui, /conditional on playing/, "the toggle names what the shown numbers mean");
});
