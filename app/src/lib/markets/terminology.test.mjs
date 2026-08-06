/**
 * Market Center terminology guards (Program 141).
 *
 * The founder's observation: "'pts' is ambiguous; if it means percentage points, label it 'pp'".
 * It was worse than ambiguous — it was a COLLISION. This site legitimately uses "pts" for scoring
 * points (the NBA points prop in market-label.ts, "proj pts" on the team projection card), so a
 * probability difference rendered as "−8.0 pts" named a real quantity it was not.
 *
 * These guards keep the two apart and keep the explanation on the page.
 *
 * Run: npx tsx --test src/lib/markets/terminology.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

/** The two components that render a model-vs-market probability difference. */
const GAP_COMPONENTS = ["src/components/market-center.tsx", "src/components/game/model-market-comparison.tsx"];

test("THE DEFECT · a probability difference is labelled 'pp', never 'pts'", () => {
  for (const f of GAP_COMPONENTS) {
    const src = read(f);
    const gap = src.slice(src.indexOf("function Gap("), src.indexOf("function Gap(") + 900);
    assert.match(gap, /\{points\.toFixed\(1\)\} pp/, `${f}: the difference must be labelled pp`);
    assert.doesNotMatch(gap, /\{points\.toFixed\(1\)\} pts/, `${f}: 'pts' collides with scoring points`);
  }
});

test("'pts' remains available for the quantity it actually names — scoring points", () => {
  // The rename must be surgical. Blanket-replacing "pts" would have renamed the NBA points prop
  // and the projected-points card, which are not probabilities and are correctly called pts.
  assert.match(read("src/lib/market-label.ts"), /pts: "PTS"/, "the NBA points market keeps its label");
  assert.match(read("src/components/team-game-projection-card.tsx"), /proj pts/, "projected scoring points keep theirs");
});

test("the abbreviation carries an accessible expansion — 'pp' alone is not self-explanatory", () => {
  const src = read("src/components/market-center.tsx");
  assert.match(src, /percentage points/, "the expansion must be exposed, not assumed");
});

test("the reading key defines every term the default view shows, with a worked example", () => {
  const key = read("src/components/markets/how-to-read-markets.tsx");

  for (const term of [
    "Model probability", "Market-implied probability", "American odds", "Moneyline",
    "Run line / spread", "Total", "pp (percentage point)", "Difference",
    "Data freshness", "Incomplete input", "Qualified", "No-play",
  ]) {
    assert.ok(key.includes(term), `the key must define "${term}"`);
  }

  // The worked example is the thing that turns three numbers into one sentence.
  assert.match(key, /58\.6%/, "worked example: model figure");
  assert.match(key, /66\.6%/, "worked example: market figure");
  assert.match(key, /−8\.0 pp|-8\.0 pp/, "worked example: the resulting difference");

  // pp must be distinguished from BOTH things it is commonly confused with.
  const ppDef = key.slice(key.indexOf("pp (percentage point)"), key.indexOf("pp (percentage point)") + 400);
  assert.match(ppDef, /NOT scoring points/i, "pp must be distinguished from scoring points");
  assert.match(ppDef, /not a percentage change/i, "pp must be distinguished from a percentage change");
});

test("the key refuses to present a large difference as a recommendation", () => {
  const key = read("src/components/markets/how-to-read-markets.tsx");
  // JSX wraps prose across lines, so these must be whitespace-tolerant — an over-literal regex
  // failed here on text that was present and correct.
  const prose = key.replace(/\s+/g, " ");
  assert.match(prose, /not.{0,20}automatically a good bet/i, "a big gap is not advice");
  // And it says WHY, from the measured record rather than as a vague hedge. Note this is a
  // NEGATION — the repo bans CLAIMING to beat the market; stating that we do not is the honest
  // opposite, and it is the single most important sentence on this page.
  assert.match(prose, /does not beat the market/i, "the honest reason must be stated");
  // No profit language may creep in here of all places.
  assert.doesNotMatch(key, /guaranteed|sure thing|can't lose|beat the book/i);
});

test("the key is a native disclosure — keyboard-operable and touch-usable by construction", () => {
  const key = read("src/components/markets/how-to-read-markets.tsx");
  assert.match(key, /<details/, "a div+onClick would lose keyboard operation for free");
  assert.match(key, /<summary/, "the summary is the focusable control");
  // A tooltip-only key is unusable on touch, which is most of the audience.
  assert.doesNotMatch(key, /onMouseEnter|:hover \{ display/, "the key must not be hover-gated");

  const page = read("src/app/markets/page.tsx");
  assert.match(page, /<HowToReadMarkets \/>/, "the key must actually be on /markets");
});
