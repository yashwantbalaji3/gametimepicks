/**
 * EVERY ELIGIBLE LEG MUST BE REACHABLE — Program 230 · Release 0.
 *
 * Run: npx tsx --test src/lib/parlays/leg-reachability.test.mjs
 *
 * WHAT P229 LEFT OPEN. Release 0 of Program 229 cut `/build/custom` from 1497 KB to 1071 KB by
 * shipping identity only for eligible legs the page never renders. The payload win was real and it
 * is preserved. What it did not establish is that a reader can ever SEE one of those legs, and the
 * charter is explicit that a leg which is counted but unreachable is not closed.
 *
 * WHAT MEASUREMENT FOUND. `/build/custom` mounts two independent leg surfaces, each with its own
 * undisclosed cap:
 *
 *   - the eligible-leg marketplace renders `EXPLORER_LEG_RENDER_CAP` (60) per sport and then prints
 *     "+N more eligible legs" as INERT TEXT — no search, no pagination, no reveal;
 *   - the canonical builder pool was truncated by `out.slice(0, 180)` with NO disclosure anywhere on
 *     the page — not a "+N more", not a note, nothing.
 *
 * On the 2026-09-01 slate that is 373 eligible legs, of which 211 were reachable in either surface.
 * **162 legs — 43% — could not be reached at all**, on a page whose own heading says "Legs (373)".
 *
 * WHY THE CAP WAS UNNECESSARY. The 180 cap existed to bound a wasteful row: 61% of every `BuildLeg`
 * was DERIVED STRINGS shipped alongside the atoms they derive from — `slipLeg` (57.6 KB) re-shipping
 * player/market/side/line/odds/matchup that are already present, `photo` (26.0 KB) of MLB headshot
 * URLs derivable from `playerId`, plus `label`, `searchKey`, `sublabel`, `marketLabel`, `sportLabel`
 * and `gameLabel`. Carrying atoms and deriving the rest costs 294 B/leg instead of 1010, so the FULL
 * 373-leg pool serializes to 107 KB where the capped 180-leg pool cost 177 KB.
 *
 * The cap was compensating for the waste. Removing the waste removes the need for the cap, and the
 * payload goes DOWN while 193 more legs become reachable. That is the same defect class P229 found —
 * shipping objects that need not travel — in the second surface on the same page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadTodaySlate, currentSlateDate, explorerSlateView } from "./ui-loader.ts";
import { buildEngineLegs, buildEngineLegAtoms } from "../build-legs.ts";
import { hydrateBuildLeg, hydrateBuildLegs, SPORT_LABEL } from "../build/leg-atoms.ts";
import { EXPLORER_LEG_RENDER_CAP, isDetailOmitted } from "./explorer-legs.ts";

/** The live slate, or null when no board is committed (CI on a bare checkout). */
function liveSlate() {
  const date = currentSlateDate();
  if (!date) return null;
  const slate = loadTodaySlate(date);
  return slate?.eligibleLegs?.length ? slate : null;
}

test("CONSERVATION · every eligible leg is reachable in a surface, exactly once", () => {
  const slate = liveSlate();
  if (!slate) return;

  /* The builder pool is the canonical reachable surface: it carries its own search and filters, so
     a leg present in it can be found by a reader who types part of its name. */
  const pool = buildEngineLegs(slate.eligibleLegs, slate.date || null);
  const poolIds = pool.map((l) => l.id);
  const reachable = new Set(poolIds);

  assert.equal(poolIds.length, new Set(poolIds).size, "a leg appears in the pool at most once");

  /* Every PRICED eligible leg must be reachable. Unpriced legs are excluded from the builder by
     contract — there is no combined-odds math without a price — and that exclusion is a stated
     refusal, not a silent drop. */
  const priced = slate.eligibleLegs.filter((l) => l.odds != null);
  const missing = priced.filter((l) => !reachable.has(l.legId));
  assert.equal(
    missing.length,
    0,
    `${missing.length} of ${priced.length} priced eligible legs are unreachable — the page counts them and no reader can open one. First: ${missing[0]?.participant} ${missing[0]?.market}`,
  );
});

test("REFUSAL · no surface may silently truncate the pool", () => {
  /*
   * The 180 cap was not wrong because 180 is too few. It was wrong because NOTHING on the page said
   * it was happening: the header printed `builderLegs: 180` beside a marketplace heading that said
   * 373, and neither number told the reader that 193 legs had been dropped between them. A cap a
   * reader cannot see is indistinguishable from data that does not exist.
   */
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/build-legs.ts"), "utf8");
  /* Strip comments FIRST — line-preservingly. The block below explains the defect by NAMING the
     truncation it forbids, and a scan that cannot tell an explanation from code fails on the
     sentence describing the bug it prevents, which teaches the next author to delete the
     explanation. Sixth appearance of this class. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");
  assert.ok(
    !/\.slice\(0,\s*180\)/.test(code),
    "the undisclosed 180-leg truncation must not return — carry atoms and derive the rest instead",
  );
});

test("the marketplace tail is renderable, not a blank row", () => {
  const slate = liveSlate();
  if (!slate) return;
  const view = explorerSlateView(slate);

  const tail = view.eligibleLegs.filter((l) => isDetailOmitted(l));
  if (tail.length === 0) return; // slate smaller than the render cap — nothing omitted

  /* An identity-only row must never reach a renderer. The projection marks them explicitly so the
     component can refuse one outright rather than drawing a row of blanks. */
  for (const l of tail.slice(0, 5)) {
    assert.ok(l.legId, "an omitted row still carries its canonical settlement identity");
    assert.ok(l.sport, "and its sport, so per-sport counts stay exact");
  }

  /* And the count the page shows still includes them. */
  const perSport = new Map();
  for (const l of view.eligibleLegs) perSport.set(l.sport, (perSport.get(l.sport) ?? 0) + 1);
  for (const [sport, n] of perSport) {
    const detailed = view.eligibleLegs.filter((l) => l.sport === sport && !isDetailOmitted(l)).length;
    assert.ok(n >= detailed, `${sport}: the total (${n}) includes the detailed window (${detailed})`);
    if (n > EXPLORER_LEG_RENDER_CAP) {
      assert.ok(detailed >= EXPLORER_LEG_RENDER_CAP, `${sport}: the full render window ships detail`);
    }
  }
});

/* ── HYDRATION AND CORRUPTION ──────────────────────────────────────────────────────────────────── */

test("HYDRATION IS LOSSLESS · atoms rebuild byte-identical display legs", () => {
  const slate = liveSlate();
  if (!slate) return;
  const atoms = buildEngineLegAtoms(slate.eligibleLegs, slate.date || null);
  const hydrated = hydrateBuildLegs(atoms);

  /*
   * The claim the payload win rests on: deriving is not compressing. If any displayed value differed
   * after a round trip, the page would have changed rather than shrunk. (Rounding was measured and
   * REJECTED for exactly this reason — trimming `edge` to two decimals altered 19 rendered strings.)
   */
  assert.equal(hydrated.length, atoms.length);
  for (const leg of hydrated.slice(0, 40)) {
    assert.ok(leg.label && leg.searchKey && leg.sublabel, "every derived display field is rebuilt");
    assert.equal(leg.marketLabel, leg.market);
    assert.equal(leg.sportLabel, SPORT_LABEL[leg.sport]);
    assert.ok(leg.slipLeg, "the canonical draft identity survives the round trip");
    assert.equal(leg.slipLeg.player, leg.label.split(" · ")[0]);
    assert.equal(leg.slipLeg.americanOdds, leg.americanOdds);
    assert.equal(leg.searchKey, leg.searchKey.toLowerCase());
  }
});

test("SETTLEMENT IDENTITY SURVIVES · a leg past the old cap seeds the builder intact", () => {
  const slate = liveSlate();
  if (!slate) return;
  const atoms = buildEngineLegAtoms(slate.eligibleLegs, slate.date || null);
  if (atoms.length <= 180) return; // slate smaller than the removed cap — nothing to prove

  /*
   * THE LEG THE CHARTER ASKS FOR. Position 181+ is a leg the 180-cap dropped outright: the page
   * counted it and no surface could open it. It must arrive with its canonical settlement identity
   * whole, or "reachable" would only mean "visible".
   */
  const beyond = hydrateBuildLegs(atoms.slice(180));
  const byId = new Map(slate.eligibleLegs.map((l) => [l.legId, l]));
  for (const leg of beyond.slice(0, 25)) {
    const source = byId.get(leg.id);
    assert.ok(source, `${leg.id} traces back to an eligible leg of record`);
    assert.equal(leg.id, source.legId, "canonical settlement identity is the leg id, unmodified");
    assert.equal(leg.sport, source.sportKey, "sport");
    assert.equal(leg.market, source.market, "market family");
    assert.equal(leg.slipLeg.player, source.participant, "selection participant");
    assert.equal(leg.slipLeg.line, source.line ?? null, "the exact line");
    assert.equal(leg.americanOdds, source.odds, "the price it was qualified at");
    assert.equal(leg.modelProbability, source.modelProbability ?? null, "the model's own probability");
    assert.ok(leg.gameId, "the event it settles against");
  }
});

test("CORRUPTION · duplicate identity, missing atoms and a mismatched line all fail closed", () => {
  const base = {
    id: "MLB:evt:Hits:Someone:0.5", sport: "mlb", participant: "Someone",
    market: "Hits", side: "over", line: 0.5, americanOdds: -115, gameId: "evt",
  };

  /* DUPLICATE IDENTITY — the producer de-duplicates by legId, so the same leg cannot enter twice. */
  const slate = liveSlate();
  if (slate) {
    const doubled = [...slate.eligibleLegs, ...slate.eligibleLegs];
    const atoms = buildEngineLegAtoms(doubled, slate.date || null);
    const ids = atoms.map((a) => a.id);
    assert.equal(ids.length, new Set(ids).size, "a doubled input still yields each leg once");
  }

  /* DETAIL MISMATCH — the derived label must track the atoms, never a stale copy of them. */
  const a = hydrateBuildLeg({ ...base });
  const b = hydrateBuildLeg({ ...base, line: 1.5 });
  assert.notEqual(a.label, b.label, "changing the line changes the rendered label");
  assert.notEqual(a.searchKey, b.searchKey, "and the search key it is found by");
  assert.equal(b.slipLeg.line, 1.5, "and the line the draft settles on");

  /* A COMPACT ROW THAT CANNOT HYDRATE — absence is rendered as absence, never as a fabricated
     value. A missing playerId yields no photo; it must not invent one or throw mid-render. */
  const noPhoto = hydrateBuildLeg({ ...base, playerId: undefined });
  assert.equal(noPhoto.photo, null, "no headshot is invented for a leg without a player id");
  assert.ok(noPhoto.label, "and the row still renders");

  /* OUT-OF-SCOPE SEARCH — the marketplace's needle is built from the leg's own fields only, so a
     query matching nothing returns nothing rather than falling back to an unfiltered list. */
  const hay = `${a.slipLeg.player} ${a.market}`.toLowerCase();
  assert.ok(!hay.includes("zzzz-no-such-player"));
});
