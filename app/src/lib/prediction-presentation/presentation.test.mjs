/**
 * THE OWNERSHIP BOUNDARIES OF THE PREDICTION PRESENTATION, AND PROOF THEY ARE LOAD-BEARING.
 *
 * The product contract keeps four kinds of truth apart: the pre-game model forecast (ours), the frozen
 * pre-game market (a book's, at a named instant), live factual state (the provider's) and final
 * settlement (canonical). The presentation layer is where they would silently merge — one careless
 * fallback and a model number renders in the market slot, or a current line stands in for the line at
 * publication. These tests are about that boundary, not about the numbers.
 *
 * Run: npx tsx --test src/lib/prediction-presentation/presentation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { marketFromFrozenCapture, marketFromPricingState } from "./contract.ts";
import { NFL_FAMILIES, espnAthleteId, presentVaultCandidate, presentWeeklyBoard, presentWeeklyBoardRow } from "./nfl.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = process.cwd();

const artifact = {
  generatedAt: "2026-09-23T23:26:45Z",
  model: { id: "nfl-regular-season-public-v1", version: 2, launchState: "PUBLIC_EXPERIMENTAL" },
  boards: [],
};
const yardRow = {
  playerId: "nfl-athlete-4430878", name: "Jaxon Smith-Njigba", team: "SEA", opponent: "WSH",
  providerEventId: "401872955", kickoffUtc: "2026-09-27T17:00Z", participation: "AVAILABLE_ROLE_UNCERTAIN",
  value: 107.5105, p10: 51, median: 108, p90: 196, pricingState: "NOT_AUTHORIZED",
};
const tdRow = {
  playerId: "nfl-athlete-4242335", name: "Jonathan Taylor", team: "IND", opponent: "HOU",
  providerEventId: "401872951", kickoffUtc: "2026-09-27T17:00Z", participation: "AVAILABLE_ROLE_UNCERTAIN",
  value: 0.7995, probability: 0.7995, pricingState: "NOT_AUTHORIZED",
};
const yardBoard = { id: "top_reception_yds", family: "player_reception_yds", title: "Top 10 · Receiving yards", state: "PUBLISHED", rows: [yardRow] };
const tdBoard = { id: "top_td", family: "anytime_td", title: "Top 5 · Anytime touchdown", state: "PUBLISHED", rows: [tdRow] };

// ── MODEL AND MARKET ARE DIFFERENT SLOTS WITH DIFFERENT OWNERS ──────────────────────────────────────

test("a model number NEVER lands in the market slot", () => {
  const p = presentWeeklyBoardRow(artifact, yardBoard, yardRow);
  assert.equal(p.model.predictedValue, 108);
  assert.equal(p.market.state, "NOT_AUTHORIZED");
  assert.equal(p.market.frozen, undefined, "no capture exists, so there is nothing to show as a line");
  const marketText = JSON.stringify(p.market);
  for (const n of [108, 107.5105, 51, 196]) {
    assert.ok(!marketText.includes(String(n)), `the market slot must not carry the model's ${n}`);
  }
});

test("an absent market is TYPED and says so in words — never blank, never zero", () => {
  for (const state of ["NOT_AUTHORIZED", "NOT_OFFERED", "NOT_PROBED", "UNSUPPORTED"]) {
    const m = marketFromPricingState(state);
    assert.equal(m.state, state);
    assert.ok(m.note && m.note.length > 10, `${state} must carry a reader-facing reason`);
    assert.equal(m.frozen, undefined);
    assert.ok(!/\b0\b/.test(m.note), "an absence must never read as a zero");
  }
});

test("an unrecognised pricing state fails CLOSED to NOT_PROBED, it is not dropped", () => {
  for (const junk of [null, undefined, "", "SOMETHING_NEW", "priced"]) {
    const m = marketFromPricingState(junk);
    assert.equal(m.state, "NOT_PROBED", `${junk} must not silently become a priced market`);
    assert.ok(m.note, "and it must still render words");
  }
});

test("a frozen price REFUSES to exist without its book and its capture instant", () => {
  assert.throws(() => marketFromFrozenCapture({ line: 71.5, overOdds: -110, underOdds: -110, sportsbook: "", capturedAt: "2026-09-27T12:00Z" }));
  assert.throws(() => marketFromFrozenCapture({ line: 71.5, sportsbook: "draftkings", capturedAt: "" }));
  const ok = marketFromFrozenCapture({ line: 71.5, overOdds: -110, underOdds: -110, sportsbook: "draftkings", capturedAt: "2026-09-27T12:00Z" });
  assert.equal(ok.state, "FROZEN_CAPTURE");
  assert.equal(ok.frozen.line, 71.5);
});

// ── THE MODEL SLOT SAYS WHAT KIND OF NUMBER IT IS ───────────────────────────────────────────────────

test("a probability is published only by a family that HAS one, and a numeric family carries its unit", () => {
  const td = presentWeeklyBoardRow(artifact, tdBoard, tdRow);
  assert.equal(td.model.kind, "PROBABILITY");
  assert.equal(td.model.probability, 0.7995);
  assert.equal(td.model.predictedValue, undefined, "a probability family must not also publish a bare value");
  assert.equal(td.model.unit, undefined);

  const yd = presentWeeklyBoardRow(artifact, yardBoard, yardRow);
  assert.equal(yd.model.kind, "NUMERIC");
  assert.equal(yd.model.unit, "yds");
  assert.equal(yd.model.probability, undefined, "a yardage family publishes no probability");
});

test("every published family declares a kind and, when numeric, a unit", () => {
  for (const [family, spec] of Object.entries(NFL_FAMILIES)) {
    assert.ok(spec.label, `${family} needs a reader-facing label`);
    assert.ok(spec.kind === "PROBABILITY" || spec.kind === "NUMERIC");
    if (spec.kind === "NUMERIC") assert.ok(spec.unit, `${family} is numeric and must name its unit`);
    else assert.equal(spec.unit, undefined, `${family} is a probability and has no unit`);
  }
});

test("the band publishes only when BOTH ends do — a one-sided range is not a range", () => {
  const half = presentWeeklyBoardRow(artifact, yardBoard, { ...yardRow, p90: undefined });
  assert.equal(half.model.p10, undefined);
  assert.equal(half.model.p90, undefined);
  const full = presentWeeklyBoardRow(artifact, yardBoard, yardRow);
  assert.equal(full.model.p10, 51);
  assert.equal(full.model.p90, 196);
});

test("an ESTIMATE family carries the bar it failed, and PUBLISHED carries no caveat", () => {
  const est = presentWeeklyBoardRow(artifact,
    { ...yardBoard, state: "ESTIMATE", caveat: "read the range, not a probability", reason: "SECOND_LOOK_REJECTED" }, yardRow);
  assert.equal(est.model.status, "ESTIMATE");
  assert.equal(est.model.caveat, "read the range, not a probability");
  assert.equal(est.model.reason, "SECOND_LOOK_REJECTED");
  assert.equal(presentWeeklyBoardRow(artifact, yardBoard, yardRow).model.caveat, undefined);
});

// ── IDENTITY AND ASSOCIATION ────────────────────────────────────────────────────────────────────────

test("player, team, opponent and game stay associated with the row they came from", () => {
  const p = presentWeeklyBoardRow(artifact, yardBoard, yardRow);
  assert.equal(p.player.name, "Jaxon Smith-Njigba");
  assert.equal(p.player.teamAbbr, "SEA");
  assert.equal(p.game.opponentAbbr, "WSH");
  assert.equal(p.game.providerEventId, "401872955");
  assert.equal(p.game.startTimeUtc, "2026-09-27T17:00Z");
  assert.notEqual(p.player.teamAbbr, p.game.opponentAbbr, "a player is never his own opponent");
});

test("the portrait id is derived from the canonical key and degrades to null, never to a guess", () => {
  assert.equal(espnAthleteId("nfl-athlete-4430878"), 4430878);
  for (const junk of ["nfl-athlete-", "mlb-person-12345", "4430878", "", null, undefined, "nfl-athlete-abc"]) {
    assert.equal(espnAthleteId(junk), null, `${junk} must not yield a portrait id`);
  }
  assert.equal(presentWeeklyBoardRow(artifact, yardBoard, { ...yardRow, playerId: "nfl-athlete-x" }).player.portraitId, null);
});

test("an unknown family and a withheld board render NOTHING rather than a mislabelled number", () => {
  assert.equal(presentWeeklyBoardRow(artifact, { ...yardBoard, family: "player_tackles" }, yardRow), null);
  assert.equal(presentWeeklyBoardRow(artifact, { ...yardBoard, state: "WITHHELD" }, yardRow), null);
  assert.deepEqual(presentWeeklyBoard(artifact, { ...yardBoard, state: "WITHHELD" }), []);
});

// ── THE VAULT GOES THROUGH THE SAME GRAMMAR, WITHOUT A JOIN ─────────────────────────────────────────

test("the Vault reads its OWN game context — no identity is minted to reach a kickoff", () => {
  const c = {
    playerId: "nfl-athlete-3117251", name: "Christian McCaffrey", team: "SF", position: "RB",
    opponent: "ARI", event: "ARI @ SF", providerEventId: "401872958", kickoffUtc: "2026-09-27T20:05Z",
    tdProbability: 0.558665, roleState: "ACTIVE_EXPECTED", marketPrice: null,
  };
  const p = presentVaultCandidate(c, { forecastAt: "2026-09-23T23:26:45Z", modelId: "nfl-anytime-td-v1", modelVersion: 1 });
  assert.equal(p.game.opponentAbbr, "ARI");
  assert.equal(p.game.startTimeUtc, "2026-09-27T20:05Z");
  assert.equal(p.game.providerEventId, "401872958");
  assert.equal(p.model.kind, "PROBABILITY");
  /*
   * ⚠ THIS PINNED `NOT_AUTHORIZED`, WHICH THE PRESENTER USED TO HARDCODE. It was the right answer
   * while the Vault's `marketPrice` was a literal `null` and props were outside the receipt: there
   * was no typed state on the row to read. Both halves changed on 2026-09-24, and the constant
   * became a claim that we lack an authorization we hold — printed beside weekly-board rows showing
   * a DraftKings price for the same player.
   *
   * The invariant is that an unpriced row gets a TYPED absence, and that the fallback is the
   * LEAST-claiming state rather than the most convenient one. A row with no typed state means we do
   * not know that we asked, which is NOT_PROBED.
   */
  assert.equal(p.market.state, "NOT_PROBED", "no price and no typed state ⇒ the least-claiming absence, never an invented reason");
  assert.equal(
    presentVaultCandidate({ ...c, pricingState: "NOT_OFFERED" }, { forecastAt: "x", modelId: "m", modelVersion: 1 }).market.state,
    "NOT_OFFERED",
    "the producer's own typed state wins — the presenter never decides WHY a price is missing",
  );

  // A Vault row that carries no opponent gets an EMPTY one, never a parse of the rendered label.
  const bare = presentVaultCandidate({ ...c, opponent: null, kickoffUtc: null, providerEventId: null },
    { forecastAt: "x", modelId: "m", modelVersion: 1 });
  assert.equal(bare.game.opponentAbbr, "");
  assert.equal(bare.game.startTimeUtc, "");
});

// ── AGAINST THE REAL COMMITTED ARTIFACT ─────────────────────────────────────────────────────────────

test("every row of every published weekly board presents — measured on the committed artifact", () => {
  const file = path.join(APP, "public/data/nfl/weekly-boards/latest.json");
  if (!fs.existsSync(file)) return; // no committed week: nothing to measure, and nothing claimed
  const live = JSON.parse(fs.readFileSync(file, "utf8"));
  const rendered = live.boards.filter((b) => (b.state === "PUBLISHED" || b.state === "ESTIMATE") && b.rows?.length);
  assert.ok(rendered.length > 0, "the committed artifact publishes at least one board, or this test proves nothing");
  for (const b of rendered) {
    const out = presentWeeklyBoard(live, b);
    assert.equal(out.length, b.rows.length, `${b.id}: every published row must present — a dropped row is a silently shorter board`);
    for (const p of out) {
      assert.ok(p.player.name && p.player.teamAbbr, `${b.id}: a row without a player is not renderable`);
      assert.ok(p.game.startTimeUtc, `${b.id}: the kickoff is in the artifact and must reach the card`);
      /*
       * ⚠ THIS FORBADE `FROZEN_CAPTURE` OUTRIGHT — "no NFL player-prop capture exists, a price here
       * would be invented". That was TRUE and MEASURED when it was written (2026-09-23: every probe
       * recorded all five families absent), and it stopped being true on 2026-09-24 when the
       * founder authorized the probe and DraftKings returned real lines. A guard whose premise is a
       * fact about the world needs the fact re-read, not the guard deleted.
       *
       * What must never happen is a price with NOTHING BEHIND IT. So a frozen capture now has to
       * name its book and its capture instant — the two fields an invented price would not have —
       * and an absence still has to say why. Invention is still caught; a real capture no longer
       * is.
       */
      if (p.market.state === "FROZEN_CAPTURE") {
        assert.ok(p.market.frozen, `${b.id}: a FROZEN_CAPTURE with no frozen block is a price with nothing behind it`);
        assert.ok(p.market.frozen.sportsbook, `${b.id}: a displayed price must name the book it came from`);
        assert.ok(Number.isFinite(Date.parse(p.market.frozen.capturedAt)), `${b.id}: a price without its capture instant cannot be told from a live line`);
      } else {
        assert.ok(p.market.note, `${b.id}: the absent market must still say why`);
      }
      if (p.model.kind === "NUMERIC") assert.ok(p.model.unit, `${b.id}: a numeric forecast needs its unit`);
      else assert.ok(p.model.probability != null, `${b.id}: a probability family must publish one`);
    }
  }
});

// ── MUTATION PROBES ─────────────────────────────────────────────────────────────────────────────────

/** Sibling copy + child process, per the P211 convention: an in-process re-import returns the cached original. */
function mutating(file, find, replace, probeSource) {
  const target = path.join(HERE, file);
  const original = fs.readFileSync(target);
  const digest = crypto.createHash("sha256").update(original).digest("hex");
  const text = original.toString();
  assert.ok(text.includes(find), `mutation anchor not found in ${file} — the source changed shape`);
  for (const stale of fs.readdirSync(HERE).filter((n) => n.includes(".mutation-probe."))) fs.rmSync(path.join(HERE, stale), { force: true });
  const mutatedPath = path.join(HERE, file.replace(/\.ts$/, ".mutation-probe.ts"));
  const probePath = path.join(os.tmpdir(), `gtp-presentation-probe-${digest.slice(0, 8)}.mjs`);
  let out = "";
  try {
    fs.writeFileSync(mutatedPath, text.replace(find, replace));
    fs.writeFileSync(probePath, probeSource(mutatedPath));
    out = execFileSync("npx", ["tsx", probePath], { encoding: "utf8", cwd: APP }).trim();
  } finally {
    fs.rmSync(mutatedPath, { force: true });
    fs.rmSync(probePath, { force: true });
  }
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex"), digest,
    `${file} was NOT left untouched — the probe must never write the live module`);
  return out;
}

test("MUTATION · dropping the attribution check lets an unattributed price render as a fact", () => {
  const out = mutating(
    "contract.ts",
    "  if (!frozen.sportsbook || !frozen.capturedAt) {",
    "  if (false) {",
    (t) => `import { marketFromFrozenCapture } from ${JSON.stringify(t)};
try { const m = marketFromFrozenCapture({ line: 71.5, sportsbook: "", capturedAt: "" });
  console.log(m.state === "FROZEN_CAPTURE" ? "MISSED" : "UNEXPECTED"); }
catch { console.log("CAUGHT"); }`,
  );
  assert.equal(out, "MISSED", "the mutation must defeat the check, or this test proves nothing");
  assert.throws(() => marketFromFrozenCapture({ line: 71.5, sportsbook: "", capturedAt: "" }));
});

test("MUTATION · a fail-open pricing state turns an unknown owner into a priced market", () => {
  const out = mutating(
    "contract.ts",
    '          : "NOT_PROBED";',
    '          : "FROZEN_CAPTURE" as MarketState;',
    (t) => `import { marketFromPricingState } from ${JSON.stringify(t)};
const m = marketFromPricingState("SOMETHING_NEW");
console.log(m.state === "NOT_PROBED" ? "CAUGHT" : "MISSED");`,
  );
  assert.equal(out, "MISSED", "the mutation must defeat the fail-closed default");
  assert.equal(marketFromPricingState("SOMETHING_NEW").state, "NOT_PROBED");
});

test("MUTATION · collapsing the family kind prints a yardage forecast as a probability", () => {
  const out = mutating(
    "nfl.ts",
    '    ...(family.kind === "PROBABILITY"',
    '    ...(true',
    (t) => `import { presentWeeklyBoardRow } from ${JSON.stringify(t)};
const a = { generatedAt: "t", model: { id: "m", version: 1 }, boards: [] };
const b = { id: "top_reception_yds", family: "player_reception_yds", title: "t", state: "PUBLISHED", rows: [] };
const r = ${JSON.stringify(yardRow)};
const p = presentWeeklyBoardRow(a, b, r);
console.log(p.probability != null || p.model.probability != null ? "MISSED" : "CAUGHT");`,
  );
  assert.equal(out, "MISSED", "the mutation must make a yardage family publish a probability");
  assert.equal(presentWeeklyBoardRow(artifact, yardBoard, yardRow).model.probability, undefined);
});
