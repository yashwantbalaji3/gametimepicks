/**
 * NBA EXPERIMENTAL PUBLIC LANE (founder decision 2026-10-20 · preregistration §12 look 5 · §13).
 * Every condition the founder set is a pinned assertion here; the lane can only narrow, never widen.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

process.env.__NEXT_TRAILING_SLASH = "true"; // next.config.mjs trailingSlash: true — next/link renders hrefs as the build does
globalThis.React = React; // the lane card renders TeamLogo, which compiles with the classic JSX runtime under tsx (as nba-hub.test.mjs)

import { buildExperimentalSnapshot, snapshotMatchesSource, LANE, WITHHELD, AMENDMENT_A, unavailablePlayersForPublish } from "./experimental-public-lane.mjs";
import { eloWinProbabilityForPublish, eloWinProbabilityOf, eloWinProbabilityText, eloAccuracyDisclosure, ELO_WIN_PROBABILITY_LABEL } from "./elo-win-probability.mjs";
import { capabilityState, canEnterPredictionProducts } from "../../sport-capability-registry.ts";

const REPO = path.resolve(process.cwd(), "..");
const SRC = path.join(REPO, "data/internal/research/nba/experimental-v0.1/forecasts/2026-10-20.json");
const DOC = JSON.parse(fs.readFileSync(SRC, "utf8"));
// 2026-10-20 is ALREADY PUBLISHED without the Elo field: the fixture follows the publisher's rule, so every assertion
// below stays strict with the Elo switch ON (Release G). The slate WITH the field is `snapOn` (its own tests below).
const PUBLISHED_1020 = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nba/experimental-public/2026-10-20.json"), "utf8"));
const snap = () => buildExperimentalSnapshot({ forecastDoc: structuredClone(DOC), sourceFile: "nba/experimental-v0.1/forecasts/2026-10-20.json", sourceCommit: null, generatedAt: "2026-10-20T17:20:00Z", eloWinProbability: eloWinProbabilityForPublish(PUBLISHED_1020), unavailablePlayers: unavailablePlayersForPublish(PUBLISHED_1020) });
const snapOn = () => buildExperimentalSnapshot({ forecastDoc: structuredClone(DOC), sourceFile: "nba/experimental-v0.1/forecasts/2026-10-20.json", sourceCommit: null, generatedAt: "2026-10-20T17:20:00Z", eloWinProbability: true });
const ELO_ON = { enabled: true, disclosure: eloAccuracyDisclosure({ graded: 3, minN: 300 }) };

test("the lane is surface-scoped: NBA stays HISTORICAL_ONLY, so no prediction product can read it", () => {
  assert.equal(capabilityState("nba"), "HISTORICAL_ONLY");
  assert.equal(canEnterPredictionProducts("nba"), false);
  // §13 amendment A adds exactly one surface — the projection-only board — and nothing else.
  assert.deepEqual([...LANE.surfaces], AMENDMENT_A.enabled ? ["/nba", "/nba/projections"] : ["/nba"]);
  const s = snap();
  assert.equal(s.productEligible, false);
  assert.match(s.validation, /^NOT_VALIDATED/);
});

test("opening night: all three games publish from verified pre-tip receipts, exactly as frozen", () => {
  const s = snap();
  assert.deepEqual(s.games.map((g) => g.providerEventId), ["401909088", "401909089", "401909090"]);
  assert.equal(s.excluded.length, 0);
  const byId = new Map(DOC.games.map((g) => [String(g.providerEventId), g]));
  for (const g of s.games) {
    assert.ok(Date.parse(g.frozenAt) < Date.parse(g.tipUtc), `${g.providerEventId} frozen before tip`);
    assert.ok(snapshotMatchesSource(g, byId.get(g.providerEventId)), `${g.providerEventId}: every number is the receipt's stored value`);
  }
});

test("a tampered payload or a post-tip receipt is EXCLUDED, never published (mutation probes)", () => {
  const tampered = structuredClone(DOC);
  tampered.games[0].forecast.players.home[0].pts.p50 += 1;
  const a = buildExperimentalSnapshot({ forecastDoc: tampered, sourceFile: "x", generatedAt: "2026-10-20T17:20:00Z" });
  assert.equal(a.games.find((g) => g.providerEventId === "401909088"), undefined);
  assert.match(a.excluded.find((e) => e.providerEventId === "401909088").reason, /^RECEIPT_BROKEN/);
  const late = structuredClone(DOC);
  late.games[1].receipt.generatedAt = "2026-10-20T23:05:00Z";
  const b = buildExperimentalSnapshot({ forecastDoc: late, sourceFile: "x", generatedAt: "2026-10-20T23:10:00Z" });
  assert.equal(b.games.find((g) => g.providerEventId === "401909089"), undefined, "a forecast written after tip is never published");
  assert.throws(() => buildExperimentalSnapshot({ forecastDoc: { ...DOC, family: "v1" }, sourceFile: "x", generatedAt: "x" }), /REFUSED/);
});

test("withheld: no probability, no team score, no range, no market — anywhere in the snapshot", () => {
  // `withheld` NAMES what is withheld (its keys are labels, its values sentences) — every other key is checked.
  const text = JSON.stringify({ ...snap(), withheld: null });
  assert.doesNotMatch(text, /"(pHome|pAway|probability|winProbability|confidence|odds|line|edge|p10|p90|mean)"\s*:/);
  assert.doesNotMatch(text, /\d%/);
  for (const g of snap().games) {
    assert.equal(g.teamScores.state, "WITHHELD");
    assert.equal(Object.keys(g.teamScores).some((k) => /home|away|score\b|p50/.test(k)), false, "no team score value travels");
    for (const side of ["away", "home"]) for (const r of g.players[side]) assert.deepEqual(Object.keys(r.medians), ["pts", "reb", "ast", "threePm"]);
  }
  assert.ok(WITHHELD.winProbability && WITHHELD.teamScores && WITHHELD.playerRanges && WITHHELD.markets);
});

test("sources are labelled separately: Elo side (N2) and v0.1 player medians (N1) — never one engine", () => {
  for (const g of snap().games) {
    assert.match(g.elo.source, /^Elo team rating/);
    assert.match(g.players.source, /^v0\.1 roster-gated player simulation/);
    assert.ok(["DET", "NY", "SA"].includes(g.elo.favoured));
  }
});

test("the public snapshot carries no internal path and no private v1/theater marker", () => {
  const text = JSON.stringify(snap());
  for (const m of ["data/internal", "experimental-v1", "nba-sim-v1-coherent", "representativeSamples"]) assert.ok(!text.includes(m), m);
});

test("the committed public snapshot is exactly what the producer builds from the committed receipts", () => {
  const pub = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nba/experimental-public/2026-10-20.json"), "utf8"));
  const rebuilt = buildExperimentalSnapshot({ forecastDoc: structuredClone(DOC), sourceFile: pub.source.file, sourceCommit: pub.source.commit, generatedAt: pub.generatedAt, eloWinProbability: eloWinProbabilityForPublish(pub), unavailablePlayers: unavailablePlayersForPublish(pub) });
  assert.deepEqual(pub, JSON.parse(JSON.stringify(rebuilt)));
});

test("rendered lane: the UNVALIDATED banner, freeze times and sources show; no percentage, pick, edge, lean or rank", async () => {
  const { default: Lane } = await import("../../../components/nba/experimental-lane.tsx");
  const html = renderToStaticMarkup(React.createElement(Lane, { snapshot: JSON.parse(JSON.stringify(snap())) }));
  // founder directive 2026-10-23 public readiness: the registry banner (Official Forecast + its one disclosure)
  assert.match(html, /Frozen before tip-off and shown exactly as frozen\. Not a betting recommendation\. NBA forecasts are graded after every game; a public Model Performance record for NBA has not been published yet\./); // release owner 2026-10-23 exact text
  // founder mandate 2026-10-24: one table row per game — the slate date in the heading, each game's freeze time in its row
  assert.match(html, /Official Forecasts · Oct 20/);
  assert.match(html, /<th scope="col">Frozen<\/th>/);
  assert.match(html, /<td>8:29 AM ET<\/td>/);
  assert.match(html, /<strong>New York Knicks<\/strong>/, "team names, never mixed NY/NYK codes");
  assert.match(html, /favoured side comes from a team rating \(Elo\)/);
  // the sources (model ids) moved into the Model details disclosure — present, not deleted
  assert.match(html, /<summary>Model details<\/summary>/);
  assert.ok(html.includes(snap().games[0].players.source.replace(/'/g, "&#x27;")), "the player source is still printed");
  assert.match(html, /Not a betting recommendation\./); // founder directive 2026-10-23 public readiness
  assert.match(html, /not ranked/);
  const visible = html.replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(visible, /\d+(\.\d+)?\s?%/, "no percentage");
  // The lane's own disclaimers NAME what it does not offer ("not a pick", "No odds, lines, edges, picks…") — strip
  // exactly those sentences, then nothing else may use pick / edge / lean vocabulary.
  let rest = visible.replace(/not a pick/g, "");
  for (const v of Object.values(WITHHELD)) rest = rest.split(v).join("");
  assert.doesNotMatch(rest, /\b(picks?|edge|lean|best bet|lock|value)\b/i);
  assert.doesNotMatch(visible, /\blive\b/i, "a frozen forecast is never called live");
});

test("audit-only facts stay private: the public snapshot carries no seed and no hint of the withheld team score's side", async () => {
  const { buildExperimentalAudit } = await import("./experimental-public-lane.mjs");
  const text = JSON.stringify(snap());
  assert.doesNotMatch(text, /contradictsElo|"seed"|teamScoreContradictsElo/);
  const audit = buildExperimentalAudit({ forecastDoc: structuredClone(DOC), generatedAt: "2026-10-20T17:20:00Z" });
  assert.equal(audit.dataClass, "PRIVATE_RESEARCH");
  assert.deepEqual(audit.games.map((g) => g.teamScoreContradictsElo), [false, true, true], "PHI @ NY and OKC @ SA: the withheld v0.1 median favours the other side");
  assert.ok(audit.games.every((g) => typeof g.seed === "string"));
});

test("a past slate is never shown as current: laneIsCurrent is true only on or before the snapshot's own ET date", async () => {
  const { laneIsCurrent } = await import("./experimental-public-lane.mjs");
  const s = snap();
  assert.equal(laneIsCurrent(s, "2026-10-20"), true);
  assert.equal(laneIsCurrent(s, "2026-10-21"), false, "the next day's build hides yesterday's lane");
  assert.equal(laneIsCurrent(null, "2026-10-20"), false);
  assert.equal(laneIsCurrent({ ...s, date: null }, "2026-10-20"), false);
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/nba/page.tsx"), "utf8");
  const comp = fs.readFileSync(path.join(process.cwd(), "src/components/nba/experimental-lane.tsx"), "utf8");
  assert.match(page, /const today = currentEtDate\(\);\n\s+const lane = loadCurrentLane\(today\);/, "the page gates the lane on its slate date");
  assert.match(comp, /laneIsCurrent\(s, etDate\)/);
  // founder mandate 2026-10-24 (supersedes the 2026-10-20 "lane leads" order): today's games → the Official Forecasts →
  // Top Boards; the forecasts still render above every other section of the page.
  const iGames = page.indexOf("<NbaTodayGames"), iLane = page.indexOf("<NbaExperimentalLane"), iBoards = page.indexOf('id="nba-boards"');
  assert.ok(iGames > 0 && iGames < iLane && iLane < iBoards, "today's games → forecasts → boards");
});

test("every lane game has its forecast row, and today's card links to it; a game's status comes only from the finals record", async () => {
  // founder mandate 2026-10-24: the jump line gave way to today's game cards, each linking to its forecast (row or full page)
  const { forecastRowId, default: Lane } = await import("../../../components/nba/experimental-lane.tsx");
  const s = JSON.parse(JSON.stringify(snap()));
  const html = renderToStaticMarkup(React.createElement(Lane, { snapshot: s }));
  for (const g of s.games) assert.match(html, new RegExp(`<tr id="${forecastRowId(g.providerEventId)}">`));
  const cards = fs.readFileSync(path.join(process.cwd(), "src/components/nba/hub-overview.tsx"), "utf8");
  assert.match(cards, /`#\$\{forecastRowId\(g\.id\)\}`/, "a card without a built Game Simulation page links to its forecast row");
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/nba/page.tsx"), "utf8");
  assert.match(page, /if \(r\.status === "final" && lane\?\.games/, "only a recorded final is stated — a static page never freezes 'scheduled'/'tipped'");
  assert.doesNotMatch(page, /tipped — final not recorded yet|`scheduled · /);
});

test("compact hub: with /nba/projections on, /nba cards carry no player table and link to the board; the per-game weight stays bounded", async () => {
  const { default: Lane } = await import("../../../components/nba/experimental-lane.tsx");
  const s = JSON.parse(JSON.stringify(snap()));
  const html = renderToStaticMarkup(React.createElement(Lane, { snapshot: s }));
  if (!AMENDMENT_A.enabled) {
    assert.match(html, /<table/, "with the board off, the hub keeps the full tables (amendment A's rollback loses nothing)");
    return;
  }
  // founder mandate 2026-10-24: one forecast table row per GAME; the player rows still live on /nba/projections only
  assert.doesNotMatch(html, /<th[^>]*>(PTS|REB|AST|3PM|Min)<\/th>/, "the player rows live on /nba/projections only");
  assert.equal((html.match(/href="\/nba\/projections\/"/g) ?? []).length, 1, "one slate-level board link (projection-boards.test pins it)");
  for (const g of s.games) assert.match(html, new RegExp(`<tr id="nba-fc-${g.providerEventId}">[\\s\\S]*?<td>${g.players.away.length + g.players.home.length}</td>`));
  // An 11-game slate with full tables measured /nba at 388 KB (budget 250 KB, empty-lane page 204 KB). The compact card
  // must stay well under the ~3 KB/game (HTML + flight) that a 15-game slate leaves inside the budget.
  const perGame = (html.length - renderToStaticMarkup(React.createElement(Lane, { snapshot: { ...s, games: s.games.slice(0, 1) } })).length) / (s.games.length - 1);
  assert.ok(perGame < 900, `compact card ${Math.round(perGame)} B of HTML per game`);
  // Release G (Elo switch ON; release-owner-approved measured re-baseline, 2026-10-23): a slate that CARRIES the Elo
  // game-winner probability adds one inline line per card. Measured: this 10-20 fixture 998 B/game; the real 10-23 lane
  // forced ON 1001 B/game (component render) and 1001 B/game at 15 games; /nba total at 15 games with the Theater ON
  // and the CompactRow fix (PR 1226) 224,074 B unflipped → about 229 KB with the field (+4.8 KB) against the 250 KiB
  // budget the total is judged on. Bound = measured + 4.7 % (1045); the 900 B bound above is unchanged for slates
  // without the field, and no other bound moves.
  const on = JSON.parse(JSON.stringify(snapOn()));
  const htmlOn = renderToStaticMarkup(React.createElement(Lane, { snapshot: on, eloCtx: ELO_ON }));
  const perGameOn = (htmlOn.length - renderToStaticMarkup(React.createElement(Lane, { snapshot: { ...on, games: on.games.slice(0, 1) }, eloCtx: ELO_ON })).length) / (on.games.length - 1);
  assert.ok(perGameOn < 1045, `compact card with the Elo line ${Math.round(perGameOn)} B of HTML per game`);
});

// ── Release G: a slate WITH the Elo game-winner probability (founder decision 2026-10-23) ─────────────────────────
test("withheld, slate WITH the Elo field: the ONLY probability-like value is elo.winProbability (home/away + provenance); scores, ranges, markets stay withheld", () => {
  const s = snapOn();
  assert.deepEqual(Object.keys(s.withheld), ["teamScores", "playerRanges", "markets"]);
  for (const g of s.games) {
    assert.deepEqual(Object.keys(g.elo.winProbability), ["home", "away", "provenance"]);
    assert.equal(g.teamScores.state, "WITHHELD");
    for (const side of ["away", "home"]) for (const r of g.players[side]) assert.deepEqual(Object.keys(r.medians), ["pts", "reb", "ast", "threePm"]);
  }
  const text = JSON.stringify({ ...s, withheld: null, games: s.games.map((g) => ({ ...g, elo: { ...g.elo, winProbability: null } })) });
  assert.doesNotMatch(text, /"(pHome|pAway|probability|winProbability|confidence|odds|line|edge|p10|p90|mean)"\s*:\s*(?!null)/);
  assert.doesNotMatch(text, /\d%/);
});

test("rendered lane, slate WITH the Elo field: the ONLY percentage is the Elo row, under its label, with the disclosure", async () => {
  const { default: Lane } = await import("../../../components/nba/experimental-lane.tsx");
  const on = JSON.parse(JSON.stringify(snapOn()));
  const html = renderToStaticMarkup(React.createElement(Lane, { snapshot: on, eloCtx: ELO_ON }));
  let visible = html.replace(/<[^>]+>/g, " ");
  for (const g of on.games) {
    const t = eloWinProbabilityText(eloWinProbabilityOf(g, { enabled: true })).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    assert.ok(visible.includes(t), `${g.providerEventId}: the Elo row under "${ELO_WIN_PROBABILITY_LABEL}"`);
    visible = visible.split(t).join(" ");
  }
  assert.ok(visible.includes(ELO_ON.disclosure), "the accuracy disclosure is shown");
  visible = visible.split(ELO_ON.disclosure).join(" ");
  assert.doesNotMatch(visible, /\d+(\.\d+)?\s?%/, "no other percentage");
  assert.doesNotMatch(visible, /\blive\b/i);
});
