/**
 * World Cup odds-backed projections contract (Odds API upgrade). Validates the
 * generated artifacts so the multi-market expansion stays honest: 3-way moneyline
 * de-vig sums to ~1, double chance uses REAL book odds + a derived model prob,
 * every market projection is odds-backed (provider + bookmaker + price), and
 * player props are FAILED CLOSED (no stale data).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const DIR = new URL("../../../public/data/world-cup/", import.meta.url);
const proj = JSON.parse(fs.readFileSync(new URL("projections/latest.json", DIR), "utf8"));
const players = JSON.parse(fs.readFileSync(new URL("player-projections/latest.json", DIR), "utf8"));

test("projections artifact is odds-backed, limited-data, dated", () => {
  assert.equal(proj.provider, "odds_api");
  assert.equal(proj.dataQuality, "limited");
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(proj.date), "has an ISO date");
  assert.ok(Array.isArray(proj.matches) && proj.matches.length > 0, "has market projections");
});

test("every market projection is odds-backed (provider + bookmaker + a real price)", () => {
  for (const m of proj.matches) {
    assert.equal(m.provider, "odds_api", `${m.id} provider`);
    assert.ok(m.bookmaker, `${m.id} names the sportsbook`);
    assert.ok(typeof m.americanOdds === "number" && m.americanOdds !== 0, `${m.id} has a real price`);
    assert.equal(m.dataQuality, "limited");
  }
});

test("3-way moneyline de-vig sums to ~1 with a real Draw outcome", () => {
  const mls = proj.matches.filter((m) => m.market === "moneyline_90");
  assert.ok(mls.length > 0, "has moneyline projections");
  for (const m of mls) {
    assert.equal(m.outcomes.length, 3, "home/draw/away");
    const draw = m.outcomes.find((o) => o.side === "draw");
    assert.ok(draw, "draw is a real outcome");
    const sum = m.outcomes.reduce((a, o) => a + o.modelProbability, 0);
    assert.ok(Math.abs(sum - 1) < 0.02, `3-way no-vig sums to ~1 (got ${sum})`);
  }
});

test("double chance uses REAL book odds + model probs from the 3-way (not fabricated)", () => {
  const dcs = proj.matches.filter((m) => m.market === "double_chance");
  if (dcs.length === 0) return; // honest: only when the book prices it
  for (const m of dcs) {
    assert.equal(m.outcomes.length, 3, "1X / X2 / 12");
    for (const o of m.outcomes) {
      assert.ok(typeof o.americanOdds === "number" && o.americanOdds !== 0, "DC outcome has a real book price");
      assert.ok(o.modelProbability > 0 && o.marketProbability > 0, "DC has model + market probs");
    }
    // double-chance covers 2 of 3 outcomes → each model prob is high-ish
    assert.ok(m.modelProbability > 0.3, "DC pick prob is meaningful");
  }
});

test("player props are FAILED CLOSED — no stale data", () => {
  assert.equal(players.projectionCount, 0, "no player props shown");
  assert.ok(/unavailable/i.test(players.status ?? ""), "status marks unavailable");
  assert.ok(/API[-_ ]?Football/i.test(players.disclaimer ?? ""), "explains the API-Football gap");
  assert.equal(players.date, proj.date, "player-props artifact is current-dated (not stale June 12)");
  assert.deepEqual(players.matches, [], "no stale player rows");
});

test("no banned copy in WC projection caveats/notes", () => {
  const banned = /\b(lock|safe|safest|guaranteed|guarantee|sure thing|free money|risk-free)\b/i;
  const text = JSON.stringify(proj) + JSON.stringify(players);
  assert.ok(!banned.test(text), "no banned outcome-promise copy");
});
