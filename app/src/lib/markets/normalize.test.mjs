/**
 * CANONICAL MARKET NORMALIZATION — fail-closed contract (Sprint 028 · Phase 1).
 *
 * Two halves:
 *   1. Adversarial unit cases on synthetic payloads — the states a provider WILL eventually send.
 *   2. A round trip over the real live artifacts, so the normalizer is proven against production
 *      data and not only against fixtures I wrote to match my own assumptions.
 *
 * Run: npx tsx --test src/lib/markets/normalize.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { normalizeGameMarkets, normalizePlayerMarkets } from "./normalize.ts";
import { PLAYER_FAMILY_BY_PROVIDER_KEY, PROVIDER_KEY_BY_PLAYER_FAMILY, isUsable } from "./types.ts";

const PUB = path.join(process.cwd(), "public", "data");
const newestIn = (rel) => {
  const dir = path.join(PUB, rel);
  const f = fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().at(-1);
  return { date: f.replace(".json", ""), json: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) };
};

const gameArtifact = (over) => ({
  sport: "mlb",
  date: "2026-07-26",
  generatedAt: "2026-07-26T15:31:34.406Z",
  bookmaker: "draftkings",
  games: { g1: { gameId: "g1", homeTeam: "H", awayTeam: "A", commenceTime: "2026-07-26T16:16:00Z", ...over } },
});

// ── adversarial: fail-closed ────────────────────────────────────────────────

test("an unknown player market family fails closed as UNSUPPORTED, never guessed", () => {
  const out = normalizePlayerMarkets(
    { date: "2026-07-26", props: [{ player: "X", gameId: "g1", market: "batter_stolen_bases", selection: "Over 0.5", point: 0.5, americanOdds: -110 }] },
    "ref",
  );
  assert.equal(out.length, 1, "the row is kept so an unsupported family is visible, not vanished");
  assert.equal(out[0].status, "UNSUPPORTED");
  assert.equal(out[0].family, null, "no canonical family may be borrowed for an unmodeled market");
  assert.equal(out[0].providerFamily, "batter_stolen_bases", "the provider's own string is preserved");
  assert.equal(isUsable(out[0]), false);
});

test("a missing line stays null — never coerced to 0", () => {
  // A 0.0 total would render as a real market. This is the single most dangerous coercion here.
  const [total] = normalizeGameMarkets(gameArtifact({ total: { over: { odds: -110 }, under: { odds: -110 } } }), "ref");
  assert.equal(total.family, "TOTAL");
  assert.equal(total.line, null, "absent total line must be null");
  assert.notEqual(total.line, 0);

  const props = normalizePlayerMarkets(
    { props: [{ player: "X", gameId: "g1", market: "batter_hits", selection: "Over", americanOdds: -110 }] },
    "ref",
  );
  assert.equal(props[0].line, null, "absent prop point must be null");
});

test("malformed odds do not silently coerce", () => {
  const cases = [
    ["string price", { odds: "-110" }],
    ["null price", { odds: null }],
    ["zero price", { odds: 0 }], // 0 is not a valid American price
    ["NaN price", { odds: Number.NaN }],
    ["Infinity price", { odds: Number.POSITIVE_INFINITY }],
  ];
  for (const [label, home] of cases) {
    const [ml] = normalizeGameMarkets(gameArtifact({ moneyline: { home, away: { odds: null } } }), "ref");
    assert.equal(ml.prices[0].americanOdds, null, `${label}: price must be null`);
    assert.notEqual(ml.prices[0].americanOdds, 0, `${label}: must not become 0`);
    assert.equal(ml.status, "MALFORMED", `${label}: market must fail closed`);
    assert.equal(isUsable(ml), false, `${label}: must not be usable`);
  }
});

test("a market with no event identity is not published", () => {
  const out = normalizeGameMarkets(
    { games: { g1: { homeTeam: "H", awayTeam: "A", moneyline: { home: { odds: -110 }, away: { odds: 100 } } } } },
    "ref",
  );
  assert.deepEqual(out, [], "a game without a gameId cannot be attached to anything");
});

test("an unattributed prop reports UNRESOLVED — team is never inferred", () => {
  const [p] = normalizePlayerMarkets(
    { props: [{ player: "Parker Messick", gameId: "g1", matchup: "Cleveland Guardians @ Tampa Bay Rays", market: "pitcher_outs", selection: "Over 17.5", point: 17.5, americanOdds: -120 }] },
    "ref",
  );
  assert.equal(p.team, null, "team must stay null");
  assert.equal(p.mapping, "UNRESOLVED", "and the mapping state must say why");
  // The matchup string names two teams. Guessing one from it would be a coin flip dressed as data.
  assert.ok(!/Guardians|Rays/.test(String(p.team)), "no team may be parsed out of the matchup string");
});

test("probabilities are carried through, never invented", () => {
  const [ml] = normalizeGameMarkets(
    gameArtifact({ moneyline: { home: { odds: -125, impliedProb: 0.5556, noVigProb: 0.5313 }, away: { odds: 104 } } }),
    "ref",
  );
  assert.equal(ml.prices[0].impliedProb, 0.5556, "existing impliedProb is preserved exactly");
  assert.equal(ml.prices[0].noVigProb, 0.5313, "existing noVigProb is preserved exactly");
  // The away side has a price but no probabilities in the payload — none may be conjured for it.
  assert.equal(ml.prices[1].americanOdds, 104);
  assert.equal(ml.prices[1].impliedProb, null, "a missing probability stays missing");
  assert.equal(ml.prices[1].noVigProb, null);
});

test("the domain cannot express an opening line, movement, or a team total", () => {
  // Absence enforced by the type, not by discipline. If a provider starts sending these, the
  // normalizer drops them until the domain is deliberately extended.
  const [ml] = normalizeGameMarkets(
    gameArtifact({ moneyline: { home: { odds: -125 }, away: { odds: 104 } }, teamTotal: { line: 4.5 }, openingLine: -140 }),
    "ref",
  );
  assert.ok(!("openingLine" in ml), "no opening line on a canonical market");
  assert.ok(!("movement" in ml), "no movement on a canonical market");
  assert.ok(!("teamTotal" in ml), "no team total on a canonical market");
  const families = normalizeGameMarkets(
    gameArtifact({ moneyline: { home: { odds: -125 }, away: { odds: 104 } }, teamTotal: { line: 4.5 } }),
    "ref",
  ).map((m) => m.family);
  assert.deepEqual(families, ["MONEYLINE"], "a teamTotal block produces no market");
});

test("family key maps round-trip", () => {
  for (const [providerKey, family] of Object.entries(PLAYER_FAMILY_BY_PROVIDER_KEY)) {
    assert.equal(PROVIDER_KEY_BY_PLAYER_FAMILY[family], providerKey, `${family} must map back to ${providerKey}`);
  }
});

// ── round trip over the REAL live artifacts ─────────────────────────────────

test("normalizes the live team-markets artifact into exactly the three evidenced families", () => {
  const { date, json } = newestIn("mlb/team-markets");
  const markets = normalizeGameMarkets(json, `app/public/data/mlb/team-markets/${date}.json`, date);
  const gameCount = Object.keys(json.games ?? {}).length;

  assert.equal(markets.length, gameCount * 3, "three families per game");
  assert.deepEqual(
    [...new Set(markets.map((m) => m.family))].sort(),
    ["MONEYLINE", "RUN_LINE", "TOTAL"],
    "exactly the families the artifact evidences",
  );
  assert.ok(markets.every((m) => m.status === "OK"), "every live market must be usable");
  assert.ok(markets.every((m) => m.mapping === "EXACT"), "game markets name both teams");
  assert.ok(markets.every((m) => m.provenance.artifactGeneratedAt), "artifact timestamp carried");
  assert.ok(markets.every((m) => m.provenance.book), "book identity carried");
  // Every TOTAL and RUN_LINE in the live data has a real line; MONEYLINE has none by definition.
  for (const m of markets) {
    if (m.family === "MONEYLINE") assert.equal(m.line, null);
    else assert.equal(typeof m.line, "number", `${m.family} must carry a numeric line`);
  }
});

test("normalizes every live prop row, including families with no model", () => {
  const { date, json } = newestIn("mlb/player-props");
  const markets = normalizePlayerMarkets(json, `app/public/data/mlb/player-props/${date}.json`, date);

  assert.equal(markets.length, json.props.length, "no live prop row is dropped");
  assert.ok(markets.every((m) => m.status === "OK"), "every live prop normalizes cleanly");
  // Normalization is independent of pairability: EVERY family the provider actually posted must
  // normalize. Pinning the absolute count (was: exactly 8) made this test a weather report — the
  // provider posts 7 or 8 families depending on the slate, and on 2026-08-03 it posted 7
  // (no batter_runs_scored), turning an external-state condition into a red suite. The invariant
  // that matters is "no family present in the artifact is dropped or unknown", which still fails
  // loudly if normalization regresses.
  const KNOWN_FAMILIES = new Set([
    "batter_hits", "batter_home_runs", "batter_rbis", "batter_runs_scored",
    "batter_total_bases", "pitcher_earned_runs", "pitcher_outs", "pitcher_strikeouts",
  ]);
  const posted = new Set(json.props.map((p) => p.market));
  const normalized = new Set(markets.map((m) => m.family));
  assert.equal(normalized.size, posted.size, "every posted provider family normalizes (none dropped)");
  for (const f of posted) assert.ok(KNOWN_FAMILIES.has(f), `unknown provider family appeared: ${f}`);
  assert.ok(posted.size >= 5, `only ${posted.size} families posted — that is a coverage collapse, not a slate`);
  // And the measured reality from the coverage matrix still holds through the domain layer.
  assert.ok(markets.every((m) => m.mapping === "UNRESOLVED"), "every live prop is unattributed today");
  assert.ok(markets.every((m) => m.prices[0].impliedProb === null), "props carry no probabilities");
  assert.ok(markets.every((m) => m.provenance.artifactGeneratedAt), "artifact timestamp carried");
});
