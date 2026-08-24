/**
 * Simulation Hub NON-PROMOTION proofs — metamorphic (Program 161 · Release A).
 *
 * The hub's one promise: membership comes from CURRENT simulation activity, never from inventory.
 * Program 148-160 added four artifact classes that must never promote a sport — schedule captures,
 * historical replays, registry entries, shadow contracts — plus the settled UFC archive and the
 * upcoming Aug-11 card. These guards prove each vector is closed at BOTH altitudes: the pure
 * selector's semantics, and the homepage wiring that feeds it.
 *
 * Run: npx tsx --test src/lib/home/simulation-hub-promotion.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { deriveSportState, isPrimary, stateLabel, SPORT_STATES } from "./simulation-hub.mjs";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("SCHEDULE-ONLY CANNOT PROMOTE · an out-of-season sport with no current artifact stays out, whatever its schedule holds", () => {
  // A schedule capture gives a sport events — it gives it neither a simulation artifact nor leans.
  for (const sport of ["nfl", "nba", "epl", "ufc"]) {
    const state = deriveSportState({ slateDate: "2026-08-11", artifactDate: null, leans: 0, inSeason: false, nextEventDate: null });
    assert.equal(state, SPORT_STATES.NOT_SUPPORTED, `${sport}: no artifact + no season = not supported`);
    assert.equal(isPrimary(state), false);
  }
});

test("ARCHIVE CANNOT PROMOTE · a settled artifact with leans on an OLD date is history, never live", () => {
  // Even a lean-carrying artifact cannot claim today when its date is not today (the UFC lesson).
  const state = deriveSportState({ slateDate: "2026-08-11", artifactDate: "2026-06-15", leans: 999, inSeason: false });
  assert.equal(state, SPORT_STATES.HISTORICAL_ONLY);
  assert.equal(isPrimary(state), false);
  assert.match(stateLabel(state, { artifactDate: "2026-06-15" }), /Historical coverage · settled 2026-06-15/,
    "the archive says WHEN it settled — visible, secondary, never claimed as running");
});

test("ARTIFACT REMOVAL DEMOTES IMMEDIATELY · losing the only current artifact removes primary membership", () => {
  const live = deriveSportState({ slateDate: "2026-08-11", artifactDate: "2026-08-11", leans: 5, inSeason: true });
  assert.equal(live, SPORT_STATES.LIVE_TODAY);
  const removed = deriveSportState({ slateDate: "2026-08-11", artifactDate: null, leans: 0, inSeason: false });
  assert.equal(isPrimary(removed), false, "no artifact, no membership — nothing lingers");
  // Wrong-date leans never resurrect liveness.
  const wrongDate = deriveSportState({ slateDate: "2026-08-11", artifactDate: "2026-08-10", leans: 5, inSeason: false });
  assert.notEqual(wrongDate, SPORT_STATES.LIVE_TODAY, "stale/wrong-date artifacts do not qualify");
});

test("NO-PLAY ≠ OUTAGE · the in-season empty state says 'no qualified slate', never outage vocabulary", () => {
  const noPlay = deriveSportState({ slateDate: "2026-08-11", artifactDate: "2026-08-11", leans: 0, inSeason: true });
  assert.equal(noPlay, SPORT_STATES.IN_SEASON_NO_SLATE);
  assert.equal(isPrimary(noPlay), true, "an honest no-play stays visible — hiding it would read as an outage");
  const label = stateLabel(noPlay);
  assert.match(label, /no qualified slate/);
  assert.ok(!/outage|error|down|stale/i.test(label), "outage words belong to the ledger, not to a quiet day");
});

test("WIRING · hub membership flows from the product-day authority; every promotion door stays evidence-gated", async () => {
  /*
   * P202 restatement. Every invariant below survives from the page-internal era; only the SEAT
   * moved. The page used to derive each sport's inputs from raw artifacts, so this guard pinned
   * page internals (deriveSportState calls, ufcPredicted gates, card-latest reads). Those facts
   * now flow through ONE owner — lib/product-day — and the page only maps typed answers into hub
   * vocabulary. So each claim is asserted where it now lives:
   *   · the page consumes the owner and hardcodes nothing;
   *   · NFL enters only with a real simulated slate, and a PAST window never reads as live;
   *   · EPL enters only through the lane's own loader, counting only CURRENT pre-event rows;
   *   · a mere SCHEDULE still cannot promote UFC — upcoming promotes only with predictions;
   *   · NBA stays out by name (schedules live on /sports).
   */
  const src = read("src/app/page.tsx");
  const owner = read("src/lib/product-day/product-day.ts");
  const hub = read("src/lib/home/simulation-hub.mjs");
  const allSportsBlock = src.slice(src.indexOf("const allSports"), src.indexOf("partitionSports(allSports)"));

  assert.match(src, /buildProductDays\(/, "the page consumes the product-day authority");
  assert.match(allSportsBlock, /id: "mlb"/);
  assert.match(allSportsBlock, /id: "ufc"/);
  for (const banned of ['id: "nba"']) {
    assert.ok(!allSportsBlock.includes(banned), `${banned} must not be a hub entry — schedules live on /sports`);
  }
  assert.ok(!/deriveSportState\(/.test(src), "no page-local state derivation survives — the owner answers, the page maps");

  // NFL: evidence lives in the owner — a real simulated slate, and a passed window is history.
  assert.match(owner, /game-simulations.*latest\.json|"game-simulations", "latest\.json"/, "the owner reads NFL's simulation artifact");
  assert.match(owner, /windowPassed/, "a PAST kickoff never reads as an upcoming window");
  // EPL: through the lane's own loader, current pre-event rows only.
  const { loadEplForecasts } = await import("../sports/epl/forecast-view.ts");
  const epl = loadEplForecasts();
  assert.ok(epl && Array.isArray(epl.rows) && epl.validation, "epl publishes a loadable forecast artifact");
  assert.match(owner, /loadEplForecasts/, "the owner reads EPL through the lane's loader, never the raw path");
  assert.match(owner, /CURRENT_PRE_EVENT/, "the owner counts only current pre-event forecasts");
  // UFC: a schedule alone must not promote. The owner's eligible counts PREDICTIONS, and the hub
  // mapping promotes an upcoming card only when eligible > 0. Weakening either restores the
  // original defect exactly.
  assert.match(owner, /filter\(\(b\) => b\.prediction\)/, "UFC eligibility counts predictions, not bouts");
  assert.match(owner, /card-latest\.json/, "the bout count is read from the card artifact, not asserted");
  assert.match(hub, /EVENT_UPCOMING" && day\.eligible > 0/, "upcoming promotes only with something modelled");
});

test("WIRING · neither the hub selector nor the homepage imports schedule captures, replays, registry, or shadow modules", () => {
  const hub = read("src/lib/home/simulation-hub.mjs");
  const home = read("src/app/page.tsx");
  for (const [name, pattern] of [
    ["replay runner", /replay-runner/],
    ["model registry", /model-registry/],
    ["shadow contract", /shadow-contract/],
    ["research artifacts", /research\/artifact-modes/],
  ]) {
    assert.ok(!pattern.test(hub) && !pattern.test(home), `${name} must have no import path into hub membership`);
  }
  // The upcoming-schedule adapters feed ONLY the strip section, never the hub cards.
  const stripIdx = home.indexOf("UpcomingSportsStrip");
  const hubIdx = home.indexOf("simHubCards");
  assert.ok(stripIdx > -1 && hubIdx > -1);
  assert.ok(!home.slice(0, home.indexOf("const allSports")).includes("allUpcoming(") || home.indexOf("allUpcoming(") > home.indexOf("partitionSports"),
    "allUpcoming (schedule adapters) is consumed after hub membership is decided — it cannot feed allSports");
});

test("MLB EQUIVALENCE · current valid inputs derive exactly the states the product shipped with", () => {
  assert.equal(deriveSportState({ slateDate: "2026-08-11", artifactDate: "2026-08-11", leans: 7, inSeason: true }), SPORT_STATES.LIVE_TODAY);
  assert.equal(stateLabel(SPORT_STATES.LIVE_TODAY), "Live today");
  assert.equal(deriveSportState({ slateDate: "2026-08-11", artifactDate: "2026-08-11", leans: 0, inSeason: true }), SPORT_STATES.IN_SEASON_NO_SLATE);
});
