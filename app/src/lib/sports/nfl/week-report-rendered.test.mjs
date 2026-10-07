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

/* Founder ruling 2026-10-07 ("SEPARATE"): winner calls, likeliest-scorer calls and range coverage are three
   different measurements. They render apart, coverage against its target, and nothing pools them. */
const separate = (s) => {
  const w = s.props.find((p) => p.id === "winner"), sc = s.props.find((p) => p.id === "likeliest_scorer");
  const ranges = s.props.filter((p) => p.target != null && p.checks > 0);
  const hits = ranges.reduce((n, p) => n + p.hits, 0), checks = ranges.reduce((n, p) => n + p.checks, 0);
  return { w, sc, hits, checks, target: ranges[0]?.target };
};

test("the three measures, every prop's rate, and no pooled figure render exactly as graded", () => {
  const text = visibleText(fs.readFileSync(REPORT_HTML, "utf8"));
  const s = report.summary;
  const { w, sc, hits, checks, target } = separate(s);
  assert.ok(text.includes(`Winner calls: our favoured team won ${w.hits} of ${w.checks} (${pct(w.rate)})`), "winner measure");
  assert.ok(text.includes(`Likeliest touchdown scorer: scored in ${sc.hits} of ${sc.checks} games (${pct(sc.rate)})`), "scorer measure");
  assert.ok(text.includes(`Range coverage: ${hits} of ${checks} actual results fell inside our forecast ranges (${pct(hits / checks)}, against a target of ${Math.round(target * 100)}%)`), "coverage measure");
  // No pooled figure: neither the old headline nor the pooled count/rate appears anywhere on the page.
  assert.ok(!text.includes("came true"), "no 'came true' headline");
  assert.ok(!text.includes(`${s.overall.hits}/${s.overall.checks}`) && !text.includes(`${s.overall.hits} of ${s.overall.checks}`), "the pooled count is not shown");
  assert.doesNotMatch(text, /\bOverall\b/, "no Overall row");
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
  const { w, sc, hits, checks, target } = separate(report.summary);
  assert.ok(text.includes(`Winner calls ${w.hits} of ${w.checks} · likeliest TD scorer ${sc.hits} of ${sc.checks}`), "card calls must equal the report's");
  assert.ok(text.includes(`Range coverage: ${hits} of ${checks} results inside our ranges (${pct(hits / checks)}, target ${Math.round(target * 100)}%)`), "card coverage must equal the report's");
  assert.ok(!text.includes("of our NFL predictions came true"), "the card carries no pooled NFL rate");
  assert.match(html, /href="\/results\/nfl\/?"/, "card links to the report");
});
