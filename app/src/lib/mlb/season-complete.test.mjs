/**
 * MLB off-season state (2026-10-29). The champion, the series score, the final game and the record are RECOMPUTED here
 * from the committed files — the StatsAPI schedule captures, the graded game record and the lifetime summary — under
 * the committed 2026-10-29 season-state verdict. Nothing is asserted that the data does not produce.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { deriveMlbSeasonComplete, isMlbSeasonComplete, mlbSeasonCompleteCopy, SERIES_WINS_TO_CLINCH } from "./season-complete.mjs";
import { askStarterGroups, ASK_STARTER_GROUPS, ASK_OFFERED_QUESTIONS, ASK_MLB_OFF_SEASON_STARTER } from "../ask/prompts.mjs";

globalThis.React = React;

const APP = process.cwd();
const MLB = path.join(APP, "public", "data", "mlb");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/* The season-state the products job committed on 2026-10-29 (public/data/mlb/season-state.json at 75310b8585). Pinned
   inline so the test does not change meaning when the job rewrites that file each morning. */
const STATE_2026_10_29 = Object.freeze({
  date: "2026-10-29", state: "OFF_SEASON", season: "2026", gamesToday: 0, remaining: 0, nextGameDate: null,
  reason: "the 2026 season is over — StatsAPI lists no game left to play on or after 2026-10-29",
  calendar: { regularSeasonStartDate: "2026-03-25", regularSeasonEndDate: "2026-09-27", postSeasonStartDate: "2026-09-28", postSeasonEndDate: "2026-10-31" },
});

function committedInputs(seasonState = STATE_2026_10_29) {
  const dir = path.join(MLB, "statsapi-schedule");
  const scheduleDays = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => ({ date: f.slice(0, 10), games: read(path.join(dir, f)).games ?? [] }));
  const gradedRows = fs.readFileSync(path.join(MLB, "results", "game-predictions-graded.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const record = read(path.join(MLB, "results", "lifetime_summary.json"));
  return { seasonState, scheduleDays, gradedRows, record };
}

test("🔴 recomputed from committed finals: the last postseason series is MIL over TB, 4–1, clinched 2026-10-28", () => {
  const s = deriveMlbSeasonComplete(committedInputs());
  assert.ok(s, "the committed verdict is a completed season");
  assert.equal(s.unverifiedReason, null);
  assert.deepEqual(s.champion, { abbr: "MIL", name: "Milwaukee Brewers" });
  assert.deepEqual(s.runnerUp, { abbr: "TB", name: "Tampa Bay Rays" });
  assert.equal(s.wins, 4);
  assert.equal(s.losses, 1);
  assert.equal(s.finalDate, "2026-10-28");
  assert.deepEqual(s.games.map((g) => [g.date, g.gamePk, `${g.away} ${g.awayRuns}`, `${g.home} ${g.homeRuns}`, g.winner]), [
    ["2026-10-23", 849805, "TB 2", "MIL 3", "MIL"],
    ["2026-10-24", 849802, "TB 4", "MIL 5", "MIL"],
    ["2026-10-26", 849804, "MIL 10", "TB 1", "MIL"],
    ["2026-10-27", 849803, "MIL 3", "TB 4", "TB"],
    ["2026-10-28", 849799, "MIL 4", "TB 1", "MIL"],
  ]);
  /* Independent recount from the raw graded rows, so the derivation cannot agree with itself by construction. */
  const raw = committedInputs().gradedRows.filter((r) => s.games.some((g) => g.gamePk === r.gamePk));
  const byPk = new Map(raw.map((r) => [r.gamePk, r]));
  let mil = 0, tb = 0;
  for (const g of s.games) { const a = byPk.get(g.gamePk).actual; const [aw, hm] = byPk.get(g.gamePk).matchup.split(" @ "); const w = a.awayRuns > a.homeRuns ? aw : hm; if (w === "MIL") mil++; else if (w === "TB") tb++; }
  assert.deepEqual([mil, tb], [s.wins, s.losses]);
  assert.equal(s.returnsLabel, "MLB returns in 2027.", "no committed source names a 2027 date, so only the year is said");
});

test("the copy: headline, final game, record from the /results/mlb headline source, returns line", () => {
  const inputs = committedInputs();
  const c = mlbSeasonCompleteCopy(deriveMlbSeasonComplete(inputs));
  assert.equal(c.headline, "2026 season complete — Milwaukee Brewers won the World Series 4–1");
  assert.equal(c.finalLine, "Final game, Oct 28: MIL 4, TB 1.");
  const r = inputs.record;
  assert.equal(c.recordLine, `Graded record, May 16 – Oct 28: player-prop leans went ${r.wins.toLocaleString("en-US")}–${r.losses.toLocaleString("en-US")} (${((r.wins / r.decisive) * 100).toFixed(1)}% hit rate) over ${r.totalDates} slates.`);
  assert.equal(c.short, "The 2026 MLB season is complete — it returns in 2027.");
  assert.equal(c.pill, "Season complete");
  assert.doesNotMatch(Object.values(c).join(" "), /\b(live today|upcoming|arriving soon|accuracy|edge|lock)\b/i);
});

test("the committed season-state file, while it still speaks for 2026, gives the same verdict", (t) => {
  const doc = read(path.join(MLB, "season-state.json"));
  if (doc.season !== "2026" || !isMlbSeasonComplete(doc)) return t.skip(`committed season-state is now ${doc.season} ${doc.state}`);
  const s = deriveMlbSeasonComplete(committedInputs(doc));
  assert.equal(s.champion?.abbr, "MIL");
  assert.equal(`${s.wins}–${s.losses}`, "4–1");
});

test("🔴 in season, pre-season and unknown are never 'complete' (the in-season pages are unchanged)", () => {
  const base = { ...STATE_2026_10_29 };
  for (const st of [
    { ...base, state: "REGULAR_SEASON", remaining: null },
    { ...base, state: "POSTSEASON", remaining: 2, date: "2026-10-27" },
    { ...base, state: "UNKNOWN", remaining: null },
    /* Before next season's opener: OFF_SEASON with remaining null — not "the season is complete". */
    { ...base, state: "OFF_SEASON", remaining: null, date: "2026-03-01" },
    null,
  ]) {
    assert.equal(isMlbSeasonComplete(st), false, JSON.stringify(st?.state));
    assert.equal(deriveMlbSeasonComplete({ seasonState: st, scheduleDays: [], gradedRows: [] }), null);
    assert.equal(mlbSeasonCompleteCopy(deriveMlbSeasonComplete({ seasonState: st })), null);
  }
});

/* ── synthetic series: the champion line appears only when the finals verify it ── */
const day = (date, pk, away, home) => ({ date, games: [{ gamePk: pk, away: { name: `${away} club` }, home: { name: `${home} club` } }] });
const row = (date, pk, away, home, a, h) => ({ gamePk: pk, date, matchup: `${away} @ ${home}`, actual: { awayRuns: a, homeRuns: h } });
const STATE = { ...STATE_2026_10_29 };

test("🔴 a series game with no graded final → '2026 season complete' with no champion", () => {
  const s = deriveMlbSeasonComplete({
    seasonState: STATE,
    scheduleDays: [day("2026-10-20", 1, "AAA", "BBB"), day("2026-10-21", 2, "AAA", "BBB"), day("2026-10-22", 3, "BBB", "AAA"), day("2026-10-23", 4, "BBB", "AAA"), day("2026-10-24", 5, "BBB", "AAA")],
    gradedRows: [row("2026-10-20", 1, "AAA", "BBB", 1, 2), row("2026-10-21", 2, "AAA", "BBB", 1, 2), row("2026-10-23", 4, "BBB", "AAA", 2, 1), row("2026-10-24", 5, "BBB", "AAA", 3, 1)],
  });
  assert.equal(s.champion, null);
  assert.match(s.unverifiedReason, /no graded final/);
  assert.equal(mlbSeasonCompleteCopy(s).headline, "2026 season complete");
  assert.equal(mlbSeasonCompleteCopy(s).finalLine, null);
});

test("🔴 no team at four wins (3–3 in the committed finals) → no champion", () => {
  const games = [[1, "B"], [2, "B"], [3, "A"], [4, "A"], [5, "B"], [6, "A"]];
  const s = deriveMlbSeasonComplete({
    seasonState: STATE,
    gradedRows: games.map(([pk, w]) => row(`2026-10-2${pk}`, pk, "AAA", "BBB", w === "A" ? 5 : 1, w === "B" ? 5 : 1)),
  });
  assert.equal(s.champion, null);
  assert.match(s.unverifiedReason, new RegExp(`reached ${SERIES_WINS_TO_CLINCH} wins`));
});

test("conflicting finals for one game → no champion; earlier rounds between other teams are not counted", () => {
  const conflict = deriveMlbSeasonComplete({
    seasonState: STATE,
    gradedRows: [row("2026-10-20", 1, "AAA", "BBB", 1, 2), row("2026-10-20", 1, "AAA", "BBB", 2, 1)],
  });
  assert.equal(conflict.champion, null);
  assert.match(conflict.unverifiedReason, /conflicting/);
  const s = deriveMlbSeasonComplete({
    seasonState: STATE,
    gradedRows: [
      row("2026-10-10", 9, "AAA", "CCC", 9, 0), row("2026-10-11", 10, "AAA", "CCC", 9, 0), // an earlier round — not the final series
      ...[1, 2, 3, 4].map((i) => row(`2026-10-2${i}`, i, "AAA", "BBB", 0, 1)),
    ],
  });
  assert.equal(s.champion.abbr, "BBB");
  assert.equal(`${s.wins}–${s.losses}`, "4–0");
});

test("a committed next-season date is said; otherwise only the year", () => {
  const withDate = deriveMlbSeasonComplete({ seasonState: { ...STATE, nextGameDate: "2027-03-25" } });
  assert.equal(withDate.returnsLabel, "MLB returns on 2027-03-25.");
  assert.equal(deriveMlbSeasonComplete({ seasonState: STATE }).returnsLabel, "MLB returns in 2027.");
});

/* ── surfaces ── */

test("🔴 the shared panel prints the derived headline, the record link and no in-season words", async () => {
  const { default: Panel } = await import("../../components/mlb/mlb-season-complete-panel.tsx");
  const copy = mlbSeasonCompleteCopy(deriveMlbSeasonComplete(committedInputs()));
  const html = renderToStaticMarkup(React.createElement(Panel, { copy }));
  assert.match(html, /2026 season complete — Milwaukee Brewers won the World Series 4–1/);
  assert.match(html, /Season complete/);
  assert.match(html, /MLB returns in 2027\./);
  assert.match(html, /href="\/results\/mlb"/);
  assert.doesNotMatch(html, /Live today|Upcoming|arriving soon|next game day/i);
});

test("🔴 /live: off-season takes MLB out of the coverage line; in season it is unchanged", async () => {
  const { liveCoverageLine } = await import("../../components/live/live-sport-tabs.tsx");
  const note = "The 2026 MLB season is complete — it returns in 2027.";
  const untracked = "NBA, Premier League and UFC are not tracked live yet — their schedules and forecasts are on each sport's hub.";
  assert.equal(liveCoverageLine(["NFL", "MLB"]), `Live tracking: NFL and MLB. ${untracked}`, "in season: byte-identical to before");
  assert.equal(liveCoverageLine(["NFL", "MLB"], note), `Live tracking: NFL. ${note} ${untracked}`);
  assert.equal(liveCoverageLine(["MLB"], note), `Live tracking is turned off right now. ${note} ${untracked}`);
});

test("🔴 Ask: off-season withdraws the MLB-live starter; in season the list is the same object", () => {
  assert.equal(askStarterGroups(), ASK_STARTER_GROUPS);
  assert.equal(askStarterGroups({ mlbOffSeason: false }), ASK_STARTER_GROUPS);
  const off = askStarterGroups({ mlbOffSeason: true }).flatMap((g) => g.prompts);
  assert.ok(!off.some((p) => /live right now/i.test(p)), "no live-MLB promise in the off-season");
  assert.ok(off.includes(ASK_MLB_OFF_SEASON_STARTER));
  assert.ok(off.every((p) => ASK_OFFERED_QUESTIONS.includes(p)), "every offered starter stays inside the guard list");
  const golden = fs.readFileSync(path.join(APP, "scripts", "ask", "golden.mjs"), "utf8");
  assert.match(golden, new RegExp(`q: "${ASK_MLB_OFF_SEASON_STARTER}", expectTools: \\["runGameFinder"\\], expectGrounded: true`), "the replacement is a grounded golden question");
});

test("🔴 wiring: every listed surface reads the one season-complete owner and gates its in-season words on it", () => {
  const src = (p) => fs.readFileSync(path.join(APP, p), "utf8");
  const hub = src("src/app/mlb/page.tsx");
  assert.match(hub, /const offSeasonEmpty = !!seasonCopy && !\(board\.propsAvailable && board\.summary\.leans > 0\)/, "a published board always wins");
  assert.match(hub, /\{offSeasonEmpty \? null : <div className="mb-4">\s*<SlateLivenessBanner/, "no 'No MLB games today · Most recent slate … (today)'");
  assert.match(hub, /\{offSeasonEmpty \? null : \(\s*<div className="mt-4 flex items-center justify-end gap-2">[\s\S]*?\{freshnessSlot\}/, "no 'Live today' freshness pill");
  assert.match(hub, /statusKind=\{offSeasonEmpty \? "settled" : statusKind\}\s*statusLabel=\{offSeasonEmpty && seasonCopy \? seasonCopy\.pill : undefined\}/, "no 'Upcoming' hero pill");
  assert.match(hub, /seasonCopy \? \(\s*<p[^>]*>\{seasonCopy\.short\}<\/p>\s*\) : \(\s*<UpcomingSlateStrip/, "no 'Upcoming · next 7 days' strip");
  const board = src("src/components/mlb/mlb-board-body.tsx");
  assert.match(board, /\{liveness && !offSeason \?/);
  assert.match(board, /if \(offSeason\) return settledDates\.has\(d\);/, "the date picker lists only played slates — no 'Tomorrow · Upcoming'");
  assert.match(board, /offSeason && seasonCopy \? \(\s*<MlbSeasonCompletePanel/, "no 'Lines pending · projections arriving soon'");
  const hn = src("src/app/homer-nukes/page.tsx");
  assert.match(hn, /const offSeason = !board && !!seasonComplete/);
  assert.match(hn, /offSeason && seasonCopy \? <MlbSeasonCompletePanel/);
  const live = src("src/app/live/page.tsx");
  assert.match(live, /mlbOffSeason=\{MLB_SEASON_COPY\?\.short \?\? null\}/);
  assert.match(live, /const LIVE_SPORTS = MLB_SEASON_COPY \? "NFL" : "NFL and MLB";/);
  assert.match(src("src/app/ask/page.tsx"), /askStarterGroups\(\{ mlbOffSeason: mlbSeasonCompleteCopyFor\(\) != null \}\)/);
  assert.match(src("src/lib/sport-hub/adapters.ts"), /emptyReason: seasonCopy\.short/, "the hub's empty state, not 'generated each morning'");
});
