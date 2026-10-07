#!/usr/bin/env node
/**
 * Freeze the NBA daily SHADOW Top Boards (Stage 12-S2) — PRIVATE, write-once, before the day's first tip.
 *
 * For each ET day in the schedule capture whose first non-overnight tip is still ahead, decide
 * (top-boards.mjs `boardFreezeDecision`) and, when due, write
 *   data/internal/research/nba/top-board-receipts/<ET day>.json
 * holding one `top-board-receipt@0` per family and board size, built only from the champion's (v0.1) frozen
 * pregame receipts. The file is written with `wx`: it fails rather than overwrite, so a day is frozen once.
 * Nothing public reads it (app/src/app/** never imports data/internal/**). No network, no dependencies.
 *
 *   node scripts/nba/freeze-nba-top-boards.mjs --now <ISO> [--date YYYY-MM-DD] [--write] [--out-dir <dir>]
 *
 * Exit 0 on any decision (WAIT / MISSED / FROZEN are results); 1 on bad usage or a refused board.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { etDateOf, familySpec } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { boardFreezeDecision, nbaDayBoards, NBA_BOARD_CHAMPION, NBA_BOARD_FILE_ARTIFACT, NBA_BOARD_POOL, NBA_BOARD_RANKING } from "../../src/lib/sports/nba/top-boards.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const SCHEDULE = path.join(APP, "public", "data", "nba", "schedule", "latest.json");

/** ET days (from the schedule) that a board could still be frozen for at `now`: today's and tomorrow's. Pure. */
export function candidateDays(rows, now) {
  const nowMs = Date.parse(now);
  return [...new Set((rows ?? []).filter((r) => Date.parse(r?.dateUtc ?? "") > nowMs).map((r) => etDateOf(r.dateUtc)))].sort().slice(0, 2);
}

function main() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
  const NOW = arg("--now");
  const ONLY = arg("--date");
  const WRITE = process.argv.includes("--write");
  const OUT_DIR = arg("--out-dir") ? path.resolve(arg("--out-dir")) : path.join(NBA, "top-board-receipts");
  if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
  if (ONLY && !/^\d{4}-\d{2}-\d{2}$/.test(ONLY)) { console.error("REFUSED: --date YYYY-MM-DD"); process.exit(1); }

  const schedule = JSON.parse(fs.readFileSync(SCHEDULE, "utf8"));
  const rows = schedule.rows ?? [];
  const championDir = path.join(NBA, familySpec(NBA_BOARD_CHAMPION).dir, "forecasts");
  const days = ONLY ? [ONLY] : candidateDays(rows, NOW);

  for (const day of days) {
    const file = path.join(OUT_DIR, `${day}.json`);
    let artifact = null;
    try { artifact = JSON.parse(fs.readFileSync(path.join(championDir, `${day}.json`), "utf8")); } catch { /* no champion file yet */ }
    // The day's games: the schedule capture's rows, plus any game the champion froze that the capture has since dropped.
    const dayRows = rows.filter((r) => r?.providerEventId && r?.dateUtc && etDateOf(r.dateUtc) === day);
    for (const g of artifact?.games ?? []) if (!dayRows.some((r) => String(r.providerEventId) === String(g.providerEventId))) dayRows.push({ providerEventId: String(g.providerEventId), dateUtc: g.dateUtc });
    const championIds = new Set((artifact?.games ?? []) // frozen AS OF --now (a replay never sees a later receipt)
      .filter((g) => g?.receipt?.payloadSha256 && Date.parse(g.receipt.generatedAt) <= Date.parse(NOW)).map((g) => String(g.providerEventId)));
    const decision = boardFreezeDecision({ rows: dayRows, championIds, now: NOW, hasBoard: fs.existsSync(file) });
    console.log(`${day}: ${decision.state} · ${decision.reason}`);
    if (decision.state !== "FREEZE") continue;

    let built;
    try { built = nbaDayBoards({ artifact, scheduleRows: dayRows, scopeDate: day, frozenAt: NOW }); }
    catch (e) { console.error(`REFUSED ${day}: ${e.message}`); process.exit(1); }
    const summary = built.receipts.filter((r) => r.boardType === "TOP_10").map((r) => `${r.family.replace("nba_player_", "")}=${r.rows.length}`).join(" ") || "no board";
    console.log(`  boards: ${summary} · not on board ${built.notOnBoard.length} · refused ${built.refused.map((r) => r.family).join(", ") || "none"}`);
    if (!built.receipts.length) { console.log("  nothing to freeze — no champion receipt before the freeze (the day stays unfrozen; it is never back-filled)"); continue; }
    const doc = {
      schemaVersion: 1, artifact: NBA_BOARD_FILE_ARTIFACT, dataClass: "PRIVATE_RESEARCH", productEligible: false,
      date: day, frozenAt: NOW, champion: NBA_BOARD_CHAMPION, decision,
      pool: NBA_BOARD_POOL, ranking: NBA_BOARD_RANKING,
      notOnBoard: built.notOnBoard, refused: built.refused, receipts: built.receipts,
    };
    if (!WRITE) { console.log("  dry run — pass --write to persist"); continue; }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(doc, null, 1) + "\n", { flag: "wx" }); // wx: fails rather than overwrite
    console.log(`  wrote ${path.relative(path.resolve(APP, ".."), file)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
