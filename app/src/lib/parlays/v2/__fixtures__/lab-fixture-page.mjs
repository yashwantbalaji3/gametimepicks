/**
 * DEV FIXTURE ONLY — the render model for /dev/parlay-lab-fixture (and e2e/parlay-lab-v2.spec.ts).
 *
 * FIXTURE — not real picks, not real prices. Every game, player, team and price is invented. The models are built by
 * the REAL adapter (../recommend.mjs recommendTiers) over fixture cards, with the fixture operator allowlist injected
 * (production stays closed: ../operators.mjs) at the fixed fixture clock NOW = 2026-10-19T18:00:00Z, so the board
 * renders exactly what /build would render for these inputs. Server-only (the adapter reads the capability registry);
 * the page passes the resulting plain JSON to the client.
 *
 *   qualified   High: one QUALIFIED two-leg card (distinct games, verified books, fresh). Medium: a same-game card is
 *               withheld (D5). Low: a stale-price card is withheld. Longshot: nothing published.
 *   none        the same day with every card failing a gate — four NO QUALIFYING PARLAY tiers with reasons.
 *   addable     legs the fixture page offers to ADD to the slip: one from a new game, one from the same game as the
 *               qualified card's first leg (to show the same-game message).
 */
import { recommendTiers } from "../recommend.mjs";
import { BOOK_AVAILABILITY_NOTE } from "../operators.mjs";
import { NOW, iso, MIN, HOUR, COVERAGE, leg, card, injectedEligible, PR1130_ELIGIBLE_OPERATOR_KEYS, PR1130_ELIGIBLE_TITLES } from "./v2-fixtures.mjs";

export const FIXTURE_PAGE_LABEL = "FIXTURE — not real picks, not real prices";
export const FIXTURE_NOW = NOW;
/** The allowlist the page injects into the slip (passed to the client as data, never imported there). */
export const FIXTURE_ALLOWED_OPERATORS = Object.freeze([...PR1130_ELIGIBLE_OPERATOR_KEYS, ...PR1130_ELIGIBLE_TITLES]);

const fxLeg = (n, over = {}) => leg({
  eventId: `fixture-game-${n}`, eventLabel: `Fixture Visitors ${n} @ Fixture Hosts ${n}`,
  participant: `Fixture Pitcher ${n}`, selection: `Fixture Pitcher ${n} — Outs recorded Over`, team: `FX${n}`,
  receipts: ["fixture:parlay-lab-v2"], ...over,
});

function cards() {
  const qualified = card({ cardId: "fixture-high-1", tier: "high" }, [
    fxLeg(1),
    fxLeg(2, { market: "h2h", marketLabel: "Moneyline", side: "home", line: null, participant: null, team: "Fixture Hosts 2", selection: "Fixture Hosts 2 — Moneyline home", price: 120, book: "FanDuel" }),
  ]);
  const sameGame = card({ cardId: "fixture-medium-same-game", tier: "medium" }, [
    fxLeg(3, { price: 105 }),
    fxLeg(3, { participant: "Fixture Closer 3", selection: "Fixture Closer 3 — Outs recorded Over", line: 3.5, price: -120, team: "FX3b" }),
  ]);
  const stale = card({ cardId: "fixture-low-stale", tier: "low" }, [
    fxLeg(4, { price: -250, capturedAt: iso(-13 * HOUR) }),
    fxLeg(5, { price: -240 }),
  ]);
  return { qualified, sameGame, stale };
}

const toModel = (rec) => ({
  version: rec.version,
  slateDate: FIXTURE_NOW.slice(0, 10),
  evaluatedAt: rec.evaluatedAt,
  operatorSeam: rec.operatorSeam,
  availabilityNote: BOOK_AVAILABILITY_NOTE,
  tiers: rec.tiers.map((t) => ({ ...t, history: null })),
  rejectedCount: rec.rejected.length,
});

export function buildFixtureModels() {
  const c = cards();
  const run = (candidates) => recommendTiers({ candidates, now: FIXTURE_NOW, coverage: COVERAGE, isVerifiedOperator: injectedEligible });
  const qualified = toModel(run([c.qualified, c.sameGame, c.stale]));
  // The "none" day: the qualified card's second leg now starts inside the 30-minute cutoff, so nothing clears.
  const lateStart = card({ cardId: "fixture-high-late", tier: "high" }, [fxLeg(6), fxLeg(7, { startUtc: iso(20 * MIN) })]);
  const none = toModel(run([lateStart, c.sameGame, c.stale]));
  const q = c.qualified.legs[0];
  const addable = [
    { id: "new-game", label: "Add a leg from another game", leg: { sport: "mlb", eventId: "fixture-game-8", game: "Fixture Visitors 8 @ Fixture Hosts 8", market: "pitcher_outs", selection: "Fixture Pitcher 8 — Outs recorded Over", line: 14.5, book: "BetMGM", price: -105, capturedAt: iso(-4 * MIN) } },
    { id: "same-game", label: "Add a leg from the same game as leg 1", leg: { sport: "mlb", eventId: q.eventId, game: q.eventLabel, market: "pitcher_strikeouts_fixture", selection: "Fixture Catcher 1 — Strikeouts Under", line: 4.5, book: "DraftKings", price: -110, capturedAt: iso(-4 * MIN) } },
  ];
  return { qualified, none, addable };
}
