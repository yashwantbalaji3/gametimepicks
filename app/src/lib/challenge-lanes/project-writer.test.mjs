/**
 * BBM-01: the projection writer is deterministic. delete → regenerate → identical bytes, through the module and through
 * `lanes-reconcile --project-only`; the chain head sha is embedded; no wall-clock field. SYNTHETIC chain, no prices.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runStarted } from "./lanes.mjs";
import { appendEvents } from "./store.mjs";
import { writeLaneProjections } from "./project-writer.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bbm01-"));
  for (const laneId of ["bb-b", "ms-b"]) appendEvents(root, laneId, "run-1.jsonl", 0, [runStarted({ laneId, runId: "run-1", startedAt: "2030-01-01T12:00:00Z", approvedBy: "TEST (not an approval)" })]);
  return root;
};
const bytes = (dir) => Object.fromEntries(fs.readdirSync(dir).sort().map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));

test("delete → regenerate → identical; chainHeadSha256 is the chain head; no wall-clock key", () => {
  const root = fixture(); const out = fs.mkdtempSync(path.join(os.tmpdir(), "bbm01-out-"));
  const w1 = writeLaneProjections({ root, outDir: out }); const first = bytes(out);
  fs.rmSync(out, { recursive: true, force: true });
  const w2 = writeLaneProjections({ root, outDir: out });
  assert.deepEqual(bytes(out), first);
  assert.deepEqual(w2, w1);
  for (const [laneId, w] of Object.entries(w1)) {
    const head = fs.readFileSync(path.join(root, laneId, "run-1.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).at(-1).sha256;
    assert.equal(w.chainHeadSha256, head);
    assert.equal(JSON.parse(first[`${laneId}.json`]).chainHeadSha256, head);
  }
  assert.ok(!/"(generatedAt|writtenAt|builtAt|updatedAt)"/.test(Object.values(first).join("")), "no wall-clock field");
});

test("lanes-reconcile --project-only writes the same bytes as the module, appends nothing, needs no --date", () => {
  const root = fixture(); const a = fs.mkdtempSync(path.join(os.tmpdir(), "bbm01-a-")); const b = fs.mkdtempSync(path.join(os.tmpdir(), "bbm01-b-"));
  const logBefore = fs.readFileSync(path.join(root, "bb-b", "run-1.jsonl"), "utf8");
  writeLaneProjections({ root, outDir: a });
  execFileSync("npx", ["tsx", path.join(APP, "scripts/challenge-lanes/lanes-reconcile.mjs"), "--root", root, "--project-only", "--public-out", b], { cwd: APP, encoding: "utf8" });
  assert.deepEqual(bytes(b), bytes(a));
  assert.equal(fs.readFileSync(path.join(root, "bb-b", "run-1.jsonl"), "utf8"), logBefore);
});

test("a broken chain writes nothing for that lane", () => {
  const root = fixture(); const out = fs.mkdtempSync(path.join(os.tmpdir(), "bbm01-x-"));
  const f = path.join(root, "bb-b", "run-1.jsonl"); fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/"sha256":"[0-9a-f]{4}/, '"sha256":"0000'));
  assert.throws(() => writeLaneProjections({ root, outDir: out, laneIds: ["bb-b"] }), /chain broken/);
  assert.ok(!fs.existsSync(path.join(out, "bb-b.json")));
});
