/**
 * Guards for the research-observation quality gate (research-observation-quality.mjs). Ensures the first (and every)
 * materialized dataset stays clean: the gate exists + is wired into the research workflow, the committed quality
 * report is never BLOCKED, and the raw observations are gitignored (derived, regenerable from committed joins).
 *
 * Run: npx tsx --test src/lib/mlb-research-observation-quality.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const repo = path.dirname(app);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

test("1 · the observation quality gate script + workflow wire exist", () => {
  assert.ok(fs.existsSync(path.join(app, "scripts/research-observation-quality.mjs")), "gate script exists");
  const wf = fs.readFileSync(path.join(repo, ".github/workflows/mlb-pregame-capture.yml"), "utf8");
  assert.match(wf, /research-observation-quality\.mjs/, "gate wired into mlb-pregame-capture after build-observations");
});

test("2 · the committed observation-quality report is well-formed and never BLOCKED", () => {
  const q = readJson(path.join(repo, "data/internal/mlb/pregame-archive/status/research-observation-quality.json"));
  if (!q) { console.log("  (skip — no report in this checkout)"); return; }
  assert.equal(q.public, false);
  assert.ok(["PASS", "EMPTY"].includes(q.status), `status must be PASS/EMPTY, got ${q.status}`);
  for (const [k, v] of Object.entries(q.hardViolations || {})) assert.equal(v, 0, `hard violation ${k} must be 0`);
});

test("3 · raw observations are gitignored (derived; regenerable from committed settlement-joins)", () => {
  const gi = fs.readFileSync(path.join(repo, ".gitignore"), "utf8");
  assert.match(gi, /research-observations\/\*\.jsonl/, "raw observations jsonl is gitignored");
});
