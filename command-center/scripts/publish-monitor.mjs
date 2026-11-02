/**
 * Read-only publishing monitor: GET /api/state only. It never writes, restarts or sends.
 * One line per event. Alerts on job outcomes, missed jobs, console down and Mac sleep gaps.
 * A job with no recorded outcome yet is in flight, not an outcome, so it is skipped.
 *   node command-center/scripts/publish-monitor.mjs [url] [intervalSeconds]
 */
import http from "node:http";
import { pathToFileURL } from "node:url";

const IN_FLIGHT = "NO_OUTCOME_RECORDED";

/** Pure: what changed between two reads. `seen` is updated in place. */
export function jobEvents(jobs, seen, { first = false } = {}) {
  const out = [];
  for (const j of jobs) {
    const last = j.results?.at(-1);
    if (last?.code === IN_FLIGHT) continue;
    const key = `${j.status}|${last?.code ?? ""}`;
    if (seen.get(j.jobId) === key) continue;
    seen.set(j.jobId, key);
    if (first) continue;
    const severity = ["missed", "unknown", "refused", "failed_not_sent"].includes(j.status) ? "ALERT" : "INFO";
    out.push(`${severity} ${j.status.toUpperCase()} ${j.jobId} ${j.title ?? ""} due ${j.dueAt} ${last?.canonicalUrl ?? ""} ${last?.code ?? ""}`.trim());
  }
  return out;
}

/** Pure: a loop that woke far later than asked means this Mac slept or the process froze. */
export function sleepGap(previousMs, nowMs, intervalMs) {
  return previousMs != null && nowMs - previousMs > Math.max(intervalMs * 3, 180_000) ? Math.round((nowMs - previousMs) / 60_000) : null;
}

/** Pure: a due job still pending well past its time means the scheduler is not running it. */
export function overdue(jobs, nowMs, graceMs = 300_000) {
  return jobs.filter((j) => j.status === "scheduled" && nowMs - Date.parse(j.dueAt) > graceMs).map((j) => `ALERT OVERDUE ${j.jobId} ${j.title ?? ""} due ${j.dueAt}`);
}

const read = (url) => new Promise((ok, no) => {
  const r = http.get(`${url}/api/state`, { timeout: 120_000 }, (x) => { const c = []; x.on("data", (d) => c.push(d)); x.on("end", () => { try { ok(JSON.parse(Buffer.concat(c).toString())); } catch (e) { no(e); } }); });
  r.on("error", no); r.on("timeout", () => r.destroy(new Error("timeout")));
});

async function main(url = "http://127.0.0.1:4190", seconds = "60") {
  const intervalMs = Number(seconds) * 1000, seen = new Map(), alerted = new Set();
  let first = true, down = false, lastLoop = null;
  for (;;) {
    const now = Date.now();
    const gap = sleepGap(lastLoop, now, intervalMs);
    if (gap) console.log(`ALERT MAC_ASLEEP_OR_FROZEN no monitor loop for ${gap} minutes`);
    lastLoop = now;
    try {
      const s = await read(url);
      if (down) console.log("INFO CONSOLE_BACK");
      down = false;
      for (const line of [...jobEvents(s.publishing.jobs, seen, { first }), ...overdue(s.publishing.jobs, Date.now())]) {
        if (!alerted.has(line)) console.log(line);
        if (line.includes("OVERDUE")) alerted.add(line);
      }
      first = false;
    } catch (e) {
      if (!down) console.log(`ALERT CONSOLE_DOWN ${String(e.message).slice(0, 80)}`);
      down = true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv[2], process.argv[3]);
