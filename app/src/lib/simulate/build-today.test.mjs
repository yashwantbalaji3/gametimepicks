import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { pinnedBuildEtDate, BUILD_PHASE, BUILD_STAMP_FILE } from "./build-today.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "build-today-"));
const live = () => "2026-10-20";

test("during a production build, every caller gets the date the build stamped at its start (no midnight straddle)", () => {
  fs.writeFileSync(path.join(dir, BUILD_STAMP_FILE), JSON.stringify({ buildEtDate: "2026-10-19", builtAt: "2026-10-20T03:55:00Z" }));
  assert.equal(pinnedBuildEtDate({ env: { NEXT_PHASE: BUILD_PHASE }, cwd: dir, fallback: live }), "2026-10-19");
});

test("outside a build (dev, tests) the live clock is used, exactly as before", () => {
  assert.equal(pinnedBuildEtDate({ env: {}, cwd: dir, fallback: live }), "2026-10-20");
  assert.equal(pinnedBuildEtDate({ env: { NEXT_PHASE: "phase-development-server" }, cwd: dir, fallback: live }), "2026-10-20");
});

test("a missing or malformed stamp falls back to the live clock — never a guessed date", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "build-today-none-"));
  assert.equal(pinnedBuildEtDate({ env: { NEXT_PHASE: BUILD_PHASE }, cwd: empty, fallback: live }), "2026-10-20");
  fs.writeFileSync(path.join(empty, BUILD_STAMP_FILE), JSON.stringify({ buildEtDate: "Oct 19" }));
  assert.equal(pinnedBuildEtDate({ env: { NEXT_PHASE: BUILD_PHASE }, cwd: empty, fallback: live }), "2026-10-20");
  fs.writeFileSync(path.join(empty, BUILD_STAMP_FILE), "{not json");
  assert.equal(pinnedBuildEtDate({ env: { NEXT_PHASE: BUILD_PHASE }, cwd: empty, fallback: live }), "2026-10-20");
});

test("the /simulate window reads the pinned date for BOTH the page params and the selector", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/simulate/day-view.ts"), "utf8");
  assert.equal((src.match(/opts\?\.today \?\? simulateToday\(\)/g) ?? []).length, 2, "availableSimulateDates and buildSimulateDay");
  assert.doesNotMatch(src, /opts\?\.today \?\? currentEtDate\(\)/, "no caller of the window reads the live clock directly");
});
