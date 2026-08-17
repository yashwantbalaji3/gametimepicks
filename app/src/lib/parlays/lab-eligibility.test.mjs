/**
 * THE SPORT GATE — eligibility is measured from artifacts, never declared.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { labEligibility } from "../../../scripts/parlays/lab-eligibility.mjs";

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
  // UFC is the live proof today: its last capture is well over a month old, so it is closed with
  // the age named rather than quoting month-old prices under today's heading.
  const ufc = labEligibility(ROOT, NOW.slice(0, 10), NOW).find((s) => s.id === "ufc");
  assert.equal(ufc.live, false);
  assert.match(ufc.blocked, /days old/, "and the reason names the staleness");

  // And it re-opens on its own when the feed does: same sport, evaluated at its capture time.
  const atCapture = ufc.evidence.pricesCapturedAt;
  if (atCapture) {
    const fresh = labEligibility(ROOT, atCapture.slice(0, 10), atCapture).find((s) => s.id === "ufc");
    assert.doesNotMatch(fresh.blocked ?? "", /days old/, "freshness is evaluated, not hard-coded");
  }
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
