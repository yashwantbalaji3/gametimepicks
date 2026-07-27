/**
 * Legacy Game Center convergence guards (Sprint 031 · Phase 1).
 *
 * Two obligations, and they pull in opposite directions:
 *
 *   1. PARITY — on a current slate the adapter must reproduce the legacy builder's numbers exactly.
 *      Without this, "convergence" silently changes what three existing components render.
 *   2. DIVERGENCE — on a stale snapshot the adapter must REFUSE where the legacy builder happily
 *      returned numbers. That difference is the entire reason for the change.
 *
 * A test suite that only checked parity would pass with the freshness gate deleted.
 *
 * Run: npx tsx --test src/lib/markets/game-center-adapter.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { gameCenterFromIntelligence } from "./game-center-adapter.ts";
import { buildGameIntelligence } from "./game-intelligence.ts";
import { buildMlbGameCenter, getTeamMarketsForDate, latestTeamMarketsDate } from "../mlb-team-markets.ts";

const APP = path.resolve(process.cwd());
const DATA = path.join(APP, "public", "data", "mlb");

const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

const DATE = latestTeamMarketsDate();
const artifact = DATE ? getTeamMarketsForDate(DATE) : null;
const board = DATE ? readJson(path.join(DATA, `boards/${DATE}.json`)) : null;
const sims = DATE ? readJson(path.join(DATA, `full-game-simulations/${DATE}.json`)) : null;

/** Build canonical intelligence for one book game, at a chosen reference date. */
function intelFor(book, todayEt) {
  const pkByGameId = new Map();
  for (const l of board?.leans ?? []) {
    if (l.gameId && l.gamePk != null) pkByGameId.set(l.gameId, l.gamePk);
  }
  const gamePk = pkByGameId.get(book.gameId) ?? null;
  const sim = (sims?.games ?? []).find((g) => g.gamePk === gamePk) ?? null;
  return buildGameIntelligence({
    book,
    sim,
    gamePk,
    artifact: { date: artifact?.date ?? null, generatedAt: artifact?.generatedAt ?? null },
    todayEt,
    nowIso: `${todayEt}T17:00:00Z`,
  });
}

test("the adapter reproduces the legacy builder exactly on a current slate", () => {
  assert.ok(DATE && artifact, "a team-markets artifact must exist");
  const games = Object.values(artifact.games ?? {});
  assert.ok(games.length > 0);

  let compared = 0;
  for (const book of games) {
    const legacy = buildMlbGameCenter(book);
    const adapted = gameCenterFromIntelligence(intelFor(book, DATE), artifact.source ?? null);
    if (!legacy) continue;
    compared += 1;

    assert.ok(adapted, `${book.gameId}: adapter must not drop a game the legacy builder rendered`);
    assert.deepEqual(adapted.moneyline, legacy.moneyline, `${book.gameId} moneyline`);
    assert.deepEqual(adapted.total, legacy.total, `${book.gameId} total`);
    assert.deepEqual(adapted.runLine, legacy.runLine, `${book.gameId} run line`);
    assert.equal(adapted.homeTeam, legacy.homeTeam);
    assert.equal(adapted.awayTeam, legacy.awayTeam);
    assert.equal(adapted.firstPitch, legacy.firstPitch);
    assert.equal(adapted.method, legacy.method);
    assert.deepEqual(adapted.unavailable, legacy.unavailable, `${book.gameId} disclosure preserved`);
  }
  assert.ok(compared > 0, "at least one real game must be compared");
});

test("the adapter REFUSES a stale snapshot where the legacy builder did not", () => {
  const games = Object.values(artifact.games ?? {});
  const book = games[0];

  // Judged against a later date, the snapshot is no longer current for that frame.
  const nextWeek = "2026-08-05";
  const stale = intelFor(book, nextWeek);
  assert.equal(stale.moneyline.intelligence.hasSportsbook, false, "the canonical layer withholds it");

  const adapted = gameCenterFromIntelligence(stale, artifact.source ?? null);
  assert.equal(adapted, null, "a stale snapshot must not render as the current market");

  // The legacy builder, by contrast, has no freshness concept at all — this is the defect being
  // removed, asserted rather than described.
  const legacy = buildMlbGameCenter(book);
  assert.ok(legacy, "the legacy builder happily returns a stale snapshot as current");
  assert.ok(legacy.moneyline, "…including live-looking probabilities");
});

test("a null or empty intelligence object yields no Game Center", () => {
  assert.equal(gameCenterFromIntelligence(null, "x"), null);
  assert.equal(gameCenterFromIntelligence(undefined, "x"), null);
});

test("no production code constructs a Game Center from the raw artifact any more", () => {
  const detail = fs.readFileSync(path.join(APP, "src/lib/game-detail.ts"), "utf8");
  assert.ok(
    !detail.includes("getMlbGameCenter("),
    "game-detail must derive the legacy shape from canonical intelligence, not re-read the artifact",
  );
  assert.ok(detail.includes("gameCenterFromIntelligence("), "…via the adapter");
});

test("the adapter derives no sign convention of its own", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/markets/game-center-adapter.ts"), "utf8");
  for (const banned of ["homeCover(", "awayCover(", "runDifferential", "1 - away", "Math.abs(signedHomeLine"]) {
    assert.ok(!src.includes(banned), `run-line semantics must stay in the canonical builder: "${banned}"`);
  }
});

test("the adapter performs no probability math", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/markets/game-center-adapter.ts"), "utf8");
  for (const banned of ["americanToImplied", "noVigTwoWay", "impliedFromPrice", "/ (1 +"]) {
    assert.ok(!src.includes(banned), `probability math must not reappear here: "${banned}"`);
  }
});

test("a market missing its price is withheld rather than rendered without one", () => {
  const games = Object.values(artifact.games ?? {});
  const book = JSON.parse(JSON.stringify(games[0]));
  book.moneyline.home.odds = null;
  const adapted = gameCenterFromIntelligence(intelFor(book, DATE), null);
  // Either the whole object is gone or the moneyline specifically is — never a probability with no
  // traceable price beside it.
  assert.ok(!adapted || adapted.moneyline === null, "a price-less market must not render");
});
