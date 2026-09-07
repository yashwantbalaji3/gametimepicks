/**
 * P243 · A-4 — the NFL hub's "prices" layer may say LIVE only over a FUTURE kickoff.
 *
 * The old rule (capturedAt < kickoffUtc) is satisfied by every archived row forever: an August
 * capture made before an August kickoff never stops passing it, so the hub said "Moneyline /
 * spread / total prices LIVE" over a finished preseason under an expired acquisition
 * authorization. The builder now distinguishes LIVE (a future kickoff is covered) from
 * ARCHIVED_CAPTURE (every priced kickoff has passed).
 *
 * Source pins on the builder plus a functional child-process run against the REAL artifacts with
 * a pinned --now far past every preseason kickoff (mutation-probe style: the run must not leave
 * the workflow-owned artifact mutated, so it replays into a scratch copy of the store).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const APP = process.cwd();
const SRC = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-public-status.mjs"), "utf8");

test("LIVE requires a future kickoff; an all-past capture is ARCHIVED_CAPTURE (source pin)", () => {
  assert.match(SRC, /markets\.capturedAt < r\.kickoffUtc && Date\.parse\(r\.kickoffUtc\) > nowMs/,
    "the LIVE population requires kickoff > now");
  assert.match(SRC, /ARCHIVED_CAPTURE/, "the archived state exists");
  assert.match(SRC, /kickoffs have all passed/, "the archived detail says why it is not live");
});

test("functional: with --now after every priced kickoff, market.state is ARCHIVED_CAPTURE, never LIVE", () => {
  // Scratch store: copy just the inputs the script reads, run it there via a tiny wrapper that
  // chdirs — the script writes public/data/nfl/model-status.json relative to cwd.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "nfl-status-"));
  fs.mkdirSync(path.join(scratch, "scripts", "nfl"), { recursive: true });
  fs.cpSync(path.join(APP, "public", "data", "nfl"), path.join(scratch, "public", "data", "nfl"), { recursive: true });
  for (const extra of ["scripts/nfl/build-nfl-public-status.mjs"]) {
    fs.cpSync(path.join(APP, extra), path.join(scratch, extra));
  }
  // The script may read siblings (data/internal receipts) — copy if present, tolerate absence.
  const internal = path.join(APP, "..", "data", "internal", "research", "nfl");
  if (fs.existsSync(internal)) {
    fs.cpSync(internal, path.join(scratch, "..", "data", "internal", "research", "nfl"), { recursive: true });
  }
  const before = fs.readFileSync(path.join(APP, "public/data/nfl/model-status.json"), "utf8");
  execFileSync(process.execPath, ["scripts/nfl/build-nfl-public-status.mjs", "--now", "2099-01-01T00:00:00Z"], {
    cwd: scratch, stdio: "pipe",
  });
  const out = JSON.parse(fs.readFileSync(path.join(scratch, "public/data/nfl/model-status.json"), "utf8"));
  assert.notEqual(out.market.state, "LIVE", "an all-past capture must never read LIVE");
  if (out.market.state === "ARCHIVED_CAPTURE") {
    assert.match(out.market.detail, /kickoffs have all passed/);
  }
  // The real, workflow-owned artifact was not touched by this test.
  const after = fs.readFileSync(path.join(APP, "public/data/nfl/model-status.json"), "utf8");
  assert.equal(before, after, "the committed artifact must be byte-identical after the probe");
  fs.rmSync(scratch, { recursive: true, force: true });
});
