/**
 * SESSION 4 — the role-share pool (and so the published receiving family) must see THIS season.
 *
 * Four weeks into 2026 the pool was built from 2023–2025 only: CLE's top 2026 target share (a rookie)
 * and PIT's new receiver (an IND mover) had no receiving projection. These guards read the committed
 * 2026 partition and the committed pool — both bot-refreshed by nfl-event-window — and every count is
 * required to be non-zero so an empty join can never pass blind.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const PART = "data/internal/research/nfl/player-events-v1/2026.json";
const POOL = "data/internal/research/nfl/role-shares-v1/current.json";
const FAMILIES = ["passAttempts", "rushAttempts", "targets"];

test("2026 partition · every game reconciles and every row has a durable id", () => {
  const part = read(PART);
  assert.ok(part.games.length > 0, "an empty partition would make every guard below vacuous");
  assert.equal(part.accounting.captured + part.accounting.quarantined, part.accounting.corpusGames, "accounting must be exact");
  for (const g of part.games) {
    const sum = (k) => g.players.reduce((s, r) => s + (r[k] ?? 0), 0);
    assert.equal(sum("recTd"), sum("passTd"), `${g.providerEventId}: R1`);
    assert.equal(sum("recYds"), sum("passYds"), `${g.providerEventId}: R2`);
    assert.ok(6 * (sum("passTd") + sum("rushTd")) <= g.ftHome + g.ftAway, `${g.providerEventId}: R3`);
    for (const r of g.players) assert.match(r.playerId, /^nfl-athlete-\d+$/, `${g.providerEventId}: ${r.name} has no durable id`);
    assert.match(g.dateUtc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/, `${g.providerEventId}: kickoff must keep its minutes — stint order is chronological`);
  }
});

test("the pool has folded the 2026 partition it claims to", () => {
  const pool = read(POOL);
  const part = read(PART);
  assert.equal(pool.currentSeason?.games, part.games.length, "the pool must fold every captured 2026 game");
  assert.equal(pool.currentSeason?.contentHash, part.contentHash, "and exactly the committed bytes");
});

test("§25 TRANSFER IDENTITY · a 2025→2026 mover keeps ONE id and is pooled only at his CURRENT club", () => {
  const last2025 = new Map();
  for (const g of [...read("data/internal/research/nfl/player-events-v1/2025.json").games].sort((a, b) => a.dateUtc.localeCompare(b.dateUtc))) {
    if ((g.seasonType ?? 0) === 1) continue;
    for (const r of g.players) last2025.set(r.playerId, r.teamAbbr);
  }
  const last2026 = new Map();
  for (const g of [...read(PART).games].sort((a, b) => a.dateUtc.localeCompare(b.dateUtc))) for (const r of g.players) last2026.set(r.playerId, r.teamAbbr);
  const pool = read(POOL);
  const pooledAt = new Map();
  for (const [team, fam] of Object.entries(pool.teams)) for (const f of FAMILIES) for (const p of fam[f].players) {
    const prev = pooledAt.get(p.playerId);
    assert.ok(!prev || prev === team, `${p.name}: pooled for BOTH ${prev} and ${team} — one person, two identities`);
    pooledAt.set(p.playerId, team);
  }
  let movers = 0;
  for (const [id, now] of last2026) {
    const was = last2025.get(id);
    if (!was || was === now || !pooledAt.has(id)) continue;
    movers += 1;
    assert.equal(pooledAt.get(id), now, `${id}: moved ${was}→${now} but is pooled at ${pooledAt.get(id)}`);
  }
  assert.ok(movers > 0, "no pooled 2025→2026 mover found — the identity join is broken, not clean");
});

test("§32 · a player with only 2026 usage (rookie) can enter the pool — current evidence is used", () => {
  const seen = new Set();
  for (const y of [2023, 2024, 2025]) for (const g of read(`data/internal/research/nfl/player-events-v1/${y}.json`).games) for (const r of g.players) seen.add(r.playerId);
  const pool = read(POOL);
  let rookies = 0;
  for (const fam of Object.values(pool.teams)) for (const p of fam.targets.players) if (!seen.has(p.playerId)) rookies += 1;
  assert.ok(rookies > 0, "no 2026-only player in any target pool — the current season is not reaching the pool");
});

test("§17 · every pool still conserves opportunity (Σ known shares ≤ 1, residual ≥ 0)", () => {
  const pool = read(POOL);
  for (const [team, fam] of Object.entries(pool.teams)) for (const f of FAMILIES) {
    const sum = fam[f].players.reduce((s, p) => s + p.share, 0);
    assert.ok(sum <= 1 + 1e-6, `${team}/${f}: Σ ${sum}`);
    assert.ok(fam[f].residual.share >= -1e-6, `${team}/${f}: negative residual`);
  }
});
