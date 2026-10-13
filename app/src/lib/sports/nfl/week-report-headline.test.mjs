/**
 * THE NFL WEEK HEADLINE NAMES EACH KIND OF CHECK ON ITS OWN TERMS (launch audit, 2026-10-13).
 *
 * /results led with "82.2% of our NFL predictions came true (393 of 478)": 378 of those checks were 80%-range
 * coverage (aim ≈ 8 in 10 — more means too wide, not better), 13 the winner record, 14 the likeliest scorer.
 * weekHeadline() keeps them apart; this pins it on the real committed Week 5 report and on synthetic edges.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { weekHeadline, headlineTitle, headlineDetail } from "./week-report-data.ts";

const DATA = path.join(process.cwd(), "public/data/nfl/reconciliation");
const week5 = JSON.parse(fs.readFileSync(path.join(DATA, "2-05.json"), "utf8"));

test("Week 5: winner 8 of 13 (≈ 7.9 expected), ranges 378 of 451 against an 80% aim, likeliest scorer 7 of 14", () => {
  const h = weekHeadline(week5);
  assert.deepEqual(h.winner, { hits: 8, checks: 13, expected: 7.9 });
  assert.deepEqual({ hits: h.ranges.hits, checks: h.ranges.checks, target: h.ranges.target }, { hits: 378, checks: 451, target: 0.8 });
  assert.deepEqual(h.scorer, { hits: 7, checks: 14 });
  assert.equal(headlineTitle("Week 5", h), "Week 5: the team we favored won 8 of 13 games");
  const d = headlineDetail(h);
  assert.match(d, /expected about 7\.9 of those 13/);
  assert.match(d, /inside our 80% ranges 378 of 451 times \(83\.8%\) — the aim is about 8 in 10/);
  assert.match(d, /likeliest touchdown scorer scored in 7 of 14 games/);
  assert.doesNotMatch(d + headlineTitle("Week 5", h), /came true|accura/i, "no pooled accuracy language");
});

test("every committed graded week: the pooled overall is never what the headline reports", () => {
  for (const f of fs.readdirSync(DATA).filter((n) => /^\d-\d{2}\.json$/.test(n))) {
    const r = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
    if (!(r.summary?.overall?.checks > 0)) continue;
    const text = headlineTitle(r.period.label, weekHeadline(r)) + " " + headlineDetail(weekHeadline(r));
    const pooled = `${(r.summary.overall.rate * 100).toFixed(1)}%`;
    assert.ok(!text.includes(`${r.summary.overall.hits} of ${r.summary.overall.checks}`), `${f}: the pooled count is not a headline`);
    assert.ok(!text.includes(pooled) || weekHeadline(r).ranges?.rate === r.summary.overall.rate, `${f}: the pooled rate ${pooled} is not a headline`);
  }
});

test("edges: no winner graded → a plain title; ranges with different aims are never pooled", () => {
  const base = { period: { label: "Week 9" }, summary: { props: [] } };
  assert.equal(headlineTitle("Week 9", weekHeadline(base)), "Week 9 report");
  const mixed = { summary: { props: [
    { id: "a", target: 0.8, checks: 10, hits: 8 },
    { id: "b", target: 0.5, checks: 10, hits: 5 },
  ] } };
  assert.equal(weekHeadline(mixed).ranges, null, "an 80% range and a 50% range cannot be added up");
});
