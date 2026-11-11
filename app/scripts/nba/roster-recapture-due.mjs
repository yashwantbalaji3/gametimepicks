#!/usr/bin/env node
/**
 * Prints "due" or "fresh" (then the age, the reason and the rule) for the committed NBA roster capture at --now, by
 * eligibility@1's build window (lib/sports/nba/roster-recapture.mjs). Used by nba-forecast-window's pregame roster step.
 * Always exits 0: an unreadable capture on a slate day is "due"; an unreadable schedule is "fresh" (no slate known).
 *
 *   node scripts/nba/roster-recapture-due.mjs --now 2026-11-11T22:17:00Z
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rosterRecaptureDecision } from "../../src/lib/sports/nba/roster-recapture.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i === -1 ? null : argv[i + 1] ?? null; };
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const roster = read(path.resolve(opt("--roster") ?? path.join(APP, "..", "data", "internal", "research", "nba", "rosters", "latest.json")));
const schedule = read(path.resolve(opt("--schedule") ?? path.join(APP, "public", "data", "nba", "schedule", "latest.json")));
const d = rosterRecaptureDecision({ roster, now: opt("--now"), scheduleRows: schedule?.rows ?? [] });
console.log(`${d.due ? "due" : "fresh"} ${d.ageHours == null ? "none" : d.ageHours.toFixed(1)}h ${d.reason}${d.slate ? ` slate ${d.slate.date} last tip ${d.slate.lastTipUtc}` : ""} (eligibility@1 window ${d.maxAgeHours} h)`);
