/**
 * FIRST SCREEN OF `/` AND `/today` (W4 · 2026-10-28). The founder's directive: "Do not mistake having more information
 * on the screen for providing a better experience." A first-time visitor must see what the site is, today's games with
 * their official forecasts, and where accuracy and picks live — without operator text.
 *
 *   pure     the hero renders ONE primary action (today's forecasts → /today) and at most one secondary; one status line
 *   source   Home prints the record summary ONCE; neither page's reading path carries operator strings
 *   built    the same on the export (assert-when-built: CI's post-build phase reads out/index.html, out/today/index.html)
 *
 * Run: npx tsx --test src/lib/uiux/home-today-first-screen.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const text = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, "'").replace(/\s+/g, " ");
/** Code with comments removed — the pages explain removed strings in comments, which are not rendered. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const { default: LandingHero, HERO_PRIMARY } = await import("../../components/home/landing-hero.tsx");

/** Operator language a first-time visitor cannot use: ladder internals, raw schedule counts, build/pipeline nouns. */
export const OPERATOR_STRINGS = [
  /Lane [AB] awaiting/i, /awaiting Step \d/i, /\b(?:NFL|NBA|MLB|UFC|Premier League): \d+ upcoming\b/, /no qualified product card/i,
  /\b\d+ simulation-ready\b/i, /MLB StatsAPI/i, /capability registry/i, /scaffold only/i,
];
/** The page's <main>, every <details> fold removed (innermost first, so nested folds go with their parent). */
const mainOf = (html) => html.slice(html.indexOf('id="main-content"'), html.lastIndexOf("</main>") > 0 ? html.lastIndexOf("</main>") : undefined);
const unfolded = (html) => {
  let h = html, prev;
  do { prev = h; h = h.replace(/<details\b(?:(?!<details\b)[\s\S])*?<\/details>/g, " "); } while (h !== prev);
  return h;
};

const hero = (props = {}) => renderToStaticMarkup(React.createElement(LandingHero, { readyCount: 3, activeSports: 5, eventsToday: 13, eventsKnown: true, latestResultsDate: "2026-10-26", ...props }));

test("hero · ONE primary action — today's forecasts on /today — and at most one secondary", () => {
  assert.deepEqual({ ...HERO_PRIMARY }, { label: "See today’s forecasts", href: "/today" });
  const h = hero();
  const buttons = [...h.matchAll(/<a [^>]*class="vault-press inline-flex[^"]*rounded-full[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.ok(buttons.length >= 1 && buttons.length <= 2, `one primary + at most one secondary (found ${buttons.length})`);
  assert.match(buttons[0][0], /href="\/today"/, "the first (primary) button opens /today");
  assert.match(text(buttons[0][1]), /See today.s forecasts/, "…and says so");
  assert.match(buttons[0][0], /background:var\(--vault-gold-bright\)/, "…and is the one filled button");
  for (const b of buttons.slice(1)) assert.doesNotMatch(b[0], /vault-gold-bright/, "a secondary action is never styled as a second primary");
  assert.doesNotMatch(h, /href="\/markets"|Open Parlay Center|See Today.s Picks/i, "no priced-picks or parlay button in the hero");
});

test("hero · one status line: the day's size and the results link — no micro-fact row", () => {
  const t = text(hero());
  assert.match(t, /13 events today · 5 sports active · Latest results Oct 26 →/);
  for (const re of OPERATOR_STRINGS) assert.doesNotMatch(t, re, `hero must not say ${re}`);
  assert.doesNotMatch(t, /top model picks|active product card/i, "the five-fact row is gone");
  // With nothing simulation-ready the secondary action does not promise today's simulations.
  assert.doesNotMatch(text(hero({ readyCount: 0 })), /Simulate Today.s Games/);
});

test("home · the record summary appears ONCE, from the shared current-era reader", () => {
  const page = code(read("src/app/page.tsx"));
  assert.equal((page.match(/<RecentResultsStrip\b/g) ?? []).length, 1, "one Recent results band");
  assert.doesNotMatch(page, /<YesterdayCard\b/, "the Suggested Parlays recap is not a second results summary on Home");
  assert.equal((page.match(/\{recordLabel\}|recordLabel\s*\?/g) ?? []).length, 1, "the record label is printed by exactly one element");
  assert.match(page, /currentProductRecord\("bank-builder"\)/, "…read through the shared reader (lib/results/current-record.ts)");
  assert.doesNotMatch(page, /label: "Results",\s+blurb/, "no Results flagship card repeating the record");
});

test("home · no operator strings in the page's own copy; lane chips said as one plain line", async () => {
  const page = code(read("src/app/page.tsx"));
  for (const banned of ["<UpcomingSportsStrip", "<HomeTodayMlb", "bbStepPhrase", "awaitingRung", "The model's strongest reads"]) {
    assert.ok(!page.includes(banned), `Home must not mount/print ${banned}`);
  }
  assert.match(page, /title="Highest-probability calls today"/, "the ranked panel is named for what it is");
  assert.match(page, /\.filter\(\(r\) => r\.probability > HOME_CALL_MIN\)/, "…and shows only calls rated more likely than not");
  assert.match(page, /withPlainStatus\(commandLanes\.filter/, "the lanes pass through the plain-status line");
  const { plainStatusLine, withPlainStatus } = await import("../../components/home/plain-lanes.ts");
  const st = (family, state) => ({ id: family, family, state, headline: "h", detail: "d", n: 1, source: "scorecard" });
  assert.equal(plainStatusLine([st("Game forecasts", "EXPERIMENTAL"), st("Player ranges", "PAUSED")]), "Model status — Game forecasts: not market-validated · Player ranges: paused");
  assert.equal(plainStatusLine([st("Forward test", "FORWARD_TEST")]), "Model status — Forward test running", "the family is not said twice");
  const [lane] = withPlainStatus([{ sport: "nfl", contextLine: "14 game forecasts", statuses: [st("Game forecasts", "TOO_EARLY")] }]);
  assert.deepEqual(lane.statuses, [], "no chip stack");
  assert.equal(lane.contextLine, "14 game forecasts. Model status — Game forecasts: too early to judge.", "the meaning survives in words");
  const [quiet] = withPlainStatus([{ sport: "nba", contextLine: "12 games today", statuses: [] }]);
  assert.equal(quiet.contextLine, "12 games today", "a lane with no statuses is untouched");
});

/* ── /today ──────────────────────────────────────────────────────────────────────────────────────────────────── */
const { default: TodayGames, groupTodayGames, forecastText } = await import("../../components/today/today-games.tsx");
const row = (o) => ({ date: "2026-10-28", startUtc: "2026-10-28T23:00:00Z", time: "7:00 PM ET", sport: "nba", sportLabel: "NBA", matchup: "MIA @ ATL", status: "Scheduled", forecast: "Pending", read: null, note: "The NBA Official Forecast is frozen on game day, before tip-off.", eventHref: "/nba/#nba-exp-1", resultHref: null, ...o });

test("/today · each game once, grouped started / upcoming / final, every row linking to its game page", () => {
  const rows = [
    row({ matchup: "A @ B", status: "Final", forecast: "Frozen", read: "B favoured · no win chance published", eventHref: "/nba/#nba-exp-2", resultHref: "/results/nba/" }),
    row({ matchup: "C @ D", status: "Started", sport: "mlb", sportLabel: "MLB", forecast: "Frozen", eventHref: "/games/mlb/c-d/" }),
    row({}),
    row({ matchup: "E @ F", sport: "nfl", sportLabel: "NFL", forecast: "Published", read: "F 63.8% to win", eventHref: "/nfl/game/9/" }),
    row({ matchup: "G @ H", sport: "mlb", sportLabel: "MLB", forecast: "Unavailable", note: "Official scheduled game (MLB StatsAPI). No board.", eventHref: "/games/mlb/g-h/" }),
  ];
  assert.deepEqual(groupTodayGames(rows).map((g) => [g.title, g.rows.length]), [["Started", 1], ["Upcoming", 3], ["Final today", 1]]);
  const h = renderToStaticMarkup(React.createElement(TodayGames, { rows, dayLabel: "Wednesday, October 28", asOf: "Oct 28, 12:20 AM ET" }));
  /* Outside a Next build, next/link drops the trailing slash ("/nba#x", "/games/mlb/g-h"); compare without it. */
  const norm = (u) => u.replace(/\/?\??(#|$)/, "$1");
  const hrefs = [...h.matchAll(/href="([^"]+)"/g)].map((m) => norm(m[1]));
  for (const r of rows) assert.equal(hrefs.filter((x) => x === norm(r.eventHref)).length, 1, `${r.matchup}: one link to its game page`);
  const t = text(h);
  assert.match(t, /F 63\.8% to win · official forecast, can update until the start/, "a published number is printed verbatim");
  assert.match(t, /Forecast pending · publishes on game day, before tip-off/, "pending says when it publishes");
  assert.match(t, /No official forecast for this game/, "an unavailable forecast says so — no number fills the space");
  for (const re of OPERATOR_STRINGS) assert.doesNotMatch(t, re, `today's games must not render ${re}`);
  assert.doesNotMatch(t, /\b0(\.0)?%/, "a missing value never renders as 0");
});

test("/today · a day without games says so and shows the next day's games; an unknown forecast state is printed as written", () => {
  const h = renderToStaticMarkup(React.createElement(TodayGames, { rows: [], dayLabel: "Monday, November 2", asOf: "Nov 2, 9:00 AM ET", next: { dayLabel: "Tuesday, November 3", rows: [row({ date: "2026-11-03" })] } }));
  assert.match(text(h), /No games are scheduled today\. Next up · Tuesday, November 3/);
  assert.equal(forecastText(row({ forecast: "Degraded" })), "Degraded", "a state this component does not know is shown as its owner wrote it, never re-labelled");
});

test("/today · the reading path: header → live → today's games → ranked reads, then folds; nothing above the folds repeats a section", () => {
  const page = code(read("src/app/today/page.tsx"));
  const firstFold = page.indexOf("<MoreDisclosure");
  const at = (tag) => { const i = page.indexOf(tag); assert.ok(i > 0, `${tag} is mounted`); return i; };
  assert.ok(at("<TodayDailySlateHeader") < at("<LiveNow") && at("<LiveNow") < at("<TodayGames") && at("<TodayGames") < at("<TopReadsFilter"), "order");
  assert.ok(at("<TopReadsFilter") < firstFold, "the ranked reads sit above the folds");
  const lead = page.slice(0, firstFold);
  for (const folded of ["<GamesTable", "<TodayGamePredictions", "<TodayFullSlate", "<BankBuilderStatus", "<NoPlayNotes", "<SuggestedParlaysPreview", "<YesterdayCard", "<TodayAtAGlance"]) {
    assert.ok(!lead.slice(lead.indexOf("return (")).includes(folded), `${folded} is folded, not in the reading path`);
  }
  assert.equal((page.match(/<ResultsReminder\b/g) ?? []).length, 1, "the track record appears once");
  for (const keep of ["paper-only, educational"]) assert.match(read("src/components/today/daily-slate-header.tsx"), new RegExp(keep), "the disclosure stays in the header");
});

/* ── BUILT: the export a visitor actually receives ─────────────────────────────────────────────────────────────── */
const OUT_HOME = path.join(APP, "out/index.html");
const OUT_TODAY = path.join(APP, "out/today/index.html");

test("BUILT · / — the primary action, one record summary, no operator strings", () => {
  if (!fs.existsSync(OUT_HOME)) return; // buildless lane: assert-when-built
  const main = mainOf(fs.readFileSync(OUT_HOME, "utf8"));
  assert.match(main, /<a [^>]*href="\/today\/?"[^>]*>See today(?:’|&#x27;|&rsquo;|')s forecasts →<\/a>/, "the hero's primary action opens /today (one text node)");
  const t = text(main);
  assert.equal((t.match(/Paper record · Bank Builder current era/gi) ?? []).length, 1, "the record summary appears once");
  for (const re of OPERATOR_STRINGS) assert.doesNotMatch(t, re, `/ must not render ${re}`);
});

test("BUILT · /today — the reading path (outside the folds) carries no operator strings", () => {
  if (!fs.existsSync(OUT_TODAY)) return; // buildless lane: assert-when-built
  const main = mainOf(fs.readFileSync(OUT_TODAY, "utf8"));
  const visible = text(unfolded(main));
  for (const re of OPERATOR_STRINGS) assert.doesNotMatch(visible, re, `/today's reading path must not render ${re}`);
  assert.match(main, /id="today-games"/, "today's games lead the page");
});
