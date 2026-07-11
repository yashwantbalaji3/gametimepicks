/**
 * UFC FIGHT-WEEK GRAPHICS + model-only hiding. The simulator must feel like a fight-night product with
 * ORIGINAL graphics (octagon hero, de-vig probability bars, provider-needed chips) — no external/brand
 * images, no fake fighter photos — and, while unvalidated, the no-odds method/round/distance projections
 * are hidden behind a provider-needed roadmap (not shown as predictions).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const hero = read("src/components/ufc/ufc-fight-night-hero.tsx");
const bar = read("src/components/game/probability-bar.tsx");
const page = read("src/app/ufc/page.tsx");
const shell = read("src/components/game/multi-sport-report-shell.tsx");
const expanded = read("src/components/ufc/expanded-fight-cards.tsx");

const NO_EXTERNAL_IMG = (src, name) => {
  assert.doesNotMatch(src, /<img\b/i, `${name}: no <img> (initials/SVG only)`);
  assert.doesNotMatch(src, /https?:\/\/[^"')\s]+\.(png|jpe?g|gif|webp|svg)/i, `${name}: no external image URL`);
  assert.doesNotMatch(src, /url\(\s*['"]?https?:/i, `${name}: no external CSS image`);
};

test("1 · the octagon hero is original SVG/CSS — no external/brand images, honest claim", () => {
  assert.match(hero, /<svg/, "renders inline SVG (cage/octagon)");
  assert.match(hero, /polygon/, "octagon polygon present");
  assert.match(hero, /Market-implied sims live/, "honest live claim");
  assert.doesNotMatch(hero, /model picks? live|best bet|validated/i, "no overclaim");
  NO_EXTERNAL_IMG(hero, "fight-night hero");
});

test("2 · probability bar renders neutral stacked segments from win probabilities", () => {
  assert.match(bar, /segments/, "takes segments");
  assert.match(bar, /probability \/ total/, "width is a share of total (de-vigged split)");
  NO_EXTERNAL_IMG(bar, "probability bar");
});

test("3 · /ufc renders the octagon hero with real (parsed) headliners + counts", () => {
  assert.match(page, /<UfcFightNightHero/, "hero rendered");
  assert.match(page, /headliners=\{headliners\}/, "passes parsed headliners");
  assert.match(page, /oddsCount=\{fightReports\.length\}/, "odds-backed sim count is real");
  assert.match(page, /gradedRows=\{gradedRows\}\s+gradedTarget=\{gradedTarget\}/, "validation counts are real");
});

test("4 · the shared report shell shows the probability bar in Simulation Output", () => {
  assert.match(shell, /import ProbabilityBar/, "shell imports the bar");
  assert.match(shell, /<ProbabilityBar segments=\{output\.winProbabilities\}/, "bar renders the win probabilities");
});

test("5 · while unvalidated, Expanded method/round/distance become a provider-needed roadmap, not predictions", () => {
  assert.match(expanded, /hideModel \? \(/, "expanded gates the model-only rows on hideModel");
  // The model-only MetricRows for method/round/distance must be on the NON-hidden branch only.
  assert.match(expanded, /\) : \([\s\S]*?label="Goes the distance"/, "goes-distance metric only when not hidden");
  assert.match(expanded, /Provider-needed[\s\S]*?Method of victory/, "provider-needed roadmap replaces them when hidden");
});

test("6 · no fabricated fighter photos anywhere in the UFC graphics/expanded", () => {
  for (const [name, src] of [["hero", hero], ["expanded", expanded]]) NO_EXTERNAL_IMG(src, name);
  // Fallback avatars are initials, not images.
  assert.match(hero, /initials/, "hero uses initials fallback");
});
