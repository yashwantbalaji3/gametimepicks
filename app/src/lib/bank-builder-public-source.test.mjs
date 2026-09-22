import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadPublicBankBuilderSummary } from "./data-bank-builder.ts";

test("public summary ($10,376.17 / Step 5 after the Step-5 hit) is the source of truth for /today + /bank-builder", () => {
  const pub = loadPublicBankBuilderSummary();
  assert.ok(pub, "public summary must exist");
  assert.equal(pub.currentBankrollUnits, 10376.17);
  assert.equal(pub.currentProgressionStep, 5);
});

test("the retired optimizer summary (bank-builder/summary-latest.json) has no loader and no writer", () => {
  /* v1.7 store-ownership audit S4: a second "Bank Builder" record (30-37) regenerated nightly with no mounted
     reader. Retired: its loader is gone and the nightly ledger script no longer writes the file. A stale copy
     may remain on disk; nothing reads it and the export prune never ships an unreferenced data file. */
  const lib = fs.readFileSync(path.join(process.cwd(), "src", "lib", "data-bank-builder.ts"), "utf8");
  assert.doesNotMatch(lib, /read<[^>]*>\("summary-latest\.json"\)/);
  const writer = fs.readFileSync(path.join(process.cwd(), "scripts", "build-bank-builder-ledger.mjs"), "utf8");
  assert.doesNotMatch(writer, /writeFileSync\([^\n]*"summary-latest\.json"/);
});
