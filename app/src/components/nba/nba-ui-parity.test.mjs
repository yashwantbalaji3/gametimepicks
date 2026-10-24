/**
 * NBA UI PARITY (founder directive 2026-10-22) — the homepage NBA lane, the /nba overview + today's cards, and the
 * Theater page's skip link + server-rendered "GameTimePicks Official Predictions".
 *
 *   one view       the hub cards and the homepage lane both read nbaTodaySlate (schedule, finals, the CURRENT lane);
 *                  a favoured side only from today's lane, a Theater link only for a built id, a final only from the record
 *   honest states  PUBLISHED / PENDING / NO_GAMES / DISABLED; "Schedule only — no public forecast" only when disabled
 *   official       side, models, freeze and the player table from the official panel; combos only from the same game's
 *                  frozen lane rows that reconcile; missing prints "—", never 0; no withheld figure
 *   page order     skip link → Theater → official predictions, the section outside the client island
 *
 * Run (from app/): npx tsx --test src/components/nba/nba-ui-parity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { nbaTodaySlateFrom } = await import("../../lib/sport-hub/nba-hub.ts");
const { nbaLane, NBA_LANE_ROWS } = await import("../../lib/command-center/nba-lane.ts");
const { NbaSlateOverview, NbaTodayGames } = await import("./hub-overview.tsx");
const { default: Official, reconciledCombos, OFFICIAL_PREDICTIONS_TITLE } = await import("./official-predictions.tsx");
const { mergeFinals } = await import("../../lib/sports/nba/finals-record.mjs");
const { loadNbaPossessionTheater } = await import("../../lib/simulation-theater/nba/possession/possession-loader.mjs");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const CLE = { abbr: "CLE", name: "Cleveland Cavaliers", providerTeamId: "5" };
const PHI = { abbr: "PHI", name: "Philadelphia 76ers", providerTeamId: "20" };
const DEN = { abbr: "DEN", name: "Denver Nuggets", providerTeamId: "7" };
const OKC = { abbr: "OKC", name: "Oklahoma City Thunder", providerTeamId: "25" };
const row = (id, dateUtc, away, home, over = {}) => ({ providerEventId: id, dateUtc, statusRaw: "STATUS_SCHEDULED", seasonType: 2, away, home, ...over });
const SCHEDULE = {
  generatedAt: "2026-10-22T14:28:00Z",
  rows: [
    row("g1", "2026-10-22T23:00Z", CLE, PHI),
    row("g2", "2026-10-23T01:30Z", DEN, OKC),                  // 9:30 PM ET — still the 22nd in ET
    row("g3", "2026-10-23T23:30Z", OKC, CLE),                  // tomorrow
  ],
};
const laneGame = (id, away, home, fav) => ({ providerEventId: id, tipUtc: "2026-10-22T23:00Z", frozenAt: "2026-10-22T14:30:00Z", away: { abbr: away.abbr, name: away.name }, home: { abbr: home.abbr, name: home.name }, receipt: { modelVersion: "nba-preseason-experimental-v0.1" }, elo: { favoured: fav }, players: { away: [{}, {}], home: [{}] } });
const LANE = { date: "2026-10-22", generatedAt: "2026-10-22T14:31:00Z", games: [laneGame("g1", CLE, PHI, "PHI")], excluded: [{ providerEventId: "g2", reason: "NOT_PRE_TIP" }] };
const NOW = "2026-10-22T16:00:00Z";
const slate = (over = {}) => nbaTodaySlateFrom({ nowIso: NOW, schedule: SCHEDULE, finals: null, lane: LANE, theaterIds: ["g1"], ...over });

test("today's slate: ET-day games only, the official side only from TODAY's lane, a Theater href only for a built id", () => {
  const s = slate();
  assert.equal(s.date, "2026-10-22");
  assert.deepEqual(s.games.map((g) => g.id), ["g1", "g2"], "the 9:30 PM ET game is today's; tomorrow's is not");
  assert.equal(s.forecast, "PUBLISHED");
  assert.deepEqual(s.games[0].favoured, { abbr: "PHI", name: "Philadelphia 76ers" });
  assert.equal(s.games[0].theaterHref, "/nba/simulation/g1/");
  assert.equal(s.games[1].favoured, null, "a game the lane does not carry has no side");
  assert.equal(s.games[1].theaterHref, null, "no link to an unbuilt page");
  assert.equal(s.games[1].excludedReason, "NOT_PRE_TIP");
  assert.equal(s.games[0].tipLabel, "7:00 PM ET");
  assert.deepEqual(s.next && s.next.matchup, "OKC @ CLE");
  // yesterday's lane never stands in for today's
  const stale = slate({ lane: { ...LANE, date: "2026-10-21" } });
  assert.equal(stale.forecast, "PENDING");
  assert.ok(stale.games.every((g) => g.favoured == null));
  assert.equal(slate({ laneEnabled: false }).forecast, "DISABLED");
  assert.equal(slate({ nowIso: "2026-10-24T16:00:00Z" }).forecast, "NO_GAMES");
});

test("a final prints only from the finals record; game status is never a frozen build-time 'started'", () => {
  const finals = mergeFinals(null, [{ ...SCHEDULE.rows[0], statusRaw: "STATUS_FINAL", ftHome: 99, ftAway: 101 }], { season: "2026-27", nowIso: "2026-10-23T03:00:00Z" }).record;
  const s = slate({ finals, nowIso: "2026-10-23T03:00:00Z" });
  assert.equal(s.games[0].status, "final");
  assert.equal(s.games[0].finalNote, "CLE 101 – PHI 99");
  assert.equal(s.games[1].status, "upcoming", "a tipped game without a recorded final stays 'upcoming' at build time — the card's clock says Started");
});

test("homepage NBA lane: rows (≤ NBA_LANE_ROWS), each linking to its /nba card, honest labels, no withheld figure", () => {
  const lane = nbaLane(slate(), NOW);
  assert.equal(lane.sport, "nba");
  assert.equal(lane.hubHref, "/nba/");
  assert.equal(lane.simulateHref, "/simulate/?sport=nba"); // founder mandate 2026-10-24: NBA at parity — the lobby filters to NBA
  // …and the same two status chips the other lanes carry, honestly "Too early to judge" (no public Model Performance yet)
  assert.deepEqual(lane.statuses.map((x) => [x.family, x.state]), [["Favoured side", "TOO_EARLY"], ["Player projections", "TOO_EARLY"]]);
  assert.deepEqual(nbaLane(slate({ lane: null }), NOW).statuses, [], "a schedule-only lane claims no model status");
  assert.equal(lane.featured, null);
  assert.equal(lane.state, "LIVE_TODAY");
  assert.ok(lane.games.length <= NBA_LANE_ROWS);
  assert.equal(lane.games[0].note, "PHI favoured"); // founder mandate 2026-10-24: reader words (the hub card names the team rating)
  assert.deepEqual(lane.games.map((g) => g.href), ["/nba/#nba-exp-g1", "/nba/#nba-exp-g2"], "each row → its card on /nba (every today's game has one)");
  assert.equal(lane.games[1].note, "No Official Forecast"); // founder directive 2026-10-23 public readiness: registry terms
  assert.deepEqual(lane.secondary, { label: "Top Boards", href: "/nba/projections/", note: "player projections" });
  const pending = nbaLane(slate({ lane: null }), NOW, { lastPublished: "2026-10-21" });
  assert.equal(nbaLane(slate({ lane: null }), NOW).stateLabel, "Schedule only", "no recent official forecast → schedule only (Other coverage)");
  assert.equal(pending.stateLabel, "Games today");
  assert.match(pending.contextLine, /Official Forecast publishes before tip-off/); // founder directive 2026-10-23 public readiness: registry terms
  assert.ok(pending.games.every((g) => g.note === "Forecast pending"));
  assert.equal(pending.secondary, null, "no Top Boards claim before the board exists");
  const off = nbaLane(slate({ nowIso: "2026-10-24T16:00:00Z" }), "2026-10-24T16:00:00Z", { lastPublished: "2026-10-22" });
  assert.equal(off.games.length, 0);
  assert.match(off.emptyLine, /No games today/);
  for (const l of [lane, pending, off]) assert.doesNotMatch(JSON.stringify(l), /\d\s?%|projected score|win probability|\bodds\b/i);
});

test("the homepage renders NBA as a Command Center lane from the hub's own view (no second derivation, no Theater import)", () => {
  const home = read("src/app/page.tsx");
  assert.match(home, /nbaLane\(nbaTodaySlate\(/);
  assert.doesNotMatch(home, /simulation-theater|GTP_NBA_THEATER_PUBLIC/, "/ links the hub cards; only /nba and the route touch the Theater gate");
  // founder mandate 2026-10-24: NBA is first-class — its lane sits right after NFL's
  assert.match(home, /const cardLanes = buildCommandCenter\(\{ dataRoot[^\n]*\}\);/);
  assert.match(home, /const commandLanes = \[\.\.\.cardLanes\.slice\(0, afterNfl\), nbaHomeLane, \.\.\.cardLanes\.slice\(afterNfl\)\];/);
  // every /nba card the homepage links exists: the hub renders a MatchupCard (id laneCardId) for EVERY one of today's games
  const hub = read("src/app/nba/page.tsx");
  assert.match(hub, /<NbaTodayGames slate=\{slate\} \/>/);
  assert.match(read("src/components/nba/hub-overview.tsx"), /\{slate\.games\.map\(\(g\) => \(\n\s+<MatchupCard key=\{g\.id\}/);
  // weight: today's carded games are not listed a second time in the window's one-line lists
  assert.match(hub, /const rest = model\.rows\.filter\(\(r\) => !carded\.has\(String\(r\.id\)\)\);/);
  assert.match(hub, /<NbaGameList rows=\{upcoming\}/);
  assert.match(hub, /<NbaGameList rows=\{played\}/);
});

test("/nba overview: the four states say what is true, and 'publishes nothing' is gone", () => {
  const render = (s) => text(renderToStaticMarkup(React.createElement(NbaSlateOverview, { slate: s })));
  assert.match(render(slate()), /2 games · first tip-off 7:00 PM ET/);
  assert.match(render(slate()), /Official Forecast published , frozen Oct 22, 10:30 AM ET/); // founder directive 2026-10-23 public readiness: registry terms
  assert.match(render(slate({ lane: null })), /Today’s Official Forecast is not published yet/);
  assert.match(render(slate({ nowIso: "2026-10-24T16:00:00Z" })), /No NBA games today/);
  assert.match(render(slate({ laneEnabled: false })), /Schedule only — no public forecast/);
  for (const s of [slate(), slate({ lane: null })]) assert.doesNotMatch(render(s), /Schedule only — no public forecast|publishes nothing/);
  const page = read("src/app/nba/page.tsx");
  assert.doesNotMatch(page, /publishes nothing until/);
  // founder mandate 2026-10-24: overview → today's games → Official Forecasts → Top Boards → Predicted Player Statistics →
  // Game Simulations → Results & Model Performance → how it works
  const order = ["<NbaSlateOverview", "<NbaTodayGames", "<NbaExperimentalLane", 'id="nba-boards"', 'id="nba-players"', 'id="nba-simulations"', 'id="nba-results"', 'id="nba-model-status"'].map((x) => page.indexOf(x));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `hub order ${order}`);
});

test("pending cards: matchup, clock status (SSR 'Upcoming'), no link and no side before today's forecast exists", () => {
  const s = slate({ lane: null, theaterIds: [] });
  const h = renderToStaticMarkup(React.createElement(NbaTodayGames, { slate: s }));
  assert.equal((h.match(/<article/g) ?? []).length, 2);
  assert.equal((h.match(/<a /g) ?? []).length, 0, "no forecast link before it is published, no Game Simulation link without a built page");
  assert.match(h, /Upcoming/);
  assert.match(text(h), /Official Forecast not published yet/); // founder directive 2026-10-23 public readiness: registry terms
  assert.doesNotMatch(h, /favours/);
  assert.match(h, /https:\/\/a\.espncdn\.com\/i\/teamlogos\/nba\/500\/phi\.png/);
});

test("official predictions: side, models, freeze, the full player table; combos only from reconciled lane rows; '—' never 0", () => {
  const load = loadNbaPossessionTheater(REPO, "401909088");
  assert.ok(load.ok);
  const { official, teams } = load.payload;
  const lane = JSON.parse(read("public/data/nba/experimental-public/2026-10-20.json")).games.find((g) => g.providerEventId === "401909088");
  assert.equal(reconciledCombos(official, lane).size, official.players.length, "every official row reconciles with the frozen lane row");
  const h = renderToStaticMarkup(React.createElement(Official, { official, teams, lane, finalNote: null, resultsHref: "/nba/#nba-results" }));
  assert.match(h, new RegExp(`<h2 id="official-predictions-h">${OFFICIAL_PREDICTIONS_TITLE}</h2>`));
  assert.match(h, /id="official-predictions" tabindex="-1"/);
  assert.match(text(h), /Detroit Pistons \(DET\) · Elo rating/);
  assert.match(h, /<th scope="col">PRA<\/th><th scope="col">P\+R<\/th><th scope="col">P\+A<\/th>/);
  assert.equal((h.match(/<tbody>[\s\S]*?<\/tbody>/g) ?? []).join("").match(/<tr>/g).length, official.players.length);
  // a combo is the lane's own number, not a sum of the medians beside it
  const p = lane.players.home[0];
  assert.ok(h.includes(`<td>${p.comboMedians.pra.toFixed(1)}</td>`));
  assert.doesNotMatch(text(h), /\d\s?%/, "no win chance");
  assert.match(text(h), /Official Forecast .* Game Simulation .* Real Result/); // founder directive 2026-10-23 public readiness: registry terms
  // no lane (or a lane for another game / model) → combos missing, never 0
  for (const bad of [null, { ...lane, providerEventId: "x" }, { ...lane, receipt: { modelVersion: "other" } }]) {
    const h2 = renderToStaticMarkup(React.createElement(Official, { official, teams, lane: bad, finalNote: null, resultsHref: "/r" }));
    const cells = [...h2.matchAll(/<tr><th scope="row">[^<]*<\/th>((?:<td>[^<]*<\/td>)+)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td>([^<]*)<\/td>/g)].map((c) => c[1]));
    assert.ok(cells.length > 0 && cells.every((c) => c.slice(-3).every((x) => x === "—")), "combos print — when they cannot be sourced");
  }
  const none = renderToStaticMarkup(React.createElement(Official, { official: null, teams, lane: null, finalNote: null, resultsHref: "/r" }));
  assert.match(none, /Unavailable: no Official Forecast receipt for this game/); // founder directive 2026-10-23 public readiness: registry terms
  assert.doesNotMatch(none, /<table/);
});

test("Theater page: skip link → Theater → server-rendered official predictions, all behind the route's flag branch", () => {
  const body = read("src/components/simulation-theater/nba/possession/NbaPossessionGamePage.tsx");
  const iSkip = body.indexOf("Skip to the Official Forecast"), iTheater = body.indexOf("<NbaPossessionSection"), iOfficial = body.indexOf("<NbaOfficialPredictions");
  assert.ok(iSkip > 0 && iSkip < iTheater && iTheater < iOfficial, "skip link at the top, the section directly below the Theater");
  assert.match(body, /href=\{`#\$\{OFFICIAL_PREDICTIONS_ID\}`\}/);
  const src = read("src/app/nba/simulation/[eventId]/page.tsx");
  const branch = src.slice(src.indexOf('if (process.env.GTP_NBA_THEATER_PUBLIC === "1" && nbaPublicTheaterOn()'));
  assert.ok(branch.indexOf('await import("@/components/simulation-theater/nba/possession/NbaPossessionGamePage")') > 0, "mounted inside the flag branch (a flag-OFF build never bundles it)");
  assert.match(src, /<NbaPossessionGamePage load=\{load\} \/>/);
  // the section is a server component: never inside the client island
  assert.doesNotMatch(body, /^"use client"/m);
  assert.doesNotMatch(read("src/components/nba/official-predictions.tsx"), /^"use client"/m);
  assert.doesNotMatch(read("src/components/simulation-theater/nba/possession/NbaPossessionTheater.tsx"), /official-predictions/);
});

test("Theater page markup: the island's one h1, then the official section's h2 — Official ≠ Research Simulation stays visible", async () => {
  // NbaPossessionGamePage links CSS (not loadable under tsx); render its two parts as it composes them.
  const { default: Island } = await import("../simulation-theater/nba/possession/NbaPossessionTheater.tsx");
  const { packPlaybackPayload } = await import("../../lib/simulation-theater/nba/possession/wire.mjs");
  const load = loadNbaPossessionTheater(REPO, "401909088");
  const lane = JSON.parse(read("public/data/nba/experimental-public/2026-10-20.json")).games.find((g) => g.providerEventId === "401909088");
  const h = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(Island, { wire: packPlaybackPayload(load.payload), palette: load.palettes.team }),
    React.createElement(Official, { official: load.payload.official, teams: load.payload.teams, lane, finalNote: null, resultsHref: "/nba/#nba-results" })));
  assert.equal((h.match(/<h1[\s>]/g) ?? []).length, 1, "one h1 (the Theater's game title)");
  assert.ok(h.indexOf("data-nbp-theater") < h.indexOf('id="official-predictions"'));
  assert.ok(h.includes(">GameTimePicks Official Forecast</h2>")); // founder directive 2026-10-23 public readiness: registry terms
  const { ENGINE_IDENTITY } = await import("../../lib/simulation-theater/nba/possession/labels.mjs");
  assert.ok(h.includes(ENGINE_IDENTITY), "the engine is named by name + id");
  assert.equal((h.match(/<th scope="col">PRA<\/th>/g) ?? []).length, 2, "both teams' tables carry the combos");
});

test("console-clean navigation (release owner 2026-10-22): every page-to-page NBA link is next/link; only in-page # anchors stay <a>", () => {
  // A plain <a> to another route is a full page load: it aborts the page's in-flight route prefetches and Next logs
  // "Failed to fetch RSC payload … Falling back to browser navigation" (measured on /nba → Theater, 4/4 runs).
  const lane = read("src/components/nba/experimental-lane.tsx");
  assert.match(lane, /<Link href=\{publicTheaterHref\(id\)\} prefetch=\{false\}[^>]*data-nba-theater-link=\{id\}>/, "the Theater CTA is a Link, fetched on click only");
  for (const f of ["src/components/nba/experimental-lane.tsx", "src/components/nba/hub-overview.tsx", "src/components/nba/official-predictions.tsx", "src/components/simulation-theater/nba/possession/NbaPossessionGamePage.tsx"]) {
    const src = read(f);
    for (const m of src.matchAll(/<a\s[^>]*href=(\{[^}]*\}|"[^"]*")/g)) {
      assert.ok(/^"#|^\{`#/.test(m[1]), `${f}: <a href=${m[1]}> navigates to another page — use next/link`);
    }
  }
});

test("homepage lanes: the NBA Top Boards link and every other lane's secondary link are 44px targets", async () => {
  const CC = await import("../command-center/command-center.tsx");
  const CommandCenter = CC.default?.default ?? CC.default;
  const nba = nbaLane(slate(), NOW);
  const epl = { ...nba, sport: "epl", label: "Premier League", games: undefined, moreGames: undefined, featured: null, emptyLine: "x", secondary: { label: "Ligue 1", href: "/soccer/ligue-1/", note: "4 fixture forecasts" } };
  const h = renderToStaticMarkup(React.createElement(CommandCenter, { lanes: [nba, epl], heading: "H", subtitle: "s" }));
  // next/link drops the trailing slash outside a Next build (no trailingSlash env here), so match with or without it
  const linkTo = (href) => [...h.matchAll(/<a [^>]*>/g)].map((m) => m[0]).find((a) => a.includes(`href="${href.replace(/\/$/, "")}"`) || a.includes(`href="${href}"`));
  assert.match(linkTo("/nba/projections/"), /class="font-mono gtp-hit-44"/);
  // Release B (benchmark PR 1193 gap 8, release owner 2026-10-23): every lane's secondary link is now a 44px target too
  assert.match(linkTo("/soccer/ligue-1/"), /class="font-mono gtp-hit-44"/);
});

// ── founder mandate 2026-10-24: NBA publicly usable end-to-end ──────────────────────────────────────────────────────
const { NbaGameList } = await import("./hub-overview.tsx");
const { default: ForecastLane } = await import("./experimental-lane.tsx");
process.env.__NEXT_TRAILING_SLASH = "true";

test("today's cards: each links to its Official Forecast and its Game Simulation — only when each exists", () => {
  const h = renderToStaticMarkup(React.createElement(NbaTodayGames, { slate: slate() }));
  const cards = h.split("<article").slice(1);
  assert.equal(cards.length, 2, "a card for every one of today's games");
  assert.match(cards[0], /href="\/nba\/simulation\/g1\/#official-predictions"[^>]*>Official Forecast →/, "built page → the full forecast section");
  assert.match(cards[0], /href="\/nba\/simulation\/g1\/"[^>]*>Game Simulation →/);
  assert.match(text(cards[0]), /Official Forecast: Philadelphia 76ers favoured/);
  assert.doesNotMatch(cards[1], /<a /, "an excluded game: no forecast link, no unbuilt simulation link");
  assert.match(text(cards[1]), /Unavailable: its forecast was not frozen before tip-off, so none is published\./, "the lane code in reader words");
  assert.doesNotMatch(cards[1], /NOT_PRE_TIP/);
  // no built page → the forecast link is this page's forecast row
  const noSim = renderToStaticMarkup(React.createElement(NbaTodayGames, { slate: slate({ theaterIds: [] }) }));
  assert.match(noSim, /href="#nba-fc-g1"/);
  assert.doesNotMatch(noSim, /Game Simulation →/);
});

test("the favoured side is printed in the row's own team code, so the crest it highlights is the right one", () => {
  const lane = { ...LANE, games: [{ ...laneGame("g1", CLE, PHI, "PHI"), home: { abbr: "PHL", name: "Philadelphia 76ers" }, elo: { favoured: "PHL" } }] };
  const s = slate({ lane });
  assert.deepEqual(s.games[0].favoured, { abbr: "PHI", name: "Philadelphia 76ers" }, "lane 'PHL' → schedule 'PHI'");
  assert.equal(nbaLane(s, NOW).games[0].note, "PHI favoured");
});

test("Forecast vs. Actual: a played game shows a side only from the forecasts it is given (its date's frozen snapshot)", () => {
  const rows = [
    { id: "a", startLabel: "Thu, Oct 22 · 7:00 PM ET", matchup: "CLE @ PHI", status: "final", started: true, reportNote: "CLE 106 – PHI 114" },
    { id: "b", startLabel: "Thu, Oct 22 · 9:30 PM ET", matchup: "DEN @ OKC", status: "final", started: true, reportNote: "DEN 84 – OKC 96" },
  ];
  const h = text(renderToStaticMarkup(React.createElement(NbaGameList, { rows, heading: "Forecast vs. Actual", forecasts: new Map([["a", "Philadelphia 76ers"]]) })));
  assert.match(h, /CLE 106 – PHI 114 · Official Forecast: Philadelphia 76ers favoured/);
  assert.match(h, /DEN 84 – OKC 96 · no Official Forecast published/, "no snapshot, no side");
  const page = read("src/app/nba/page.tsx");
  assert.match(page, /for \(const d of boardDates\.filter\(\(x\) => x < today\)\.slice\(-4\)\) \{\n\s+for \(const g of loadLaneForDate\(d\)\?\.games \?\? \[\]\)/, "past sides come only from committed dated snapshots");
});

test("reader words: no engineering jargon in the hub's visible text outside the Model details disclosure", () => {
  const snap = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nba/experimental-public/2026-10-20.json"), "utf8"));
  const html = [
    renderToStaticMarkup(React.createElement(NbaSlateOverview, { slate: slate(), boardDates: ["2026-10-20", "2026-10-21"] })),
    renderToStaticMarkup(React.createElement(NbaTodayGames, { slate: slate() })),
    renderToStaticMarkup(React.createElement(ForecastLane, { snapshot: snap })),
  ].join("");
  assert.match(html, /<summary>Model details<\/summary>[\s\S]*nba-preseason-experimental-v0\.1/, "the model id is kept — in Model details");
  const visible = text(html.replace(/<details class="nbx-details">[\s\S]*?<\/details>/g, ""));
  assert.doesNotMatch(visible, /experimental|\blane\b|candidate|\bN2\b|v0\.\d|receipt|payload|roster-gated/i);
  assert.match(visible, /PHI @ NYK/, "the forecast table prints the canonical codes the cards use (snapshot 'NY')");
  assert.doesNotMatch(visible, /@ (NY|SA|GS|NO|UTAH|WSH)\b/);
  const page = read("src/app/nba/page.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(page.replace(/import[^\n]*\n/g, "").replace(/NbaExperimentalLane/g, ""), /experimental|candidate|plumbing|write-once/i);
});
