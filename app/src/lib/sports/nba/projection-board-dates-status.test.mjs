/**
 * Follow-up to PR 1163 — /nba/projections date selection, game links and game status.
 *   - dates: only committed, schema-valid dated snapshots are listed or linked; a past slate is labelled as a past frozen
 *     slate and never as current; a date with no snapshot is the honest empty state; each page embeds only its own date;
 *   - links: only /nba anchors that the same build renders (never the Theater, a /games report or a sportsbook);
 *   - status: Upcoming / Started / Final (+ Postponed) from the committed schedule + finals record, per GAME (not per
 *     row), read-only — every rendered number is unchanged by it.
 * Run: npx tsx --test src/lib/sports/nba/projection-board-dates-status.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WITHHELD } from "./experimental-public-lane.mjs";
import {
  GAME_STATUS_LABEL, gameStatusAtBuild, gameStatusOnClock, gameLink, hubLaneAnchor, HUB_SCHEDULE_HREF, slateHref, slateNav,
} from "./projection-board-ops.mjs";

const APP = process.cwd();
const DIR = path.join(APP, "public/data/nba/experimental-public");
const PUB_TEXT = fs.readFileSync(path.join(DIR, "2026-10-20.json"), "utf8");
const PUB = JSON.parse(PUB_TEXT);
const lane = () => JSON.parse(PUB_TEXT);
const ms = (iso) => Date.parse(iso);

const { committedLaneDates, loadLaneForDate, laneCardId } = await import("../../../components/nba/experimental-lane.tsx");
const { boardContext } = await import("../../../components/nba/projection-board-context.ts");
const { default: View } = await import("../../../components/nba/projections-view.tsx");
const render = (props) => renderToStaticMarkup(React.createElement(View, props));
const visibleText = (html) => html.replace(/<[^>]+>/g, " ").replace(/&rsquo;/g, "’").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const tbody = (html) => html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

// ── status ──────────────────────────────────────────────────────────────────────────────────────────────────────────
test("status at build: final only from the finals record; postponed from the schedule; started by tip-off; else upcoming", () => {
  const tip = "2026-10-20T19:00Z";
  assert.equal(gameStatusAtBuild({ tipUtc: tip, nowMs: ms("2026-10-20T18:59:00Z") }), "upcoming");
  assert.equal(gameStatusAtBuild({ tipUtc: tip, nowMs: ms("2026-10-20T19:00:00Z") }), "started");
  // Long after tip-off, a game the record does not hold is still only "started" — the clock never says final.
  assert.equal(gameStatusAtBuild({ tipUtc: tip, nowMs: ms("2026-10-25T00:00:00Z"), fin: { state: "PENDING" } }), "started");
  assert.equal(gameStatusAtBuild({ tipUtc: tip, nowMs: ms("2026-10-20T23:00:00Z"), fin: { state: "FINAL", ftAway: 113, ftHome: 121 } }), "final");
  assert.equal(gameStatusAtBuild({ tipUtc: tip, nowMs: 0, fin: { state: "FINAL_UNDER_REVIEW" } }), "final", "the record's word, even before the build's tip-off");
  assert.equal(gameStatusAtBuild({ tipUtc: tip, nowMs: ms("2026-10-21T00:00:00Z"), scheduleStatusRaw: "STATUS_POSTPONED" }), "postponed");
  assert.equal(gameStatusAtBuild({ tipUtc: "not a time", nowMs: ms("2026-10-21T00:00:00Z") }), "upcoming", "an unreadable tip-off never advances");
  assert.deepEqual(Object.values(GAME_STATUS_LABEL), ["Upcoming", "Started", "Final", "Postponed"]);
});

test("status on the reader's clock: first render is the build's answer; upcoming → started only; never final, never back", () => {
  const tip = "2026-10-20T19:00Z";
  assert.equal(gameStatusOnClock("upcoming", tip, null), "upcoming");
  assert.equal(gameStatusOnClock("upcoming", tip, ms("2026-10-20T18:00:00Z")), "upcoming");
  assert.equal(gameStatusOnClock("upcoming", tip, ms("2026-10-20T19:00:01Z")), "started");
  assert.equal(gameStatusOnClock("upcoming", tip, ms("2027-01-01T00:00:00Z")), "started");
  assert.equal(gameStatusOnClock("started", tip, ms("2026-10-20T18:00:00Z")), "started", "never rewinds");
  assert.equal(gameStatusOnClock("final", tip, ms("2026-10-20T18:00:00Z")), "final");
  assert.equal(gameStatusOnClock("postponed", tip, ms("2026-10-21T18:00:00Z")), "postponed");
});

// ── links ───────────────────────────────────────────────────────────────────────────────────────────────────────────
test("links: the hub's own lane-card anchor, else its schedule section, else none — never the Theater or a /games page", () => {
  assert.equal(hubLaneAnchor("401909088"), `/nba/#${laneCardId("401909088")}`, "the same id /nba renders on the card");
  assert.deepEqual(gameLink("1", { hubLaneIds: new Set(["1"]), hubListedIds: new Set(["1"]) }), { href: "/nba/#nba-exp-1", label: "NBA hub card" });
  assert.deepEqual(gameLink("1", { hubLaneIds: new Set(), hubListedIds: new Set(["1"]) }), { href: HUB_SCHEDULE_HREF, label: "NBA hub schedule" });
  assert.equal(gameLink("1", {}), null);
  // Both anchors exist in the /nba source.
  const hub = fs.readFileSync(path.join(APP, "src/app/nba/page.tsx"), "utf8");
  assert.match(hub, /<section id="nba-games"/);
  assert.match(fs.readFileSync(path.join(APP, "src/components/nba/experimental-lane.tsx"), "utf8"), /export const laneCardId = \(id: string\) => `nba-exp-\$\{id\}`/);
  // The ops and view never name a forbidden destination.
  for (const rel of ["src/lib/sports/nba/projection-board-ops.mjs", "src/components/nba/projections-view.tsx", "src/components/nba/projection-board-context.ts", "src/components/nba/projection-game-status.tsx"]) {
    const code = fs.readFileSync(path.join(APP, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /simulation|theater|\/games\/|\/dev\/|draftkings|fanduel|betmgm|caesars|sportsbook|https?:\/\//i, rel);
  }
});

// ── dates ───────────────────────────────────────────────────────────────────────────────────────────────────────────
test("dates: only committed, schema-valid dated snapshots whose own date matches the file name", () => {
  const dates = committedLaneDates();
  assert.ok(dates.includes("2026-10-20"));
  assert.deepEqual(dates, [...dates].sort());
  for (const d of dates) {
    const s = JSON.parse(fs.readFileSync(path.join(DIR, `${d}.json`), "utf8"));
    assert.equal(s.date, d);
    assert.equal(s.schema, "nba-experimental-public-snapshot@1");
  }
  assert.ok(!dates.includes("latest"));
  assert.deepEqual(loadLaneForDate("2026-10-20"), PUB, "the dated file exactly as committed");
  assert.equal(loadLaneForDate("2026-10-19"), null, "no file → nothing");
  assert.equal(loadLaneForDate("../latest"), null, "not a date → nothing");
});

test("slate nav: bounded, newest first, neighbours reachable, nothing invented", () => {
  const all = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
  const nav = slateNav([...all, "junk", "2026-11-05"], "2026-11-03", 5);
  assert.deepEqual(nav.recent, ["2026-11-30", "2026-11-29", "2026-11-28", "2026-11-27", "2026-11-26"]);
  assert.equal(nav.prev, "2026-11-02");
  assert.equal(nav.next, "2026-11-04");
  assert.equal(nav.total, 30);
  assert.deepEqual(slateNav(["2026-10-20"], "2026-10-25"), { recent: ["2026-10-20"], prev: "2026-10-20", next: null, total: 1 });
  assert.equal(slateHref("2026-10-20"), "/nba/projections/2026-10-20/");
});

test("the dated route: static params = committed dates + the build's ET date (never empty); dynamicParams off", async () => {
  const src = fs.readFileSync(path.join(APP, "src/app/nba/projections/[date]/page.tsx"), "utf8");
  assert.match(src, /export const dynamicParams = false;/);
  const mod = await import("../../../app/nba/projections/[date]/page.tsx");
  const { currentEtDate } = await import("../../freshness.ts");
  const params = mod.generateStaticParams().map((p) => p.date);
  assert.deepEqual(params, [...new Set([...committedLaneDates(), currentEtDate()])].sort());
  assert.ok(params.length > 0);
});


// ── context ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("context: 10-20 built on 10-21 is PAST, links to the hub schedule, status from the finals record", () => {
  const ctx = boardContext({ date: "2026-10-20", nowIso: "2026-10-21T12:00:00Z", buildEtDate: "2026-10-21", enabled: true });
  assert.equal(ctx.role, "past");
  assert.deepEqual(ctx.lane, PUB, "the snapshot passes through untouched");
  const by = Object.fromEntries(ctx.games.map((g) => [g.id, g]));
  assert.equal(by["401909088"].status, "final", "the finals record holds BOS @ DET");
  // The others are "final" once the record holds them, "started" until then — never "upcoming" after tip-off.
  for (const id of ["401909089", "401909090"]) assert.ok(["final", "started"].includes(by[id].status), id);
  for (const g of ctx.games) assert.ok(g.link == null || g.link.href === HUB_SCHEDULE_HREF, "no lane card exists on /nba for a past slate");
  assert.deepEqual(Object.keys(ctx.games[0]).sort(), ["id", "link", "status", "tipUtc"], "one short code, one instant and one link per game");
  // The default view on 10-21 has no current slate: empty, never the 10-20 board.
  const def = boardContext({ date: null, nowIso: "2026-10-21T12:00:00Z", buildEtDate: "2026-10-21", enabled: true });
  assert.equal(def.lane, null);
  assert.deepEqual(def.games, []);
  assert.ok(def.dates.includes("2026-10-20"));
  // A date with no snapshot: empty.
  const none = boardContext({ date: "2026-10-19", nowIso: "2026-10-21T12:00:00Z", buildEtDate: "2026-10-21", enabled: true });
  assert.equal(none.lane, null);
  assert.equal(none.role, "past");
  // The amendment switch blanks every date.
  assert.equal(boardContext({ date: "2026-10-20", nowIso: "2026-10-21T12:00:00Z", buildEtDate: "2026-10-21", enabled: false }).lane, null);
});

test("context: 10-20 built on 10-20 is CURRENT and links each game to its frozen card on /nba", () => {
  const ctx = boardContext({ date: null, nowIso: "2026-10-20T15:00:00Z", buildEtDate: "2026-10-20", enabled: true });
  assert.equal(ctx.role, "current");
  assert.deepEqual(ctx.lane, PUB);
  for (const g of ctx.games) assert.equal(g.link.href, `/nba/#nba-exp-${g.id}`);
  const by = Object.fromEntries(ctx.games.map((g) => [g.id, g.status]));
  assert.equal(by["401909090"], "upcoming");
});

// ── render ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const CARD = (id) => ({ href: `/nba/#nba-exp-${id}`, label: "NBA hub card" });
const SCHED = { href: HUB_SCHEDULE_HREF, label: "NBA hub schedule" };
const G = (id, status, link = CARD(id), tipUtc = "2099-01-01T00:00Z") => ({ id, tipUtc, status, link });
const ids = PUB.games.map((g) => g.providerEventId);
const liText = (html, i) => {
  let at = 0;
  for (let k = 0; k <= i; k++) at = html.indexOf("<li>", at + 1);
  return visibleText(html.slice(at, html.indexOf("</li>", at)));
};

test("render · current: banner kept, no past label, per-game status + hub card link, numbers unchanged", () => {
  const games = [G(ids[0], "final"), G(ids[1], "started"), G(ids[2], "upcoming")];
  const html = render({ lane: lane(), role: "current", date: "2026-10-20", games, dates: ["2026-10-20"] });
  const text = visibleText(html);
  assert.match(html, /UNVALIDATED EXPERIMENTAL SIMULATION/);
  assert.doesNotMatch(text, /Past frozen slate|\(past\)/);
  assert.match(liText(html, 0), / · Final · NBA hub card $/);
  assert.match(liText(html, 1), / · Started · NBA hub card $/);
  assert.match(liText(html, 2), / · Upcoming · NBA hub card $/, "the reader's-clock label's first render is the build's answer");
  for (const id of ids) assert.ok(html.includes(`href="/nba/#nba-exp-${id}"`), id);
  assert.equal(tbody(html), tbody(render({ lane: lane() })), "status and links never change a row or a number");
  assert.equal((html.match(/nba-exp-/g) ?? []).length, 3, "one link per game, none per row");
  assert.doesNotMatch(tbody(html), /Upcoming|Started|Final|href=/, "nothing per row");
});

test("render · each status label, including postponed and a game with no link", () => {
  for (const status of ["upcoming", "started", "final", "postponed"]) {
    const html = render({ lane: lane(), games: [G(ids[0], status, null)] });
    const li = liText(html, 0);
    assert.ok(li.endsWith(`${PUB.games[0].receipt.payloadSha256.slice(0, 12)} · ${GAME_STATUS_LABEL[status]} `), `${status}: ${li}`);
    assert.doesNotMatch(html, /nba-exp-|nba-games/, "no link when none exists in the build");
  }
});

test("render · past date: labelled a past frozen slate, never current; same frozen numbers; hub schedule link", () => {
  const games = ids.map((id) => G(id, "final", SCHED));
  const html = render({ lane: lane(), role: "past", date: "2026-10-20", games, dates: ["2026-10-20"], dated: true });
  const text = visibleText(html);
  assert.match(text, /NBA player projections · Oct 20 slate \(past\)/);
  assert.match(text, /Past frozen slate · Oct 20\. This is not the current slate/);
  assert.match(html, /UNVALIDATED EXPERIMENTAL SIMULATION/);
  assert.doesNotMatch(text, /No current experimental projections/);
  assert.equal(tbody(html), tbody(render({ lane: lane() })), "the past board's cells are the same frozen values");
  assert.match(html, /<strong aria-current="page">Oct 20<\/strong>/);
  assert.ok(hrefs(html).includes("/nba/projections/"), "a way back to the current slate");
  assert.equal(hrefs(html).filter((h) => h === HUB_SCHEDULE_HREF).length, 3);
});

test("render · empty date and empty default view: honest empty state, banner kept, no table", () => {
  const html = render({ lane: null, role: "past", date: "2026-10-19", dates: ["2026-10-20"], dated: true });
  assert.match(visibleText(html), /No frozen experimental projections are committed for Oct 19/);
  assert.match(html, /UNVALIDATED EXPERIMENTAL SIMULATION/);
  assert.doesNotMatch(html, /<table/);
  assert.ok(hrefs(html).includes("/nba/projections/2026-10-20/"), "the committed date is linked");
  assert.ok(!hrefs(html).includes("/nba/projections/2026-10-19/"), "the empty date is never linked");
  const def = render({ lane: null, dates: ["2026-10-20"] });
  assert.match(def, /No current experimental projections/);
  assert.doesNotMatch(def, /<table|Past frozen slate/);
  assert.ok(hrefs(def).includes("/nba/projections/2026-10-20/"));
});

test("render · every href is an existing destination; no forbidden vocabulary in any new state", () => {
  const states = [
    render({ lane: lane(), games: ids.map((id) => G(id, "upcoming")), dates: ["2026-10-20"] }),
    render({ lane: lane(), role: "past", date: "2026-10-20", games: ids.map((id) => G(id, "final", SCHED)), dates: ["2026-10-20"], dated: true }),
    render({ lane: lane(), role: "past", date: "2026-10-20", games: ids.map((id) => G(id, "postponed", null)), dates: ["2026-10-20"], dated: true }),
    render({ lane: null, role: "past", date: "2026-10-19", dates: ["2026-10-20"], dated: true }),
  ];
  for (const html of states) {
    // next/link renders "/nba/" as "/nba" outside the app router; both are the hub.
    for (const h of hrefs(html)) assert.match(h, /^\/nba\/?$|^\/nba\/(#nba-exp-\d+|#nba-games|projections\/(\d{4}-\d{2}-\d{2}\/)?)$/, h);
    let rest = visibleText(html).replace(/not a betting\s+recommendation/g, "");
    for (const v of Object.values(WITHHELD)) rest = rest.split(v).join("");
    assert.doesNotMatch(rest, /%|probabilit|\bpicks?\b|\bedges?\b|\blean\b|\bodds\b|\blines?\b|\bEV\b|\btop\b|\brank|#\s?\d|best bet|\block\b|\bvalue\b|\blive\b/i);
  }
});

test("weight: status + link cost is per game and small (no per-row markup)", () => {
  const base = render({ lane: lane() }).length;
  const withGames = render({ lane: lane(), games: [G(ids[0], "final"), G(ids[1], "started"), G(ids[2], "upcoming")] }).length;
  const explainer = " Game status is read-only, from the schedule and finals record (Started: tipped off, no final recorded yet); it never changes a frozen figure.".length;
  assert.ok(withGames - base < explainer + 3 * 110 + 1, "fixed explainer + per-game cost only");
  const perGame = (withGames - base - explainer) / 3;
  assert.ok(perGame < 110, `~${Math.round(perGame)} B of HTML per game`);
});
