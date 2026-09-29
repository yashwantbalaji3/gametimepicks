/**
 * P2-B · the NFL public status describes what the boards actually publish (P330's owner rule), for the
 * player families AND anytime touchdown. Fixture rules + one live-tree reconciliation (which announces
 * itself when the current period has no boards, rather than passing on nothing).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { familyPublication, constituentBoards } from "./family-publication.mjs";

const board = (families, week = 4) => ({ seasonType: 2, week, players: [], families });
const PERIOD = { seasonType: 2, week: 4 };
const V1 = "props-v1 evaluation: n=3575, all promotion bars pass";

test("🔴 every board publishing from ONE basis with no model id is PUBLISHED — not 'MIXED'", () => {
  const boards = Array.from({ length: 16 }, () => board({ player_receptions: { state: "PUBLISHED", basis: V1 } }));
  const row = familyPublication("player_receptions", { label: "Receptions" }, constituentBoards(boards, PERIOD));
  assert.equal(row.state, "PUBLISHED");
  assert.equal(row.modelId, null, "named by its basis, never given a model id it does not carry");
  assert.deepEqual(row.publication.bases, [V1], "the basis is kept as metadata");
  assert.doesNotMatch(row.detail, /props-v1|anytime-td-v1|player-props-v1/, "reader copy never carries an internal engine id");
});

test("genuinely mixed publication still reads MIXED, never rounded up", () => {
  const two = [board({ f: { state: "PUBLISHED", basis: V1 } }), board({ f: { state: "PUBLISHED", basis: "share-level" } })];
  assert.equal(familyPublication("f", { label: "F" }, constituentBoards(two, PERIOD)).state, "MIXED", "two bases");
  const split = [board({ f: { state: "PUBLISHED", basis: V1 } }), board({ f: { state: "ESTIMATE" } })];
  assert.equal(familyPublication("f", { label: "F" }, constituentBoards(split, PERIOD)).state, "MIXED", "published on one, estimate on another");
  const oneModel = [board({ f: { state: "PUBLISHED", model: "m1", basis: "b" } }), board({ f: { state: "PUBLISHED", model: "m1", basis: "b" } })];
  assert.equal(familyPublication("f", { label: "F" }, constituentBoards(oneModel, PERIOD)).modelId, "m1", "the model-id path is unchanged");
});

test("🔴 the status builder derives anytime touchdown from the boards, keeping Endzone Vault's own truth", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/build-nfl-public-status.mjs"), "utf8");
  assert.match(src, /const tdOnBoards = familyPublication\("anytime_td", anytimeTdHeld, constituentBoards\(perGameBoards, windowPeriod\)\);/);
  assert.match(src, /tdOnBoards\.state === "PUBLISHED"/);
  assert.match(src, /Endzone Vault makes no selection/, "the watchlist product never inherits the boards' publication");
});

test("live tree: model-status tells the same story as this period's boards", () => {
  const app = process.cwd();
  const status = JSON.parse(fs.readFileSync(path.join(app, "public/data/nfl/model-status.json"), "utf8"));
  const dir = path.join(app, "public/data/nfl/player-board");
  const boards = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const period = status.window && Number.isFinite(status.window.week) ? status.window : null;
  const cons = constituentBoards(boards, period);
  if (!cons.length) { console.log("# no boards for the status window — nothing to reconcile (announced, not passed silently)"); return; }
  const allTd = cons.every((b) => b.families?.anytime_td?.state === "PUBLISHED");
  if (allTd) assert.equal(status.anytimeTd?.state, "PUBLISHED", "boards publish TD on every game, so the status must not say it is held");
  for (const f of status.playerFamilies ?? []) {
    if (f.source !== "boards") continue;
    const states = new Set(cons.map((b) => b.families?.[f.key]?.state ?? "ABSENT"));
    if (states.size === 1 && states.has("PUBLISHED")) assert.notEqual(f.state, "MIXED", `${f.key}: every board publishes, so it is not "MIXED"`);
  }
});
