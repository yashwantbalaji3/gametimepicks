/**
 * OPS NOTIFY + HEARTBEAT — closes the "nobody is told a run failed" gap (audit P0-2).
 *
 * Two jobs, both safe to call from any lifecycle stage:
 *   1) Always writes/updates app/public/data/ops/heartbeat.json — the dead-man's-switch record:
 *      { lastRunAt, status, phase, date, message, money:{...}, ok }. An external monitor (or
 *      check-heartbeat.mjs) reads this to detect "the cron silently stopped" / "data is stale".
 *   2) If OPS_WEBHOOK_URL is set (Slack/Discord/generic JSON webhook), best-effort POSTs a one-line
 *      summary. No webhook → honest no-op (heartbeat still written). A webhook/network failure NEVER
 *      throws — notification must never break the lifecycle. Always exits 0.
 *
 *   node app/scripts/ops-notify.mjs --status pass|fail|partial --phase settle --date 2026-06-27 --message "…"
 *
 * Resolves its data dir from its own location (cwd-agnostic), matching the gates.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")); } catch { return null; } };

const status = arg("--status", "info");      // pass | fail | partial | info
const phase = arg("--phase", "lifecycle");
const date = arg("--date", "");
const message = arg("--message", "");
let nowIso = arg("--now", "");
try { if (!nowIso) nowIso = new Date().toISOString(); } catch { nowIso = `${date || "1970-01-01"}T00:00:00Z`; }

const pf = readJson("mr-dub/portfolio.json") || {};
const money = {
  bankroll: pf.currentBankroll ?? null,
  crown: pf.crownBankroll ?? null,
  settledProfit: pf.settledProfit ?? null,
  record: pf.record ? `${pf.record.wins}-${pf.record.losses}` : null,
};

const heartbeat = {
  lastRunAt: nowIso,
  ok: status === "pass",
  status, phase, date, message,
  money,
};

const dir = path.join(DATA, "ops");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "heartbeat.json"), JSON.stringify(heartbeat, null, 2) + "\n");

const icon = status === "pass" ? "✅" : status === "fail" ? "🔴" : status === "partial" ? "🟡" : "ℹ️";
const line = `${icon} GameTimePicks ${phase}${date ? ` ${date}` : ""}: ${status}${message ? ` — ${message}` : ""} · bankroll $${money.bankroll} · ${money.record}`;
console.log(`heartbeat → ops/heartbeat.json · ${line}`);

const url = process.env.OPS_WEBHOOK_URL;
if (url) {
  try {
    // Slack/Discord both accept a JSON body with a "text"/"content" field; send both keys for compatibility.
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: line, content: line }),
      signal: AbortSignal.timeout(8000),
    });
    console.log(res.ok ? "  webhook delivered" : `  webhook non-2xx (${res.status}) — ignored`);
  } catch (e) {
    console.log(`  webhook failed (${e?.name || "error"}) — ignored, lifecycle unaffected`);
  }
} else {
  console.log("  OPS_WEBHOOK_URL unset — heartbeat written, no external notification (honest skip)");
}
process.exit(0);
