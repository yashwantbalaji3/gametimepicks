/**
 * A FINISHED GAME IS NOT LIVE — the rendered live line on every NFL prediction row.
 *
 * 🔴 THE DEFECT, reproduced on the real component with a real board row (401872960) before the fix:
 *
 *     phase FINAL, no settlement   →   tag="Live"   data-phase="FINAL"   ·   "Live 41"
 *
 * The tag read `settled || noMeasure ? "Final" : "Live"`, so a game the PROVIDER had called final
 * rendered as LIVE for as long as settlement had not run — the window between the final whistle and
 * the nightly settle, which is hours, on the surface tomorrow's acceptance is watched from.
 *
 * The live contract has a name for that state — FINAL_AWAITING_SETTLEMENT — and §3.3 is explicit
 * that only FINAL_CANONICAL may carry result copy. So the fix says the event is over AND that this
 * product has not graded it, and changes nothing about colour or outcome wording.
 *
 * Run: cd app && npx tsx --test src/lib/prediction-presentation/live-line-finality.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { presentPlayerBoardRow } = await import("./nfl.ts");
const { PredictionBoard } = await import("../../components/prediction/prediction-board.tsx");

const APP = process.cwd();
const BOARDS = path.join(APP, "public/data/nfl/player-board");

/** A real committed board row, so the fixture cannot drift from the shape the page renders. */
function realRow() {
  for (const f of fs.readdirSync(BOARDS)) {
    const b = JSON.parse(fs.readFileSync(path.join(BOARDS, f), "utf8"));
    if (b?.families?.player_reception_yds?.state !== "PUBLISHED") continue;
    const player = (b.players ?? []).find((p) => p.markets?.player_reception_yds);
    if (!player) continue;
    return { board: b, player };
  }
  return null;
}

const fixture = realRow();

function render(live, settlement) {
  const { board, player } = fixture;
  const ctx = {
    providerEventId: board.providerEventId, kickoffUtc: board.kickoffUtc,
    families: board.families, generatedAt: board.generatedAt, teams: ["AAA", "BBB"],
  };
  const idx = new Map([[`${player.playerId}|player_reception_yds`,
    { playerId: player.playerId, family: "player_reception_yds", live, settlement }]]);
  const row = presentPlayerBoardRow(ctx, player, "player_reception_yds", idx);
  assert.ok(row, "the fixture must produce a row, or nothing below proves anything");
  const html = renderToStaticMarkup(React.createElement(PredictionBoard, { predictions: [row], gameHref: () => null }));
  return {
    html,
    tag: (html.match(/gtp-pred-live-tag[^>]*>([^<]*)</) ?? [])[1] ?? null,
    text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  };
}

const IN_PROGRESS = { phase: "IN_PROGRESS", statValue: 41, clock: "4:12", period: 3, score: { home: 14, away: 10 } };
/*
 * ⚠ A REAL FINAL STILL CARRIES A PERIOD AND A CLOCK. The first version of this fixture used
 * `period: null`, which made the "no quarter in progress" assertion VACUOUS — the condition it
 * guards is `f?.period != null`, so with a null period the check passed whether or not the guard
 * existed. ESPN reports the fourth quarter at `0:00` on a finished game, and that is what must not
 * be rendered as a quarter in progress.
 */
const PROVIDER_FINAL = { phase: "FINAL", statValue: 41, clock: "0:00", period: 4, score: { home: 24, away: 17 } };

test("a game in progress still says Live, with its period and clock", { skip: !fixture }, () => {
  const r = render(IN_PROGRESS, null);
  assert.equal(r.tag, "Live");
  assert.match(r.text, /3Q/);
  assert.match(r.text, /4:12/);
});

test("🔴 a provider FINAL does NOT say Live — it says Final, with the result pending", { skip: !fixture }, () => {
  const r = render(PROVIDER_FINAL, null);
  assert.equal(r.tag, "Final", "a finished game rendered as LIVE for hours before this");
  assert.match(r.text, /result pending/i, "and it must say which half is missing");
  /* ⚠ AND IT IS NOT A RESULT. §3.3: only FINAL_CANONICAL may carry result copy. */
  assert.equal(/\bOVER\b|\bUNDER\b|\bWIN\b|\bLOSS\b|\bHIT\b|\bMISS\b/i.test(r.text), false,
    "an ungraded final must not carry an outcome word");
  assert.equal(r.html.includes("gtp-pred-live-res"), false, "nor the result treatment");
  /* The period/clock of a finished game is not a present tense. */
  assert.equal(/\d+Q/.test(r.text), false, "a finished game has no quarter in progress");
});

test("only a SETTLED row carries the line result", { skip: !fixture }, () => {
  const r = render({ phase: "FINAL", statValue: 41, clock: null, period: null, score: null },
                   { state: "SETTLED", finalStat: 41, line: 9.5, lineResult: "OVER", forecastResult: "HIT" });
  assert.equal(r.tag, "Final");
  assert.match(r.text, /OVER/);
  assert.ok(r.html.includes("gtp-pred-live-res"));
});

test("§3 · NO_MEASUREMENT is final and explicitly ungraded, never an Under", { skip: !fixture }, () => {
  const r = render(null, { state: "NO_MEASUREMENT", finalStat: null, line: 9.5, lineResult: null, forecastResult: null });
  assert.equal(r.tag, "Final");
  assert.match(r.text, /not graded/i);
  assert.equal(/\bUNDER\b|\bLOSS\b|\bMISS\b/i.test(r.text), false);
});

test("the fixture is a REAL committed board row, not a hand-written one", () => {
  assert.ok(fixture, "no committed NFL board publishes receiving yards — this suite would be vacuous");
  assert.ok(fixture.player.playerId, "the row must carry a canonical player id");
});
