/**
 * BBM V2 — the website's challenge lanes (SPEC §5): one verifying loader, lanes A and B per product, the same facts
 * as the X graphics, and no price or payout until founder decision P1.
 *
 *   loader      one loader reads public/data/challenge-lanes/<laneId>.json; no file / tampered / fixture / broken chain
 *               / private event / any price key → an explicit "record not published" lane, never a guess
 *   view        STEP k OF N, ladder rungs, status (IN PLAY · BUSTED · PAUSED · NO QUALIFYING CARD · COMPLETE)
 *   unpriced    payout and profit always read "Awaiting verified prices"; no $ amount but base, target and stake
 *   pages       /bank-builder and /moonshot render both lanes through loadProductLanes, before today's card
 *
 * Run (from app/): npx tsx --test src/components/challenge-lanes/challenge-lanes.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
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
const { default: LaneCard } = await import("./lane-card.tsx");
const { default: LanePair } = await import("./lane-pair.tsx");

const digest = (body) => createHash("sha256").update(JSON.stringify(body)).digest("hex");
const html = (el) => renderToStaticMarkup(el);
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ");
/** A real (non-fixture) sealed copy of a fixture, as the engine would publish it. */
const real = (id, mutate = (d) => d) => {
  const { fixture: _f, fixtureNote: _n, contentSha256: _c, ...rest } = structuredClone(FIX[id]);
  return lane.sealChallengeLane(mutate(rest));
};
const tmpApp = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-"));
  fs.mkdirSync(path.join(dir, "public", "data", "challenge-lanes"), { recursive: true });
  for (const [id, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, "public", "data", "challenge-lanes", `${id}.json`), typeof body === "string" ? body : JSON.stringify(body));
  return dir;
};

test("SPEC §1 lanes: bb-a/bb-b $100→$10,000 in 3, ms-a/ms-b $25→$1,000 in 5", () => {
  assert.deepEqual(lane.lanesOf("bank-builder"), ["bb-a", "bb-b"]);
  assert.deepEqual(lane.lanesOf("moonshot"), ["ms-a", "ms-b"]);
  assert.deepEqual([lane.LANES["bb-a"].base, lane.LANES["bb-a"].target, lane.LANES["bb-a"].steps], [100, 10000, 3]);
  assert.deepEqual([lane.LANES["ms-b"].base, lane.LANES["ms-b"].target, lane.LANES["ms-b"].steps], [25, 1000, 5]);
  assert.equal(lane.PRICES_ON_SITE, false);
});

test("the fixtures verify only with allowFixture, and the site loader refuses them", () => {
  for (const [id, doc] of Object.entries(FIX)) {
    assert.equal(doc.fixture, true, id);
    assert.deepEqual(lane.verifyChallengeLane(doc, { laneId: id, allowFixture: true }), { ok: true }, id);
    assert.equal(lane.verifyChallengeLane(doc, { laneId: id }).reason, "fixture file", id);
  }
  const dir = tmpApp({ "bb-a": FIX["bb-a"] });
  const r = loadChallengeLane({ appDir: dir, laneId: "bb-a" });
  assert.equal(r.doc, null);
  assert.equal(r.reason, "fixture file");
  assert.equal(r.view.status, "unavailable");
});

test("the one loader: a sealed real file renders; absent, tampered, wrong-lane and broken-chain files are refused", () => {
  const good = real("bb-a");
  const tampered = real("bb-b"); tampered.runs[0].events[0].reason = "edited after sealing";
  const dir = tmpApp({ "bb-a": good, "bb-b": tampered, "ms-a": real("ms-b"), "ms-b": "{not json" });
  assert.equal(loadChallengeLane({ appDir: dir, laneId: "bb-a" }).view.status, "in-play");
  assert.equal(loadChallengeLane({ appDir: dir, laneId: "bb-b" }).reason, "content digest does not verify");
  assert.match(loadChallengeLane({ appDir: dir, laneId: "ms-a" }).reason, /file is lane ms-b, not ms-a/);
  assert.equal(loadChallengeLane({ appDir: dir, laneId: "ms-b" }).reason, "no file");
  assert.equal(loadChallengeLane({ appDir: tmpApp({}), laneId: "bb-a" }).reason, "no file");
  // a chain broken under a recomputed content digest is still refused by the chain check
  const chainDoc = structuredClone(good); chainDoc.runs[0].events[1].prevSha256 = "f".repeat(64);
  const { contentSha256: _c, ...body } = chainDoc;
  const resealedDigestOnly = { ...body, contentSha256: digest(body) };
  assert.match(lane.verifyChallengeLane(resealedDigestOnly).reason, /hash chain broken in run-1/);
  const evDoc = structuredClone(good); evDoc.runs[0].events[1].stake = 101;
  const { contentSha256: _d, ...body2 } = evDoc;
  assert.match(lane.verifyChallengeLane({ ...body2, contentSha256: digest(body2) }).reason, /event digest does not verify/);
});

test("a public file carrying a price, a price-derived field or a private event is refused whole", () => {
  for (const [key, val] of [["price", -110], ["odds", "+364"], ["book", "SomeBook"], ["grossPayout", 464], ["profit", 364], ["bankrollAfter", 464], ["provider", "x"]]) {
    const leaky = real("bb-a", (d) => { d.runs[0].events[1][key] = val; return d; });
    assert.match(lane.verifyChallengeLane(leaky).reason, new RegExp(`price field in a public file \\(.*\\.${key}\\)`), key);
  }
  const nested = real("bb-a", (d) => { d.runs[0].events[0].legs[0].selection.price = 1.5; return d; });
  assert.match(lane.verifyChallengeLane(nested).reason, /price field/);
  for (const type of ["PRICE_VERIFIED", "PAYOUT_COMPUTED"]) {
    const priv = real("bb-a", (d) => { d.runs[0].events.push({ type, date: "2026-11-02", step: 1, at: "x", source: "x" }); return d; });
    assert.match(lane.verifyChallengeLane(priv).reason, new RegExp(`${type} is not allowed`));
  }
  const badHeader = real("bb-a", (d) => { d.runs[0].header.target = 5000; return d; });
  assert.match(lane.verifyChallengeLane(badHeader).reason, /base\/target\/steps differ/);
});

test("statuses: IN PLAY, NO QUALIFYING CARD, BUSTED from the fixtures; PAUSED and COMPLETE from events", () => {
  const v = (doc) => lane.laneView(doc);
  const a = v(FIX["bb-a"]);
  assert.equal(a.statusLabel, "IN PLAY"); assert.equal(a.step, 1);
  assert.deepEqual(a.rungs.map((r) => r.state), ["active", "upcoming", "upcoming"]);
  assert.deepEqual(a.card.legs.map((l) => l.teamAbbr), ["NY", "DEN"]);
  const b = v(FIX["bb-b"]);
  assert.equal(b.statusLabel, "NO QUALIFYING CARD"); assert.match(b.note, /still step 1 of 3/); assert.equal(b.card, null);
  const busted = v(FIX["ms-b"]);
  assert.equal(busted.statusLabel, "BUSTED"); assert.match(busted.note, /Busted at step 1 of 5\. A new run starts only after a founder-approved restart/);
  assert.deepEqual(busted.rungs.map((r) => r.state), ["failed", "upcoming", "upcoming", "upcoming", "upcoming"]);
  assert.deepEqual(busted.settledSteps[0].legs.map((l) => l.outcome), ["WIN", "LOSS"]);
  assert.equal(busted.tracked, "$0", "the all-in stake of $25 was lost");
  const paused = v(real("bb-b", (d) => { d.runs[0].events = [{ type: "STATUS", date: "2026-11-03", step: 1, at: "x", source: "x", status: "PAUSED", reason: "slate postponed" }]; return d; }));
  assert.equal(paused.statusLabel, "PAUSED"); assert.match(paused.note, /slate postponed/);
  const unpriced = v(real("bb-b", (d) => { d.runs[0].events = [{ type: "STATUS", date: "2026-11-03", step: 1, at: "x", source: "x", status: "UNPRICED" }]; return d; }));
  assert.equal(unpriced.statusLabel, "PAUSED"); assert.match(unpriced.note, /awaiting verified prices/);
  const done = v(real("bb-a", (d) => { d.runs[0].events = [{ type: "STATUS", date: "2026-11-09", step: 3, at: "x", source: "x", status: "COMPLETE" }]; return d; }));
  assert.equal(done.statusLabel, "COMPLETE"); assert.deepEqual(done.rungs.map((r) => r.state), ["completed", "completed", "completed"]);
  const won = v(real("ms-a", (d) => {
    const ev = d.runs[0].events; const frozen = ev[0];
    d.runs[0].events = [frozen, ...frozen.legs.map((l) => ({ type: "LEG_SETTLED", date: "2026-11-03", step: 1, at: "x", source: "ESPN final", gameId: l.gameId, outcome: "WIN" })), { type: "STEP_SETTLED", date: "2026-11-03", step: 1, at: "x", source: "x", outcome: "WIN" }];
    return d;
  }));
  assert.equal(won.step, 2);
  assert.deepEqual(won.rungs.map((r) => r.state), ["completed", "active", "upcoming", "upcoming", "upcoming"]);
  assert.equal(won.tracked, lane.AWAITING_PRICES, "a won step's bankroll is price-derived: never printed before P1");
  for (const s of Object.values(lane.LANE_STATUS)) assert.ok(s.glyph && s.label);
});

test("the view never mutates the verified document (a cached file must still verify on the next render)", () => {
  for (const [id, doc] of Object.entries(FIX)) {
    const before = JSON.stringify(doc);
    lane.laneView(doc); lane.laneView(doc);
    assert.equal(JSON.stringify(doc), before, id);
    assert.deepEqual(lane.verifyChallengeLane(doc, { allowFixture: true }), { ok: true }, id);
  }
});

test("the lane card: STEP k OF N, meter, legs with MODEL PROJECTION labels, payout and profit unpriced, one factual line", () => {
  const h = html(React.createElement(LaneCard, { lane: lane.laneView(FIX["ms-a"]) }));
  const t = text(h);
  assert.match(t, /STEP 1 OF 5/);
  assert.match(h, /data-lane-meter=""[^>]*role="img"|role="img"[^>]*data-lane-meter=""/);
  assert.match(t, /Ladder progress Step 1 of 5 · goal \$1,000/);
  assert.equal((h.match(/data-lane-unpriced=""/g) ?? []).length, 2);
  assert.equal((t.match(/Awaiting verified prices/g) ?? []).length, 2);
  assert.equal((h.match(/data-lane-leg=/g) ?? []).length, 4);
  assert.equal((t.match(/MODEL WIN PROBABILITY/g) ?? []).length, 4);
  assert.match(t, /PHI \(official side\).*⚑ One of the favoured team/);
  assert.match(t, /Tracked challenge · no real wager placed/);
  assert.doesNotMatch(t, /\b(ESTIMATE|est\.|projected median|odds|payout of \$|profit of \$)\b/i);
  // the only dollar amounts are the lane's fixed base, target and tracked stake
  assert.deepEqual([...new Set(t.match(/\$[\d,]+/g))].sort(), ["$1,000", "$25"]);
  assert.doesNotMatch(t, /not betting advice|FOUNDER REVIEW|NOT A SPORTSBOOK OFFER/i);
});

test("graphic history lists every rendered graphic, newest first; an X link only for an x.com receipt", () => {
  const withPost = real("ms-b", (d) => {
    d.runs[0].events.push({ type: "POSTED", date: "2026-11-02", step: 1, at: "2026-11-02T20:00:00Z", source: "console", packageId: "ms-b-2026-11-02", url: "https://x.com/gtp/status/1" });
    d.runs[0].events.push({ type: "GRAPHIC_RENDERED", date: "2026-11-03", step: 1, at: "x", source: "x", packageId: "ms-b-2026-11-03", imageSha: "abc", imagePath: "/data/challenge-lanes/graphics/ms-b-2026-11-03.png", alt: "Lane B, busted" });
    d.runs[0].events.push({ type: "POSTED", date: "2026-11-03", step: 1, at: "x", source: "console", packageId: "ms-b-2026-11-03", url: "https://evil.example/x" });
    return d;
  });
  const v = lane.laneView(withPost);
  assert.deepEqual(v.graphics.map((g) => g.date), ["2026-11-01", "2026-11-02", "2026-11-03"]);
  const h = html(React.createElement(LaneCard, { lane: v }));
  assert.ok(h.indexOf("2026-11-03") < h.indexOf("2026-11-01 </strong>") || h.indexOf("<strong>2026-11-03") < h.indexOf("<strong>2026-11-01"));
  assert.equal((h.match(/href="https:\/\/x\.com\/gtp\/status\/1"/g) ?? []).length, 1);
  assert.doesNotMatch(h, /evil\.example/);
  assert.match(h, /<img src="\/data\/challenge-lanes\/graphics\/ms-b-2026-11-03\.png" alt="Lane B, busted"/);
});

test("the pair renders lanes A and B side by side; an unavailable lane says so and invents nothing", () => {
  const lanes = loadProductLanes("bank-builder", { appDir: tmpApp({ "bb-a": real("bb-a") }) });
  assert.deepEqual(lanes.map((l) => [l.laneId, l.status]), [["bb-a", "in-play"], ["bb-b", "unavailable"]]);
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
  // the loader is the only module that reads a lane file
  const loader = read("src/lib/products/challenge-lanes/load.mjs");
  assert.match(loader, /verifyChallengeLane\(doc, \{ laneId \}\)/);
  assert.doesNotMatch(read("src/lib/products/challenge-lanes/lane.mjs"), /node:fs|readFileSync/);
  // the dev fixture route is gated before any fixture renders
  const dev = read("src/app/dev/challenge-lanes-fixture/page.tsx");
  assert.ok(dev.indexOf("if (!parlayFixtureRouteEnabled()) notFound();") < dev.indexOf("view(bbA)"));
});
