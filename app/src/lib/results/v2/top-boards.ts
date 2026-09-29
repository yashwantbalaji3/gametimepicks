/**
 * RESULTS V2 · FROZEN DAILY TOP-5 BOARDS, READ SIDE (B-4b). Server/build time only.
 *
 * The boards are written once, before the day's first kickoff, by scripts/results/freeze-daily-top-boards.mjs
 * (app/public/data/results/top-boards/<day>.json). This module never re-ranks, never re-selects and never
 * grades. It overlays each frozen row with the canonical settlement owner's own word:
 *   public/data/nfl/reconciliation/<seasonType>-<week>.json
 *     yardage / receptions  HIT → inside the printed range · MISS → outside · VOID → did not play
 *     anytime touchdown     SCORED · DID_NOT_SCORE · VOID
 * A row whose game is not final is PENDING; a final game with no graded row for the player is NOT_GRADED —
 * neither is ever a loss.
 *
 * RECENT FORM is context, never a selection rule, and comes from the same owner: the player's earlier
 * regular-season games ON OUR BOARDS where he played (VOID rows excluded), newest first, at most three,
 * with the true denominator. It is the player's history, not GameTimePicks' record — the two are never mixed.
 */
import fs from "node:fs";
import path from "node:path";

import { validatedModeledMarkets } from "@/lib/mlb/calibration/eligibility-policy";

export type BoardResultState = "PENDING" | "INSIDE" | "OUTSIDE" | "SCORED" | "DID_NOT_SCORE" | "VOID" | "NOT_GRADED";
export interface BoardRowView {
  rank: number; forecastId: string; playerId: string; name: string; team: string; opponent: string | null;
  providerEventId: string; kickoffUtc: string; line: number | null; pricingState: string | null;
  projection: { median: number; p10: number | null; p90: number | null } | { probability: number };
  result: { state: BoardResultState; actual: number | null };
  form: { values: number[]; played: number; aboveLine: number | null } | { scored: number; played: number } | null;
}
export interface BoardView { sport: "nfl"; propFamily: string; label: string; metric: string; model: string | null; rows: BoardRowView[] }
export interface DayBoards {
  date: string; publishedAt: string; firstKickoffUtc: string;
  boards: BoardView[];
  ineligible: Array<{ propFamily: string; label?: string; state: string; reason: string | null }>;
}
export interface SportWithoutBoard { sport: string; label: string; reason: string }

const read = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const APP = () => process.cwd();
const BOARD_DIR = () => path.join(APP(), "public/data/results/top-boards");
const RECON_DIR = () => path.join(APP(), "public/data/nfl/reconciliation");

interface ReconRow { eventId: string; kickoffUtc: string; name: string; team: string; prop: string; outcome: string; actual: number | null }
let reconCache: { rows: ReconRow[]; finals: Set<string> } | null = null;
function recon() {
  if (reconCache) return reconCache;
  const rows: ReconRow[] = [];
  const finals = new Set<string>();
  let files: string[] = [];
  try { files = fs.readdirSync(RECON_DIR()).filter((f) => /^2-\d+\.json$/.test(f)); } catch { /* none */ } // regular season only
  for (const f of files) {
    for (const g of read(path.join(RECON_DIR(), f))?.games ?? []) {
      const eventId = String(g.providerEventId);
      if (g.state === "FINAL") finals.add(eventId);
      for (const p of g.players ?? []) {
        rows.push({ eventId, kickoffUtc: String(g.kickoffUtc ?? ""), name: String(p.name), team: String(p.team), prop: String(p.prop), outcome: String(p.outcome ?? ""), actual: typeof p.actual === "number" ? p.actual : null });
      }
      for (const t of g.touchdowns ?? []) {
        rows.push({ eventId, kickoffUtc: String(g.kickoffUtc ?? ""), name: String(t.name), team: String(t.team), prop: "anytime_td", outcome: String(t.outcome ?? ""), actual: null });
      }
    }
  }
  reconCache = { rows, finals };
  return reconCache;
}

const RESULT: Record<string, BoardResultState> = { HIT: "INSIDE", MISS: "OUTSIDE", VOID: "VOID", SCORED: "SCORED", DID_NOT_SCORE: "DID_NOT_SCORE" };

function overlay(row: any, family: string, firstKickoffUtc: string): Pick<BoardRowView, "result" | "form"> {
  const { rows, finals } = recon();
  const same = (r: ReconRow) => r.name === row.name && r.team === row.team && r.prop === family;
  const graded = rows.find((r) => r.eventId === String(row.providerEventId) && same(r));
  const result = graded && RESULT[graded.outcome]
    ? { state: RESULT[graded.outcome], actual: graded.actual }
    : { state: (finals.has(String(row.providerEventId)) ? "NOT_GRADED" : "PENDING") as BoardResultState, actual: null };
  const earlier = rows
    .filter((r) => same(r) && r.kickoffUtc < firstKickoffUtc && r.outcome !== "VOID" && r.outcome !== "")
    .sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc))
    .slice(0, 3);
  let form: BoardRowView["form"] = null;
  if (earlier.length) {
    if (family === "anytime_td") form = { scored: earlier.filter((r) => r.outcome === "SCORED").length, played: earlier.length };
    else {
      const values = earlier.map((r) => r.actual).filter((v): v is number => typeof v === "number");
      form = values.length ? { values, played: values.length, aboveLine: typeof row.line === "number" ? values.filter((v) => v > row.line).length : null } : null;
    }
  }
  return { result, form };
}

/** The frozen boards for `date` with the settlement overlay, or null when no board was frozen that day. */
export function topBoardsFor(date: string): DayBoards | null {
  const doc = read(path.join(BOARD_DIR(), `${date}.json`));
  if (!doc || doc.date !== date || !Array.isArray(doc.boards)) return null;
  return {
    date, publishedAt: String(doc.publishedAt), firstKickoffUtc: String(doc.firstKickoffUtc),
    boards: doc.boards.map((b: any) => ({
      sport: "nfl", propFamily: String(b.propFamily), label: String(b.label ?? b.propFamily), metric: String(b.metric), model: b.model ?? null,
      rows: (b.rows ?? []).map((r: any) => ({
        rank: r.rank, forecastId: r.forecastId, playerId: r.playerId, name: r.name, team: r.team, opponent: r.opponent ?? null,
        providerEventId: String(r.providerEventId), kickoffUtc: r.kickoffUtc, line: typeof r.line === "number" ? r.line : null,
        pricingState: r.pricingState ?? null, projection: r.projection,
        ...overlay(r, String(b.propFamily), String(doc.firstKickoffUtc)),
      })),
    })),
    ineligible: (doc.ineligible ?? []).map((x: any) => ({ propFamily: String(x.propFamily), label: x.label, state: String(x.state), reason: x.reason ?? null })),
  };
}

/** Every day with a frozen board, newest first. */
export function topBoardDates(): string[] {
  try { return fs.readdirSync(BOARD_DIR()).map((f) => f.match(/^(\d{4}-\d{2}-\d{2})\.json$/)?.[1]).filter((d): d is string => !!d).sort().reverse(); }
  catch { return []; }
}

/** Sports that cannot have a board, each with the owner's reason — stated, never shown as an empty 0-row board. */
export function sportsWithoutBoards(): SportWithoutBoard[] {
  const mlbModeled = validatedModeledMarkets();
  return [
    mlbModeled.length
      ? { sport: "mlb", label: "MLB", reason: "A validated MLB prop market exists, but daily MLB boards are not built yet." }
      : { sport: "mlb", label: "MLB", reason: "Player props are market context only — no MLB prop model has passed its bar, so none can make a board." },
    { sport: "epl", label: "Premier League", reason: "No player-prop model — Premier League forecasts are match results only." },
    { sport: "ufc", label: "UFC", reason: "No fight-prop model — UFC forecasts are fight winners only." },
  ];
}
