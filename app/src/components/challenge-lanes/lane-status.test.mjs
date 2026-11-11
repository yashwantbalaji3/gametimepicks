/**
 * BBM site slice (2026-11-09): /bank-builder and /moonshot read the canonical lane projections. Run:
 *   npx tsx --test src/components/challenge-lanes/lane-status.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const APP = process.cwd();
const { readLaneProjection } = await import("../../lib/challenge-lanes/public-reader.mjs");
const { LANE_IDS, LANES } = await import("../../lib/challenge-lanes/lanes.mjs");
const { laneStatusView } = await import("../../lib/products/challenge-lanes/lane-status.mjs");
const { loadProductLaneStatus } = await import("../../lib/products/challenge-lanes/load-lane-status.mjs");
const { default: LaneStatus } = await import("./lane-status.tsx");

const docs = Object.fromEntries(LANE_IDS.map((id) => { const r = readLaneProjection({ appDir: APP, laneId: id }); assert.ok(r.ok, `${id}: ${r.refusal}`); return [id, r.doc]; }));
const html = (product) => renderToStaticMarkup(React.createElement(LaneStatus, { product, lanes: loadProductLaneStatus(product) }));
const card = (h, id) => new RegExp(`<article[^>]*data-lane="${id}"[\\s\\S]*?</article>`).exec(h)?.[0] ?? "";
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ");

test("the page equals the projection: status, step, steps won, start/goal, settled W/L history and next-card state, per lane", () => {
  for (const product of ["bank-builder", "moonshot"]) {
    const h = html(product);
    for (const id of LANE_IDS.filter((x) => LANES[x].product === product)) {
      const d = docs[id], cur = d.current, run = d.runs.find((r) => r.runId === cur.runId);
      const c = card(h, id), t = text(c);
      assert.ok(c, `${id} renders`);
      assert.match(c, new RegExp(`data-lane-run="${cur.runId}"`));
      assert.match(c, new RegExp(`data-lane-state="${cur.publicStatus}"`));
      assert.ok(t.includes(cur.stepText), `${id} step text`);
      assert.ok(t.includes(`${run.stepsWon} of ${d.steps}`), `${id} steps won`);
      const days = [...c.matchAll(/data-lane-day="([^"]+)" data-lane-day-result="([^"]+)"/g)].map((m) => [m[1], m[2]]);
      assert.deepEqual(days, run.days.map((x) => [x.date, x.stepOutcome === "WIN" ? "W" : x.stepOutcome === "LOSS" ? "L" : "open"]), `${id} settled history`);
      const next = /data-lane-next-card="">([^<]*)</.exec(c)?.[1];
      assert.equal(next, cur.inPlay ? "Card in play" : cur.publicStatus === "LOST" ? "Lane lost — no card; a new run needs approval" : "No card frozen", id);
      /* the bankroll is the projection's, or says it is not public — never a number the projection withheld */
      if (typeof cur.trackedBankrollCents !== "number") assert.match(/data-lane-bankroll="">([^<]*)</.exec(c)[1], /^not in the public record|^not published/);
    }
  }
});

test("a retired or superseded run is never shown as the lane's state", () => {
  for (const id of LANE_IDS) {
    const d = docs[id];
    const v = laneStatusView(d);
    assert.equal(v.runId, d.current.runId);
    for (const r of d.runs.filter((x) => x.runId !== d.current.runId)) {
      assert.ok(v.earlierRuns.some((e) => e.runId === r.runId && e.status === (r.publicStatus ?? r.status)), `${id} ${r.runId} listed with its own status`);
    }
  }
  /* synthetic: a doc whose CURRENT points at run-2 while run-1 retired never renders run-1 as active */
  const d = structuredClone(docs["ms-b"]);
  const h = renderToStaticMarkup(React.createElement(LaneStatus, { product: "moonshot", lanes: [{ ok: true, view: laneStatusView(d) }] }));
  assert.match(h, /data-lane-run="run-2"/);
  assert.doesNotMatch(h, /data-lane-run="run-1"/);
  assert.match(text(h), /Earlier runs: run-1 \(retired\)/);
  /* and a current pointer to a run the doc does not carry is refused, not guessed */
  assert.throws(() => laneStatusView({ ...d, current: { ...d.current, runId: "run-9" } }), /no run run-9/);
});

test("the chain head sha is in the page data, per lane; no price, stake or payout is rendered", () => {
  for (const product of ["bank-builder", "moonshot"]) {
    const h = html(product);
    for (const id of LANE_IDS.filter((x) => LANES[x].product === product)) assert.match(card(h, id), new RegExp(`data-chain-head="${docs[id].chainHeadSha256}"`));
    const t = text(h);
    assert.doesNotMatch(t, /\b(stake|payout|odds)\b/i);
    assert.doesNotMatch(t, /[+−-]\d{3}\b/, "no American odds");
  }
  /* the pages read only through the loader */
  for (const p of ["bank-builder", "moonshot"]) assert.match(fs.readFileSync(path.join(APP, `src/app/${p}/page.tsx`), "utf8"), new RegExp(`loadProductLaneStatus\\("${p}"\\)`));
});
