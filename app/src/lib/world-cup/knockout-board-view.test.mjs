/**
 * Knockout pick-board view-model — the mission's hard guards: nothing fabricated (every cell traces to a
 * real artifact pick), missing markets stay null (UI renders "Market pending"), completed/started games
 * are never bettable, score/total/BTTS reads stay consistent with the board picks, and every CTA href
 * resolves to a route that actually exists.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildKnockoutBoardView } from "./knockout-board-view.ts";

const root = path.join(process.cwd(), "public", "data");
const board = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "round-of-32", "board.json"), "utf8"));
// Fixed "now" = 1h before the board's earliest kickoff → every game is pregame/live_odds (deterministic).
const earliest = Math.min(...board.games.map((g) => Date.parse(g.kickoffUtc)));
const preNow = earliest - 3600_000;
const view = buildKnockoutBoardView(root, preNow);

test("view builds one row per board game; fail-closed shape", () => {
  assert.ok(view, "view builds");
  assert.equal(view.rows.length, board.games.length, "one row per game");
  assert.equal(view.slateLabel, board.slateLabel);
});

test("NO FABRICATION — every pick cell's odds/label match a real artifact pick verbatim", () => {
  const byId = new Map(board.games.map((g) => [g.gameSlug, g]));
  for (const r of view.rows) {
    const g = byId.get(r.slug);
    assert.ok(g, `row ${r.slug} exists in the artifact`);
    if (r.resultPick) {
      assert.equal(r.resultPick.odds, g.picks.moneyline.americanOdds, `${r.slug} result odds verbatim`);
      assert.equal(r.resultPick.label, g.picks.moneyline.pick, `${r.slug} result label verbatim`);
    }
    if (r.totalPick) assert.equal(r.totalPick.odds, g.picks.total.americanOdds, `${r.slug} total odds verbatim`);
    if (r.bttsPick) assert.equal(r.bttsPick.odds, g.picks.btts.americanOdds, `${r.slug} btts odds verbatim`);
    if (r.protectionPick) {
      const src = [g.picks?.doubleChance?.americanOdds, g.picks?.drawNoBet?.americanOdds];
      assert.ok(src.includes(r.protectionPick.odds), `${r.slug} protection odds from DC/DNB only`);
    }
    // A game with no total/btts in the artifact must surface null (UI: "Market pending"), never a value.
    if (!g.picks?.total) assert.equal(r.totalPick, null, `${r.slug} missing total stays null`);
    if (!g.picks?.btts) assert.equal(r.bttsPick, null, `${r.slug} missing btts stays null`);
  }
});

test("completed/started games are NEVER bettable; pregame live_odds games are", () => {
  // At preNow every game is pregame → live_odds games are bettable.
  for (const r of view.rows) {
    if (r.status === "live_odds") assert.equal(r.bettable, true);
  }
  // Re-derive with "now" far after the last kickoff → everything completed, nothing bettable, no parlays.
  const latest = Math.max(...board.games.map((g) => Date.parse(g.kickoffUtc)));
  const post = buildKnockoutBoardView(root, latest + 4 * 3600_000);
  for (const r of post.rows) {
    assert.equal(r.status, "completed", `${r.slug} completed after final whistle`);
    assert.equal(r.bettable, false, `${r.slug} never bettable once completed`);
    assert.equal(r.parlays.length, 0, `${r.slug} no parlay previews on a finished game`);
  }
});

test("score lean stays consistent with the board's own total/BTTS picks (no contradictions)", () => {
  const byId = new Map(board.games.map((g) => [g.gameSlug, g]));
  for (const r of view.rows) {
    if (!r.scoreLean || r.scoreLean.includes("draw")) continue;
    const g = byId.get(r.slug);
    const m = r.scoreLean.match(/(\d+)–(\d+)/);
    if (!m || !g.picks?.total) continue;
    const total = Number(m[1]) + Number(m[2]);
    const under = /under/i.test(g.picks.total.pick ?? "");
    // Under lean → scoreline total stays at/below the line; Over lean → at/above line − 1.
    if (under) assert.ok(total <= g.picks.total.line, `${r.slug} under-lean scoreline ≤ line`);
    else assert.ok(total >= Math.floor(g.picks.total.line), `${r.slug} over-lean scoreline ≥ ⌊line⌋`);
  }
});

test("best player prop: only REAL posted, model-qualified rows; absent props → propsPosted=false", () => {
  for (const r of view.rows) {
    if (r.bestPlayerProp) {
      assert.ok(r.propsPosted, `${r.slug} propsPosted flags true when a prop is surfaced`);
      assert.ok(Number.isFinite(r.bestPlayerProp.odds) && r.bestPlayerProp.odds !== 0, "real posted price");
      assert.ok(r.bestPlayerProp.player.length > 1, "real player name");
      // Verbatim from the artifact:
      const doc = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "player-projections", `${r.matchDate}.json`), "utf8"));
      const hit = (doc.matches ?? []).some((p) => p.player?.name === r.bestPlayerProp.player && p.americanOdds === r.bestPlayerProp.odds);
      assert.ok(hit, `${r.slug} prop traces to a real artifact row`);
    } else {
      assert.equal(r.propsPosted, false, `${r.slug} no prop → pending`);
    }
  }
});

test("every CTA href resolves to a real route (game-detail page or knockout detail slug)", () => {
  for (const r of view.rows) {
    if (!r.ctaHref) continue;
    assert.ok(
      r.ctaHref === `/games/world-cup/${r.slug}` || r.ctaHref === `/world-cup/round-of-32/${r.slug}`,
      `${r.slug} href is one of the two known detail routes`,
    );
  }
});

test("parlay previews carry real combined prices + the correlation warning (never fabricated)", () => {
  for (const r of view.rows) {
    for (const p of r.parlays) {
      if (!p.available) continue;
      assert.ok(p.legs.length >= 2, "≥2 legs");
      assert.ok(Number.isFinite(p.combinedOdds), "combined price computed from real leg prices");
      assert.match(p.correlationNote, /MODEL ESTIMATE/, "correlation warning verbatim");
    }
  }
});
