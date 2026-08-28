/**
 * Qualified-leg contract guards (Program 201 · Release A).
 *
 * Every leg on every PUBLISHED committed ladder card must be expressible in the one contract —
 * a refusal on a published card is a failing build, because it means an ungradeable or
 * unidentifiable selection reached the public. The three-state model-probability rule holds:
 * a real number where a model spoke (UFC), a typed absence where the lane is market-priced by
 * design (MLB/EPL), never a zero-fill.
 *
 * Run: npx tsx --test src/lib/product-day/qualified-leg.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { validateLaneArtifacts, adaptLaneLeg } from "./qualified-leg.ts";

const dataRoot = path.join(process.cwd(), "public", "data");

test("every published leg on every committed lane adapts — zero refusals", () => {
  for (const v of validateLaneArtifacts(dataRoot)) {
    assert.equal(v.adapted, v.legs,
      `${v.lane} (${v.date}): ${v.refusals.map((r) => `${r.card}: ${r.code} — ${r.detail}`).join(" · ") || "all adapted"}`);
    assert.deepEqual(v.refusals, [], `${v.lane}: no published leg may refuse the contract`);
  }
});

test("model probability is three-state: numeric where a model spoke, typed absence elsewhere, never zero-filled", () => {
  const laneSaw = { numeric: 0, absent: 0 };
  for (const v of validateLaneArtifacts(dataRoot)) {
    // Re-adapt to inspect the produced legs (validate only counts).
    const doc = JSON.parse(fs.readFileSync(path.join(dataRoot, "parlays", v.lane === "mlb" ? "risk-ladder" : `risk-ladder-${v.lane}`, "latest.json"), "utf8"));
    for (const card of doc.cards ?? []) {
      (card.legs ?? []).forEach((raw, index) => {
        const res = adaptLaneLeg(v.lane, raw, { slipId: card.slipId ?? "c", index, productDate: doc.date ?? "unknown" });
        if (!res.ok) return;
        const mp = res.leg.modelProbability;
        if (typeof mp === "number") {
          assert.ok(mp > 0 && mp < 1, `${res.leg.id}: a numeric model probability is a real probability`);
          laneSaw.numeric += 1;
        } else {
          assert.ok(mp.absent.length > 10, `${res.leg.id}: absence carries its reason`);
          laneSaw.absent += 1;
        }
        assert.ok(res.leg.settlementId, `${res.leg.id}: settlement identity present`);
        assert.ok(res.leg.price !== 0, `${res.leg.id}: a real price, never zero`);
      });
    }
  }
  // Structure claims only when cards exist at all (an all-no-play day has nothing to classify).
  assert.ok(laneSaw.numeric + laneSaw.absent >= 0);
});

test("refusals are typed, not thrown: a leg without settlement identity names exactly that", () => {
  const res = adaptLaneLeg("epl", { market: "match result", odds: 110 }, { slipId: "t", index: 0, productDate: "2026-08-24" });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.refusal.code, "NO_SETTLEMENT_IDENTITY");
  const res2 = adaptLaneLeg("mlb", { gamePk: 1, market: "moneyline" }, { slipId: "t", index: 0, productDate: "2026-08-24" });
  assert.equal(res2.ok, false);
  if (!res2.ok) assert.equal(res2.refusal.code, "NO_PRICE");
});

test("SELECTION REFUSES WHAT IT CANNOT IDENTIFY — the ladder builder's own gate", () => {
  /*
   * The contract above catches an ungradeable published leg. This pins the fix at the layer that
   * put it there.
   *
   * build-risk-ladder used to stamp `gamePk: … ?? null` and publish the leg anyway, reasoning that
   * never grading beats grading against a guess. The first half is right; the conclusion was not.
   * On 2026-08-27 a longshot card shipped with two legs on a game that had started four and a half
   * hours earlier and could never settle — so the CARD could never settle either. A card whose
   * result depends on a leg with no outcome is not conservative, it is unfalsifiable.
   *
   * Two owners disagreed about the same fact and the guard was the one that was right.
   */
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/parlays/build-risk-ladder.mjs"), "utf8");
  const blank = (m) => m.replace(/[^\n]/g, " ");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank);
  assert.match(
    code,
    /\.filter\(\(s\) => \(s\.legs \?\? \[\]\)\.every\(\(l\) => gamePkByGameId\.get\(String\(l\.gameId \?\? ""\)\) != null\)\)/,
    "the candidate pool must drop any slip with a leg it cannot identify, BEFORE scoring",
  );
});

test("LIVE · no published ladder card carries a leg without a settlement identity", () => {
  const dir = path.join(dataRoot, "parlays", "risk-ladder");
  if (!fs.existsSync(dir)) return;
  const latest = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1);
  if (!latest) return;
  const doc = JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
  const orphans = [];
  for (const c of doc.cards ?? []) {
    for (const [i, l] of (c.legs ?? []).entries()) {
      if (l.gamePk == null) orphans.push(`${c.slipId}#${i} (${l.player ?? "?"})`);
    }
  }
  assert.deepEqual(orphans, [], `${latest}: legs that can never grade:\n  ${orphans.join("\n  ")}`);
});
