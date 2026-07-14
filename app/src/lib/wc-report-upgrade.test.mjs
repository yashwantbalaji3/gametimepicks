/**
 * World Cup game-report upgrade: the CTA is "Generate Simulation Report" (matching MLB) while the source
 * stays honestly "market-implied"; the bracket-impact card makes a semifinal feel important without
 * inventing finalists.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("WC runner uses 'Generate Simulation Report' (not 'Market Dashboard') + keeps the market-implied source", () => {
  const src = read("src/components/game/wc-simulation-runner.tsx");
  assert.match(src, /Generate Simulation Report/, "product verb matches MLB");
  assert.doesNotMatch(src, /Generate Market Dashboard/, "the weaker 'Market Dashboard' verb is gone");
  assert.match(src, /market-implied/i, "source is still disclosed as market-implied");
  // (no-10k-claim in VISIBLE copy is enforced comment-stripped by wc-game-center.test.mjs)
});

test("bracket-impact card: winner→Final, loser→third-place, finalists TBD, NO fabricated teams", () => {
  const src = read("src/components/world-cup/wc-bracket-impact-card.tsx");
  assert.match(src, /Advances to the World Cup Final/, "winner advances to the final");
  assert.match(src, /third-place game/i, "loser plays the third-place game");
  assert.match(src, /TBD until both semifinals/, "finalists TBD until the semifinals finish");
  assert.doesNotMatch(src, /France|Spain|England|Argentina|Brazil|Portugal/, "no fabricated team names in the component");
  assert.match(src, /if \(!isSemi\) return null/, "only semifinals get the winner→final framing");
});

test("the WC game report mounts the bracket-impact card above the runner", () => {
  const page = read("src/components/game/game-detail-page.tsx");
  assert.match(page, /WorldCupBracketImpactCard/, "game report renders the bracket-impact card");
  assert.match(page, /stage=\{gc\.stage\}/, "bracket card is driven by the real stage");
});
