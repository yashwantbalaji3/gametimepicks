/**
 * Session 5 · Phase B — an MLB no-game / missing-input day fails MLB closed without failing daily-products.
 * 2026-09-28: pool gate INPUT_MISSING → exit 20 → no receipts, no eligible legs (any sport), no projection or Ask
 * refresh. Fixed clocks and fixtures; one LIVE check on the committed 09-28 / 10-02 inputs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

import { GATE } from "./pool-gate.mjs";
import { classifyMlbInput, MLB_INPUT as M } from "./mlb-input-verdict.mjs";

const missing = { verdict: GATE.INPUT_MISSING, detail: "mlb/team-markets/2026-09-28.json has not been written" };
const sched = (capturedAt, gameCount = 0, date = "2026-09-28") => ({ date, capturedAt, gameCount });
const NOW = "2026-09-28T16:00:00Z";

test("a usable slate, or the producer's valid empty slate, is READY — the existing path, unchanged", () => {
  assert.equal(classifyMlbInput({ gate: { verdict: GATE.OK, detail: "4 games" }, schedule: null, date: "2026-09-28", nowIso: NOW }).verdict, M.READY);
  assert.equal(classifyMlbInput({ gate: { verdict: GATE.INPUT_EMPTY, detail: "valid empty" }, schedule: null, date: "2026-09-28", nowIso: NOW }).verdict, M.READY);
});

test("NO_EVENTS only when a StatsAPI schedule captured ON the ET day says 0 games", () => {
  const r = classifyMlbInput({ gate: missing, schedule: sched("2026-09-28T11:38:00Z"), date: "2026-09-28", nowIso: NOW });
  assert.equal(r.verdict, M.NO_EVENTS);
  assert.match(r.reason, /captured 2026-09-28T11:38:00Z lists 0 games/);
});

test("uncertain is INPUT_UNAVAILABLE — never a no-game day inferred from an old capture", () => {
  // The committed 09-28 file was captured 09-22; 10-02's on 09-26, before the postseason schedule existed.
  const old = classifyMlbInput({ gate: missing, schedule: sched("2026-09-22T09:58:04Z"), date: "2026-09-28", nowIso: NOW });
  assert.equal(old.verdict, M.INPUT_UNAVAILABLE);
  assert.match(old.reason, /not from 2026-09-28 itself/);
  // 2026-09-28T03:30Z is 23:30 on 09-27 in New York — the previous ET day.
  assert.equal(classifyMlbInput({ gate: missing, schedule: sched("2026-09-28T03:30:00Z"), date: "2026-09-28", nowIso: NOW }).verdict, M.INPUT_UNAVAILABLE, "the ET day decides, not the UTC date");
  assert.equal(classifyMlbInput({ gate: missing, schedule: sched("2026-09-28T11:38:00Z", 2), date: "2026-09-28", nowIso: NOW }).verdict, M.INPUT_UNAVAILABLE, "games scheduled and the priced slate missing is a producer gap");
  assert.equal(classifyMlbInput({ gate: missing, schedule: null, date: "2026-09-28", nowIso: NOW }).verdict, M.INPUT_UNAVAILABLE);
  assert.equal(classifyMlbInput({ gate: missing, schedule: sched("2026-09-28T11:38:00Z", 0, "2026-09-29"), date: "2026-09-28", nowIso: NOW }).verdict, M.INPUT_UNAVAILABLE);
  assert.equal(classifyMlbInput({ gate: missing, schedule: sched("2026-09-28T17:00:00Z"), date: "2026-09-28", nowIso: NOW }).verdict, M.INPUT_UNAVAILABLE, "a capture from the future is not evidence");
  for (const v of [GATE.INPUT_STALE, GATE.INPUT_MALFORMED, GATE.INPUT_WRONG_DATE]) {
    assert.equal(classifyMlbInput({ gate: { verdict: v, detail: v }, schedule: sched("2026-09-28T11:38:00Z"), date: "2026-09-28", nowIso: NOW }).verdict, M.INPUT_UNAVAILABLE, `${v} is never a no-game day`);
  }
});

test("LIVE: the committed 2026-09-28 inputs classify INPUT_UNAVAILABLE (the capture saying 0 is from 09-22)", () => {
  const out = execFileSync("npx", ["tsx", "scripts/products/classify-mlb-input.mjs", "--date", "2026-09-28", "--now", "2026-09-28T18:45:00Z"], { encoding: "utf8" });
  assert.match(out, /mlb-input 2026-09-28: INPUT_UNAVAILABLE \(gate INPUT_MISSING\)/);
});

test("the receipt records INPUTS_MISSING with the classifier's reason and evaluates nothing", () => {
  const r = spawnSync("npx", ["tsx", "scripts/products/build-daily-product-receipts.mjs", "--now", "2026-09-28T18:45:00Z", "--date", "2026-09-28", "--dry-run", "--mlb-unavailable", "the priced slate is missing; no-game status cannot be established"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const line = r.stdout.split("\n").find((l) => l.startsWith("product receipt 2026-09-28:")) ?? "";
  for (const id of ["bank-builder", "moonshot"]) {
    assert.match(line, new RegExp(`\\b${id}=INPUTS_MISSING\\b`), `${id} must read INPUTS_MISSING:\n${r.stdout.slice(0, 800)}`);
  }
  assert.doesNotMatch(line, /\b(bank-builder|moonshot)=NO_PLAY\b/, "an unevaluated product is never a no-play");
});

test("CONTRACT: only MLB money steps depend on the verdict; the rest runs; the refusal is reported after the commit", () => {
  const wf = fs.readFileSync("../.github/workflows/daily-products.yml", "utf8");
  const step = (name) => { const i = wf.indexOf(`- name: ${name}`); assert.ok(i !== -1, `missing step: ${name}`); const j = wf.indexOf("\n      - name:", i + 10); return { i, body: wf.slice(i, j === -1 ? undefined : j) }; };
  const mlb = step("Generate MLB money products");
  assert.match(mlb.body, /verdict != 'INPUT_UNAVAILABLE'/);
  assert.match(mlb.body, /activate-daily-portfolio\.mjs --date "\$DATE" --apply/);
  const neutral = step("Generate sport-neutral products");
  assert.doesNotMatch(neutral.body, /steps\.mlb/, "sport-neutral products must not wait on MLB");
  for (const s of ["build-risk-ladder.mjs", "build-product-eligible-legs.mjs", "build-selector-shadow.mjs"]) assert.match(neutral.body, new RegExp(s.replace(".", "\\.")));
  assert.doesNotMatch(mlb.body, /build-product-eligible-legs|build-risk-ladder/, "the cross-sport universe and the ladder left the MLB block");
  for (const name of ["Write the daily product receipt", "Write the forward-coverage artifact", "Refresh the canonical projection chain", "Commit if anything changed"]) {
    assert.doesNotMatch(step(name).body.split("\n").slice(0, 3).join("\n"), /if:.*steps\.mlb/, `${name} must run whatever MLB's verdict`);
  }
  const receipt = step("Write the daily product receipt").body;
  assert.match(receipt, /MLB_REASON: \$\{\{ steps\.mlb\.outputs\.reason \}\}/, "the reason travels through env, never interpolated into shell text");
  assert.match(receipt, /ARGS\+=\(--mlb-unavailable "\$MLB_REASON"\)/);
  const last = step("MLB money products were not generated");
  assert.ok(last.i > step("Commit if anything changed").i, "the MLB failure is reported AFTER the other products are committed");
  assert.match(last.body, /verdict == 'INPUT_UNAVAILABLE'/);
  assert.match(last.body, /exit 1/);
  assert.doesNotMatch(wf.replace(/^\s*#.*$/gm, ""), /check-pool-ready\.mjs/, "the job no longer exits on the raw gate");
});
