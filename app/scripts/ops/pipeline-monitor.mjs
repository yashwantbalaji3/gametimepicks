#!/usr/bin/env node
/**
 * PIPELINE MONITOR — reads the pipeline from the GitHub API, folds it into data/internal/ops/pipeline-status.json
 * and writes the NEW alerts (one per condition key) for the workflow to send through scripts/ops_alert.sh.
 * Logic and thresholds: lib/ops/pipeline-monitor.mjs. GET requests only (`gh api` with the job's token).
 *
 *   node app/scripts/ops/pipeline-monitor.mjs --repo owner/name --now <ISO> --alerts <file.jsonl> [--write]
 *
 * Exit 0 with the status written (when --write and changed) and the alerts listed; exit 2 when the API could not
 * be read — nothing is written then, so a partial read never clears a condition.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluatePipeline, foldStatus, gatherPipelineInputs, serializeStatus, PIPELINE_STATUS_FILE } from "../../src/lib/ops/pipeline-monitor.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : undefined; };
const NOW = arg("--now"), REPO = arg("--repo"), ALERTS = arg("--alerts");
if (!NOW || !Number.isFinite(Date.parse(NOW)) || !REPO || !ALERTS) { console.error("REFUSED: --repo, --now <ISO> and --alerts <file> required"); process.exit(1); }

const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8")); } catch { return null; } };
const api = (p) => JSON.parse(execFileSync("gh", ["api", "-H", "Accept: application/vnd.github+json", p], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));

let input;
try {
  input = gatherPipelineInputs(api, {
    repo: REPO, nowIso: NOW,
    qualityGateYaml: fs.readFileSync(path.join(REPO_ROOT, ".github/workflows/quality-gate.yml"), "utf8"),
    cronSlotReport: readJson("app/public/data/ops/cron-slot-watchdog.json"),
  });
} catch (err) {
  console.log(`API_UNREADABLE: ${String(err?.message ?? err).split("\n")[0].slice(0, 160)} — nothing written`);
  process.exit(2);
}

const prev = readJson(PIPELINE_STATUS_FILE);
const { status, alerts, cleared } = foldStatus(prev, evaluatePipeline(input, NOW), NOW);
fs.writeFileSync(ALERTS, alerts.map((a) => JSON.stringify(a)).join("\n") + (alerts.length ? "\n" : ""));
const body = serializeStatus(status);
const changed = !prev || serializeStatus(prev) !== body;
if (process.argv.includes("--write") && changed) fs.writeFileSync(path.join(REPO_ROOT, PIPELINE_STATUS_FILE), body);
console.log(`pipeline ${status.state}: ${status.conditions.length} condition(s) ${JSON.stringify(status.counts)} · ${alerts.length} new alert(s) · ${cleared.length} cleared · status ${changed ? "changed" : "unchanged"}`);
for (const c of status.conditions) console.log(`  ${alerts.some((a) => a.key === c.key) ? "NEW " : "    "}${c.kind}  ${c.detail}`);
