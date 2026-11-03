#!/usr/bin/env node
/**
 *   node command-center/orchestration/demo.mjs                       pipeline (a) end to end, MOCK adapters, temp store
 *   node command-center/orchestration/demo.mjs --pipeline research-verify-visual
 *   node command-center/orchestration/demo.mjs --rounds 1            review loop limit 1 → shows an ESCALATION
 *   node command-center/orchestration/demo.mjs --keep                keep the temp store and print its path
 *   node command-center/orchestration/demo.mjs --live --objective "…"
 *       refuses unless Claude, OpenAI and xAI are ALL configured (variable names present) with nonzero daily and
 *       monthly caps. Never touches the live console or its ledger: every run uses a fresh temporary store.
 *
 * The MOCK run makes no network call and spends nothing; every output it prints is tagged [MOCK].
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFileStore } from "../ledger/store.mjs";
import { stepClock } from "../lib/util.mjs";
import { createTaskLedger } from "./task-ledger.mjs";
import { PIPELINES, runPipeline, validatePipeline } from "./pipelines.mjs";
import { budgetConfig, PROVIDERS, CAP_ENV } from "./budgets.mjs";
import { createMockAdapters, createLiveAdapters, liveAvailable, LIVE_ENV } from "./adapters.mjs";
import { renderTaskTree, renderHandoffs, renderOutputs, renderAudit, renderBudget, mockBanner } from "./views.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

/** Live readiness: names only, plus the (non-secret) cap numbers. */
export function liveReadiness(env = process.env) {
  const problems = [];
  for (const p of PROVIDERS) {
    const a = liveAvailable(p, env);
    for (const m of a.missing) problems.push(`${p}: ${m} is not set`);
  }
  const cfg = budgetConfig({ env });
  for (const p of PROVIDERS) {
    if (!(cfg.providers[p].dailyUsd > 0)) problems.push(`${p}: ${CAP_ENV[p].daily} must be > 0`);
    if (!(cfg.providers[p].monthlyUsd > 0)) problems.push(`${p}: ${CAP_ENV[p].monthly} must be > 0`);
  }
  if (!(cfg.agentDefault.dailyUsd > 0) || !(cfg.agentDefault.monthlyUsd > 0)) problems.push("GTP_CC_AGENT_DAILY_CAP_USD and GTP_CC_AGENT_MONTHLY_CAP_USD must be > 0");
  return { ok: problems.length === 0, problems, config: cfg };
}

async function main() {
  const live = flag("--live");
  const pipelineId = opt("--pipeline", "build-review-release");
  const base = PIPELINES[pipelineId];
  if (!base) {
    console.error(`unknown pipeline ${pipelineId}; known: ${Object.keys(PIPELINES).join(", ")}`);
    return 2;
  }
  const rounds = Number(opt("--rounds", 0));
  const pipeline = rounds > 0 ? validatePipeline({ ...base, steps: base.steps.map((s) => (s.kind === "review" ? { ...s, maxRounds: rounds } : s)) }) : base;

  let adapters;
  let config;
  let objective = opt("--objective", "Add a 'last updated' timestamp to the Command Center queue header (demo objective)");
  if (live) {
    const r = liveReadiness(process.env);
    if (!r.ok) {
      console.error("REFUSED: --live needs all three providers configured with nonzero caps. Nothing was called.");
      for (const p of r.problems) console.error(`  • ${p}`);
      console.error(`Variable names checked: ${Object.values(LIVE_ENV).flat().join(", ")} (values are never read by this check).`);
      return 2;
    }
    if (!args.includes("--objective")) {
      console.error("REFUSED: --live needs an explicit --objective \"…\" (no canned objective is ever run live).");
      return 2;
    }
    const built = createLiveAdapters({ env: process.env });
    if (Object.keys(built.missing).length) {
      console.error("REFUSED: live adapters could not be built:");
      for (const [p, m] of Object.entries(built.missing)) console.error(`  • ${p}: ${m.join("; ")}`);
      return 2;
    }
    adapters = built.adapters;
    config = r.config;
  } else {
    adapters = createMockAdapters({ reviewVerdicts: pipelineId === "research-verify-visual" ? ["approve"] : ["changes", "approve"] }).adapters;
    config = budgetConfig({ env: {} }); // every cap $0: MOCK calls have a $0 worst case
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-cc-orch-demo-"));
  const clock = live ? () => new Date().toISOString() : stepClock("2026-11-03T12:00:00.000Z");
  const store = createFileStore({ dir, clock });
  const ledger = createTaskLedger({ store, clock, ledgerId: "demo" });
  const now = live ? () => new Date().toISOString() : () => "2026-11-03T12:00:00.000Z";

  const run = await runPipeline({ ledger, pipeline, objective, adapters, config, now, runKey: live ? `live-${Date.now()}` : "demo" });
  const state = ledger.state();
  const events = ledger.events();

  const hr = (t) => `\n── ${t} ${"─".repeat(Math.max(0, 100 - t.length))}`;
  console.log(`GameTimePicks Command Center — orchestration demo (${live ? "LIVE" : "MOCK"} adapters)`);
  const banner = mockBanner(state);
  if (banner) console.log(banner);
  console.log(`pipeline: ${pipeline.title}`);
  console.log(`run ${run.runId}: ${run.status}${run.detail ? ` (${run.detail})` : ""}`);
  console.log(`store: throwaway ${live ? "" : "temp "}file store (not the live console ledger)`);
  console.log(hr("TASK TREE"));
  console.log(renderTaskTree(state));
  console.log(hr("HANDOFFS"));
  console.log(renderHandoffs(state));
  console.log(hr("ATTRIBUTED OUTPUTS"));
  console.log(renderOutputs(state));
  if (state.escalations.length) {
    console.log(hr("ESCALATIONS"));
    for (const e of state.escalations) console.log(`${e.subjectTaskId} ESCALATED after ${e.rounds} round(s) → decider: ${e.decider} — ${e.reason}`);
  }
  console.log(hr("BUDGET"));
  console.log(renderBudget(state, now()));
  console.log(hr("AUDIT RECORD"));
  console.log(renderAudit(state, events));
  if (run.status === "AWAITING_FOUNDER_APPROVAL") {
    console.log(`\nWaiting on the founder: task ${run.detail} is READY_FOR_APPROVAL (Level C). The orchestrator cannot approve it,`);
    console.log(live ? "and only an authenticated founder can." : "and because its lineage is MOCK the ledger refuses any approval of it (MOCK_NOT_APPROVABLE).");
  }
  if (banner) console.log(`\n${banner}`);
  if (flag("--keep")) console.log(`\nstore kept at ${dir}`);
  else fs.rmSync(dir, { recursive: true, force: true });
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("orchestration/demo.mjs")) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err.stack ?? String(err));
    process.exit(1);
  });
}
