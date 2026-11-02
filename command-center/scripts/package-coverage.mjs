/**
 * Read-only: upcoming events against review packages. One line per event; ALERT when no current package exists by
 * the lead-time deadline. It generates nothing and posts nothing.
 *   node command-center/scripts/package-coverage.mjs [hoursAhead] [leadHours] [ref]
 * Needs a recent `git fetch`. Events come from the published files at `ref` (default origin/main).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Pure: events in the window, each with its package state. */
export function coverage(events, packages, { nowMs, hoursAhead = 48, leadHours = 6 }) {
  return events.filter((e) => { const t = Date.parse(e.startUtc); return t > nowMs && t - nowMs <= hoursAhead * 3_600_000; }).sort((a, b) => a.startUtc.localeCompare(b.startUtc)).map((e) => {
    const mine = packages.filter((p) => String(p.eventId) === String(e.eventId));
    const current = mine.filter((p) => p.generatedMs >= Date.parse(e.startUtc) - 72 * 3_600_000 && p.clean);
    const hours = (Date.parse(e.startUtc) - nowMs) / 3_600_000;
    return { ...e, hoursToStart: Number(hours.toFixed(1)), packages: mine.length, current: current.length, state: current.length ? "READY" : hours <= leadHours ? "ALERT_NO_PACKAGE" : "PENDING" };
  });
}

const show = (ref, f) => { try { return JSON.parse(execFileSync("git", ["show", `${ref}:${f}`], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] })); } catch { return null; } };
export function upcomingEvents(ref, nowMs) {
  const out = [];
  for (const offset of [-1, 0, 1, 2]) {
    const date = new Date(nowMs + offset * 864e5).toISOString().slice(0, 10);
    for (const g of show(ref, `app/public/data/nba/experimental-public/${date}.json`)?.games ?? []) out.push({ sport: "NBA", eventId: g.providerEventId, startUtc: new Date(g.tipUtc).toISOString(), label: g.matchup ?? g.providerEventId, dataAt: null });
  }
  const nfl = show(ref, "app/public/data/nfl/forecasts/latest.json");
  for (const g of nfl?.forecasts ?? []) out.push({ sport: "NFL", eventId: g.providerEventId, startUtc: new Date(g.kickoffUtc).toISOString(), label: `${g.away?.abbr} @ ${g.home?.abbr}`, dataAt: nfl.generatedAt ?? null });
  return [...new Map(out.map((e) => [`${e.sport}|${e.eventId}`, e])).values()];
}
export function reviewPackages(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => {
    try { const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); return [{ eventId: d.commandCenter?.eventId, generatedMs: fs.statSync(path.join(dir, f)).mtimeMs, clean: d.approval?.socialAuthorized === true }]; } catch { return []; }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [hours = "48", lead = "6", ref = "origin/main"] = process.argv.slice(2), nowMs = Date.now();
  const rows = coverage(upcomingEvents(ref, nowMs), reviewPackages(path.join(os.homedir(), "gtp-private/graphics/packages")), { nowMs, hoursAhead: Number(hours), leadHours: Number(lead) });
  for (const r of rows) console.log(`${r.state} ${r.sport} ${r.eventId} ${r.label} start ${r.startUtc} in ${r.hoursToStart}h packages ${r.packages} current ${r.current}`);
  console.log(`events ${rows.length}`);
}
