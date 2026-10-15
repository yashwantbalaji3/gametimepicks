/**
 * The data-contract check for data commits (scripts/ci/run-data-contracts.mjs + data-contracts.json), 2026-10-14.
 * Pins: every listed test exists; every contract path is a path some data workflow actually stages; a staged
 * grading path selects its contract (and the core); an unrelated path selects nothing; a missing test is an error,
 * never a silent pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const APP = process.cwd();
const REPO = path.join(APP, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(APP, "scripts/ci/data-contracts.json"), "utf8"));
const run = (...args) => spawnSync(process.execPath, [path.join(APP, "scripts/ci/run-data-contracts.mjs"), ...args], { cwd: REPO, encoding: "utf8" });

test("every contract test exists, and no contract is empty of paths", () => {
  for (const t of [...manifest.core, ...manifest.contracts.flatMap((c) => c.tests)]) assert.ok(fs.existsSync(path.join(APP, t)), `${t} is listed but missing`);
  for (const c of manifest.contracts) assert.ok(c.paths.length > 0, `${c.id} has no paths`);
});

test("every contract path is staged by some data workflow — a path no writer stages would never fire", () => {
  const wf = fs.readdirSync(path.join(REPO, ".github/workflows")).map((f) => fs.readFileSync(path.join(REPO, ".github/workflows", f), "utf8")).join("\n");
  const adds = [...wf.matchAll(/git add ([^\n]+)/g)].flatMap((m) => m[1].split(/\s+/)).map((p) => p.replace(/["']/g, "")).filter((p) => /^(app|data)\//.test(p));
  for (const c of manifest.contracts) for (const p of c.paths) {
    const covered = adds.some((a) => a.startsWith(p) || p.startsWith(a.replace(/\$[A-Za-z_{}]+.*$/, "")) || p.startsWith(a.replace(/\*.*$/, "")));
    assert.ok(covered, `${c.id}: no workflow stages ${p}`);
  }
});

test("a staged UFC grading row selects the UFC contract and the core; an unrelated path selects nothing", () => {
  const ufc = run("--dry-run", "--files", "data/internal/research/ufc/model-vs-market/graded.jsonl");
  assert.equal(ufc.status, 0, ufc.stdout + ufc.stderr);
  assert.match(ufc.stdout, /ufc-grading/);
  for (const t of manifest.core) assert.ok(ufc.stdout.includes(t), `core test ${t} not selected`);
  const none = run("--dry-run", "--files", "app/public/data/ops/heartbeat.json", "docs/NOTES.md");
  assert.equal(none.status, 0);
  assert.match(none.stdout, /nothing staged maps to a record contract/);
});

test("a contract that names a missing test cannot pass silently (exit 2)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "contracts-"));
  try {
    fs.mkdirSync(path.join(dir, "app/scripts/ci"), { recursive: true });
    fs.copyFileSync(path.join(APP, "scripts/ci/run-data-contracts.mjs"), path.join(dir, "app/scripts/ci/run-data-contracts.mjs"));
    fs.writeFileSync(path.join(dir, "app/scripts/ci/data-contracts.json"), JSON.stringify({ core: ["src/lib/nope.test.mjs"], contracts: [{ id: "x", paths: ["data/x/"], tests: [] }] }));
    const r = spawnSync(process.execPath, [path.join(dir, "app/scripts/ci/run-data-contracts.mjs"), "--files", "data/x/a.json"], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 2, r.stdout);
    assert.match(r.stdout, /contract tests missing/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
