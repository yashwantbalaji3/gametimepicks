/**
 * Sprint 036 — the committed market-capture record must be orderable in time.
 *
 * WHY
 * The capture pipeline writes three files per capture: `raw.json`, `normalized.json`, `manifest.json`.
 * The first two carry per-row `capturedAt`, `bookmaker`, `oddsAmerican` and `noVigProbability` — the
 * richest schema in the repo — and both are gitignored (`.gitignore:87-88`). Measured this sprint:
 * **102 of 104 capture directories are already payload-less**, and the pipeline's own
 * `market-capture-reliability.json` independently flags four dates as `LOST_RESEARCH_DATE`.
 *
 * So the manifest is the only part of a capture that survives — and it carried no timestamp. A pile of
 * surviving manifests could not be ordered in time except by filesystem mtime, which does not survive a
 * clone. One field fixes that at zero storage cost, committing no odds data.
 *
 * This guard keeps the field there. It does NOT assert that payloads are retained — that is a real
 * founder decision about where to store ~20-25MB/day, and it is on the roadmap, not smuggled in here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

const CAPTURE_SCRIPTS = [
  "scripts/capture-mlb-pregame-markets.mjs",
  "scripts/capture-mlb-pregame-player-props.mjs",
];

test("every capture script stamps capturedAt onto the manifest it commits", () => {
  for (const rel of CAPTURE_SCRIPTS) {
    const src = read(rel);
    assert.match(
      src,
      /summary\.capturedAt\s*=/,
      `${rel}: the manifest is the only artifact that survives — it must carry a capture time`,
    );
    // And the assignment must come before the manifest is written, or it is a no-op.
    const assignedAt = src.indexOf("summary.capturedAt =");
    const writtenAt = src.indexOf('path.join(dir, "manifest.json")');
    assert.ok(assignedAt >= 0 && writtenAt >= 0, `${rel}: expected both the stamp and the write`);
    assert.ok(
      assignedAt < writtenAt,
      `${rel}: capturedAt must be assigned BEFORE the manifest is serialised`,
    );
  }
});

test("the payload files stay gitignored — this guard does not smuggle in a retention decision", () => {
  const ignore = fs.readFileSync(path.join(REPO, ".gitignore"), "utf8");
  assert.match(ignore, /market-snapshots\/\*\*\/raw\.json/, "raw payloads stay out of git");
  assert.match(ignore, /market-snapshots\/\*\*\/normalized\.json/, "normalized payloads stay out of git");
});

test("committed manifests are readable and, where present, carry a usable timestamp", () => {
  const root = path.join(REPO, "data/internal/mlb/pregame-archive/market-snapshots");
  if (!fs.existsSync(root)) return;

  let checked = 0;
  let stamped = 0;
  for (const date of fs.readdirSync(root)) {
    const dateDir = path.join(root, date);
    if (!fs.statSync(dateDir).isDirectory()) continue;
    for (const capture of fs.readdirSync(dateDir)) {
      const manifest = path.join(dateDir, capture, "manifest.json");
      if (!fs.existsSync(manifest)) continue;
      const doc = JSON.parse(fs.readFileSync(manifest, "utf8"));
      checked += 1;

      // Contract that must hold for EVERY manifest, old or new.
      assert.equal(doc.public, false, `${date}/${capture}: captures are internal`);
      assert.ok(doc.captureId, `${date}/${capture}: needs a capture id`);
      assert.ok(doc.normalizedHash, `${date}/${capture}: needs a payload hash`);

      // Historical manifests predate the stamp and are left alone — asserting it on them would only
      // punish the past. What matters is that when present it is a real, parseable instant.
      if (doc.capturedAt !== undefined) {
        stamped += 1;
        assert.ok(
          typeof doc.capturedAt === "string" && Number.isFinite(Date.parse(doc.capturedAt)),
          `${date}/${capture}: capturedAt must be a parseable ISO instant, got ${JSON.stringify(doc.capturedAt)}`,
        );
      }
    }
  }
  assert.ok(checked > 0, "expected at least one committed manifest to verify");
  // Reported rather than asserted: the backfill is impossible and the ratio will climb on its own.
  console.log(`  [market-capture] ${stamped}/${checked} committed manifests carry capturedAt`);
});
