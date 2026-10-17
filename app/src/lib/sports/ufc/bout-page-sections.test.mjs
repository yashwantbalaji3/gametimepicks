/**
 * BOUT PAGE SECTIONS (UFC-001 UX Phase B, 2026-10-10).
 *
 *  - Section C ("Why") names the winner head's inputs and makes NO attribution claim: per-fight attributions need the
 *    builder to emit coefficients (Phase D), so no wording may say which input drove, tipped or explains a pick.
 *  - The method distribution is labelled exactly P(method | the bout ends with a winner), never "the pick wins by X".
 *  - Section D shows verified fields only, each with a source and an as-of date, and no striking or grappling averages.
 *
 * Run: npx tsx --test src/lib/sports/ufc/bout-page-sections.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WIN_F_TOTT } from "../../../../scripts/ufc/lib/fight-model.mjs";
import { METHOD_DIST_LABEL, METHOD_DIST_NOTE, WINNER_INPUTS, ATTRIBUTION_HEADLINE } from "./bout-explain.mjs";
import { comparisonRows } from "./bout-comparison.mjs";
import { indexTaleOfTheTape, loadTaleOfTheTape, MISSING } from "./tale-of-tape.mjs";
import { RECORD_SUMMARY_LABEL } from "./profile-copy.mjs";
import { findUfcBout } from "./bout.ts";

globalThis.React = React;
const { default: UfcBoutWhy, recordSummaryBody } = await import("../../../components/sports/ufc-bout-why.tsx");
const { default: UfcFighterComparison } = await import("../../../components/sports/ufc-fighter-comparison.tsx");

const APP = process.cwd();
const PAGE = fs.readFileSync(path.join(APP, "src/app/ufc/bout/[boutId]/page.tsx"), "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\s*\}/g, "");
const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

/** Wording that would attribute a pick to an input. Section C may name inputs; it may not weigh them. */
const ATTRIBUTION = [
  /\bbecause\b/i, /\bdriven\s+(?:mainly\s+|mostly\s+|largely\s+)?by\b/i, /\bdr(?:ove|ives)\b/i, /\bthanks\s+to\b/i, /\bdue\s+to\b/i,
  /\b(?:main|key|biggest|largest|top)\s+(?:reason|factor|driver|input|contribution)s?\b/i, /\bcontribut(?:ed|es|ing|ion|ions)\b/i,
  /\btipped\b/i, /\bpushed\s+(?:the|this)\b/i, /\bfavou?red\s+by\b/i, /\bedge\s+comes\s+from\b/i, /\blog-?odds\b/i,
  /\bpoints?\s+of\s+probability\b/i, /\bexplains?\s+(?:the|this)\s+pick\b/i, /\bwhy\s+(?:the\s+model|we)\s+(?:picks?|favou?rs?)\b/i,
];
const attributionHits = (text) => ATTRIBUTION.flatMap((re) => (re.test(text) ? [`${re} in …${text.slice(0, 120)}…`] : []));

test("'What the model uses' lists exactly the winner head's inputs (WIN_F_TOTT), so it cannot drift from the model", () => {
  const described = WINNER_INPUTS.flatMap((x) => x.keys).sort();
  assert.deepEqual(described, [...WIN_F_TOTT].sort());
});

test("section C makes no attribution claim and says per-fight attributions are not published", () => {
  for (const modelled of [true, false]) {
    const html = renderToStaticMarkup(React.createElement(UfcBoutWhy, { reason: null, modelled }));
    const text = textOf(html);
    assert.deepEqual(attributionHits(text), [], `modelled=${modelled}`);
    assert.ok(text.includes(ATTRIBUTION_HEADLINE), "the page states attributions are not published");
    assert.match(text, /coefficients/, "…and what publishing them needs");
    assert.match(text, /What the model uses/);
  }
});

test("the page's section C renders only the shared component — no attribution text of its own", () => {
  const src = stripComments(PAGE);
  const start = src.indexOf('id="bout-why"');
  const end = src.indexOf('id="bout-compare"');
  assert.ok(start > 0 && end > start, "section C sits between its own id and section D");
  const block = src.slice(start, end);
  assert.match(block, /<UfcBoutWhy reason=\{p\?\.reason \?\? null\}/);
  assert.deepEqual(attributionHits(block.replace(/\s+/g, " ")), []);
  assert.doesNotMatch(block, /HeadToHead|note=\{p\?\.reason/, "the reason line is not printed as the pick's note");
  assert.doesNotMatch(src, /note=\{p\?\.reason/, "nowhere on the page is the tracked-record summary presented as the pick's reasoning");
});

test("the tracked-record summary keeps its 'not the model's reasoning' label, printed once", () => {
  const body = "Duncan finishes 63% of wins.";
  for (const reason of [`${RECORD_SUMMARY_LABEL} ${body}`, body]) {
    const html = renderToStaticMarkup(React.createElement(UfcBoutWhy, { reason, modelled: true }));
    const text = textOf(html);
    assert.equal(text.split("not the model's reasoning").length - 1, 1, `label printed exactly once for: ${reason}`);
    assert.ok(text.includes("From the tracked records (a summary, not the model's reasoning)"));
    assert.ok(text.includes(body));
  }
  assert.equal(recordSummaryBody(`${RECORD_SUMMARY_LABEL} x.`), "x.");
  assert.equal(recordSummaryBody(null), null);
});

test("the method distribution is labelled P(method | the bout ends with a winner), never as the pick's way to win", () => {
  assert.equal(METHOD_DIST_LABEL, "P(method | the bout ends with a winner)");
  assert.match(METHOD_DIST_NOTE, /whichever fighter wins/i);
  assert.match(METHOD_DIST_NOTE, /not the chance that the pick wins by that method/i);
  const src = stripComments(PAGE);
  assert.match(src, /\{METHOD_DIST_LABEL\}/, "the page renders the label");
  assert.match(src, /\{METHOD_DIST_NOTE\}/, "…and its note");
  const flat = src.replace(/\s+/g, " ");
  assert.doesNotMatch(flat, /P\(\s*(?:the\s+)?pick\s+wins/i);
  assert.doesNotMatch(flat, /\bwins?\s+by\s+(?:KO|knockout|submission|decision)\b/i, "no 'wins by X' wording");
  assert.doesNotMatch(flat, /sub: p\.method && p\.rounds/, "the pick's verdict no longer carries the method beside the winner");
  assert.match(flat, /R3\+ includes every bout that reaches the judges|ROUND_NOTES/, "the round note travels with the histogram");
});

test("the D2 disclosure and the model id / forecast time sit in section A", () => {
  const src = stripComments(PAGE).replace(/\s+/g, " ");
  const a = src.slice(src.indexOf('id="bout-pick"'), src.indexOf('id="bout-ending"'));
  assert.match(a, /This is an experimental model: winner forecasts are graded on every new card/);
  assert.match(a, /card\.model\.id/);
  assert.match(a, /card\.generatedAt/);
});

const FORBIDDEN_STATS = /strikes?\s+(?:landed|per)|per\s+minute|SLpM|SApM|takedown|submission\s+(?:average|attempt)|sub\.?\s+avg|accuracy|defen[cs]e/i;

test("section D: verified fields only, each with a source and an as-of date", () => {
  const ctx = findUfcBout("401916276");
  if (!ctx) return; // between cards there is no bout to check against
  const tott = loadTaleOfTheTape(path.join(APP, ".."));
  const rows = comparisonRows({ bout: ctx.bout, card: ctx.card, tott });
  assert.deepEqual(rows.map((r) => r.key), ["age", "height", "reach", "stance", "pro-record", "ufc-record", "last-5"]);
  for (const r of rows) {
    assert.doesNotMatch(`${r.label} ${r.source}`, FORBIDDEN_STATS, `${r.key} is not a striking or grappling average`);
    assert.ok(r.source, `${r.key} names its source`);
    assert.match(String(r.asOf), /^\d{4}-\d{2}-\d{2}$/, `${r.key} carries an as-of date`);
    for (const side of [r.red, r.blue]) {
      assert.ok((side.display == null) !== (side.reason == null), `${r.key}: a value XOR a reason`);
    }
  }
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(byKey.age.red.display, "30", "Allen, born 1995-12-28, is 30 on 10 Oct 2026 (ET)");
  assert.equal(byKey.reach.blue.display, "79 in");
  assert.equal(byKey["pro-record"].red.display, ctx.bout.red.record);
  assert.equal(byKey["ufc-record"].red.display, "15-4 (19 bouts)");
});

test("section D: a missing value renders '—' with its reason, in a labelled table", () => {
  const bout = {
    startUtc: "2026-10-10T21:00Z",
    red: { athleteId: "2", name: "Zeros", record: null, priorBoutsInCorpus: 1 },
    blue: { athleteId: "999", name: "Unlisted", record: "6-0-0", priorBoutsInCorpus: 0, profile: { bouts: 0, last5: [] } },
  };
  const tott = indexTaleOfTheTape({ generatedAt: "2026-08-18T00:00:00Z", fighters: [{ athleteId: "2", heightIn: 0, reachIn: 0, stance: "--", dateOfBirth: null }] });
  const rows = comparisonRows({ bout, card: { generatedAt: "2026-10-10T14:05:39Z", model: { corpus: { to: "2026-08-08" } } }, tott });
  const html = renderToStaticMarkup(React.createElement(UfcFighterComparison, { redName: "Zeros", blueName: "Unlisted", rows }));
  const text = textOf(html);
  assert.match(html, /<caption class="sr-only">/);
  assert.equal((html.match(/<th scope="row"/g) ?? []).length, rows.length, "every row has a row header");
  assert.equal((html.match(/<th scope="col"/g) ?? []).length, 3);
  for (const reason of [MISSING.HEIGHT, MISSING.REACH, MISSING.STANCE, MISSING.DOB, MISSING.NOT_LISTED, "ESPN lists no record for this fighter on the card", "No tracked UFC bouts"]) {
    assert.ok(text.includes(reason), `reason shown: ${reason}`);
  }
  assert.match(text, /This card carries no win-loss breakdown for this fighter \(1 tracked bout\)/);
  assert.ok(!/\b0 in\b/.test(text), "ESPN's 0 never renders as a measurement");
  assert.match(text, /as of 2026-08-18/);
  assert.match(text, /as of 2026-08-08/);
  assert.match(text, /as of 2026-10-10/);
  assert.doesNotMatch(text, FORBIDDEN_STATS);
});

test("the unmodelled bout still gets a comparison, from the tape and the card alone", () => {
  const ctx = findUfcBout("401927418");
  if (!ctx) return;
  assert.equal(ctx.bout.prediction, null);
  const rows = comparisonRows({ bout: ctx.bout, card: ctx.card, tott: loadTaleOfTheTape(path.join(APP, "..")) });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  for (const k of ["age", "height", "reach", "stance", "pro-record"]) {
    assert.ok(byKey[k].red.display && byKey[k].blue.display, `${k} renders for both fighters`);
  }
});
