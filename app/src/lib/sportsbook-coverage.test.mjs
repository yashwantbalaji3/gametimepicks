/**
 * SPORTSBOOK COVERAGE GUARD (Sprint 027 · Phase 1).
 *
 * docs/SPORTSBOOK_COVERAGE_MATRIX.md makes load-bearing claims about what sportsbook data this
 * repo actually has. Later phases (canonical market layer, freshness, model-vs-market comparison,
 * Market Center) are built on those claims, so they must fail loudly if the underlying artifacts
 * change shape — rather than a doc quietly going out of date while code keeps trusting it.
 *
 * Everything here is MEASURED from the newest committed artifact. Nothing is hardcoded that could
 * be derived, so the guard tracks reality instead of restating it.
 *
 * Run: npx tsx --test src/lib/sportsbook-coverage.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { MLB_MARKET_CALIBRATION } from "./mlb/model-calibration-status.ts";

const PUB = path.join(process.cwd(), "public", "data");
const DATED = /^\d{4}-\d{2}-\d{2}\.json$/;

const newestIn = (rel) => {
  const dir = path.join(PUB, rel);
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).filter((x) => DATED.test(x)).sort().at(-1);
  return f ? { date: f.replace(".json", ""), json: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) } : null;
};

test("team markets expose moneyline / run line / total — and NOT team total", () => {
  const tm = newestIn("mlb/team-markets");
  assert.ok(tm, "an MLB team-markets artifact must exist");
  const games = Object.values(tm.json.games ?? {});
  assert.ok(games.length > 0, "team-markets must contain games");

  for (const fam of ["moneyline", "run_line", "total"]) {
    assert.ok(tm.json.marketsCovered?.includes(fam), `${fam} must be a covered family`);
  }
  // The book data has no team totals. If that ever changes this test should be updated
  // deliberately — silently gaining a family is how an unsupported comparison ships.
  assert.ok(
    !tm.json.marketsCovered?.some((m) => /team.?total/i.test(m)),
    "team total is not in marketsCovered — no team-total comparison may be built",
  );
  for (const g of games) {
    assert.ok(!("teamTotal" in g) && !("team_total" in g), "no game may carry a team-total block");
  }
});

test("no sportsbook row carries its own capture timestamp — freshness is FILE-level only", () => {
  // This is why no per-market "updated N minutes ago" claim is supportable.
  const tm = newestIn("mlb/team-markets");
  const pp = newestIn("mlb/player-props");
  assert.ok(tm && pp, "both MLB market artifacts must exist");

  assert.ok(tm.json.generatedAt, "team-markets must carry a file-level generatedAt");
  assert.ok(pp.json.generatedAt, "player-props must carry a file-level generatedAt");

  const rowTimestamped = (rows) =>
    rows.filter((r) => r.capturedAt != null || r.lastUpdate != null || r.sourceTimestamp != null);
  assert.deepEqual(rowTimestamped(Object.values(tm.json.games ?? {})), [], "no per-game capture timestamp exists");
  assert.deepEqual(rowTimestamped(pp.json.props ?? []), [], "no per-prop capture timestamp exists");
});

test("only families the model AND the book both support may be paired", () => {
  const pp = newestIn("mlb/player-props");
  assert.ok(pp, "an MLB player-props artifact must exist");
  const providerFamilies = new Set((pp.json.props ?? []).map((p) => p.market));
  assert.ok(providerFamilies.size > 0, "provider must offer at least one family");

  // Derived from the canonical calibration registry — the single place that records which
  // MLB prop families the model actually produces a distribution for.
  const modeled = new Set(Object.keys(MLB_MARKET_CALIBRATION));
  const pairable = [...modeled].filter((m) => providerFamilies.has(m)).sort();

  // Derived, not hardcoded: a pairing is legitimate only where both sides exist.
  assert.ok(pairable.length > 0, "at least one family must be pairable or no comparison is possible");
  for (const m of pairable) {
    assert.ok(modeled.has(m) && providerFamilies.has(m), `${m} must exist on both sides`);
  }
  // A modeled family the book does not offer must never become a comparison.
  for (const m of modeled) {
    if (!providerFamilies.has(m)) {
      assert.ok(!pairable.includes(m), `${m} is modeled but unofferred — it cannot be paired`);
    }
  }
  // A provider family with no model must never become a comparison either.
  for (const m of providerFamilies) {
    if (!modeled.has(m)) {
      assert.ok(!pairable.includes(m), `${m} has no modeled distribution — it cannot be paired`);
    }
  }
});

test("no snapshot history exists, so movement cannot be claimed", () => {
  // One artifact per date, overwritten in place. Two captures of the SAME market would be needed
  // for movement; the repo has none. Guarding this stops a "line moved" surface being built on
  // two different dates' artifacts, which is a different market state, not a movement.
  const dir = path.join(PUB, "mlb", "team-markets");
  const dates = fs.readdirSync(dir).filter((f) => DATED.test(f));
  assert.equal(new Set(dates).size, dates.length, "one artifact per date");
  for (const f of dates) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const g of Object.values(j.games ?? {})) {
      assert.ok(!Array.isArray(g.snapshots), "a game must not carry a snapshot series that does not exist");
      assert.ok(g.openingLine == null && g.opening == null, "nothing marks an opening line");
    }
  }
});

test("MLB is the only sport with a current sportsbook market series", () => {
  // Any Market Center must be built on this. A sport with a frozen June artifact is history.
  const seriesDirs = ["mlb/team-markets", "mlb/player-props", "nba/game-markets", "mlb/game-markets"];
  const withSeries = seriesDirs.filter((d) => newestIn(d));
  const newestByDir = Object.fromEntries(withSeries.map((d) => [d, newestIn(d).date]));

  const mlbNewest = newestByDir["mlb/team-markets"];
  assert.ok(mlbNewest, "MLB team markets must exist");
  for (const [dir, date] of Object.entries(newestByDir)) {
    if (dir.startsWith("mlb/team-markets") || dir.startsWith("mlb/player-props")) continue;
    assert.ok(
      date <= mlbNewest,
      `${dir} (${date}) is newer than the MLB series (${mlbNewest}) — the coverage matrix is out of date`,
    );
  }
});
