/**
 * Player-event corpus guards (Program 170 · Release A).
 * Run: npx tsx --test src/lib/sports/nfl/player-events.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "..", "data/internal/research/nfl/player-events-v1");
const seasons = fs.readdirSync(DIR).filter((f) => /^\d{4}\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));

test("corpus partitions exist with rights manifest, content hash, and EXACT accounting", () => {
  assert.ok(seasons.length >= 3, `seasons captured: ${seasons.length}`);
  for (const s of seasons) {
    assert.equal(s.dataClass, "PRIVATE_RESEARCH");
    assert.match(s.source.rights, /COMPACT DERIVED|no raw payload mirror/i, `${s.season}: rights posture stated`);
    assert.ok(/^[0-9a-f]{16}$/.test(s.contentHash), "deterministic partition hash");
    assert.equal(s.accounting.captured + s.accounting.quarantined, s.accounting.corpusGames, `${s.season}: joined+quarantined=completed, exactly`);
    assert.ok(s.accounting.captured / s.accounting.corpusGames > 0.9, `${s.season}: coverage ${s.accounting.captured}/${s.accounting.corpusGames} — a broken source class would be visible here`);
  }
});

test("R1/R2/R3 hold on every committed game; missing is typed missing, never zero", () => {
  for (const s of seasons) {
    for (const g of s.games) {
      const sumOf = (k) => g.players.reduce((x, p) => x + (p[k] ?? 0), 0);
      assert.equal(sumOf("recTd"), sumOf("passTd"), `${g.providerEventId} R1`);
      assert.equal(sumOf("recYds"), sumOf("passYds"), `${g.providerEventId} R2`);
      assert.ok(6 * (g.teamOffensiveTd.pass + g.teamOffensiveTd.rush) <= g.ftHome + g.ftAway, `${g.providerEventId} R3`);
    }
    const someQb = s.games[0].players.find((p) => p.passAtt != null);
    assert.ok(someQb, "passing rows exist");
    const nonPasser = s.games[0].players.find((p) => p.passAtt == null && p.rec != null);
    assert.ok(nonPasser, "a receiver without pass attempts has passAtt ABSENT (undefined/null), not zero");
  }
});

test("preseason stays separate and identified; ids are durable", () => {
  const all = seasons.flatMap((s) => s.games);
  assert.ok(all.some((g) => g.seasonType === 1) && all.some((g) => g.seasonType === 2), "both phases present, typed");
  for (const g of all.slice(0, 40)) for (const p of g.players.slice(0, 5)) assert.match(p.playerId, /^nfl-athlete-\d+$/);
});

test("CORRUPTION · a tampered game fails the reconciliation identities", () => {
  const g = JSON.parse(JSON.stringify(seasons[0].games.find((x) => x.teamOffensiveTd.pass > 0)));
  const qb = g.players.find((p) => (p.passTd ?? 0) > 0);
  qb.passTd += 1; // corrupt one credit side
  const sumOf = (k) => g.players.reduce((x, p) => x + (p[k] ?? 0), 0);
  assert.notEqual(sumOf("recTd"), sumOf("passTd"), "the corruption is detectable by R1 — the builder would quarantine this game");
});
