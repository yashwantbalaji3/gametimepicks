/**
 * NFL season context + freshness matrix (Program 169 · Release A).
 *
 * Season type is EXPLICIT provider data (seasonType 1/2/3 on every schedule row) — no module may
 * infer it from the calendar month. OFFSEASON is likewise a derived-from-artifacts statement
 * (an empty forward window), never a date heuristic.
 *
 * The freshness matrix is per-INPUT, because inputs age at different speeds and one global
 * window is how stale injury news ends up under a fresh-looking price. Consumers name the input;
 * the matrix answers with the bound and the checker returns a typed state.
 */

export const NFL_SEASON_CONTEXT_VERSION = 1;

export const SEASON_TYPES = Object.freeze({ 1: "PRESEASON", 2: "REGULAR_SEASON", 3: "POSTSEASON" });

/** Season context for one committed schedule row. Fail-closed on unknown codes. */
export function seasonContextFor(row) {
  const code = row?.seasonType;
  const label = SEASON_TYPES[code];
  if (!label) return { state: "UNKNOWN_SEASON_TYPE", reason: `seasonType ${code} is not a known code — nothing may guess from the calendar`, code: code ?? null };
  return { state: label, code, week: row?.week ?? null };
}

/** Forward-window statement: OFFSEASON only when the committed window is truly empty. */
export function forwardWindowState(rows, nowIso) {
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("forwardWindowState: nowIso required");
  const future = (rows ?? []).filter((r) => Date.parse(r?.dateUtc ?? "") > now);
  return future.length === 0
    ? { state: "OFFSEASON_OR_WINDOW_GAP", reason: "no future events in the committed window — an artifact statement, not a calendar guess" }
    : { state: "EVENTS_SCHEDULED", nextDateUtc: future.map((r) => r.dateUtc).sort()[0], count: future.length };
}

/**
 * Freshness bounds by input (hours). Each entry names WHY its bound differs — the matrix is the
 * documentation. Odds keeps the Program-167 lane bound; schedule/results keep their adapters'.
 */
export const FRESHNESS_MATRIX = Object.freeze({
  schedule: { hours: 26, why: "daily 13:00Z cadence + drift; one missed run must read STALE, not broken" },
  results: { hours: 36, why: "results adapter's committed window (P161-D)" },
  rosters: { hours: 168, why: "membership churn is slow between transaction windows; participation NEVER derives from roster freshness alone" },
  injuries: { hours: 24, why: "injury facts rot fast; staleness widens availability to UNKNOWN (P162 contract)" },
  participation: { hours: 12, why: "snap/role scenarios are event-day evidence; anything older than half a day cannot gate a preseason prop" },
  odds: { hours: 6, why: "the odds-lane freshness bound (P167-C availability contract)" },
  weather: { hours: 6, why: "UNSOURCED today (see registry) — the bound exists so a future source inherits a rule, not a default" },
});

/** Typed freshness check for one input artifact stamp. */
export function checkFreshness(input, { sourceAsOf, fetchedAt }, nowIso) {
  const bound = FRESHNESS_MATRIX[input];
  if (!bound) throw new Error(`checkFreshness: unknown input "${input}" — the matrix is closed; add the row deliberately`);
  const now = Date.parse(nowIso ?? "");
  const asOf = Date.parse(sourceAsOf ?? "");
  const fetched = Date.parse(fetchedAt ?? sourceAsOf ?? "");
  if (!Number.isFinite(now)) throw new Error("checkFreshness: nowIso required");
  if (!Number.isFinite(asOf)) return { state: "UNDATED", reason: "no parseable sourceAsOf — an undated artifact is not evidence" };
  if (Number.isFinite(fetched) && asOf > fetched) return { state: "CLOCK_DEFECT", reason: "sourceAsOf postdates fetchedAt — refused, never reordered" };
  const ageHours = (now - asOf) / 3_600_000;
  if (ageHours < 0) return { state: "CLOCK_DEFECT", reason: "sourceAsOf is in the future" };
  return ageHours <= bound.hours
    ? { state: "FRESH", ageHours: Number(ageHours.toFixed(1)), boundHours: bound.hours }
    : { state: "STALE", ageHours: Number(ageHours.toFixed(1)), boundHours: bound.hours, reason: `age ${ageHours.toFixed(1)}h exceeds the ${input} bound (${bound.hours}h): ${bound.why}` };
}
