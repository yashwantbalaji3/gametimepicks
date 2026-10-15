/**
 * The static-generation worker cap stays in place (Vercel incident 2026-10-14/15; see next.config.mjs).
 * With the default (cores − 1 = 7) workers the 2,874-page export pushed the 16 GB build machine to 15.5 G and
 * five Production builds were killed at ~46 minutes. A cap of 4 removed nearly all swapping locally at no time
 * cost and produced a byte-identical export. Removing or raising it must be a deliberate, re-measured change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

test("next.config caps static-generation workers between 2 and 4", async () => {
  const cfg = (await import(pathToFileURL(path.join(process.cwd(), "next.config.mjs")).href)).default;
  const cpus = cfg?.experimental?.cpus;
  assert.equal(typeof cpus, "number", "experimental.cpus must be set — the default (cores − 1) exhausted the 16 GB build machine");
  assert.ok(cpus >= 2 && cpus <= 4, `experimental.cpus=${cpus}: re-measure memory and build time before changing the cap`);
  assert.equal(cfg.output, "export", "the cap was measured for the static export");
});
