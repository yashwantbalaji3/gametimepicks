/**
 * THE NFL WEEK REPORT A READER SEES MATCHES THE GRADED ARTIFACT (P296).
 *
 * Reads the BUILT export (out/results/nfl/index.html and out/results/index.html), never the source: a
 * success rate is a public claim about our own record, and the claim is the rendered text. Visible text
 * only — scripts (including the RSC payload) are stripped first, so a number that exists only inside the
 * flight data cannot satisfy a check about what the page shows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPORT_HTML = path.join(APP, "out/results/nfl/index.html");
const HUB_HTML = path.join(APP, "out/results/index.html");
const DATA = path.join(APP, "public/data/nfl/reconciliation");

const pct = (r) => (r == null ? "—" : `${(r * 100).toFixed(1)}%`);
/* React separates adjacent text nodes with empty comments ("Week 1<!-- -->: <!-- -->81.0%"). They render
   as nothing, so they are removed as nothing — replacing them with a space, like a tag, made the guard read
   "Week 1 : 81.0%" and "118 / 133" and fail a page that was correct. */
const visibleText = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&#x27;|&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ");

const index = fs.existsSync(path.join(DATA, "index.json")) ? JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8")) : null;
/* The page reports the newest GRADED week (week-report-data.ts isGradedWeek); an opened, ungraded week is not a report. */
const newest = (index?.weeks ?? []).filter((w) => (w.overall?.checks ?? 0) > 0 && (w.gamesFinal ?? 0) > 0).at(-1) ?? null;
const report = newest ? JSON.parse(fs.readFileSync(path.join(DATA, `${newest.key}.json`), "utf8")) : null;

test("a reconciled week exists, so the checks below are not vacuous", () => {
  assert.ok(report, "no NFL week reconciliation on disk");
  assert.ok(report.summary.overall.checks > 0, "the newest week graded nothing");
  assert.ok(fs.existsSync(REPORT_HTML), "the built export has no /results/nfl page");
});

/* The headline, recomputed here from the artifact (not from week-report-data.ts), so the page and this check
   cannot share a mistake. 2026-10-13: the page led with "82.2% of our NFL predictions came true", a sum of range
   checks (aim ≈ 8 in 10), the winner record and the likeliest scorer — an accuracy rate the model never earned. */
const expectHeadline = (r) => {
  const props = r.summary.props;
  const winner = props.find((p) => p.id === "winner" && p.checks > 0);
  const ranged = props.filter((p) => typeof p.target === "number" && p.checks > 0);
  const hits = ranged.reduce((a, p) => a + p.hits, 0), checks = ranged.reduce((a, p) => a + p.checks, 0);
  return { winner, ranges: checks ? { hits, checks, rate: hits / checks } : null };
};
const POOLED = /of our (?:NFL )?predictions came true/;

test("the headline names the winner record, and the ranges against their own aim — never a pooled 'came true' rate", () => {
  const text = visibleText(fs.readFileSync(REPORT_HTML, "utf8"));
  const s = report.summary;
  const h = expectHeadline(report);
  if (h.winner) assert.ok(text.includes(`${report.period.label}: the team we favored won ${h.winner.hits} of ${h.winner.checks} games`), "headline = the winner record");
  if (h.ranges) {
    assert.ok(text.includes(`${h.ranges.hits} of ${h.ranges.checks} times (${pct(h.ranges.rate)})`), "range checks are stated as their own line");
    assert.match(text, /the aim is about 8 in 10: far more means the ranges were too wide/, "a range rate is read against its aim, not as accuracy");
  }
  assert.doesNotMatch(text, POOLED, "no pooled 'predictions came true' rate");
  assert.ok(!text.includes(`Overall ${pct(s.overall.rate)} ${s.overall.hits}/${s.overall.checks}`), "no 'Overall' row adding every kind of check together");
  for (const p of s.props) {
    const row = new RegExp(`${p.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: · estimate)? ${pct(p.rate).replace(".", "\\.")} ${p.hits}/${p.checks}`);
    assert.match(text, row, `${p.label}: rendered row must read ${pct(p.rate)} ${p.hits}/${p.checks}`);
  }
});

test("every game is listed, and a game that is not final says so rather than disappearing", () => {
  const text = visibleText(fs.readFileSync(REPORT_HTML, "utf8"));
  for (const g of report.games) {
    assert.ok(text.includes(`${g.away.abbr} at ${g.home.abbr}`), `${g.matchup} missing from the report`);
    if (g.state === "PENDING") assert.ok(text.includes("not final"), `${g.matchup} is pending but nothing says so`);
  }
});

test("the card on /results quotes the same week, the same rate, and links to the report", () => {
  const html = fs.readFileSync(HUB_HTML, "utf8");
  const text = visibleText(html);
  assert.ok(text.includes(`NFL · ${report.period.label} report`), "card eyebrow");
  const h = expectHeadline(report);
  if (h.winner) assert.ok(text.includes(`NFL ${report.period.label}: the team we favored won ${h.winner.hits} of ${h.winner.checks} games`), "card headline = the report's winner record");
  if (h.ranges) assert.ok(text.includes(`${h.ranges.hits} of ${h.ranges.checks} times (${pct(h.ranges.rate)})`), "card range line = the report's");
  assert.doesNotMatch(text, POOLED, "the card quotes no pooled 'came true' rate");
  assert.match(html, /href="\/results\/nfl\/?"/, "card links to the report");
});
