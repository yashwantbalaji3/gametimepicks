/**
 * NBA game-winner tiers, step 1 (docs/LEVEL_A_NBA_GAME_WINNER_TIERING_RULE.md §9): the pure rule against a FIXTURE
 * display accessor. The NBA legs are REAL (today's committed public lane, through the Level A leg gates), so the
 * provenance cross-check runs against real receipt hashes; every probability below is a FIXTURE, not a forecast.
 * Run: npx tsx --test src/lib/products/level-a/nba-game-winner-tiers.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  NBA_GAME_WINNER_TIERS_PUBLIC, NBA_GW_POLICY, jointShownFor, NBA_GW_REFUSAL, nbaGameWinnerCopyText, nbaGameWinnerLeg, nbaGameWinnerTiers, nbaGameWinnerTiersEnabled, recordableNbaGameWinnerCards,
} from "./nba-game-winner-tiers.mjs";
import { LEVEL_A_SUGGESTIONS_PUBLIC } from "./model.mjs";
import { nbaSelections } from "./sources.mjs";
import { levelALeg, tierForJoint } from "./suggestions.mjs";

const REPO = path.resolve(process.cwd(), "..");
const laneDir = path.join(REPO, "app/public/data/nba/experimental-public");
const DAY = fs.readdirSync(laneDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1).slice(0, 10);
/** REAL NBA Level A legs for the latest lane day, evaluated well before its first tip. */
const NOW = new Date(Date.parse(`${DAY}T12:00:00Z`) - 3600_000).toISOString();
const REAL = nbaSelections({ repoRoot: REPO, date: DAY }).selections.map((s) => levelALeg(s, { now: NOW, productDay: DAY })).filter((r) => r.ok).map((r) => r.leg);
const LANE = JSON.parse(fs.readFileSync(path.join(laneDir, `${DAY}.json`), "utf8"));
/** The side's own frozen receipt, from the same lane game the side was read from. */
const receiptOf = (eventId) => LANE.games.find((g) => String(g.providerEventId) === String(eventId))?.receipt ?? null;
const legOf = (l, d) => nbaGameWinnerLeg(l, d, receiptOf(l.eventId));
const LABEL = "FIXTURE label (step 2 passes the display's ELO_WIN_PROBABILITY_LABEL)";
/** FIXTURE accessor: the given home-win probability per game, with the leg's own provenance. */
const fixtureAccessor = (pHomeByEvent, o = {}) => (eventId) => {
  const leg = REAL.find((l) => l.eventId === String(eventId));
  const p = pHomeByEvent[eventId];
  if (p == null || !leg) return null;
  return { eventId: String(eventId), pHome: p, shown: { home: `${(p * 100).toFixed(1)}%`, away: `${((1 - p) * 100).toFixed(1)}%` }, decimals: 1, frozenAt: leg.forecast.stampedAt, payloadSha256: receiptOf(eventId)?.payloadSha256, label: LABEL, source: "FIXTURE display", ...o };
};
/** A FIXTURE pHome that makes each real leg's official side the favourite at `p`. */
const favour = (legs, ps) => Object.fromEntries(legs.map((l, i) => [l.eventId, l.selection.code === "home" ? ps[i] : 1 - ps[i]]));

test("the real lane gives enough NBA game-winner legs to exercise the rule", () => {
  assert.ok(REAL.length >= 5, `${DAY}: ${REAL.length} NBA legs`);
  for (const l of REAL) assert.match(receiptOf(l.eventId)?.payloadSha256 ?? "", /^[0-9a-f]{64}$/, `${l.eventId}: the side's own receipt hash, for the §1.4 cross-check`);
});

test("SWITCH: its own committed constant, default false, separate from the Level A switch; only \"1\" overrides", () => {
  assert.equal(NBA_GAME_WINNER_TIERS_PUBLIC, false);
  assert.equal(nbaGameWinnerTiersEnabled({}), false);
  assert.equal(nbaGameWinnerTiersEnabled({ NEXT_PUBLIC_NBA_GAME_WINNER_TIERS: "1" }), true);
  assert.equal(nbaGameWinnerTiersEnabled({ NEXT_PUBLIC_NBA_GAME_WINNER_TIERS: "true" }), false);
  assert.equal(LEVEL_A_SUGGESTIONS_PUBLIC, true, "Level A being public does not open NBA tiers");
});

test("LEG REFUSALS: no published probability, provenance mismatch, side disagreement, bad value, not NBA game-winner", () => {
  const l = REAL[0];
  const p = l.selection.code === "home" ? 0.7 : 0.3;
  const d = fixtureAccessor({ [l.eventId]: p })(l.eventId);
  assert.equal(legOf(l, d).ok, true);
  assert.equal(legOf(l, d).leg.probability, 0.7);
  assert.equal(legOf(l, null).code, "NO_PUBLISHED_PROBABILITY");
  assert.equal(NBA_GW_REFUSAL.NO_PUBLISHED_PROBABILITY, "Untiered: no published NBA win probability", "the same words the side-only suggestion already shows");
  assert.equal(legOf(l, { ...d, frozenAt: "2026-01-01T00:00:00Z" }).code, "PROVENANCE_MISMATCH");
  assert.equal(legOf(l, { ...d, payloadSha256: "0".repeat(64) }).code, "PROVENANCE_MISMATCH");
  assert.equal(legOf(l, { ...d, eventId: "999" }).code, "PROVENANCE_MISMATCH");
  assert.equal(nbaGameWinnerLeg(l, d, null).code, "PROVENANCE_MISMATCH", "no receipt for the side: nothing to cross-check, so no tier");
  assert.equal(legOf(l, { ...d, pHome: 1 - p }).code, "SIDE_DISAGREES", "never a card against the official side");
  assert.equal(legOf(l, { ...d, pHome: 1.2 }).code, "BAD_PROBABILITY");
  assert.equal(legOf({ ...l, sport: "epl", market: "1x2" }, d).code, "NOT_NBA_GAME_WINNER");
  assert.equal(legOf({ ...l, market: "spread" }, d).code, "NOT_NBA_GAME_WINNER", "spreads, totals and props are never legs");
});

test("ONE SOURCE: display OFF removes every tier; a gated game is untiered; both ON tiers", () => {
  const legs = REAL.slice(0, 5);
  const on = favour(legs, [0.8, 0.78, 0.7, 0.65, 0.6]);
  const all = nbaGameWinnerTiers({ receiptOf, legs, accessor: fixtureAccessor(on), enabled: true });
  assert.ok(all.tiers.some((t) => t.card), "both switches on: tiers exist");
  const off = nbaGameWinnerTiers({ receiptOf, legs, accessor: () => null, enabled: true });
  assert.deepEqual(off.tiers.map((t) => t.card), [null, null, null, null], "display OFF → no tier, with no other change");
  assert.ok(off.untiered.every((u) => u.code === "NO_PUBLISHED_PROBABILITY"));
  const gated = { ...on }; delete gated[legs[0].eventId];
  const g = nbaGameWinnerTiers({ receiptOf, legs, accessor: fixtureAccessor(gated), enabled: true });
  assert.ok(g.untiered.some((u) => u.leg.eventId === legs[0].eventId && u.code === "NO_PUBLISHED_PROBABILITY"));
  for (const t of g.tiers) if (t.card) assert.ok(t.card.legs.every((l) => l.eventId !== legs[0].eventId), "the gated game is in no card");
  const threw = nbaGameWinnerTiers({ receiptOf, legs, accessor: () => { throw new Error("display unavailable"); }, enabled: true });
  assert.deepEqual(threw.tiers.map((t) => t.card), [null, null, null, null], "an accessor failure is no probability, never a guess");
});

test("BANDS: D2 on 1/joint; joint above 0.667 is untiered and said aloud; highest joint wins; ties are deterministic", () => {
  const legs = REAL.slice(0, 4);
  const b = nbaGameWinnerTiers({ receiptOf, legs, accessor: fixtureAccessor(favour(legs, [0.9, 0.85, 0.75, 0.75])), enabled: true });
  for (const t of b.tiers) if (t.card) {
    assert.equal(t.card.tier, t.tier);
    assert.equal(tierForJoint(t.card.jointProbability), t.tier, "the tier is exactly the D2 band of the joint");
    assert.ok(t.card.legs.length >= 2 && t.card.legs.length <= { low: 2, medium: 3, high: 4, longshot: 5 }[t.tier]);
    assert.equal(new Set(t.card.legs.map((l) => l.eventId)).size, t.card.legs.length, "distinct games");
  }
  assert.ok(b.shorterThanLow > 0, "0.9 × 0.85 = 0.765 is shorter than Low");
  const low = b.tiers.find((t) => t.tier === "low");
  if (!low.card) assert.match(low.reason, /shorter than the Low band, so not tiered/);
  assert.equal(low.card?.jointProbability ?? null, low.card ? Math.max(...[[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]].map(([i, j]) => [0.9, 0.85, 0.75, 0.75][i] * [0.9, 0.85, 0.75, 0.75][j]).filter((x) => tierForJoint(x) === "low")) : null);
  const tie = nbaGameWinnerTiers({ receiptOf, legs, accessor: fixtureAccessor(favour(legs, [0.75, 0.75, 0.75, 0.75])), enabled: true });
  const again = nbaGameWinnerTiers({ receiptOf, legs: [...legs].reverse(), accessor: fixtureAccessor(favour(legs, [0.75, 0.75, 0.75, 0.75])), enabled: true });
  assert.deepEqual(tie.tiers.map((t) => t.card?.legs.map((l) => l.eventId).sort()), again.tiers.map((t) => t.card?.legs.map((l) => l.eventId).sort()), "input order never changes the pick");
  const one = nbaGameWinnerTiers({ receiptOf, legs: legs.slice(0, 1), accessor: fixtureAccessor(favour(legs, [0.8])), enabled: true });
  for (const t of one.tiers) assert.match(t.reason, /needs 2 games with a published win probability; only 1 has one/);
});

test("NBA-ONLY, ONE LEG PER GAME: mixed input never yields a mixed card; a repeated game counts once", () => {
  const legs = REAL.slice(0, 3);
  const acc = fixtureAccessor(favour(legs, [0.8, 0.7, 0.6]));
  const mixed = nbaGameWinnerTiers({ receiptOf, legs: [...legs, { ...legs[0], sport: "mlb", eventId: "777" }, legs[1]], accessor: acc, enabled: true });
  assert.equal(mixed.legs.length, 3);
  for (const t of mixed.tiers) if (t.card) assert.deepEqual(t.card.sports, ["nba"]);
  assert.ok(mixed.untiered.some((u) => u.code === "NOT_NBA_GAME_WINNER"));
});

test("SHOWN: leg % is the display's own text, joint at the display's precision; no price, odds, payout or link; label passed through", () => {
  const legs = REAL.slice(0, 3);
  const acc = fixtureAccessor(favour(legs, [0.812, 0.7, 0.64]));
  const b = nbaGameWinnerTiers({ receiptOf, legs, accessor: acc, enabled: true });
  const cards = b.tiers.map((t) => t.card).filter(Boolean);
  assert.ok(cards.length > 0);
  for (const c of cards) {
    for (const l of c.legs) assert.equal(l.shownPct, acc(l.eventId).shown[l.selection.code], "the shown leg % equals the display's shown %, character for character");
    assert.equal(c.jointShown, jointShownFor(c.jointProbability, c.tier));
    assert.match(c.jointShown, /^\d+\.\d{1,4}%$/, "at least 1 dp, like every Level A card");
    assert.equal(c.label, LABEL, "the display's label, passed through, never rewritten");
    assert.match(c.dependency, /^Assumes the games are independent/);
    assert.equal(c.policy, NBA_GW_POLICY);
    assert.deepEqual([c.priced, c.price, c.payout], [false, null, null]);
    const text = nbaGameWinnerCopyText(c);
    assert.match(text, /assumes the games are independent/);
    assert.ok(text.includes(LABEL));
    assert.doesNotMatch(text + JSON.stringify(c), /https?:\/\/|"(americanOdds|odds|book|ev|edge)":|[+-]\d{3}\b|\$\d/);
  }
});

test("RECORDING: tiered NBA cards are recordable only while the public switch is on", () => {
  const legs = REAL.slice(0, 4);
  const acc = fixtureAccessor(favour(legs, [0.8, 0.78, 0.7, 0.65]));
  const on = nbaGameWinnerTiers({ receiptOf, legs, accessor: acc, enabled: true });
  const off = nbaGameWinnerTiers({ receiptOf, legs, accessor: acc, enabled: false });
  assert.ok(off.tiers.some((t) => t.card), "the rule still evaluates for tests and previews");
  assert.deepEqual(recordableNbaGameWinnerCards(off), [], "recording a card while the switch is OFF is a failure");
  assert.equal(recordableNbaGameWinnerCards(on).length, on.tiers.filter((t) => t.card).length);
  assert.deepEqual(recordableNbaGameWinnerCards(nbaGameWinnerTiers({ receiptOf, legs, accessor: acc })), [], "the default is the committed switch: off");
});

test("SOURCE: the rule reads no receipt probability, simulation, market or file", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "src/lib/products/level-a/nba-game-winner-tiers.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.deepEqual([...src.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]).sort(), ["../../parlays/multi-sport.mjs", "../../parlays/risk-odds-bands.mjs", "./suggestions.mjs"], "band constants and the tier helper only");
  const code = src.replace(/^import .*$/gm, "");
  assert.doesNotMatch(code, /node:fs|readFileSync|\.sim\b|sim\.pHome|\.elo\b|\.market\.|marketPrice|americanOdds|odds|fetch\(/);
  assert.deepEqual([...code.matchAll(/\.market\b/g)].length, 1, "the leg's market is read once, only to require \"winner\"");
});

test("UNCHANGED OUTPUT: the rule adds nothing to the untiered Level A NBA rows (switch OFF or ON)", () => {
  for (const l of REAL) {
    assert.deepEqual(Object.keys(l.forecast).sort(), ["modelId", "owner", "ref", "stampedAt"], `${l.eventId}: no field added to the shared leg`);
    assert.equal(l.probability, null, "the Level A NBA leg stays untiered");
  }
  assert.equal(fs.readFileSync(path.resolve(process.cwd(), "src/lib/products/level-a/sources.mjs"), "utf8").includes("nba-game-winner-tiers"), false, "the readers do not know this rule exists");
});

test("JOINT TEXT AT BAND EDGES: 1 dp like Level A; more decimals only where 1 dp would read as the neighbouring band; the tier never moves", () => {
  for (const j of [0.6666, 0.5001, 0.4999, 0.2501, 0.2499, 0.1431, 0.1429, 0.2212, 0.0935]) {
    const tier = tierForJoint(j);
    const shown = jointShownFor(j, tier);
    assert.equal(shown, `${(j * 100).toFixed(1)}%`, `${j}: the release owner's listed edges read correctly at 1 dp`);
    assert.equal(tierForJoint(Number(shown.slice(0, -1)) / 100), tier, `${j} (${tier}) shows ${shown}`);
  }
  /* Just past an edge, 1 dp would mislead: 0.4987 is Medium (+101) but "49.9%" bands Low; 0.24955 is High (+301) but
     "25.0%" bands Medium. Those cards (only those) get the decimals that keep the text in the card's band. */
  assert.equal(tierForJoint(0.4987), "medium");
  assert.equal(jointShownFor(0.4987, "medium"), "49.87%");
  assert.equal(tierForJoint(0.24955), "high");
  assert.equal(jointShownFor(0.24955, "high"), "24.95%", "2 dp (binary rounding of 24.955 gives 24.95), which bands High");
  assert.equal(tierForJoint(0.2495), "high");
  for (const [lo, hi] of [[0.66, 0.672], [0.495, 0.505], [0.247, 0.253], [0.1415, 0.1445]]) {
    for (let j = lo; j <= hi; j += 0.00001) {
      const tier = tierForJoint(j);
      if (!tier) continue;
      const shown = jointShownFor(j, tier);
      assert.equal(tierForJoint(Number(shown.slice(0, -1)) / 100), tier, `${j.toFixed(5)} (${tier}) shows ${shown}, which bands elsewhere`);
      assert.ok(/^\d+\.\d{1,4}%$/.test(shown));
    }
  }
});
