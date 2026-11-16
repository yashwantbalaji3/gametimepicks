/**
 * The game page's read of the NFL player-evidence file (data/internal/research/nfl/player-evidence/latest.json, built by
 * scripts/nfl/build-nfl-player-evidence.mjs in the event-window job). Server-only (node:fs).
 *
 * An event the file does not cover ⇒ {} quietly: that is the honest state for a game outside the window. A MISSING,
 * UNREADABLE or UNPARSEABLE file, or a schema mismatch, still renders nothing (never a fabricated history) but is
 * LOUD: one build warning naming the file and the reason, so a broken input cannot hide every panel in silence.
 * A file built from an older box-score corpus than the one committed now (source.contentHash ≠ the corpus's
 * contentHash) is still served — every entry in it is a real game before its kickoff — but the build warns that
 * newer finals are missing from it.
 */
import fs from "node:fs";
import path from "node:path";
import { EVIDENCE_SCHEMA } from "./player-evidence.mjs";

/** Repo-relative path of the evidence file. Server-only: kept out of player-evidence.mjs, which client code reaches. */
export const EVIDENCE_REL = "data/internal/research/nfl/player-evidence/latest.json";
/** The box-score corpus the file is built from (build-nfl-player-evidence.mjs SEASON). */
export const CORPUS_REL = "data/internal/research/nfl/player-events-v1/2026.json";

let cache = null;

/** { doc, problem, stale, file }: doc is the parsed file when usable, otherwise null with the reason. Exported for tests. */
export function loadEvidenceFile(root) {
  const file = path.join(root, EVIDENCE_REL);
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { return { doc: null, problem: `${e?.code === "ENOENT" ? "missing" : "unreadable"} (${e?.code ?? e?.message ?? e})`, stale: null, file }; }
  let doc;
  try { doc = JSON.parse(text); } catch (e) { return { doc: null, problem: `unparseable JSON (${e?.message ?? e})`, stale: null, file }; }
  if (doc?.schema !== EVIDENCE_SCHEMA) return { doc: null, problem: `schema mismatch (got ${JSON.stringify(doc?.schema ?? null)}, expected ${EVIDENCE_SCHEMA})`, stale: null, file };
  return { doc, problem: null, stale: corpusDrift(root, doc), file };
}

/** null when the file matches the committed corpus; otherwise the reason (a mismatch, or an unreadable corpus). */
function corpusDrift(root, doc) {
  const built = doc?.source?.contentHash ?? null;
  let current = null;
  try { current = JSON.parse(fs.readFileSync(path.join(root, CORPUS_REL), "utf8"))?.contentHash ?? null; } catch (e) { return `the box-score corpus ${CORPUS_REL} is unreadable (${e?.code ?? e?.message ?? e})`; }
  if (!built || !current) return `no content hash to compare (file ${built ?? "none"}, corpus ${current ?? "none"})`;
  return built === current ? null : `built from corpus ${built}, but ${CORPUS_REL} is now ${current}: finals added since are not in it`;
}

export function readEvidenceFor(root, eventId) {
  if (!cache || cache.root !== root) {
    const r = loadEvidenceFile(root);
    cache = { root, doc: r.doc };
    if (r.problem) console.warn(`[nfl player-evidence] WARNING: ${r.file} is ${r.problem}; every Recent form panel is withheld.`);
    else if (r.stale) console.warn(`[nfl player-evidence] WARNING: ${r.file} is stale: ${r.stale}. Rebuild with scripts/nfl/build-nfl-player-evidence.mjs --write.`);
  }
  return cache.doc?.events?.[String(eventId)]?.players ?? {};
}
