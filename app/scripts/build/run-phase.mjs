#!/usr/bin/env node
/**
 * NAMED BUILD PHASES, OBSERVABLE WHILE THEY HANG (v1.8 · B5).
 *
 * WHY THIS EXISTS. On 2026-09-22 two Vercel builds died at the 46-minute platform ceiling. Both printed
 * `Generating static pages (1856/2475)` and then NOTHING — no error, no OOM, no progress — for ~41 minutes
 * (docs/V18_VERCEL_BUILD_FAILURE_DIAGNOSIS.md). Reconstructing that took authenticated `vercel inspect`
 * across three deployments, because the only evidence was a log that stopped.
 *
 * THE CONSTRAINT THAT SHAPES THIS FILE: a hung build never finishes, so a receipt written at the END is
 * worthless for the one failure it is meant to explain. Everything diagnostic therefore goes to STDOUT while
 * the phase is still running, because the streamed log is all that survives a ceiling kill. The JSON receipt
 * is a convenience for builds that complete, never the mechanism.
 *
 * What it prints (all on one prefix, `[phase]`, so a reader can grep one token):
 *   [phase] START  <name> at <iso>
 *   [phase] ALIVE  <name> 630s · last progress "Generating static pages (1856/2475)" 611s ago   ← every 30s
 *   [phase] END    <name> ok in 64.2s
 *   [phase] FAIL   <name> after 12.1s exit=1
 *
 * So the 46-minute stall would have read, from the log alone: the last phase to START and never END, its
 * elapsed seconds, the last progress counter it reached, and how long that counter had been frozen. That is
 * the whole diagnosis, without an authenticated log fetch.
 *
 * FAIL TOWARD OBSERVABILITY, NEVER TOWARD SKIPPING WORK:
 *   - the child's stdout/stderr are forwarded byte-for-byte, never buffered or filtered;
 *   - the child's exit code is this process's exit code, always — the wrapper can never turn red into green;
 *   - if anything in the instrumentation itself throws, the child still runs to completion (the watcher is
 *     wrapped and its failure is reported, not fatal);
 *   - it kills nothing and times nothing out. A watchdog that killed a build would destroy the evidence it
 *     exists to capture, and the platform ceiling already ends the run.
 *
 * WHERE THE RECEIPT GOES, AND WHY NOT public/data. The first draft defaulted it to
 * `public/data/ops/build-phases.json`, which is a PUBLISHED, COMMITTED path — and nightly-settle stages
 * `app/public/data/ops/` wholesale, so every bot build would have committed its own runner's phase timings
 * into the repo as if they were product data. The default is now `.next/gtp-build-phases.json`: a build
 * artifact, already ignored by git, never published, never committed. Nothing reads it at runtime.
 *
 * Usage:  node scripts/build/run-phase.mjs <phase-name> -- <command> [args...]
 * Env:    GTP_PHASE_HEARTBEAT_SECONDS (default 30, 0 disables) · GTP_PHASE_RECEIPT (path, default
 *         .next/gtp-build-phases.json) · GTP_PHASE_QUIET=1 to suppress ALIVE lines locally.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 1 || sep === argv.length - 1) {
  console.error("usage: node scripts/build/run-phase.mjs <phase-name> -- <command> [args...]");
  process.exit(2);
}
const NAME = argv.slice(0, sep).join(" ");
const CMD = argv[sep + 1];
const ARGS = argv.slice(sep + 2);

const HEARTBEAT_S = Number.isFinite(Number(process.env.GTP_PHASE_HEARTBEAT_SECONDS))
  ? Math.max(0, Number(process.env.GTP_PHASE_HEARTBEAT_SECONDS)) : 30;
const QUIET = process.env.GTP_PHASE_QUIET === "1";
const RECEIPT = process.env.GTP_PHASE_RECEIPT || path.join(".next", "gtp-build-phases.json");

const TAG = "[phase]";
const iso = () => new Date().toISOString();
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
/** Straight to stdout, unbuffered, so an ALIVE line reaches the platform log even mid-hang. */
const say = (line) => { try { fs.writeSync(1, `${TAG} ${line}\n`); } catch { /* a closed stdout must never fail a build */ } };

/*
 * PROGRESS LINES WORTH NAMING. Next prints `Generating static pages (N/M)` — the counter that froze at
 * 1856/2475 in both failures — plus a few other phase words. Matching is deliberately loose and additive:
 * an unmatched line costs nothing, a missed match only makes the heartbeat less specific, and a bad regex
 * must never be able to break the build.
 */
const PROGRESS_PATTERNS = [
  /Generating static pages \((\d+)\/(\d+)\)/,
  /Collecting page data/,
  /Collecting build traces/,
  /Finalizing page optimization/,
  /Compiled successfully/,
  /Linting and checking validity of types/,
];

let lastProgress = null;
let lastProgressAt = null;
function noteProgress(chunk) {
  const text = String(chunk);
  for (const line of text.split("\n")) {
    for (const re of PROGRESS_PATTERNS) {
      const m = re.exec(line);
      if (m) { lastProgress = line.trim().slice(0, 120); lastProgressAt = Date.now(); break; }
    }
  }
}

/*
 * RESOURCE STATE ON EVERY ALIVE LINE (P0 · 2026-09-24).
 *
 * The 2026-09-23/24 wedges all stalled at `Generating static pages (1869/2493)` and then said
 * nothing for ~39 minutes. In the one wedge whose log survived, THIS process's own 30-second
 * interval fired at 292s, 453s and 439s gaps — a process that does nothing but write to stdout
 * cannot GC-stall for seven minutes, so the machine underneath it was starved, blocked, or both.
 * The log could not say which, and that is the whole reason the incident stayed undiagnosed.
 *
 * These three numbers separate the candidate families on the NEXT occurrence, from the log alone:
 *   mem   container memory in use / limit — the cgroup the build actually runs in, not the host's
 *         /proc/meminfo, which on a shared builder describes a machine we do not own
 *   load  1-minute load average — CPU contention, which memory pressure does not explain
 *   rss   this wrapper's own resident size — a control: it must stay flat, and if it ever does
 *         not, the instrumentation is part of the problem
 *
 * Every read is wrapped and optional. A missing cgroup file, a different cgroup version, or a
 * platform without either (macOS locally) yields "?" and costs nothing — a diagnostic that can
 * fail a build is worse than no diagnostic at all.
 */
const readNum = (f) => { try { const v = Number(fs.readFileSync(f, "utf8").trim()); return Number.isFinite(v) ? v : null; } catch { return null; } };
const gib = (b) => `${(b / 1073741824).toFixed(2)}G`;
function resourceLine() {
  try {
    /* cgroup v2 first (Vercel's builders), then v1. "max" in v2 means unlimited → fall back to the host. */
    const used = readNum("/sys/fs/cgroup/memory.current") ?? readNum("/sys/fs/cgroup/memory/memory.usage_in_bytes");
    let limit = readNum("/sys/fs/cgroup/memory.max") ?? readNum("/sys/fs/cgroup/memory/memory.limit_in_bytes");
    if (limit != null && limit > os.totalmem()) limit = null;
    const mem = used != null
      ? `${gib(used)}/${limit != null ? gib(limit) : gib(os.totalmem())}`
      : `${gib(os.totalmem() - os.freemem())}/${gib(os.totalmem())}`;
    const load = os.loadavg()[0].toFixed(1);
    const rss = `${Math.round(process.memoryUsage().rss / 1048576)}M`;
    return ` · mem ${mem} · load ${load} · self ${rss}`;
  } catch { return ""; }
}

const started = Date.now();
say(`START  ${NAME} at ${iso()}`);

let timer = null;
if (HEARTBEAT_S > 0 && !QUIET) {
  timer = setInterval(() => {
    const elapsed = Math.round((Date.now() - started) / 1000);
    const stall = lastProgressAt ? ` · last progress ${JSON.stringify(lastProgress)} ${Math.round((Date.now() - lastProgressAt) / 1000)}s ago` : " · no progress line seen yet";
    say(`ALIVE  ${NAME} ${elapsed}s${stall}${resourceLine()}`);
  }, HEARTBEAT_S * 1000);
  timer.unref?.();
}

const child = spawn(CMD, ARGS, { stdio: ["inherit", "pipe", "pipe"], env: process.env, shell: false });

/* Forward byte-for-byte AND observe. Observation is wrapped: a throw in the watcher must not lose output. */
for (const [stream, fd] of [[child.stdout, 1], [child.stderr, 2]]) {
  stream.on("data", (chunk) => {
    try { fs.writeSync(fd, chunk); } catch { /* ignore a closed pipe */ }
    try { noteProgress(chunk); } catch { /* instrumentation is never fatal */ }
  });
}

function writeReceipt(outcome, code, ms) {
  try {
    const abs = path.resolve(RECEIPT);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    let doc = { schema: "gtp.build-phases.v1", phases: [] };
    if (fs.existsSync(abs)) { try { const prev = JSON.parse(fs.readFileSync(abs, "utf8")); if (Array.isArray(prev.phases)) doc = prev; } catch { /* a corrupt receipt is replaced, never trusted */ } }
    doc.updatedAt = iso();
    doc.phases = doc.phases.filter((p) => p.name !== NAME);
    doc.phases.push({ name: NAME, outcome, exitCode: code, durationMs: ms, lastProgress, finishedAt: iso() });
    fs.writeFileSync(abs, `${JSON.stringify(doc, null, 1)}\n`);
  } catch {
    /*
     * A receipt that cannot be written is NOT a build failure. The stdout markers above are the mechanism;
     * this file is a convenience. Swallowing here is deliberate and is the only swallow in this script.
     */
  }
}

const finish = (outcome, code) => {
  if (timer) clearInterval(timer);
  const ms = Date.now() - started;
  say(outcome === "ok" ? `END    ${NAME} ok in ${secs(ms)}` : `FAIL   ${NAME} after ${secs(ms)} exit=${code}`);
  writeReceipt(outcome, code, ms);
  /* The child's code is ours. A wrapper that can turn red into green is worse than no wrapper. */
  process.exit(code);
};

child.on("error", (err) => { say(`FAIL   ${NAME} could not start: ${err?.message ?? err}`); finish("error", 127); });
child.on("close", (code, signal) => {
  if (signal) { say(`FAIL   ${NAME} killed by ${signal} after ${secs(Date.now() - started)} · last progress ${JSON.stringify(lastProgress)}`); return finish("signal", 128); }
  finish(code === 0 ? "ok" : "fail", code ?? 1);
});
