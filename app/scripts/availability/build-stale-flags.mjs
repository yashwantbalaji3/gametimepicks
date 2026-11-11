#!/usr/bin/env node
/**
 * INJURY MONITOR · appends staleness events to app/public/data/<sport>/stale-flags/<date>.json (lib/availability/
 * stale-flags.mjs). Run after each injuries capture. Never edits a frozen forecast; never rewrites an existing event.
 *   node app/scripts/availability/build-stale-flags.mjs --sport nba|nfl --date YYYY-MM-DD [--root <repo>] [--capture <file>] [--check]
 * NBA: candidates from the frozen lane (app/public/data/nba/experimental-public/<date>.json).
 * NFL: candidates from each player board (app/public/data/nfl/player-board/<eventId>.json) whose kickoff falls on <date> ET.
 * A quiet capture (no new event) writes nothing, so a caller may stage the path unconditionally.
 * --check exits 1 when the inputs would append an event the committed file lacks (nothing is written).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendStaleFlags, detectStaleEvents, nbaCandidates, nflCandidates, STALE_FLAGS_REL } from "../../src/lib/availability/stale-flags.mjs";

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const root = path.resolve(arg("--root") ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.."));
const sport = arg("--sport");
const date = arg("--date");
if (!["nba", "nfl"].includes(sport) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) { console.error("--sport nba|nfl --date YYYY-MM-DD required"); process.exit(2); }
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const sha = (obj) => crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");

const capPath = arg("--capture") ? path.resolve(arg("--capture")) : path.join(root, `data/internal/research/injuries/${sport}/latest.json`);
if (!fs.existsSync(capPath)) { console.log(`no ${sport} injuries capture: nothing to check`); process.exit(0); }
const capture = read(capPath);

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

const events = detectStaleEvents(candidates, capture);
const outPath = path.join(root, STALE_FLAGS_REL(sport, date));
const before = fs.existsSync(outPath) ? read(outPath) : null;
const next = appendStaleFlags(before, events, { sport, date, capturedAt: capture.sourceAsOf ?? null });
if (args.includes("--check")) { if (next !== before && next.events.length !== (before?.events.length ?? 0)) { console.error(`${STALE_FLAGS_REL(sport, date)} lacks ${next.events.length - (before?.events.length ?? 0)} event(s)`); process.exit(1); } process.exit(0); }
if (next === before || (!before && next.events.length === 0)) { console.log(`${STALE_FLAGS_REL(sport, date)}: no new staleness event`); process.exit(0); }
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(next, null, 1) + "\n");
const added = next.versions.at(-1).added;
console.log(`appended version ${next.versions.length} to ${STALE_FLAGS_REL(sport, date)}: ${added.join(", ")}`);
