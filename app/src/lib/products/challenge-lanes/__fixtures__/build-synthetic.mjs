/**
 * TEST-ONLY. Builds the SYNTHETIC lane states the site's dev view and tests need but the real replay cannot reach while
 * P1 is open, with the ENGINE'S OWN operations (prepareLane / priceLane / reconcileLane / ingestReceipts / restartRun /
 * laneProjection), the same way the engine's tests do: the real 2026-11-02 frozen cards, made-up FIXTURE prices
 * (provider "FIXTURE-NOT-A-PROVIDER"; the projection withholds every price), and the committed finals record with sides flipped where
 * a loss is wanted. The projections are then tagged `fixture: true, synthetic: true` and re-sealed; the site's loader
 * refuses them. Nothing here is a real lane record.
 *
 *   bb-a  ACTIVE on step 2 after a won step 1         bb-b  LOST at step 2, awaiting a founder-approved restart
 *   ms-a  ACTIVE on step 2 after a won step 1         ms-b  restarted: run-1 LOST at step 1, run-2 HELD at step 1
 *
 * Run (from app/): npx tsx src/lib/products/challenge-lanes/__fixtures__/build-synthetic.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLegPool } from "../../leg-pool/leg-pool.mjs";
import { dailySuggestedCards, sealSuggestedCards } from "../../leg-pool/daily-cards.mjs";
import { canonical, sha256 } from "../../../challenge-lanes/chain.mjs";
import { selectLaneCards, laneState, runStarted, append } from "../../../challenge-lanes/lanes.mjs";
import { prepareLane, priceLane, reconcileLane, ingestReceipts, restartRun } from "../../../challenge-lanes/ops.mjs";
import { laneProjection } from "../../../challenge-lanes/projection.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..", "..", "..");
const REPO = path.resolve(APP, "..");
const DATE = "2026-11-02";
const NEXT = "2026-11-03";
const NBA = JSON.parse(fs.readFileSync(path.join(APP, `public/data/nba/experimental-public/${DATE}.json`), "utf8"));
const DOC = sealSuggestedCards(dailySuggestedCards(buildLegPool({ repoRoot: REPO, date: DATE, evaluatedAt: NBA.generatedAt })));
const FINALS = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nba/results/finals-2026-27.json"), "utf8"));
const AT = NBA.generatedAt;
const FIX = "FIXTURE-NOT-A-PROVIDER"; // a test-only provider; the book is an eligible key so the engine prices it
const SEL = { "bank-builder": selectLaneCards(DOC, "bank-builder"), moonshot: selectLaneCards(DOC, "moonshot") };

function fixturePrice(card) {
  const t = new Date(Math.min(...card.legs.map((l) => Date.parse(l.startUtc))) - 2 * 3600e3).toISOString();
  return { legs: card.legs.map((l) => ({ legId: l.legId, selectionCode: l.selection.code, provider: FIX, book: "draftkings", oddsFormat: "american", price: 150, fetchedAt: t })), parlay: { method: "LEG_PRODUCT", fetchedAt: t }, priceSnapshotSha256: "f".repeat(64) };
}
const finalsWith = (card, outcomes) => ({ ...FINALS, conflicts: [], finals: FINALS.finals.map((r) => {
  const i = card.legs.findIndex((l) => l.gameId === r.providerEventId);
  if (i < 0) return r;
  const side = card.legs[i].selection.code;
  return { ...r, winnerSide: outcomes[i] === "WIN" ? side : side === "home" ? "away" : "home" };
}) });
const must = (r, what) => { if (!r.events?.length) throw new Error(`${what}: ${r.action} ${r.reason ?? JSON.stringify(r.payout?.refusals ?? "")}`); return r.events; };

/** Prepare + price a day's card; returns the new events and the card. */
function stakeDay(events, laneId, product, date) {
  let ev = [...events, ...must(prepareLane(events, { date, at: AT, selection: SEL[product], file: "test", docSha256: DOC.contentSha256 }), `${laneId} prepare ${date}`)];
  const card = laneState(ev).open.cardEvent.card;
  const price = fixturePrice(card);
  ev = [...ev, ...must(priceLane(ev, { date, at: price.legs[0].fetchedAt, price, suggestedCards: DOC, permittedProviders: [FIX], strictPace: false }), `${laneId} price ${date}`)];
  return { ev, card };
}
const settle = (ev, card, outcomes) => [...ev, ...reconcileLane(ev, { finalsRecord: finalsWith(card, outcomes) }).events];
const start = (laneId) => [runStarted({ laneId, runId: "run-1", startedAt: AT, approvedBy: "SYNTHETIC (not an approval)" })];

/** Step 1 won on Nov 2; step 2 staked on Nov 3 (the same frozen legs, re-used) and unsettled. */
function activeStep2(laneId, product) {
  const d1 = stakeDay(start(laneId), laneId, product, DATE);
  const won = settle(d1.ev, d1.card, d1.card.legs.map(() => "WIN"));
  if (laneState(won).step !== 2) throw new Error(`${laneId}: step 1 did not advance`);
  return [stakeDay(won, laneId, product, NEXT).ev];
}
/** Step 1 won, step 2 lost on one leg, then the next posting day records AWAITING_RESTART_APPROVAL. */
function lostAtStep2(laneId, product) {
  const d1 = stakeDay(start(laneId), laneId, product, DATE);
  const won = settle(d1.ev, d1.card, d1.card.legs.map(() => "WIN"));
  const d2 = stakeDay(won, laneId, product, NEXT);
  const lost = settle(d2.ev, d2.card, d2.card.legs.map((_, i) => (i === 1 ? "LOSS" : "WIN")));
  return [[...lost, ...must(prepareLane(lost, { date: "2026-11-04", at: AT, selection: SEL[product] }), `${laneId} busted status`)]];
}
/** Run-1 lost at step 1, a founder RESTART_APPROVED receipt, run-2 at base with no card yet. */
function restarted(laneId, product) {
  const d1 = stakeDay(start(laneId), laneId, product, DATE);
  const lost = settle(d1.ev, d1.card, d1.card.legs.map((_, i) => (i ? "WIN" : "LOSS")));
  const busted = [...lost, ...must(prepareLane(lost, { date: NEXT, at: AT, selection: SEL[product] }), `${laneId} busted status`)];
  const receipt = append([], { type: "RESTART_APPROVED", laneId, runId: "run-1", date: "2026-11-04", step: 1, at: "2026-11-04T11:00:00Z", source: "cc-console", refEventSha256: busted.at(-1).sha256, nextRunId: "run-2", approvedBy: "SYNTHETIC (not an approval)" });
  const withRestart = [...busted, ...must(ingestReceipts(busted, receipt), `${laneId} restart receipt`)];
  return [withRestart, [restartRun(withRestart)]];
}

const note = "TEST-ONLY SYNTHETIC STATE built with the engine's own operations and FIXTURE prices (withheld in the projection). Not a real lane record.";
const build = { "bb-a": () => activeStep2("bb-a", "bank-builder"), "bb-b": () => lostAtStep2("bb-b", "bank-builder"), "ms-a": () => activeStep2("ms-a", "moonshot"), "ms-b": () => restarted("ms-b", "moonshot") };
for (const [laneId, runs] of Object.entries(build)) {
  const { contentSha256: _c, ...rest } = laneProjection(laneId, runs());
  const body = { ...rest, fixture: true, synthetic: true, fixtureNote: note };
  fs.writeFileSync(path.join(HERE, `synthetic-${laneId}.fixture.json`), `${canonical({ ...body, contentSha256: sha256(canonical(body)) })}\n`);
  console.log(laneId, body.current.publicStatus, body.current.stepText, body.runs.map((r) => `${r.runId}:${r.publicStatus}`).join(" "));
}
