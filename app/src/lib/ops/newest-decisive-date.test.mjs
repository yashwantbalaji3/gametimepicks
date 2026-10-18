import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { newestDecisiveDate } from "./newest-decisive-date.mjs";

const row = (date, outcome) => JSON.stringify({ id: `${date}-${outcome}-${Math.random()}`, date, outcome });

test("an all-void newest slate (the 2026-10-16 postponement) does not move the decisive date", () => {
  const ledger = [row("2026-10-15", "Win"), row("2026-10-15", "Loss"), row("2026-10-16", "Void"), row("2026-10-16", "Void")].join("\n");
  assert.equal(newestDecisiveDate(ledger), "2026-10-15", "a contract as of 10-15 is current: 10-16 has nothing decisive");
});

test("CONTROL: a decisive row on a newer date still moves it — a contract behind real results is still stale", () => {
  const ledger = [row("2026-10-15", "Win"), row("2026-10-16", "Void"), row("2026-10-16", "Loss")].join("\n");
  assert.equal(newestDecisiveDate(ledger), "2026-10-16");
});

test("case-insensitive like loadRows (Win/win), and bad lines never break it", () => {
  assert.equal(newestDecisiveDate([row("2026-10-01", "win"), "{not json", "", row("2026-10-02", "LOSS")].join("\n")), "2026-10-02");
  assert.equal(newestDecisiveDate(""), "");
  assert.equal(newestDecisiveDate(null), "");
});

test("the publish gate uses the decisive population, and the contract counts the same population", () => {
  const gate = fs.readFileSync(path.join(process.cwd(), "scripts/health-check.mjs"), "utf8");
  assert.match(gate, /newestSettled = newestDecisiveDate\(fs\.readFileSync\(path\.join\(ROOT, "mlb\/results\/settled_leans\.jsonl"\), "utf8"\)\);/);
  assert.match(gate, /"research-contract:stale"/, "the stale gate itself is kept — only its population is aligned");
  const loader = fs.readFileSync(path.join(process.cwd(), "scripts/model-learning-audit.mjs"), "utf8");
  assert.match(loader, /if \(o === "win" \|\| o === "loss"\) outcomeById\.set/, "the contract's universe is decisive rows only — keep both sides in step");
});
