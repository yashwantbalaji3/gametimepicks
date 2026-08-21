#!/usr/bin/env node
/**
 * CRON-SLOT WATCHDOG — reports scheduled runs that never fired, per sport.
 *
 *   node app/scripts/ops/cron-slot-watchdog.mjs --now <iso> [--lookback-hours 168] [--json out.json]
 *
 * Reads each owning workflow's OWN cron lines (never a second copy of the schedule — a hardcoded
 * cadence here would drift from the workflow silently) and asks `gh` which runs exist. A slot with
 * no run attributable to it is reported; a slot that produced nothing is not, because a quiet week
 * is not an outage. See lib/ops/cron-slots.mjs for why this watches runs and not artifacts.
 *
 * IT ALSO WATCHES WHETHER THE RUN WORKED. Firing and failing is not a quiet week, and reporting it
 * as OK is the failure mode this project keeps rediscovering: on 2026-08-21 nfl-event-window failed
 * all three of its daily slots, the NFL index went a full day stale, the public hub derived its slate
 * day from that stale anchor and rendered a day with no games in it — and this watchdog said
 * `nfl: OK`, because three runs had fired and it never looked at how they ended. The conclusion was
 * one field away in the same API call.
 *
 * Exit 0 always. This reports; the caller decides whether a miss is worth alerting on, and a
 * watchdog that can fail the run it watches is its own outage.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { expectedSlots, failureStreak, missedSlots, windowFloor } from "../../src/lib/ops/cron-slots.mjs";
import { SPORT_OWNERS } from "../../src/lib/sports/sport-owners.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const NOW = arg("--now", new Date().toISOString());
const nowMs = Date.parse(NOW);
if (!Number.isFinite(nowMs)) { console.error("usage: cron-slot-watchdog.mjs --now <iso>"); process.exit(1); }
const LOOKBACK_H = Number(arg("--lookback-hours", "168"));
const fromMs = nowMs - LOOKBACK_H * 3600_000;

/** The workflow's own cron lines. Parsed from the YAML so the schedule has ONE source. */
function cronsFor(wf) {
  const src = fs.readFileSync(path.join(REPO, ".github/workflows", wf), "utf8");
  return [...src.matchAll(/^\s*-\s*cron:\s*["']([^"']+)["']/gm)].map((m) => m[1]);
}

/** When the workflow file first landed, epoch ms, or NaN when git cannot date it. */
function createdAtFor(wf) {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--format=%aI", "--", `.github/workflows/${wf}`], { cwd: REPO, encoding: "utf8" });
    const first = out.trim().split("\n").filter(Boolean).pop();
    return first ? Date.parse(first) : NaN;
  } catch { return NaN; }
}

/**
 * Runs for a workflow: start times for slot attribution, plus how each one ENDED.
 *
 * `times` deliberately includes failed runs — a run that fired and crashed still occupied its slot,
 * and counting it as missed would blame the scheduler for a code defect. Whether it worked is a
 * separate question, answered by `outcomes`.
 *
 * An unreachable gh is UNKNOWN, never "no runs".
 */
function runsFor(wf) {
  try {
    const out = execFileSync("gh", ["run", "list", "--workflow", wf, "--limit", "100", "--json", "createdAt,status,conclusion"], { cwd: REPO, encoding: "utf8" });
    const rows = JSON.parse(out);
    return {
      ok: true,
      times: rows.map((r) => Date.parse(r.createdAt)).filter(Number.isFinite),
      // Completed runs only, newest first. An in-progress run has no verdict yet and must not be
      // read as either a success or a failure.
      outcomes: rows
        .filter((r) => r.status === "completed" && Number.isFinite(Date.parse(r.createdAt)))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((r) => ({ at: r.createdAt, conclusion: r.conclusion })),
    };
  } catch (e) {
    return { ok: false, times: [], outcomes: [], reason: String(e.message ?? e).slice(0, 120) };
  }
}


const report = { kind: "cron-slot-watchdog", generatedAt: NOW, lookbackHours: LOOKBACK_H, sports: {}, missedTotal: 0, failingTotal: 0, unknown: [] };

for (const [sport, owner] of Object.entries(SPORT_OWNERS)) {
  if (!owner.primary) { report.sports[sport] = { skipped: true, reason: owner.unownedReason ?? "no primary owner" }; continue; }
  const crons = cronsFor(owner.primary);
  if (crons.length === 0) { report.sports[sport] = { workflow: owner.primary, skipped: true, reason: "workflow declares no cron" }; continue; }

  // A slot from before the workflow existed is not a slot anyone missed. Without this floor the
  // first live run reported five misses across UFC and EPL and every one predated the file.
  const createdMs = createdAtFor(owner.primary);
  const slots = expectedSlots(crons, windowFloor(fromMs, createdMs), nowMs);
  const runs = runsFor(owner.primary);
  if (!runs.ok) {
    // Cannot see the runs => cannot claim they are missing. Reported as unknown, which is a
    // different fact from zero and must never be rendered as a healthy result.
    report.sports[sport] = { workflow: owner.primary, crons, expected: slots.length, state: "UNKNOWN", reason: runs.reason };
    report.unknown.push(sport);
    continue;
  }
  const missed = missedSlots(slots, runs.times, { nowMs });
  const outcomes = runs.outcomes ?? [];
  const consecutiveFailures = failureStreak(outcomes);
  const lastConclusion = outcomes[0]?.conclusion ?? null;

  /*
   * WORST-OF, and both facts are always carried.
   *
   * A workflow can be missing slots AND failing the ones it fires; collapsing that into one word
   * loses half the diagnosis, so `state` names the worse condition while `missed` and
   * `consecutiveFailures` stay readable side by side. MISSED outranks FAILING because a job that
   * never started cannot be diagnosed from its own logs.
   */
  const state = missed.length ? "MISSED" : consecutiveFailures > 0 ? "FAILING" : "OK";
  report.sports[sport] = {
    workflow: owner.primary, crons, createdAt: Number.isFinite(createdMs) ? new Date(createdMs).toISOString() : null,
    expected: slots.length, ran: runs.times.length,
    missed: missed.map((t) => new Date(t).toISOString()),
    lastConclusion, consecutiveFailures,
    state,
  };
  report.missedTotal += missed.length;
  if (consecutiveFailures > 0) report.failingTotal += 1;
}

const out = arg("--json");
if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n"); }

for (const [sport, r] of Object.entries(report.sports)) {
  if (r.skipped) { console.log(`${sport.padEnd(4)} skipped — ${r.reason}`); continue; }
  if (r.state === "UNKNOWN") { console.log(`${sport.padEnd(4)} UNKNOWN — could not read runs (${r.reason})`); continue; }
  const fail = r.consecutiveFailures > 0 ? ` · LAST ${r.consecutiveFailures} RUN(S) ${String(r.lastConclusion).toUpperCase()}` : "";
  console.log(`${sport.padEnd(4)} ${r.state.padEnd(7)} ${r.expected} expected slot(s), ${r.ran} run(s)${r.missed.length ? ` · MISSED ${r.missed.join(", ")}` : ""}${fail}`);
}
console.log(`\n${report.missedTotal} missed slot(s) · ${report.failingTotal} failing workflow(s) across ${Object.keys(report.sports).length} sport(s)${report.unknown.length ? ` · ${report.unknown.length} unknown` : ""}`);
