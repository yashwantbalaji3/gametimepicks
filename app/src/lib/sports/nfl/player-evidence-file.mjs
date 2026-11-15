/**
 * The game page's read of the NFL player-evidence file (data/internal/research/nfl/player-evidence/latest.json, built by
 * scripts/nfl/build-nfl-player-evidence.mjs in the event-window job). Server-only (node:fs). Unreadable or missing ⇒ {}
 * and the panel renders nothing — never an error, never a fabricated history.
 */
import fs from "node:fs";
import path from "node:path";
import { EVIDENCE_REL, EVIDENCE_SCHEMA } from "./player-evidence.mjs";

let cache = null;
export function readEvidenceFor(root, eventId) {
  try {
    if (!cache || cache.root !== root) {
      const doc = JSON.parse(fs.readFileSync(path.join(root, EVIDENCE_REL), "utf8"));
      cache = { root, doc: doc.schema === EVIDENCE_SCHEMA ? doc : null };
    }
    return cache.doc?.events?.[String(eventId)]?.players ?? {};
  } catch { return {}; }
}
