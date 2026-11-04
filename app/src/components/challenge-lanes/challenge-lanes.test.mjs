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
const { loadChallengeLane, loadProductLanes, readTeamColours } = await import("../../lib/products/challenge-lanes/load.mjs");
const { syntheticActiveStep2, syntheticLostAwaitingRestart } = await import("../../lib/products/challenge-lanes/__fixtures__/states.mjs");
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
});

test("the fixtures are the engine's replay, accepted only with allowFixture; the site loader refuses them", () => {
  for (const [id, doc] of Object.entries(FIX)) {
    assert.equal(doc.fixture, true, id);
    assert.equal(doc.schema, "gtp.challenge-lane.public@1", id);
    assert.deepEqual(lane.acceptLaneProjection(doc, { laneId: id, allowFixture: true }), { ok: true }, id);
    assert.equal(lane.acceptLaneProjection(doc, { laneId: id }).reason, "fixture file", id);
    assert.deepEqual(lane.acceptLaneProjection(real(doc), { laneId: id }), { ok: true }, `${id} as published`);
  }
  for (const s of [syntheticActiveStep2(FIX["ms-a"], FIX["ms-b"]), syntheticLostAwaitingRestart(FIX["ms-b"], FIX["ms-a"])]) {
    assert.deepEqual(lane.acceptLaneProjection(s, { allowFixture: true }), { ok: true });
    assert.equal(lane.acceptLaneProjection(s).reason, "fixture file");
  }
  const r = loadChallengeLane({ appDir: tmpApp({ "bb-a": FIX["bb-a"] }), laneId: "bb-a" });
  assert.equal(r.doc, null); assert.equal(r.reason, "fixture file"); assert.equal(r.view.status, "UNAVAILABLE");
});

test("the one loader: a sealed file renders; absent, unreadable, tampered and wrong-lane files are refused", () => {
  const tampered = real(FIX["bb-b"]); tampered.runs[0].days[0].card.legs[0].selection.teamAbbr = "BOS";
  const dir = tmpApp({ "bb-a": real(FIX["bb-a"]), "bb-b": tampered, "ms-a": real(FIX["ms-b"]), "ms-b": "{not json" });
  assert.equal(loadChallengeLane({ appDir: dir, laneId: "bb-a" }).view.status, "HELD");
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

test("rev 2 status vocabulary: every engine status maps to ACTIVE / WON / LOST / HELD / COMPLETED / FINISHED SHORT", () => {
  assert.deepEqual(Object.keys(lane.LANE_STATUS).filter((k) => k !== "UNAVAILABLE"), ["ACTIVE", "WON", "LOST", "HELD", "COMPLETED", "FINISHED_SHORT"]);
  for (const s of Object.values(STATUS)) assert.ok(lane.LANE_STATUS[lane.PUBLIC_STATUS_OF[s]], `engine status ${s}`);
  assert.equal(lane.PUBLIC_STATUS_OF.UNPRICED, "HELD"); assert.equal(lane.PUBLIC_STATUS_OF.NO_ELIGIBLE_CARD, "HELD");
  assert.equal(lane.PUBLIC_STATUS_OF.PENDING_VOID_REVIEW, "HELD"); assert.equal(lane.PUBLIC_STATUS_OF.AWAITING_RESTART_APPROVAL, "LOST");
  assert.equal(lane.PUBLIC_STATUS_OF.FINISHED_SHORT, "FINISHED_SHORT");
  for (const v of Object.values(lane.LANE_STATUS)) assert.ok(v.glyph && v.label);
});

test("the real replay: every lane HELD at STEP 1 on Nov 3 with the reason; Nov 2's unpriced card never reads as a loss", () => {
  for (const [id, doc] of Object.entries(FIX)) {
    const v = lane.laneView(doc);
    assert.equal(v.statusLabel, "HELD", id);
    assert.equal(v.step, 1, id);
    assert.equal(v.rungs[0].state, "active", id);
    assert.equal(v.tracked, id.startsWith("bb") ? "$100" : "$25", id);
    assert.equal(v.toTarget, id.startsWith("bb") ? "$9,900" : "$975", id);
    assert.equal(v.current, null, `${id}: no card on Nov 3`);
    assert.match(v.note, /^No sealed suggested-cards file for 2026-11-03; STEP 1 OF \d is unchanged/, id);
    assert.deepEqual(v.story.map((d) => d.date), ["2026-11-03", "2026-11-02"], id);
    const nov2 = v.story[1];
    assert.equal(nov2.statusText, "Held · not staked, awaiting verified prices"); assert.equal(nov2.staked, false);
    const h = text(html(React.createElement(LaneCard, { lane: v })));
    assert.match(h, /The model card lost, but it was not staked, so the lane did not move\./, id);
    assert.doesNotMatch(h, /\bLOST\b|Step 1 lost/, id);
    assert.equal(h.split("No sealed suggested-cards file for 2026-11-03").length - 1, 1, `${id}: the reason prints once`);
  }
  assert.deepEqual(lane.laneView(FIX["bb-a"]).story[1].legs.map((l) => [l.teamAbbr, l.outcome]), [["NY", "WIN"], ["DEN", "LOSS"]]);
  assert.deepEqual(lane.laneView(FIX["bb-b"]).story[1].legs.map((l) => l.teamAbbr), ["DAL", "SA"]);
});

test("ACTIVE on step 2 after a won step 1; LOST awaiting restart; COMPLETED; the won bankroll stays withheld (P1)", () => {
  const active = lane.laneView(syntheticActiveStep2(FIX["ms-a"], FIX["ms-b"]));
  assert.equal(active.statusLabel, "ACTIVE"); assert.equal(active.step, 2); assert.equal(active.cleared, 1);
  assert.deepEqual(active.rungs.map((r) => r.state), ["completed", "active", "upcoming", "upcoming", "upcoming"]);
  assert.equal(active.tracked, lane.AWAITING_PRICES); assert.equal(active.toTarget, null);
  assert.equal(active.pace.state, "unpriced");
  assert.deepEqual(active.current.legs.map((l) => l.teamAbbr), ["ATL", "DAL", "HOU", "LAC"]);
  assert.deepEqual(active.story.map((d) => [d.date, d.statusText]), [["2026-11-03", "Active"], ["2026-11-02", "Won"]]);
  const lost = lane.laneView(syntheticLostAwaitingRestart(FIX["ms-b"], FIX["ms-a"]));
  assert.equal(lost.statusLabel, "LOST"); assert.equal(lost.tracked, "$0"); assert.equal(lost.toTarget, null); assert.equal(lost.wager, null); assert.equal(lost.pace, null);
  assert.equal(lost.note, "Lost at step 2 of 5. A new run starts only after a founder-approved restart.");
  assert.deepEqual(lost.rungs.map((r) => r.state), ["completed", "failed", "upcoming", "upcoming", "upcoming"]);
  assert.equal(lost.story[0].result, "Step 2 lost."); assert.equal(lost.story[1].result, "Step 1 won.");
  assert.deepEqual(lost.story[0].legs.map((l) => l.outcome), ["WIN", "LOSS", "WIN", "WIN"]);
  const as = (status, extra = {}) => lane.laneView(real(FIX["ms-a"], (d) => { d.current = { ...d.current, status, statusReason: "SLATE_POSTPONED: the slate was postponed.", ...extra }; return d; }));
  assert.equal(as("PAUSED").statusLabel, "HELD"); assert.equal(as("PAUSED").note, "The slate was postponed.");
  const done = as("COMPLETE", { step: 6 });
  assert.equal(done.statusLabel, "COMPLETED"); assert.equal(done.step, 5); assert.ok(done.rungs.every((r) => r.state === "completed"));
  assert.equal(as("FINISHED_SHORT", { step: 6 }).statusLabel, "FINISHED SHORT");
});

test("milestones and pace: SPEC rev 2 defaults on a five-step lane until the projection carries its own", () => {
  const v = lane.laneView(FIX["ms-a"]);
  assert.equal(v.milestoneSource, "spec-rev2-default");
  assert.deepEqual(v.rungs.map((r) => r.milestone), ["$75", "$180", "$360", "$650", "$1,000"]);
  assert.deepEqual(v.pace, { state: "on", text: "On pace · next milestone $75" });
  assert.deepEqual(lane.SPEC_REV2_MILESTONES_CENTS["bank-builder"], [10000, 30000, 90000, 270000, 650000, 1000000]);
  const behind = lane.laneView(real(FIX["ms-a"], (d) => { d.runs[0].days[0] = { ...d.runs[0].days[0], stepOutcome: "WIN" }; d.current = { ...d.current, step: 2, trackedBankrollCents: 5000 }; return d; }));
  assert.equal(behind.pace.text, "Behind pace by $25 · milestone $75");
  const own = lane.laneView(real(FIX["ms-a"], (d) => ({ ...d, milestonesCents: [2500, 5000, 10000, 20000, 50000, 100000] })));
  assert.equal(own.milestoneSource, "projection"); assert.equal(own.rungs[0].milestone, "$50");
  assert.equal(lane.laneView(FIX["bb-a"]).milestoneSource, null, "the replay's 3-step Bank Builder lane gets no 5-step milestones");
});

test("SITE/SOCIAL CONSISTENCY: the site shows exactly the projection's step, bankroll, legs, results and status (what the graphics read)", () => {
  const docs = [...Object.values(FIX), syntheticActiveStep2(FIX["ms-a"], FIX["ms-b"]), syntheticLostAwaitingRestart(FIX["ms-b"], FIX["ms-a"]), syntheticActiveStep2(FIX["bb-a"], FIX["bb-b"])];
  for (const doc of docs) {
    const v = lane.laneView(doc);
    const run = doc.runs.at(-1);
    assert.equal(`STEP ${v.step} OF ${v.steps}`, doc.current.stepText, `${doc.laneId} step`);
    assert.equal(v.steps, doc.steps);
    const expectBankroll = lane.PUBLIC_STATUS_OF[doc.current.status] === "LOST" ? "$0" : doc.current.trackedBankrollWithheld ? lane.AWAITING_PRICES : `$${(doc.current.trackedBankrollCents / 100).toLocaleString("en-US")}`;
    assert.equal(v.tracked, expectBankroll, `${doc.laneId} bankroll`);
    assert.equal(v.status, lane.PUBLIC_STATUS_OF[doc.current.status], `${doc.laneId} status`);
    assert.equal(v.cleared, run.days.filter((d) => d.stepOutcome === "WIN").length, `${doc.laneId} steps cleared`);
    for (const [i, day] of [...run.days].reverse().entries()) {
      const sv = v.story[i];
      assert.equal(sv.date, day.date); assert.equal(sv.step, day.step);
      assert.deepEqual(sv.legs.map((l) => [l.legId, l.teamAbbr, l.projection]), (day.card?.legs ?? []).map((l) => [l.legId, l.selection.teamAbbr, l.probabilityShown]), `${doc.laneId} ${day.date} legs`);
      assert.deepEqual(sv.legs.map((l) => l.outcome ?? "PENDING"), (day.legResults ?? []).map((r) => r.outcome), `${doc.laneId} ${day.date} results`);
    }
    if (v.current) assert.equal(v.current.date, run.days.at(-1).date);
  }
});

test("the lane card mirrors the graphic: product + lane chip, STEP k OF N, lit ladder, start/tracked/goal, team-marked legs, unpriced payout", () => {
  const v = lane.laneView(syntheticActiveStep2(FIX["ms-a"], FIX["ms-b"]), { teams: readTeamColours(APP) });
  const h = html(React.createElement(LaneCard, { lane: v }));
  const t = text(h);
  assert.match(t, /Moonshot Lane A run-1 ● ACTIVE/);
  assert.match(t, /STEP 2 OF 5/);
  assert.match(h, /role="img"[^>]*data-lane-meter=""/);
  assert.match(t, /Start \$25 Tracked bankroll · settled Awaiting verified prices Goal · hypothetical \$1,000/);
  assert.equal((h.match(/data-rung-state="completed"/g) ?? []).length, 1);
  assert.equal((h.match(/data-lane-unpriced=""/g) ?? []).length, 1);
  assert.match(t, /Potential payout · profit Awaiting verified prices/);
  assert.match(t, /ATLANTA HAWKS|Atlanta Hawks/);
  assert.match(h, /class="cl-leg cl-leg--team" style="--cl-team:#[0-9A-Fa-f]{6};--cl-team-ink:#[0-9A-Fa-f]{6}"/);
  assert.match(t, /ATL @ IND · 7:30 PM ET/);
  assert.equal((t.match(/MODEL WIN PROBABILITY/g) ?? []).length, 4 + 4, "the current step's 4 legs once, plus step 1's 4 in the story");
  assert.match(t, /2026-11-03 · step 2 · Active The selections above\./);
  assert.match(t, /Flag One of the favoured team/);
  assert.match(t, /Tracked challenge · no real wager placed/);
  assert.doesNotMatch(t, /\b(ESTIMATE|est\.|projected median|odds)\b/i);
  assert.deepEqual([...new Set(t.match(/\$[\d,]+/g))].sort(), ["$1,000", "$180", "$25", "$360", "$650", "$75"]);
  assert.doesNotMatch(t, /not betting advice|FOUNDER REVIEW|NOT A SPORTSBOOK OFFER/i);
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
  assert.match(t, /\$100 to \$10,000 in 3 steps/);
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
  assert.match(loader, /acceptLaneProjection\(doc, \{ laneId \}\)/);
  assert.match(read("src/lib/products/challenge-lanes/lane.mjs"), /import \{ verifyLaneProjection, IMAGE_PATH \} from "\.\.\/\.\.\/challenge-lanes\/projection\.mjs";/);
  assert.doesNotMatch(read("src/lib/products/challenge-lanes/lane.mjs"), /node:fs|readFileSync/);
  const dev = read("src/app/dev/challenge-lanes-fixture/page.tsx");
  assert.ok(dev.indexOf("if (!parlayFixtureRouteEnabled()) notFound();") < dev.indexOf("view(bbA)"));
});
