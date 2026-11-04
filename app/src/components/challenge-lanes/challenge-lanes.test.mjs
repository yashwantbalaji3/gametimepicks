/**
 * BBM V2 — the website's challenge lanes (SPEC §5) over the engine's public projection `gtp.challenge-lane.public@1`.
 *
 *   loader      one loader reads public/data/challenge-lanes/<laneId>.json and accepts it only through the engine's
 *               verifyLaneProjection plus the site's refusals; no file / tampered / wrong lane / fixture / priced →
 *               an explicit "record not published" lane, never a guess
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
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
process.env.__NEXT_TRAILING_SLASH = "true";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const FIX = Object.fromEntries(["bb-a", "bb-b", "ms-a", "ms-b"].map((id) => [id, JSON.parse(read(`src/lib/products/challenge-lanes/__fixtures__/${id}.fixture.json`))]));

const lane = await import("../../lib/products/challenge-lanes/lane.mjs");
const { loadChallengeLane, loadProductLanes } = await import("../../lib/products/challenge-lanes/load.mjs");
const { syntheticInPlay, syntheticBusted } = await import("../../lib/products/challenge-lanes/__fixtures__/states.mjs");
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

test("the four lanes are the engine's: bb-a/bb-b $100→$10,000 in 3, ms-a/ms-b $25→$1,000 in 5", () => {
  assert.deepEqual(lane.lanesOf("bank-builder"), ["bb-a", "bb-b"]);
  assert.deepEqual(lane.lanesOf("moonshot"), ["ms-a", "ms-b"]);
  assert.deepEqual([ENGINE_LANES["bb-a"].baseCents, ENGINE_LANES["bb-a"].targetCents, ENGINE_LANES["bb-a"].steps], [10000, 1000000, 3]);
  assert.deepEqual([ENGINE_LANES["ms-b"].baseCents, ENGINE_LANES["ms-b"].targetCents, ENGINE_LANES["ms-b"].steps], [2500, 100000, 5]);
  assert.equal(lane.PRICES_ON_SITE, false);
  for (const s of Object.values(STATUS)) assert.ok(lane.SITE_STATUS[s], `engine status ${s} maps to a site status`);
});

test("the fixtures are the engine's replay, accepted only with allowFixture; the site loader refuses them", () => {
  for (const [id, doc] of Object.entries(FIX)) {
    assert.equal(doc.fixture, true, id);
    assert.equal(doc.schema, "gtp.challenge-lane.public@1", id);
    assert.deepEqual(lane.acceptLaneProjection(doc, { laneId: id, allowFixture: true }), { ok: true }, id);
    assert.equal(lane.acceptLaneProjection(doc, { laneId: id }).reason, "fixture file", id);
    assert.deepEqual(lane.acceptLaneProjection(real(doc), { laneId: id }), { ok: true }, `${id} as published`);
  }
  for (const s of [syntheticInPlay(FIX["ms-a"]), syntheticBusted(FIX["ms-b"])]) assert.equal(lane.acceptLaneProjection(s).reason, "fixture file");
  const r = loadChallengeLane({ appDir: tmpApp({ "bb-a": FIX["bb-a"] }), laneId: "bb-a" });
  assert.equal(r.doc, null); assert.equal(r.reason, "fixture file"); assert.equal(r.view.status, "unavailable");
});

test("the one loader: a sealed file renders; absent, unreadable, tampered and wrong-lane files are refused", () => {
  const tampered = real(FIX["bb-b"]); tampered.runs[0].days[0].card.legs[0].selection.teamAbbr = "BOS";
  const dir = tmpApp({ "bb-a": real(FIX["bb-a"]), "bb-b": tampered, "ms-a": real(FIX["ms-b"]), "ms-b": "{not json" });
  assert.equal(loadChallengeLane({ appDir: dir, laneId: "bb-a" }).view.status, "no-card");
  assert.equal(loadChallengeLane({ appDir: dir, laneId: "bb-b" }).reason, "schema or content digest does not verify");
  assert.match(loadChallengeLane({ appDir: dir, laneId: "ms-a" }).reason, /file is lane ms-b, not ms-a/);
  assert.equal(loadChallengeLane({ appDir: dir, laneId: "ms-b" }).reason, "no file");
  assert.equal(loadChallengeLane({ appDir: tmpApp({}), laneId: "bb-a" }).reason, "no file");
  assert.equal(lane.acceptLaneProjection(real(FIX["bb-a"], (d) => ({ ...d, schema: "gtp.challenge-lane@1" }))).reason, "schema or content digest does not verify");
  assert.match(lane.acceptLaneProjection(real(FIX["bb-a"], (d) => ({ ...d, targetCents: 500000 }))).reason, /base\/target\/steps differ/);
  assert.throws(() => loadChallengeLane({ appDir: dir, laneId: "zz" }), /unknown lane/);
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
    const stub = real(FIX["bb-a"], (d) => { d.runs[0].events.push({ seq: 99, type, date: "2026-11-02", step: 1, at: "x", source: "x", withheld: "P1", ...(type === "PAYOUT_COMPUTED" ? { result: "REFUSED", refusals: ["NO_PRICE"] } : {}) }); return d; });
    assert.deepEqual(lane.acceptLaneProjection(stub), { ok: true }, `${type} withheld stub is fine`);
  }
  const bankroll = real(FIX["bb-a"], (d) => { d.current.trackedBankrollWithheld = "P1"; return d; });
  assert.equal(lane.acceptLaneProjection(bankroll).reason, "withheld bankroll printed");
});

test("the real replay: every lane at STEP 1, NO QUALIFYING CARD on Nov 3, Nov 2's unpriced card never reads as a loss", () => {
  for (const [id, doc] of Object.entries(FIX)) {
    const v = lane.laneView(doc);
    assert.equal(v.statusLabel, "NO QUALIFYING CARD", id);
    assert.equal(v.step, 1, id);
    assert.equal(v.rungs[0].state, "active", id);
    assert.equal(v.tracked, id.startsWith("bb") ? "$100" : "$25", id);
    assert.equal(v.today.date, "2026-11-03", id);
    assert.equal(v.today.card, null, id);
    assert.match(v.note, /^No sealed suggested-cards file for 2026-11-03; STEP 1 OF \d is unchanged/, id);
    assert.doesNotMatch(v.note, /^NO_FROZEN_CARD_FILE/, `${id}: the reason code is not shown`);
    const nov2 = v.history[0];
    assert.equal(nov2.date, "2026-11-02"); assert.equal(nov2.statusText, "Not staked · awaiting verified prices"); assert.equal(nov2.staked, false);
    const h = text(html(React.createElement(LaneCard, { lane: v })));
    assert.match(h, /The model card lost, but it was not staked, so the lane did not move\./, id);
    assert.doesNotMatch(h, /BUSTED|Step 1 lost/, id);
    assert.equal(h.split("No sealed suggested-cards file for 2026-11-03").length - 1, 1, `${id}: today's reason prints once`);
  }
  assert.deepEqual(lane.laneView(FIX["bb-a"]).history[0].card.legs.map((l) => [l.teamAbbr, l.outcome]), [["NY", "WIN"], ["DEN", "LOSS"]]);
  assert.deepEqual(lane.laneView(FIX["bb-b"]).history[0].card.legs.map((l) => l.teamAbbr), ["DAL", "SA"]);
});

test("statuses from the engine's: IN PLAY and BUSTED (synthetic), PAUSED, COMPLETE; the busted lane's stake is gone", () => {
  const playing = lane.laneView(syntheticInPlay(FIX["ms-a"]));
  assert.equal(playing.statusLabel, "IN PLAY"); assert.equal(playing.wager, "$25");
  assert.deepEqual(playing.rungs.map((r) => r.state), ["active", "upcoming", "upcoming", "upcoming", "upcoming"]);
  assert.ok(playing.today.card.legs.every((l) => l.outcome === null));
  assert.match(playing.note, /Step 1 of 5 is in play/);
  const busted = lane.laneView(syntheticBusted(FIX["ms-b"]));
  assert.equal(busted.statusLabel, "BUSTED"); assert.equal(busted.tracked, "$0");
  assert.match(busted.note, /^Busted at step 1 of 5\. A new run starts only after a founder-approved restart\.$/);
  assert.deepEqual(busted.rungs.map((r) => r.state), ["failed", "upcoming", "upcoming", "upcoming", "upcoming"]);
  assert.match(text(html(React.createElement(LaneCard, { lane: busted }))), /Step 1 lost\./);
  const as = (status, extra = {}) => lane.laneView(real(FIX["bb-a"], (d) => { d.current = { ...d.current, status, statusReason: "SLATE_POSTPONED: the slate was postponed.", ...extra }; return d; }));
  assert.equal(as("PAUSED").statusLabel, "PAUSED"); assert.equal(as("PAUSED").note, "The slate was postponed.");
  assert.equal(as("UNPRICED").statusLabel, "PAUSED");
  const done = as("COMPLETE", { step: 4 });
  assert.equal(done.statusLabel, "COMPLETE"); assert.equal(done.step, 3); assert.deepEqual(done.rungs.map((r) => r.state), ["completed", "completed", "completed"]);
  const won = as("READY", { step: 2, trackedBankrollCents: null, trackedBankrollWithheld: "P1" });
  assert.deepEqual(won.rungs.map((r) => r.state), ["completed", "active", "upcoming"]);
  assert.equal(won.tracked, lane.AWAITING_PRICES, "a won step's bankroll is price-derived: never printed before P1");
});

test("the view never mutates the accepted document (a cached file must still verify on the next render)", () => {
  for (const [id, doc] of Object.entries(FIX)) {
    const before = JSON.stringify(doc);
    lane.laneView(doc); lane.laneView(doc);
    assert.equal(JSON.stringify(doc), before, id);
  }
});

test("the lane card: STEP k OF N, meter, legs with the projection label, payout and profit unpriced, one factual line", () => {
  const v = lane.laneView(syntheticInPlay(FIX["ms-a"]));
  const h = html(React.createElement(LaneCard, { lane: v }));
  const t = text(h);
  assert.match(t, /STEP 1 OF 5/);
  assert.match(h, /role="img"[^>]*data-lane-meter=""/);
  assert.match(t, /Ladder progress Step 1 of 5 · goal \$1,000/);
  assert.equal((h.match(/data-lane-unpriced=""/g) ?? []).length, 2);
  assert.equal((t.match(/Awaiting verified prices/g) ?? []).length, 2);
  assert.equal((h.match(/data-lane-leg=/g) ?? []).length, 4);
  assert.equal((t.match(/MODEL PROJECTION/g) ?? []).length, 4);
  assert.match(t, /PHI \(official side\).*⚑ One of the favoured team/);
  assert.match(t, /Tracked challenge · no real wager placed/);
  assert.doesNotMatch(t, /\b(ESTIMATE|est\.|projected median|odds)\b/i);
  assert.deepEqual([...new Set(t.match(/\$[\d,]+/g))].sort(), ["$1,000", "$25"]);
  assert.doesNotMatch(t, /not betting advice|FOUNDER REVIEW|NOT A SPORTSBOOK OFFER/i);
});

test("graphic history: every rendered graphic newest first, an X link only for an x.com receipt, images only from /data/challenge-lanes/", () => {
  const doc = real(FIX["ms-b"], (d) => {
    const day = d.runs[0].days[0];
    day.receipts = [
      { seq: 20, type: "GRAPHIC_RENDERED", date: day.date, step: 1, at: "x", source: "x", sha256: "a", packageId: "ms-b-2026-11-02", imageSha256: "b", imagePath: "/data/challenge-lanes/graphics/ms-b-2026-11-02.png" },
      { seq: 21, type: "APPROVED", date: day.date, step: 1, at: "x", source: "x", sha256: "c", packageId: "ms-b-2026-11-02" },
      { seq: 22, type: "POSTED", date: day.date, step: 1, at: "x", source: "x", sha256: "d", packageId: "ms-b-2026-11-02", xPostId: "1", url: "https://x.com/i/status/1", postedAt: "2026-11-02T20:00:03Z" },
    ];
    d.runs[0].days[1].receipts = [
      { seq: 23, type: "GRAPHIC_RENDERED", date: "2026-11-03", step: 1, at: "x", source: "x", sha256: "e", packageId: "ms-b-2026-11-03", imagePath: "https://evil.example/x.png" },
      { seq: 24, type: "GRAPHIC_RENDERED", date: "2026-11-03", step: 1, at: "x", source: "x", sha256: "f", packageId: "ms-b-2026-11-03b", imagePath: "/data/challenge-lanes/other.png" },
      { seq: 25, type: "GRAPHIC_RENDERED", date: "2026-11-03", step: 1, at: "x", source: "x", sha256: "g", packageId: "ms-b-2026-11-03c", imagePath: "/data/challenge-lanes/graphics/..x.png" },
    ];
    return d;
  });
  const v = lane.laneView(doc);
  assert.deepEqual(v.graphics.map((g) => [g.date, g.approved, g.postUrl, g.imagePath]), [
    ["2026-11-02", true, "https://x.com/i/status/1", "/data/challenge-lanes/graphics/ms-b-2026-11-02.png"],
    ["2026-11-03", false, null, null],
    ["2026-11-03", false, null, null],
    ["2026-11-03", false, null, null],
  ]);
  assert.match(read("src/lib/products/challenge-lanes/lane.mjs"), /IMAGE_PATH\.test\(g\.imagePath\)/, "the site reuses the engine's image-path rule");
  const h = html(React.createElement(LaneCard, { lane: v }));
  assert.ok(h.indexOf("<strong>2026-11-03") < h.indexOf("<strong>2026-11-02"));
  assert.equal((h.match(/href="https:\/\/x\.com\/i\/status\/1"/g) ?? []).length, 1);
  assert.doesNotMatch(h, /evil\.example/);
  assert.match(h, /<img src="\/data\/challenge-lanes\/graphics\/ms-b-2026-11-02\.png"/);
  assert.match(text(html(React.createElement(LaneCard, { lane: lane.laneView(FIX["ms-b"]) }))), /No graphic has been posted for this run yet\./);
});

test("the pair renders lanes A and B side by side; an unavailable lane says so and invents nothing", () => {
  const lanes = loadProductLanes("bank-builder", { appDir: tmpApp({ "bb-a": real(FIX["bb-a"]) }) });
  assert.deepEqual(lanes.map((l) => [l.laneId, l.status]), [["bb-a", "no-card"], ["bb-b", "unavailable"]]);
  const h = html(React.createElement(LanePair, { product: "bank-builder", lanes }));
  const t = text(h);
  assert.match(h, /data-lane-pair="bank-builder"/);
  assert.ok(h.indexOf('data-lane="bb-a"') < h.indexOf('data-lane="bb-b"'));
  assert.match(t, /Lane B .*RECORD NOT PUBLISHED.*The lane record has not been published yet/);
  assert.match(t, /\$100 to \$10,000 in 3 steps/);
  const bLane = h.slice(h.indexOf('data-lane="bb-b"'));
  assert.doesNotMatch(text(bLane), /STEP \d OF/);
  assert.doesNotMatch(bLane, /data-lane-leg=/);
  assert.match(read("src/app/globals.css"), /@media \(min-width: 900px\) \{ \.cl-pair \{ grid-template-columns: 1fr 1fr; \} \}/);
});

test("pages: /bank-builder and /moonshot read their lanes only through loadProductLanes, before today's card", () => {
  for (const [file, product] of [["src/app/bank-builder/page.tsx", "bank-builder"], ["src/app/moonshot/page.tsx", "moonshot"]]) {
    const src = read(file);
    assert.match(src, new RegExp(`<LanePair product="${product}" lanes=\\{loadProductLanes\\("${product}"\\) as LaneView\\[\\]\\} />`), file);
    assert.ok(src.indexOf("<LanePair") < src.indexOf("<TierBoardSection"), file);
    assert.doesNotMatch(src, /challenge-lanes\/__fixtures__|challenge-lanes\/[a-z-]+\.json/, file);
  }
  const loader = read("src/lib/products/challenge-lanes/load.mjs");
  assert.match(loader, /acceptLaneProjection\(doc, \{ laneId \}\)/);
  assert.match(read("src/lib/products/challenge-lanes/lane.mjs"), /import \{ verifyLaneProjection, IMAGE_PATH \} from "\.\.\/\.\.\/challenge-lanes\/projection\.mjs";/);
  assert.doesNotMatch(read("src/lib/products/challenge-lanes/lane.mjs"), /node:fs|readFileSync/);
  const dev = read("src/app/dev/challenge-lanes-fixture/page.tsx");
  assert.ok(dev.indexOf("if (!parlayFixtureRouteEnabled()) notFound();") < dev.indexOf("view(bbA)"));
});
