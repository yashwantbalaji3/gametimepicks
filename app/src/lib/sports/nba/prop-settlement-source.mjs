/**
 * NBA PLAYER-PROP RESULT ADAPTER — builds the input `gradeNbaPlayerProp` grades, from committed data only.
 * READ-ONLY and node-only: it reads files and never writes one, and it calls no network and no odds API.
 *
 * Where each half of a result comes from:
 *   - OFFICIAL STATUS + FINAL SCORE: the write-once finals record, `app/public/data/nba/results/finals-<season>.json`
 *     (`finals-record.mjs`). It holds only finals the current-results adapter accepted. An event it does not
 *     hold is PENDING, and an event with a recorded conflict is FINAL_UNDER_REVIEW. Neither is STATUS_FINAL,
 *     so the grader quarantines both.
 *   - THE PLAYER'S LINE: the stored ESPN box score (`boxscore-parse.mjs` shape), found in the same directories,
 *     in the same order, as Top Board grading (`scripts/nba/grade-nba-top-boards.mjs` boxscoreLocator): any
 *     extra dirs, then the canonical corpus `data/internal/research/nba/boxscores/`, then each experimental
 *     family's fetch cache `data/internal/research/nba/<family dir>/boxscores/`. The athlete row is picked
 *     with `boxscoreAthlete` (boxscore-line.mjs), the reader Top Board grading uses.
 *
 * A box score counts only if it is FINAL, holds player rows, and is for the same event. Otherwise
 * `boxscoreAvailable` is false and the grader returns VOID_PENDING_REVIEW, never NO_MEASUREMENT: a missing
 * feed is not a missing player.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FAMILIES } from "./experimental-forecast.mjs";
import { finalFor } from "./finals-record.mjs";
import { boxscoreAthlete, isFinalBoxscore } from "./boxscore-line.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Repository root: app/src/lib/sports/nba → five levels up. */
export const DEFAULT_REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..", "..");

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

/** Box-score directories in lookup order, labelled the way Top Board grading labels its sources. */
export function nbaBoxscoreDirs({ repoRoot = DEFAULT_REPO_ROOT, extraDirs = [] } = {}) {
  const nba = path.join(repoRoot, "data", "internal", "research", "nba");
  const seen = new Set();
  const dirs = [];
  const add = (dir, source) => { if (!seen.has(dir)) { seen.add(dir); dirs.push([dir, source]); } };
  for (const d of extraDirs) add(path.resolve(d), "extra");
  add(path.join(nba, "boxscores"), "corpus");
  for (const f of Object.values(FAMILIES)) add(path.join(nba, f.dir, "boxscores"), `${f.dir}-fetch`);
  return dirs;
}

/** `(eventId) => { doc, source, file } | null`. An unreadable file counts as absent. */
export function nbaBoxscoreLocator(opts = {}) {
  const repoRoot = opts.repoRoot ?? DEFAULT_REPO_ROOT;
  const dirs = nbaBoxscoreDirs({ ...opts, repoRoot });
  return (eventId) => {
    for (const [dir, source] of dirs) {
      const f = path.join(dir, `${eventId}.json`);
      if (fs.existsSync(f)) {
        try { return { doc: readJson(f), source, file: path.relative(repoRoot, f) }; } catch { /* unreadable → absent */ }
      }
    }
    return null;
  };
}

/**
 * Every committed season's finals record, merged into one record-shaped object for `finalFor`. An
 * unreadable season file contributes nothing, so its events read as PENDING, never as results.
 */
export function readNbaFinalsRecords({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const dir = path.join(repoRoot, "app", "public", "data", "nba", "results");
  const merged = { finals: [], conflicts: [], files: [] };
  if (!fs.existsSync(dir)) return merged;
  for (const f of fs.readdirSync(dir).filter((x) => /^finals-\d{4}-\d{2}\.json$/.test(x)).sort()) {
    try {
      const rec = readJson(path.join(dir, f));
      merged.finals.push(...(rec.finals ?? []));
      merged.conflicts.push(...(rec.conflicts ?? []));
      merged.files.push(path.relative(repoRoot, path.join(dir, f)));
    } catch { /* unreadable → its events stay pending */ }
  }
  return merged;
}

/**
 * PURE. Build the grader's result for one (event, athlete) from a finals record and a box-score document.
 * Neither input is modified. `player` is the athlete's own row object from the box score (read-only).
 */
export function nbaPropResult({ finalsRecord, boxscore = null, providerEventId, providerAthleteId, boxscoreSource = null }) {
  const eventId = String(providerEventId);
  const fin = finalFor(finalsRecord, eventId);
  const row = (finalsRecord?.finals ?? []).find((f) => f.providerEventId === eventId) ?? null;
  const status = fin.state === "FINAL" ? (row?.statusRaw ?? null) : fin.state;
  const boxscoreAvailable = isFinalBoxscore(boxscore) && String(boxscore.providerEventId) === eventId;
  return {
    providerEventId: eventId,
    status,
    homePointsFT: fin.state === "PENDING" ? null : fin.ftHome ?? null,
    awayPointsFT: fin.state === "PENDING" ? null : fin.ftAway ?? null,
    boxscoreAvailable,
    player: boxscoreAvailable ? boxscoreAthlete(boxscore, providerAthleteId) : null,
    provenance: {
      finals: fin.state === "PENDING" ? null : "finals-record",
      boxscore: boxscore ? boxscoreSource : null,
      boxscoreCapturedAt: boxscore?.capturedAt ?? null,
    },
  };
}

/**
 * Read-only convenience: a `(leg) => result` function over the committed finals record and box scores, for
 * `settleNbaPlayerProps`. Files are read once per call of this factory (box scores lazily, then cached).
 */
export function committedNbaPropResults(opts = {}) {
  const finalsRecord = readNbaFinalsRecords(opts);
  const find = nbaBoxscoreLocator(opts);
  const cache = new Map();
  return (leg) => {
    const eventId = String(leg?.eventId ?? "");
    if (!cache.has(eventId)) cache.set(eventId, eventId ? find(eventId) : null);
    const box = cache.get(eventId);
    return nbaPropResult({ finalsRecord, boxscore: box?.doc ?? null, boxscoreSource: box?.file ?? null, providerEventId: eventId, providerAthleteId: leg?.providerAthleteId });
  };
}
