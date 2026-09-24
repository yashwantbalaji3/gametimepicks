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
/* The portrait wiring moved to the shared prediction grammar; the CLAIM did not move, it widened. */
const board = fs.readFileSync(path.join(APP, "src/components/prediction/prediction-board.tsx"), "utf8");
const adapter = fs.readFileSync(path.join(APP, "src/lib/prediction-presentation/nfl.ts"), "utf8");
const weekPage = fs.readFileSync(path.join(APP, "src/app/nfl/week/[key]/page.tsx"), "utf8");
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
  /*
   * Both must cite the SAME gate. Wording may differ between a code constant and reader prose; the
   * gate must not.
   *
   * P224: unless the evaluation never REACHED the gate. Between a settled slate and the next window
   * there is no pre-kickoff event to consider, and the artifact answers with the operational blocker
   * — "no pre-kickoff NFL event was available to evaluate — this says nothing about the model". That
   * is the honest answer to a different question, not drift, and demanding the model gate there
   * would push the builder to report a model verdict it never formed.
   */
  assert.match(builderReason, /experimental/i, "the builder constant names the model's experimental status");
  assert.match(builderReason, /validated model version|VALIDATED_PICK/, "and the validated gate");

  const refusedForLackOfEvents = /no pre-kickoff NFL event was available/i.test(productRow.reason);
  if (refusedForLackOfEvents) {
    assert.match(productRow.reason, /says nothing about the model/i,
      "an operational refusal must disclaim any model finding, so the two answers cannot be confused");
    assert.equal(eligibility.consideredEvents, 0, "and it may only be given when nothing was considered");
  } else {
    assert.match(productRow.reason, /experimental/i, "both name the model's experimental status");
    assert.match(productRow.reason, /validated model version|VALIDATED_PICK/, "both name the validated gate");
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

test("every NFL player prediction renders that portrait, keyed by an id it actually has", () => {
  /*
   * THE CLAIM MOVED OWNERS AND GOT WIDER. It used to pin one literal in the /nfl hub
   * (`<PlayerAvatar playerId={espnAthleteId(c.playerId)}`), which covered the Endzone Vault and
   * nothing else — the five weekly top boards rendered the same players with no portrait at all.
   * The portrait now lives in the shared prediction board, so the assertions follow it there. This
   * is the same property enforced over SIX surfaces instead of one, not a guard relaxed to pass.
   */
  assert.match(board, /import PlayerAvatar from "@\/components\/player-avatar"/);
  assert.match(board, /<PlayerAvatar playerId=\{p\.player\.portraitId\}/);
  assert.match(board, /sport="nfl"/);

  // ONE identity owner. The hub must not carry a second copy of the id rule.
  assert.match(adapter, /export const espnAthleteId/, "the adapter owns the id rule");
  assert.doesNotMatch(hub, /const espnAthleteId = /,
    "the hub must import the shared rule, never redeclare it — two copies is how two surfaces start disagreeing about who a player is");
  assert.match(adapter, /portraitId: espnAthleteId\(/, "the presentation derives the portrait id from the canonical player key");
  // a schema change degrades to the initials disc rather than requesting a nonsense URL
  assert.match(adapter, /Returns null for anything that is not that shape/);

  // Both NFL player surfaces go through the shared grammar.
  assert.match(hub, /presentVaultCandidate/, "the Vault renders through the shared presentation");
  assert.match(weekPage, /presentWeeklyBoard/, "the weekly top boards render through the shared presentation");
  assert.match(weekPage, /<PredictionBoard/);

  // every rendered Vault row's id parses — otherwise the portrait silently degrades for real players
  const rows = (vault.state === "ACTIVE" ? vault.selections : vault.watchlist).slice(0, 8);
  /*
   * A WINDOW WITH NO EVENTS HAS NO ROWS TO PORTRAY (P233 · A). NFL opens 2026-09-09 and the Vault
   * evaluates a 48-hour horizon, so between cards `NO_VAULT` with an empty watchlist is the honest
   * output. The portrait wiring above is still asserted — that is the claim; the row count is not.
   */
  if (rows.length === 0) {
    assert.equal(vault.candidateCount, 0, "an empty watchlist means an empty window, not a dropped row");
    return;
  }
  for (const r of rows) {
    assert.match(r.playerId, /^nfl-athlete-\d+$/, `${r.name}: playerId must carry an ESPN athlete id`);
  }
});
