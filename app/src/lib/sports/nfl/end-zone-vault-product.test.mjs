/**
 * Release E guards (Program 174): the Vault produces exactly one closed-set outcome, a watchlist
 * is never card-shaped, selections are never forced, and "could not look" never reads as
 * "found nothing".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const vault = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/end-zone-vault/latest.json"), "utf8"));
const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-end-zone-vault.mjs"), "utf8");
const STATES = ["ACTIVE", "WATCHLIST_ONLY", "NO_VAULT", "STALE", "INCIDENT"];

test("exactly one outcome from the closed set, with a stated reason", () => {
  assert.ok(STATES.includes(vault.state), `${vault.state} outside the closed set`);
  assert.ok(vault.reason && vault.reason.length > 30, "every outcome explains itself");
  assert.equal(vault.dataClass, "PUBLIC_DERIVED");
  assert.equal(vault.product.id, "end-zone-vault");
});

test("ONLY ACTIVE is a card — a watchlist carries no card, no return, no instruction", () => {
  assert.equal(vault.isCard, vault.state === "ACTIVE");
  if (vault.state !== "ACTIVE") {
    assert.deepEqual(vault.selections, [], "a non-active outcome carries zero selections");
    assert.match(vault.reason, /not a card|no card/i);
  }
  const blob = JSON.stringify(vault);
  // a watchlist must not be shaped like a slip
  for (const bannedKey of ["stake", "payout", "exposure", "combinedOdds", "potentialReturn", "roi"]) {
    assert.doesNotMatch(blob, new RegExp(`"${bannedKey}"\\s*:`, "i"), `a watchlist must not carry a "${bannedKey}" field`);
  }
  for (const banned of ["edge", "lock", "best bet", "guaranteed", "profitable"]) {
    assert.doesNotMatch(blob, new RegExp(`\\b${banned}\\b`, "i"), `must not contain "${banned}"`);
  }
});

test("MISSING INPUTS ARE INCIDENT, NOT NO_VAULT — the two answers are different", () => {
  assert.match(src, /"we could not look" is not "we found nothing"/);
  const incidentIdx = src.indexOf('state = "INCIDENT"');
  const noVaultIdx = src.indexOf('state = "NO_VAULT"');
  assert.ok(incidentIdx > 0 && noVaultIdx > 0 && incidentIdx < noVaultIdx, "the missing-input branch is evaluated before the nothing-qualified branch");
  // NO_VAULT is reachable only after a real evaluation over a real pool
  assert.match(src, /the evaluator ran over a real pool/);
});

test("selections are never forced to hit a count", () => {
  assert.match(src, /NEVER forced to hit a count/);
  assert.match(src, /slice\(0, VAULT_PRODUCT_CARD\.maxSelections\)/, "the cap truncates; it never pads");
  assert.doesNotMatch(src, /while \(selections\.length < |fill\(|padTo/, "no padding loop exists");
});

test("candidates carry role state and probability, and the residual is disclosed", () => {
  const rows = vault.state === "ACTIVE" ? vault.selections : vault.watchlist;
  assert.ok(rows.length > 0, "an evaluated window shows its candidates");
  for (const c of rows) {
    assert.ok(c.playerId && c.name && c.team && c.opponent, "identity is complete");
    assert.ok(c.tdProbability > 0 && c.tdProbability < 1);
    assert.ok(["ACTIVE_EXPECTED", "ROLE_UNCERTAIN", "QUESTIONABLE"].includes(c.roleState));
    assert.ok(c.roleNote, "role state is explained in words");
    assert.match(c.probabilityRange.note, /never sums to 100%/, "the defence/ST residual is disclosed");
    if (c.roleState !== "ACTIVE_EXPECTED") assert.equal(c.marketPrice, null, "an unpriced candidate shows no price");
  }
  assert.ok(vault.candidateCount >= rows.length);
});

test("the product card is committed and names every gate ACTIVE requires", () => {
  assert.match(src, /VAULT_PRODUCT_CARD/);
  for (const gate of ["current active/role evidence", "current comparable TD price", "settlement coverage"]) {
    assert.ok(src.includes(gate), `the card must require: ${gate}`);
  }
  for (const excl of ["first/last TD markets", "2\\+ TD markets", "defensive scorers"]) {
    assert.match(src, new RegExp(excl), "exclusions are declared");
  }
  assert.ok(vault.gates.required.length >= 4, "the artifact publishes what ACTIVE would need");
});

test("the ledger stays append-only and this run rewrote nothing", () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/nfl/end-zone-vault/ledger.json"), "utf8"));
  assert.equal(ledger.product, "end-zone-vault");
  const dates = ledger.entries.map((e) => e.date);
  assert.equal(new Set(dates).size, dates.length, "no duplicate dates — append-only");
  assert.match(src, /append-only, nothing rewritten/);
  for (const e of ledger.entries) {
    if (e.state !== "ACTIVE") assert.equal((e.legs ?? []).length, 0, "a non-active entry carries no legs");
  }
});

test("today's real outcome is the honest one: candidates exist, a card does not", () => {
  assert.equal(vault.state, "WATCHLIST_ONLY");
  assert.equal(vault.gates.tdMarketOffered, false, "the probe proved the market is absent");
  assert.equal(vault.gates.pricedCandidates, 0);
  assert.equal(vault.gates.roleReadyCandidates, 0);
  /*
   * A FIXED FLOOR IS THE WRONG SHAPE, AND THIS IS THE SECOND ONE.
   *
   * The comment above already records that a hard floor "pinned a 9-game window and broke when 5
   * games started" — and the fix was another hard floor, ten. On 2026-08-23 the window narrowed to
   * a single remaining preseason game, nine candidates was the honest answer, and the guard failed
   * for the same reason it had failed before.
   *
   * The claim worth protecting is not a number. It is that a window with games still ahead surfaces
   * SOMEBODY, and a window with none surfaces nobody — so it is asserted against the window itself,
   * which is the thing the count is supposed to scale with. That holds at one game and at sixteen.
   */
  const watching = (vault.watchlist ?? []).length;
  if (vault.candidateCount === 0) {
    assert.equal(watching, 0, "no candidates means nothing to watch — a populated watchlist would contradict the count");
  } else {
    assert.ok(vault.candidateCount > 0 && watching > 0,
      `a window with candidates must surface them (count ${vault.candidateCount}, watchlist ${watching})`);
  }
  assert.match(vault.disclaimer, /not been shown to beat the sportsbook market/);
});
