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
      assert.equal(r.pricingState, "NOT_AUTHORIZED", "no row may imply a current authorized price exists");
      assert.ok(r.opponent && r.kickoffUtc && r.providerEventId, `${r.name}: row identity incomplete`);
    }
    // No duplicate player rows across the board.
    const ids = b.rows.map((r) => `${r.playerId}:${r.team}`);
    assert.equal(new Set(ids).size, ids.length, `${b.id}: duplicate ranked rows`);
  }
});

test("LIVE · a family publishes weekly ONLY when every constituent per-game board publishes it", () => {
  if (!wb || !perGame.length) return;
  const famOf = (key) => new Set(perGame.map((g) => g.families?.[key]?.state));
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
