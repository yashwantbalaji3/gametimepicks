#!/usr/bin/env node
/**
 * DATA-CONTRACT CHECK FOR DATA COMMITS (CI reliability, 2026-10-14).
 *
 * 33 data workflows commit with `[skip ci]`. On 2026-10-14 the first UFC VOID row (a correct record) broke a
 * forecast-ledger parity test and main stayed red for hours, visible only through unrelated PRs. This runs, inside
 * the data workflow and before its commit, ONLY the contract tests that read the kind of record being committed —
 * seconds, not the 25-minute gate — chosen from the STAGED paths by scripts/ci/data-contracts.json.
 *
 * It never blocks the data. A correct settlement must not be discarded because a reader cannot parse it: the
 * workflow commits either way and then fails loudly (ops alert) when this exits non-zero, so the break is known
 * within minutes, with the failing test named, instead of hours later on someone's PR.
 *
 *   exit 0  every selected contract passed, or nothing staged maps to a contract
 *   exit 1  a contract failed (failing tests printed)
 *   exit 2  could not run (manifest unreadable, git error) — the workflow treats it like 1
 *
 *   node app/scripts/ci/run-data-contracts.mjs [--staged | --files a b c] [--dry-run]
 * Run from the repo root.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
let code = 2;
try {
  const manifest = JSON.parse(fs.readFileSync("app/scripts/ci/data-contracts.json", "utf8"));
  const files = argv.includes("--files")
    ? argv.slice(argv.indexOf("--files") + 1).filter((a) => !a.startsWith("--"))
    : execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const tests = new Set();
  const why = [];
  for (const c of manifest.contracts) {
    const hit = files.find((f) => c.paths.some((p) => f.startsWith(p)));
    if (!hit) continue;
    why.push(`${c.id} (${hit})`);
    for (const t of [...manifest.core, ...c.tests]) tests.add(t);
  }
  if (tests.size === 0) { console.log("data contracts: nothing staged maps to a record contract — no check needed"); code = 0; }
  else {
    const missing = [...tests].filter((t) => !fs.existsSync(path.join("app", t)));
    if (missing.length) throw new Error(`contract tests missing: ${missing.join(", ")}`);
    console.log(`data contracts: ${tests.size} test file(s) for ${why.join("; ")}`);
    if (DRY) { console.log([...tests].join("\n")); code = 0; }
    else {
      const t0 = Date.now();
      const r = spawnSync("npx", ["tsx", "--test", "--test-reporter=tap", ...tests], { cwd: "app", encoding: "utf8", maxBuffer: 64 << 20 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const fails = out.split("\n").filter((l) => /^not ok /.test(l));
      const pass = /# pass (\d+)/.exec(out)?.[1] ?? "?";
      console.log(`data contracts: ${pass} passed, ${fails.length} failed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      for (const f of fails.slice(0, 20)) console.log(`::error::${f}`);
      code = r.status === 0 && fails.length === 0 ? 0 : 1;
    }
  }
} catch (e) { console.log(`::error::data contracts could not run: ${String(e?.message ?? e).slice(0, 300)}`); code = 2; }
process.exit(code);
