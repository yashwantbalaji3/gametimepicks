/**
 * Cross-sport step search (step-search.mjs) on SYNTHETIC fixtures: no real price, no network.
 *   npx tsx --test src/lib/challenge-lanes/step-search.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchStep, pairProducts, COMBINED_PRODUCT_LABEL, searchDigest } from "./step-search.mjs";
import { selectionIdentity } from "./card-fields.mjs";

const NOW = "2026-11-05T19:10:00Z"; const F = "2026-11-05T19:00:00Z";
const NFL = "401873037";
const evB = (rate = 0.66, n = 40) => ({ level: "B", windows: [{ window: "last5", hits: 4, n: 5 }, { window: "last10", hits: 8, n: 10 }, { window: "career", hits: Math.round(n * 0.65), n }], shrunk: { rate } });
const nfl = (o) => ({ sport: "nfl", gameId: NFL, eventLabel: "JAX @ BAL", startUtc: "2026-11-06T01:15Z", injury: { status: "ACTIVE" }, evidence: evB(), ...o });
const nba = (o) => ({ sport: "nba", gameId: "401909936", eventLabel: "ORL @ PHX", startUtc: "2026-11-06T02:00Z", injury: { status: "ACTIVE" }, evidence: evB(), ...o });
const C = {
  td: nfl({ family: "anytime_td", player: { playerId: "h", name: "Henry", team: "BAL" }, side: "yes", evidence: { level: "A", probability: 0.63, interval95: [0.58, 0.68] } }),
  rec: nfl({ family: "receptions", player: { playerId: "f", name: "Flowers", team: "BAL" }, side: "over", line: 5.5 }),
  recU: nfl({ family: "receptions", player: { playerId: "f", name: "Flowers", team: "BAL" }, side: "under", line: 5.5 }),
  ml: nfl({ family: "winner", team: "BAL", side: "home" }),
  nbaPts: nba({ family: "pts", player: { playerId: "b", name: "Booker", team: "PHX" }, side: "over", line: 24.5 }),
  nbaAst: nba({ gameId: "401909937", eventLabel: "MIA @ GS", startUtc: "2026-11-06T03:00Z", family: "ast", player: { playerId: "c", name: "Curry", team: "GS" }, side: "over", line: 5.5 }),
};
const q = (c, american, book = "draftkings", fetchedAt = F, line = c.line) => ({ key: selectionIdentity(c), book, american, line: line ?? null, fetchedAt });
const BB = { product: "bank-builder", step: 2, bankrollCents: 20700, now: NOW, requireSport: "nfl", requireGames: [NFL] };
const MS = { product: "moonshot", step: 2, bankrollCents: 4516, now: NOW, requireSport: "nfl", requireGames: [NFL] };

test("step 2 band from the settled bankroll: BB $207 → $450–$550, MS $45.16 → $90–$110", () => {
  const bb = searchStep({ candidates: [], quotes: [], ...BB }); const ms = searchStep({ candidates: [], quotes: [], ...MS });
  assert.deepEqual([bb.targetCents, bb.band.loCents, bb.band.hiCents], [50000, 45000, 55000]);
  assert.deepEqual([ms.targetCents, ms.band.loCents, ms.band.hiCents], [10000, 9000, 11000]);
});

test("a single NFL leg in band qualifies; an NBA-only card is refused for the missing NFL leg", () => {
  const r = searchStep({ candidates: [C.rec, C.nbaPts], quotes: [q(C.rec, 140), q(C.nbaPts, 140)], ...BB }); // 207 × 2.40 = 496.80
  const single = r.ranked.find((c) => c.legCount === 1);
  assert.equal(single.legs[0].key, selectionIdentity(C.rec));
  assert.equal(single.money.grossPayoutCents, 49680);
  assert.ok(r.cards.find((c) => c.legCount === 1 && c.legs[0].sport === "nba").reasons.some((x) => x.startsWith("REQUIRED_LEG_MISSING")));
});

test("two NFL legs of one game are refused (no quoted same-game price); NFL + NBA pair is a labelled product", () => {
  const r = searchStep({ candidates: [C.rec, C.ml, C.nbaPts], quotes: [q(C.rec, -150), q(C.ml, -200), q(C.nbaPts, 100)], ...MS }); // 45.16×1.6667×2 = 150.5 out; use MS band
  assert.ok(r.cards.find((c) => c.legCount === 2 && c.legs.every((l) => l.sport === "nfl")).reasons.some((x) => x.startsWith("CORRELATED_SAME_GAME")));
  const pair = r.cards.find((c) => c.legCount === 2 && c.legs.some((l) => l.sport === "nba") && c.legs.some((l) => l.family === "winner"));
  assert.equal(pair.combined.label, COMBINED_PRODUCT_LABEL);
  assert.equal(pair.money.grossPayoutCents, Math.floor(4516 * 1.5 * 2)); // −200 × +100 = 3.0 … floor
});

test("LEVEL_A only when the validated lower bound × price exceeds 1; otherwise LEVEL_B with a flag; no EV claim on B", () => {
  const a = searchStep({ candidates: [C.td], quotes: [q(C.td, 140)], ...BB }); // 0.58 × 2.40 = 1.392 > 1
  assert.equal(a.ranked[0].classification, "LEVEL_A");
  const b = searchStep({ candidates: [C.td], quotes: [q(C.td, -150)], ...BB }); // 0.58 × 1.667 = 0.967; and out of band
  assert.ok(b.cards[0].flags.some((x) => x.startsWith("A_EV_NOT_ROBUST")));
  const rb = searchStep({ candidates: [C.rec], quotes: [q(C.rec, 140)], ...BB });
  assert.deepEqual([rb.ranked[0].classification, rb.ranked[0].legs[0].probability], ["LEVEL_B", null]);
});

test("refusals: exact line, stale quote, injury, opposing selection within a card; none in band → closest with blockers", () => {
  const off = searchStep({ candidates: [C.rec], quotes: [q(C.rec, 140, "draftkings", F, 6.5)], ...BB });
  assert.ok(off.cards[0].reasons.some((x) => x.startsWith("E_NO_QUOTE_AT_EXACT_LINE")));
  const stale = searchStep({ candidates: [C.rec], quotes: [q(C.rec, 140, "draftkings", "2026-11-05T15:00:00Z")], ...BB });
  assert.ok(stale.cards[0].reasons.some((x) => x.startsWith("E_STALE_QUOTE")));
  const hurt = searchStep({ candidates: [{ ...C.rec, injury: { status: "QUESTIONABLE" } }], quotes: [q(C.rec, 140)], ...BB });
  assert.ok(hurt.cards[0].reasons.some((x) => x.startsWith("C_AVAILABILITY")));
  const opp = searchStep({ candidates: [C.rec, C.recU], quotes: [q(C.rec, 100), q(C.recU, 100)], ...BB });
  assert.ok(opp.cards.find((c) => c.legCount === 2).reasons.some((x) => /CORRELATED_SAME/.test(x)));
  const none = searchStep({ candidates: [C.rec], quotes: [q(C.rec, -300)], ...BB });
  assert.equal(none.ranked.length, 0);
  assert.ok(none.closest[0].blockers.some((x) => x.startsWith("OUT_OF_BAND")) || none.closest[0].blockers.some((x) => x.startsWith("E_PRICE_BOUNDS")));
});

test("products differ: no shared selection or opposing sides; the same event is allowed and reported", () => {
  const cands = [C.rec, C.td, C.nbaPts, C.nbaAst];
  const quotes = [q(C.rec, 140), q(C.td, 140), q(C.nbaPts, 100), q(C.nbaAst, 100)];
  const bb = searchStep({ candidates: cands, quotes, ...BB });
  const ms = searchStep({ candidates: cands, quotes: [...quotes, q({ ...C.rec }, 140)], ...MS, bankrollCents: 4516 });
  const p = pairProducts(bb, { ...ms, ranked: ms.ranked.length ? ms.ranked : bb.ranked });
  if (p.proposed) {
    const a = bb.ranked.concat(ms.ranked).find((c) => c.candidateId === p.proposed.bankBuilder); const b = ms.ranked.concat(bb.ranked).find((c) => c.candidateId === p.proposed.moonshot);
    assert.ok(!a.legs.some((x) => b.legs.some((y) => x.key === y.key)));
  }
  assert.equal(searchDigest(bb), searchDigest(searchStep({ candidates: [...cands].reverse(), quotes, ...BB })), "deterministic regardless of input order");
});

test("NFL hit-rate windows at the exact line from per-game rows; null lines skipped; newest first; TD family", async () => {
  const { nflWindows } = await import("./nfl-hit-rates.mjs");
  const row = (gameId, season, stats) => ({ family: "nfl.espn-player-lines", playerId: "p", gameId, season, stats });
  const rows = [row("401", 2025, { receptions: 6, rushingTds: 0, receivingTds: 1 }), row("402", 2025, { receptions: 4, rushingTds: 0, receivingTds: 0 }), row("501", 2026, { receptions: 7, rushingTds: 1, receivingTds: 0 }), row("502", 2026, { receptions: null }), row("503", 2026, { receptions: 5, rushingTds: 0, receivingTds: 0 })];
  const r = nflWindows(rows, { playerId: "p", family: "receptions", side: "over", line: 5.5, noVig: 0.5 });
  assert.deepEqual(r.windows.map((w) => [w.window, w.hits, w.n]), [["last5", 2, 4], ["last10", 2, 4], ["last20", 2, 4], ["season-2026", 1, 2], ["season-2025", 1, 2]]);
  assert.equal(r.shrunk.rate, Math.round(((2 + 32) / 68) * 1000) / 1000);
  assert.ok(r.flags.includes("NFL_SHRINK_FROM_NBA_FIT"));
  const td = nflWindows(rows, { playerId: "p", family: "anytime_td", side: "yes" });
  assert.equal(td.windows[0].hits, 2);
  assert.equal(td.shrunk.rate, null, "no market price → no shrunk rate");
});

test("every card leg carries a unique legId (the selection identity)", () => {
  const r = searchStep({ candidates: [C.ml, C.nbaPts], quotes: [q(C.ml, -150), q(C.nbaPts, 110)], ...MS });
  const pair = r.cards.find((c) => c.legCount === 2);
  assert.ok(pair.legs.every((l) => typeof l.legId === "string" && l.legId === selectionIdentity(l.sport === "nfl" ? C.ml : C.nbaPts)));
  assert.equal(new Set(pair.legs.map((l) => l.legId)).size, 2);
});

test("Nov 5 dated snapshot exception: 19:00Z quotes usable past 90 min for tonight's games; latestPostAt = first leg start", async () => {
  const { NOV5_SNAPSHOT_OVERRIDE } = await import("./levels.mjs");
  const later = { ...BB, now: "2026-11-05T23:00:00Z" };
  assert.ok(searchStep({ candidates: [C.rec], quotes: [q(C.rec, 140)], ...later }).cards[0].reasons.some((x) => x.startsWith("E_STALE_QUOTE")), "off by default");
  const r = searchStep({ candidates: [C.rec], quotes: [q(C.rec, 140)], ...later, params: { freshnessOverride: NOV5_SNAPSHOT_OVERRIDE } });
  assert.equal(r.ranked[0].latestPostAt, "2026-11-06T01:15:00.000Z");
  assert.ok(r.ranked[0].flags.some((x) => x.startsWith("E_SNAPSHOT_OVERRIDE")));
});
