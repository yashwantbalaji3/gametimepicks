/**
 * Which signature products are actually governed by a lifecycle — and the one shape that matters.
 *
 * Run: npx tsx --test src/lib/products/lifecycle-coverage.test.mjs
 *
 * A closed daily state machine has existed since P211, naming exactly two products. Every other
 * registered product ran on its own bespoke path with no shared contract saying an illegal
 * transition is illegal. That is the gap this inventory states — and the failure it permits is one
 * this repository has already lived twice: Moonshot published cards no settler could reach and
 * called them pending, and Homer Nukes reported a structurally impossible record for weeks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildCoverage, publishesWithoutSettling, COVERAGE_DIMENSIONS, COVERAGE_VERDICTS } from "./lifecycle-coverage.mjs";
import { GOVERNED_PRODUCTS, productWatchdog } from "./daily-state-machine.mjs";

const all = Object.fromEntries(COVERAGE_DIMENSIONS.map((d) => [d, true]));
const prod = (id, over = {}, extra = {}) => ({ id, label: id, evidence: { ...all, ...over }, ...extra });

test("a product with every dimension is GOVERNED", () => {
  const c = buildCoverage({ products: [prod("bank-builder")] });
  assert.equal(c.rows[0].verdict, "GOVERNED");
  assert.deepEqual(c.rows[0].missing, []);
  assert.equal(c.state, "ALL_GOVERNED");
});

test("a missing dimension is named, not summarised away", () => {
  const c = buildCoverage({ products: [prod("homer-nukes", { lifecycle: false })] });
  assert.equal(c.rows[0].verdict, "PARTIAL");
  assert.deepEqual(c.rows[0].missing, ["lifecycle"]);
  assert.deepEqual(c.openGaps, [{ id: "homer-nukes", missing: ["lifecycle"] }]);
  assert.equal(c.state, "GAPS");
});

test("a product with nothing at all is UNGOVERNED, not merely partial", () => {
  const none = Object.fromEntries(COVERAGE_DIMENSIONS.map((d) => [d, false]));
  const c = buildCoverage({ products: [{ id: "ghost", label: "ghost", evidence: none }] });
  assert.equal(c.rows[0].verdict, "UNGOVERNED");
});

test("A FOUNDER GATE IS NOT A COVERAGE FAILURE", () => {
  /*
   * Moonshot's engineering is complete and waiting on an exact token. Counting that as a defect
   * makes the gap list unreadable and pressures someone into "fixing" a product paused on purpose —
   * so the open-gap count stays a list of things somebody can actually do today.
   */
  const c = buildCoverage({ products: [prod("moonshot", { settlement: false, automation: false }, { founderGate: "MOONSHOT_REPAIR_PAUSE_OR_RETIRE" })] });
  assert.equal(c.rows[0].verdict, "PAUSED_FOUNDER");
  assert.equal(c.rows[0].founderGate, "MOONSHOT_REPAIR_PAUSE_OR_RETIRE");
  assert.deepEqual(c.openGaps, [], "a gated product contributes no open gap");
});

test("PUBLISHES WITHOUT SETTLING is singled out — the unfalsifiable-record shape", () => {
  /*
   * Not one gap among six. A product that can publish and cannot settle produces a public record
   * that can never be checked, which is exactly what Moonshot did with two cards for fifteen days.
   */
  const c = buildCoverage({ products: [prod("a", { settlement: false }), prod("b", { producer: false, settlement: false }), prod("c")] });
  assert.deepEqual(publishesWithoutSettling(c), ["a"]);
});

test("every verdict is in the closed vocabulary", () => {
  const c = buildCoverage({ products: [prod("x"), prod("y", { ledger: false }), prod("z", {}, { retired: true })] });
  for (const r of c.rows) assert.ok(COVERAGE_VERDICTS.includes(r.verdict), `${r.verdict} outside the vocabulary`);
  assert.equal(c.rows[2].verdict, "RETIRED");
});

/* ── THE MACHINE'S OWN REGISTRY ────────────────────────────────────────────────────────────────── */

test("the watchdog iterates the REGISTRY, never a literal", () => {
  /*
   * It hardcoded ["bank-builder", "moonshot"], so "which products have a lifecycle contract" was
   * answerable only by reading that one line inside a function.
   */
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/products/daily-state-machine.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");
  assert.ok(!/for \(const product of \["/.test(code), "the product list must not be inlined in the loop");
  assert.ok(Array.isArray(GOVERNED_PRODUCTS) && GOVERNED_PRODUCTS.length > 0);

  // And it must actually use the registry: an empty override yields no per-product alerts.
  const none = productWatchdog([], Date.now(), { products: [] });
  assert.deepEqual(none.filter((a) => a.kind === "MISSING_DAILY_EVALUATION"), []);
  const two = productWatchdog([], Date.now(), { products: ["alpha", "beta"] });
  assert.deepEqual(two.filter((a) => a.kind === "MISSING_DAILY_EVALUATION").map((a) => a.product), ["alpha", "beta"]);
});

test("LIVE · the coverage artifact and the machine's registry agree", () => {
  /*
   * Two places could say which products have a lifecycle; if they drift, the inventory becomes
   * fiction. The artifact's `lifecycle` evidence must equal registry membership, exactly.
   */
  const p = path.join(process.cwd(), "..", "data", "internal", "products", "lifecycle-coverage.json");
  if (!fs.existsSync(p)) return;
  const a = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const row of a.rows ?? []) {
    const governed = row.present.includes("lifecycle");
    assert.equal(
      governed,
      GOVERNED_PRODUCTS.includes(row.id),
      `${row.id}: the coverage artifact and GOVERNED_PRODUCTS disagree about lifecycle governance`,
    );
  }
});

test("LIVE · the inventory covers every product with a public route", () => {
  /*
   * A product missing from this inventory is invisible to it, which would make ALL_GOVERNED a claim
   * about the list rather than about the platform.
   */
  const p = path.join(process.cwd(), "..", "data", "internal", "products", "lifecycle-coverage.json");
  if (!fs.existsSync(p)) return;
  const ids = new Set((JSON.parse(fs.readFileSync(p, "utf8")).rows ?? []).map((r) => r.id));
  for (const expected of ["bank-builder", "moonshot", "homer-nukes", "end-zone-vault", "ufc-cards", "epl-cards"]) {
    assert.ok(ids.has(expected), `${expected} is missing from the lifecycle inventory`);
  }
});
