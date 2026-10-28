/**
 * NFL RECAP CANDIDATES — read the Universal Forecast Ledger, never a web page.
 *
 * Source: data/internal/forecast-ledger/v1/nfl.jsonl (forecast-ledger@1, append-only, built by nightly-settle).
 * A ledger row already IS the forecast of record (app/src/lib/results/forecast-of-record.mjs selected it), so this
 * module only groups the game-level rows of one event into a candidate and attaches the receipt the row names.
 * It does not judge eligibility — integrity-gate.mjs does, and refuses loudly.
 *
 * "Last night" is the most recent US/Eastern calendar date with at least one settled game, because NFL slates are
 * scheduled in Eastern time (a Sunday-night kickoff is Monday in UTC).
 */
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, sha256 } from "../lib/util.mjs";

export const LEDGER_PATH = "data/internal/forecast-ledger/v1/nfl.jsonl";
export const GAME_FAMILIES = Object.freeze(["nfl_game_winner", "nfl_game_total", "nfl_game_margin", "nfl_team_score"]);

const ET_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
export const etDate = (iso) => ET_DATE.format(new Date(iso));

/** Read the ledger from this checkout, or from a pinned data source (recap/multisport-facts.mjs gitDataSource). */
export function loadNflLedger(repoRoot = REPO_ROOT, src = null) {
  const raw = src ? src.read(LEDGER_PATH) : fs.readFileSync(path.join(repoRoot, LEDGER_PATH));
  if (raw == null) throw new Error(`${LEDGER_PATH} is missing at ${src?.label ?? repoRoot}`);
  const rows = raw.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { path: LEDGER_PATH, sha256: sha256(raw), rows, commit: src?.commit ?? null };
}

/** eventId → candidate { eventId, eventStart, matchup, winner, total, margin, teamScores[], receiptPath } */
export function groupGames(rows) {
  const games = new Map();
  for (const r of rows) {
    if (r.subjectType === "PLAYER" || !GAME_FAMILIES.includes(r.family)) continue;
    const g = games.get(r.eventId) ?? { eventId: r.eventId, eventStart: r.eventStart, matchup: r.matchup, teamScores: [] };
    if (r.family === "nfl_game_winner") g.winner = r;
    else if (r.family === "nfl_game_total") g.total = r;
    else if (r.family === "nfl_game_margin") g.margin = r;
    else if (r.family === "nfl_team_score") g.teamScores.push(r);
    games.set(r.eventId, g);
  }
  return [...games.values()].filter((g) => g.winner);
}

export function readReceipt(receiptPath, repoRoot = REPO_ROOT, src = null) {
  if (!receiptPath) return { receipt: null, sha256: null };
  let raw;
  if (src) raw = src.read(receiptPath);
  else {
    const abs = path.join(repoRoot, receiptPath);
    raw = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
  }
  if (raw == null) return { receipt: null, sha256: null };
  return { receipt: JSON.parse(raw.toString("utf8")), sha256: sha256(raw) };
}

/** Attach the receipt (and the ledger file identity) to a grouped game: the ENRICHED candidate. */
export function enrichCandidate(game, ledger, repoRoot = REPO_ROOT, src = null) {
  const receiptPath = game.winner?.receiptId ?? null;
  const { receipt, sha256: receiptSha } = readReceipt(receiptPath, repoRoot, src);
  return {
    ...game,
    receipt,
    receiptPath,
    receiptSha,
    ledgerPath: ledger.path,
    ledgerSha: ledger.sha256,
    extraClaims: [],
  };
}

/** The most recent Eastern date on which at least one game's winner row is settled. */
export function latestSettledSlate(games) {
  const dates = games.filter((g) => g.winner?.settlement?.state === "SETTLED").map((g) => etDate(g.eventStart)).sort();
  return dates.at(-1) ?? null;
}

/** Every game on one Eastern date, earliest kickoff first, eventId as the tie-break (deterministic). */
export function slateGames(games, date) {
  return games
    .filter((g) => etDate(g.eventStart) === date)
    .sort((a, b) => a.eventStart.localeCompare(b.eventStart) || a.eventId.localeCompare(b.eventId));
}
