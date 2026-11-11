/**
 * NFL QB PROPS · THE HISTORY FILE the research section reads (founder decision 2026-11-10: "relevant historical stats").
 * data/internal/research/nfl/qb-props/history.json, written by scripts/nfl/build-qb-props-history.mjs in the per-slate
 * job: for every receipt of record, each projected QB's actual previous games (qbHistory) before that kickoff. The page
 * reads this compact file (a few KB) instead of parsing every season of player-events at build time. HISTORY only:
 * never an input to the simulated chances, never a forecast. It is a BUILD_INPUT (scripts/vercel-ignore-build.sh) and
 * is committed only together with new shadow receipts, so it adds no Production build of its own.
 */
import fs from "node:fs";
import path from "node:path";
import { receiptsOfRecord, projectedQbs } from "./qb-props-grade.mjs";
import { qbHistory } from "./qb-props-markets.mjs";

export const HISTORY_REL = "data/internal/research/nfl/qb-props/history.json";
export const HISTORY_SCHEMA = "gtp.nfl.qb-props-history@1";

/** PURE. eventId → playerId → previous games played before that event's kickoff (most recent first). */
export function buildQbHistoryFile(entries, games) {
  const { records } = receiptsOfRecord(entries);
  const events = {};
  for (const { receipt } of records) {
    const byQb = {};
    for (const qb of Object.values(projectedQbs(receipt))) {
      const pid = qb.playerId.startsWith("nfl-athlete-") ? qb.playerId : `nfl-athlete-${qb.playerId}`;
      byQb[pid] = qbHistory(games, pid, receipt.eventStart);
    }
    events[String(receipt.eventId)] = Object.fromEntries(Object.entries(byQb).sort(([a], [b]) => a.localeCompare(b)));
  }
  return { schema: HISTORY_SCHEMA, label: "HISTORY — actual results before each kickoff; not a forecast", events: Object.fromEntries(Object.entries(events).sort(([a], [b]) => a.localeCompare(b))) };
}

/** The page's read: one event's history, or {} (unreadable ⇒ no history shown). */
export function readQbHistoryFor(root, eventId) {
  try { return JSON.parse(fs.readFileSync(path.join(root, HISTORY_REL), "utf8")).events?.[String(eventId)] ?? {}; } catch { return {}; }
}
