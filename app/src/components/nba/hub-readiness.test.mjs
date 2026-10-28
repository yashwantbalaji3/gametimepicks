/**
 * /nba HUB READINESS (overnight W7 2026-10-28; audit A #15, reassessment §3 /nba):
 *   - no model id, receipt hash, rule id or engine id in the hub's reading path — only inside the one "Technical details"
 *     disclosure (MoreDisclosure), where every one of them is kept verbatim;
 *   - the not-validated / not-a-bet disclosure stays visible;
 *   - before the morning publish: ONE pending line with the first tip-off, not a "not published yet" line per card;
 *   - the Game Simulations section renders only when today has one to open.
 *
 * Run (from app/): npx tsx --test src/components/nba/hub-readiness.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { nbaTodaySlateFrom } = await import("../../lib/sport-hub/nba-hub.ts");
const { NbaSlateOverview, NbaTodayGames } = await import("./hub-overview.tsx");
const { default: ForecastLane } = await import("./experimental-lane.tsx");

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const DISCLOSURE = /<details class="gtp-more-disclosure[^"]*"[^>]*>[\s\S]*?<\/details>/g;

const LANE = JSON.parse(read("public/data/nba/experimental-public/2026-10-27.json"));
const schedule = { generatedAt: "2026-10-27T15:00:00Z", rows: LANE.games.map((g) => ({ providerEventId: g.providerEventId, dateUtc: g.tipUtc, statusRaw: "STATUS_SCHEDULED", seasonType: 2, away: g.away, home: g.home })) };
const NOW = "2026-10-27T16:00:00Z";

function hub(lane, theaterIds = []) {
  const slate = nbaTodaySlateFrom({ nowIso: NOW, schedule, finals: null, lane, theaterIds });
  return [
    renderToStaticMarkup(React.createElement(NbaSlateOverview, { slate, boardDates: ["2026-10-26", "2026-10-27"] })),
    renderToStaticMarkup(React.createElement(NbaTodayGames, { slate })),
    lane ? renderToStaticMarkup(React.createElement(ForecastLane, { snapshot: lane })) : "",
  ].join("");
}

test("the hub has no model ids outside Technical details — and keeps every one of them inside it", () => {
  const html = hub(LANE);
  const blocks = html.match(DISCLOSURE) ?? [];
  assert.equal(blocks.length, 1, "one Technical details disclosure");
  assert.match(blocks[0], /Technical details/);
  const outside = text(html.replace(DISCLOSURE, ""));
  const inside = text(blocks[0]);
  const ids = new Set([
    ...LANE.games.map((g) => g.receipt.modelVersion), ...LANE.games.map((g) => g.receipt.payloadSha256.slice(0, 12)),
    ...LANE.games.map((g) => g.elo.rule), ...LANE.games.map((g) => g.engine.simulation), LANE.games[0].players.source, LANE.games[0].elo.source,
  ].filter(Boolean));
  for (const id of ids) {
    assert.ok(!outside.includes(id), `${id} is not in the reading path`);
    assert.ok(inside.includes(id), `${id} is kept, verbatim, in Technical details`);
  }
  assert.doesNotMatch(outside, /preseason|experimental|v0\.\d|receipt|payload|sha256|@1\b/i, "no internal vocabulary outside");
  assert.doesNotMatch(outside, /UNVALIDATED|Model details/, "the retired label and the old disclosure title are gone");
  // KEEP: the one disclosure — frozen, not a betting recommendation, no public Model Performance record yet
  assert.match(outside, /Not a betting recommendation\. NBA forecasts are graded after every game; a public Model Performance record for NBA has not been published yet\./);
});

test("before the morning publish: one pending line with the first tip-off; cards carry no repeated pending text", () => {
  const html = hub(null);
  const t = text(html);
  const first = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(LANE.games.map((g) => g.tipUtc).sort()[0]));
  assert.ok(t.includes(`Today’s Official Forecast is not published yet. It publishes before the first tip-off (${first} ET)`), t.slice(0, 400));
  assert.equal((t.match(/not published yet/g) ?? []).length, 1, "said once for the slate");
  assert.equal((html.match(/<article/g) ?? []).length, LANE.games.length, "every game still has its card");
  assert.doesNotMatch(t, /Official Forecast: [^.]* favoured/, "no side before the forecast exists");
});

test("Game Simulations section: rendered only when today has a Game Simulation to open; the strip anchor follows it", () => {
  const page = read("src/app/nba/page.tsx");
  assert.match(page, /const simLinks = slate\.games\.some\(\(g\) => g\.theaterHref\);/);
  assert.match(page, /\{simLinks \? \(\n\s+<section id="nba-simulations"/);
  assert.match(page, /\.\.\.\(simLinks \? \[S\.simulations\] : \[\]\)/);
  assert.doesNotMatch(page, /They open from today&rsquo;s game cards on game days/, "no linkless dead-end paragraph");
});
