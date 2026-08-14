/**
 * Release B guards (Program 177): the card builder refuses NFL for a STATED reason that cannot
 * drift from the money path's reason, and NFL player rows carry the same shared portrait every
 * other sport uses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const buildLegs = fs.readFileSync(path.join(APP, "src/lib/build-legs.ts"), "utf8");
const avatar = fs.readFileSync(path.join(APP, "src/components/player-avatar.tsx"), "utf8");
const hub = fs.readFileSync(path.join(APP, "src/app/nfl/page.tsx"), "utf8");
const eligibility = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/product-eligibility.json"), "utf8"));
const vault = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/end-zone-vault/latest.json"), "utf8"));

test("the builder's rejection is COUNTED and REASONED, never a bare continue", () => {
  assert.match(buildLegs, /BUILD_INVENTORY_SPORTS/);
  assert.match(buildLegs, /BUILD_INVENTORY_EXCLUSIONS/);
  assert.match(buildLegs, /export function buildOptimizerLegExclusions/);
  // the accepted set is UNCHANGED — this release states a rule, it does not admit a new sport
  assert.match(buildLegs, /new Set\(\["nba", "mlb"\]\)/);
  // an unregistered sport is refused rather than accepted by default
  assert.match(buildLegs, /an unregistered sport is refused, never accepted by default/);
});

test("the builder and the money path give a reader THE SAME answer about NFL", async () => {
  const { BUILD_INVENTORY_EXCLUSIONS } = await import("../../build-legs.ts");
  const builderReason = BUILD_INVENTORY_EXCLUSIONS.nfl;
  const productRow = eligibility.products.find((p) => p.product === "build-inventory");
  assert.ok(productRow, "the daily evaluation covers the card builder too");
  // both must cite the SAME gate. Wording may differ between a code constant and reader prose;
  // the gate must not.
  for (const text of [builderReason, productRow.reason]) {
    assert.match(text, /experimental/i, "both name the model's experimental status");
    assert.match(text, /validated model version|VALIDATED_PICK/, "both name the validated gate");
  }
  const bankBuilder = eligibility.products.find((p) => p.product === "bank-builder");
  assert.equal(productRow.state, bankBuilder.state,
    "the builder and the paper products cannot reach different verdicts from the same gate");
});

test("PORTRAIT · the shared avatar resolves NFL from the ESPN athlete id", () => {
  assert.match(avatar, /sport\?: "nba" \| "mlb" \| "nfl"/, "the union is widened, not forked");
  assert.match(avatar, /headshots\/nfl\/players\/full\/\$\{playerId\}\.png/);
  // the probe result is recorded so a future author does not have to re-derive it
  assert.match(avatar, /HEAD-probed/);
  assert.match(avatar, /onError lands on the initials disc/);
});

test("the NFL Vault renders that portrait, keyed by an id it actually has", () => {
  assert.match(hub, /import PlayerAvatar from "@\/components\/player-avatar"/);
  assert.match(hub, /<PlayerAvatar playerId=\{espnAthleteId\(c\.playerId\)\}/);
  assert.match(hub, /sport="nfl"/);
  // every rendered row's id parses — otherwise the portrait silently degrades for real players
  const rows = (vault.state === "ACTIVE" ? vault.selections : vault.watchlist).slice(0, 8);
  assert.ok(rows.length > 0, "the Vault renders rows to portray");
  for (const r of rows) {
    assert.match(r.playerId, /^nfl-athlete-\d+$/, `${r.name}: playerId must carry an ESPN athlete id`);
  }
  // a schema change degrades to the initials disc rather than requesting a nonsense URL
  assert.match(hub, /Returns null for anything that is not that shape/);
});

test("no leg was actually admitted — this release states a rule, it does not open a lane", () => {
  assert.equal(eligibility.qualifyingEvents, 0);
  for (const p of eligibility.products) assert.equal(p.eligible, false, `${p.product} must remain closed`);
});
