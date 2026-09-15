/**
 * SAVED FORECASTS — the settlement join (P310). Pure and fail-closed.
 *
 * A saved forecast learns what happened ONLY from the canonical graded ledgers the site already publishes:
 *   mlb   public/data/mlb/results/game-predictions-graded.jsonl   (gamePk + market rows: WIN / LOSS / PUSH)
 *   nfl   public/data/nfl/graded-picks.json                        (eventId "nfl-<providerEventId>", market "Winner")
 *   epl   public/data/epl/graded-picks.json                        (the fixture's own eventId, market "Match result")
 *   ufc   public/data/ufc/graded-picks.json                        (eventId "<date>:<red>|<blue>", market "Fight winner")
 * No row ⇒ UPCOMING before the start, PENDING after it — never a loss, never a guess. A voided or pushed row is VOID.
 */

const norm = (s) => String(s ?? "").toLowerCase().trim();

/**
 * @param {object} saved   a saved forecast (saved-schema.mjs)
 * @param {{ mlbGames?: Array<object>, nfl?: Array<object>, epl?: Array<object>, ufc?: Array<object> }} ledgers
 * @param {string} nowIso
 * @returns {{ state: "UPCOMING"|"PENDING"|"FINAL", outcome: "HIT"|"MISS"|"VOID"|null, actual: string|null, gradedAt: string|null }}
 */
export function resolveResult(saved, ledgers, nowIso) {
  const started = saved.startUtc ? Date.parse(saved.startUtc) <= Date.parse(nowIso) : false;
  const none = { state: started ? "PENDING" : "UPCOMING", outcome: null, actual: null, gradedAt: null };
  const k = saved.settlement;
  if (!k) return none;
  const final = (outcome, actual, gradedAt) => ({ state: "FINAL", outcome, actual, gradedAt: gradedAt ?? null });
  const fromHit = (hit, actual, gradedAt) => final(hit === true ? "HIT" : hit === false ? "MISS" : "VOID", actual, gradedAt);

  if (k.kind === "mlb-game") {
    /* Only an ACTIVE call has a market to settle. "Winner call paused" / "No winner call" carried a projected score,
       not a pick, so they join nothing (P319) — before this they matched the first row of any market for the game. */
    const market = k.family === "Winner" ? "moneyline" : k.family === "Total" ? "total" : k.family === "Run line" ? "run_line" : null;
    if (!market) return none;
    const row = (ledgers.mlbGames ?? []).find((r) => r.gamePk === k.gamePk && r.market === market);
    if (!row) return none;
    const actual = row.actual ? `${row.actual.awayRuns}–${row.actual.homeRuns}` : null;
    if (row.outcome === "WIN") return final("HIT", actual, row.gradedAt);
    if (row.outcome === "LOSS") return final("MISS", actual, row.gradedAt);
    return final("VOID", actual, row.gradedAt);
  }
  if (k.kind === "nfl-event") {
    const row = (ledgers.nfl ?? []).find((r) => r.eventId === `nfl-${k.providerEventId}` && norm(r.market) === "winner");
    return row ? fromHit(row.hit, row.actual ?? null, row.when ?? null) : none;
  }
  if (k.kind === "epl-event") {
    const row = (ledgers.epl ?? []).find((r) => r.eventId === k.eventId && norm(r.market) === "match result");
    return row ? fromHit(row.hit, row.actual ?? null, row.when ?? null) : none;
  }
  if (k.kind === "ufc-bout") {
    const red = norm(k.red), blue = norm(k.blue);
    const row = (ledgers.ufc ?? []).find((r) => norm(r.market) === "fight winner" && String(r.eventId ?? "").startsWith(`${k.date}:`) && norm(r.eventId).includes(red) && norm(r.eventId).includes(blue));
    return row ? fromHit(row.hit, row.actual ?? null, row.when ?? null) : none;
  }
  return none;
}

/** The ledger URLs the /saved page fetches — string literals on purpose: the export prune keeps any /data path a shipped file names. */
export const LEDGER_URLS = Object.freeze({
  mlbGames: "/data/mlb/results/game-predictions-graded.jsonl",
  nfl: "/data/nfl/graded-picks.json",
  epl: "/data/epl/graded-picks.json",
  ufc: "/data/ufc/graded-picks.json",
});

export function parseLedger(kind, text) {
  try {
    if (kind === "mlbGames") return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    const doc = JSON.parse(text);
    return Array.isArray(doc?.picks) ? doc.picks : [];
  } catch {
    return [];
  }
}
