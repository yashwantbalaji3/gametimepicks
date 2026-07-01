/**
 * Unified game-script engine — one coherent score + total + BTTS read per fixture, derived ONLY from the
 * board's real market picks (never fabricated). Synthetic fixtures exercise the coherence + conflict rules.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { deriveGameScript } from "./game-script.ts";

const game = (home, away, ml, total, btts) => ({
  home, away,
  picks: { bookmaker: "x", moneyline: ml, ...(total ? { total } : {}), ...(btts ? { btts } : {}) },
});
const ml = (pick, side, h, d, a) => ({ pick, side, americanOdds: -200, modelProbability: side === "home" ? h : a, home: h, draw: d, away: a });
const tot = (pick, line, prob = 0.58) => ({ pick, line, americanOdds: -140, modelProbability: prob });
const btts = (pick, prob = 0.55) => ({ pick, modelProbability: prob });

test("strong favourite + Over + BTTS No → clean-sheet multi-goal win (2–0 / 3–0), coherent", () => {
  const g = game("England", "DR Congo", ml("England", "home", 0.76, 0.16, 0.08), tot("Over 2.5", 2.5, 0.6), btts("BTTS No"));
  const s = deriveGameScript(g);
  assert.equal(s.available, true);
  assert.equal(s.winner, "England");
  assert.ok(s.homeGoals >= 2 && s.awayGoals === 0, `expected 2+–0, got ${s.homeGoals}–${s.awayGoals}`);
  assert.equal(s.totalLean, "Over 2.5");
  assert.equal(s.bttsLean, "BTTS No");
  assert.equal(s.conflictWarning, null, "Over + BTTS No + clean multi-goal win is NOT a conflict");
  assert.match(s.explanation, /Model score lean: England 3–0 DR Congo\. This aligns with/);
});

test("BTTS Yes + Over → both teams score, high-event scoreline (2–1 / 3–1 type)", () => {
  const g = game("Mexico", "Ecuador", ml("Mexico", "home", 0.55, 0.24, 0.21), tot("Over 2.5", 2.5, 0.56), btts("BTTS Yes"));
  const s = deriveGameScript(g);
  assert.ok(s.homeGoals > 0 && s.awayGoals > 0, `BTTS Yes ⇒ both score, got ${s.homeGoals}–${s.awayGoals}`);
  assert.equal(s.conflictWarning, null);
  assert.equal(s.bttsLean, "BTTS Yes");
});

test("high draw risk + Under → 1–1 / 0–0 draw lean, Low confidence", () => {
  const g = game("Belgium", "Senegal", ml("Belgium", "home", 0.44, 0.30, 0.26), tot("Under 2.5", 2.5, 0.57), btts("BTTS Yes"));
  const s = deriveGameScript(g);
  assert.equal(s.winner, "Draw");
  assert.equal(s.homeGoals, s.awayGoals, "draw scoreline is symmetric");
  assert.ok(s.homeGoals <= 1, "low-scoring draw");
  assert.equal(s.confidence, "Low");
  assert.match(s.scoreLean, /draw lean/);
});

test("NO totals market + strong favourite + BTTS No → directional clean-sheet lean, NOT null", () => {
  const g = game("USA", "Bosnia & Herzegovina", ml("USA", "home", 0.71, 0.19, 0.11), undefined, btts("BTTS No"));
  const s = deriveGameScript(g);
  assert.equal(s.available, true, "score read must still be available with no totals market");
  assert.notEqual(s.scoreLean, null, "never blank — a directional lean instead");
  assert.match(s.scoreLean, /USA/);
  assert.match(s.scoreLean, /clean-sheet/);
  assert.equal(s.totalOffered, false);
  assert.equal(s.totalLean, null);
  assert.match(s.explanation, /no totals market offered yet/);
  assert.equal(s.winner, "USA");
});

test("conflict detection: Over line vs a scoreline that can't reach it → warning + capped confidence", () => {
  // Under-ish scoreline but the total pick says Over 3.5 — the derived 2–0 can't satisfy Over 3.5.
  const g = game("Spain", "Austria", ml("Spain", "home", 0.7, 0.18, 0.12), tot("Over 3.5", 3.5, 0.52), btts("BTTS No"));
  const s = deriveGameScript(g);
  if (s.homeGoals + s.awayGoals < 3.5) {
    assert.notEqual(s.conflictWarning, null, "must surface the scoreline-vs-total conflict");
    assert.notEqual(s.confidence, "High", "a real conflict caps confidence");
  }
});

test("no moneyline → unavailable, never fabricated", () => {
  const g = { home: "TBD", away: "TBD", picks: null };
  const s = deriveGameScript(g);
  assert.equal(s.available, false);
  assert.equal(s.scoreLean, null);
  assert.equal(s.winner, null);
});

test("explanation always ties the three markets together when present", () => {
  const g = game("Portugal", "Croatia", ml("Portugal", "home", 0.52, 0.28, 0.20), tot("Under 2.5", 2.5, 0.55), btts("BTTS No"));
  const s = deriveGameScript(g);
  assert.match(s.explanation, /win in 90'|draw/);
  assert.match(s.explanation, /Under 2\.5|totals/);
  assert.match(s.explanation, /BTTS No|scoresheet/);
});
