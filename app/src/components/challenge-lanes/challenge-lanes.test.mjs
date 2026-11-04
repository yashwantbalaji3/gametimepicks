/**
 * BBM V2 — the website's challenge lanes (SPEC rev 2 §3, §6) over the engine's public projection
 * `gtp.challenge-lane.public@1`, read with the engine's ONE public reader and folded by the engine's ONE laneDisplay.
 *
 *   loader      readLaneProjection (MISSING / UNREADABLE / UNVERIFIED / WRONG_LANE) plus the site's refusals (fixture,
 *               anything priced) → an explicit "record not published" lane, never a guess
 *   consistent  every number the site shows is laneDisplay's: the site has no fold of its own
 *   view        STEP k OF N, ladder rungs, status (IN PLAY · BUSTED · PAUSED · NO QUALIFYING CARD · COMPLETE), the day
 *               history, and an unstaked card that lost never reads as a lane loss
 *   unpriced    payout and profit always read "Awaiting verified prices"; no $ amount but base, target, tracked, stake
 *   pages       /bank-builder and /moonshot render both lanes through loadProductLanes, before today's card
 *
 * Run (from app/): npx tsx --test src/components/challenge-lanes/challenge-lanes.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto, { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
process.env.__NEXT_TRAILING_SLASH = "true";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const FIX = Object.fromEntries(["bb-a", "bb-b", "ms-a", "ms-b"].map((id) => [id, JSON.parse(read(`src/lib/products/challenge-lanes/__fixtures__/${id}.fixture.json`))]));
/** Built with the engine's own operations (__fixtures__/build-synthetic.mjs). */
const SYN = Object.fromEntries(["bb-a", "bb-b", "ms-a", "ms-b"].map((id) => [id, JSON.parse(read(`src/lib/products/challenge-lanes/__fixtures__/synthetic-${id}.fixture.json`))]));

const lane = await import("../../lib/products/challenge-lanes/lane.mjs");
const { loadChallengeLane, loadProductLanes, readTeamColours } = await import("../../lib/products/challenge-lanes/load.mjs");
const { laneDisplay } = await import("../../lib/challenge-lanes/display.mjs");
const { samplePricedDisplay } = await import("../../lib/products/challenge-lanes/__fixtures__/sample-prices.mjs");
const { canonical, sha256 } = await import("../../lib/challenge-lanes/chain.mjs");
const { LANES: ENGINE_LANES, STATUS } = await import("../../lib/challenge-lanes/lanes.mjs");
const { default: LaneCard } = await import("./lane-card.tsx");
const { default: LanePair } = await import("./lane-pair.tsx");

const html = (el) => renderToStaticMarkup(el);
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ");
const reseal = (doc) => { const { contentSha256: _c, ...rest } = doc; return { ...rest, contentSha256: sha256(canonical(rest)) }; };
/** A real (non-fixture) copy, as the engine would publish it, optionally edited before sealing. */
const real = (doc, mutate = (d) => d) => { const { fixture: _f, fixtureNote: _n, synthetic: _s, ...rest } = structuredClone(doc); return reseal(mutate(rest)); };
const tmpApp = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-"));
  fs.mkdirSync(path.join(dir, "public", "data", "challenge-lanes"), { recursive: true });
  for (const [id, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, "public", "data", "challenge-lanes", `${id}.json`), typeof body === "string" ? body : JSON.stringify(body));
  return dir;
};

test("SPEC rev 2: four lanes, five steps each; BB $100→$10,000 with at most 2 legs, MS $25→$1,000", () => {
  assert.deepEqual(lane.lanesOf("bank-builder"), ["bb-a", "bb-b"]);
  assert.deepEqual(lane.lanesOf("moonshot"), ["ms-a", "ms-b"]);
  for (const id of lane.LANE_IDS) assert.equal(ENGINE_LANES[id].steps, 5, id);
  assert.deepEqual([ENGINE_LANES["bb-a"].baseCents, ENGINE_LANES["bb-a"].targetCents], [10000, 1000000]);
  assert.deepEqual([ENGINE_LANES["ms-b"].baseCents, ENGINE_LANES["ms-b"].targetCents], [2500, 100000]);
  assert.equal(lane.laneView(FIX["bb-a"]).maxLegs, 2);
  assert.equal(lane.PRICES_ON_SITE, true, "founder 2026-11-04: prices on the site, from the encrypted priced fold only");
  for (const doc of [...Object.values(FIX), ...Object.values(SYN)]) assert.equal(doc.steps, 5, doc.laneId);
});

test("fixtures (the engine's replay and its synthetic states) are accepted only with allowFixture; the site loader refuses them", () => {
  for (const [id, doc] of [...Object.entries(FIX), ...Object.entries(SYN)]) {
    assert.equal(doc.fixture, true, id);
    assert.equal(doc.schema, "gtp.challenge-lane.public@1", id);
    assert.deepEqual(lane.acceptLaneProjection(doc, { laneId: id, allowFixture: true }), { ok: true }, id);
    assert.equal(lane.acceptLaneProjection(doc, { laneId: id }).reason, "fixture file", id);
    assert.deepEqual(lane.acceptLaneProjection(real(doc), { laneId: id }), { ok: true }, `${id} as published`);
  }
  const r = loadChallengeLane({ appDir: tmpApp({ "bb-a": FIX["bb-a"] }), laneId: "bb-a" });
  assert.equal(r.doc, null); assert.equal(r.reason, "fixture file"); assert.equal(r.view.status, "UNAVAILABLE");
});

test("the loader reads through the engine's readLaneProjection: MISSING, UNREADABLE, UNVERIFIED and WRONG_LANE are refused", () => {
  const tampered = real(FIX["bb-b"]); tampered.runs[0].days[0].card.legs[0].selection.teamAbbr = "BOS";
  const dir = tmpApp({ "bb-a": real(FIX["bb-a"]), "bb-b": tampered, "ms-a": real(FIX["ms-b"]), "ms-b": "{not json" });
  assert.equal(loadChallengeLane({ appDir: dir, laneId: "bb-a" }).view.status, "HELD");
  assert.equal(loadChallengeLane({ appDir: dir, laneId: "bb-b" }).reason, "UNVERIFIED");
  assert.equal(loadChallengeLane({ appDir: dir, laneId: "ms-a" }).reason, "WRONG_LANE");
  assert.equal(loadChallengeLane({ appDir: dir, laneId: "ms-b" }).reason, "UNREADABLE");
  const none = loadChallengeLane({ appDir: tmpApp({}), laneId: "bb-a" });
  assert.equal(none.reason, "MISSING"); assert.equal(none.view.note, "The lane record has not been published yet.");
  assert.equal(loadChallengeLane({ appDir: dir, laneId: "bb-b" }).view.note, "The lane record did not pass verification, so it is not shown.");
  assert.throws(() => loadChallengeLane({ appDir: dir, laneId: "zz" }), /unknown lane/);
  assert.throws(() => lane.laneView(tampered), /does not verify/, "laneDisplay refuses an unverified file");
});

test("anything priced in a public file is refused whole, even sealed: price keys, unstubbed price events, a withheld bankroll", () => {
  for (const key of ["price", "odds", "book", "grossPayoutCents", "profitCents", "payout", "decimal", "priceSnapshotSha256"]) {
    const leaky = real(FIX["ms-a"], (d) => { d.runs[0].days[0].card.legs[0][key] = 1; return d; });
    assert.match(lane.acceptLaneProjection(leaky).reason, new RegExp(`price field in a public file \\(.*\\.${key}\\)`), key);
  }
  for (const type of ["PRICE_VERIFIED", "PAYOUT_COMPUTED"]) {
    const unstubbed = real(FIX["bb-a"], (d) => { d.runs[0].events.push({ seq: 99, type, date: "2026-11-02", step: 1, at: "x", source: "x", withheld: "P1", provider: "x" }); return d; });
    assert.match(lane.acceptLaneProjection(unstubbed).reason, new RegExp(`${type} is not the withheld stub`));
    const notWithheld = real(FIX["bb-a"], (d) => { d.runs[0].events.push({ seq: 99, type, date: "2026-11-02", step: 1, at: "x", source: "x" }); return d; });
    assert.match(lane.acceptLaneProjection(notWithheld).reason, new RegExp(`${type} is not the withheld stub`));
  }
  const bankroll = real(FIX["bb-a"], (d) => { d.current.trackedBankrollWithheld = "P1"; return d; });
  assert.equal(lane.acceptLaneProjection(bankroll).reason, "withheld bankroll printed");
  for (const doc of Object.values(SYN)) assert.doesNotMatch(JSON.stringify(doc), /FIXTURE-NOT-A-BOOK|"price":/, `${doc.laneId}: the engine withheld the fixture prices`);
});

test("the real replay: every lane HELD at STEP 1 OF 5 with the reason; Nov 2's unpriced card never reads as a loss", () => {
  for (const [id, doc] of Object.entries(FIX)) {
    const v = lane.laneView(doc);
    assert.equal(v.statusLabel, "HELD", id);
    assert.equal(v.stepText, "STEP 1 OF 5", id);
    assert.deepEqual(v.rungs.map((r) => r.state), ["active", "upcoming", "upcoming", "upcoming", "upcoming"], id);
    assert.equal(v.tracked, id.startsWith("bb") ? "$100" : "$25", id);
    assert.equal(v.toTarget, id.startsWith("bb") ? "$9,900" : "$975", id);
    assert.equal(v.pace.state, "on", id);
    assert.equal(v.current, null, `${id}: no card on Nov 3`);
    assert.match(v.note, /^No sealed suggested-cards file for 2026-11-03; STEP 1 OF 5 is unchanged/, id);
    assert.deepEqual(v.story.map((d) => d.date), ["2026-11-03", "2026-11-02"], id);
    assert.equal(v.story[1].statusText, "Held · not staked, awaiting verified prices");
    const h = text(html(React.createElement(LaneCard, { lane: v })));
    assert.match(h, /The model card lost, but it was not staked, so the lane did not move\./, id);
    assert.doesNotMatch(h, /\bLOST\b|Step 1 lost/, id);
    assert.equal(h.split("No sealed suggested-cards file for 2026-11-03").length - 1, 1, `${id}: the reason prints once`);
  }
  assert.deepEqual(lane.laneView(FIX["bb-a"]).story[1].legs.map((l) => [l.teamAbbr, l.outcome]), [["NY", "WIN"], ["DEN", "LOSS"]]);
});

test("engine-built states: ACTIVE on step 2 after a won step 1, LOST awaiting restart, a restarted lane with its run history", () => {
  for (const id of ["bb-a", "ms-a"]) {
    const v = lane.laneView(SYN[id]);
    assert.equal(v.statusLabel, "ACTIVE", id); assert.equal(v.stepText, "STEP 2 OF 5", id); assert.equal(v.cleared, 1, id);
    assert.deepEqual(v.rungs.map((r) => r.state), ["completed", "active", "upcoming", "upcoming", "upcoming"], id);
    assert.equal(v.tracked, lane.AWAITING_PRICES, `${id}: a won step's bankroll is withheld (P1)`);
    assert.equal(v.pace.state, "withheld"); assert.equal(v.pace.text, "Pace: awaiting verified prices");
    assert.ok(v.current?.legs.length, id);
    assert.deepEqual(v.story.map((d) => d.statusText), ["Active", "Won"], id);
  }
  const lost = lane.laneView(SYN["bb-b"]);
  assert.equal(lost.statusLabel, "LOST"); assert.equal(lost.wager, null); assert.equal(lost.pace, null); assert.equal(lost.toTarget, null); assert.equal(lost.current, null);
  assert.deepEqual(lost.rungs.map((r) => r.state), ["completed", "failed", "upcoming", "upcoming", "upcoming"]);
  assert.match(lost.note, /BUSTED AT STEP 2 OF 5 .*only after a founder-approved restart/);
  assert.ok(lost.story.some((d) => d.result === "Step 2 lost.") && lost.story.some((d) => d.result === "Step 1 won."));
  const re = lane.laneView(SYN["ms-b"]);
  assert.deepEqual(re.runs.map((r) => [r.runId, r.status, r.current]), [["run-1", "LOST", false], ["run-2", "HELD", true]]);
  assert.equal(re.stepText, "STEP 1 OF 5"); assert.equal(re.tracked, "$25");
  const h = text(html(React.createElement(LaneCard, { lane: re })));
  assert.match(h, /Runs run-1 · started 2026-11-02 · 0 won · LOST run-2 · started 2026-11-04 · 0 won · current/);
});

test("milestones come from the file (lanes.mjs MILESTONES via laneDisplay); the site hardcodes none", () => {
  const v = lane.laneView(FIX["ms-a"]);
  assert.deepEqual(v.rungs.map((r) => r.milestone), FIX["ms-a"].milestonesCents.slice(0, 5).map((c) => `$${(c / 100).toLocaleString("en-US")}`));
  assert.deepEqual(v.rungs.map((r) => r.milestone), laneDisplay(FIX["ms-a"]).rungs.map((r) => `$${(r.milestoneCents / 100).toLocaleString("en-US")}`));
  const src = read("src/lib/products/challenge-lanes/lane.mjs");
  assert.doesNotMatch(src, /MILESTONES|milestonesCents|\b(30000|90000|270000|650000|7500|18000|36000|65000)\b/);
});

test("SITE/SOCIAL CONSISTENCY: every step, rung, status, bankroll, distance, pace and leg the site shows is laneDisplay's", () => {
  const usd = (c) => (c == null ? null : `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  for (const doc of [...Object.values(FIX), ...Object.values(SYN)]) {
    const d = laneDisplay(doc);
    const v = lane.laneView(doc);
    const tag = `${doc.laneId}${doc.synthetic ? " (synthetic)" : ""}`;
    assert.equal(v.stepText, d.stepText, tag); assert.equal(v.step, d.step, tag); assert.equal(v.steps, d.steps, tag);
    assert.equal(v.status, d.status, tag); assert.equal(v.internalStatus, d.internalStatus, tag);
    assert.deepEqual(v.rungs.map((r) => [r.step, r.state, r.milestone]), d.rungs.map((r) => [r.step, r.state, usd(r.milestoneCents)]), tag);
    assert.equal(v.tracked, d.trackedBankrollCents == null ? lane.AWAITING_PRICES : usd(d.trackedBankrollCents), tag);
    assert.equal(v.toTarget, d.status === "LOST" ? null : usd(d.distanceToTargetCents), tag);
    assert.equal(v.pace?.state ?? null, d.status === "LOST" ? null : d.pace.state, tag);
    assert.equal(v.base, usd(d.baseCents)); assert.equal(v.target, usd(d.targetCents));
    assert.equal(v.sourceSha256, doc.contentSha256, tag);
    assert.deepEqual(v.runs.map((r) => [r.runId, r.status]), d.runs.map((r) => [r.runId, r.endStatus]), tag);
    const hist = [...d.history].reverse();
    assert.deepEqual(v.story.map((x) => [x.date, x.step]), hist.map((x) => [x.date, x.step]), tag);
    for (const [i, day] of hist.entries()) {
      assert.deepEqual(v.story[i].legs.map((l) => [l.legId, l.teamAbbr, l.projection]), (day.card?.legs ?? []).map((l) => [l.legId, l.selection.teamAbbr, l.probabilityShown]), `${tag} ${day.date} legs`);
      assert.deepEqual(v.story[i].legs.map((l) => l.outcome ?? "PENDING"), (day.legResults ?? []).map((r) => r.outcome), `${tag} ${day.date} results`);
    }
  }
  // Structural: the site reads with the engine's reader and folds with the engine's laneDisplay, and has no fold of its own.
  assert.match(read("src/lib/products/challenge-lanes/load.mjs"), /import \{ readLaneProjection \} from "\.\.\/\.\.\/challenge-lanes\/public-reader\.mjs";/);
  const loader = read("src/lib/products/challenge-lanes/load.mjs");
  assert.match(loader, /import \{ pricedLaneDisplay \} from "\.\.\/\.\.\/challenge-lanes\/display\.mjs";/);
  assert.match(loader, /import \{ readLanePrices \} from "\.\.\/\.\.\/challenge-lanes\/price-display\.mjs";/);
  assert.match(loader, /const display = pricedLaneDisplay\(r\.doc, readLanePrices\(\{ appDir, laneId, env \}\)\);/);
  assert.doesNotMatch(read("src/lib/products/challenge-lanes/lane.mjs"), /withLanePrices|decryptDisplayArtifact|readLanePriceDisplay/, "the site joins and decrypts nothing itself");
  const src = read("src/lib/products/challenge-lanes/lane.mjs");
  assert.match(src, /import \{ laneDisplay \} from "\.\.\/\.\.\/challenge-lanes\/display\.mjs";/);
  const view = src.slice(src.indexOf("export function laneView"), src.indexOf("export function unavailableLaneView"));
  assert.match(view, /const d = display \?\? laneDisplay\(doc\);\n  if \(d\.sourceSha256 !== doc\.contentSha256\) throw/);
  assert.doesNotMatch(view, /doc\.(runs|current|steps|baseCents|targetCents|milestonesCents)|publicStatus|trackedBankrollWithheld|readFileSync/, "laneView reads only laneDisplay's output");
});

test("the lane card mirrors the graphic: product + lane chip, STEP k OF N, lit ladder, start/tracked/goal, team-marked legs, unpriced payout", () => {
  const v = lane.laneView(SYN["ms-a"], { teams: readTeamColours(APP) });
  const h = html(React.createElement(LaneCard, { lane: v }));
  const t = text(h);
  assert.match(t, /Moonshot Lane A run-1 ● ACTIVE/);
  assert.match(t, /STEP 2 OF 5/);
  assert.match(h, /role="img"[^>]*data-lane-meter=""/);
  assert.match(t, /Start \$25 Tracked bankroll · settled Awaiting verified prices Goal · hypothetical \$1,000/);
  assert.equal((h.match(/data-rung-state="completed"/g) ?? []).length, 1);
  assert.equal((h.match(/data-lane-unpriced=""/g) ?? []).length, 1);
  assert.match(t, /Potential payout · profit Awaiting verified prices/);
  assert.match(h, /class="cl-leg cl-leg--team" style="--cl-team:#[0-9A-Fa-f]{6};--cl-team-ink:#[0-9A-Fa-f]{6}"/);
  assert.match(t, /\d{1,2}:\d{2} PM ET/);
  const legs = v.current.legs.length;
  assert.equal((t.match(/MODEL WIN PROBABILITY/g) ?? []).length, legs + v.story[1].legs.length, "the current step's legs once, plus step 1's in the story");
  assert.match(t, /2026-11-03 · step 2 · Active The selections above\./);
  assert.match(t, /Tracked challenge · no real wager placed/);
  assert.doesNotMatch(t, /\b(ESTIMATE|est\.|projected median|odds)\b/i);
  assert.doesNotMatch(t, /not betting advice|FOUNDER REVIEW|NOT A SPORTSBOOK OFFER/i);
});

test("PRICED: odds, book and capture time per leg, the combined price (leg product), stake, payout and profit — only from the priced fold", () => {
  const doc = SYN["bb-a"];
  const d = samplePricedDisplay(doc);
  const v = lane.laneView(doc, { display: d, teams: readTeamColours(APP) });
  const t = text(html(React.createElement(LaneCard, { lane: v })));
  assert.deepEqual(v.current.legs.map((l) => l.price.odds), ["+120", "-150"]);
  assert.match(t, /\+120 SAMPLE BOOK/); assert.match(t, /-150 SAMPLE BOOK/);
  assert.match(t, /Combined price \(leg product\) \+267 · 3\.67× SAMPLE BOOK · captured Nov 3, 5:15 PM ET/);
  assert.equal(v.wager, "$100"); assert.equal(v.potentialPayout, "$366.66"); assert.equal(v.potentialProfit, "$266.66");
  assert.match(t, /Wager \$100 tracked stake Potential payout · profit \$366\.66 profit \$266\.66/);
  assert.doesNotMatch(t, /Potential payout · profit Awaiting verified prices/);
  // The same file without the priced fold prints no price at all.
  const plain = text(html(React.createElement(LaneCard, { lane: lane.laneView(doc) })));
  assert.doesNotMatch(plain, /SAMPLE BOOK|\+120|-150|Combined price/);
  assert.match(plain, /Potential payout · profit Awaiting verified prices/);
  assert.doesNotMatch(plain, /21\+/, "no responsible-gambling line without prices");
  // A same-game estimate is labelled as one, never as a book's offer.
  const sg = { ...d, day: { ...d.day, price: { ...d.day.price, method: "LEG_PRODUCT_ESTIMATE", estimate: true, label: null } } };
  assert.match(text(html(React.createElement(LaneCard, { lane: lane.laneView(doc, { display: sg }) }))), /Combined price · estimate \(same-game legs, not a book.s offer\)/);
  // A display folded from another file is refused.
  assert.throws(() => lane.laneView(FIX["bb-a"], { display: d }), /not folded from this lane file/);
});

test("PRICED CONSISTENCY: the same frozen record gives the same numbers on the site as in the engine's payout (graphics' input)", async () => {
  const { buildLegPool } = await import("../../lib/products/leg-pool/leg-pool.mjs");
  const { dailySuggestedCards, sealSuggestedCards } = await import("../../lib/products/leg-pool/daily-cards.mjs");
  const { selectLaneCards, laneState, runStarted } = await import("../../lib/challenge-lanes/lanes.mjs");
  const { prepareLane, priceLane } = await import("../../lib/challenge-lanes/ops.mjs");
  const { laneProjection, serializeProjection } = await import("../../lib/challenge-lanes/projection.mjs");
  const { encryptLanePriceDisplay, lanePriceDisplay } = await import("../../lib/challenge-lanes/price-display.mjs");
  const REPO = path.resolve(APP, "..");
  const nba = JSON.parse(read("public/data/nba/experimental-public/2026-11-02.json"));
  const DOC = sealSuggestedCards(dailySuggestedCards(buildLegPool({ repoRoot: REPO, date: "2026-11-02", evaluatedAt: nba.generatedAt })));
  const head = runStarted({ laneId: "bb-a", runId: "run-1", startedAt: DOC.evaluatedAt, approvedBy: "TEST (not an approval)" });
  const ev0 = [head, ...prepareLane([head], { date: "2026-11-02", at: DOC.evaluatedAt, selection: selectLaneCards(DOC, "bank-builder"), file: "t", docSha256: DOC.contentSha256 }).events];
  const card = laneState(ev0).open.cardEvent.card;
  const t = new Date(Math.min(...card.legs.map((l) => Date.parse(l.startUtc))) - 2 * 3600e3).toISOString();
  const TEST_PROVIDER = "TEST-PROVIDER";
  const odds = [-910, -250];
  const price = { legs: card.legs.map((l, i) => ({ legId: l.legId, selectionCode: l.selection.code, provider: TEST_PROVIDER, book: "draftkings", oddsFormat: "american", price: odds[i], fetchedAt: t })), parlay: { method: "LEG_PRODUCT", fetchedAt: t }, priceSnapshotSha256: "f".repeat(64) };
  const priced = priceLane(ev0, { date: "2026-11-02", at: t, price, suggestedCards: DOC, permittedProviders: [TEST_PROVIDER], strictPace: false });
  assert.equal(priced.action, "PAYOUT_COMPUTED", JSON.stringify(priced.payout?.refusals));
  const ev = [...ev0, ...priced.events];
  const pay = ev.findLast((e) => e.type === "PAYOUT_COMPUTED");
  // The repo layout the loader reads: the plain projection under app/public/data, the envelope under <repo>/data/odds-display.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cl-priced-"));
  const app = path.join(repo, "app");
  fs.mkdirSync(path.join(app, "public", "data", "challenge-lanes"), { recursive: true });
  fs.mkdirSync(path.join(repo, "data", "odds-display", "challenge-lanes"), { recursive: true });
  const projection = laneProjection("bb-a", [ev]);
  fs.writeFileSync(path.join(app, "public", "data", "challenge-lanes", "bb-a.json"), serializeProjection(projection));
  assert.doesNotMatch(serializeProjection(projection), /draftkings|-910|-250|"price":/, "the plain public file stays price-free");
  const key = crypto.randomBytes(32);
  const envelope = encryptLanePriceDisplay("bb-a", [ev], key);
  fs.writeFileSync(path.join(repo, "data", "odds-display", "challenge-lanes", "bb-a.json.enc"), envelope);
  assert.doesNotMatch(envelope, /draftkings|-910/, "the committed envelope is ciphertext");
  const env = { GTP_ODDS_DISPLAY_KEY: key.toString("hex") };

  const v = loadChallengeLane({ appDir: app, laneId: "bb-a", env }).view;
  const usd = (c) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const sign = (n) => (n > 0 ? `+${n}` : String(n));
  assert.equal(v.status, laneDisplay(projection).status);
  assert.deepEqual(v.current.legs.map((l) => [l.legId, l.price.odds, l.price.book]), card.legs.map((l, i) => [l.legId, sign(odds[i]), "draftkings"]));
  assert.equal(v.wager, usd(pay.inputs.stakeCents));
  assert.equal(v.potentialPayout, usd(pay.grossPayoutCents));
  assert.equal(v.potentialProfit, usd(pay.profitCents));
  assert.ok(v.current.price.combined.includes(`${pay.inputs.decimalPrice.toFixed(2)}×`));
  assert.equal(v.current.price.combinedLabel, "Combined price (leg product)");
  const h = text(html(React.createElement(LaneCard, { lane: v })));
  assert.match(h, new RegExp(`Potential payout · profit \\${usd(pay.grossPayoutCents)} profit \\${usd(pay.profitCents)}`));
  assert.match(h, /-910 draftkings/);
  assert.match(h, /21\+ · Gamble responsibly/, "the responsible-gambling line shows where prices show");

  // SITE = GRAPHIC INPUTS: the graphics read prices with the engine's lanePriceDisplay over the private run log (bb-social,
  // claude/bbm-v2-graphics bbm-lane.mjs). For the same lane event the site's numbers equal that day entry's.
  const g = lanePriceDisplay("bb-a", [ev]).runs[0].days.find((x) => x.date === "2026-11-02" && x.result === "VERIFIED");
  assert.equal(v.current.price.book, g.book);
  assert.deepEqual(v.current.legs.map((l) => [l.legId, l.price.odds]), g.legs.map((l) => [l.legId, sign(l.price)]));
  assert.ok(v.current.price.combined.endsWith(`${g.decimalPrice.toFixed(2)}×`));
  assert.deepEqual([v.wager, v.potentialPayout, v.potentialProfit], [usd(g.stakeCents), usd(g.grossPayoutCents), usd(g.profitCents)]);
  assert.equal(v.current.price.requiredMultiple, g.pace);

  // Another key, or no key: nothing priced is shown. A tampered envelope is a release error.
  for (const e of [{ GTP_ODDS_DISPLAY_KEY: crypto.randomBytes(32).toString("hex") }, {}]) {
    const u = loadChallengeLane({ appDir: app, laneId: "bb-a", env: e }).view;
    assert.equal(u.potentialPayout, lane.AWAITING_PRICES);
    assert.doesNotMatch(text(html(React.createElement(LaneCard, { lane: u }))), /draftkings|-910/);
  }
  const bad = JSON.parse(envelope); bad.ct = Buffer.from("x".repeat(40)).toString("base64");
  fs.writeFileSync(path.join(repo, "data", "odds-display", "challenge-lanes", "bb-a.json.enc"), JSON.stringify(bad));
  assert.throws(() => loadChallengeLane({ appDir: app, laneId: "bb-a", env }), /failed authentication/);
  fs.rmSync(repo, { recursive: true, force: true });
});

test("decrypted prices reach only server-rendered HTML: no client component, no /data file, no JSON prop", () => {
  for (const f of ["src/components/challenge-lanes/lane-card.tsx", "src/components/challenge-lanes/lane-pair.tsx"]) assert.doesNotMatch(read(f), /^["']use client["']/m, f);
  for (const f of ["src/app/bank-builder/page.tsx", "src/app/moonshot/page.tsx"]) assert.doesNotMatch(read(f), /JSON\.stringify\([^)]*lanes|challenge-lanes[^"]*\.json\.enc/, f);
  assert.doesNotMatch(read("src/lib/products/challenge-lanes/load.mjs"), /writeFileSync/);
});

test("PRELIMINARY / AWAITING VERIFICATION come from the engine's day price field, never inferred", () => {
  const doc = SYN["bb-a"];
  const d = samplePricedDisplay(doc);
  const at = (verification) => lane.laneView(doc, { display: { ...d, day: { ...d.day, price: { ...d.day.price, verification } } } });
  const t = (v) => text(html(React.createElement(LaneCard, { lane: v })));
  assert.match(t(at("PRELIMINARY")), /● ACTIVE ◷ PRELIMINARY/);
  assert.match(t(at("PRELIMINARY")), /priced from the early snapshot; re-verified near the posting window/);
  assert.match(t(at("AWAITING_VERIFICATION")), /◷ AWAITING VERIFICATION/);
  assert.doesNotMatch(t(at("VERIFIED")), /PRELIMINARY|AWAITING VERIFICATION/);
  assert.doesNotMatch(t(lane.laneView(doc, { display: d })), /PRELIMINARY|AWAITING VERIFICATION/, "no field, no label");
});

test("provisional prop analysis: a separate panel, labelled not a challenge leg, with no probability or confidence words", async () => {
  const { default: PropAnalysisPanel, PROP_PANEL_LABEL } = await import("./prop-analysis-panel.tsx");
  assert.equal(html(React.createElement(PropAnalysisPanel, { analysis: null })), "");
  const analysis = { date: "2026-11-04", gateReason: "No prop met the reliability bar today", rows: [
    { key: "p1:points", player: "Sample Player", team: "NY", opponent: "BKN", market: "Points", projection: "24.6", line: "22.5", difference: "+2.1", book: "SAMPLE BOOK", captured: "Nov 4, 12:18 AM ET" },
  ] };
  const h = html(React.createElement(PropAnalysisPanel, { analysis }));
  const t = text(h);
  assert.equal(PROP_PANEL_LABEL, "Not a challenge leg — no prop passed the reliability gate");
  assert.match(t, /Provisional prop analysis · 2026-11-04/);
  assert.match(t, /Not a challenge leg — no prop passed the reliability gate\. No prop met the reliability bar today/);
  assert.match(t, /MODEL PROJECTION 24\.6 Line 22\.5 Difference \+2\.1 SAMPLE BOOK · captured Nov 4, 12:18 AM ET/);
  assert.doesNotMatch(t, /probability|%|confiden|lock|best bet|high/i);
  assert.doesNotMatch(h, /data-lane-leg=/, "never rendered as a challenge leg");
  assert.doesNotMatch(read("src/components/challenge-lanes/prop-analysis-panel.tsx"), /^["']use client["']/m);
});

test("PROP ANALYSIS end to end: nba-engine-eval's writer + reader → the panel: compared rows only, no side, no price, stale counted", async () => {
  const { writePropAnalysisArtifacts } = await import("../../lib/odds/nba-prop-analysis.mjs");
  const { loadPropAnalysis } = await import("../../lib/products/challenge-lanes/load.mjs");
  const { default: PropAnalysisPanel } = await import("./prop-analysis-panel.tsx");
  const KEY = crypto.randomBytes(32).toString("hex");
  const row = (over) => ({ eventId: "401900001", game: "AAA @ BBB", tipUtc: "2099-01-15T06:00Z", playerId: "7", name: "Test Player", team: "BBB", family: "pts",
    projectionLabel: "MODEL PROJECTION", projection: 21.3, expectedMinutes: 32,
    line: { book: "draftkings", line: 19.5, overPrice: -115, underPrice: -105, capturedAt: "2099-01-14T20:00:00.000Z" }, bookRange: { min: 19.5, max: 20.5, books: 3 }, state: "COMPARED", excluded: [], ...over });
  const analysis = { schema: "gtp-nba-prop-provisional-analysis@1", date: "2099-01-15",
    lane: { file: "x", generatedAt: "2099-01-15T06:00:00Z", family: "v0.1" }, capture: { file: "c", capturedAt: "2099-01-14T20:00:00.000Z" }, offerRule: "chooseOffer", lineMaxAgeHours: 6,
    comparisonRule: "nba-line-comparison@1", guard: { rules: { R1: "status Out or Day-To-Day" } },
    rows: [row(), row({ playerId: "8", name: "Guarded Player", state: "EXCLUDED", excluded: [{ rule: "R1", reason: "Day-To-Day" }] })] };
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "pa-")); const app = path.join(repo, "app"); fs.mkdirSync(app);
  writePropAnalysisArtifacts({ appDir: app, analysis, laneSha256: "ab".repeat(32), env: { GTP_ODDS_DISPLAY_KEY: KEY } });
  const fresh = loadPropAnalysis({ appDir: app, date: "2099-01-15", env: { GTP_ODDS_DISPLAY_KEY: KEY }, asOf: "2099-01-14T21:00:00Z" });
  assert.deepEqual(fresh.rows.map((r) => [r.player, r.market, r.projection, r.line, r.difference, r.book, r.range]), [["Test Player", "Points", "21.3", "19.5", "+1.8", "draftkings", "3 books, 19.5–20.5"]]);
  const t = text(html(React.createElement(PropAnalysisPanel, { analysis: fresh })));
  assert.match(t, /Provisional prop analysis · 2099-01-15 Not a challenge leg — no prop passed the reliability gate\./);
  assert.match(t, /PROVISIONAL ANALYSIS — not a challenge leg/);
  assert.match(t, /Also 1 excluded by the availability and minutes rules; not listed\./);
  assert.doesNotMatch(t, /OVER|UNDER|-115|-105|probability|confiden|Guarded Player/i, "no side, no price, no probability; excluded rows not listed");
  // After the 6 h rule the lines are STALE: counted, not shown.
  const stale = loadPropAnalysis({ appDir: app, date: "2099-01-15", env: { GTP_ODDS_DISPLAY_KEY: KEY }, asOf: "2099-01-15T02:30:00Z" });
  assert.equal(stale.rows.length, 0); assert.equal(stale.stale, true);
  assert.match(text(html(React.createElement(PropAnalysisPanel, { analysis: stale }))), /Lines stale — awaiting a fresher capture\..*with lines older than the 6-hour limit/);
  // No key or another key: no prices, no panel. No file: no panel.
  assert.equal(loadPropAnalysis({ appDir: app, date: "2099-01-15", env: {}, asOf: "2099-01-14T21:00:00Z" }), null);
  assert.equal(loadPropAnalysis({ appDir: app, date: "2099-01-15", env: { GTP_ODDS_DISPLAY_KEY: crypto.randomBytes(32).toString("hex") } }), null);
  assert.equal(loadPropAnalysis({ appDir: app, date: "2099-01-16", env: { GTP_ODDS_DISPLAY_KEY: KEY } }), null);
  fs.rmSync(repo, { recursive: true, force: true });
  for (const f of ["src/app/bank-builder/page.tsx", "src/app/moonshot/page.tsx"]) {
    const src = read(f);
    assert.match(src, /<PropAnalysisPanel analysis=\{loadPropAnalysis\(\{ date: levelAModel\?\.productDay \?\? (currentEtDate\(\)|etToday) \}\) as PropAnalysisView \| null\} \/>/, f);
    assert.ok(src.indexOf("<LanePair") < src.indexOf("<PropAnalysisPanel"), f);
  }
});

test("progression animation is CSS-only and prefers-reduced-motion turns it off", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /@keyframes cl-rung-in/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.cl-rung \.cl-rung-dot, \.cl-rung::before, \.cl-rung--active \.cl-rung-dot \{ animation: none !important; \} \}/);
  assert.doesNotMatch(read("src/components/challenge-lanes/lane-card.tsx"), /"use client"|useEffect/);
});

test("the view never mutates the accepted document (a cached file must still verify on the next render)", () => {
  for (const [id, doc] of Object.entries(FIX)) {
    const before = JSON.stringify(doc);
    lane.laneView(doc); lane.laneView(doc);
    assert.equal(JSON.stringify(doc), before, id);
  }
});

test("graphic history: an image only when the path passes IMAGE_PATH and the bytes match the recorded sha; X link only for x.com", () => {
  const png = Buffer.from("not really a png, but bytes");
  const sha = createHash("sha256").update(png).digest("hex");
  const dir = tmpApp({});
  fs.mkdirSync(path.join(dir, "public", "data", "challenge-lanes", "graphics"), { recursive: true });
  fs.writeFileSync(path.join(dir, "public", "data", "challenge-lanes", "graphics", "ms-2026-11-02-ms-b.png"), png);
  const doc = real(FIX["ms-b"], (d) => {
    const day = d.runs[0].days[0];
    day.receipts = [
      { seq: 20, type: "GRAPHIC_RENDERED", date: day.date, step: 1, at: "x", source: "x", sha256: "a", packageId: "ms-2026-11-02", imageSha256: sha, imagePath: "/data/challenge-lanes/graphics/ms-2026-11-02-ms-b.png" },
      { seq: 21, type: "APPROVED", date: day.date, step: 1, at: "x", source: "x", sha256: "c", packageId: "ms-2026-11-02" },
      { seq: 22, type: "POSTED", date: day.date, step: 1, at: "x", source: "x", sha256: "d", packageId: "ms-2026-11-02", xPostId: "1", url: "https://x.com/i/status/1", postedAt: "2026-11-02T20:00:03Z" },
    ];
    d.runs[0].days[1].receipts = [
      { seq: 23, type: "GRAPHIC_RENDERED", date: "2026-11-03", step: 1, at: "x", source: "x", sha256: "e", packageId: "ms-2026-11-03", imageSha256: "0".repeat(64), imagePath: "/data/challenge-lanes/graphics/ms-2026-11-02-ms-b.png" },
      { seq: 24, type: "GRAPHIC_RENDERED", date: "2026-11-03", step: 1, at: "x", source: "x", sha256: "f", packageId: "ms-2026-11-03b", imageSha256: sha, imagePath: "https://evil.example/x.png" },
      { seq: 25, type: "POSTED", date: "2026-11-03", step: 1, at: "x", source: "x", sha256: "g", packageId: "ms-2026-11-03", url: "https://evil.example/post" },
    ];
    return d;
  });
  fs.writeFileSync(path.join(dir, "public", "data", "challenge-lanes", "ms-b.json"), JSON.stringify(doc));
  const v = loadChallengeLane({ appDir: dir, laneId: "ms-b" }).view;
  assert.deepEqual(v.graphics.map((g) => [g.packageId, g.approved, g.postUrl, g.imagePath]), [
    ["ms-2026-11-02", true, "https://x.com/i/status/1", "/data/challenge-lanes/graphics/ms-2026-11-02-ms-b.png"],
    ["ms-2026-11-03", false, null, null],
    ["ms-2026-11-03b", false, null, null],
  ]);
  const h = html(React.createElement(LaneCard, { lane: v }));
  assert.ok(h.indexOf("<strong>2026-11-03") < h.indexOf("<strong>2026-11-02"));
  assert.doesNotMatch(h, /evil\.example/);
  assert.equal((h.match(/<img /g) ?? []).length, 1);
  assert.match(read("src/lib/products/challenge-lanes/lane.mjs"), /IMAGE_PATH\.test\(g\.imagePath\)/, "the site reuses the engine's image-path rule");
  assert.match(text(html(React.createElement(LaneCard, { lane: lane.laneView(FIX["ms-b"]) }))), /No graphic has been posted for this run yet\./);
});

test("the pair renders lanes A and B side by side; an unavailable lane says so and invents nothing", () => {
  const lanes = loadProductLanes("bank-builder", { appDir: tmpApp({ "bb-a": real(FIX["bb-a"]) }) });
  assert.deepEqual(lanes.map((l) => [l.laneId, l.status]), [["bb-a", "HELD"], ["bb-b", "UNAVAILABLE"]]);
  const h = html(React.createElement(LanePair, { product: "bank-builder", lanes }));
  const t = text(h);
  assert.match(h, /data-lane-pair="bank-builder"/);
  assert.ok(h.indexOf('data-lane="bb-a"') < h.indexOf('data-lane="bb-b"'));
  assert.match(t, /Lane B .*RECORD NOT PUBLISHED.*The lane record has not been published yet/);
  assert.match(t, /\$100 to \$10,000 in 5 steps/);
  const bLane = h.slice(h.indexOf('data-lane="bb-b"'));
  assert.doesNotMatch(text(bLane), /STEP \d OF/);
  assert.doesNotMatch(bLane, /data-lane-leg=/);
  assert.match(read("src/app/globals.css"), /@media \(min-width: 900px\) \{ \.cl-pair \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); \} \}/);
});

test("pages: /bank-builder and /moonshot read their lanes only through loadProductLanes, before today's card", () => {
  for (const [file, product] of [["src/app/bank-builder/page.tsx", "bank-builder"], ["src/app/moonshot/page.tsx", "moonshot"]]) {
    const src = read(file);
    assert.match(src, new RegExp(`<LanePair product="${product}" lanes=\\{loadProductLanes\\("${product}"\\) as LaneView\\[\\]\\} />`), file);
    assert.ok(src.indexOf("<LanePair") < src.indexOf("<TierBoardSection"), file);
    assert.doesNotMatch(src, /challenge-lanes\/__fixtures__|challenge-lanes\/[a-z-]+\.json/, file);
  }
  const loader = read("src/lib/products/challenge-lanes/load.mjs");
  assert.match(loader, /acceptLaneProjection\(r\.doc, \{ laneId \}\)/);
  assert.match(read("src/lib/products/challenge-lanes/lane.mjs"), /import \{ verifyLaneProjection, IMAGE_PATH \} from "\.\.\/\.\.\/challenge-lanes\/projection\.mjs";/);
  assert.doesNotMatch(read("src/lib/products/challenge-lanes/lane.mjs"), /node:fs|readFileSync/);
  const dev = read("src/app/dev/challenge-lanes-fixture/page.tsx");
  assert.ok(dev.indexOf("if (!parlayFixtureRouteEnabled()) notFound();") < dev.indexOf("view(bbA)"));
});
