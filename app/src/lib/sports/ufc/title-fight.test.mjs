/**
 * Title fight only on provider evidence (UFC-001, 2026-10-10). Fixtures are the ESPN scoreboard shapes of
 * UFC Fight Night: Allen vs. Duncan (2026-10-10, a non-title 5-round main event) and UFC 333 (2026-10-24, two belts).
 *
 * Run: npx tsx --test src/lib/sports/ufc/title-fight.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { titleFightFromProvider } from "./title-fight.mjs";

const bout = (weightClass, periods, ...accolades) => ({
  type: { abbreviation: weightClass },
  format: { regulation: { periods } },
  competitors: [{ athlete: { accolades: accolades[0] ?? [] } }, { athlete: { accolades: accolades[1] ?? [] } }],
});
const belt = (name) => ({ type: "Belt", name });

test("a five-round main event with no belt holder is NOT a title fight (Allen vs. Duncan)", () => {
  assert.deepEqual(titleFightFromProvider(bout("Middleweight", 5)), { titleFight: false, titleFightBasis: null });
});

test("a champion defending in their own division over five rounds IS (UFC 333)", () => {
  assert.equal(titleFightFromProvider(bout("Featherweight", 5, [belt("UFC Featherweight Title")])).titleFight, true);
  assert.equal(titleFightFromProvider(bout("Bantamweight", 5, [], [belt("UFC Bantamweight Title"), belt("UFC Interim Bantamweight Title")])).titleFightBasis, "PROVIDER_BELT_HOLDER");
  assert.equal(titleFightFromProvider(bout("Bantamweight", 5, [belt("UFC Interim Bantamweight Title")])).titleFight, true, "an interim belt counts");
});

test("fails safe: wrong division, three rounds, men's vs women's, non-belt accolades", () => {
  assert.equal(titleFightFromProvider(bout("Lightweight", 5, [belt("UFC Featherweight Title")])).titleFight, false, "champion outside his division");
  assert.equal(titleFightFromProvider(bout("Heavyweight", 5, [belt("UFC Light Heavyweight Title")])).titleFight, false, "light heavyweight is not heavyweight");
  assert.equal(titleFightFromProvider(bout("Light Heavyweight", 5, [belt("UFC Heavyweight Title")])).titleFight, false);
  assert.equal(titleFightFromProvider(bout("Featherweight", 3, [belt("UFC Featherweight Title")])).titleFight, false, "three rounds");
  assert.equal(titleFightFromProvider(bout("Strawweight", 5, [belt("UFC Women's Strawweight Title")])).titleFight, false, "men's bout, women's belt");
  assert.equal(titleFightFromProvider(bout("W Strawweight", 5, [belt("UFC Women's Strawweight Title")])).titleFight, true, "women's bout, women's belt");
  assert.equal(titleFightFromProvider(bout("W Strawweight", 5, [belt("UFC Strawweight Title")])).titleFight, false);
  assert.equal(titleFightFromProvider(bout("Featherweight", 5, [{ type: "Award", name: "UFC Featherweight Title" }])).titleFight, false, "only Belt accolades");
  assert.equal(titleFightFromProvider({}).titleFight, false);
  assert.equal(titleFightFromProvider(null).titleFight, false);
});

test("the card builder no longer infers a title from five rounds", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/ufc/build-ufc-card.mjs"), "utf8");
  assert.doesNotMatch(src, /titleFight:\s*scheduled\s*===\s*5/);
  assert.match(src, /titleFight:\s*titleFightFromProvider\(c\)\.titleFight/);
});
