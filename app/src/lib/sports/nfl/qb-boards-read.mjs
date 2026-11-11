/**
 * NFL QB BOARDS · build-time reader for the hub (qb-boards.mjs is the pure rule). Reads committed files only: the
 * sim-v2 shadow receipts (a BUILD_INPUT), the official forecast of record (nflOfficialOfRecord, CANON-01) for R5, and
 * each game's official player board for the QB's eligibility@1 record. `eventIds` = the hub's pregame scope.
 */
import fs from "node:fs";
import path from "node:path";
import { readShadowReceipts } from "./sim-v2/public-receipt.mjs";
import { receiptsOfRecord } from "./qb-props-grade.mjs";
import { nflOfficialOfRecord } from "./official-of-record.mjs";
import { buildQbBoards } from "./qb-boards.mjs";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

export function readQbBoards(repoRoot, eventIds) {
  const want = new Set((eventIds ?? []).map(String));
  const publicDir = path.join(repoRoot, "app", "public");
  const { records } = receiptsOfRecord(readShadowReceipts(repoRoot));
  const boards = new Map();
  const boardOf = (id) => { if (!boards.has(id)) boards.set(id, readJson(path.join(publicDir, "data/nfl/player-board", `${id}.json`))); return boards.get(id); };
  return buildQbBoards({
    records: records.filter((r) => want.has(String(r.receipt.eventId))),
    teamInputsFor: (id) => nflOfficialOfRecord(publicDir, id)?.forecast?.teamInputs ?? null,
    eligibilityFor: (id, pid) => (boardOf(id)?.players ?? []).find((p) => p.playerId === pid)?.eligibility ?? null,
  });
}
