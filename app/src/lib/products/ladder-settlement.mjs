/**
 * SETTLE THE CARDS THAT ACTUALLY EXIST.
 *
 * `settle-mlb-player-props.mjs` runs every night and grades `mr-dub/daily-portfolio.json`. That file
 * has held four zero-leg lanes for months, so the job grades nothing and exits 0. Meanwhile the two
 * artifacts that DO hold cards — the Bank Builder ladder and the Moonshot lane — are opened by no
 * settler at all. Both carried cards frozen on 2026-08-17 that were still pending on 2026-09-05,
 * nineteen days after their games went final.
 *
 * This module settles those two stores. It is written as a function over an injected root and an
 * injected box-score source so the replay harness can exercise the real code against a disposable
 * fixture repo with no network and no chance of touching production data.
 *
 * WHY IT WRITES A SEPARATE STORE RATHER THAN THE CARDS THEMSELVES.
 *
 * `build-mr-dub-ledger.mjs` reads both of these artifacts and writes `mr-dub/portfolio.json` — the
 * protected paper bankroll, md5 affe6b21071f2b3be96bb2774eb347c3. Grading the 2026-08-17 cards in
 * place would therefore restate a financial record that predates this work, on the next ledger
 * rebuild, as a side effect. The instruction is explicit that protected history stays byte-identical,
 * so settlement is recorded in a PROSPECTIVE lifecycle store that references the historical cards by
 * identity and never mutates them. The outcomes are real and computed from official box scores; what
 * is withheld is the retroactive money write, and the blocked write is named in the receipt.
 *
 * WHAT IT WILL NOT DO:
 *   · It never writes protected money, and never mutates the two card stores it reads.
 *   · It never re-grades a decided card (`settlementIsNew`), so a rerun is a no-op and a source that
 *     goes quiet cannot un-settle history.
 *   · It never grades a leg it cannot verify. Not final, player absent, market unsupported — all
 *     hold. The card stays pending and says why.
 */
import fs from "node:fs";
import path from "node:path";
import { LEG, CARD, TRANSITION, gradeCard, nextPosition, cardIdentity, settlementIsNew } from "./lifecycle.mjs";
import { gradeLeg, gamePkOf, playerOf, isSettleableMarket, normName } from "./mlb-prop-grading.mjs";

export const LADDER_REL = ["methodology", "launch", "dual-bank-builder-active.json"];
export const MOONSHOT_REL = ["moonshot-lane", "active.json"];
/** Bank Builder's ladder is five rungs; Moonshot's is three. Clearing the last one completes a cycle
 *  rather than inventing a sixth step — see nextPosition. */
export const MAX_STEP = Object.freeze({ "bank-builder": 5, moonshot: 3 });

/** A box source may hand back a Map (the live fetcher) or a plain object (a recorded fixture).
 *  Accept both rather than making every caller build the same shape. */
function statsFor(box, player) {
  const key = normName(player);
  const by = box?.byPlayer;
  if (!by) return null;
  return (typeof by.get === "function" ? by.get(key) : by[key]) ?? null;
}

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** Where settled outcomes go. Dated, plus a `latest` the pages read. */
export const LIFECYCLE_DIR = ["products", "lifecycle"];

/**
 * WHAT MAKES THIS IDEMPOTENT.
 *
 * The settler does not mutate the cards it grades, so it cannot use them to remember what it has
 * already done — a second run would re-read the same pending card and settle it again, advancing a
 * ladder twice off one result. The prospective ledger carries its own cumulative index instead:
 * card identity → the outcome first recorded for it. A card in that index is finished, and no later
 * run re-grades it, including one whose feed now disagrees.
 */
function priorIndex(root) {
  const prev = readJson(path.join(root, ...LIFECYCLE_DIR, "latest.json"));
  const idx = { ...(prev?.settledIndex ?? {}) };
  for (const c of prev?.cards ?? []) {
    if (c.applied && c.id && !idx[c.id]) idx[c.id] = { result: c.result, settledAt: prev.generatedAt };
  }
  return idx;
}

/**
 * Grade every leg of one card. Returns the per-leg outcomes plus a note for anything not decided,
 * so a pending card can explain itself instead of just staying pending.
 */
async function gradeLegs(legs, fetchBox) {
  const out = [];
  for (const leg of legs ?? []) {
    const market = leg.marketType ?? leg.market;
    if (!isSettleableMarket(market)) {
      out.push({ leg, result: LEG.UNAVAILABLE, actual: null, note: `market ${market} has no settlement rule — this leg cannot be graded` });
      continue;
    }
    const gamePk = gamePkOf(leg);
    if (!gamePk) { out.push({ leg, result: LEG.UNAVAILABLE, actual: null, note: "leg carries no game identity" }); continue; }
    const box = await fetchBox(gamePk);
    const graded = gradeLeg({
      market, side: leg.side, line: leg.line,
      stats: statsFor(box, playerOf(leg)),
      gameIsFinal: Boolean(box?.final),
    });
    out.push({ leg, gamePk, ...graded });
  }
  return out;
}
/** Write graded outcomes back onto a leg without disturbing anything else it carries. */
function stampLeg(leg, g, nowIso) {
  leg.settlement = {
    ...(leg.settlement ?? {}),
    result: g.result, official: g.actual, source: "mlb_stats_api",
    ...(g.gamePk ? { gamePk: g.gamePk } : {}), ...(g.note ? { note: g.note } : {}),
    settledAt: nowIso,
  };
}

/**
 * Settle the Bank Builder ladder. Each lane holds `steps[]`; the pending one is the live rung.
 */
async function settleLadder(root, fetchBox, nowIso, changes, prior) {
  const file = path.join(root, ...LADDER_REL);
  const doc = readJson(file);
  const run = doc?.run;
  if (!run) return null;
  const cycle = Number(run.cycle ?? 1);

  for (const laneKey of ["laneA", "laneB"]) {
    const lane = run[laneKey];
    if (!lane) continue;
    const laneLetter = laneKey.slice(-1);
    for (const step of lane.steps ?? []) {
      const id = cardIdentity({ product: "bank-builder", lane: laneLetter, cycle, step: step.step, slateDate: step.slateDate ?? doc.run.date ?? "unknown" });
      const already = prior[id];
      if (already) {
        changes.push({ product: "bank-builder", lane: laneLetter, id, result: already.result, transition: TRANSITION.HOLD,
          applied: false, reason: `already settled ${already.result} on ${already.settledAt} — not re-graded`, legs: [] });
        continue;
      }
      const graded = await gradeLegs(step.legs ?? [], fetchBox);
      const result = gradeCard(graded.map((g) => g.result));
      if (!settlementIsNew(step.result ?? CARD.PENDING, result)) {
        changes.push({ product: "bank-builder", lane: laneLetter, id, result, transition: TRANSITION.HOLD, applied: false,
          reason: graded.find((g) => g.note)?.note ?? "no leg outcome is final yet", legs: graded.map(summarise) });
        continue;
      }
      graded.forEach((g) => stampLeg(g.leg, g, nowIso));
      const pos = nextPosition({ cycle, step: step.step, maxStep: MAX_STEP["bank-builder"] }, result);
      step.result = result;
      step.status = "settled";
      step.settledAt = nowIso;
      step.settlementSource = "MLB Stats API official box score (feed/live), joined by gamePk";
      step.cardIdentity = id;
      changes.push({ product: "bank-builder", lane: laneLetter, id, sourceCardId: step.cardId ?? null,
        result, transition: pos.transition, applied: true,
        reason: pos.reason, nextCycle: pos.cycle, nextStep: pos.step, legs: graded.map(summarise) });
      // The ladder's own position follows the settled rung.
      run.cycle = pos.cycle;
      run.currentStep = pos.step;
    }
  }
  return { file, doc };
}

/** Settle the Moonshot lane. Same contract, different artifact shape (`ladder[]` of steps). */
async function settleMoonshot(root, fetchBox, nowIso, changes, prior) {
  const file = path.join(root, ...MOONSHOT_REL);
  const doc = readJson(file);
  if (!doc) return null;
  const cycle = Number(doc.cycle ?? 1);
  for (const step of doc.ladder ?? []) {
    const card = step.card;
    if (!card) continue;
    const id = cardIdentity({ product: "moonshot", lane: "a", cycle, step: step.step, slateDate: card.slateDate ?? (doc.id ?? "").slice(-10) ?? "unknown" });
    const already = prior[id];
    if (already) {
      changes.push({ product: "moonshot", lane: "a", id, result: already.result, transition: TRANSITION.HOLD,
        applied: false, reason: `already settled ${already.result} on ${already.settledAt} — not re-graded`, legs: [] });
      continue;
    }
    const graded = await gradeLegs(card.legs ?? [], fetchBox);
    const result = gradeCard(graded.map((g) => g.result));
    if (!settlementIsNew(card.result ?? (step.status === "active" ? CARD.PENDING : card.result), result)) {
      changes.push({ product: "moonshot", lane: "a", id, result, transition: TRANSITION.HOLD, applied: false,
        reason: graded.find((g) => g.note)?.note ?? "already settled or nothing final yet", legs: graded.map(summarise) });
      continue;
    }
    graded.forEach((g) => stampLeg(g.leg, g, nowIso));
    const pos = nextPosition({ cycle, step: step.step, maxStep: MAX_STEP.moonshot }, result);
    card.result = result;
    step.status = "settled";
    step.settledAt = nowIso;
    step.cardIdentity = id;
    /* The lane artifact's own id, carried so a reader of this ledger can point at the exact card it
     * graded without re-deriving an identity. The settler never rewrites that artifact, so this is
     * the only link between the two. */
    changes.push({ product: "moonshot", lane: "a", id, sourceCardId: card.cardId ?? null,
      result, transition: pos.transition, applied: true,
      reason: pos.reason, nextCycle: pos.cycle, nextStep: pos.step, legs: graded.map(summarise) });
    doc.cycle = pos.cycle;
    doc.currentStep = pos.step;
    if (pos.transition === TRANSITION.ADVANCE) {
      const nxt = (doc.ladder ?? []).find((s) => s.step === pos.step);
      if (nxt && nxt.status === "upcoming") nxt.status = "awaiting-card";
    }
  }
  return { file, doc };
}

/** The ladder position each product ends on, so a page can render "cycle 4 · step 1" without
 *  replaying the card list itself. */
function positionsOf(changes) {
  const out = {};
  for (const c of changes) {
    if (!c.applied) continue;
    const key = c.product === "bank-builder" ? `bank-builder-lane-${c.lane}` : c.product;
    out[key] = { cycle: c.nextCycle, step: c.nextStep, afterCard: c.id, result: c.result, transition: c.transition };
  }
  return out;
}

const summarise = (g) => ({
  player: playerOf(g.leg), market: g.leg.marketType ?? g.leg.market,
  side: g.leg.side, line: g.leg.line, actual: g.actual, result: g.result, ...(g.note ? { note: g.note } : {}),
});

/**
 * Settle both product stores under `root`.
 *
 * @param {object}   o
 * @param {string}   o.root      public/data root — a temp fixture in tests, the real tree in prod
 * @param {Function} o.fetchBox  async (gamePk) => { final: boolean, byPlayer: Map|object }
 * @param {string}   o.nowIso    injected clock; never read from the wall here
 * @param {boolean}  o.apply     false = decide and report, write nothing
 */
export async function settleProductLadders({ root, fetchBox, nowIso, apply = false }) {
  const changes = [];
  const prior = priorIndex(root);
  const ladder = await settleLadder(root, fetchBox, nowIso, changes, prior);
  const moonshot = await settleMoonshot(root, fetchBox, nowIso, changes, prior);
  const applied = changes.filter((c) => c.applied);
  const ledger = {
    schemaVersion: 1,
    artifact: "product-lifecycle-settlement",
    generatedAt: nowIso,
    settled: applied.length,
    held: changes.length - applied.length,
    stores: { bankBuilder: Boolean(ladder), moonshot: Boolean(moonshot) },
    /* Named so a reader is never left guessing why a graded card did not move the bankroll. */
    withheldWrite: {
      target: "app/public/data/mr-dub/portfolio.json",
      via: "app/scripts/build-mr-dub-ledger.mjs",
      reason: "that builder derives the protected paper bankroll from these two card stores; grading "
        + "cards frozen on 2026-08-17 in place would restate financial history that predates this "
        + "settlement. Outcomes are recorded here instead; the money record is unchanged.",
    },
    positions: positionsOf(changes),
    settledIndex: { ...prior, ...Object.fromEntries(applied.map((c) => [c.id, { result: c.result, settledAt: nowIso }])) },
    cards: changes,
  };
  if (apply && applied.length > 0) {
    const dir = path.join(root, ...LIFECYCLE_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const body = JSON.stringify(ledger, null, 2) + "\n";
    fs.writeFileSync(path.join(dir, `${nowIso.slice(0, 10)}.json`), body);
    fs.writeFileSync(path.join(dir, "latest.json"), body);
  }
  return ledger;
}
