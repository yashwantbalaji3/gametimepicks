/**
 * MEMBERSHIP MUST BE EARNED — Program 230 · F1.
 *
 * Run: npx tsx --test src/lib/products/lifecycle-registry.test.mjs
 *
 * Four signature products sat PARTIAL, each missing only `lifecycle`, and the check behind that
 * dimension was a regex over the state machine's own source for the quoted product id. So the
 * distance between "Homer Nukes has a lifecycle contract" and "somebody typed homer-nukes" was a
 * pair of quotes, and F1 could have been closed by editing one array — no receipt, no settlement,
 * no ledger. These tests are the reason that shortcut no longer exists.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { registerProducts, PRODUCT_REGISTRY, GOVERNED_PRODUCTS, LIFECYCLE_OWNERSHIP, OWNERSHIP_PATHS } from "./lifecycle-registry.mjs";
import { GOVERNED_PRODUCTS as MACHINE_GOVERNED, productWatchdog } from "./daily-state-machine.mjs";

const complete = (id, over = {}) => ({
  id, label: id, policyVersion: `${id}@1`,
  producer: `producer/${id}`, selectionGate: `gate/${id}`, freeze: `freeze/${id}`,
  settlementAdapter: `settle/${id}`, ledger: `ledger/${id}.json`, receiptOwner: `receipt/${id}`, ledgerKind: "money",
  ...over,
});

test("a product naming every owner is governed", () => {
  const r = registerProducts([complete("alpha")]);
  assert.deepEqual(r.ids, ["alpha"]);
  assert.equal(r.isGoverned("alpha"), true);
  assert.equal(r.isGoverned("beta"), false);
});

test("THE LABEL-ONLY PRODUCT IS REFUSED, and the refusal names what is missing", () => {
  /*
   * The exact shortcut F1 must not permit: a product added to the governed list because its name is
   * known, not because anything behind it exists.
   */
  for (const field of LIFECYCLE_OWNERSHIP) {
    const entry = complete("homer-nukes");
    delete entry[field];
    assert.throws(
      () => registerProducts([entry]),
      (e) => e.message.includes("homer-nukes") && e.message.includes(field),
      `a product with no ${field} must be refused, by name`,
    );
  }
  /* A bare id with nothing else is the purest form of it. */
  assert.throws(() => registerProducts([{ id: "ghost", label: "ghost", policyVersion: "g@1" }]), /cannot be governed/);
});

test("A PRODUCT WITHOUT SETTLEMENT CANNOT BE GOVERNED", () => {
  /*
   * The unfalsifiable-record shape: something that publishes a card and has no path to grade it
   * produces a public claim nobody can ever check. Moonshot did exactly this with two cards for
   * fifteen days.
   */
  const entry = complete("publishes-only");
  delete entry.settlementAdapter;
  assert.throws(() => registerProducts([entry]), /settlementAdapter/);
});

test("TWO PRODUCTS MAY NOT SHARE A RECORD — but may share an artifact", () => {
  /*
   * One record holding two products is how a losing lane borrows a winning one's history — and from
   * outside it reads as a single healthy product.
   *
   * The rule is about the RECORD, not the filename. `parlays/lab-ledger.json` is one artifact
   * holding five independent streams, each with its own wins, losses, stake and return; those
   * records are genuinely separate and both sport ladders live there. Comparing paths alone would
   * have refused a correct registration, and refusing correct things teaches people to loosen the
   * rule until it stops catching the wrong ones.
   */
  assert.throws(
    () => registerProducts([complete("a", { ledger: "shared.json" }), complete("b", { ledger: "shared.json" })]),
    (e) => /both claim the record/.test(e.message) && e.message.includes("a") && e.message.includes("b"),
  );

  /* Same artifact, same STREAM — still the failure, and the one that actually matters. */
  assert.throws(
    () => registerProducts([
      complete("a", { ledger: "lab.json", ledgerStream: "ufc" }),
      complete("b", { ledger: "lab.json", ledgerStream: "ufc" }),
    ]),
    /both claim the record lab\.json#ufc/,
  );

  /* Same artifact, DIFFERENT streams — permitted, because the records are separate. */
  const ok = registerProducts([
    complete("a", { ledger: "lab.json", ledgerStream: "ufc" }),
    complete("b", { ledger: "lab.json", ledgerStream: "epl" }),
  ]);
  assert.deepEqual(ok.ids, ["a", "b"]);
});

test("LIVE · no two registered products share a record", () => {
  /* The invariant asserted against the real registry, not a fixture. */
  const seen = new Map();
  for (const id of GOVERNED_PRODUCTS) {
    const p = PRODUCT_REGISTRY.get(id);
    const identity = p.ledgerStream ? `${p.ledger}#${p.ledgerStream}` : p.ledger;
    assert.equal(seen.get(identity), undefined, `${id} and ${seen.get(identity)} share ${identity}`);
    seen.set(identity, id);
  }
});

test("REFUSAL · a duplicate id cannot silently replace the first registration", () => {
  assert.throws(
    () => registerProducts([complete("dup"), complete("dup", { ledger: "ledger/other.json" })]),
    /registered twice/,
  );
});

test("the state machine's membership IS the registry's — not a second list beside it", () => {
  assert.deepEqual([...MACHINE_GOVERNED], [...GOVERNED_PRODUCTS]);

  /* And the literal cannot come back. The machine used to carry its own frozen array, which is what
     made "who is governed" answerable by editing one line. */
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/products/daily-state-machine.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");
  assert.ok(
    !/GOVERNED_PRODUCTS\s*=\s*Object\.freeze\(\[/.test(code),
    "membership must be imported from the registry, never re-declared here",
  );
});

test("the coverage builder ASKS THE REGISTRY — it no longer greps the machine's source", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/products/build-lifecycle-coverage.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");
  assert.ok(!/machineSource/.test(code), "reading the machine's source text is not evidence of a lifecycle");
  assert.match(code, /PRODUCT_REGISTRY\.isGoverned/, "the registry answers membership");

  /* Keyed by the product's OWN id. Two rows asked about "ufc" and "epl" while the products are
     `ufc-cards` and `epl-cards`, so they were answering about ids that do not exist. */
  const ids = [...code.matchAll(/id:\s*"([a-z-]+)"/g)].map((m) => m[1]);
  const asked = [...code.matchAll(/governedByMachine\("([a-z-]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(asked, ids, "each row asks about its own id, in order");
});

test("the watchdog alarms for a governed product with no receipt — and only for those", () => {
  /*
   * This is why a product is registered on the day its receipt is real, not the day its name is
   * known: an unwired product alarms every day forever, and a watchdog that cries wolf gets
   * switched off along with its true alarms.
   */
  const alerts = productWatchdog([], 0);
  assert.deepEqual(alerts.map((a) => a.product).sort(), [...GOVERNED_PRODUCTS].sort());
  assert.ok(alerts.every((a) => a.kind === "MISSING_DAILY_EVALUATION"));
});

test("every registered product's declared owners actually exist on disk", () => {
  /*
   * A path that points at nothing is the same failure one level down: the registration LOOKS earned
   * and nothing is behind it. Owners are repo-relative to the app or the root.
   */
  /* Owners are REPO-ROOT relative, one base only. Resolving against two bases would let
     `scripts/foo` mean either the app's or the root's, and a path that resolves by accident is the
     same failure this test exists to catch, one level down. */
  const ROOT = path.join(process.cwd(), "..");
  const resolves = (rel) => fs.existsSync(path.join(ROOT, rel));
  const missing = [];
  for (const id of GOVERNED_PRODUCTS) {
    const p = PRODUCT_REGISTRY.get(id);
    for (const field of OWNERSHIP_PATHS) {
      if (!resolves(p[field])) missing.push(`${id}.${field} → ${p[field]}`);
    }
  }
  assert.deepEqual(missing, [], `declared owners that do not exist: ${missing.join("; ")}`);
});
