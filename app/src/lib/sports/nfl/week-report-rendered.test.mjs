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
const newest = index?.weeks?.at(-1) ?? null;
const report = newest ? JSON.parse(fs.readFileSync(path.join(DATA, `${newest.key}.json`), "utf8")) : null;

test("a reconciled week exists, so the checks below are not vacuous", () => {
  assert.ok(report, "no NFL week reconciliation on disk");
  assert.ok(report.summary.overall.checks > 0, "the newest week graded nothing");
  assert.ok(fs.existsSync(REPORT_HTML), "the built export has no /results/nfl page");
});

test("the headline, every prop's rate and the overall line render exactly as graded", () => {
  const text = visibleText(fs.readFileSync(REPORT_HTML, "utf8"));
  const s = report.summary;
  assert.ok(text.includes(`${report.period.label}: ${pct(s.overall.rate)} of our predictions came true`), "headline rate");
  assert.ok(text.includes(`${s.overall.hits} of ${s.overall.checks} checks`), "headline count");
  for (const p of s.props) {
    const row = new RegExp(`${p.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: · estimate)? ${pct(p.rate).replace(".", "\\.")} ${p.hits}/${p.checks}`);
    assert.match(text, row, `${p.label}: rendered row must read ${pct(p.rate)} ${p.hits}/${p.checks}`);
  }
  assert.match(text, new RegExp(`Overall ${pct(s.overall.rate).replace(".", "\\.")} ${s.overall.hits}/${s.overall.checks}`));
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
  assert.ok(text.includes(`${pct(report.summary.overall.rate)} of our NFL predictions came true`), "card rate must equal the report's");
  assert.match(html, /href="\/results\/nfl\/?"/, "card links to the report");
});
