/**
 * Overnight sprint 2026-10-23 — /nba/projections between slates (competitor gap 1) and postgame actuals (gap 4).
 *   - actuals: only for a game with an official FINAL (not under review) whose stored box score is FINAL, names the
 *     snapshot's teams and agrees with the final's points; read with the graders' line reader — equal to the shadow
 *     grader's own recorded actuals; DNP / missing is never 0;
 *   - the wire format carries actuals verbatim beside the frozen values, which stay byte-identical;
 *   - between slates: today's scheduled games (schedule facts only) + the newest frozen board; no figure, no zero.
 * Run: npx tsx --test src/lib/sports/nba/projection-board-postgame.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

import { PROJECTION_BOARD_STATS, STATS, COMBO_STATS, WITHHELD } from "./experimental-public-lane.mjs";
import { boardRows, packBoard, sortRows, unpackBoard } from "./projection-board-ops.mjs";

const APP = process.cwd();
const DIR = path.join(APP, "public/data/nba/experimental-public");
const PUB_TEXT = fs.readFileSync(path.join(DIR, "2026-10-20.json"), "utf8");
const lane = () => JSON.parse(PUB_TEXT);
const { boardActuals } = await import("./projection-board-actuals.ts");
const { boardContext, todayGames } = await import("../../../components/nba/projection-board-context.ts");
const { committedLaneDates } = await import("../../../components/nba/experimental-lane.tsx");
const { default: View, PREDICTED_NOTE } = await import("../../../components/nba/projections-view.tsx");
const render = (props) => renderToStaticMarkup(React.createElement(View, props));
const visibleText = (html) => html.replace(/<[^>]+>/g, " ").replace(/&rsquo;/g, "’").replace(/&mdash;/g, "—").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
const cellsOf = (html) => {
  const body = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map((c) => c[1].replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&")));
};
const FORBIDDEN = /%|probabilit|\bpicks?\b|\bedges?\b|\blean\b|\bodds\b|\blines?\b|\bEV\b|\btop\b|\brank|#\s?\d|best bet|\block\b|\bvalue\b|\blive\b/i;

/* ── fixtures: one synthetic final box score per game of the real 10-20 snapshot ──────────────────────────────────── */
const PUB = lane();
const G0 = PUB.games[0];
const [dnp, absent, nullMin] = G0.players.away;
function boxFor(g, { status = "STATUS_FINAL", swap = false } = {}) {
  const players = [];
  for (const side of ["away", "home"]) {
    for (const r of g.players[side]) {
      if (r === absent) continue;
      const tid = side === "home" ? "H" : "A";
      if (r === dnp) { players.push({ providerAthleteId: r.providerAthleteId, providerTeamId: tid, didNotPlay: true, dnpReason: "COACH'S DECISION", minutes: null, pts: null, reb: null, ast: null, threePm: null }); continue; }
      if (r === nullMin) { players.push({ providerAthleteId: r.providerAthleteId, providerTeamId: tid, didNotPlay: false, minutes: null, pts: 4, reb: 1, ast: 0, threePm: 0 }); continue; }
      players.push({ providerAthleteId: r.providerAthleteId, providerTeamId: tid, didNotPlay: false, minutes: 20, pts: 10, reb: 5, ast: 3, threePm: 1 });
    }
  }
  const teams = [{ homeAway: "home", abbr: g.home.abbr, providerTeamId: "H" }, { homeAway: "away", abbr: g.away.abbr, providerTeamId: "A" }];
  if (swap) [teams[0].abbr, teams[1].abbr] = [teams[1].abbr, teams[0].abbr];
  return { status, boxscoreAvailable: true, teams, players };
}
const ptsOf = (box, tid) => box.players.filter((p) => p.providerTeamId === tid && Number.isInteger(p.minutes)).reduce((s, p) => s + p.pts, 0);
const finalsFor = (games, { conflicts = [], off = 0 } = {}) => ({
  finals: games.map((g) => { const b = boxFor(g); return { providerEventId: g.providerEventId, ftHome: ptsOf(b, "H") + off, ftAway: ptsOf(b, "A"), home: { tricode: g.home.abbr }, away: { tricode: g.away.abbr } }; }),
  conflicts: conflicts.map((id) => ({ providerEventId: id })),
});
const boxes = (opts) => (id) => { const g = PUB.games.find((x) => x.providerEventId === id); return g ? boxFor(g, opts) : null; };

test("actuals: recorded only for an official FINAL with a FINAL box score; DNP / missing / non-integer never become 0", () => {
  const a = boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: boxes(), finals: finalsFor(PUB.games) });
  assert.deepEqual(Object.values(a.games), PUB.games.map(() => "recorded"));
  const key = (r) => `${G0.providerEventId}:${r.providerAthleteId}`;
  assert.deepEqual(a.rows[key(dnp)], ["DNP", null, null, null, null, null, null, null]);
  assert.deepEqual(a.rows[key(absent)], [null, null, null, null, null, null, null, null], "not in the box score: dashes");
  assert.deepEqual(a.rows[key(nullMin)], [null, null, null, null, null, null, null, null], "minutes not an integer: not a measurement");
  const played = G0.players.home[0];
  // PTS REB AST 3PM, then PRA P+R P+A summed from the integer components (top-board-grading's rule).
  assert.deepEqual(a.rows[key(played)], [20, 10, 5, 3, 1, 18, 15, 13]);
  for (const row of Object.values(a.rows)) assert.ok(!row.slice(1).includes(0) || row[0] !== "DNP", "a DNP row never carries a zero");
  assert.deepEqual(PROJECTION_BOARD_STATS.map(([k]) => k), ["pts", "reb", "ast", "threePm", "pra", "ptsReb", "ptsAst"], "row values line up with the board's columns");
});

test("actuals: no final, final under review, unfinished box score, other teams, points disagreeing → no row, one reason per game", () => {
  const id = G0.providerEventId;
  const states = (opts, finals) => boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: boxes(opts), finals });
  const only = (a) => Object.keys(a.rows).some((k) => k.startsWith(`${id}:`));
  let a = states({}, finalsFor(PUB.games.slice(1)));
  assert.equal(a.games[id], "no-final"); assert.ok(!only(a));
  a = states({}, finalsFor(PUB.games, { conflicts: [id] }));
  assert.equal(a.games[id], "under-review"); assert.ok(!only(a));
  a = states({ status: "STATUS_IN_PROGRESS" }, finalsFor(PUB.games));
  assert.equal(a.games[id], "no-boxscore"); assert.ok(!only(a));
  a = states({ swap: true }, finalsFor(PUB.games));
  assert.equal(a.games[id], "no-boxscore", "the box score must name the snapshot's home and away teams"); assert.ok(!only(a));
  a = states({}, finalsFor(PUB.games, { off: 1 }));
  assert.equal(a.games[id], "points-disagree"); assert.ok(!only(a));
  a = boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: () => null, finals: finalsFor(PUB.games) });
  assert.deepEqual(Object.values(a.games), PUB.games.map(() => "no-boxscore"));
  assert.equal(boardActuals(null, PROJECTION_BOARD_STATS), null);
});

test("actuals on the COMMITTED record equal the shadow grader's own recorded actuals for every graded Top Board row", () => {
  const ledgerFile = path.join(APP, "..", "data/internal/research/nba/top-boards/v0.1/ledger.json");
  if (!fs.existsSync(ledgerFile)) return; // a checkout without the research tree has nothing to compare
  const latest = new Map();
  for (const e of JSON.parse(fs.readFileSync(ledgerFile, "utf8")).entries ?? []) if (!latest.has(e.rowId) || latest.get(e.rowId).seq < e.seq) latest.set(e.rowId, e);
  const statAt = { points: "pts", rebounds: "reb", assists: "ast", threes: "threePm", threePm: "threePm" };
  const ix = Object.fromEntries(PROJECTION_BOARD_STATS.map(([k], i) => [k, i + 1]));
  const byDate = new Map();
  let compared = 0;
  for (const e of latest.values()) {
    if (!e.accuracy || !fs.existsSync(path.join(DIR, `${e.date}.json`))) continue;
    if (!byDate.has(e.date)) byDate.set(e.date, boardActuals(JSON.parse(fs.readFileSync(path.join(DIR, `${e.date}.json`), "utf8")), PROJECTION_BOARD_STATS));
    const row = byDate.get(e.date).rows[`${e.eventId}:${e.providerAthleteId}`];
    const at = ix[statAt[e.category] ?? e.category];
    assert.ok(row && at, `${e.rowId} is on the board`);
    assert.equal(row[at], e.accuracy.actual, `${e.rowId} actual`);
    assert.equal(row[0], e.accuracy.actualMinutes, `${e.rowId} minutes`);
    compared += 1;
  }
  assert.ok(compared > 0 || latest.size === 0, `compared ${compared} graded rows`);
});

test("wire format: actuals travel verbatim beside the frozen values, which unpack byte-identical; no actuals → format unchanged", () => {
  const rows = boardRows(PUB, PROJECTION_BOARD_STATS);
  const acts = boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: boxes(), finals: finalsFor(PUB.games) });
  assert.deepEqual(Object.keys(packBoard(rows)).sort(), ["r", "t"]);
  const packed = JSON.parse(JSON.stringify(packBoard(rows, acts.rows)));
  assert.deepEqual(packed.r, packBoard(rows).r, "the frozen rows are exactly the pregame wire rows");
  const back = unpackBoard(packed);
  const want = sortRows(rows);
  const n = PROJECTION_BOARD_STATS.length;
  back.forEach((r, i) => {
    const w = want[i];
    assert.deepEqual(r.v.slice(0, n), w.v, `${w.id} frozen values`);
    const act = acts.rows[w.id];
    assert.deepEqual(r.v.slice(n), act.slice(1), `${w.id} actuals`);
    assert.equal(r.am, act[0]);
  });
  // A game with no recorded final: zeros on the wire mean "no actual" and unpack to nulls (dashes), never 0.
  const partial = unpackBoard(JSON.parse(JSON.stringify(packBoard(rows, {}))));
  for (const r of partial) { assert.deepEqual(r.v.slice(n), Array(n).fill(null)); assert.equal(r.am, null); }
});

test("render · postgame: Forecast beside Actual, frozen cells unchanged, dashes for DNP, legend, opens on PTS·REB·AST·3PM", () => {
  const acts = boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: boxes(), finals: finalsFor(PUB.games) });
  const html = render({ lane: lane(), role: "past", date: "2026-10-20", dates: ["2026-10-20"], dated: true, actuals: acts });
  const text = visibleText(html);
  assert.match(text, /Forecast = Official Forecast \(frozen pregame\), shown exactly as frozen\. Actual = the player’s figure in the final box score/);
  assert.match(text, /never a zero/);
  const head = visibleText(html.slice(html.indexOf("<thead"), html.indexOf("</thead>"))).trim();
  assert.equal(head, "Player Team Min PTS REB AST 3PM Exp. Actual Forecast Actual Forecast Actual Forecast Actual Forecast Actual");
  assert.equal((html.match(/aria-label="Sort by /g) ?? []).length, 8, "each frozen and each actual column sorts");
  assert.match(html, /<colgroup>/);
  const core = STATS.map(([k]) => k);
  const by = new Map();
  for (const side of ["away", "home"]) for (const g of PUB.games) for (const r of g.players[side]) by.set(`${r.name}${r.injuryStatus ? ` · ${r.injuryStatus}` : ""}|${g[side].abbr}`, { g, r });
  const f = (v) => (v == null ? "—" : String(v));
  const trs = cellsOf(html);
  assert.equal(trs.length, by.size);
  for (const c of trs) {
    const { g, r } = by.get(`${c[0]}|${c[1]}`);
    const act = acts.rows[`${g.providerEventId}:${r.providerAthleteId}`];
    assert.deepEqual(c.slice(2), [f(r.expectedMinutes), f(act[0]), ...core.flatMap((k, i) => [f(r.medians[k]), f(act[i + 1])])], c[0]);
    if (r === dnp) assert.deepEqual(c.slice(3), ["DNP", ...core.flatMap((k) => [f(r.medians[k]), "—"])]);
  }
  let rest = text.replace(/not a betting\s+recommendation/g, "");
  for (const v of Object.values(WITHHELD)) rest = rest.split(v).join("");
  assert.doesNotMatch(rest, FORBIDDEN);
  assert.doesNotMatch(text, /\b(accura|beat|outperform|hit rate|won|lost)\w*/i, "no accuracy claim beyond the per-player figures");
  // Without actuals the very same props render the pregame board, cell for cell.
  const pre = cellsOf(render({ lane: lane(), role: "past", date: "2026-10-20", dates: ["2026-10-20"], dated: true }));
  assert.equal(pre[0].length, 2 + 1 + PROJECTION_BOARD_STATS.length);
  assert.equal(COMBO_STATS.length, 3);
});

test("render · postgame: a final game without a usable box score says why once in its line; none recorded → pregame board", () => {
  const acts = boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: boxes(), finals: finalsFor(PUB.games) });
  acts.games[G0.providerEventId] = "no-boxscore";
  const games = PUB.games.map((g) => ({ id: g.providerEventId, tipUtc: g.tipUtc, status: "final", link: null }));
  const html = render({ lane: lane(), role: "past", date: "2026-10-20", games, dates: ["2026-10-20"], dated: true, actuals: acts });
  assert.equal((visibleText(html).match(/Actual: Unavailable \(final box score not yet recorded\)/g) ?? []).length, 1);
  const none = { games: Object.fromEntries(PUB.games.map((g) => [g.providerEventId, "no-boxscore"])), rows: {} };
  const html2 = render({ lane: lane(), role: "past", date: "2026-10-20", games, dates: ["2026-10-20"], dated: true, actuals: none });
  assert.doesNotMatch(html2, /<colgroup>|Exp\./);
  assert.equal((visibleText(html2).match(/Actual: Unavailable/g) ?? []).length, PUB.games.length);
  assert.equal(cellsOf(html2).join("\n"), cellsOf(render({ lane: lane(), role: "past", date: "2026-10-20", dated: true })).join("\n"));
});

/* ── between slates ─────────────────────────────────────────────────────────────────────────────────────────────── */
const T = (id, status, tipUtc = "2099-01-01T23:00Z") => ({ id, tipUtc, away: "Chicago Bulls", home: "Milwaukee Bucks", status });

test("render · between slates: today's games with tip-off and status, Official Forecast not yet available, latest frozen board linked", () => {
  const today = { date: "2026-10-23", scheduled: true, latest: "2026-10-22", games: [T("1", "upcoming", "2026-10-23T20:00Z"), T("2", "upcoming", "2026-10-23T23:00Z")] };
  const html = render({ lane: null, dates: ["2026-10-20", "2026-10-21", "2026-10-22"], today });
  const text = visibleText(html);
  assert.match(text, /Today · Fri, Oct 23 · 2 games/);
  assert.match(text, /Official Forecast publishes before tip-off: not yet available\./);
  assert.match(text, /Chicago Bulls at Milwaukee Bucks · 4:00 PM ET · Upcoming/);
  assert.match(html, /<a href="\/nba\/projections\/2026-10-22\/"[^>]*>Latest Official Forecast · Thu, Oct 22 →<\/a>/);
  assert.equal(html.split(PREDICTED_NOTE).length - 1, 1);
  assert.doesNotMatch(html, /<table/);
  assert.doesNotMatch(text, /\b0\b/, "no zero anywhere");
  assert.doesNotMatch(text, /no games|Predicted Player Statistics: Unavailable/i);
  // The slate-date chips are near the top: before the today section, not under it.
  assert.ok(html.indexOf('aria-label="Slate dates"') < html.indexOf("nba-today-h"));
  for (const h of hrefs(html)) assert.match(h, /^\/nba\/?$|^\/nba\/projections\/(\d{4}-\d{2}-\d{2}\/)?$/, h);
  let rest = text;
  for (const v of Object.values(WITHHELD)) rest = rest.split(v).join("");
  assert.doesNotMatch(rest, FORBIDDEN);
});

test("render · between slates: every game tipped → Unavailable; schedule not covering today → Unavailable, never 'no games'", () => {
  const base = { date: "2026-10-23", scheduled: true, latest: "2026-10-22" };
  const started = visibleText(render({ lane: null, today: { ...base, games: [T("1", "started"), T("2", "final")] } }));
  assert.match(started, /Official Forecast: Unavailable for this slate\./);
  assert.match(started, /· Started/); assert.match(started, /· Final/);
  const uncovered = visibleText(render({ lane: null, today: { ...base, scheduled: false, games: [] } }));
  assert.match(uncovered, /Today's schedule is Unavailable in this build/);
  assert.doesNotMatch(uncovered, /no NBA games/);
  const empty = visibleText(render({ lane: null, today: { ...base, games: [] } }));
  assert.match(empty, /The schedule lists no NBA games for Fri, Oct 23\./, "only when the capture covers the date");
  assert.match(empty, /Latest Official Forecast · Thu, Oct 22 →/);
  const first = render({ lane: null, today: { ...base, latest: null, games: [T("1", "upcoming")] } });
  assert.doesNotMatch(first, /Latest Official Forecast/, "no committed board, no link");
});

test("context · between slates: today's games come from the committed schedule; only the default view or the build's own date", () => {
  const sched = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nba/schedule/latest.json"), "utf8"));
  const etOf = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  // The schedule's LAST date: weeks ahead of any committed slate, so the default view has no lane on it.
  const day = etOf(sched.rows.at(-1).dateUtc);
  const want = sched.rows.filter((r) => etOf(r.dateUtc) === day).sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || a.providerEventId.localeCompare(b.providerEventId));
  const t = todayGames(day, `${day}T08:00:00Z`);
  assert.equal(t.scheduled, true);
  assert.deepEqual(t.games.map((g) => g.id), want.map((r) => r.providerEventId));
  assert.deepEqual(t.games.map((g) => g.away), want.map((r) => r.away.name));
  assert.deepEqual(Object.keys(t.games[0]).sort(), ["away", "home", "id", "status", "tipUtc"], "schedule facts only — no figure");
  const ctx = boardContext({ date: null, nowIso: `${day}T08:00:00Z`, buildEtDate: day, enabled: true });
  assert.equal(ctx.lane, null);
  assert.equal(ctx.today.date, day);
  assert.equal(ctx.today.latest, committedLaneDates().at(-1));
  assert.deepEqual(ctx.today.games, t.games);
  assert.equal(boardContext({ date: day, nowIso: `${day}T08:00:00Z`, buildEtDate: day, enabled: true }).today?.date, day, "the build's own dated page too");
  assert.equal(boardContext({ date: "2026-10-19", nowIso: `${day}T08:00:00Z`, buildEtDate: day, enabled: true }).today, null, "a past empty date stays a plain empty state");
  assert.equal(boardContext({ date: null, nowIso: `${day}T08:00:00Z`, buildEtDate: day, enabled: false }).today, null);
  const far = boardContext({ date: null, nowIso: "2099-06-01T08:00:00Z", buildEtDate: "2099-06-01", enabled: true });
  assert.equal(far.today.scheduled, false, "outside the capture's window an empty list proves nothing");
  assert.deepEqual(far.today.games, []);
  // A slate with a lane carries no `today`, and its actuals come from the same context.
  const past = boardContext({ date: "2026-10-20", nowIso: `${day}T08:00:00Z`, buildEtDate: day, enabled: true });
  assert.equal(past.today, null);
  assert.ok(past.actuals && Object.keys(past.actuals.games).length === PUB.games.length);
});

test("weight: postgame adds a bounded per-row cost (actual cells + wire), not per-game prose", () => {
  const acts = boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: boxes(), finals: finalsFor(PUB.games) });
  const pre = render({ lane: lane(), role: "past", date: "2026-10-20", dated: true }).length;
  const post = render({ lane: lane(), role: "past", date: "2026-10-20", dated: true, actuals: acts }).length;
  const rows = boardRows(PUB, PROJECTION_BOARD_STATS).length;
  const wire = JSON.stringify(packBoard(boardRows(PUB, PROJECTION_BOARD_STATS), acts.rows).a).length;
  // Static markup only (the flight is measured on the built page): the core group's 4 pairs replace the 7 frozen
  // columns, so the HTML barely grows; legend + two-row head + colgroup are fixed.
  assert.ok(post - pre < 1500 + rows * 25, `HTML +${post - pre} B for ${rows} rows`);
  assert.ok(wire / rows < 30, `~${Math.round(wire / rows)} B of wire per row`);
});
