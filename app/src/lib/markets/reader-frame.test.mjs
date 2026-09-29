/**
 * #761 PR 1 · /markets decides "current vs not today's market" on the READER'S day. Pure rule + server
 * renders at the seed (what the static HTML holds) + source guards. Fixture dates only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { readerMarketFrame } from "./freshness.ts";

globalThis.React = React;
const { default: NotTodaysMarket } = await import("../../components/markets/not-todays-market.tsx");

const SNAP = "2031-07-14";
const frame = (today) => readerMarketFrame({ snapshotDate: SNAP, today, currentLabel: "Current snapshot", currentIsCurrent: true });

test("🔴 the snapshot's own day is current; any later reader day is 'not today's market'", () => {
  assert.deepEqual(frame(SNAP), { isHistorical: false, daysBehind: 0, freshnessLabel: "Current snapshot", isCurrent: true });
  assert.deepEqual(frame("2031-07-15"), { isHistorical: true, daysBehind: 1, freshnessLabel: `Snapshot from ${SNAP}`, isCurrent: false });
  assert.equal(frame("2031-07-20").daysBehind, 6);
  assert.equal(frame("2031-07-20").isCurrent, false, "a past snapshot is never badged current");
});

test("a snapshot that was not current on its own day stays not-current", () => {
  const f = readerMarketFrame({ snapshotDate: SNAP, today: SNAP, currentLabel: "Snapshot is 3 hours old", currentIsCurrent: false });
  assert.equal(f.isCurrent, false);
  assert.equal(f.freshnessLabel, "Snapshot is 3 hours old");
});

test("🔴 the banner renders from the seed on the server and says how far behind — never on the snapshot's own day", () => {
  const html = (seedToday) => renderToStaticMarkup(React.createElement(NotTodaysMarket, { snapshotDate: SNAP, seedToday }));
  assert.equal(html(SNAP), "", "same day: no banner");
  assert.match(html("2031-07-15"), /Not today(&#x27;|&rsquo;|’|')s market[\s\S]*yesterday/);
  assert.match(html("2031-07-17"), /3 days ago/);
});

test("both the banner and the badge read the reader's day through the same rule", () => {
  const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  for (const rel of ["src/components/markets/not-todays-market.tsx", "src/components/market-center.tsx"]) {
    const src = read(rel);
    assert.match(src, /useReaderEtDate\(/, `${rel} reads the reader's ET day`);
    assert.match(src, /readerMarketFrame\(/, `${rel} uses the one frame rule`);
  }
  const hook = read("src/lib/use-reader-et-date.ts");
  assert.match(hook, /useState\(seed\)/, "the server render and first client render use the build seed (hydration-safe)");
  assert.match(hook, /useEffect\(\(\) => \{ setToday\(currentEtDate\(\)\); \}, \[\]\)/, "the reader's day is applied after mount");
});
