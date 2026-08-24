#!/usr/bin/env node
/**
 * TRACK UFC CARD LINEAGE — run the committed classifier on consecutive captures, on a schedule
 * (Program 199 · Release A1).
 *
 *   npx tsx scripts/ufc/track-ufc-card-lineage.mjs --now <ISO> [--write]
 *
 * classifyUfcLineage has existed since the Aug-12 exercise (66 window-slides + 17 UNCHANGED, zero
 * replacements — a valid no-change receipt) but nothing RAN it on a cadence, so a fight-week
 * replacement would have been an unrecorded diff between two files nobody compared. This runner
 * diffs the two newest dated schedule captures and persists the receipt. ADDED / REMOVED /
 * REPLACED / MOVED / UNCHANGED come only from evidence; the classifier's own rule stands —
 * removal is the observation, cancellation is never inferred from absence.
 *
 * A quiet week writes a NO_CHANGE receipt: fight week is exactly when "nothing changed" must be
 * a recorded fact rather than an assumption.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyUfcLineage } from "../../src/lib/sports/ufc/lineage.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const SCHED = path.join(APP, "public/data/ufc/schedule");
const OUT_DIR = path.join(ROOT, "data/internal/research/ufc/lineage");

const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null; };
const NOW = arg("--now");
const WRITE = process.argv.includes("--write");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const captures = fs.readdirSync(SCHED).filter((f) => /^capture-.*\.json$/.test(f)).sort();
if (captures.length < 2) { console.log("NOT_YET_OBSERVABLE: fewer than two dated captures — nothing to diff"); process.exit(0); }
const [prevFile, nextFile] = captures.slice(-2);
const prev = readJson(path.join(SCHED, prevFile));
const next = readJson(path.join(SCHED, nextFile));
if (!prev || !next) { console.error("REFUSED: a capture is unreadable — refusing to classify against half the evidence"); process.exit(2); }

const out = classifyUfcLineage(prev, next);
const changes = out.changes ?? [];
const byClass = {};
for (const c of changes) byClass[c.class] = (byClass[c.class] ?? 0) + 1;
/* UNCHANGED rows are the healthy ledger, not events — the substantive set is everything else. */
const substantive = changes.filter((c) => c.class !== "UNCHANGED");

console.log(`ufc lineage: ${prevFile} → ${nextFile}`);
console.log(`  ${substantive.length} substantive change(s) over ${changes.length} classified bout/event row(s) · ${JSON.stringify(byClass)} · refusals ${out.refusals?.length ?? 0}`);
for (const c of substantive.slice(0, 12)) {
  console.log(`  ${c.class.padEnd(18)} ${c.before ?? ""}${c.before && c.after ? " → " : ""}${c.after ?? ""}`);
}

/*
 * REPLACED on the NEXT card (the one the ladder and snapshot describe) is the fight-week signal:
 * a frozen forecast for a bout whose participant changed must never inherit the predecessor's
 * read. Surface it loudly; the snapshot immutability plus date-qualified boutIds already prevent
 * inheritance mechanically — this receipt makes the change VISIBLE the same day.
 */
const replacements = substantive.filter((c) => c.class === "REPLACED" || c.class === "REMOVED");
if (replacements.length > 0) {
  console.log(`  ⚠ ${replacements.length} removal/replacement(s) — verify the pre-fight snapshot and ladder describe the CURRENT pairings`);
}

if (WRITE) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const receipt = {
    schemaVersion: 1, artifact: "ufc-card-lineage-receipt", dataClass: "INTERNAL_RESEARCH", public: false,
    generatedAt: NOW, prevCapture: prevFile, nextCapture: nextFile,
    state: substantive.length === 0 ? "NO_CHANGE" : "CHANGES",
    counts: byClass, changes, refusals: out.refusals ?? [],
  };
  fs.writeFileSync(path.join(OUT_DIR, `${NOW.slice(0, 10)}.json`), JSON.stringify(receipt, null, 1) + "\n");
  console.log(`  → wrote data/internal/research/ufc/lineage/${NOW.slice(0, 10)}.json (${receipt.state})`);
}
