/**
 * Vehicle N — "Add to slip" on the sport hubs' forecast rows (/nba, /mlb, /epl, Ligue 1), stacked on the model-only
 * Smart Betslip (PR 1257).
 *
 *   only Level A    a row gets a button only when levelASlipLegFor / slipLegFor returns its exact leg; any other
 *                   event (a forecast Level A does not suggest) gets nothing — no non-Level-A pick can be added
 *   once per page   each hub renders <HubSlipBar> exactly once, with the legs its buttons add; none without a leg
 *   44 px           the button is a 44px target with a label naming the pick
 *
 * Run (from app/): npx tsx --test src/components/products/hub-slip.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
process.env.__NEXT_TRAILING_SLASH = "true";
const { hubSlipLegs, HubSlipButton, HubSlipBar } = await import("./hub-slip.tsx");
const { NbaTodayGames } = await import("../nba/hub-overview.tsx");
const { nbaTodaySlateFrom } = await import("../../lib/sport-hub/nba-hub.ts");

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

// A Level A page model holding ONE leg per sport (the shape legsOf reads: model.legs).
const leg = (sport, eventId, eventLabel, code, label) => ({
  schema: "gtp.level-a.leg@1", levelA: true, sport, eventId, eventLabel, market: sport === "epl" || sport === "ligue-1" ? "1x2" : "winner",
  startUtc: "2026-10-27T23:00:00Z", selection: { code, label }, probability: 0.61,
  forecast: { owner: `${sport}-owner`, modelId: null, stampedAt: "2026-10-27T14:00:00Z", ref: null },
});
const MODEL = {
  legs: [
    leg("nba", "401", "CLE @ PHI", "home", "PHI (official side)"),
    leg("mlb", "849815", "Rays @ Guardians", "away", "Rays to win"),
    leg("epl", "740001", "Arsenal v Spurs", "home", "Arsenal to win"),
    leg("ligue-1", "soccer:ligue-1:401876459", "Rennes v Marseille", "home", "Rennes to win"),
  ],
  untiered: [], parlayLab: [], bankBuilder: null, moonshot: null, nbaGameWinners: null,
};

test("only Level A: a row's leg is exactly the helper's; an event Level A does not suggest gets none", async () => {
  for (const [sport, yes, no] of [["nba", "401", "402"], ["mlb", "849815", "849816"], ["epl", "740001", "740002"], ["ligue-1", "soccer:ligue-1:401876459", "soccer:ligue-1:1"]]) {
    const legs = await hubSlipLegs(sport, [yes, no, yes], { model: MODEL });
    assert.deepEqual([...legs.keys()], [yes], `${sport}: only the Level A event`);
    const l = legs.get(yes);
    assert.equal(l.sport, sport);
    assert.equal(l.eventId, yes);
    assert.ok(l.key, "a slip key");
  }
  // the same event id under another sport is not a leg (no cross-sport join)
  assert.equal((await hubSlipLegs("mlb", ["401"], { model: MODEL })).size, 0);
  // no leg → no button, no bar
  assert.equal(renderToStaticMarkup(React.createElement(HubSlipButton, { leg: null })), "");
  assert.equal(renderToStaticMarkup(React.createElement(HubSlipBar, { legs: new Map() })), "");
});

test("44 px: the button is a labelled 44px target naming the pick and its game", async () => {
  const legs = await hubSlipLegs("epl", ["740001"], { model: MODEL });
  const h = renderToStaticMarkup(React.createElement(HubSlipButton, { leg: legs.get("740001") }));
  assert.match(h, /^<button type="button"/);
  assert.match(h, /min-height:44px/);
  assert.match(h, /min-width:44px/);
  assert.match(h, /aria-label="Add to slip: Arsenal to win, Arsenal v Spurs"/);
});

test("/nba: today's card gets the button only for the Level A game, beside its forecast and simulation links", async () => {
  const CLE = { abbr: "CLE", name: "Cleveland Cavaliers", providerTeamId: "5" };
  const PHI = { abbr: "PHI", name: "Philadelphia 76ers", providerTeamId: "20" };
  const DEN = { abbr: "DEN", name: "Denver Nuggets", providerTeamId: "7" };
  const OKC = { abbr: "OKC", name: "Oklahoma City Thunder", providerTeamId: "25" };
  const row = (id, dateUtc, away, home) => ({ providerEventId: id, dateUtc, statusRaw: "STATUS_SCHEDULED", seasonType: 2, away, home });
  const laneGame = (id, away, home, fav) => ({ providerEventId: id, tipUtc: "2026-10-27T23:00Z", frozenAt: "2026-10-27T14:30:00Z", away: { abbr: away.abbr, name: away.name }, home: { abbr: home.abbr, name: home.name }, receipt: { modelVersion: "m" }, elo: { favoured: fav }, players: { away: [], home: [] } });
  const slate = nbaTodaySlateFrom({
    nowIso: "2026-10-27T16:00:00Z", finals: null, theaterIds: ["401"],
    schedule: { generatedAt: "2026-10-27T14:00:00Z", rows: [row("401", "2026-10-27T23:00Z", CLE, PHI), row("402", "2026-10-28T00:00Z", DEN, OKC)] },
    lane: { date: "2026-10-27", games: [laneGame("401", CLE, PHI, "PHI"), laneGame("402", DEN, OKC, "OKC")], excluded: [] },
  });
  const slip = await hubSlipLegs("nba", slate.games.map((g) => g.id), { model: MODEL });
  const h = renderToStaticMarkup(React.createElement(NbaTodayGames, { slate, slip }));
  const cards = h.split("<article").slice(1);
  assert.equal(cards.length, 2);
  assert.match(cards[0], /Official Forecast →[\s\S]*Game Simulation →[\s\S]*aria-label="Add to slip: PHI \(official side\), CLE @ PHI"/);
  assert.match(cards[1], /Official Forecast →/, "the other game keeps its forecast link…");
  assert.doesNotMatch(cards[1], /Add to slip|<button/, "…and gets no slip button: Level A does not suggest it");
});

test("each hub asks the helper for its own sport, renders the button only from it, and the bar exactly once", () => {
  const pages = {
    nba: ["src/app/nba/page.tsx", /await hubSlipLegs\("nba", slate\.games\.map\(\(g\) => g\.id\)\)/],
    mlb: ["src/app/mlb/page.tsx", /await hubSlipLegs\("mlb", /],
    epl: ["src/app/epl/page.tsx", /await hubSlipLegs\("epl", priced\.map\(\(r\) => String\(r\.eventId\)\)\)/],
    "ligue-1": ["src/components/soccer/league-forecast-page.tsx", /leagueKey === "ligue-1" \? await hubSlipLegs\("ligue-1", /],
  };
  for (const [sport, [rel, call]] of Object.entries(pages)) {
    const src = read(rel);
    assert.match(src, call, `${sport}: the rows' legs come from hubSlipLegs`);
    assert.equal((src.match(/<HubSlipBar /g) ?? []).length, 1, `${sport}: one bar`);
    assert.doesNotMatch(src, /<AddToSlip|<ModelSlipBar/, `${sport}: no button or bar outside the Level A helper`);
  }
  const helper = read("src/components/products/hub-slip.tsx");
  assert.match(helper, /model \? slipLegFor\(model, sport, id\) : await levelASlipLegFor\(sport, id\)/);
  assert.match(helper, /return legs\.size \? <ModelSlipBar catalog=\{\[\.\.\.legs\.values\(\)\]\} \/> : null;/, "no bar, so no slip island, without a leg");
  assert.match(read("src/components/nba/hub-overview.tsx"), /<HubSlipButton leg=\{slip\?\.get\(g\.id\)\} \/>/);
});
