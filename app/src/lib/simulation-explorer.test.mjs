/**
 * SIMULATION EXPLORER GUARDS (Sprint 012 · R9). The flagship discovery surface must be a presentation shell
 * over the canonical artifacts — it may never simulate, recompute a prediction, or invent an outcome.
 *
 * Run: npx tsx --test src/lib/simulation-explorer.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const card = read("src/components/entity/simulation-card.tsx");
const explorer = read("src/components/games/simulation-explorer.tsx");
const page = read("src/app/simulate/page.tsx");

test("the explorer card is presentational — no simulation, no prediction recomputation, no fetching", () => {
  for (const [name, src] of [["simulation-card", card], ["simulation-explorer", explorer]]) {
    assert.ok(!/simulateFullGame|buildGamePredictionDecision|buildPlayerPrediction|simulateGame/.test(src),
      `${name} must not build simulations or predictions`);
    assert.ok(!/\bfetch\(|readFileSync|useEffect/.test(src), `${name} must not fetch or hand-read files`);
  }
});

test("it renders the canonical entity primitives (shared visual identity)", () => {
  assert.match(card, /from "@\/components\/entity"/, "uses the entity system");
  assert.match(card, /<GameHeader/, "team identity via GameHeader");
  assert.match(card, /<PlayerCard/, "player impact via PlayerCard");
});

test("frequency is probability × runCount — a rendering of canonical values, not a new number", () => {
  assert.match(card, /Math\.round\(probability \* runCount\)/, "frequency = probability × simulations");
  assert.match(card, /if \(probability == null \|\| runCount == null \|\| runCount <= 0\) return null/, "fails closed");
});

test("missing data fails closed — no fabricated grid, no fabricated outcome", () => {
  assert.match(card, /const ready = g\.status !== "unavailable" && !!g\.winProbability/, "unavailable games show no outputs");
  assert.match(explorer, /cards\.length === 0/, "empty slate renders an honest empty state");
  assert.match(explorer, /never placeholder numbers/, "states the honesty rule to the user");
});

test("the derivation lives ONCE in the component, not duplicated into the page", () => {
  // simulate-route.test.mjs guards that page files carry no data logic; the explorer follows the same
  // pattern as SimulateLobby — the component reads the canonical details itself.
  assert.match(explorer, /buildAllGameDetails\(\)/, "the component reads the canonical details");
  assert.match(explorer, /\.filter\(\(d\) => d\.sport === "mlb" && d\.fullGameSim\)/, "only games with a real full-game artifact");
  assert.ok(!/buildAllGameDetails/.test(page), "the page duplicates no data logic");

  /*
   * P232 · C: the page now passes the build's ET day so the explorer can say WHICH slate its cards
   * belong to — it was rendering 09-01's fifteen games under a 09-02 header that said "no MLB games
   * on this date". Passing the clock is not data logic; the page already owns `currentEtDate()` and
   * every other dated surface takes it the same way.
   *
   * The claim is unchanged and still enforced: the page may hand over props, never derive data. So
   * this pins the props it is allowed to pass rather than pinning the tag to be propless.
   */
  const tag = /<SimulationExplorer([^/>]*)\/>/.exec(page);
  assert.ok(tag, "the page renders the explorer");
  const props = tag[1].trim();
  assert.ok(
    props === "" || /^selectedDate=\{currentEtDate\(\)\}$/.test(props),
    `the page may pass only the clock, got: ${props || "(none)"}`,
  );
  assert.ok(!/simulateFullGame|buildGamePredictionDecision/.test(explorer), "the component does not recompute predictions");
});

test("no market-beating or betting-hype language on the explorer", () => {
  for (const src of [card, explorer]) {
    assert.ok(!/beat the market|best bet|guaranteed|\block\b/i.test(src), "no hype/market-beating copy");
  }
  assert.match(explorer, /not a claim to out-perform the book/, "keeps the honest framing");
});
