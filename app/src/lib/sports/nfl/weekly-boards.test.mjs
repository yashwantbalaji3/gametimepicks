/**
 * P246 · §5 — the weekly top boards' contract: ONE canonical ranking owner, week-scoped
 * membership, promotion-gated families, top-N as maximums, confirmed-out players excluded,
 * declared scope, and no price implication without authorization.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const SRC = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-weekly-boards.mjs"), "utf8");
const HUB = fs.readFileSync(path.join(APP, "src/app/nfl/page.tsx"), "utf8");
const read = (rel) => {
  try { return JSON.parse(fs.readFileSync(path.join(APP, rel), "utf8")); } catch { return null; }
};
const wb = read("public/data/nfl/weekly-boards/latest.json");
const perGame = fs.existsSync(path.join(APP, "public/data/nfl/player-board"))
  ? fs.readdirSync(path.join(APP, "public/data/nfl/player-board"))
      .filter((f) => /^\d+\.json$/.test(f))
      .map((f) => read(`public/data/nfl/player-board/${f}`))
  : [];

test("ONE ranking owner — the hub renders the artifact verbatim and never ranks players itself", () => {
  assert.match(HUB, /read\("nfl\/weekly-boards\/latest\.json"\)/, "the hub reads the owner's artifact");
  // The hub must not sort player rows — ranking is the owner's job. (The owner sorts by value.)
  assert.doesNotMatch(HUB, /rows\.sort|players\.sort/, "the hub re-ranking players would be a second owner");
  assert.match(SRC, /rows\.sort\(\(a, b\) => b\.value - a\.value\)/, "the owner ranks by the family's own metric");
  // Membership is the WEEK, never a clock window.
  assert.match(SRC, /w\.seasonType === period\.seasonType && w\.week === period\.week/, "membership is (seasonType, week)");
});

/* The canonical owner of prop prices, keyed exactly as a board row identifies itself. The capture
   publishes anytime TD under the BOARD's family name (`anytime_td`), so no translation is needed. */
const pricedKeys = new Map(
  ((read("public/data/nfl/markets/latest.json")?.propPrices?.rows) ?? [])
    .map((r) => [`${String(r.canonicalEventId).replace(/^nfl-/, "")}|${r.playerId}|${r.family}`, r]),
);

test("LIVE · published boards obey the contract (skip-free when the artifact exists)", () => {
  if (!wb) return; // pre-first-run tree
  assert.ok(["FULL_WEEK", "REMAINING_EVENTS"].includes(wb.scope.kind), "scope is declared");
  for (const b of wb.boards) {
    if (b.state !== "PUBLISHED") {
      assert.ok(b.reason, `${b.id} withheld without a named bar`);
      continue;
    }
    assert.ok(b.basis, `${b.id} publishes without naming its receipt basis`);
    assert.ok(b.rows.length <= b.topN, `${b.id}: top-${b.topN} is a MAXIMUM`);
    let prev = Infinity;
    for (const r of b.rows) {
      assert.notEqual(r.participation, "INACTIVE", `${r.name}: a confirmed-out player never ranks on a default board`);
      assert.ok(r.value <= prev, `${b.id}: rows out of rank order`);
      prev = r.value;
      /*
       * ⚠ THIS PINNED `NOT_AUTHORIZED` — a state the world left behind (P0 · 2026-09-24).
       *
       * While props were out of the receipt's scope, "no row implies a price" and "every row says
       * NOT_AUTHORIZED" were the same sentence, so the guard pinned the easier one. The founder
       * then authorized the five prop families, real prices arrived, and the guard failed for the
       * best possible reason — a proxy outliving the thing it stood for.
       *
       * The invariant was never the literal. It is that a row makes EXACTLY ONE claim about price
       * and that the claim is true:
       *
       *   a market     ⇒ a real captured price, attributed to a named book, stamped — and NO
       *                  simultaneous claim of absence
       *   no market    ⇒ a TYPED absence, and never a bare "unavailable"
       *
       * and, the direction that actually shipped the bug this P0 exists to fix, an absence must
       * agree with the canonical capture: a row may not say "not checked" about a player the
       * owner has priced.
       */
      const priceClaim = pricedKeys.get(`${r.providerEventId}|${r.playerId}|${b.family}`);
      if (r.market) {
        assert.equal(r.pricingState, undefined, `${r.name}: a priced row must not also claim an absence`);
        assert.ok(r.market.sportsbook, `${r.name}: a price with no named book cannot be attributed`);
        assert.ok(Number.isFinite(Date.parse(r.market.capturedAt)), `${r.name}: a price must carry the instant it was captured`);
        if (b.family === "anytime_td") {
          assert.ok(Number.isFinite(r.market.yesOdds), `${r.name}: an anytime-TD row needs its yes price`);
          assert.equal(r.market.overOdds, undefined, `${r.name}: a one-sided market must not grow a second side`);
        } else {
          assert.ok(Number.isFinite(r.market.line), `${r.name}: a two-sided row needs its point`);
          assert.ok(Number.isFinite(r.market.overOdds) && Number.isFinite(r.market.underOdds),
            `${r.name}: both sides come from the named book, or it is not a market`);
        }
      } else {
        assert.ok(["NOT_OFFERED", "NOT_PROBED", "IDENTITY_UNRESOLVED", "STALE"].includes(r.pricingState),
          `${r.name}: an unpriced row must carry a TYPED absence, got ${JSON.stringify(r.pricingState)}`);
        assert.equal(priceClaim, undefined,
          `${r.name}: the canonical capture prices this row (${priceClaim?.sportsbook}), so the board may not say ${r.pricingState}`);
      }
      assert.ok(r.opponent && r.kickoffUtc && r.providerEventId, `${r.name}: row identity incomplete`);
    }
    // No duplicate player rows across the board.
    const ids = b.rows.map((r) => `${r.playerId}:${r.team}`);
    assert.equal(new Set(ids).size, ids.length, `${b.id}: duplicate ranked rows`);
  }
});

test("LIVE · a family publishes weekly ONLY when every constituent per-game board publishes it", () => {
  if (!wb || !perGame.length) return;
  /* CONSTITUENTS are the boards of the weekly artifact's own period. A played week's boards stay on disk, frozen at
     their last pre-kickoff publication (P320), and a family a NEW model publishes this week was an ESTIMATE on them —
     both true, neither a contradiction. Membership is (seasonType, week), the same rule the owner uses. */
  const constituents = perGame.filter((g) => g && g.seasonType === wb.period?.seasonType && g.week === wb.period?.week);
  if (!constituents.length) return;
  const famOf = (key) => new Set(constituents.map((g) => g.families?.[key]?.state));
  for (const b of wb.boards) {
    const states = famOf(b.family);
    if (b.state === "PUBLISHED") {
      assert.deepEqual([...states], ["PUBLISHED"], `${b.id} ranks a family some game withheld`);
    }
  }
});

test("the workflow owns regeneration — the builder refuses an unpinned run", () => {
  assert.match(SRC, /REFUSED: --now <ISO> required/, "regen is always pinned (artifact-regeneration rule)");
  const wf = fs.readFileSync(path.join(APP, "../.github/workflows/nfl-event-window.yml"), "utf8");
  assert.match(wf, /build-nfl-weekly-boards\.mjs --now/, "the event-window workflow runs the ranking owner");
});
