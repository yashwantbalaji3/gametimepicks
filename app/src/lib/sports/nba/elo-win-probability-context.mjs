/**
 * NBA · Elo game-winner probability — the BUILD-TIME context every surface shares (node-only, read-only).
 *
 * The graded count in the accuracy disclosure is derived from public, committed files only (both are build inputs):
 * every dated lane snapshot (app/public/data/nba/experimental-public/<date>.json) and the write-once finals record
 * (app/public/data/nba/results/finals-2026-27.json). A game counts once: a REGULAR-season game the lane published with an
 * Elo favoured side and the record holds an official final for. The minimum is the preregistered winner minimum
 * (grader-metrics PREREG.winner.minN, §6) — not a constant of this display. Missing files → 0 graded, never a guess.
 */
import fs from "node:fs";
import path from "node:path";
import { ELO_WIN_PROBABILITY, eloAccuracyDisclosure } from "./elo-win-probability.mjs";
import { PREREG } from "./grader-metrics.mjs";

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const DATED = /^\d{4}-\d{2}-\d{2}\.json$/;

/** Pure: the graded count from parsed lane snapshots and the parsed finals record. */
export function eloGradedCount(laneDocs, finalsDoc) {
  const finals = new Map((finalsDoc?.finals ?? []).filter((f) => f?.phase === "REGULAR" && (f.winnerSide === "home" || f.winnerSide === "away")).map((f) => [String(f.providerEventId), f]));
  const ids = new Set();
  for (const d of laneDocs ?? []) for (const g of d?.games ?? []) if (g?.elo?.state === "FAVOURED" && finals.has(String(g.providerEventId))) ids.add(String(g.providerEventId));
  return ids.size;
}

/**
 * @param {{ appDir?: string, enabled?: boolean }} opts  appDir = the Next app directory (process.cwd() at build)
 * @returns {{ enabled: boolean, graded: number, minN: number, disclosure: string }}
 */
export function loadEloWinProbabilityContext({ appDir = process.cwd(), enabled = ELO_WIN_PROBABILITY.enabled } = {}) {
  const minN = PREREG.winner.minN;
  if (!enabled) return { enabled: false, graded: 0, minN, disclosure: eloAccuracyDisclosure({ graded: 0, minN }) };
  const dir = path.join(appDir, "public", "data", "nba", "experimental-public");
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => DATED.test(n)).sort(); } catch { names = []; }
  // a dated file counts only when it names its own date (the lane's own rule, components/nba/experimental-lane.tsx)
  const lanes = names.map((n) => [n, readJson(path.join(dir, n))]).filter(([n, d]) => d && `${d.date}.json` === n).map(([, d]) => d);
  const graded = eloGradedCount(lanes, readJson(path.join(appDir, "public", "data", "nba", "results", "finals-2026-27.json")));
  return { enabled: true, graded, minN, disclosure: eloAccuracyDisclosure({ graded, minN }) };
}
