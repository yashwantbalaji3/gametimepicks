#!/usr/bin/env node
/**
 * Mid-capture health snapshot — READ-ONLY on the evidence folder; makes no network request and never touches the
 * running capture. Run during a live window (e.g. the first quarter) to catch a silent capture defect early:
 *
 *   node docs/live/capture/check-live.mjs ~/gtp-evidence/live-v2-sun-1018/captures
 *
 * Per event: the newest envelope's state, period/clock, score, and envelope player-stat rows; plus the capture's
 * failed requests (http 0 / non-200 / bot-challenged) in the last hour and whether the process is alive.
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, "captures.jsonl"))) { console.error("usage: check-live.mjs <captures dir>"); process.exit(2); }
const lines = fs.readFileSync(path.join(dir, "captures.jsonl"), "utf8").split("\n").filter(Boolean).flatMap((l) => {
  try { return [JSON.parse(l)]; } catch { return [{ name: "malformed", raw: l.slice(0, 80) }]; }
});
const start = lines.find((l) => l.name === "start");
const toMs = (t) => Date.parse(String(t).replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z"));
const now = Date.now();
let alive = "unknown";
try { const pid = Number(fs.readFileSync(path.join(dir, "capture.pid"), "utf8").trim()); process.kill(pid, 0); alive = `alive (pid ${pid})`; } catch { alive = "NOT RUNNING"; }
const lastPass = [...lines].reverse().find((l) => l.name === "pass");
console.log(`capture: ${alive} · last pass ${lastPass ? new Date(toMs(lastPass.t)).toISOString() : "none"} (n=${lastPass?.n ?? 0}, active ${JSON.stringify(lastPass?.active ?? [])})`);
const recent = lines.filter((l) => "http" in l && now - toMs(l.t) < 3_600_000);
const failed = recent.filter((l) => l.http !== 200);
const challenged = recent.filter((l) => l.mitigated);
console.log(`last hour: ${recent.length} requests · ${failed.length} non-200 (incl. http 0) · ${challenged.length} bot-challenged · malformed lines total ${lines.filter((l) => l.name === "malformed").length}`);
for (const ev of start?.events ?? []) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(`-event-${ev}.json`) || (f.includes(ev) && f.endsWith("-event.json"))).sort();
  const f = files.at(-1);
  if (!f) { console.log(`${ev}: no envelope captured yet`); continue; }
  let e; try { e = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { console.log(`${ev}: newest envelope ${f} unreadable`); continue; }
  const evt = e.event ?? e;
  const ps = Array.isArray(evt.playerStats) ? evt.playerStats : Array.isArray(e.playerStats) ? e.playerStats : [];
  const c = evt.competitors ?? {};
  const flag = (evt.state === "LIVE" && ps.length === 0) ? "  ⚠ LIVE WITH NO PLAYER STATS" : "";
  console.log(`${ev}: ${f.slice(0, 16)} state=${evt.state ?? "?"} period=${evt.period ?? "—"} clock=${evt.clock ?? "—"} score=${c.away?.score ?? "—"}-${c.home?.score ?? "—"} playerStats=${ps.length}${flag}`);
}
