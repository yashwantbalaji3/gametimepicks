/**
 * Founder mandate 2026-10-24 — a reader returns after the games to compare the predictions with the finals.
 *   1. The model suggestions record (Level A, unpriced): counts per policy/tier, pending and void never losses,
 *      every recorded entry present, no rate below the stated minimum.
 *   2. NBA Official Forecast vs final: the side frozen before tip against the committed final; pending and held
 *      labelled; sides compared by home/away, never by team code; every verdict equals the NBA settlement contract's.
 *   3. Both render with their honesty copy, counts not percentages below the minimum, and accessible tables.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { levelARecord, MIN_DECIDED_FOR_RATE } = await import("./level-a-record.mjs");
const { nbaForecastVsActual, NBA_WINNER_MIN_GRADED } = await import("./nba-forecast-vs-actual.mjs");
const { levelARecordView, nbaForecastVsActualView, LEVEL_A_DIR } = await import("./nba-level-a-readers.ts");
const { default: ModelSuggestionsRecord } = await import("../../components/results/model-suggestions-record.tsx");
const { default: NbaForecastVsActual } = await import("../../components/results/nba-forecast-vs-actual.tsx");

/* ── 1. Level A ─────────────────────────────────────────────────────────────────────────────────── */
const entry = (id, o = {}) => ({ schema: "gtp.level-a.suggestion@1", id, productDay: "2031-07-01", policy: "parlay-lab-suggest@1", tier: "high",
  recordedAt: "2031-07-01T12:00:00Z", firstStartUtc: "2031-07-01T23:00:00Z", jointProbability: 0.2,
  legs: [{ sport: "nba", eventId: `e-${id}`, eventLabel: "AAA @ BBB", startUtc: "2031-07-01T23:00:00Z", selection: { code: "home", label: "BBB to win" }, probability: null, forecast: { modelId: "m", stampedAt: "2031-07-01T11:00:00Z" } }],
  priced: false, price: null, payout: null, ...o });
const grade = (entryId, result, legs = []) => ({ schema: "gtp.level-a.grade@1", entryId, result, legs, priced: false, payout: null, gradedAt: "2031-07-02T05:17:00Z" });

test("🔴 Level A: pending and void are never losses; every entry counts, revisions included; no orphan grade is invented", () => {
  const v = levelARecord(
    [entry("a"), entry("b"), entry("c"), entry("d", { revisionOf: "c" }), entry("u", { policy: "untiered-pick@1", tier: "untiered", jointProbability: null })],
    [grade("a", "win", [{ sport: "nba", eventId: "e-a", result: "win", reason: "final 100-110: home, leg took home" }]), grade("b", "loss"), grade("c", "void"), grade("zz", "win")],
  );
  const high = v.byGroup.find((g) => g.tier === "high");
  assert.deepEqual([high.recorded, high.graded, high.won, high.lost, high.void, high.pending, high.decided], [4, 3, 1, 1, 1, 1, 2]);
  assert.equal(high.rateShown, false, `no rate below ${MIN_DECIDED_FOR_RATE} decided`);
  assert.deepEqual(v.totals, { recorded: 5, graded: 3, won: 1, lost: 1, void: 1, pending: 2 });
  assert.equal(v.orphanGrades, 1, "a grade for an entry not in the record is reported, never counted");
  const a = v.entries.find((e) => e.id === "a");
  assert.equal(a.legs[0].final, "final 100-110: home, leg took home", "each leg carries its official final as the grader wrote it");
  assert.equal(v.entries.find((e) => e.id === "d").status, "PENDING");
  assert.deepEqual(v.byGroup.map((g) => g.policy), ["parlay-lab-suggest@1", "untiered-pick@1"]);
});

test("🔴 Level A real data: every recorded suggestion is on /results, and every grade joins a recorded entry", () => {
  const read = (f) => (fs.existsSync(path.join(LEVEL_A_DIR, f)) ? fs.readFileSync(path.join(LEVEL_A_DIR, f), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
  const recorded = read("suggestions.jsonl");
  const v = levelARecordView();
  assert.equal(v.totals.recorded, recorded.length);
  assert.equal(v.entries.length, recorded.length);
  assert.equal(v.orphanGrades, 0);
  assert.equal(v.totals.graded + v.totals.pending, v.totals.recorded);
  assert.ok(recorded.filter((e) => e.productDay === "2026-10-23").length >= 15, "the 2026-10-23 entries (3 cards + 12 NBA sides) are in the record");
});

/* ── 2. NBA ─────────────────────────────────────────────────────────────────────────────────────── */
const lane = (date, generatedAt, games) => ({ date, generatedAt, games });
const g = (id, away, home, fav, o = {}) => ({ providerEventId: id, etDate: "2031-07-01", tipUtc: "2031-07-01T23:00Z", away: { abbr: away }, home: { abbr: home },
  frozenAt: "2031-07-01T12:00:00Z", elo: { state: "FAVOURED", favoured: fav }, ...o });
const fin = (id, ftAway, ftHome, homeTri, awayTri) => ({ providerEventId: id, ftAway, ftHome, winnerSide: ftHome > ftAway ? "home" : "away", home: { tricode: homeTri }, away: { tricode: awayTri } });

test("🔴 NBA: sides by home/away (WSH vs WAS), pending and held never misses, nothing compared without pre-tip evidence", () => {
  const finals = { finals: [fin("1", 116, 128, "WAS", "MIL"), fin("2", 100, 90, "NYK", "BOS"), fin("401901822", 98, 117, "PHX", "LAL"), fin("6", 80, 90, "GSW", "SAC")], conflicts: [] };
  const v = nbaForecastVsActual([lane("2031-07-01", "2031-07-01T14:00:00Z", [
    g("1", "MIL", "WSH", "WSH"), g("2", "BOS", "NY", "NY"), g("3", "AAA", "BBB", "BBB"), g("401901822", "LAL", "PHX", "PHX"),
    g("5", "CCC", "DDD", "DDD", { frozenAt: "2031-07-01T23:30:00Z" }), g("6", "SAC", "GS", "GS", { elo: { state: "TOO_CLOSE" } }),
  ])], finals);
  const by = Object.fromEntries(v.games.map((x) => [x.providerEventId, x.state]));
  assert.deepEqual(by, { 1: "MATCHED", 2: "MISSED", 3: "PENDING", 401901822: "HELD", 5: "NOT_BEFORE_TIP", 6: "NO_SIDE" });
  assert.equal(v.games.find((x) => x.providerEventId === "1").final.winner, "WSH", "the winner is named in the lane's own code");
  assert.deepEqual([v.counts.matched, v.counts.missed, v.counts.graded, v.counts.pending, v.counts.held], [1, 1, 2, 1, 1]);
  assert.equal(v.belowMinimum, true);
  assert.equal(NBA_WINNER_MIN_GRADED, 300, "V18 preregistration §6: 300 graded games for the winner market");
  const late = nbaForecastVsActual([lane("2031-07-01", "2031-07-02T00:00:00Z", [g("1", "MIL", "WSH", "WSH")])], finals);
  assert.equal(late.games[0].state, "NOT_BEFORE_TIP", "a lane file written after tip is no evidence of a pre-tip publication");
  const swapped = nbaForecastVsActual([lane("2031-07-01", "2031-07-01T14:00:00Z", [g("1", "WSH", "MIL", "WSH")])], finals);
  assert.equal(swapped.games[0].state, "HELD", "a final whose home/away teams are not the lane's is held, never scored");
  const disputed = nbaForecastVsActual([lane("2031-07-01", "2031-07-01T14:00:00Z", [g("2", "BOS", "NY", "NY")])], { ...finals, conflicts: [{ providerEventId: "2" }] });
  assert.equal(disputed.games[0].state, "HELD");
});

test("🔴 NBA team-code aliases: for all 30 teams, home and away, a lane code is never scored against the wrong team", async () => {
  const { ESPN_NBA_TEAMS } = await import("../sports/nba/roster-contract.mjs");
  const aliases = ESPN_NBA_TEAMS.filter((t) => t.canonicalTricode && t.canonicalTricode !== t.espnAbbr).map((t) => `${t.canonicalTricode}/${t.espnAbbr}`).sort();
  /* The aliases the finals record actually carries today must all be covered by the registry this test iterates. */
  for (const a of ["GSW/GS", "NOP/NO", "NYK/NY", "SAS/SA", "UTA/UTAH", "WAS/WSH"]) assert.ok(aliases.includes(a), `registry covers ${a}`);
  let cases = 0;
  for (const t of ESPN_NBA_TEAMS) {
    const opp = ESPN_NBA_TEAMS.find((o) => o.providerTeamId !== t.providerTeamId && o.canonicalTricode !== o.espnAbbr) ?? ESPN_NBA_TEAMS.find((o) => o.providerTeamId !== t.providerTeamId);
    for (const home of [true, false]) {
      const [h, a] = home ? [t, opp] : [opp, t];
      for (const homeWins of [true, false]) {
        for (const pick of [t, opp]) {
          const id = `alias-${t.providerTeamId}-${home}-${homeWins}-${pick.providerTeamId}`;
          const v = nbaForecastVsActual(
            [lane("2031-07-01", "2031-07-01T14:00:00Z", [g(id, a.espnAbbr, h.espnAbbr, pick.espnAbbr)])],
            { finals: [{ providerEventId: id, ftHome: homeWins ? 110 : 100, ftAway: homeWins ? 100 : 110, winnerSide: homeWins ? "home" : "away", home: { tricode: h.canonicalTricode }, away: { tricode: a.canonicalTricode } }], conflicts: [] },
          );
          const pickIsHome = pick.providerTeamId === h.providerTeamId;
          assert.equal(v.games[0].state, pickIsHome === homeWins ? "MATCHED" : "MISSED", `${a.espnAbbr} @ ${h.espnAbbr} (finals ${a.canonicalTricode} @ ${h.canonicalTricode}), pick ${pick.espnAbbr}, ${homeWins ? "home" : "away"} wins`);
          assert.equal(v.games[0].final.winner, homeWins ? h.espnAbbr : a.espnAbbr, "the winner is named in the lane's code");
          cases += 1;
        }
      }
    }
  }
  assert.equal(cases, 30 * 8);
});

test("🔴 NBA real data: every MATCHED / MISSED verdict equals the NBA settlement contract's grade of the same side", async () => {
  const { gradeNbaLabLeg } = await import("../parlays/nba-lab-grading.mjs");
  const { committedNbaPropResults } = await import("../sports/nba/prop-settlement-source.mjs");
  const resultFor = committedNbaPropResults({ repoRoot: path.resolve(process.cwd(), "..") });
  const v = nbaForecastVsActualView();
  let checked = 0;
  for (const x of v.games) {
    if (x.state !== "MATCHED" && x.state !== "MISSED") continue;
    const side = x.side === x.home ? "home" : "away";
    const r = gradeNbaLabLeg({ sport: "nba", eventId: x.providerEventId, market: "moneyline", side }, (id) => resultFor({ eventId: id }));
    assert.equal(r.result, x.state === "MATCHED" ? "win" : "loss", `${x.providerEventId} ${x.away}@${x.home}: ${r.reason}`);
    checked += 1;
  }
  assert.equal(checked, v.counts.graded);
  assert.ok(v.games.every((x) => x.providerEventId !== "401901822" || x.state === "HELD"), "401901822 stays on HOLD wherever it appears");
});

/* ── 3. Rendering ───────────────────────────────────────────────────────────────────────────────── */
test("🔴 the suggestions record says what it is, shows counts not rates, and labels pending and void", () => {
  const v = levelARecord([entry("a"), entry("b"), entry("c"), entry("s", { shownAt: "2031-07-01T12:05:00Z", servedFrom: "2031-07-01T12:10:00Z", source: { kind: "production-deployment", sha: "c948636e1a300b77e246ea466566e9c0238f19aa" },
    legs: [{ ...entry("s").legs[0] }, { sport: "ligue-1", eventId: "x", eventLabel: "Brest v Nice", startUtc: "2031-07-01T19:00:00Z", selection: { code: "home", label: "Brest to win" }, probability: 0.42 }] })],
    [grade("a", "win"), grade("b", "void"), grade("s", "loss", [{ sport: "nba", eventId: "e-s", result: "loss", reason: "final 1-2" }, { sport: "ligue-1", eventId: "x", result: "pending", reason: "no gradeable result — status missing (only FULL_TIME grades)" }])]);
  const h = renderToStaticMarkup(React.createElement(ModelSuggestionsRecord, { view: v }));
  assert.match(h, /live from [^·]+ · Production deployment c948636e1a/, "the recorder's source object in reader words");
  assert.doesNotMatch(h, /\[object Object\]|FULL_TIME/, "no object and no status code reaches the page (post-build guards)");
  assert.match(h, /Brest to win[\s\S]*?No official final yet/, "a pending leg says so instead of its grader code");
  assert.match(h, /Paper suggestions, no price, accuracy not yet established at this sample size\./);
  assert.match(h, /never mixed\s+with the priced products or sportsbook settlement/);
  assert.match(h, new RegExp(`no hit rate is shown for a suggestion type until it has ${MIN_DECIDED_FOR_RATE} decided`));
  assert.doesNotMatch(h.replace(/joint [\d.]+%/g, "").replace(/ · [\d.]+%<\/span>/g, "</span>"), /\d%/, "no percentage other than the joint and each leg's forecast probability as the Level A pages print them — never a hit rate");
  assert.match(h, /Void — not a loss/);
  assert.match(h, /Pending — not a loss/);
  assert.match(h, /joint 20\.0%/, "the joint as the Level A pages print it");
  assert.match(h, /<caption class="sr-only">/);
  assert.match(h, /no deployment stamp on this entry/, "publication evidence is stated, including its absence");
  assert.match(h, /As of this page&#x27;s last update: newest suggestion [^;]+; newest grade /, "the record is read at build and says so");
  assert.equal(v.asOf.gradedAt, "2031-07-02T05:17:00Z");
  assert.match(renderToStaticMarkup(React.createElement(ModelSuggestionsRecord, { view: levelARecord([], []) })), /No suggestion has been recorded yet\./);
});

test("🔴 NBA Official Forecast vs final: Model Performance as counts against the preregistered minimum, no percentage", () => {
  const v = nbaForecastVsActual([lane("2031-07-01", "2031-07-01T14:00:00Z", [g("1", "MIL", "WSH", "WSH"), g("3", "AAA", "BBB", "BBB"), g("401901822", "LAL", "PHX", "PHX")])],
    { finals: [fin("1", 116, 128, "WAS", "MIL"), fin("401901822", 98, 117, "PHX", "LAL")], conflicts: [] });
  const h = renderToStaticMarkup(React.createElement(NbaForecastVsActual, { view: v }));
  assert.match(h, /Model Performance:<\/strong> the official side won 1 and lost 0 of 1 decided game · 1 pending · 1 held\./);
  assert.match(h, /preregistered minimum before any judgment of the winner side is 300 graded games, and this is 1/);
  assert.doesNotMatch(h, /\d%/);
  assert.match(h, /data-state="HELD"[\s\S]*?Held — final under review/);
  assert.match(h, /Pending — no official final yet/);
  assert.match(h, /<th scope="row"/);
});

test("🔴 the pages carry both records", async () => {
  const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  const results = src("src/app/results/page.tsx");
  assert.ok(results.indexOf("<ResultsOverview") < results.indexOf("<ModelSuggestionsRecord") && results.indexOf("<ModelSuggestionsRecord") < results.indexOf("<ResultsExplorer"));
  const nba = src("src/app/results/nba/page.tsx");
  assert.equal((nba.match(/<NbaForecastVsActual view=\{nbaForecastVsActualView\(\)\} \/>/g) ?? []).length, 2, "both the archive and the empty-archive branch show it");
  /* One <h1> per rendered branch, above the new section: its <h2> must not precede the page's heading. */
  assert.equal((nba.match(/<h1 className/g) ?? []).length, 2);
  for (const branch of nba.split("<NbaForecastVsActual view=").slice(0, 2)) assert.match(branch.slice(-400), /<h1[^>]*>NBA results<\/h1>\s*$/);
  const { POLICY_LABEL } = await import("./level-a-record.mjs");
  assert.ok(Object.values(POLICY_LABEL).every((l) => !/Parlay Lab|Picks Lab|Build-a-Pick/.test(l)), "no retired destination name (public-vocabulary.test)");
});

test("🔴 page weight: /results/nba lists the newest 7 days game by game; every older day is one line linking to its own day page", () => {
  const days = Array.from({ length: 10 }, (_, i) => `2031-07-${String(1 + i).padStart(2, "0")}`);
  const v = nbaForecastVsActual(days.map((d) => lane(d, `${d}T14:00:00Z`, [g(`${d}-1`, "MIL", "WSH", "WSH", { etDate: d, tipUtc: `${d}T23:00Z`, frozenAt: `${d}T12:00:00Z` })])),
    { finals: days.map((d) => fin(`${d}-1`, 116, 128, "WAS", "MIL")), conflicts: [] });
  const h = renderToStaticMarkup(React.createElement(NbaForecastVsActual, { view: v }));
  assert.equal((h.match(/data-nba-day=/g) ?? []).length, 7);
  assert.equal((h.match(/data-game=/g) ?? []).length, 7, "only listed days carry game rows");
  assert.match(h, /The newest 7 of 10 days are listed game by game; every game is in the counts above/);
  for (const d of ["2031-07-01", "2031-07-02", "2031-07-03"]) assert.match(h, new RegExp(`href="/results/date/${d}/#official-forecast"`));
  assert.match(h, /won 10 and lost 0 of 10 decided/, "the counts still cover every day");
  const day = renderToStaticMarkup(React.createElement(NbaForecastVsActual, { view: v, date: "2031-07-02" }));
  assert.deepEqual([...day.matchAll(/data-nba-day="([^"]+)"/g)].map((m) => m[1]), ["2031-07-02"], "a day page lists only its own day");
  assert.match(day, /NBA · Official Forecast vs final/);
  assert.match(day, /Model Performance · season to date:/);
  assert.doesNotMatch(day, /data-nba-older-days/);
});

test("🔴 every NBA lane day has a statically generated day page carrying its games", async () => {
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/results/date/[date]/page.tsx"), "utf8");
  assert.match(page, /\.\.\.nbaOfficialForecastDates\(\)[^\n]*\]\)\)\.sort\(\)/, "generateStaticParams enumerates the lane days");
  assert.match(page, /dayDates = new Set\(\[[^\n]*\.\.\.nbaOfficialForecastDates\(\)[^\n]*\]\)/, "the 404 gate accepts a lane day");
  assert.match(page, /<NbaForecastVsActual view=\{nbaForecastVsActualView\(\)\} date=\{date\} \/>/);
  const { nbaOfficialForecastDates } = await import("./nba-level-a-readers.ts");
  const dates = nbaOfficialForecastDates();
  assert.ok(dates.length >= 4 && dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
});

/* Release owner 2026-10-26: a Level A card withdrawn before its start says so beside the card — a note from the
   recorder's own withdrawn.jsonl, never a re-grade. The card was shown, so every count and denominator is unchanged. */
const wd = (id, event, o = {}) => ({ schema: "gtp.level-a.withdrawal@1", id, event, servedFrom: "2031-07-01T20:45:13Z",
  ...(event === "withdrawn" ? { lastServedFrom: "2031-07-01T20:45:13Z", firstNotServedFrom: "2031-07-01T20:51:41Z", reason: "nba:e-a is no longer in the served model" } : { reinstatedFrom: "2031-07-01T21:30:00Z" }), ...o });

test("🔴 withdrawn: the LATEST event per entry decides; a reinstatement cancels; counts and grades never move", async () => {
  const recs = [entry("a"), entry("b"), entry("c")];
  const grades = [grade("a", "loss"), grade("b", "win")];
  const { withWithdrawals } = await import("./level-a-withdrawals.mjs");
  const plain = levelARecord(recs, grades);
  const v = withWithdrawals(plain, [wd("a", "withdrawn"), wd("b", "withdrawn"), wd("b", "reinstated"), wd("zz", "withdrawn")]);
  assert.deepEqual(v.byGroup, plain.byGroup, "withdrawal is a note: every count and denominator unchanged");
  assert.deepEqual(v.totals, plain.totals);
  const by = Object.fromEntries(v.entries.map((e) => [e.id, e]));
  assert.deepEqual(by.a.withdrawn, { servedFrom: "2031-07-01T20:45:13Z", until: "2031-07-01T20:51:41Z", reason: "nba:e-a is no longer in the served model" });
  assert.equal(by.a.status, "LOST", "still graded as recorded");
  assert.equal(by.b.withdrawn, null, "reinstated later: no note");
  assert.equal(by.c.withdrawn, null);
  assert.equal(v.orphanWithdrawals, 1, "an event for an unrecorded id is reported, never attached");
  const h = renderToStaticMarkup(React.createElement(ModelSuggestionsRecord, { view: v }));
  assert.match(h, /data-withdrawn="a"[^>]*>Withdrawn before start \(served 4:45–4:51 PM ET\) · still graded as shown/);
  assert.equal((h.match(/data-withdrawn=/g) ?? []).length, 1);
});

test("🔴 withdrawn, real data: exactly the 2026-10-26 mixed-sport cards the recorder withdrew carry the note", () => {
  const read = (f) => (fs.existsSync(path.join(LEVEL_A_DIR, f)) ? fs.readFileSync(path.join(LEVEL_A_DIR, f), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
  const events = read("withdrawn.jsonl");
  const v = levelARecordView();
  assert.equal(v.orphanWithdrawals, 0, "every withdrawal names a recorded entry");
  const latest = new Map(); for (const e of events) latest.set(e.id, e.event);
  const expected = [...latest].filter(([, ev]) => ev === "withdrawn").map(([id]) => id).sort();
  assert.deepEqual(v.entries.filter((e) => e.withdrawn).map((e) => e.id).sort(), expected);
  const mixed1026 = v.entries.filter((e) => e.productDay === "2026-10-26" && e.policy.startsWith("level-a-mixed@1/"));
  assert.ok(mixed1026.length >= 5 && mixed1026.every((e) => e.withdrawn), "the five level-a-mixed@1 cards of 10-26");
  const h = renderToStaticMarkup(React.createElement(ModelSuggestionsRecord, { view: v }));
  for (const e of mixed1026) assert.match(h, new RegExp(`data-withdrawn="${e.id}"[^>]*>Withdrawn before start \\(served 4:45–4:51 PM ET\\)`));
  const plain = levelARecord(read("suggestions.jsonl"), read("graded.jsonl"));
  assert.deepEqual(v.byGroup, plain.byGroup, "real counts identical with and without the withdrawal file");
  assert.deepEqual(v.totals, plain.totals);
});
