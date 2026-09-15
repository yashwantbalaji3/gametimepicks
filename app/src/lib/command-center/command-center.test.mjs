/**
 * P306/P307/P309 — the Command Center: one contract for every sport's forecast, statuses from receipts and the
 * health scorecard in public words, freshness from the artifact's own stamp, and pauses that cannot be lost on
 * the way to a card.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { freshnessFor } from "./freshness.ts";
import { PUBLIC_STATE_LABEL, PUBLIC_STATE_MEANING } from "./contract.ts";
import { modelStatusFor } from "./model-status.ts";
import { featuredMlb, featuredNfl, featuredEpl, featuredUfc } from "./featured.ts";

const NOW = "2026-09-15T12:00:00Z";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gtp-cc-"));
const write = (root, rel, doc) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(doc)); };
const status = { id: "x", family: "Model", state: "EXPERIMENTAL", headline: "", detail: "", n: null, source: "" };
const fresh = freshnessFor(NOW, NOW);

test("freshness comes from the artifact's stamp against the build instant, never the browser", () => {
  assert.equal(freshnessFor("2026-09-15T09:00:00Z", NOW).state, "FRESH");
  assert.equal(freshnessFor("2026-09-14T20:00:00Z", NOW).state, "DELAYED");
  assert.equal(freshnessFor("2026-09-13T20:00:00Z", NOW).state, "STALE");
  assert.equal(freshnessFor(null, NOW).state, "MISSING");
  assert.equal(freshnessFor("2026-09-15T11:00:00Z", NOW, { sourceStale: true }).state, "STALE", "the owner's SOURCE_STALE wins over the clock");
  assert.match(freshnessFor("2026-09-15T11:00:00Z", NOW).label, /^Updated Sep 15, 7:00 AM ET$/);
});

test("every public state has a label and a rookie meaning, and no internal word leaks into either", () => {
  for (const [k, label] of Object.entries(PUBLIC_STATE_LABEL)) {
    assert.ok(label && PUBLIC_STATE_MEANING[k], k);
    assert.doesNotMatch(`${label} ${PUBLIC_STATE_MEANING[k]}`, /BREACHED|ACCUMULATING|ECE|log loss|artifact|receipt\.json/i, `${k} speaks reader words`);
  }
});

test("a BREACHED MLB family the gate pauses is PAUSED; WATCH stays WATCH; too few graded is TOO_EARLY", () => {
  const root = tmp();
  write(root, "admin/model-health.json", { generatedAt: "2026-09-15T02:00:00Z", families: [
    { id: "mlb_total", sport: "mlb", state: "BREACHED", n: 576, context: { hitRate: 0.488, meanPickProbability: 0.587 } },
    { id: "mlb_moneyline", sport: "mlb", state: "WATCH", n: 605, context: { hitRate: 0.499, meanPickProbability: 0.572 } },
    { id: "mlb_run_line", sport: "mlb", state: "INSUFFICIENT_SAMPLE", n: 12 },
  ] });
  const items = modelStatusFor("mlb", { dataRoot: root, repoRoot: root, nowIso: NOW });
  assert.deepEqual(items.map((i) => [i.family, i.state]), [["Winner calls", "WATCH"], ["Game totals", "PAUSED"], ["Run line calls", "TOO_EARLY"]]);
  assert.match(items[1].detail, /worse than a coin flip/);
  assert.match(items[1].detail, /49% of the time while showing about 59%/, "the evidence is the scorecard's own figures");
  assert.equal(items[1].n, 576);
});

test("a stale scorecard pauses nothing: BREACHED reads as WATCH, never PAUSED, when the gate would not act", () => {
  const root = tmp();
  write(root, "admin/model-health.json", { generatedAt: "2026-09-01T02:00:00Z", families: [{ id: "mlb_total", sport: "mlb", state: "BREACHED", n: 576 }] });
  const items = modelStatusFor("mlb", { dataRoot: root, repoRoot: root, nowIso: NOW });
  assert.equal(items.find((i) => i.id === "mlb_total").state, "WATCH");
});

test("EPL: the blind validation and the forward receipt map to public states; UFC: verdicts and the live record", () => {
  const root = tmp();
  write(root, "admin/model-health.json", { generatedAt: "2026-09-15T02:00:00Z", families: [{ id: "epl_result", sport: "epl", state: "INSUFFICIENT_SAMPLE", n: 35 }, { id: "ufc_winner", sport: "ufc", state: "INSUFFICIENT_SAMPLE", n: 31 }] });
  write(root, "data/internal/research/epl/forward/receipt.json", { state: "ACCUMULATING", n: 4, needed: 60 });
  const epl = modelStatusFor("epl", { dataRoot: root, repoRoot: root, nowIso: NOW, eplValidation: "VALIDATED_OUT_OF_SAMPLE_HISTORY" });
  assert.deepEqual(epl.map((i) => i.state), ["VALIDATED", "FORWARD_TEST", "TOO_EARLY"]);
  assert.match(epl[1].headline, /4 of 60/);
  write(root, "data/internal/research/epl/forward/receipt.json", { state: "FORWARD_BREACHED", n: 80, needed: 60 });
  assert.equal(modelStatusFor("epl", { dataRoot: root, repoRoot: root, nowIso: NOW, eplValidation: "NOT_VALIDATED" })[1].state, "PAUSED");
  const ufc = modelStatusFor("ufc", { dataRoot: root, repoRoot: root, nowIso: NOW, ufcVerdicts: { winner: "PASS", method: "PASS", round: "PASS" } });
  assert.deepEqual(ufc.map((i) => i.state), ["VALIDATED", "TOO_EARLY"]);
  assert.equal(modelStatusFor("ufc", { dataRoot: root, repoRoot: root, nowIso: NOW, ufcVerdicts: { winner: "FAIL" } })[0].state, "EXPERIMENTAL");
});

const mlbPrediction = (over = {}) => ({
  gamePk: 1, slug: "sf-vs-laa-2026-09-15", status: "ready", awayTeam: "LAA", homeTeam: "SF", awayTeamName: "Angels", homeTeamName: "Giants",
  predictedWinner: { side: "home", team: "SF" }, projectedScore: { away: 3, home: 4, label: "median" },
  moneyline: { side: "home", team: "SF", simulationProbability: 0.61, strengthLabel: "STRONG SIMULATION" },
  total: { line: 8.5, pick: "OVER", overProbability: 0.58, underProbability: 0.4 }, runLine: { pick: "LAA +1.5", coverProbability: 0.62 }, ...over,
});

test("MLB featured card: a paused family cannot reach the card with a probability, and its risk names the pause", () => {
  const root = tmp();
  write(root, "mlb/predictions/2026-09-15.json", { generatedAt: NOW, predictions: [mlbPrediction()] });
  write(root, "mlb/boards/2026-09-15.json", { games: [{ gamePk: 1, gameDate: "2026-09-15T23:10:00Z" }] });
  write(root, "admin/model-health.json", { generatedAt: "2026-09-15T02:00:00Z", families: [{ id: "mlb_total", state: "BREACHED" }, { id: "mlb_moneyline", state: "BREACHED" }] });
  const { card } = featuredMlb({ dataRoot: root, today: "2026-09-15", nowIso: NOW, freshness: fresh, status });
  assert.ok(card);
  assert.equal(card.signal.kind, "NONE", "no winner probability while the winner call is paused");
  assert.equal(card.forecast.label, "Winner call paused");
  assert.match(card.forecast.value, /LAA 3–4 SF/, "the projected score stays as evidence");
  assert.ok(card.risks[0].includes("winner call is paused"));
  assert.doesNotMatch(card.context ?? "", /Over 8\.5/, "the paused total is not in the context line either");
  assert.match(card.context ?? "", /LAA \+1\.5 · 62%/, "the run line still stands");
});

test("MLB featured card: unpaused, the strength label is the sport's own and a started game is never featured", () => {
  const root = tmp();
  write(root, "mlb/predictions/2026-09-15.json", { generatedAt: NOW, predictions: [mlbPrediction(), mlbPrediction({ gamePk: 2, slug: "b", moneyline: { side: "home", team: "SF", simulationProbability: 0.7, strengthLabel: "VERY STRONG SIMULATION" } })] });
  write(root, "mlb/boards/2026-09-15.json", { games: [{ gamePk: 1, gameDate: "2026-09-15T23:10:00Z" }, { gamePk: 2, gameDate: "2026-09-15T11:00:00Z" }] });
  const { card } = featuredMlb({ dataRoot: root, today: "2026-09-15", nowIso: NOW, freshness: fresh, status });
  assert.equal(card.id, "mlb-1", "the 70% game has started (11:00Z < 12:00Z) and is not featured");
  assert.deepEqual(card.signal, { kind: "SIM_STRENGTH", label: "STRONG SIMULATION", probability: 0.61 });
  assert.equal(card.home.favoured, true);
  const none = featuredMlb({ dataRoot: root, today: "2026-09-15", nowIso: "2026-09-16T05:00:00Z", freshness: fresh, status });
  assert.equal(none.card, null);
  assert.match(none.reason, /has started/);
});

test("NFL / EPL / UFC featured cards carry a probability signal, never an invented tier, and the EPL constant-total risk", () => {
  const root = tmp();
  write(root, "nfl/index.json", { events: [{ providerEventId: "9", matchup: "DEN @ KC", kickoffUtc: "2026-09-20T17:00:00Z", lifecycle: "UPCOMING", state: "EXPERIMENTAL_LEAN", stateMeaning: "The direction our experimental model leans.", home: { abbr: "KC", name: "Chiefs" }, away: { abbr: "DEN", name: "Broncos" }, projectedScore: { home: 20, away: 21 }, winProbability: { home: 0.37, away: 0.6 }, total: { median: 41, p10: 24, p90: 58 } }] });
  const nfl = featuredNfl({ dataRoot: root, today: "2026-09-15", nowIso: NOW, freshness: fresh, status, weekLabel: "Week 2" }).card;
  assert.equal(nfl.signal.kind, "PROBABILITY");
  assert.equal(nfl.away.favoured, true);
  assert.match(nfl.forecast.value, /^DEN 60%$/);
  assert.match(nfl.forecast.sub, /by 1/);
  assert.ok(nfl.risks.some((r) => /24–58/.test(r)));
  const set = { generatedAt: NOW, validation: "VALIDATED_OUT_OF_SAMPLE_HISTORY", trackRecord: "", note: "", counts: {}, rows: [
    { eventId: "e", matchup: "Arsenal v Chelsea", homeClub: "Arsenal", awayClub: "Chelsea", slug: "arsenal-v-chelsea-2026-09-20", kickoffUtc: "2026-09-20T15:30:00Z", matchweek: 5, state: "CURRENT_PRE_EVENT", unavailableReason: null, probs: { home: 0.58, draw: 0.22, away: 0.2 }, expectedGoals: 2.8, over25: 0.52, coldStart: null, lambdas: null, totals: null, teamGoals: null, btts: null, cleanSheet: null, doubleChance: null, margin: null, topScorelines: null, topScorelinesMass: null, modelId: "m" },
  ] };
  const epl = featuredEpl({ dataRoot: root, today: "2026-09-15", nowIso: NOW, freshness: fresh, status, set }).card;
  assert.equal(epl.signal.kind, "PROBABILITY");
  assert.match(epl.forecast.value, /^Arsenal 58%$/);
  assert.ok(epl.risks[0].includes("same for every match"), "the constant-total limitation travels with the number");
  const ufc = featuredUfc({ dataRoot: root, today: "2026-09-15", nowIso: NOW, freshness: fresh, status, card: { event: { name: "UFC 331", startUtc: "2026-09-19T21:00Z" }, bouts: [{ boutId: "b1", titleFight: true, red: { name: "A" }, blue: { name: "B" }, prediction: { winner: { name: "B", probability: 0.74 }, method: { most: "DEC" }, rounds: { endsIn: "3+" }, reason: "B lands more." } }] } }).card;
  assert.equal(ufc.signal.kind, "PROBABILITY");
  assert.equal(ufc.home.favoured, true);
  assert.equal(ufc.why, "B lands more.");
  assert.match(ufc.forecast.sub, /by decision/);
  for (const c of [nfl, epl, ufc]) assert.notEqual(c.signal.kind, "SIM_STRENGTH", `${c.sport} has no tier and gets none`);
});

test("SOURCE PIN · the homepage renders both hub sections through the Command Center from the owner's lanes; components hold no artifact reads", () => {
  const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  const home = src("src/app/page.tsx");
  assert.match(home, /buildCommandCenter\(\{ dataRoot/, "lanes come from the library");
  assert.match(home, /days: \{ mlb: mlbDay, epl: eplDay, nfl: nflDay, ufc: ufcDay \}/, "fed by the product-day owner's answers");
  assert.match(home, /<CommandCenter[\s\S]*heading="Simulation Hub"/);
  assert.match(home, /<CommandCenter[\s\S]*heading="Other coverage"/);
  for (const f of ["src/components/command-center/command-center.tsx", "src/components/command-center/prediction-card.tsx", "src/components/command-center/model-status-chip.tsx"]) {
    assert.doesNotMatch(src(f), /readFileSync|\.json"/, `${f} renders the contract only`);
  }
  assert.match(src("src/app/methodology/page.tsx"), /id="model-status"/, "the glossary the chips link to exists");
});
