/**
 * #761 PR 2 · "Live" / "Live today" follow the READER'S day; "Updated" stamps carry a date.
 * Pure rule + server renders at the seed (what the static HTML holds) + source guards. Fixture dates only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { slateTenseKind, isReaderToday } from "./slate-tense.mjs";
import { formatUpdatedEt } from "./format.ts";

globalThis.React = React;
const { default: DayAwareStatusPill, DayAwareSlateChip } = await import("../components/day-aware-status-pill.tsx");

const D = "2031-07-14";

test("🔴 the slate's tense on the reader's day: future → upcoming, past → settled, today → the page's own kind", () => {
  assert.equal(slateTenseKind({ slateDate: D, today: D, readyKind: "live" }), "live");
  assert.equal(slateTenseKind({ slateDate: D, today: "2031-07-15", readyKind: "live" }), "settled", "yesterday's slate is never Live");
  assert.equal(slateTenseKind({ slateDate: D, today: "2031-07-13", readyKind: "live" }), "upcoming", "tomorrow's slate is never Live");
  assert.equal(slateTenseKind({ slateDate: null, today: D, readyKind: "linesPending" }), "linesPending", "no date: nothing to judge");
  assert.equal(isReaderToday(D, D), true);
  assert.equal(isReaderToday(D, "2031-07-15"), false);
});

test("🔴 the pill and the Home chip render from the seed: a day-old seed reads Settled / Latest slate", () => {
  const pill = (seedToday) => renderToStaticMarkup(React.createElement(DayAwareStatusPill, { slateDate: D, seedToday, readyKind: "live", caption: "15 games" }));
  assert.match(pill(D), /Live/);
  assert.doesNotMatch(pill("2031-07-15"), /Live/);
  assert.match(pill("2031-07-15"), /Settled/);
  const chip = (seedToday, hasGames = true) => renderToStaticMarkup(React.createElement(DayAwareSlateChip, { slateDate: D, seedToday, hasGames }));
  assert.match(chip(D), /Live today/);
  assert.match(chip("2031-07-15"), /Latest slate/);
  assert.match(chip(D, false), /Latest slate/, "a slate with no games is never Live today");
});

test("an 'Updated' stamp always carries its date", () => {
  assert.match(formatUpdatedEt("2031-07-14T11:45:00Z"), /^Jul 14, 7:45\s?AM ET$/);
  for (const rel of ["src/components/home/home-today-mlb.tsx", "src/components/today/today-mlb-brief.tsx"]) {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    assert.match(src, /formatUpdatedEt\(lastUpdatedIso\)/, `${rel} dates its stamp`);
    assert.doesNotMatch(src, /formatEtTime\(lastUpdatedIso\)/, `${rel} no longer prints a bare time`);
  }
});

test("hubs hand the pill a slate date; none decides tense on the build clock any more", () => {
  const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  for (const rel of ["src/app/mlb/page.tsx", "src/app/nfl/page.tsx", "src/app/epl/page.tsx"]) {
    const src = read(rel);
    assert.match(src, /statusSlateDate=\{/, `${rel} passes the slate date`);
    assert.match(src, /statusSeedToday=\{currentEtDate\(\)\}/, `${rel} seeds with the build day`);
  }
  assert.doesNotMatch(read("src/app/nfl/page.tsx"), /slateDay && slateDay [<>] currentEtDate\(\)/, "no build-clock tense on /nfl");
  assert.doesNotMatch(read("src/app/mlb/page.tsx"), /const statusKind[^;]*isTodaysSlate/, "no build-clock tense in /mlb's pill kind");
  assert.match(read("src/components/sport-overview-hero.tsx"), /<DayAwareStatusPill slateDate=\{statusSlateDate\} seedToday=\{statusSeedToday\}/);
  assert.match(read("src/app/page.tsx"), /seedToday=\{serverToday\}\s+hasGames=\{mlbGames > 0\}/, "Home's chip reads the reader's day");
});
