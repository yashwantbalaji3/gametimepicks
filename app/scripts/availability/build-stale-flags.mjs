#!/usr/bin/env node
/**
 * INJURY MONITOR · appends staleness events to app/public/data/<sport>/stale-flags/<date>.json (lib/availability/
 * stale-flags.mjs). Run after each injuries capture. Never edits a frozen forecast; never rewrites an existing event.
 *   node app/scripts/availability/build-stale-flags.mjs --sport nba|nfl --date YYYY-MM-DD [--root <repo>] [--capture <file>]
 *        [--versions <file>] [--now <ISO>] [--no-alert] [--check]
 * RECOVERY: clears (appended, never edits) for flags whose player is available again before the start, or whose game has a
 * newer approved forecast version (--versions: { [eventId]: { forecastSha256, approvedAt } }, from the versioning store
 * once it exists — docs/FORECAST_VERSIONING_DESIGN.md).
 * HEALTH: a missing / malformed / stale capture (inside the pre-start protection window) or a malformed flags file is sent
 * through the EXISTING ops alert path (scripts/ops_alert.sh, PHASE=injury-monitor; it always exits 0 and never carries
 * secrets). A malformed input also exits 3, so the calling job fails visibly.
 * NBA: candidates from the frozen lane (app/public/data/nba/experimental-public/<date>.json).
 * NFL: candidates from each player board (app/public/data/nfl/player-board/<eventId>.json) whose kickoff falls on <date> ET.
 * A quiet capture (no new event) writes nothing, so a caller may stage the path unconditionally.
 * --check exits 1 when the inputs would append an event the committed file lacks (nothing is written).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { appendStaleFlags, detectClearEvents, detectStaleEvents, monitorHealth, nbaCandidates, nflCandidates, STALE_FLAGS_REL } from "../../src/lib/availability/stale-flags.mjs";

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const root = path.resolve(arg("--root") ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.."));
const sport = arg("--sport");
const date = arg("--date");
if (!["nba", "nfl"].includes(sport) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) { console.error("--sport nba|nfl --date YYYY-MM-DD required"); process.exit(2); }
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const sha = (obj) => crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");

const alert = (failures) => {
  if (!failures.length || args.includes("--no-alert")) return;
  for (const f of failures) console.error(`::error::injury monitor ${f.code}: ${f.detail}`);
  spawnSync("bash", [path.join(root, "scripts/ops_alert.sh")], { stdio: "inherit", env: { ...process.env, PHASE: "injury-monitor", EXIT_STATUS: failures.map((f) => f.code).join(","), SLATE_DATE: date, ERROR_LINE: failures.map((f) => `${f.code}: ${f.detail}`).join(" | ") } });
};
const nowIso = arg("--now") ?? new Date().toISOString();
const capPath = arg("--capture") ? path.resolve(arg("--capture")) : path.join(root, `data/internal/research/injuries/${sport}/latest.json`);
let capture = null;
try { capture = fs.existsSync(capPath) ? read(capPath) : null; } catch { capture = { sourceAsOf: "unreadable" }; }

let candidates = [];
if (sport === "nba") {
  const lanePath = path.join(root, "app/public/data/nba/experimental-public", `${date}.json`);
  if (!fs.existsSync(lanePath)) { console.log(`no NBA lane for ${date}: nothing to check`); process.exit(0); }
  candidates = nbaCandidates(read(lanePath), sha);
} else {
  const dir = path.join(root, "app/public/data/nfl/player-board");
  const etDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  for (const f of (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((x) => /^\d+\.json$/.test(x)).sort()) {
    const b = read(path.join(dir, f));
    if (b?.kickoffUtc && etDay.format(new Date(Date.parse(b.kickoffUtc))) === date) candidates.push(...nflCandidates(b, sha));
  }
}

const outPath = path.join(root, STALE_FLAGS_REL(sport, date));
let before = null;
try { before = fs.existsSync(outPath) ? read(outPath) : null; } catch { before = { schema: "unreadable" }; }
const health = monitorHealth({ sport, date, capture, flagsFile: before, starts: [...new Set(candidates.map((c) => c.startUtc))], nowIso });
alert(health);
if (health.some((f) => f.code === "CAPTURE_MALFORMED" || f.code === "FLAGS_MALFORMED" || f.code === "CAPTURE_MISSING")) process.exit(3);
const versions = arg("--versions") ? read(path.resolve(arg("--versions"))) : {};
/* one version per capture: new flags and the clears of earlier flags (a flag cannot be raised and cleared by one capture) */
const next = appendStaleFlags(before, [...detectStaleEvents(candidates, capture), ...detectClearEvents(before, capture, candidates, versions)], { sport, date, capturedAt: capture.sourceAsOf ?? null });
if (args.includes("--check")) { if (next !== before && next.events.length !== (before?.events.length ?? 0)) { console.error(`${STALE_FLAGS_REL(sport, date)} lacks ${next.events.length - (before?.events.length ?? 0)} event(s)`); process.exit(1); } process.exit(0); }
if (next === before || (!before && next.events.length === 0)) { console.log(`${STALE_FLAGS_REL(sport, date)}: no new staleness event`); process.exit(0); }
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(next, null, 1) + "\n");
const added = next.versions.at(-1).added;
console.log(`appended version ${next.versions.length} to ${STALE_FLAGS_REL(sport, date)}: ${added.join(", ")}`);
