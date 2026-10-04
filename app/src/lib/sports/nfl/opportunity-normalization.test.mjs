/**
 * Session 11 — forward-only proportional conservation of share-level team pools (nfl-share-conservation-v1).
 * Σ cleared shares > 1 + EPS ⇒ every cleared share × 1/S per team; Σ ≤ 1 untouched; availability gates first;
 * an unjoinable pool is still withheld; the audit re-derives the reconciliation from the raw shares.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { CONSERVATION_VERSION, normalizeOverAllocatedPools } from "./opportunity-conservation.mjs";
import { auditBoard } from "./board-roster-integrity.mjs";
import { PUBLIC_BOARD_CLEARED, poolWithheldTeams } from "./board-ranking.mjs";

const cleared = (p) => PUBLIC_BOARD_CLEARED.includes(p.participation);
const rush = (median) => ({ player_rush_yds: { mean: median, p10: median / 4, p25: median / 2, median, p75: median * 1.5, p90: median * 2 } });
const row = (id, team, median, participation = "AVAILABLE_ROLE_UNCERTAIN") => ({ playerId: `nfl-athlete-${id}`, name: `P${id}`, team, participation, markets: rush(median) });
const SHARES = { "1|ARI": 0.6, "2|ARI": 0.5, "3|ARI": 0.3, "4|NYG": 0.5, "5|NYG": 0.3, "6|ARI": 0.4 };
const shareOf = (id, team, m) => (m === "player_rush_yds" ? SHARES[`${id}|${team}`] : undefined);
const run = (players, s = shareOf) => normalizeOverAllocatedPools({ players, shareOf: s, markets: ["player_rush_yds"], eligible: cleared });
const sumOf = (out, team) => out.normalized.find((n) => n.team === team)?.players.reduce((a, x) => a + x.normalizedShare, 0);

test("🔴 an over-allocated pool is reconciled to Σ = 1, proportionally, keeping relative roles", () => {
  const out = run([row(1, "ARI", 60), row(2, "ARI", 50), row(3, "ARI", 30)]);
  const n = out.normalized.find((x) => x.team === "ARI");
  assert.equal(n.originalSum, 1.4);
  assert.ok(Math.abs(n.normalizedSum - 1) < 1e-4 && Math.abs(sumOf(out, "ARI") - 1) < 1e-3);
  assert.equal(n.factor, Math.round((1 / 1.4) * 1e4) / 1e4);
  const p1 = out.players.find((p) => p.playerId === "nfl-athlete-1").markets.player_rush_yds;
  const p2 = out.players.find((p) => p.playerId === "nfl-athlete-2").markets.player_rush_yds;
  assert.ok(Math.abs(p1.mean - 60 / 1.4) < 1e-3 && Math.abs(p1.p90 - 120 / 1.4) < 1e-3, "every location/quantile field scales by 1/S");
  assert.ok(Math.abs(p1.median / p2.median - 60 / 50) < 1e-3, "relative modelled roles preserved");
  assert.equal(p1.conservation.version, CONSERVATION_VERSION);
  assert.equal(out.pools.find((p) => p.team === "ARI").state, "NORMALIZED");
  assert.equal(out.withheld.length, 0, "a reconciled pool is published, not withheld");
});

test("🔴 S ≤ 1 is never scaled (up or down) and its OTHER residual survives", () => {
  const out = run([row(4, "NYG", 50), row(5, "NYG", 30)]);
  assert.equal(out.normalized.length, 0);
  assert.equal(out.players[0].markets.player_rush_yds.median, 50);
  assert.equal(out.players[0].markets.player_rush_yds.conservation, undefined);
  const pool = out.pools.find((p) => p.team === "NYG");
  assert.equal(pool.state, "CONSERVED");
  assert.ok(Math.abs(pool.residualOther - 0.2) < 1e-4, "OTHER = 1 − S");
});

test("🔴 per-team, never across teams", () => {
  const out = run([row(1, "ARI", 60), row(2, "ARI", 50), row(4, "NYG", 50), row(5, "NYG", 30)]);
  assert.equal(out.players.find((p) => p.team === "NYG").markets.player_rush_yds.median, 50, "NYG untouched by ARI's factor");
  assert.deepEqual(out.normalized.map((n) => n.team), ["ARI"]);
});

test("🔴 availability gates the pool FIRST: a blocked player is neither counted nor scaled", () => {
  // ARI cleared Σ = 0.6 + 0.3 = 0.9 once the QUESTIONABLE 0.5 is out of the pool → no reconciliation at all.
  const out = run([row(1, "ARI", 60), row(2, "ARI", 50, "QUESTIONABLE"), row(3, "ARI", 30)]);
  assert.equal(out.normalized.length, 0);
  assert.equal(out.players.find((p) => p.playerId === "nfl-athlete-2").markets.player_rush_yds.median, 50, "the blocked row keeps its conditional numbers, unscaled");
  const out2 = run([row(1, "ARI", 60), row(2, "ARI", 50), row(6, "ARI", 40, "QUESTIONABLE"), row(3, "ARI", 30)]);
  assert.equal(out2.normalized[0].originalSum, 1.4, "Σ excludes the questionable 0.4");
  assert.ok(!out2.normalized[0].players.some((x) => x.playerId === "nfl-athlete-6"));
  assert.throws(() => normalizeOverAllocatedPools({ players: [], shareOf, markets: ["player_rush_yds"] }), /eligible/);
});

test("🔴 a pool that cannot be joined in full (missing / NaN / negative share) is withheld, never half-reconciled", () => {
  for (const bad of [undefined, NaN, -0.2]) {
    const s = (id, team, m) => (id === "3" ? bad : shareOf(id, team, m));
    const out = run([row(1, "ARI", 60), row(2, "ARI", 50), row(3, "ARI", 30)], s);
    assert.equal(out.normalized.length, 0, `share ${bad}`);
    assert.deepEqual(out.withheld.map((w) => w.team), ["ARI"]);
    assert.ok(out.players.every((p) => !p.markets.player_rush_yds), "withheld for the team");
  }
});

test("🔴 the audit re-derives the reconciliation from raw shares", () => {
  const out = run([row(1, "ARI", 60), row(2, "ARI", 50), row(4, "NYG", 50), row(5, "NYG", 30)]);
  const families = { player_rush_yds: { state: "PUBLISHED", model: "nfl-player-share-level-v1", conservation: { version: CONSERVATION_VERSION, pools: out.normalized.map((n) => ({ team: n.team, pool: n.pool, originalSum: n.originalSum, normalizedSum: n.normalizedSum, factor: n.factor })) } } };
  const board = { matchup: "ARI @ NYG", families, players: out.players, coverage: {} };
  const codes = (b) => auditBoard({ board: b, rosterByTeam: new Map(), unavailable: new Map(), shareOf }).map((x) => x.code).filter((c) => /POOL/.test(c));
  assert.deepEqual(codes(board), [], "a recorded, re-derivable reconciliation passes");
  // skipped normalisation: raw rows published on an over-allocated pool
  assert.deepEqual(codes({ ...board, players: [row(1, "ARI", 60), row(2, "ARI", 50)] }), ["POOL_OVER_ALLOCATED_PUBLISHED"]);
  // wrong factor recorded — consistently on the record AND the rows, so only factor × Σ = 1 can catch it
  const wrong = structuredClone(families); wrong.player_rush_yds.conservation.pools[0].factor = 0.9;
  const wrongRows = structuredClone(out.players); for (const p of wrongRows) if (p.team === "ARI") p.markets.player_rush_yds.conservation.factor = 0.9;
  assert.deepEqual(codes({ ...board, families: wrong, players: wrongRows }), ["POOL_OVER_ALLOCATED_PUBLISHED"]);
  // normalisation recorded for a pool that was not over-allocated
  const extra = structuredClone(families); extra.player_rush_yds.conservation.pools.push({ team: "NYG", pool: "carries", originalSum: 0.8, normalizedSum: 1, factor: 1.25 });
  assert.deepEqual(codes({ ...board, families: extra }), ["POOL_NORMALIZED_WITHOUT_OVERALLOCATION"]);
});

test("the producer reconciles (never the old withhold-only path) and both top boards refuse a withheld team pool", () => {
  const src = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const producer = src("scripts/nfl/build-nfl-player-board.mjs");
  assert.match(producer, /normalizeOverAllocatedPools\(\{[\s\S]*?eligible: \(p\) => PUBLIC_BOARD_CLEARED\.includes\(p\.participation\)/);
  assert.doesNotMatch(producer, /withholdOverAllocatedPools\(/);
  assert.match(src("scripts/nfl/build-nfl-weekly-boards.mjs"), /poolWithheldTeams\(scoped, spec\.family\)/);
  assert.match(src("scripts/results/freeze-daily-top-boards.mjs"), /poolWithheldTeams\(boards, family\)/);
  assert.deepEqual(poolWithheldTeams([{ families: { f: { withheldTeams: [{ team: "ARI" }] } } }, { families: {} }], "f"), ["ARI"]);
});

test("🔴 ESPN ↔ nflverse aliases: a WSH board pool joins the forecast's WAS shares (one normaliser)", () => {
  const s = (id, team, m) => ({ "7|WAS": 0.7, "8|WAS": 0.6 })[`${id}|${team}`];
  const out = normalizeOverAllocatedPools({ players: [row(7, "WSH", 70), row(8, "WSH", 60)], shareOf: s, markets: ["player_rush_yds"], eligible: cleared });
  assert.equal(out.normalized.length, 1, "joined through the canonical alias, not the raw abbreviation");
  assert.equal(out.normalized[0].originalSum, 1.3);
});

test("🔴 the frozen daily Top-5 refuses a family any board withheld for a team", async () => {
  const { freezeDay } = await import(path.join(process.cwd(), "scripts/results/freeze-daily-top-boards.mjs"));
  const avail = { injuriesCapturedAt: "2031-10-02T09:00:00Z", injuries: "FRESH", rosters: "FRESH" };
  const b = { providerEventId: "1", matchup: "AAA @ BBB", kickoffUtc: "2031-10-02T17:00Z", availability: avail,
    families: { player_rush_yds: { label: "Rushing yards", state: "PUBLISHED", basis: "b", withheldTeams: [{ team: "AAA", sum: 1.3, reason: "r" }] } },
    players: [row(1, "BBB", 80)] };
  const doc = freezeDay("2031-10-02", [b], "2031-10-02T12:00:00Z", { slotFor: () => ({ pricingState: "NOT_PROBED" }) });
  assert.ok(!doc.boards.some((x) => x.propFamily === "player_rush_yds"), "a Top-5 over a partial population is a false claim");
  assert.match(doc.ineligible.find((x) => x.propFamily === "player_rush_yds").reason, /AAA/);
});

test("the /nfl hub carries the reconciliation statement to the weekly boards (its field list is hand-copied)", () => {
  const hub = fs.readFileSync(path.join(process.cwd(), "src/app/nfl/page.tsx"), "utf8");
  assert.match(hub, /conservation: b\.conservation \? \{ version: String\(b\.conservation\.version\), teamsReconciled: Number\(b\.conservation\.teamsReconciled\) \}/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "src/components/nfl/weekly-boards.tsx"), "utf8"), /b\.conservation\?\.teamsReconciled \?/);
});
