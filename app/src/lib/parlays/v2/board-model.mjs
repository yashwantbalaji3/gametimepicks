/**
 * PARLAY LAB V2 · THE /build RENDER MODEL (server-only: reads committed artifacts, writes nothing).
 *
 * Loads what the existing engine already published for the slate date, hands it to the pure adapter
 * (./recommend.mjs), and attaches each tier's history (./history.mjs). The result is plain JSON — the only thing
 * that crosses into the client components — and is scanned in tests for offshore sportsbook names.
 *
 * Sources (read-only):
 *   parlays/risk-ladder/<date>.json            MLB cards + per-tier skip reasons
 *   mlb/player-props/<date>.json               the board MLB legs are joined to for book + capture time
 *   parlays/risk-ladder-{epl,ufc,nfl}/latest.json   other lanes' cards, when dated on/after the slate date
 *   parlays/lab-ledger.json + lab-settled/*    the published-card record, by tier
 *   ../data/ask-projection/v1/coverage.json    demoted market families (repo root)
 */
import fs from "node:fs";
import path from "node:path";

import { loadCommittedCoverage } from "../card-leg-eligibility.mjs";
import { recommendTiers } from "./recommend.mjs";
import { candidatesFromMlbLadder, candidatesFromSportLadder, engineNotesFrom, pricedEventsAhead } from "./candidates.mjs";
import { tierHistory } from "./history.mjs";
import { BOOK_AVAILABILITY_NOTE, isVerifiedOperator as seamPredicate } from "./operators.mjs";
import { HANDOFF_NOT_AVAILABLE, HANDOFF_LABEL, HANDOFF_ROADMAP_NOTE } from "../../slip/smart-slip.mjs";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

function readSettled(dataRoot) {
  const dir = path.join(dataRoot, "parlays", "lab-settled");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch { return []; }
  return files.map((f) => readJson(path.join(dir, f))).filter(Boolean);
}

/**
 * @param {{ dataRoot: string, repoRoot: string, date: string, now: string, isVerifiedOperator?: (l: unknown) => boolean }} opts
 */
export function buildParlayLabV2Model({ dataRoot, repoRoot, date, now, isVerifiedOperator = seamPredicate }) {
  const nowMs = Date.parse(now);
  const ladder = readJson(path.join(dataRoot, "parlays", "risk-ladder", `${date}.json`));
  const mlbLadder = ladder?.date === date ? ladder : null;
  const board = readJson(path.join(dataRoot, "mlb", "player-props", `${date}.json`));

  const candidates = [...candidatesFromMlbLadder(mlbLadder, board)];
  const engineNotes = [...engineNotesFrom(mlbLadder, "mlb")];
  if (!mlbLadder) for (const tier of ["low", "medium", "high", "longshot"]) engineNotes.push({ tier, sport: "mlb", text: "no ladder was published for this date" });
  for (const sport of ["epl", "ufc", "nfl"]) {
    const doc = readJson(path.join(dataRoot, "parlays", `risk-ladder-${sport}`, "latest.json"));
    if (!doc || typeof doc.date !== "string" || doc.date < date) continue;
    candidates.push(...candidatesFromSportLadder(doc, sport));
    engineNotes.push(...engineNotesFrom(doc, sport));
  }

  const poolNotes = [];
  const ahead = pricedEventsAhead(board?.date === date ? board : null, nowMs);
  if (ahead < 2) poolNotes.push({ code: "TOO_FEW_EVENTS", detail: `MLB: ${ahead === 1 ? "1 game has" : `${ahead} games have`} prices more than 30 minutes before start; a card needs legs from at least 2 different games.` });

  const rec = recommendTiers({ candidates, now, coverage: loadCommittedCoverage(repoRoot), isVerifiedOperator, engineNotes, poolNotes });
  const ledger = readJson(path.join(dataRoot, "parlays", "lab-ledger.json"));
  const history = tierHistory(readSettled(dataRoot), ledger, { sport: "mlb" });

  return {
    version: rec.version,
    slateDate: date,
    evaluatedAt: rec.evaluatedAt,
    operatorSeam: rec.operatorSeam,
    availabilityNote: BOOK_AVAILABILITY_NOTE,
    handoff: { status: HANDOFF_NOT_AVAILABLE, label: HANDOFF_LABEL, roadmap: HANDOFF_ROADMAP_NOTE },
    tiers: rec.tiers.map((t) => ({ ...t, history: history[t.tier] ?? null })),
    rejectedCount: rec.rejected.length,
  };
}
