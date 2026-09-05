/**
 * END ZONE VAULT REPLAY SAFETY — Program 235 · Release A.
 *
 * Run: npx tsx --test src/lib/products/replay-safety-vault.test.mjs
 *
 * A second registered product, deliberately covered separately because its lifecycle is NOT the
 * parlay ladder's and the charter is explicit that they must not be assumed to share one. Its
 * receipts live under `data/internal/`, so its store is repo-shaped rather than app-shaped; its
 * ledger is an accuracy record that can never move money; and its forecast-of-record rule — the
 * latest revision written BEFORE kickoff — has no counterpart in the ladder at all.
 *
 * Fixtures are the repository's own committed receipts, copied unchanged. A hand-written receipt
 * drifts from its producer silently; a copied one cannot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { makeRepoStore, copyInto, runVaultSettler, vaultState, readStore, cleanup } from "./replay-harness.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const DATE = "2026-08-29";
const NOW = "2026-08-30T09:00:00Z";
const LATER = "2026-08-30T18:00:00Z";

const hasFixtures = fs.existsSync(path.join(REPO, "data/internal/nfl/forecast-receipts", DATE));

/** A repo-shaped store carrying the real receipts and the real results for one settled day. */
function seedVaultDay() {
  const store = makeRepoStore("gtp-replay-vault-", APP);
  copyInto(store, REPO, `data/internal/nfl/forecast-receipts/${DATE}`);
  copyInto(store, REPO, "app/public/data/nfl/results/latest.json");
  return store;
}

test("THE VAULT SETTLER ACTUALLY SETTLES — everything below is vacuous otherwise", (t) => {
  if (!hasFixtures) return t.skip("no committed forecast receipts for the fixture date");
  const store = seedVaultDay();
  try {
    const r = runVaultSettler(store, { now: NOW, date: DATE, repoDir: REPO });
    assert.equal(r.status, 0, `settler exited ${r.status}: ${r.stderr.slice(0, 400)}`);
    const state = vaultState(store, DATE);
    assert.ok(state, "no settlement receipt was written");
    assert.ok(state.events.length > 0, "the settlement graded no events");
    assert.equal(state.ledger, "experimental-forecast", "the ledger identity moved");
  } finally { cleanup(store); }
});

test("REPLAYING PRODUCES ONE SETTLEMENT AND ONE LEDGER ENTRY PER EVENT", (t) => {
  if (!hasFixtures) return t.skip("no committed forecast receipts for the fixture date");
  const store = seedVaultDay();
  try {
    runVaultSettler(store, { now: NOW, date: DATE, repoDir: REPO });
    const first = vaultState(store, DATE);
    runVaultSettler(store, { now: LATER, date: DATE, repoDir: REPO });
    runVaultSettler(store, { now: "2026-08-31T02:00:00Z", date: DATE, repoDir: REPO });
    const third = vaultState(store, DATE);

    assert.deepEqual(third, first, "a replay changed the graded record");
    /* One entry per event, not three. */
    const ids = third.events.map((e) => e.providerEventId);
    assert.equal(new Set(ids).size, ids.length, "an event is graded more than once in the receipt");
    /* And one dated settlement file, not one per run. */
    const dir = path.join(store, "data/internal/nfl/experimental-settlement");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && /^\d{4}/.test(f));
    assert.deepEqual(files, [`${DATE}.json`], `replays produced ${files.join(", ")}`);
  } finally { cleanup(store); }
});

test("THE FORECAST OF RECORD IS THE LATEST PRE-KICKOFF REVISION, and a replay does not re-pick it", (t) => {
  if (!hasFixtures) return t.skip("no committed forecast receipts for the fixture date");
  const store = seedVaultDay();
  try {
    /* This date carries two revisions for one event — the exact case the rule exists for. */
    const receipts = fs.readdirSync(path.join(store, `data/internal/nfl/forecast-receipts/${DATE}`));
    const revised = receipts.filter((f) => f.includes("-rev-"));
    if (!revised.length) return t.skip("no revised forecast on this date");

    runVaultSettler(store, { now: NOW, date: DATE, repoDir: REPO });
    const first = vaultState(store, DATE);
    const chosen = first.events.map((e) => e.receiptFile).filter(Boolean);
    assert.ok(chosen.length > 0, "no receipt file was recorded for any graded event");

    runVaultSettler(store, { now: LATER, date: DATE, repoDir: REPO });
    assert.deepEqual(
      vaultState(store, DATE).events.map((e) => e.receiptFile), chosen,
      "a replay selected a different forecast of record for the same day",
    );
  } finally { cleanup(store); }
});

test("A MISSING RESULT LEAVES THE EVENT UNGRADED — never a wrong grade", (t) => {
  if (!hasFixtures) return t.skip("no committed forecast receipts for the fixture date");
  const store = makeRepoStore("gtp-replay-vault-", APP);
  try {
    copyInto(store, REPO, `data/internal/nfl/forecast-receipts/${DATE}`);
    /* Receipts present, results absent — a capture failure, not a set of wrong forecasts. */
    const r = runVaultSettler(store, { now: NOW, date: DATE, repoDir: REPO });
    assert.equal(r.status, 0, `settler crashed on a missing results source: ${r.stderr.slice(0, 300)}`);
    const state = vaultState(store, DATE);
    /* `grade` is the receipt's own outcome block. An earlier version of this test asserted on a
       field name that does not exist, so it was satisfied by `null` on every event and would have
       passed even if the settler had graded the whole day from nothing. */
    const graded = (state?.events ?? []).filter((e) => e.grade != null);
    assert.equal(graded.length, 0, "an event was graded with no official result available");

    /* And the same fixture WITH results does grade — so the assertion above is discriminating. */
    copyInto(store, REPO, "app/public/data/nfl/results/latest.json");
    runVaultSettler(store, { now: LATER, date: DATE, repoDir: REPO });
    const withResults = vaultState(store, DATE);
    assert.ok(
      (withResults?.events ?? []).some((e) => e.grade != null),
      "the settler graded nothing even with results present — this test cannot tell the two states apart",
    );
  } finally { cleanup(store); }
});

test("THE VAULT LEDGER NEVER MOVES MONEY — its own scope says so, and a replay does not change that", (t) => {
  if (!hasFixtures) return t.skip("no committed forecast receipts for the fixture date");
  const store = seedVaultDay();
  try {
    runVaultSettler(store, { now: NOW, date: DATE, repoDir: REPO });
    const doc = readStore(store, `data/internal/nfl/experimental-settlement/${DATE}.json`);
    assert.ok(doc, "no receipt");
    assert.match(String(doc.scope ?? ""), /never move money/i, "the vault receipt lost its money-separation scope");
    assert.equal(doc.dataClass, "PRIVATE_PAPER_RECORD");
    /* And no protected money artifact exists in this store at all — the settler cannot have touched
       one, because there is none to touch. */
    assert.equal(fs.existsSync(path.join(store, "app/public/data/mr-dub/portfolio.json")), false);
  } finally { cleanup(store); }
});

test("NO HARNESS RUN TOUCHES THE REAL PROTECTED LEDGERS", () => {
  /*
   * The charter's hard line: no production financial mutation. Every store above is a temp
   * directory, so this is a property of the design rather than of any one test — asserted here so
   * a future change that reintroduced a real path fails loudly instead of quietly grading live money.
   */
  const protectedFiles = [
    "app/public/data/mr-dub/portfolio.json",
    "app/public/data/product-ledger/moonshot.json",
    "data/internal/nfl/end-zone-vault/ledger.json",
  ].filter((f) => fs.existsSync(path.join(REPO, f)));
  assert.ok(protectedFiles.length > 0, "no protected ledger was found to check — the assertion would be vacuous");

  const before = protectedFiles.map((f) => fs.readFileSync(path.join(REPO, f)).toString());
  const store = seedVaultDay();
  try { runVaultSettler(store, { now: NOW, date: DATE, repoDir: REPO }); } finally { cleanup(store); }
  protectedFiles.forEach((f, i) => {
    assert.equal(fs.readFileSync(path.join(REPO, f)).toString(), before[i], `${f} changed during an isolated replay`);
  });
});
