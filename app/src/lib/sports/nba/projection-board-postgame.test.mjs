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

test("actuals on the COMMITTED record equal the shadow grader's own recorded actuals for every graded Top Board row — a stat corrected after grading is shown corrected AND flagged with the graded value", () => {
  /* Release owner P0 2026-10-25: ESPN corrected 401909852 (Deni Avdija REB 6 → 7) after the Top Board grader graded the
     first capture. Grades are never rewritten and the page never silently differs: for each graded row,
       - the grade's own box score is the first capture → the board's GRADED value (the corrected-after-grading mark's
         value when a correction changed it, else the shown actual) equals the ledger's actual exactly, and a changed
         value is flagged and equals the stored correction exactly;
       - the grade's box score is a correction (a grader that follows corrections) → the shown actual equals it exactly. */
  const ledgerFile = path.join(APP, "..", "data/internal/research/nba/top-boards/v0.1/ledger.json");
  if (!fs.existsSync(ledgerFile)) return; // a checkout without the research tree has nothing to compare
  const latest = new Map();
  for (const e of JSON.parse(fs.readFileSync(ledgerFile, "utf8")).entries ?? []) if (!latest.has(e.rowId) || latest.get(e.rowId).seq < e.seq) latest.set(e.rowId, e);
  const statAt = { points: "pts", rebounds: "reb", assists: "ast", threes: "threePm", threePm: "threePm" };
  const ix = Object.fromEntries(PROJECTION_BOARD_STATS.map(([k], i) => [k, i + 1]));
  const byDate = new Map();
  let compared = 0, correctedRows = 0;
  for (const e of latest.values()) {
    if (!e.accuracy || !fs.existsSync(path.join(DIR, `${e.date}.json`))) continue;
    if (!byDate.has(e.date)) byDate.set(e.date, boardActuals(JSON.parse(fs.readFileSync(path.join(DIR, `${e.date}.json`), "utf8")), PROJECTION_BOARD_STATS));
    const a = byDate.get(e.date);
    const key = `${e.eventId}:${e.providerAthleteId}`;
    const row = a.rows[key];
    const at = ix[statAt[e.category] ?? e.category];
    assert.ok(row && at, `${e.rowId} is on the board`);
    const gradedOnCorrection = /\/corrections\//.test(String(e.source?.file ?? ""));
    const was = a.corrected?.[key] ?? {};
    if (gradedOnCorrection) {
      assert.equal(row[at], e.accuracy.actual, `${e.rowId}: graded on a correction → the board shows that value`);
    } else {
      assert.equal(at in was ? was[at] : row[at], e.accuracy.actual, `${e.rowId}: the graded value`);
      assert.equal(0 in was ? was[0] : row[0], e.accuracy.actualMinutes, `${e.rowId}: the graded minutes`);
      if (at in was) {
        correctedRows += 1;
        assert.ok(a.corrections?.[e.eventId]?.correctedAt, `${e.rowId}: the correction is dated`);
        assert.notEqual(row[at], was[at], `${e.rowId}: a flagged value really changed`);
      }
    }
    compared += 1;
  }
  assert.ok(compared > 0 || latest.size === 0, `compared ${compared} graded rows`);
  // The case that turned main red is covered, exactly: Avdija REB 6 → 7, so PRA 38 → 39, P+R 32 → 33.
  const d23 = byDate.get("2026-10-23");
  if (d23?.corrected?.["401909852:4683021"]) {
    assert.deepEqual(d23.corrected["401909852:4683021"], { 2: 6, 5: 38, 6: 32 });
    assert.deepEqual([d23.rows["401909852:4683021"][2], d23.rows["401909852:4683021"][5], d23.rows["401909852:4683021"][6]], [7, 39, 33]);
    assert.ok(correctedRows > 0);
  }
});

test("stat corrections render honestly: corrected figure + dagger + the graded value for screen readers; legend, chip and Model details say so", () => {
  const snap = lane();
  const acts = boardActuals(snap, PROJECTION_BOARD_STATS, { boxscoreOf: boxes(), finals: finalsFor(PUB.games) });
  const key = `${G0.providerEventId}:${G0.players.home[0].providerAthleteId}`;
  // a correction raised the first home player's REB 5 → 6 after grading (fixture)
  acts.rows[key] = [...acts.rows[key]]; acts.rows[key][2] = 6; acts.rows[key][5] += 1; acts.rows[key][6] += 1;
  acts.corrected = { [key]: { 2: 5, 5: acts.rows[key][5] - 1, 6: acts.rows[key][6] - 1 } };
  acts.corrections = { [G0.providerEventId]: { firstCapturedAt: "2026-10-21T13:16:03Z", correctedAt: "2026-10-22T13:41:38Z" } };
  const html = render({ lane: snap, role: "past", date: "2026-10-20", dates: ["2026-10-20"], dated: true, actuals: acts });
  const text = visibleText(html);
  assert.match(text, /† stat corrected by ESPN after grading: the corrected figure is shown, and the graded one is listed in Model details\./);
  assert.match(html, /6<span aria-hidden="true">†<\/span><span class="sr-only"> \(stat corrected after grading; graded on 5\)<\/span>/);
  assert.match(text, new RegExp(`${G0.away.abbr} @ ${G0.home.abbr} · \\S+ · stat corrected after grading`));
  assert.match(visibleText(detailsOf(html)), new RegExp(`${G0.away.abbr} @ ${G0.home.abbr}: ESPN corrected the final box score \\(captured Oct 22, 9:41 AM ET\\) after grading on the first final box score \\(captured Oct 21, 9:16 AM ET\\)\\. Graded → corrected: ${G0.players.home[0].name} REB 5 → 6, PRA \\d+ → \\d+, P\\+R \\d+ → \\d+\\.`));
  const back = unpackBoard(JSON.parse(JSON.stringify(packBoard(boardRows(PUB, PROJECTION_BOARD_STATS), acts.rows, null, null, acts.corrected))));
  const flagged = back.filter((r) => r.cv);
  assert.equal(flagged.length, 1);
  assert.deepEqual(flagged[0].cv, acts.corrected[key]);
  // Without corrections nothing changes: no dagger, no list, no wire field.
  const plain = boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: boxes(), finals: finalsFor(PUB.games) });
  assert.equal(plain.corrected, undefined);
  assert.doesNotMatch(render({ lane: lane(), actuals: plain }), /†|corrected/);
  assert.ok(!("c" in packBoard(boardRows(PUB, PROJECTION_BOARD_STATS), plain.rows, null, null, null)));
});

test("the reader flags exactly the values a stored correction changed (first capture vs correction), and nothing on an uncorrected game", () => {
  const first = (id) => boxes()(id);
  const fixed = (id) => { const b = boxes()(id); if (id === G0.providerEventId) { b.capturedAt = "2026-10-22T13:41:38Z"; const p = b.players.find((x) => x.providerAthleteId === G0.players.home[0].providerAthleteId); p.reb += 1; } return b; };
  const fin = finalsFor(PUB.games);
  const a = boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: fixed, firstCaptureOf: (id) => ({ ...first(id), capturedAt: "2026-10-21T13:16:03Z" }), finals: fin });
  const key = `${G0.providerEventId}:${G0.players.home[0].providerAthleteId}`;
  assert.deepEqual(Object.keys(a.corrected), [key], "only the changed player");
  assert.deepEqual(a.corrected[key], { 2: 5, 5: 18, 6: 15 }, "REB and the combos that contain it, with the graded values");
  assert.deepEqual(a.corrections, { [G0.providerEventId]: { firstCapturedAt: "2026-10-21T13:16:03Z", correctedAt: "2026-10-22T13:41:38Z" } });
  assert.equal(a.rows[key][2], 6);
  const none = boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: boxes(), firstCaptureOf: boxes(), finals: fin });
  assert.equal(none.corrected, undefined, "same capture → nothing flagged");
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
  assert.match(text, /Forecast vs\. Actual Forecast : the Official Forecast, frozen before tip-off and never changed\. Actual : the final box score \(ESPN\), after the official final\. A dash means did not play — never a zero\./);
  assert.match(visibleText(detailsOf(html)), /“awaiting final” means the game has no official final yet; “Played, no projection” and “Projection unavailable” mark players without an Official Forecast projection — their actuals are shown, no forecast is invented\. Forecast and Actual are compared per player only\./);
  const head = visibleText(html.slice(html.indexOf("<thead"), html.indexOf("</thead>"))).trim();
  assert.equal(head, "Player Team Min PTS REB AST 3PM Exp. Actual Forecast Actual Forecast Actual Forecast Actual Forecast Actual");
  assert.equal((html.match(/aria-label="Sort by /g) ?? []).length, 10, "each frozen and each actual column sorts, and both minutes columns");
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
  // Fixed: the Forecast vs. Actual heading + legend, the two-row head with its minutes sort buttons, the colgroup.
  assert.ok(post - pre < 2000 + rows * 25, `HTML +${post - pre} B for ${rows} rows`);
  assert.ok(wire / rows < 30, `~${Math.round(wire / rows)} B of wire per row`);
});

/* ── public-readiness pass (founder mandate 2026-10-24) ─────────────────────────────────────────────────────────── */
const detailsOf = (html) => html.slice(html.indexOf("<details"), html.indexOf("</details>"));
const outsideDetails = (html) => html.slice(0, html.indexOf("<details")) + html.slice(html.indexOf("</details>"));

test("consumer language: model ids, receipts and engine notes only inside Model details, each model id once", () => {
  const acts = boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: boxes(), finals: finalsFor(PUB.games) });
  for (const props of [{ lane: lane() }, { lane: lane(), role: "past", date: "2026-10-20", dated: true, actuals: acts }]) {
    const html = render(props);
    const out = visibleText(outsideDetails(html));
    assert.doesNotMatch(out, /experimental|v0\.1|v0 engine|receipt|nba-preseason/i, "nothing model-internal outside Model details");
    const det = visibleText(detailsOf(html));
    assert.match(det, /^ ?Model details · freeze times, receipts and method · 3 games/);
    assert.equal(det.split(PUB.games[0].receipt.modelVersion).length - 1, 2, "the model id once in the Model line, once in the Source line");
    for (const g of PUB.games) assert.ok(det.includes(g.receipt.payloadSha256.slice(0, 12)), "each receipt hash stays");
    assert.equal(html.split(PREDICTED_NOTE).length - 1, 1);
  }
});

test("game navigation: one chip per game with its status; a chip toggles the game filter (aria-pressed)", () => {
  const games = PUB.games.map((g, i) => ({ id: g.providerEventId, tipUtc: "2099-01-01T00:00Z", status: ["final", "started", "upcoming"][i], link: null }));
  const html = render({ lane: lane(), games });
  const chips = [...html.matchAll(/<button type="button" aria-pressed="(true|false)"[^>]*>(.*?)<\/button>/g)].map((m) => [m[1], visibleText(m[2]).trim()]);
  assert.deepEqual(chips, PUB.games.map((g, i) => ["false", `${g.away.abbr} @ ${g.home.abbr} · ${["Final", "Started", "Upcoming"][i]}`]));
  assert.match(html, /role="group" aria-label="Games: show one game"/);
});

test("Forecast vs. Actual: a finished slate without verified actuals says 'awaiting final box scores'; a row awaiting its final says so", () => {
  const finalG = PUB.games.map((g) => ({ id: g.providerEventId, tipUtc: g.tipUtc, status: "final", link: null }));
  const none = { games: Object.fromEntries(PUB.games.map((g) => [g.providerEventId, "no-boxscore"])), rows: {} };
  const html = render({ lane: lane(), role: "past", date: "2026-10-20", games: finalG, dated: true, actuals: none });
  assert.match(visibleText(html), /Forecast vs\. Actual: awaiting final box scores\. Each player’s actual figures appear beside the frozen Official Forecast once that game’s official final and box score are recorded\./);
  assert.equal((visibleText(html).match(/· box score pending/g) ?? []).length, PUB.games.length, "each chip says why");
  // Before tip-off nothing is due: no banner, no chip note.
  const pre = render({ lane: lane(), games: PUB.games.map((g) => ({ id: g.providerEventId, tipUtc: "2099-01-01T00:00Z", status: "upcoming", link: null })), actuals: { games: Object.fromEntries(PUB.games.map((g) => [g.providerEventId, "no-final"])), rows: {} } });
  assert.doesNotMatch(visibleText(pre), /awaiting|pending/);
  // Mixed: one game recorded, one still without a final → that game's rows read "awaiting final", never a zero.
  const acts = boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: boxes(), finals: finalsFor(PUB.games.slice(1)) });
  assert.equal(acts.games[G0.providerEventId], "no-final");
  const mixed = render({ lane: lane(), games: PUB.games.map((g, i) => ({ id: g.providerEventId, tipUtc: g.tipUtc, status: i ? "final" : "started", link: null })), actuals: acts });
  const trs = cellsOf(mixed);
  const g0Names = new Set(G0.players.away.concat(G0.players.home).map((r) => `${r.name}${r.injuryStatus ? ` · ${r.injuryStatus}` : ""}`));
  const g0Rows = trs.filter((c) => g0Names.has(c[0]));
  assert.equal(g0Rows.length, g0Names.size);
  for (const c of g0Rows) { assert.equal(c[3], "awaiting final"); assert.ok(c.slice(4).filter((_, j) => j % 2 === 1).every((v) => v === "—"), "actual cells are dashes"); }
  assert.match(visibleText(mixed), new RegExp(`${G0.away.abbr} @ ${G0.home.abbr} · Started · awaiting final`));
});

test("sort by minutes: expected and actual minutes are reader sorts; DNP and missing sort last", () => {
  const acts = boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: boxes(), finals: finalsFor(PUB.games) });
  const back = unpackBoard(JSON.parse(JSON.stringify(packBoard(boardRows(PUB, PROJECTION_BOARD_STATS), acts.rows))));
  const am = sortRows(back, { key: "am", dir: "desc" }).map((r) => r.am);
  const nums = am.filter((x) => typeof x === "number");
  assert.deepEqual(nums, [...nums].sort((a, b) => b - a));
  assert.ok(am.slice(nums.length).every((x) => typeof x !== "number"), "DNP / missing last");
  assert.deepEqual(sortRows(back, { key: "min", dir: "asc" }).map((r) => r.min), back.map((r) => r.min).sort((a, b) => a - b));
});

test("coverage: a player who PLAYED without a projection is listed with his verified actuals and no forecast value", () => {
  const extra = { providerAthleteId: "9990001", name: "Rookie Fixture", providerTeamId: "H", didNotPlay: false, minutes: 12, pts: 4, reb: 3, ast: 1, threePm: 0 };
  const benchDnp = { providerAthleteId: "9990002", name: "Bench Fixture", providerTeamId: "H", didNotPlay: true, minutes: null, pts: null, reb: null, ast: null, threePm: null };
  const withExtra = (id) => { const b = boxes()(id); if (id === G0.providerEventId) b.players.push(extra, benchDnp); return b; };
  const fin = finalsFor(PUB.games);
  fin.finals[0].ftHome += 4; // the box score's team points include the extra player's 4
  const acts = boardActuals(lane(), PROJECTION_BOARD_STATS, { boxscoreOf: withExtra, finals: fin });
  assert.equal(acts.games[G0.providerEventId], "recorded");
  assert.deepEqual(acts.unprojected, [{ id: "9990001", game: G0.providerEventId, side: "home", name: "Rookie Fixture", actual: [12, 4, 3, 1, 0, 8, 7, 5] }], "only players with minutes > 0; a DNP bench player is not listed");
  // Wire + unpack: frozen values all null, actuals verbatim, after the board rows.
  const rows = boardRows(PUB, PROJECTION_BOARD_STATS);
  const packed = JSON.parse(JSON.stringify(packBoard(rows, acts.rows, null, [{ name: "Rookie Fixture", game: G0.providerEventId, team: G0.home.abbr, teamName: G0.home.name, code: "P", pos: null, actual: acts.unprojected[0].actual }])));
  assert.deepEqual(packed.r, packBoard(rows).r, "the frozen rows are untouched");
  const np = unpackBoard(packed).filter((r) => r.np);
  assert.equal(np.length, 1);
  assert.deepEqual(np[0].v, [...Array(PROJECTION_BOARD_STATS.length).fill(null), 4, 3, 1, 0, 8, 7, 5]);
  assert.equal(np[0].min, null); assert.equal(np[0].am, 12); assert.equal(np[0].team, G0.home.abbr); assert.equal(np[0].np, "P");
  // Static render: the count line and toggle are in the HTML; the rows come after hydration (weight).
  const html = render({ lane: lane(), role: "past", date: "2026-10-20", dated: true, actuals: { ...acts, unprojected: acts.unprojected } });
  assert.match(visibleText(html), /· 1 without a projection Hide them/);
  assert.match(visibleText(html), /Coverage list not recorded for this slate\. Players who played without a projection are listed from the final box score\./);
  assert.match(html, /aria-pressed="true"[^>]*>Hide them</);
  assert.doesNotMatch(html, /Rookie Fixture/, "rows render after hydration");
  assert.match(visibleText(html), /“Played, no projection” and “Projection unavailable” mark players without an Official Forecast projection — their actuals are shown, no forecast is invented/);
});

test("coverage on the COMMITTED record: every listed player played, is not on that game's board, and carries integer minutes", () => {
  for (const d of committedLaneDates()) {
    const snap = JSON.parse(fs.readFileSync(path.join(DIR, `${d}.json`), "utf8"));
    const a = boardActuals(snap, PROJECTION_BOARD_STATS);
    for (const u of a.unprojected ?? []) {
      const g = snap.games.find((x) => x.providerEventId === u.game);
      assert.equal(a.games[u.game], "recorded");
      assert.ok(!g.players[u.side].some((r) => String(r.providerAthleteId) === u.id), `${d} ${u.name} is not on the board`);
      assert.ok(Number.isInteger(u.actual[0]) && u.actual[0] > 0, `${d} ${u.name} played`);
    }
  }
});

test("PR 1230 lane fields (optional): positions → a Position filter; listed unavailable players → reason rows; absent → 'not recorded'", async () => {
  const { NO_PROJECTION_LABEL, filterRows: filt } = await import("./projection-board-ops.mjs");
  const withFields = lane();
  for (const g of withFields.games) {
    for (const side of ["away", "home"]) g.players[side] = g.players[side].map((r, i) => ({ ...r, position: ["G", "F", "C", "F-C", null][i % 5] }));
    g.players.positionSource = { file: "nba/rosters/2026-10-20.json", sha256: "0".repeat(64) };
    g.players.unavailable = { away: [{ providerAthleteId: "8880001", name: "Listed Rookie", position: "G", state: "PROJECTION_UNAVAILABLE", reason: "INSUFFICIENT_HISTORY" }], home: [{ providerAthleteId: "8880002", name: "No Minutes", position: null, state: "PROJECTION_UNAVAILABLE", reason: "NO_EXPECTED_MINUTES" }] };
  }
  const html = render({ lane: withFields });
  assert.match(html, /<label[^>]*for="[^"]+"[^>]*>Position</);
  assert.equal((html.match(/<select /g) ?? []).length, 4, "Matchup, Team, Position, Stat");
  assert.match(visibleText(html), /Every rostered player without a projection is listed as “Projection unavailable” with the reason the Official Forecast recorded\./);
  assert.match(visibleText(html), new RegExp(`· ${withFields.games.length * 2} without a projection`));
  assert.doesNotMatch(html, /positionSource|nba\/rosters/, "the roster source is not rendered");
  // Wire: positions parallel to the rows; listed players with code + position, no numbers before a final.
  const rows = boardRows(withFields, PROJECTION_BOARD_STATS);
  const packed = JSON.parse(JSON.stringify(packBoard(rows, null, null, [{ name: "Listed Rookie", game: G0.providerEventId, team: G0.away.abbr, teamName: G0.away.name, code: "INSUFFICIENT_HISTORY", pos: "G", actual: null }])));
  assert.equal(packed.p.length, packed.r.length);
  assert.deepEqual(packed.u, [["Listed Rookie", packed.t.findIndex((t) => t[0] === G0.away.abbr && t[2] === G0.providerEventId), "INSUFFICIENT_HISTORY", "G"]], "no numbers travel for a listed player");
  const back = unpackBoard(packed);
  const listed = back.find((r) => r.np);
  assert.deepEqual(listed.v, Array(PROJECTION_BOARD_STATS.length).fill(null));
  assert.equal(listed.pos, "G");
  assert.ok(filt(back, { position: "C" }).every((r) => String(r.pos).split("-").includes("C")) && filt(back, { position: "C" }).some((r) => r.pos === "F-C"), "F-C counts as a center and a forward");
  const { NO_PROJECTION_SHORT } = await import("./projection-board-ops.mjs");
  assert.deepEqual(Object.keys(NO_PROJECTION_SHORT), Object.keys(NO_PROJECTION_LABEL), "a short row label for every reason");
  for (const [k, l] of [...Object.entries(NO_PROJECTION_LABEL), ...Object.entries(NO_PROJECTION_SHORT)]) {
    assert.doesNotMatch(l, /injur/i, "a reason is never called an injury");
    if (k !== "RULED_OUT") assert.doesNotMatch(l, /\bout\b/i, `${k}: only the lane's own RULED_OUT code reads 'out'`);
  }
  // Without the fields (10-20 … 10-23): no Position filter, the list is 'not recorded', never 'none'.
  const plain = render({ lane: lane() });
  assert.equal((plain.match(/<select /g) ?? []).length, 3);
  assert.match(visibleText(plain), /Coverage list not recorded for this slate\./);
  assert.doesNotMatch(visibleText(plain), /without a projection/);
});

test("weight: the static HTML carries the first SSR_ROWS rows in the default order, says so, and a small slate is complete", async () => {
  const { SSR_ROWS } = await import("../../../components/nba/projection-board.tsx");
  assert.equal(SSR_ROWS, 100);
  const big = JSON.parse(fs.readFileSync(path.join(DIR, "2026-10-21.json"), "utf8"));
  const all = sortRows(boardRows(big, PROJECTION_BOARD_STATS));
  assert.ok(all.length > SSR_ROWS, `${all.length} rows on the 10-21 slate`);
  const html = render({ lane: big });
  const trs = cellsOf(html);
  assert.equal(trs.length, SSR_ROWS);
  assert.deepEqual(trs.map((c) => c[0]), all.slice(0, SSR_ROWS).map((r) => `${r.name}${r.injury ? ` · ${r.injury}` : ""}`), "the top of the default (expected-minutes) order");
  assert.match(visibleText(html), new RegExp(`Showing the first ${SSR_ROWS} of ${all.length} players; the full board loads in your browser\\.`));
  assert.equal(JSON.parse(JSON.stringify(packBoard(all))).r.length, all.length, "the island still receives every row");
  const small = render({ lane: lane() });
  assert.equal(cellsOf(small).length, boardRows(PUB, PROJECTION_BOARD_STATS).length);
  assert.doesNotMatch(small, /Showing the first/);
  assert.doesNotMatch(html, /class="sr-only">, /, "no per-row hidden position text (weight; the Position filter carries it)");
});
