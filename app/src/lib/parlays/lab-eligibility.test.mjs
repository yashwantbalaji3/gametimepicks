/**
 * THE SPORT GATE — eligibility is measured from artifacts, never declared.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { labEligibility } from "../../../scripts/parlays/lab-eligibility.mjs";
import { SETTLEABLE_SPORTS } from "./multi-sport.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "public", "data");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const NOW = new Date().toISOString();

test("a sport is gated on PRICES and SETTLEMENT — never on having a good model", () => {
  /*
   * Deliberate. None of our models beats a market price: MLB's was demoted to market-context after
   * failing three times, NFL's was rejected on its own bars, and this stream's backtest showed model
   * edge does not predict leg outcomes at all. Requiring a validated model would close every stream
   * including MLB's. What the Lab actually claims is narrower and portable — it quotes real posted
   * prices and grades them against an official source — and that claim is the same in every sport.
   */
  const src = read("scripts/parlays/lab-eligibility.mjs");
  assert.match(src, /PRICE_MAX_AGE_DAYS/, "prices must be current");
  assert.match(src, /settlementProven/, "settlement must be proven");
  assert.doesNotMatch(src, /brier|beatsMarket|modelEdge/i, "no model-quality term gates a sport");
});

test("depth is counted in DISTINCT GAMES, not selections", () => {
  /*
   * The first version counted priced selections at a floor of six, which passed NFL on 2 events ×
   * 5 consensus markets. The ladder builds four cards whose legs never reuse a game, so two games
   * cannot fill it — the stream would have shipped one thin card and three empty boxes.
   */
  const src = read("scripts/parlays/lab-eligibility.mjs");
  assert.match(src, /MIN_GAMES/, "the floor is expressed in games");
  assert.doesNotMatch(src, /const MIN_LEGS/, "the selection-count floor is gone");
  for (const s of labEligibility(ROOT, NOW.slice(0, 10), NOW)) {
    if (s.id === "multi") continue;
    assert.ok(Number.isInteger(s.evidence.pricedGames), `${s.id} reports distinct priced games`);
  }
});

test("a stale price capture CLOSES a sport", () => {
  /*
   * The MECHANISM, not whichever sport happens to be stale today.
   *
   * This originally used UFC as its fixture — "its last capture is well over a month old" — which
   * was true when written and became false the hour UFC's first real capture landed. A test that
   * pins today's data as its invariant fails on the day the product succeeds, which trains everyone
   * to edit the test rather than read it.
   */
  const all = labEligibility(ROOT, NOW.slice(0, 10), NOW);
  let checked = 0;
  for (const s of all) {
    const age = s.evidence?.priceAgeDays;
    if (age == null) continue;
    checked++;
    if (age > 3) {
      assert.equal(s.live, false, `${s.id} has a ${age}-day-old capture and is still open`);
      assert.match(s.blocked ?? "", /days old/, `${s.id} is closed but the reason does not name the staleness`);
    }
    // And a sport evaluated AT its own capture time is never stale — freshness is computed, never set.
    const at = s.evidence.pricesCapturedAt;
    if (at) {
      const fresh = labEligibility(ROOT, at.slice(0, 10), at).find((x) => x.id === s.id);
      assert.doesNotMatch(fresh.blocked ?? "", /days old/, `${s.id}: freshness must be evaluated, not hard-coded`);
    }
  }
  assert.ok(checked > 0, "no sport carries a price age — the eligibility evidence is not being populated");
});

test("every closed sport names WHY, in words a reader can check", () => {
  for (const s of labEligibility(ROOT, NOW.slice(0, 10), NOW)) {
    if (s.live) continue;
    assert.ok(s.blocked && s.blocked.length > 12, `${s.id} explains itself`);
    assert.doesNotMatch(s.blocked, /coming soon|pending|tbd/i, `${s.id} gives a reason, not a promise`);
  }
});

test("multi-sport opens only on TWO live sports", () => {
  // A cross-sport card drawn from one sport is just a card. Today only MLB is cleared, so the
  // stream stays shut and says which single sport is live.
  const all = labEligibility(ROOT, NOW.slice(0, 10), NOW);
  const multi = all.find((s) => s.id === "multi");
  const liveSingles = all.filter((s) => s.id !== "multi" && s.live).length;
  assert.equal(multi.live, liveSingles >= 2, "it tracks the count rather than being set by hand");
  if (!multi.live) assert.match(multi.blocked, /needs two live sports/i);
});

test("the ledger's streams come from the gate, not a hand-kept list", () => {
  const src = read("scripts/parlays/build-lab-ledger.mjs");
  assert.match(src, /labEligibility\(/, "the ledger calls the gate");
  assert.doesNotMatch(src, /\{ id: "nfl", label: "NFL", live: false, blocked: "/, "no hard-coded stream table survives");
});

/*
 * ── A RESULTS FILE IS NOT A SETTLER ────────────────────────────────────────────────────────────
 *
 * NFL cleared this entire gate and was reported LIVE. It has real posted prices on four or more
 * upcoming games, and its settlement check returned proven:true because nfl/results/latest.json has
 * rows. But settle-lab-cards has no NFL branch — an NFL leg falls through to the MLB box-score path,
 * boxFor() cannot resolve a gamePk it does not have, and the leg records "pending" on every run
 * forever. The card publishes, never grades, and quietly never enters the record, so the Lab's hit
 * rate ends up computed over only the cards that happened to be settleable.
 *
 * The three places that have to agree are the canonical list, the settler's own routing, and this
 * gate. They drifted twice: EPL was gradeable for days before the list said so, and NFL was in the
 * gate for days before anyone checked the settler.
 */
test("every sport the gate can declare LIVE has a grader in settle-lab-cards", () => {
  const settler = fs.readFileSync(path.join(process.cwd(), "scripts/parlays/settle-lab-cards.mjs"), "utf8");
  const code = settler.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const sport of SETTLEABLE_SPORTS) {
    if (sport === "mlb") {
      assert.match(code, /boxFor\(/, "MLB grades from the box score and that path must still exist");
      continue;
    }
    assert.match(code, new RegExp(`leg\\.sport[^\\n]*"${sport}"`),
      `${sport} is declared settleable and the settler has no branch for it — its legs would sit pending forever`);
  }
});

test("a sport with no grader is CLOSED, and says which half is missing", () => {
  const out = labEligibility(path.join(process.cwd(), "public", "data"), "2026-08-22", new Date().toISOString());
  for (const s of out) {
    if (s.id === "multi" || SETTLEABLE_SPORTS.includes(s.id)) continue;
    assert.equal(s.live, false, `${s.id} has no grader and must not be able to go live`);
  }
  const nfl = out.find((s) => s.id === "nfl");
  if (nfl && !nfl.live && nfl.evidence?.settlementProven === false) {
    // "We have no results" and "we cannot grade them" are different problems with different owners.
    assert.doesNotMatch(nfl.blocked ?? "", /^no official settlement path has produced a graded result yet$/,
      "a sport whose results ARE captured must not be told it has none");
  }
});
