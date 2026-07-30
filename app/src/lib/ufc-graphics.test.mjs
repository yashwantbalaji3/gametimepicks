/**
 * REPORT GRAPHICS + UFC imagery honesty. The shared de-vig probability bar and report shell stay
 * original (no external/brand images), and every surviving UFC surface — the settled archive page and
 * its recap — uses no fabricated fighter photos. The fight-week chrome (octagon hero, expanded fight
 * cards) was retired with the /ufc hub at the 2026-07-30 cleanup; its tests went with it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const bar = read("src/components/game/probability-bar.tsx");
const page = read("src/app/ufc/page.tsx");
const shell = read("src/components/game/multi-sport-report-shell.tsx");
const recap = read("src/components/ufc/event-results-recap.tsx");

const NO_EXTERNAL_IMG = (src, name) => {
  assert.doesNotMatch(src, /<img\b/i, `${name}: no <img> (initials/SVG only)`);
  assert.doesNotMatch(src, /https?:\/\/[^"')\s]+\.(png|jpe?g|gif|webp|svg)/i, `${name}: no external image URL`);
  assert.doesNotMatch(src, /url\(\s*['"]?https?:/i, `${name}: no external CSS image`);
};

test("1 · probability bar renders neutral stacked segments from win probabilities", () => {
  assert.match(bar, /segments/, "takes segments");
  assert.match(bar, /probability \/ total/, "width is a share of total (de-vigged split)");
  NO_EXTERNAL_IMG(bar, "probability bar");
});

test("2 · the shared report shell shows the probability bar in Simulation Output", () => {
  assert.match(shell, /import ProbabilityBar/, "shell imports the bar");
  assert.match(shell, /<ProbabilityBar segments=\{output\.winProbabilities\}/, "bar renders the win probabilities");
});

test("3 · no fabricated fighter photos on any surviving UFC surface", () => {
  for (const [name, src] of [["settled archive page", page], ["event results recap", recap]]) NO_EXTERNAL_IMG(src, name);
});
