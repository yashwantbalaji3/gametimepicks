/**
 * A GOVERNED PRODUCT'S PRODUCER MUST PROVE IT PRODUCED — Program 230 · F2.
 *
 * Run: npx tsx --test src/lib/products/producer-assertion.test.mjs
 *
 * A workflow step's exit code answers "did the command return zero". Whether the product did its
 * work is a different question, and this repository keeps finding out the hard way that the two come
 * apart quietly:
 *
 *   · nightly-settle's ladder step became `node … || true fi`, which exits 0 having run nothing.
 *     The job reported success and 2026-08-17 never settled.
 *   · ufc-fight-week made a successful PAID call and wrote no artifact at all.
 *   · nfl-event-window succeeded nine times between 2026-08-30 and 09-01 while the End Zone Vault
 *     ledger gained no entry on any of them — the Vault's builder sat inside a step gated on
 *     `events != '0'`, so on the quiet days it never ran and nothing said so.
 *
 * The cron watchdog cannot catch this class: it asks which RUNS exist, and in every case above the
 * runs existed and were green. `assert-run-produced` asks the only question that separates them —
 * is the artifact on disk, written DURING this run.
 *
 * This guard makes that a property of being governed rather than something each workflow author
 * remembers. If a product is in the registry, the workflow carrying its producer asserts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { PRODUCT_REGISTRY, GOVERNED_PRODUCTS } from "./lifecycle-registry.mjs";

const ROOT = path.join(process.cwd(), "..");
const WF_DIR = path.join(ROOT, ".github", "workflows");

const workflows = fs
  .readdirSync(WF_DIR)
  .filter((f) => f.endsWith(".yml"))
  .map((f) => ({ name: f, text: fs.readFileSync(path.join(WF_DIR, f), "utf8") }));

/** The workflows that actually invoke this product's producer. */
function workflowsRunning(producer) {
  const base = producer.replace(/^app\//, "");
  return workflows.filter((w) => w.text.includes(base) || w.text.includes(producer));
}

test("every governed product's producer is scheduled by some workflow", () => {
  const orphans = [];
  for (const id of GOVERNED_PRODUCTS) {
    const p = PRODUCT_REGISTRY.get(id);
    /* A FOUNDER GATE IS NOT AN ORPHAN. Moonshot is paused on an exact token and has no scheduled
       producer by decision, not by omission — that absence is already reported as its missing
       `automation` dimension, and counting it twice pressures someone into "fixing" a deliberate
       pause. */
    if (p.founderGate) continue;
    /* A producer that is a DIRECTORY is an artifact tree, not a script — those products name their
       generating script under `producer` and this only checks scripts. */
    if (!p.producer.endsWith(".mjs") && !p.producer.endsWith(".ts")) continue;
    if (workflowsRunning(p.producer).length === 0) orphans.push(`${id} → ${p.producer}`);
  }
  assert.deepEqual(orphans, [], `producers nothing schedules: ${orphans.join("; ")}`);
});

test("THE PRODUCER'S WORKFLOW ASSERTS THAT IT PRODUCED", () => {
  /*
   * Not "a workflow exists" — a workflow that would notice producing nothing. Bank Builder and
   * Moonshot are produced by the same activation script inside daily-products, which asserts; the
   * Vault and Homer Nukes were the two that did not, and they are the two whose receipts went
   * missing.
   */
  const silent = [];
  for (const id of GOVERNED_PRODUCTS) {
    const p = PRODUCT_REGISTRY.get(id);
    if (p.founderGate) continue; // paused on a token; there is no run to assert about
    if (!p.producer.endsWith(".mjs") && !p.producer.endsWith(".ts")) continue;
    const running = workflowsRunning(p.producer);
    if (!running.length) continue; // the previous test owns that failure
    if (!running.some((w) => w.text.includes("assert-run-produced"))) {
      silent.push(`${id} (${running.map((w) => w.name).join(", ")})`);
    }
  }
  assert.deepEqual(
    silent,
    [],
    `these products can run green and produce nothing: ${silent.join("; ")}`,
  );
});

test("the assertion is stamped BEFORE it is used, in every workflow that makes one", () => {
  /*
   * `--since "$RUN_STARTED"` with an unset RUN_STARTED compares against the empty string. The
   * assertion would then pass on an artifact of any age, which is worse than not asserting: it reads
   * as coverage while proving nothing.
   */
  for (const w of workflows) {
    if (!w.text.includes("--since \"$RUN_STARTED\"")) continue;
    const stamp = w.text.indexOf("RUN_STARTED=$(date");
    const use = w.text.indexOf('--since "$RUN_STARTED"');
    assert.ok(stamp !== -1, `${w.name}: uses $RUN_STARTED without ever stamping it`);
    assert.ok(stamp < use, `${w.name}: stamps RUN_STARTED after using it`);
  }
});

test("REFUSAL · --allow-missing is not used for a product that evaluates every day", () => {
  /*
   * `--allow-missing` reports and exits 0, which is right for a genuinely optional product. It is
   * wrong for one whose contract is to speak every window: the Vault's whole defect was that its
   * silence looked permitted.
   */
  const nfl = workflows.find((w) => w.name === "nfl-event-window.yml");
  assert.ok(nfl, "the Vault's workflow exists");
  const block = nfl.text.slice(nfl.text.indexOf("Assert the Vault produced"));
  const call = block.slice(0, block.indexOf("end-zone-vault/latest.json"));
  assert.ok(!call.includes("--allow-missing"), "the Vault's assertion must fail closed");
});

test("the founder exemption is NARROW — exactly the gated products, named", () => {
  /*
   * An exemption nobody can enumerate is a hole. Only Moonshot is gated, and only on its stated
   * token; if a second product ever acquires one, this fails until somebody says so out loud.
   */
  const gated = GOVERNED_PRODUCTS.filter((id) => PRODUCT_REGISTRY.get(id).founderGate);
  assert.deepEqual(gated, ["moonshot"]);
  assert.equal(PRODUCT_REGISTRY.get("moonshot").founderGate, "MOONSHOT_REPAIR_PAUSE_OR_RETIRE");
});
