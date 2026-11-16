/**
 * The game page's read of the NFL player-evidence file (data/internal/research/nfl/player-evidence/latest.json, built by
 * scripts/nfl/build-nfl-player-evidence.mjs in the event-window job). Server-only (node:fs).
 *
 * An event the file does not cover ⇒ {} quietly: that is the honest state for a game outside the window. A MISSING,
 * UNREADABLE or UNPARSEABLE file, or a schema mismatch, still renders nothing (never a fabricated history) but is
 * LOUD: one build warning naming the file and the reason, so a broken input cannot hide every panel in silence.
 */
import fs from "node:fs";
import path from "node:path";
import { EVIDENCE_SCHEMA } from "./player-evidence.mjs";

/** Repo-relative path of the evidence file. Server-only: kept out of player-evidence.mjs, which client code reaches. */
export const EVIDENCE_REL = "data/internal/research/nfl/player-evidence/latest.json";

let cache = null;

/** { doc, problem }: doc is the parsed file when usable, otherwise null with the reason. Exported for tests. */
export function loadEvidenceFile(root) {
  const file = path.join(root, EVIDENCE_REL);
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { return { doc: null, problem: `${e?.code === "ENOENT" ? "missing" : "unreadable"} (${e?.code ?? e?.message ?? e})`, file }; }
  let doc;
  try { doc = JSON.parse(text); } catch (e) { return { doc: null, problem: `unparseable JSON (${e?.message ?? e})`, file }; }
  if (doc?.schema !== EVIDENCE_SCHEMA) return { doc: null, problem: `schema mismatch (got ${JSON.stringify(doc?.schema ?? null)}, expected ${EVIDENCE_SCHEMA})`, file };
  return { doc, problem: null, file };
}

export function readEvidenceFor(root, eventId) {
  if (!cache || cache.root !== root) {
    const r = loadEvidenceFile(root);
    cache = { root, doc: r.doc };
    if (r.problem) console.warn(`[nfl player-evidence] WARNING: ${r.file} is ${r.problem}; every Recent form panel is withheld.`);
  }
  return cache.doc?.events?.[String(eventId)]?.players ?? {};
}
