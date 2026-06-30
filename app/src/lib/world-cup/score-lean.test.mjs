/**
 * Model-implied score lean + Knockout Risk — derived ONLY from the board's real market picks (never
 * fabricated). Synthetic fixtures exercise the derivation rules; not real results, never written anywhere.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { deriveScoreLean, knockoutRisk } from "./round-of-32.ts";

const game = (home, away, ml, total, btts, status = "live_odds") => ({
  eventId: "1", home, away, kickoffUtc: "2026-07-01T18:00:00Z", kickoffEt: "x", matchDate: "2026-07-01",
  homeCode: null, awayCode: null, gameSlug: "x", status, confidence: "Solid", note: null,
  picks: { bookmaker: "x", moneyline: ml, total, btts },
});
const ml = (pick, side, h, d, a) => ({ pick, side, americanOdds: -200, modelProbability: side === "home" ? h : a, home: h, draw: d, away: a });

test("score lean: strong favourite + Under + BTTS No → favourite keeps the underdog off (e.g. 2–0)", () => {
  const g = game("France", "Sweden", ml("France", "home", 0.76, 0.16, 0.08), { pick: "Under 3.5", line: 3.5, americanOdds: -167, modelProbability: 0.59 }, { pick: "BTTS No", modelProbability: 0.52 });
  const s = deriveScoreLean(g);
  assert.equal(s.available, true);
  assert.equal(s.homeGoals, 2); assert.equal(s.awayGoals, 0);
  assert.match(s.scoreLean, /France 2–0 Sweden/);
  assert.equal(s.confidence, "High");
  assert.match(s.explanation, /favourite control/);
});

test("score lean: draw is the most likely 90' outcome → a labelled draw lean, never a fake winner", () => {
  const g = game("Mexico", "Ecuador", ml("Mexico", "home", 0.36, 0.34, 0.30), { pick: "Over 2.5", line: 2.5, americanOdds: 120, modelProbability: 0.52 }, { pick: "BTTS Yes", modelProbability: 0.55 });
  const s = deriveScoreLean(g);
  assert.match(s.scoreLean, /draw lean/);
  assert.equal(s.homeGoals, s.awayGoals, "draw scoreline is symmetric");
  assert.ok(s.homeGoals >= 1, "BTTS Yes draw lean is at least 1–1, never 0–0");
  assert.equal(s.confidence, "Low");
});

test("score lean: NO totals market → honest 'score lean limited', never an invented scoreline", () => {
  const g = game("USA", "Bosnia", ml("USA", "home", 0.62, 0.22, 0.16), undefined, { pick: "BTTS No", modelProbability: 0.5 });
  const s = deriveScoreLean(g);
  assert.equal(s.available, false);
  assert.equal(s.scoreLean, null, "no fabricated score without a totals market");
  assert.match(s.note, /totals market unavailable/i);
});

test("knockout risk: high 90' draw probability + tight moneyline → High (the Germany/Netherlands trap)", () => {
  const tight = game("Portugal", "Croatia", ml("Portugal", "home", 0.52, 0.28, 0.20), { pick: "Under 2.5", line: 2.5, americanOdds: -120, modelProbability: 0.55 }, { pick: "BTTS No", modelProbability: 0.53 });
  assert.equal(knockoutRisk(tight).label, "High");
  assert.match(knockoutRisk(tight).reason, /draw chance/);
  const dominant = game("England", "DR Congo", ml("England", "home", 0.82, 0.12, 0.06), { pick: "Over 2.5", line: 2.5, americanOdds: -140, modelProbability: 0.6 }, { pick: "BTTS No", modelProbability: 0.5 });
  assert.equal(knockoutRisk(dominant).label, "Low");
});

test("no live moneyline → score lean + knockout risk fail closed (no fabrication)", () => {
  const g = game("TBD", "TBD", undefined, undefined, undefined, "odds_pending");
  assert.equal(deriveScoreLean(g).available, false);
  assert.equal(knockoutRisk(g), null);
});
