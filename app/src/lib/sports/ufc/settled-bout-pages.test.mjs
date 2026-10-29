/**
 * BATCH 1 · FIX #3 + #4 — durable UFC bout pages, and one round probability everywhere.
 *
 * #3: /ufc/bout/<id>/ was generated for the current card only, so every bout 404'd once the next card published
 *     (UFC 333's 401911632 among them). Settled bouts now come from the forecast ledger and render the winner read
 *     exactly as frozen before the card beside the official result — never a recomputed forecast, never an invented
 *     result.
 * #4: Cage Chaos printed "R3 or later · distance 47%" (47% was the decision share) while the bout page printed
 *     "Round 3 or later 56.4%"; the hub paired "Goes the distance 37%" with "round 3 or later (57%)". Every surface now
 *     reads one accessor, so a label always carries the same number.
 *
 * Everything below reads the COMMITTED artifacts and renders the real pages (react-dom/server).
 *
 * Run: npx tsx --test src/lib/sports/ufc/settled-bout-pages.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ufcBoutIds, ufcCardBoutIds, ufcSettledBouts, findUfcSettledBout, ufcSettledBoutHrefByKey, loadUfcCard } from "./bout.ts";
import { ufcRoundRead, ufcPct, ufcEndingLine, UFC_ROUND_LABEL } from "./round-phrase.mjs";

globalThis.React = React;

const APP = process.cwd();
const ROOT = path.resolve(APP, "..");
const ledger = fs.readFileSync(path.join(ROOT, "data/internal/forecast-ledger/v1/ufc.jsonl"), "utf8")
  .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const settledLedger = ledger.filter((r) => r.family === "ufc_winner" && (r.settlement?.state === "SETTLED" || r.settlement?.state === "VOID"));
const corpus = JSON.parse(fs.readFileSync(path.join(APP, "public/data/ufc/results-latest.json"), "utf8")).results;
const graded = JSON.parse(fs.readFileSync(path.join(APP, "public/data/ufc/graded-picks.json"), "utf8"));

const decode = (s) => s.replace(/&rsquo;|&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const textOf = (html) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

const BoutPage = (await import("../../../app/ufc/bout/[boutId]/page.tsx")).default;
const renderBout = async (boutId) => renderToStaticMarkup(await BoutPage({ params: { boutId } }));

// ── #3 · settled ids come from the ledger ────────────────────────────────────────────────────────────────────────

test("settled bout ids are exactly the ledger's settled/void UFC winner rows; the current card is kept", () => {
  assert.ok(settledLedger.length >= 90, `the committed ledger carries the graded UFC record (${settledLedger.length})`);
  const card = ufcCardBoutIds();
  const all = ufcBoutIds();
  assert.equal(new Set(all).size, all.length, "no bout id appears twice");
  assert.deepEqual(all.slice(0, card.length), card, "the current card's bouts come first, in card order");
  const onCard = new Set(card);
  const expected = new Set(settledLedger.map((r) => String(r.eventId)).filter((id) => !onCard.has(id)));
  assert.deepEqual(new Set(all.slice(card.length)), expected, "every other page id is a settled ledger bout, and every settled ledger bout has one");
  assert.ok(all.includes("401911632"), "UFC 333's Evloev–Volkanovski (404 before this fix) is generated");
  assert.deepEqual(new Set(ufcSettledBouts().map((b) => b.boutId)), new Set(settledLedger.map((r) => String(r.eventId))));
});

test("a PENDING or unpublished ledger row never becomes a settled page", () => {
  const settledIds = new Set(ufcSettledBouts().map((b) => b.boutId));
  for (const r of ledger.filter((x) => !["SETTLED", "VOID"].includes(x.settlement?.state))) {
    assert.ok(!settledIds.has(String(r.eventId)), `${r.eventId} is ${r.settlement?.state}, not settled`);
  }
});

// ── #3 · the settled page shows the frozen forecast + the official result ───────────────────────────────────────

test("every settled bout's context carries the ledger's frozen read and settlement verbatim", () => {
  for (const r of settledLedger) {
    const ctx = findUfcSettledBout(String(r.eventId));
    assert.ok(ctx, `${r.eventId} resolves`);
    const b = ctx.bout;
    assert.equal(b.pick, r.categoryPrediction, `${r.eventId}: pick`);
    assert.equal(b.probability, r.probability, `${r.eventId}: probability is the frozen one, unrounded`);
    assert.equal(b.publishedAt, r.publishedAt);
    assert.equal(b.state, r.settlement.state);
    assert.equal(b.winner, r.settlement.state === "SETTLED" ? r.settlement.finalCategory : null, `${r.eventId}: official winner`);
    assert.ok(!ctx.siblings.some((s) => s.boutId === b.boutId), "a bout is never its own sibling");
  }
});

test("a method/round/time is shown only when the results corpus names the same outcome — and then verbatim", () => {
  let shown = 0;
  for (const b of ufcSettledBouts()) {
    if (!b.finish) continue;
    shown += 1;
    const row = corpus.find((c) => c.eventDate === b.finish.eventDate && c.method === b.finish.method && c.round === b.finish.round && c.time === b.finish.time &&
      (b.state === "VOID" ? !c.winner : c.winner && c.winner.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "") ===
        b.winner.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "")));
    assert.ok(row, `${b.boutId} (${b.matchup}): the finish shown is a committed corpus row naming the same outcome`);
  }
  assert.ok(shown >= 85, `most settled bouts carry their official finish (${shown})`);
});

test("rendered: UFC 333 Evloev–Volkanovski shows the frozen 69.4% read and the official KO / TKO round 2 result", async () => {
  const r = settledLedger.find((x) => String(x.eventId) === "401911632");
  assert.ok(r, "fixture row is in the committed ledger");
  const html = await renderBout("401911632");
  const text = textOf(html);
  assert.match(html, /data-ufc-frozen-forecast/);
  assert.match(text, new RegExp(`Model pick: ${r.categoryPrediction} · ${ufcPct(r.probability).replace(".", "\\.")}`));
  assert.match(text, /Alexander Volkanovski won · KO \/ TKO · round 2 · 4:54/);
  assert.match(text, /MISS — the model['’]s pick, Movsar Evloev, lost/);
  // No recomputed method/round read on a settled page.
  assert.doesNotMatch(text, /Goes the distance|Ends in round/, "no method/round read is reprinted for a settled bout");
});

test("rendered: every settled page's visible pick/probability/winner matches the ledger and the graded record", async () => {
  const gradedByKey = new Map(graded.picks.map((p) => [p.eventId, p]));
  const hrefs = ufcSettledBoutHrefByKey();
  for (const b of ufcSettledBouts()) {
    const text = textOf(await renderBout(b.boutId));
    if (b.pick && b.probability != null) assert.ok(text.includes(`Model pick: ${b.pick} · ${ufcPct(b.probability)}`), `${b.boutId}: frozen read rendered`);
    if (b.state === "SETTLED") assert.ok(text.includes(`${b.winner} won`), `${b.boutId}: official winner rendered`);
    else assert.match(text, /No winner/, `${b.boutId}: a void says so`);
  }
  // The public graded record agrees with what the linked page renders.
  let linked = 0;
  for (const [key, href] of Object.entries(hrefs)) {
    const p = gradedByKey.get(key);
    if (!p) continue;
    linked += 1;
    const b = findUfcSettledBout(href.split("/").filter(Boolean).pop()).bout;
    assert.equal(b.pick, p.predicted, `${key}: same pick on the record and the page`);
    assert.equal(b.probability, p.modelProbability, `${key}: same probability`);
    if (p.hit != null) assert.equal(b.winner, p.actual, `${key}: same official winner`);
  }
  assert.equal(linked, graded.picks.length, "every row on /results/picks/ufc links to its bout page");
});

test("/results/picks/ufc and the hub pass the settled-bout links; rows without a page stay plain text", () => {
  const picks = fs.readFileSync(path.join(APP, "src/app/results/picks/[sport]/page.tsx"), "utf8");
  assert.match(picks, /rowHrefs=\{params\.sport === "ufc" \? ufcSettledBoutHrefByKey\(\) : undefined\}/);
  const section = fs.readFileSync(path.join(APP, "src/components/sports/graded-picks-section.tsx"), "utf8");
  assert.match(section, /p\.eventId && rowHrefs\?\.\[p\.eventId\]/, "a row links only when its event has an exported page");
  for (const href of Object.values(ufcSettledBoutHrefByKey())) {
    assert.ok(ufcBoutIds().includes(href.split("/").filter(Boolean).pop()), `${href} is a generated bout page`);
  }
});

// ── #4 · one round probability everywhere ──────────────────────────────────────────────────────────────────────

test("the accessor reads the artifact's own fields under fixed labels", () => {
  const r = ufcRoundRead({ endsIn: "3+", probabilities: { round1: 0.2846, round2: 0.1517, round3plus: 0.5636 }, goesTheDistance: 0.4703 });
  assert.equal(r.goesTheDistance.text, "Goes the distance 47.0%");
  assert.equal(r.round3plus.text, "Ends in round 3 or later 56.4%");
  assert.equal(r.likeliest.key, "round3plus");
  assert.equal(ufcEndingLine({ method: { most: "DEC", probabilities: { ko: 0.2, submission: 0.33, decision: 0.4703 } }, rounds: { endsIn: "3+", probabilities: { round3plus: 0.5636 }, goesTheDistance: 0.4703 } }),
    "Decision 47.0% · Ends in round 3 or later 56.4%");
  assert.equal(ufcRoundRead(null), null);
});

/** Every "<label> <n>%" a surface prints for the round labels. */
const labelled = (text) => {
  const out = [];
  for (const label of Object.values(UFC_ROUND_LABEL)) {
    for (const m of text.matchAll(new RegExp(`${label}\\s+(\\d+(?:\\.\\d)?%)`, "g"))) out.push([label, m[1]]);
  }
  return out;
};

test("hub, /cage-chaos and every bout page print the same number under the same round label, for every bout on the card", async () => {
  const card = loadUfcCard();
  const read = (card?.bouts ?? []).filter((b) => b.prediction?.rounds);
  if (!read.length) return; // between cards there is nothing to compare
  const { default: UfcCard } = await import("../../../components/sports/ufc-card.tsx");
  const { default: CageChaos } = await import("../../../app/cage-chaos/page.tsx");
  const hub = renderToStaticMarkup(React.createElement(UfcCard, { card }));
  const chaos = renderToStaticMarkup(await CageChaos());

  // Old contradictions are gone.
  assert.doesNotMatch(textOf(chaos), /R3 or later · distance/, "Cage Chaos no longer pairs the round bucket with the decision share");
  assert.doesNotMatch(textOf(hub), /round 3 or later \(\d+%\)/, "the hub verdict no longer prints the whole-percent round phrase");

  for (const b of read) {
    const r = ufcRoundRead(b.prediction.rounds);
    const truth = new Map(["goesTheDistance", "round1", "round2", "round3plus"].filter((k) => r[k]).map((k) => [r[k].label, r[k].pct]));
    const bout = textOf(await renderBout(String(b.boutId)));
    const segs = {
      bout: bout,
      // The hub and Cage Chaos are whole-card pages: read each bout's slice by its matchup.
      hub: sliceFor(textOf(hub), b),
      chaos: sliceFor(textOf(chaos), b),
    };
    for (const [surface, text] of Object.entries(segs)) {
      const pairs = labelled(text);
      assert.ok(pairs.length > 0, `${b.red.name} vs ${b.blue.name}: ${surface} prints at least one labelled round figure`);
      for (const [label, value] of pairs) {
        assert.equal(value, truth.get(label), `${b.red.name} vs ${b.blue.name} · ${surface}: "${label}" must read ${truth.get(label)}, printed ${value}`);
      }
    }
    // Both headline quantities appear on the bout page and on Cage Chaos.
    for (const t of [segs.bout, segs.chaos]) {
      assert.ok(t.includes(r.goesTheDistance.text), `${b.boutId}: "${r.goesTheDistance.text}"`);
      assert.ok(t.includes(r.likeliest.text), `${b.boutId}: "${r.likeliest.text}"`);
    }
  }
});

/** The text from this bout's matchup to the next "<red> vs <blue>" of another bout (or the end). */
function sliceFor(text, b) {
  const at = text.indexOf(`${b.red.name} vs ${b.blue.name}`);
  assert.ok(at >= 0, `${b.red.name} vs ${b.blue.name} is on the page`);
  const others = (loadUfcCard()?.bouts ?? []).filter((o) => o.boutId !== b.boutId)
    .map((o) => text.indexOf(`${o.red.name} vs ${o.blue.name}`, at + 1)).filter((i) => i > at);
  return text.slice(at, others.length ? Math.min(...others) : undefined);
}
