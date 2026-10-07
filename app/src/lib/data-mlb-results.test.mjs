/**
 * Stage 3B — the page loader for settled MLB leans (/mlb/results splits, /results/date/<d>, the /results audit
 * notes) counts the same rows of record as graded-picks.json. An invariant between two committed artifacts, not a
 * pinned total: both sides move together when the nightly settles a new date.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { getMlbSettledLeans } from "./data-mlb-results.ts";

const read = (p) => JSON.parse(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

test("🔴 the MLB settled-lean loader counts exactly graded-picks.json's rows of record", () => {
  const picks = read("public/data/mlb/graded-picks.json");
  const rows = getMlbSettledLeans();
  const wins = rows.filter((r) => r.outcome === "Win").length;
  const losses = rows.filter((r) => r.outcome === "Loss").length;
  assert.equal(rows.length, picks.counts.total, "rows of record");
  assert.equal(wins, picks.counts.hits, "wins of record");
  assert.equal(losses, picks.counts.misses, "losses of record");
});

test("the raw public ledger keeps every row; only the loader leaves the earlier copies out", () => {
  const raw = fs.readFileSync(path.join(process.cwd(), "public/data/mlb/results/settled_leans.jsonl"), "utf8").split("\n").filter((l) => l.trim()).length;
  const rows = getMlbSettledLeans();
  assert.ok(raw >= rows.length, "the loader never adds rows");
  const ids = new Set(rows.map((r) => r.id));
  assert.equal(ids.size, rows.length, "one row per id");
});
