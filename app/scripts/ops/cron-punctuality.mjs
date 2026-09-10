#!/usr/bin/env node
/**
 * CRON-PUNCTUALITY RUNNER — reads the schedule, reads the run history, publishes the delay.
 *
 * The judgement lives in src/lib/ops/cron-punctuality.mjs; this file does the network, the
 * filesystem and the clock, so the guards can drive every state without any of the three.
 *
 * FREE AND READ-ONLY. `gh run list` costs nothing and touches no paid provider — this instrument
 * must never be a reason to spend a credit, and it is deliberately built from evidence GitHub
 * already has rather than from anything we would have to buy or store.
 *
 * WHY THE WORKFLOW'S OWN CREATION DATE IS A FLOOR. Same reason cron-slots needs one: a slot before
 * the workflow file existed is not a slot anyone missed, and the first version of that watchdog
 * reported five such phantom misses on its first run.
 *
 * Usage:
 *   node app/scripts/ops/cron-punctuality.mjs [--now <iso>] [--days 7] [--json <path>]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  attributionHorizonMs,
  rollUp,
  summariseWorkflow,
} from "../../src/lib/ops/cron-punctuality.mjs";
import { expectedSlots, windowFloor } from "../../src/lib/ops/cron-slots.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const WF_DIR = path.join(REPO, ".github/workflows");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Every `cron:` line in a workflow, comments stripped. */
function cronsFor(file) {
  const src = fs.readFileSync(path.join(WF_DIR, file), "utf8");
  return [...src.matchAll(/cron:\s*['"]?([^'"\n#]+)/g)].map((m) => m[1].trim()).filter(Boolean);
}

/** When the workflow file was added. Null when history is too shallow to say — never guessed. */
function createdMsFor(file) {
  try {
    const out = execFileSync(
      "git",
      ["log", "--diff-filter=A", "--format=%aI", "--", `.github/workflows/${file}`],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim().split("\n").filter(Boolean).pop();
    const ms = out ? Date.parse(out) : NaN;
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

/**
 * Dispatch times of scheduled runs.
 *
 * `createdAt` is when GitHub DISPATCHED the run, which is the number this instrument is about.
 * `startedAt` would fold in runner queueing, a different and much smaller effect — on every run
 * inspected here the two were identical, so the delay is in the scheduler, not in the queue.
 *
 * Only `event == "schedule"` counts. A workflow_dispatch or workflow_run at an arbitrary hour is
 * not evidence about the cron, and counting one would let a manual recovery paper over a dead
 * schedule — which is exactly how a missed morning looks healthy.
 */
function scheduledRunsFor(file, limit = 100) {
  try {
    const out = execFileSync(
      "gh",
      ["run", "list", "--workflow", file, "--limit", String(limit), "--json", "createdAt,event"],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return JSON.parse(out)
      .filter((r) => r.event === "schedule")
      .map((r) => Date.parse(r.createdAt))
      .filter(Number.isFinite);
  } catch {
    return null; // unreachable gh — UNKNOWN, never "no runs"
  }
}

function main() {
  const nowIso = arg("now") ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) throw new Error(`--now is not a date: ${nowIso}`);
  const days = Number(arg("days", "7"));
  const fromMs = nowMs - days * 86_400_000;

  const files = fs
    .readdirSync(WF_DIR)
    .filter((f) => f.endsWith(".yml"))
    .filter((f) => cronsFor(f).length > 0)
    .sort();

  const rows = [];
  for (const file of files) {
    const crons = cronsFor(file);
    const floor = windowFloor(fromMs, createdMsFor(file));
    const slots = expectedSlots(crons, floor, nowMs);
    if (!slots.length) continue;

    const runs = scheduledRunsFor(file);
    if (runs === null) {
      rows.push({
        workflow: file, crons, attributable: false, medianDelayMinutes: null, maxDelayMinutes: null,
        judgedSlots: 0, servedSlots: 0, missedSlots: 0, minGapMinutes: null,
        state: "UNKNOWN", samples: [], note: "gh run list unavailable — no claim made",
      });
      continue;
    }
    rows.push(summariseWorkflow({ workflow: file, crons, slots, runMs: runs, nowMs }));
  }

  const summary = rollUp(rows);
  const artifact = {
    _note:
      "Cron punctuality: how late each scheduled workflow's dispatch actually was. Distinct from " +
      "cron-slot-watchdog (did it run at all) and publication-slo (did the board beat first pitch). " +
      "Read-only, derived from GitHub run history. Never a source of truth for money or slates.",
    schemaVersion: 1,
    artifact: "cron-punctuality",
    dataClass: "PUBLIC_DERIVED",
    generatedAt: new Date(nowMs).toISOString(),
    windowDays: days,
    bands: { onTimeMaxMinutes: 60, degradedMaxMinutes: 120 },
    summary,
    workflows: rows.sort((a, b) => (b.medianDelayMinutes ?? -1) - (a.medianDelayMinutes ?? -1)),
  };

  const out = arg("json");
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(REPO, out)), { recursive: true });
    fs.writeFileSync(path.resolve(REPO, out), `${JSON.stringify(artifact, null, 2)}\n`);
  }

  for (const r of artifact.workflows) {
    const delay = r.attributable && r.medianDelayMinutes !== null ? `${r.medianDelayMinutes}m median` : "—";
    console.log(
      `${r.state.padEnd(16)} ${String(delay).padStart(12)}  ${r.workflow}` +
        (r.attributable ? "" : `  (not attributable · every ${r.minGapMinutes}m)`),
    );
  }
  const s = summary;
  console.log(
    `\n${s.state} · fleet median ${s.fleetMedianDelayMinutes ?? "—"}m across ${s.measurableWorkflows} ` +
      `measurable workflow(s) · ${s.unmeasurableWorkflows} not attributable · ${s.missedTotal} missed slot(s)` +
      (s.worstWorkflow ? ` · worst ${s.worstWorkflow}` : ""),
  );
}

main();
