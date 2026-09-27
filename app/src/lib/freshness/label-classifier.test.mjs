/**
 * Tested against SYNTHETIC lines, deliberately. A classifier whose fixtures are the live repo rots
 * the moment a page changes, and it cannot be mutation-probed — the same reason the audit itself is
 * read-only rather than a gate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyLabelLine, RESOLVERS } from "./label-classifier.mjs";
import { CLOCK, DOMAIN } from "./clocks.mjs";

test("a label whose value is a generation time resolves to FORECAST_GENERATED_AT", () => {
  const c = classifyLabelLine('<p>Updated {fmt(set.generatedAt)} ET</p>');
  assert.equal(c.kind, "CLOCK");
  assert.equal(c.clock, CLOCK.FORECAST_GENERATED_AT);
  assert.equal(c.domain, DOMAIN.FORECAST);
  assert.equal(c.unresolved, false);
});

test('a BUILD clock presented as a surface’s "when" is flagged (§15 rule 2)', () => {
  const c = classifyLabelLine('<span>Updated {new Date(buildInfo.builtAt).toISOString()}</span>');
  assert.equal(c.clock, CLOCK.PAGE_BUILT_AT);
  assert.equal(c.buildClockAsHeadline, true);
});

test("frozenAt is FORECAST_FROZEN_AT, not GENERATED — the specific rule beats the loose one", () => {
  /* A rule ordered after a loose /At\b/ match would have swallowed this. */
  const c = classifyLabelLine('<span>As of {fmt(row.frozenAt)}</span>');
  assert.equal(c.clock, CLOCK.FORECAST_FROZEN_AT);
});

test("settled, corrected, captured and live each resolve to their own clock", () => {
  const cases = [
    ['<span>Updated {fmt(r.settledAt)}</span>', CLOCK.SETTLED_AT],
    ['<span>Updated {fmt(r.correctedAt)}</span>', CLOCK.CORRECTED_AT],
    ['<span>As of {fmt(p.capturedAt)}</span>', CLOCK.MARKET_CAPTURED_AT],
    ['<span>As of {fmt(f.observedAt)}</span>', CLOCK.LIVE_OBSERVED_AT],
    ['<span>Generated {fmt(m.fitAt)}</span>', CLOCK.MODEL_FIT_AT],
    ['<span>Generated {fmt(m.validatedAt)}</span>', CLOCK.MODEL_VALIDATED_AT],
    ['<span>As of {fmt(a.acquiredAt)}</span>', CLOCK.SOURCE_OBSERVED_AT],
  ];
  for (const [line, clock] of cases) {
    assert.equal(classifyLabelLine(line).clock, clock, line);
  }
  /* Eleven distinct meanings, and the point is that they do not collapse. */
  assert.equal(new Set(cases.map(([, c]) => c)).size, cases.length);
});

/* ── THE FALSE POSITIVES THE FIRST VERSION PRODUCED ─────────────────────────────────────────── */

test("a COUNT labelled \"Generated\" is not a clock", () => {
  /* The first version reported eleven "unresolved clocks" and most were this. */
  const c = classifyLabelLine('{ k: "Generated picks", v: String(sim.generatedPicks.length) },');
  assert.equal(c.kind, "NOT_A_CLOCK");
  assert.match(c.why, /renders no time/);
});

test("prose and headings containing a label word are not clocks", () => {
  for (const line of [
    'title="Model-built cards" sub="Generated from the published board"',
    '<dt className="font-semibold">Generated</dt>',
    'lines.push(`Generated picks: ${view.generatedPicks.length}`);',
  ]) {
    assert.equal(classifyLabelLine(line).kind, "NOT_A_CLOCK", line);
  }
});

test("a comment mentioning a label is not a label — including one that CLOSES mid-line", () => {
  assert.equal(classifyLabelLine("// Updated {generatedAt} used to render here").kind, "NOT_A_CLOCK");
  assert.equal(classifyLabelLine(" * Updated {generatedAt}").kind, "NOT_A_CLOCK");
  /* This one is the miss: the block closes before the word, so a startsWith check let it through.
     ⚠ THE REASON MATTERS, NOT JUST THE OUTCOME. Asserting only NOT_A_CLOCK passed even with the
     comment check removed — the line was then excluded for "renders no time" instead, so the probe
     walked straight through a test that looked like it covered this. */
  const midClose = classifyLabelLine("   Generated pool) UX is preserved inside ResultsHero. */}");
  assert.equal(midClose.kind, "NOT_A_CLOCK");
  assert.equal(midClose.why, "comment", "it must be excluded AS a comment, not incidentally");
  /* And a mid-line close whose tail DOES render a time must still be excluded as a comment. */
  const midCloseTimed = classifyLabelLine("   old copy said Updated {row.generatedAt} here. */}");
  assert.equal(midCloseTimed.why, "comment");
  assert.equal(classifyLabelLine("/* old: Updated {row.generatedAt}").why, "comment", "an unclosed open before the word");
});

test("a REAL label is not excluded just because a comment shares its line", () => {
  /* ⚠ THE OVER-EXCLUSION MATTERS MORE THAN THE FALSE POSITIVE. A dropped label hides work; a noisy
     one only costs a glance. Two shapes of real label were being thrown away: */
  const trailing = classifyLabelLine("<span>Updated {row.generatedAt}</span> /* keep this */");
  assert.equal(trailing.kind, "CLOCK", "code followed by a trailing block comment");
  assert.equal(trailing.clock, CLOCK.FORECAST_GENERATED_AT);

  const afterClosed = classifyLabelLine("/* note */ <span>Updated {row.generatedAt}</span>");
  assert.equal(afterClosed.kind, "CLOCK", "code after a comment that already closed");
  assert.equal(afterClosed.clock, CLOCK.FORECAST_GENERATED_AT);
});

/* ── THE PUREST §15 CASE ────────────────────────────────────────────────────────────────────── */

test('a real time whose SOURCE is named "updated" is reported, not excluded', () => {
  /* `Updated {updated}` from `const updated = formatEtTime(lastUpdatedIso)`. The value IS a time,
     but nothing in the code says which of the eleven clocks it is — the codebase never decided.
     Calling this "not a clock" would hide exactly the defect §15 is about. */
  const lines = [
    "  const updated = formatEtTime(lastUpdatedIso);",
    "        {updated ? <span>Updated {updated}</span> : null}",
  ];
  const c = classifyLabelLine(lines[1], lines);
  assert.equal(c.kind, "CLOCK", "it must not be excluded");
  assert.equal(c.unresolved, true);
  assert.equal(c.collapsedSource, true);
  assert.equal(c.clock, null, "no clock can honestly be assigned");
});

test("a one-hop local trace resolves a value hidden behind an identifier", () => {
  const lines = [
    '  const generatedLine = set?.generatedAt ?? "see the artifact";',
    '  <Meta k="Generated" v={generatedLine} />',
  ];
  const c = classifyLabelLine(lines[1], lines);
  assert.equal(c.clock, CLOCK.FORECAST_GENERATED_AT);
  assert.match(c.via, /generatedLine/);
});

test("a line with no label word at all is not examined", () => {
  assert.equal(classifyLabelLine("const x = row.generatedAt;").kind, "NOT_A_CLOCK");
  assert.match(classifyLabelLine("const x = row.generatedAt;").why, /no label word/);
});

test("a slate DATE under an \"As of\" label is unresolved, not silently a clock", () => {
  /* A calendar date is not an instant. Reporting it as a clock would be a confident wrong answer. */
  const c = classifyLabelLine('<Kpi label="As of" value={longDate(kpis.currentDate)} />');
  assert.equal(c.kind, "CLOCK");
  assert.equal(c.unresolved, true);
  assert.equal(c.clock, null);
});

test("every named clock has a resolver — an undetectable clock is a hole in the audit", () => {
  /* A clock the classifier cannot recognise would silently report as UNRESOLVED forever, which reads
     as "the codebase never decided" when the truth is "the audit cannot see it". */
  const covered = new Set(RESOLVERS.map(([, c]) => c));
  const missing = Object.values(CLOCK).filter((c) => !covered.has(c));
  assert.deepEqual(missing, [], "these clocks can never be detected");
  assert.equal(covered.size, Object.keys(CLOCK).length);
});

test("the resolvers are ordered specific-before-loose", () => {
  /* generatedAt is the loosest and must come last, or it swallows frozenAt/validatedAt/acquiredAt. */
  const idx = RESOLVERS.findIndex(([, c]) => c === CLOCK.FORECAST_GENERATED_AT);
  assert.equal(idx, RESOLVERS.length - 1, "the catch-all rule must be last");
});
