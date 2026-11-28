/**
 * NFL GRADE RULE · files (served-grade.mjs is the pure rule). Internal records, NOT build inputs:
 *   data/internal/nfl/grade-freeze/<YYYY-MM-DD>/<eventId>.json   freeze record (write-once)
 *   data/internal/nfl/served-grade/<eventId>.json                 served-revision decision (write-once)
 * A page that renders gradedAgainstFor() must add these to the Vercel BUILD_INPUTS first (product B's change).
 */
import fs from "node:fs";
import path from "node:path";
import { gradedAgainstRecord } from "./served-grade.mjs";

export const FREEZE_DIR = "data/internal/nfl/grade-freeze";
export const DECISION_DIR = "data/internal/nfl/served-grade";
export const RECONCILIATION_DIR = "app/public/data/nfl/reconciliation";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
export const stableJson = (o) => `${JSON.stringify(o, null, 1)}\n`;

/**
 * WRITE-ONCE: a new file is created; an existing one is never rewritten. Identical bytes ⇒ UNCHANGED; different bytes ⇒
 * CONFLICT (the existing record stands and the caller reports it).
 * @returns {"WROTE"|"UNCHANGED"|"CONFLICT"}
 */
export function writeOnce(abs, obj) {
  const text = stableJson(obj);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  try {
    fs.writeFileSync(abs, text, { flag: "wx" });
    return "WROTE";
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    return fs.readFileSync(abs, "utf8") === text ? "UNCHANGED" : "CONFLICT";
  }
}

export const freezePath = (root, day, eventId) => path.join(root, FREEZE_DIR, day, `${eventId}.json`);
export const decisionPath = (root, eventId) => path.join(root, DECISION_DIR, `${eventId}.json`);

/** The game's freeze record: the EARLIEST day's (a game is frozen once; a later day never replaces it). */
export function readFreezeRecord(root, eventId) {
  const dir = path.join(root, FREEZE_DIR);
  if (!fs.existsSync(dir)) return null;
  for (const day of fs.readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()) {
    const r = readJson(path.join(dir, day, `${eventId}.json`));
    if (r) return r;
  }
  return null;
}
export const readDecision = (root, eventId) => readJson(decisionPath(root, eventId));

/** The game's week-reconciliation row (public), or null. */
export function readReconciliationGame(root, eventId) {
  const dir = path.join(root, RECONCILIATION_DIR);
  if (!fs.existsSync(dir)) return null;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d-\d{2}\.json$/.test(x)).sort()) {
    const g = (readJson(path.join(dir, f))?.games ?? []).find((x) => String(x.providerEventId) === String(eventId));
    if (g) return g;
  }
  return null;
}

/** RESULTS SURFACE HOOK: one game's "graded against" record (revision, served proof, outcome). */
export const gradedAgainstFor = (root, eventId) => gradedAgainstRecord({ eventId, decision: readDecision(root, eventId), reconciliationGame: readReconciliationGame(root, eventId) });
