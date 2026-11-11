/**
 * M1 research candidate `nba-sim-v1-availability-margin` (UNARMED): λ recomputes exactly from committed data. The engine
 * identity and margin-only tests live beside v1's own fixtures in game-sim-v1.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("λ recomputes byte-for-byte from committed data (methodology-constants rule); report marked unarmed and pending approval", () => {
  const out = execFileSync("node", [path.join(process.cwd(), "scripts/nba/research-v1-availability-margin.mjs"), "--fit"], { encoding: "utf8", maxBuffer: 1 << 26 });
  const json = JSON.parse(out.slice(out.indexOf("{")));
  const committed = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "../data/internal/research/nba/reports/v1-availability-margin-fit-2024.json"), "utf8"));
  assert.deepEqual(json, committed);
  assert.equal(committed.armed, false);
  assert.match(committed.approval, /^PENDING/);
  assert.match(committed.availabilityProxy, /TIP-TIME PROXY/);
});
