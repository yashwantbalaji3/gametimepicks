/**
 * Settled EPL match pages lead with the official result (founder P1 2026-10-26). For EVERY graded fixture: the panel's
 * full-time score and the probability it quotes are the graded ledger's own; the "which revision" note appears exactly
 * when the graded forecast and the page's archived revision differ at the printed precision; an ungraded fixture renders
 * no panel and so never a guessed score.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React; // the .tsx under test compiles to React.createElement

const { default: Panel } = await import("../../../components/epl/epl-match-what-happened.tsx");
const { loadEplGradedRecord } = await import("./graded-record.ts");
const { loadEplForecastArchive, findEplForecastAnywhere } = await import("./forecast-view.ts");

const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const pct = (n) => `${Math.round(n * 1000) / 10}%`;
const ledger = fs.readFileSync(path.join(process.cwd(), "public/data/soccer/epl/results/graded-forecasts.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("every graded fixture's page shows the ledger's own final score and probability", () => {
  const rec = loadEplGradedRecord();
  const slugOf = new Map(loadEplForecastArchive().map((r) => [String(r.eventId), r.slug]));
  assert.ok(ledger.length > 50, "a vacuous run proves nothing");
  let notes = 0;
  for (const g of ledger) {
    const m = rec.team.matchesList.find((x) => x.eventId === g.eventId);
    const row = findEplForecastAnywhere(slugOf.get(g.eventId));
    assert.ok(m && row, `${g.eventId}: graded and has a page`);
    const home = row.homeClub, away = row.awayClub;
    const t = text(renderToStaticMarkup(React.createElement(Panel, { graded: m, home, away, pageProbs: row.probs })));
    assert.ok(t.includes(`Full time: ${home} ${g.actual.homeGoalsFT} – ${g.actual.awayGoalsFT} ${away}`), `${g.matchup}: ${t.slice(0, 120)}`);
    assert.ok(t.includes(`The graded forecast gave this result ${pct(g.scores.probabilityOfActual)}`), g.matchup);
    assert.ok(t.includes(g.scores.hit ? "which happened" : "which did not happen"), g.matchup);
    const differs = ["home", "draw", "away"].some((k) => pct(g.forecast.probs[k]) !== pct(row.probs[k]));
    assert.equal(t.includes("The record grades the forecast published"), differs, `${g.matchup}: revision note iff the printed figures differ`);
    if (differs) notes += 1;
  }
  assert.ok(notes < ledger.length / 2, `revision notes stay the exception (${notes})`);
});

test("no grade, no panel", () => {
  assert.equal(renderToStaticMarkup(React.createElement(Panel, { graded: { eventId: "x", actual: null }, home: "A", away: "B", pageProbs: null })), "");
});
