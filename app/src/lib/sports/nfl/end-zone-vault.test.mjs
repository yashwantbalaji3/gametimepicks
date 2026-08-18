/**
 * Endzone Vault guards (Program 169 · Release G).
 * Run: npx tsx --test src/lib/sports/nfl/end-zone-vault.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildVault, checkVaultCompatibility, validateVaultLedgerAppend, VAULT_MODES } from "./end-zone-vault.mjs";

const LEG = (playerId, providerEventId, state = "PUBLISHABLE") => ({ playerId, providerEventId, state, side: "YES" });

test("compatibility: duplicates, non-publishable legs, and unvalidated same-game pairs refuse with reasons", () => {
  assert.equal(checkVaultCompatibility([LEG("a", "g1"), LEG("a", "g1")]).ok, false);
  assert.equal(checkVaultCompatibility([LEG("a", "g1"), LEG("b", "g2", "MODELLED_NOT_PUBLISHABLE")]).ok, false);
  const sameGame = checkVaultCompatibility([LEG("a", "g1"), LEG("b", "g1")]);
  assert.equal(sameGame.ok, false);
  assert.match(sameGame.errors[0], /CORRELATION_NOT_VALIDATED/);
  const withReceipt = checkVaultCompatibility([LEG("a", "g1"), LEG("b", "g1")], { jointReceipts: { g1: "sim-joint-receipt" } });
  assert.equal(withReceipt.ok, true, "a joint receipt from the shared simulation unlocks same-game pairs");
  const cross = checkVaultCompatibility([LEG("a", "g1"), LEG("b", "g2")]);
  assert.equal(cross.ok, true);
  assert.match(cross.disclosure, /ASSUMED-INDEPENDENT/, "the cross-game assumption is disclosed, never hidden");
  assert.equal(checkVaultCompatibility([LEG("a", "g1")]).ok, false, "one leg is not a card");
});

test("NO_VAULT is first-class: refused boards + failed gates become visible reasons; no card is forced", () => {
  const boards = [
    { state: "REFUSED", providerEventId: "g1", reason: "share incoherence" },
    { state: "BOARD", providerEventId: "g2", teamAbbr: "CIN", rows: [{ playerId: "p1", state: "MODELLED_NOT_PUBLISHABLE", gates: { participation: "FAIL(ROLE_UNCERTAIN)", scorerPrice: "FAIL(AUTH_REQUIRED — no authorized current price)", roleShare: "PASS", calibration: "FAIL(no committed calibration receipt)" }, modelProbability: 0.3 }] },
  ];
  const v = buildVault({ boards, date: "2026-08-13", nowIso: "2026-08-13T03:40:00Z" });
  assert.equal(v.state, "NO_VAULT");
  assert.equal(v.modes.TD_BOARD.count, 0);
  assert.ok(v.noPlayReasons.some((r) => /ROLE_UNCERTAIN/.test(r)));
  assert.ok(v.noPlayReasons.some((r) => /AUTH_REQUIRED/.test(r)));
  assert.equal(v.ledgerEntry.state, "NO_PLAY");
  assert.deepEqual(v.ledgerEntry.legs, []);
  assert.deepEqual(Object.keys(v.modes).length + 1, VAULT_MODES.length, "every mode renders (NO_VAULT is the state)");
});

test("publishable rows rank the TD Board; a same-game top-3 without joint receipts yields BOARD_ONLY", () => {
  const rows = (ps) => ps.map(([id, p]) => ({ playerId: id, name: id, state: "PUBLISHABLE", modelProbability: p, participation: "ACTIVE_PROJECTED", shareBasis: "x", gates: { participation: "PASS", roleShare: "PASS", scorerPrice: "PASS", calibration: "PASS" } }));
  const boards = [{ state: "BOARD", providerEventId: "g1", teamAbbr: "CIN", rows: rows([["a", 0.5], ["b", 0.4], ["c", 0.3]]) }];
  const v = buildVault({ boards, date: "2026-08-13", nowIso: "2026-08-13T03:40:00Z" });
  assert.equal(v.state, "BOARD_ONLY", "board renders; the card refuses on correlation");
  assert.deepEqual(v.modes.TD_BOARD.rows.map((r) => r.playerId), ["a", "b", "c"], "ranked by model probability, fully visible");
  assert.match(v.modes.VAULT_CARD.reasons[0], /CORRELATION_NOT_VALIDATED/);
  const withReceipt = buildVault({ boards, date: "2026-08-13", nowIso: "2026-08-13T03:40:00Z", jointReceipts: { g1: "sim-joint" } });
  assert.equal(withReceipt.state, "ACTIVE");
  assert.equal(withReceipt.ledgerEntry.state, "ACTIVE");
  assert.equal(withReceipt.ledgerEntry.legs.length, 3);
});

test("ledger discipline: separate product, append-only, no forced cards, closed states", () => {
  const ledger = { product: "end-zone-vault", version: 1, entries: [{ date: "2026-08-12", state: "NO_PLAY", legs: [] }] };
  assert.equal(validateVaultLedgerAppend(ledger, { date: "2026-08-13", state: "NO_PLAY", legs: [] }).ok, true);
  assert.equal(validateVaultLedgerAppend(ledger, { date: "2026-08-12", state: "NO_PLAY", legs: [] }).ok, false, "duplicate date = overwrite attempt = refused");
  assert.equal(validateVaultLedgerAppend({ product: "mr-dub" }, { date: "2026-08-13", state: "NO_PLAY", legs: [] }).ok, false, "another product's ledger refuses");
  assert.equal(validateVaultLedgerAppend(ledger, { date: "2026-08-13", state: "ACTIVE", legs: [] }).ok, false, "ACTIVE needs legs");
  assert.equal(validateVaultLedgerAppend(ledger, { date: "2026-08-13", state: "NO_PLAY", legs: [LEG("a", "g1")] }).ok, false, "NO_PLAY carries no legs");
  assert.equal(validateVaultLedgerAppend(ledger, { date: "2026-08-13", state: "MAYBE" }).ok, false);
});

test("REAL LEDGER · the committed first entry is today's honest NO_PLAY and validates", () => {
  const p = path.join(process.cwd(), "..", "data/internal/nfl/end-zone-vault/ledger.json");
  const ledger = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(ledger.product, "end-zone-vault");
  assert.equal(ledger.dataClass, "PRIVATE_RESEARCH");
  assert.ok(ledger.entries.length >= 1);
  const first = ledger.entries[0];
  assert.equal(first.state, "NO_PLAY");
  assert.ok(first.reasons.length >= 2, "the hold names its reasons");
  assert.equal(validateVaultLedgerAppend({ ...ledger, entries: [] }, first).ok, true);
  assert.ok(!JSON.stringify(ledger).includes("bankroll"), "no money fields — this ledger never blends into protected records");
});
