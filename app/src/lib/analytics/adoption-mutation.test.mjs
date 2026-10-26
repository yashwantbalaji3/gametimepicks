/**
 * MUTATION PROOF for the one property the adoption dashboard exists to protect: a rate with a zero
 * denominator is UNKNOWN, never 0%. A passing assertion proves nothing on its own — it would also pass
 * against an aggregator that had never implemented the rule. So this test breaks the rule in a COPY of the
 * aggregator, proves the behaviour actually changes, and proves the real source was never touched.
 *
 * It used to break the rule in src/lib/analytics/adoption.ts itself and restore it. The suite runs test files
 * in parallel, so for the length of the probe any sibling that imported adoption.ts (adoption.test.mjs first)
 * could load the broken rule and fail for no reason of its own. The aggregator's imports are a closed set of
 * siblings, so the copy carries them and resolves exactly as the original does.
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
/** adoption.ts and everything it imports (transitively, all relative siblings). */
const CLOSURE = ["adoption.ts", "event-contract.ts", "growth-ops.ts", "sink.ts"];
/** The suite is invoked as `npx tsx --test …`, so the child resolves tsx the same way the parent did. */
const LOCAL_TSX = path.join(app, "node_modules/.bin/tsx");
const [TSX_CMD, TSX_ARGS] = fs.existsSync(LOCAL_TSX) ? [LOCAL_TSX, []] : ["npx", ["tsx"]];

const ORIGINAL_RATE = "denominator > 0 ? measured(round4(numerator / denominator)) : notYetMeasured(";
const MUTATED_RATE = "denominator >= 0 ? measured(round4(denominator === 0 ? 0 : numerator / denominator)) : notYetMeasured(";

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** Ask a fresh process what the aggregator at `source` does with a capture that has traffic but no session-start event. */
function probeZeroDenominator(source) {
  const probe = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gtp-adoption-probe-")), "probe.mjs");
  fs.writeFileSync(
    probe,
    [
      `import fs from "node:fs";`,
      `import { buildAdoptionReport, parseAdoptionCapture } from ${JSON.stringify(source)};`,
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

test("the copied closure is complete: every relative import of the aggregator is carried", () => {
  for (const f of CLOSURE) {
    for (const [, spec] of fs.readFileSync(path.join(HERE, f), "utf8").matchAll(/^\s*(?:import|export)[^"']*from\s+["'](\.[^"']+)["']/gm)) {
      assert.ok(CLOSURE.includes(`${path.basename(spec)}.ts`), `${f} imports ${spec}, which the copy must carry`);
    }
  }
});

test("breaking the zero-denominator rule changes behaviour, and the real source is never written", { timeout: 120_000 }, () => {
  const original = fs.readFileSync(SOURCE);
  const originalHash = sha256(original);
  const text = original.toString("utf8");
  assert.ok(text.includes(ORIGINAL_RATE), "the rate helper still has the shape this mutation targets");

  // Baseline: the rule holds.
  const before = probeZeroDenominator(SOURCE);
  assert.equal(before.sessions.value, 0, "the fixture really does have zero session-start events");
  assert.equal(before.detail.value, 2, "…while carrying real detail events");
  assert.equal(before.rate.state, "not_yet_measured", "baseline: 2 ÷ 0 is unknown");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-adoption-mutant-"));
  let mutated;
  try {
    for (const f of CLOSURE) fs.copyFileSync(path.join(HERE, f), path.join(dir, f));
    const mutatedText = text.replace(ORIGINAL_RATE, MUTATED_RATE);
    assert.notEqual(mutatedText, text, "the mutation must actually alter the source");
    fs.writeFileSync(path.join(dir, "adoption.ts"), mutatedText);
    mutated = probeZeroDenominator(path.join(dir, "adoption.ts"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // The mutation was OBSERVED, not merely written: a zero denominator now reports a measured 0%.
  assert.equal(mutated.rate.state, "measured", "mutation applied — the aggregator now fabricates a rate");
  assert.equal(mutated.rate.value, 0, "…and that fabricated rate is exactly the misleading 0%");

  // The real aggregator was never written, and still holds the rule.
  assert.equal(sha256(fs.readFileSync(SOURCE)), originalHash, "the real source is byte-identical");
  assert.equal(probeZeroDenominator(SOURCE).rate.state, "not_yet_measured", "the rule is in force");
});
