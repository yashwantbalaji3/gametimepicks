/**
 * MUTATION PROOF for the one property the adoption dashboard exists to protect: a rate with a zero
 * denominator is UNKNOWN, never 0%. A passing assertion proves nothing on its own — it would also pass
 * against an aggregator that had never implemented the rule. So this test breaks the rule on disk, proves
 * the behaviour actually changes, and restores the source byte-identically.
 *
 * The probe runs in a CHILD PROCESS: tsx caches modules per process, so re-importing the mutated file in
 * this process would return the already-loaded original and the whole test would be decorative.
 *
 * Run: cd app && npx tsx --test src/lib/analytics/adoption-mutation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const app = process.cwd();
const SOURCE = path.join(HERE, "adoption.ts");
/** The suite is invoked as `npx tsx --test …`, so the child resolves tsx the same way the parent did. */
const LOCAL_TSX = path.join(app, "node_modules/.bin/tsx");
const [TSX_CMD, TSX_ARGS] = fs.existsSync(LOCAL_TSX) ? [LOCAL_TSX, []] : ["npx", ["tsx"]];

const ORIGINAL_RATE = "denominator > 0 ? measured(round4(numerator / denominator)) : notYetMeasured(";
const MUTATED_RATE = "denominator >= 0 ? measured(round4(denominator === 0 ? 0 : numerator / denominator)) : notYetMeasured(";

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** Ask a fresh process what the aggregator does with a capture that has traffic but no session-start event. */
function probeZeroDenominator() {
  const probe = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gtp-adoption-mutation-")), "probe.mjs");
  fs.writeFileSync(
    probe,
    [
      `import fs from "node:fs";`,
      `import { buildAdoptionReport, parseAdoptionCapture } from ${JSON.stringify(SOURCE)};`,
      `const raw = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(HERE, "fixtures/adoption-capture-no-sessions.json"))}, "utf8"));`,
      `const { capture } = parseAdoptionCapture(raw);`,
      `const r = buildAdoptionReport({ capture, mode: "staging" });`,
      `process.stdout.write(JSON.stringify({ rate: r.activation.rate, detail: r.activation.detailEvents, sessions: r.reach.sessions }));`,
    ].join("\n"),
  );
  try {
    return JSON.parse(execFileSync(TSX_CMD, [...TSX_ARGS, probe], { cwd: app, encoding: "utf8" }));
  } finally {
    fs.rmSync(path.dirname(probe), { recursive: true, force: true });
  }
}

test("breaking the zero-denominator rule changes behaviour, and the source is restored byte-identically", { timeout: 120_000 }, () => {
  const original = fs.readFileSync(SOURCE);
  const originalHash = sha256(original);
  const text = original.toString("utf8");
  assert.ok(text.includes(ORIGINAL_RATE), "the rate helper still has the shape this mutation targets");

  // Baseline: the rule holds.
  const before = probeZeroDenominator();
  assert.equal(before.sessions.value, 0, "the fixture really does have zero session-start events");
  assert.equal(before.detail.value, 2, "…while carrying real detail events");
  assert.equal(before.rate.state, "not_yet_measured", "baseline: 2 ÷ 0 is unknown");

  let mutated;
  try {
    const mutatedText = text.replace(ORIGINAL_RATE, MUTATED_RATE);
    assert.notEqual(mutatedText, text, "the mutation must actually alter the source");
    fs.writeFileSync(SOURCE, mutatedText);
    assert.notEqual(sha256(fs.readFileSync(SOURCE)), originalHash, "the mutation is on disk");

    mutated = probeZeroDenominator();
  } finally {
    fs.writeFileSync(SOURCE, original);
  }

  // The mutation was OBSERVED, not merely written: a zero denominator now reports a measured 0%.
  assert.equal(mutated.rate.state, "measured", "mutation applied — the aggregator now fabricates a rate");
  assert.equal(mutated.rate.value, 0, "…and that fabricated rate is exactly the misleading 0%");

  // Restoration is byte-identical AND functional.
  assert.equal(sha256(fs.readFileSync(SOURCE)), originalHash, "source restored byte-for-byte");
  assert.equal(probeZeroDenominator().rate.state, "not_yet_measured", "the rule is back in force");
});
