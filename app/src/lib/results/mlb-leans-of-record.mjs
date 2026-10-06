/**
 * Stage 3B — the MLB player-prop lean adapter onto the forecast-of-record contract (forecast-of-record.mjs).
 *
 * WHY. The settled-leans ledger (pipeline/validation/mlb_settled_leans.jsonl, mirrored to
 * public/data/mlb/results/settled_leans.jsonl) holds one row per lean per BOARD DATE. When a game is postponed, the
 * next board re-issues its leans under the same gamePk and both copies are graded against the one make-up game.
 * Readers that count rows counted those leans twice: gamePk 824785 (TOR @ BAL, postponed 2026-09-22, played
 * 2026-09-23) has 16 same-line leans on both dates, all W/L. The raw rows stay as they are; this adapter tells
 * every MLB reader which rows are the forecast of record so only those enter a W–L.
 *
 * MAPPING (owner row → CanonicalForecast). Founder decisions 2026-10-06 22:22Z:
 *   - Question (Q1): MLB | gamePk | PLAYER | playerId | marketKey. The board date, the providerEventId and the row id
 *     are NOT identity (all three change when a postponed game is re-issued).
 *   - Claim (Q2): the line. Distinct lines on the same board are two claims. A later board's lean replaces the earlier
 *     board's lean for the same question (including a changed line or side). No claimId: the ledger carries no
 *     lineage id that survives a re-issue.
 *   - publishedAt: the board date at day precision (`<date>T00:00:00Z`). The ledger records no publication instant,
 *     so copies on one board are simultaneous and copies on different boards are ordered by date.
 *   - Canonical start (Q1, 3A review point a): supplied for every game, never the original start of a postponed game:
 *       1. the MLB game grader's StatsAPI first pitch (`firstPitchUtc`, public/data/mlb/results/
 *          game-predictions-graded.jsonl) when it graded that gamePk;
 *       2. else the `eventStartTime` on the LATEST board that carries the game (the re-issued board states the
 *          rescheduled start), only when that board states one and its copies agree;
 *       3. else none: no cut-off, the latest board's copy is of record and the count is disclosed as
          timingUnverified. A copy's own board start is never passed as a fallback (it may be the original start).
 *   - Side (Q3): the frozen lean (OVER / UNDER). Never derived from probabilities.
 *   - Outcome: the owner's settlement word only. Win / Loss / Push are SETTLED with ownerResult; Void is VOID; anything
 *     else is UNKNOWN. Nothing is re-graded here.
 *   - Q5: a row without gamePk, playerId or marketKey is unkeyed: excluded and counted, never given an identity.
 *
 * Pure: no fs, no clock. Readers do the IO and pass rows in. This is the ONE MLB lean adapter; every MLB reader that
 * counts leans (graded-pick owners → graded-picks.json and the Results V2 overview, the Results V2 day view, the model
 * results index) asks it, so they cannot disagree.
 */
import { selectForecastOfRecord, tally } from "./forecast-of-record.mjs";

export const MLB_SPORT = "MLB";
export const MLB_LEAN_SUBJECT = "PLAYER";

/** Where a game's canonical start came from. */
export const START_SOURCE = Object.freeze({
  STATSAPI_FIRST_PITCH: "STATSAPI_FIRST_PITCH",
  LATEST_BOARD: "LATEST_BOARD",
  NONE: "NONE",
});

const isIso = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const idStr = (v) => (v == null || v === "" ? null : String(v));
const eventKey = (gamePk) => `${MLB_SPORT}|${gamePk}`;

/** One settled-lean row → CanonicalForecast. `raw` keeps the owner row by reference (provenance, never identity). */
export function mlbLeanToCanonical(r) {
  const word = String(r?.outcome ?? "").toLowerCase();
  const settled = word === "win" || word === "loss" || word === "push";
  const lean = String(r?.lean ?? "").toUpperCase();
  const line = typeof r?.line === "number" ? r.line : (r?.line != null && r.line !== "" && Number.isFinite(Number(r.line)) ? Number(r.line) : null);
  return {
    sport: MLB_SPORT,
    eventId: idStr(r?.gamePk),
    subjectType: MLB_LEAN_SUBJECT,
    subjectId: idStr(r?.playerId),
    family: idStr(r?.marketKey),
    line,
    publishedAt: isDay(r?.date) ? `${r.date}T00:00:00Z` : null,
    // Never the copy's own board start: an earlier board's start is the ORIGINAL start of a postponed game. The one
    // cut-off is resolved per game by mlbCanonicalStarts(); with none, the contract has no cut-off (disclosed).
    eventStart: null,
    receiptId: idStr(r?.id),
    frozenSide: lean === "OVER" || lean === "UNDER" ? lean : null,
    state: settled ? "SETTLED" : word === "void" ? "VOID" : null,
    finalSide: null,
    ownerResult: settled ? word.toUpperCase() : null,
    raw: r,
  };
}

/**
 * gamePk → { at, source } for every game in `leans`. `firstPitches` maps gamePk (string or number) → ISO first pitch
 * from the game grader (StatsAPI); it wins when present.
 */
export function mlbCanonicalStarts(leans, { firstPitches } = {}) {
  const latest = new Map(); // gamePk → { date, starts:Set }
  for (const r of leans ?? []) {
    const pk = idStr(r?.gamePk);
    if (pk == null || !isDay(r?.date)) continue;
    const cur = latest.get(pk);
    if (!cur || r.date > cur.date) latest.set(pk, { date: r.date, starts: new Set() });
    const now = latest.get(pk);
    if (now.date === r.date && isIso(r.eventStartTime)) now.starts.add(Date.parse(r.eventStartTime));
  }
  const fp = firstPitches instanceof Map ? firstPitches : new Map(Object.entries(firstPitches ?? {}));
  const out = new Map();
  for (const [pk, l] of latest) {
    const pitched = fp.get(pk) ?? fp.get(Number(pk));
    if (isIso(pitched)) { out.set(pk, { at: new Date(Date.parse(pitched)).toISOString(), source: START_SOURCE.STATSAPI_FIRST_PITCH }); continue; }
    if (l.starts.size === 1) { out.set(pk, { at: new Date([...l.starts][0]).toISOString(), source: START_SOURCE.LATEST_BOARD }); continue; }
    out.set(pk, { at: null, source: START_SOURCE.NONE });
  }
  return out;
}

/** The game grader's rows → gamePk → firstPitchUtc (the first one seen per game; a game has one first pitch). */
export function mlbFirstPitches(gameRows) {
  const out = new Map();
  for (const g of gameRows ?? []) {
    const pk = idStr(g?.gamePk);
    if (pk != null && isIso(g?.firstPitchUtc) && !out.has(pk)) out.set(pk, g.firstPitchUtc);
  }
  return out;
}

/**
 * The MLB lean forecast of record.
 * @param {object[]} leans  settled-lean owner rows, any order, every board date
 * @param {{ firstPitches?: Map<string,string> | Record<string,string> }} [opts]
 * @returns {{
 *   record: object[],            owner rows of record, in input order (the only rows a W–L may count)
 *   isOfRecord: (row: object) => boolean,
 *   recordIds: Set<string>,      owner `id`s of the rows of record
 *   notOfRecordIds: Set<string>, owner `id`s of every other row (superseded, late, conflict, unkeyed)
 *   excluded: { superseded: number, late: number, conflicts: number, conflictRows: number, unkeyed: number },
 *   tally: ReturnType<typeof tally>,
 *   timingUnverified: number, cutoffFromEventStart: number,
 *   startSources: Record<string, number>   games by canonical-start source
 * }}
 */
export function mlbLeansOfRecord(leans, { firstPitches } = {}) {
  const rows = leans ?? [];
  const starts = mlbCanonicalStarts(rows, { firstPitches });
  const canonicalStarts = new Map();
  const startSources = { [START_SOURCE.STATSAPI_FIRST_PITCH]: 0, [START_SOURCE.LATEST_BOARD]: 0, [START_SOURCE.NONE]: 0 };
  for (const [pk, s] of starts) {
    startSources[s.source] += 1;
    if (s.at != null) canonicalStarts.set(eventKey(pk), s.at);
  }
  const forecasts = rows.map(mlbLeanToCanonical);
  const sel = selectForecastOfRecord(forecasts, { canonicalStarts });
  const kept = new Set(sel.record.map((f) => f.raw));
  const recordIds = new Set();
  const notOfRecordIds = new Set();
  for (const f of forecasts) if (f.receiptId != null) (kept.has(f.raw) ? recordIds : notOfRecordIds).add(f.receiptId);
  return {
    record: rows.filter((r) => kept.has(r)),
    isOfRecord: (r) => kept.has(r),
    recordIds,
    notOfRecordIds,
    excluded: {
      superseded: sel.superseded.length,
      late: sel.late.length,
      conflicts: sel.conflicts.length,
      conflictRows: sel.conflicts.reduce((n, c) => n + c.rows.length, 0),
      unkeyed: sel.unkeyed.length,
    },
    tally: tally(sel.record),
    timingUnverified: sel.timingUnverified,
    cutoffFromEventStart: sel.cutoffFromEventStart,
    startSources,
  };
}

/** The disclosure a published MLB lean record carries: what was left out of the W–L and why (never a loss, never 0). */
export function mlbOfRecordDisclosure(sel) {
  return {
    rule: "forecast-of-record: one lean per game · player · market (the last board before the game's canonical start); earlier-board copies of a re-issued lean stay in the raw ledger and are not counted",
    superseded: sel.excluded.superseded,
    late: sel.excluded.late,
    conflictRows: sel.excluded.conflictRows,
    unkeyed: sel.excluded.unkeyed,
  };
}
