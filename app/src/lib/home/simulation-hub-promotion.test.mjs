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

test("WIRING · the homepage hub feeds ONLY mlb + the ufc archive; schedule sports never enter allSports", async () => {
  const src = read("src/app/page.tsx");
  const allSportsBlock = src.slice(src.indexOf("const allSports"), src.indexOf("partitionSports(allSports)"));
  assert.match(allSportsBlock, /id: "mlb"/);
  assert.match(allSportsBlock, /id: "ufc"/);
  // P191: NFL publishes simulations now, so it belongs here — but only while its artifact exists.
  // Sports that publish nothing stay banned. The door is closed by EVIDENCE, not by a name list.
  if (allSportsBlock.includes('id: "nfl"')) {
    const art = path.join(process.cwd(), "public/data/nfl/game-simulations/latest.json");
    assert.ok(fs.existsSync(art), "nfl is a hub entry but publishes no simulation artifact");
    assert.ok((JSON.parse(fs.readFileSync(art, "utf8")).games ?? []).length > 0, "nfl's artifact carries no games");
  }
  // P200: EPL earned the same evidence-gated door NFL did — it publishes a real public forecast
  // artifact (public beta, validation state rendered in words), so the hub may carry it exactly
  // while that artifact exists and carries rows. Publishing nothing still bans it.
  if (allSportsBlock.includes('id: "epl"')) {
    // Evidence through the lane's OWN loader (the closeout guard keeps soccer/epl artifact paths
    // inside the lane, and that includes guards): the loader returning a set proves the published
    // forecast artifact exists and parses. Structural evidence, not today's row count — between
    // matchweeks rows is legitimately empty and deriveSportState already demotes a quiet EPL to
    // secondary on its own (leans 0 → not primary).
    const { loadEplForecasts } = await import("../sports/epl/forecast-view.ts");
    const epl = loadEplForecasts();
    assert.ok(epl, "epl is a hub entry but publishes no loadable forecast artifact");
    assert.ok(Array.isArray(epl.rows) && epl.validation, "epl's artifact is not the real forecast contract");
    assert.match(src, /loadEplForecasts/, "the homepage reads EPL through the lane's loader, never the raw path");
    assert.match(src, /CURRENT_PRE_EVENT/, "the hub card counts only current pre-event forecasts");
  }
  for (const banned of ['id: "nba"']) {
    assert.ok(!allSportsBlock.includes(banned), `${banned} must not be a hub entry — schedules live on /sports`);
  }
  /*
   * nextEventDate is the ONE vector by which an upcoming UFC card can promote into the hub via
   * EVENT_THIS_WEEK. This guard originally banned the token outright, because at the time there was
   * no fight model: any scheduled card would have promoted UFC to "live" while the site could say
   * nothing whatsoever about it.
   *
   * Program 187 built that model and it passed its preregistered bars, so the door now opens on
   * EVIDENCE rather than staying bolted by name. The invariant never was "UFC may not promote" — it
   * was "a SCHEDULE alone may not promote". So this asserts the gate instead of the token: if
   * nextEventDate is passed at all, it must be conditioned on predictions actually existing.
   *
   * Weakening this to "nextEventDate may be passed" would restore the original defect exactly.
   */
  const ufcStateStart = src.indexOf("const ufcState = deriveSportState(");
  assert.ok(ufcStateStart > -1, "the ufcState derivation exists");
  const ufcStateBlock = src.slice(ufcStateStart, src.indexOf("});", ufcStateStart) + 3);
  const nextEventLine = ufcStateBlock.split("\n").find((l) => /nextEventDate/.test(l) && !/^\s*\/\//.test(l));
  if (nextEventLine) {
    assert.match(nextEventLine, /ufcPredicted\s*>\s*0/,
      "nextEventDate is passed ungated — a card with no model read would promote UFC into the hub");
    assert.match(nextEventLine, /:\s*null|\?\?\s*null|:\s*undefined/,
      "the ungated branch must resolve to null so deriveSportState sees no upcoming event at all");
  }
  // P191: the door this guarded was "a mere SCHEDULE must not promote UFC". A published FIGHT MODEL
  // is a different thing, so inSeason is now driven by whether bouts actually carry predictions —
  // never by a date, and never by the existence of a card alone.
    // P194: tightened from "has bouts" to "has PREDICTIONS". A Contender Series card of debutants has
  // bouts but nothing modelled — a schedule, not live coverage — so bouts alone must not promote it.
  assert.match(ufcStateBlock, /inSeason: ufcPredicted > 0/, "UFC is in season for hub purposes only when its card carries PREDICTIONS");
  const boutsDerivation = src.slice(src.indexOf("const ufcBouts ="), src.indexOf("const nflState"));
  assert.match(boutsDerivation, /card-latest\.json/, "the bout count is read from the card artifact, not asserted");
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
