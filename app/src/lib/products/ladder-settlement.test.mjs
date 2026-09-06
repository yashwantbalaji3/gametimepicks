import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { settleProductLadders, LADDER_REL, MOONSHOT_REL, LIFECYCLE_DIR } from "./ladder-settlement.mjs";
import { CARD, TRANSITION } from "./lifecycle.mjs";

const NOW = "2026-09-06T01:00:00Z";

/** A disposable public/data root. Every write this suite provokes must land inside it. */
function store() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-ladder-"));
  return root;
}
const put = (root, rel, doc) => {
  const p = path.join(root, ...rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(doc, null, 2));
};
const read = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, ...rel), "utf8"));
/** The prospective ledger the settler writes. The card stores it reads stay untouched. */
const ledger = (root) => JSON.parse(fs.readFileSync(path.join(root, ...LIFECYCLE_DIR, "latest.json"), "utf8"));
const pos = (root, key) => ledger(root).positions[key];

/** Recorded box scores. No network: the fetcher is injected and counts its calls. */
function boxSource(games) {
  const calls = [];
  const fetchBox = async (gamePk) => { calls.push(gamePk); return games[gamePk] ?? { final: false, byPlayer: {} }; };
  return { fetchBox, calls };
}
const bat = (name, s) => ({ [name.toLowerCase()]: { batting: s } });

const ladderDoc = (legs, extra = {}) => ({
  run: {
    cycle: 3, currentStep: 1, date: "2026-08-17",
    laneA: { steps: [{ step: 1, status: "pending", result: null, slateDate: "2026-08-17", stake: 100, legs }] },
    laneB: { steps: [] },
    ...extra,
  },
});
const moonDoc = (legs, status = "active") => ({
  id: "moonshot-lane-mlb-2026-08-17", cycle: 1, currentStep: 1,
  ladder: [
    { step: 1, status, stake: 25, card: { cardId: "m-1", slateDate: "2026-08-17", result: null, legs } },
    { step: 2, status: "upcoming", stake: 100 },
  ],
});
const leg = (player, market, side, line, pk = "824320") => ({
  legId: `MLB:${pk}:${market}:${player.replace(/ /g, "_")}:${side}`,
  eventId: pk, participantName: player, marketType: market, side, line,
});

test("a losing leg settles the ladder card and opens the next cycle at step 1", async () => {
  const root = store();
  put(root, LADDER_REL, ladderDoc([leg("Kyle Tucker", "batter_hits", "under", 1.5)]));
  const { fetchBox } = boxSource({ "824320": { final: true, byPlayer: bat("kyle tucker", { hits: 3 }) } });
  const r = await settleProductLadders({ root, fetchBox, nowIso: NOW, apply: true });
  assert.equal(r.settled, 1);
  const c = r.cards[0];
  assert.equal(c.result, CARD.LOST);
  assert.equal(c.transition, TRANSITION.RESTART);
  assert.deepEqual([c.nextCycle, c.nextStep], [4, 1]);
  assert.deepEqual(pos(root, "bank-builder-lane-A"), { cycle: 4, step: 1, afterCard: c.id, result: CARD.LOST, transition: TRANSITION.RESTART });
  assert.equal(ledger(root).cards[0].legs[0].actual, 3, "the official number is recorded");
  // The historical card store is READ, never rewritten — it feeds the protected bankroll.
  assert.equal(read(root, LADDER_REL).run.laneA.steps[0].result, null);
  assert.equal(read(root, LADDER_REL).run.cycle, 3);
});

test("a winning card advances one rung and stays in its cycle", async () => {
  const root = store();
  put(root, LADDER_REL, ladderDoc([leg("Kyle Tucker", "batter_hits", "over", 1.5)]));
  const { fetchBox } = boxSource({ "824320": { final: true, byPlayer: bat("kyle tucker", { hits: 3 }) } });
  const r = await settleProductLadders({ root, fetchBox, nowIso: NOW, apply: true });
  assert.equal(r.cards[0].result, CARD.WON);
  assert.deepEqual([r.cards[0].nextCycle, r.cards[0].nextStep], [3, 2]);
  assert.deepEqual([pos(root, "bank-builder-lane-A").cycle, pos(root, "bank-builder-lane-A").step], [3, 2]);
});

test("REPLAY: three identical runs produce one settlement and identical state", async () => {
  const root = store();
  put(root, LADDER_REL, ladderDoc([leg("Kyle Tucker", "batter_hits", "under", 1.5)]));
  const games = { "824320": { final: true, byPlayer: bat("kyle tucker", { hits: 3 }) } };
  const first = await settleProductLadders({ root, fetchBox: boxSource(games).fetchBox, nowIso: NOW, apply: true });
  const stateAfterFirst = fs.readFileSync(path.join(root, ...LIFECYCLE_DIR, "latest.json"), "utf8");
  const second = await settleProductLadders({ root, fetchBox: boxSource(games).fetchBox, nowIso: "2026-09-07T02:00:00Z", apply: true });
  const third = await settleProductLadders({ root, fetchBox: boxSource(games).fetchBox, nowIso: "2026-09-08T03:00:00Z", apply: true });
  assert.equal(first.settled, 1);
  assert.equal(second.settled, 0, "a second run must settle nothing");
  assert.equal(third.settled, 0);
  // The ledger from the first run still stands: later runs re-derive the same outcome and, finding
  // nothing new, do not rewrite it. The cycle advanced ONCE.
  assert.equal(fs.readFileSync(path.join(root, ...LIFECYCLE_DIR, "latest.json"), "utf8"), stateAfterFirst);
  assert.equal(pos(root, "bank-builder-lane-A").cycle, 4);
});

test("a game that is not final holds, and a later run settles it — one business event", async () => {
  const root = store();
  put(root, LADDER_REL, ladderDoc([leg("Kyle Tucker", "batter_hits", "over", 1.5)]));
  const early = await settleProductLadders({ root, fetchBox: boxSource({ "824320": { final: false, byPlayer: {} } }).fetchBox, nowIso: NOW, apply: true });
  assert.equal(early.settled, 0);
  assert.equal(fs.existsSync(path.join(root, ...LIFECYCLE_DIR, "latest.json")), false, "nothing settled, nothing published");
  const late = await settleProductLadders({ root, fetchBox: boxSource({ "824320": { final: true, byPlayer: bat("kyle tucker", { hits: 2 }) } }).fetchBox, nowIso: NOW, apply: true });
  assert.equal(late.settled, 1);
  assert.equal(pos(root, "bank-builder-lane-A").result, CARD.WON);
});

test("a scratched player holds the card rather than losing it", async () => {
  const root = store();
  put(root, LADDER_REL, ladderDoc([leg("Kyle Tucker", "batter_hits", "over", 1.5)]));
  const r = await settleProductLadders({ root, fetchBox: boxSource({ "824320": { final: true, byPlayer: {} } }).fetchBox, nowIso: NOW, apply: true });
  assert.equal(r.settled, 0);
  assert.equal(r.cards[0].result, CARD.PENDING);
  assert.match(r.cards[0].reason, /scratch/);
});

test("an all-push card is VOID and holds its rung — not a win, not permanent pending", async () => {
  const root = store();
  put(root, LADDER_REL, ladderDoc([leg("Kyle Tucker", "batter_hits", "over", 2)]));
  const r = await settleProductLadders({ root, fetchBox: boxSource({ "824320": { final: true, byPlayer: bat("kyle tucker", { hits: 2 }) } }).fetchBox, nowIso: NOW, apply: true });
  assert.equal(r.cards[0].result, CARD.VOID);
  assert.equal(r.cards[0].transition, TRANSITION.NEUTRAL);
  const p = pos(root, "bank-builder-lane-A");
  assert.equal(p.cycle, 3, "a refund must not advance the cycle");
  assert.equal(p.step, 1, "nor the rung");
  assert.equal(p.result, CARD.VOID, "but the card IS closed, not left pending forever");
});

test("a decided card is never re-graded when the source later disagrees", async () => {
  const root = store();
  put(root, LADDER_REL, ladderDoc([leg("Kyle Tucker", "batter_hits", "over", 1.5)]));
  await settleProductLadders({ root, fetchBox: boxSource({ "824320": { final: true, byPlayer: bat("kyle tucker", { hits: 3 }) } }).fetchBox, nowIso: NOW, apply: true });
  assert.equal(pos(root, "bank-builder-lane-A").result, CARD.WON);
  // A corrected/contradicting feed arrives saying he had 0 hits.
  const r2 = await settleProductLadders({ root, fetchBox: boxSource({ "824320": { final: true, byPlayer: bat("kyle tucker", { hits: 0 }) } }).fetchBox, nowIso: "2026-09-09T00:00:00Z", apply: true });
  assert.equal(r2.settled, 0, "a decided card is not re-graded, whatever the feed now says");
  assert.match(r2.cards[0].reason, /already settled won/);
  assert.equal(pos(root, "bank-builder-lane-A").result, CARD.WON, "history is preserved, not restated");
});

test("an unsettleable market holds the card and names itself, instead of grading blind", async () => {
  const root = store();
  put(root, LADDER_REL, ladderDoc([leg("Kyle Tucker", "batter_home_runs", "over", 0.5)]));
  const { fetchBox, calls } = boxSource({});
  const r = await settleProductLadders({ root, fetchBox, nowIso: NOW, apply: true });
  assert.equal(r.settled, 0);
  assert.match(r.cards[0].reason, /no settlement rule/);
  assert.equal(calls.length, 0, "an ungradeable market must not even be looked up");
});

test("dry run decides everything and writes nothing", async () => {
  const root = store();
  put(root, LADDER_REL, ladderDoc([leg("Kyle Tucker", "batter_hits", "under", 1.5)]));
  const before = fs.readFileSync(path.join(root, ...LADDER_REL), "utf8");
  const r = await settleProductLadders({ root, fetchBox: boxSource({ "824320": { final: true, byPlayer: bat("kyle tucker", { hits: 3 }) } }).fetchBox, nowIso: NOW, apply: false });
  assert.equal(r.cards[0].result, CARD.LOST, "it still decides");
  assert.equal(fs.readFileSync(path.join(root, ...LADDER_REL), "utf8"), before, "and writes nothing");
  assert.equal(fs.existsSync(path.join(root, ...LIFECYCLE_DIR)), false, "not even the ledger");
});

test("Moonshot settles on its own artifact shape and opens the next rung", async () => {
  const root = store();
  put(root, MOONSHOT_REL, moonDoc([
    { legId: "moonshot:mlb:824725:batter_total_bases:Gabriel_Moreno", participant: "Gabriel Moreno Over 1.5 Total Bases", market: "batter_total_bases", side: "over", line: 1.5 },
  ]));
  const games = { "824725": { final: true, byPlayer: bat("gabriel moreno", { hits: 2, doubles: 1, triples: 0, homeRuns: 0 }) } };
  const r = await settleProductLadders({ root, fetchBox: boxSource(games).fetchBox, nowIso: NOW, apply: true });
  assert.equal(r.cards[0].product, "moonshot");
  assert.equal(r.cards[0].result, CARD.WON);   // 1 single + 1 double = 3 total bases > 1.5
  assert.deepEqual([pos(root, "moonshot").cycle, pos(root, "moonshot").step], [1, 2]);
  assert.equal(read(root, MOONSHOT_REL).ladder[0].card.result, null, "the historical lane is untouched");
});

test("the two products never contaminate each other", async () => {
  const root = store();
  put(root, LADDER_REL, ladderDoc([leg("Kyle Tucker", "batter_hits", "under", 1.5)]));
  put(root, MOONSHOT_REL, moonDoc([leg("Gabriel Moreno", "batter_hits", "over", 1.5, "824725")]));
  const games = {
    "824320": { final: true, byPlayer: bat("kyle tucker", { hits: 3 }) },      // ladder LOSES
    "824725": { final: true, byPlayer: bat("gabriel moreno", { hits: 3 }) },   // moonshot WINS
  };
  const r = await settleProductLadders({ root, fetchBox: boxSource(games).fetchBox, nowIso: NOW, apply: true });
  const bb = r.cards.find((c) => c.product === "bank-builder");
  const ms = r.cards.find((c) => c.product === "moonshot");
  assert.equal(bb.result, CARD.LOST);
  assert.equal(ms.result, CARD.WON);
  assert.equal(pos(root, "bank-builder-lane-A").cycle, 4);   // restarted
  assert.equal(pos(root, "moonshot").step, 2);               // advanced
});

test("every write lands inside the injected root — production is never touched", async () => {
  const root = store();
  put(root, LADDER_REL, ladderDoc([leg("Kyle Tucker", "batter_hits", "under", 1.5)]));
  const watched = ["public/data/methodology/launch/dual-bank-builder-active.json",
                   "public/data/moonshot-lane/active.json",
                   "public/data/mr-dub/portfolio.json",
                   "public/data/mr-dub/bank-builder-locks.json"];
  const before = watched.map((f) => fs.readFileSync(f));
  await settleProductLadders({ root, fetchBox: boxSource({ "824320": { final: true, byPlayer: bat("kyle tucker", { hits: 3 }) } }).fetchBox, nowIso: NOW, apply: true });
  watched.forEach((f, i) => assert.ok(before[i].equals(fs.readFileSync(f)), `${f} must be byte-identical after a fixture-rooted run`));
});

test("the withheld protected write is named, not silently skipped", async () => {
  const root = store();
  put(root, LADDER_REL, ladderDoc([leg("Kyle Tucker", "batter_hits", "under", 1.5)]));
  const r = await settleProductLadders({ root, fetchBox: boxSource({ "824320": { final: true, byPlayer: bat("kyle tucker", { hits: 3 }) } }).fetchBox, nowIso: NOW, apply: true });
  assert.equal(r.withheldWrite.target, "app/public/data/mr-dub/portfolio.json");
  assert.match(r.withheldWrite.reason, /restate financial history/);
  assert.equal(ledger(root).withheldWrite.via, "app/scripts/build-mr-dub-ledger.mjs");
});

test("a missing store is absence, not failure", async () => {
  const root = store();   // nothing in it at all
  const r = await settleProductLadders({ root, fetchBox: boxSource({}).fetchBox, nowIso: NOW, apply: true });
  assert.deepEqual(r.stores, { bankBuilder: false, moonshot: false });
  assert.equal(r.settled, 0);
  assert.equal(r.cards.length, 0);
});
