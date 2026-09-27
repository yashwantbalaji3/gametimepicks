import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * A REPORT THAT TRUNCATES SILENTLY IS WORSE THAN ONE THAT FAILS.
 *
 * `--json` reports are piped into other tools. On a pipe node's stdout is asynchronous, so
 * `process.exit()` immediately after a large `console.log` discards whatever has not flushed. The
 * conservation report was cut at exactly 65536 bytes — invalid JSON, delivered under a success exit
 * code, which is the shape of defect that gets believed.
 */

test("a synchronous write survives process.exit — the property the reports depend on", () => {
  /*
   * ⚠ THIS TEST USED TO ASSERT THAT console.log TRUNCATES, AND THAT WAS WRONG OF ME. It failed CI
   * on the first run: the truncation is environment-dependent (it reproduced locally at exactly
   * 65536 bytes on a pipe and did not reproduce on the CI runner), so asserting it as a fact made
   * the suite fail on a platform where the footgun simply does not fire — while the fix was
   * perfectly correct either way.
   *
   * What the reports actually DEPEND on is the positive property: a synchronous write is never
   * lost. That is environment-independent, so that is what is asserted. The asynchronous result is
   * measured and REPORTED rather than asserted, because "did node drop it here?" is a fact about
   * the host, not about our code.
   *
   * The defect itself is not in question: a 68KB conservation report was cut to 65536 bytes and
   * handed its consumer invalid JSON under a success exit code.
   */
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "flush-"));
  const big = "x".repeat(200000);
  const good = path.join(dir, "good.mjs");
  fs.writeFileSync(good, `import fs from "node:fs"; fs.writeSync(1, ${JSON.stringify(big)} + "\\n"); process.exit(0);`);
  const bad = path.join(dir, "bad.mjs");
  fs.writeFileSync(bad, `console.log(${JSON.stringify(big)}); process.exit(0);`);

  /* execFileSync gives the child a PIPE, which is the condition that can trigger the loss. */
  const goodOut = execFileSync(process.execPath, [good], { maxBuffer: 1 << 24 }).toString();
  assert.equal(goodOut.trim().length, big.length, "a synchronous write must deliver every byte");

  const badOut = execFileSync(process.execPath, [bad], { maxBuffer: 1 << 24 }).toString();
  if (badOut.trim().length < big.length) {
    /* Diagnostic only. On this host the footgun fires, which is how it was found. */
    assert.ok(goodOut.trim().length > badOut.trim().length, "and the synchronous write beat it");
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

/*
 * Source-level, deliberately: a behavioural test would need a real slate on disk, and pinning a
 * date into a test that a scheduled producer keeps moving is its own time bomb.
 */
const GUARDED = [
  "scripts/ops/nfl-opportunity-conservation.mjs",
  "scripts/ops/nfl-qb-starter-shadow.mjs",
];

for (const rel of GUARDED) {
  test(`${rel} writes its JSON payload synchronously`, () => {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const lines = src.split("\n");
    const payload = lines.filter((l) => /JSON\.stringify\(\{/.test(l) || /JSON\.stringify\(\s*$/.test(l));
    assert.ok(payload.length, "the report must actually emit a JSON payload — otherwise this guard is vacuous");
    for (const l of payload) {
      assert.doesNotMatch(l, /console\.log\(JSON\.stringify/, "a piped consumer would receive a truncated payload");
    }
    assert.match(src, /fs\.writeSync\(1, JSON\.stringify/, "the payload goes out through a synchronous write");
  });
}
