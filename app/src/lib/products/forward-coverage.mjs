/**
 * FORWARD-WINDOW COVERAGE (P211 · Release C) — one provider-neutral derivation of what each sport
 * actually covers ahead of now: scheduled vs priced vs generated vs frozen vs started, per event,
 * from the SAME canonical artifacts the public surfaces read. Pure: snapshots in, coverage out —
 * the caller (script) reads files; this module never touches disk or the wall clock.
 *
 * HONESTY RULES, from the charter:
 *   - a missing required snapshot is a TYPED REFUSAL, not zeros — "0 events" must mean a real
 *     empty window, never "the file wasn't there";
 *   - a started event is never forward coverage;
 *   - a forward index whose own next-event pointer is in the past is STALE and says so;
 *   - counts reconcile by construction (each event carries its own flags; counts are sums of them).
 */

/** @param {string|null|undefined} iso @param {number} nowMs */
const isFuture = (iso, nowMs) => Boolean(iso) && Number.isFinite(Date.parse(iso)) && Date.parse(iso) > nowMs;

const refusal = (sport, missing) => ({
  sport,
  state: "REFUSED",
  reason: `required snapshot missing: ${missing} — coverage cannot be derived, and zeros would be a lie`,
  events: [],
  counts: null,
  findings: [`MISSING_SNAPSHOT:${missing}`],
});

const summarize = (events) => ({
  scheduled: events.length,
  priced: events.filter((e) => e.priced).length,
  generated: events.filter((e) => e.generated).length,
  frozen: events.filter((e) => e.frozen).length,
  started: events.filter((e) => e.started).length,
});

/**
 * EPL: schedule from the fixtures capture, prices from the odds capture, generation from the
 * per-day forecast artifacts (event-bound rows). The week view is an INDEX over those rows —
 * nothing here invents a week-level prediction.
 */
export function eplForwardCoverage({ fixtures, odds, forecastRows, nowMs, horizonDays = 10 }) {
  if (!fixtures) return refusal("epl", "fixtures capture");
  if (!odds) return refusal("epl", "odds capture");
  const horizonMs = nowMs + horizonDays * 86_400_000;
  const rows = fixtures.rows ?? [];
  // real captures carry `rows` (odds) and `kickoffIso` (both) — accept those alongside the generic names
  const oddsEvents = odds.events ?? odds.rows ?? [];
  // generated = a row carrying REAL distributions; a typed refusal (READY_EXCEPT_ODDS/ABSTAIN)
  // materializes the fixture honestly but is NOT a forecast
  const generatedIds = new Set((forecastRows ?? []).filter((r) => r.state === "CURRENT_PRE_EVENT" || r.probs != null).map((r) => r.eventId));
  const refusalIds = new Set((forecastRows ?? []).filter((r) => !(r.state === "CURRENT_PRE_EVENT" || r.probs != null)).map((r) => r.eventId));
  const pricedIds = new Set(oddsEvents.map((e) => e.eventId ?? e.id).filter(Boolean));
  const events = rows
    .filter((f) => {
      const ms = Date.parse(f.kickoffUtc ?? f.kickoffIso ?? "");
      return Number.isFinite(ms) && ms > nowMs && ms <= horizonMs;
    })
    .map((f) => ({
      eventId: f.eventId ?? f.id ?? null,
      label: f.matchup ?? ([f.homeClub, f.awayClub].filter(Boolean).join(" vs ") || "unknown"),
      startUtc: f.kickoffUtc ?? f.kickoffIso,
      priced: pricedIds.has(f.eventId ?? f.id),
      generated: generatedIds.has(f.eventId ?? f.id),
      refusalPublished: refusalIds.has(f.eventId ?? f.id),
      frozen: false, // freeze happens at kickoff; a future event is by definition not frozen yet
      started: false,
    }));
  const findings = [];
  if (!rows.length) findings.push(`SCHEDULE_EMPTY:fixtures capture ${fixtures.generatedAt ?? "unstamped"} holds 0 rows`);
  if (!oddsEvents.length) findings.push(`PRICED_NONE:odds capture ${odds.capturedAt ?? odds.generatedAt ?? "unstamped"} holds 0 events`);
  const pending = events.filter((e) => e.priced && !e.generated);
  if (pending.length) findings.push(`GENERATION_PENDING:${pending.length} priced future fixture(s) without live distributions (typed-refusal rows published for ${pending.filter((e) => e.refusalPublished).length} of them — the odds-freshness bar re-prices night-before by design)`);
  return { sport: "epl", state: "DERIVED", events, counts: summarize(events), findings };
}

/** UFC: the next card IS the forward window — event-bound, bout-populated, population-exact. */
export function ufcForwardCoverage({ card, odds, nowMs }) {
  if (!card?.event) return refusal("ufc", "card-latest");
  const startUtc = card.event.startUtc ?? null;
  const started = Boolean(startUtc) && Date.parse(startUtc) <= nowMs;
  const bouts = card.bouts ?? [];
  // prices live in the separate authorized odds capture, joined by boutId — never by name
  const pricedIds = new Set((odds?.bouts ?? []).map((b) => b.boutId).filter(Boolean));
  const events = bouts.map((b) => ({
    eventId: b.boutId ?? b.id ?? null,
    label: b.matchup ?? ([b.redName ?? b.red?.name, b.blueName ?? b.blue?.name].filter(Boolean).join(" vs ") || "bout"),
    startUtc,
    priced: pricedIds.has(b.boutId) || Boolean(b.market ?? b.odds ?? b.moneyline),
    generated: Boolean(b.model ?? b.prediction ?? b.winProbability != null),
    frozen: started, // the card freezes at its first start; per-bout locks are the settler's domain
    started,
  }));
  const findings = [];
  if (started) findings.push(`CARD_STARTED:${card.event.name ?? "event"} started ${startUtc} — no longer forward coverage`);
  const declared = card.event.boutCount ?? null;
  if (declared != null && declared !== bouts.length) findings.push(`POPULATION_MISMATCH:card declares ${declared} bouts but carries ${bouts.length}`);
  if (Array.isArray(card.skippedForCoverage) && card.skippedForCoverage.length) findings.push(`SKIPPED_TYPED:${card.skippedForCoverage.length} bout(s) skipped with reasons (population-exact)`);
  return { sport: "ufc", state: started ? "STARTED" : "DERIVED", events: started ? [] : events, counts: summarize(started ? [] : events), findings };
}

/**
 * NFL: the SCHEDULE capture is the population; the forecast index says which of it is generated.
 * Preseason games with no forecasts are a pre-declared model rejection, not staleness — the
 * distinction the coverage exists to keep visible.
 */
export function nflForwardCoverage({ index, schedule, modelStatus, nowMs }) {
  if (!index) return refusal("nfl", "index");
  const forecastIds = new Set((index.events ?? []).map((e) => e.eventId ?? e.id).filter(Boolean));
  const scheduleRows = (schedule?.rows ?? []).filter((r) => isFuture(r.dateUtc ?? r.kickoffUtc, nowMs));
  const events = scheduleRows.map((r) => ({
    eventId: r.providerEventId ?? r.eventId ?? null,
    label: r.shortName ?? r.matchup ?? "game",
    startUtc: r.dateUtc ?? r.kickoffUtc,
    priced: Boolean(index.marketCapturedAt),
    generated: forecastIds.has(r.providerEventId ?? r.eventId),
    frozen: false,
    started: false,
    seasonType: r.seasonType ?? null,
  }));
  const findings = [];
  const modelLive = modelStatus?.teamSimulation?.state === "LIVE";
  if (events.length && !events.some((e) => e.generated) && !modelLive) {
    findings.push(`MODEL_ABSENT_BY_DECISION:${events.length} scheduled game(s) carry no forecast — team simulation is ${modelStatus?.teamSimulation?.state ?? "UNKNOWN"} (preseason models rejected on pre-declared bars; forecasts return under the regular-season contract)`);
  }
  if (index.nextKickoffUtc && !isFuture(index.nextKickoffUtc, nowMs) && !events.length && !scheduleRows.length) {
    findings.push(`STALE_FORWARD_INDEX:nextKickoffUtc ${index.nextKickoffUtc} is in the past and no future event is indexed`);
  }
  const state = findings.some((f) => f.startsWith("STALE_FORWARD_INDEX")) ? "STALE"
    : findings.some((f) => f.startsWith("MODEL_ABSENT_BY_DECISION")) ? "SCHEDULE_ONLY"
    : "DERIVED";
  return { sport: "nfl", state, events, counts: summarize(events), findings };
}

/**
 * MLB stays DAILY BY CONTRACT — the safeguard, not a gap. Coverage here reports today's board and
 * types the absence of future staging as design ("never a once-per-series prediction").
 */
export function mlbForwardCoverage({ board, date, nowMs }) {
  if (!board) return refusal("mlb", `board ${date}`);
  const games = board.games ?? [];
  const events = games.map((g) => ({
    eventId: g.gamePk ?? g.gameId ?? null,
    label: g.matchup ?? ([g.away, g.home].filter(Boolean).join(" @ ") || "game"),
    startUtc: g.gameTimeUtc ?? g.startUtc ?? null,
    priced: true, // a board game carries board odds by construction
    generated: true, // the board IS the daily generation
    frozen: false,
    started: Boolean(g.gameTimeUtc ?? g.startUtc) && Date.parse(g.gameTimeUtc ?? g.startUtc) <= nowMs,
  }));
  return {
    sport: "mlb",
    state: "DAILY_BY_CONTRACT",
    events,
    counts: summarize(events),
    findings: ["FUTURE_STAGING_ABSENT_BY_DESIGN:game-specific inputs (probables, lineups, current odds) arrive per game day; a pre-series artifact would be dishonest for repeated matchups"],
  };
}

/** The four sports at one stamp. Each derives independently; a refusal in one never hides another. */
export function deriveForwardCoverage({ nowMs, epl, ufc, nfl, mlb }) {
  return {
    derivedAtMs: nowMs,
    sports: [
      eplForwardCoverage({ ...epl, nowMs }),
      ufcForwardCoverage({ ...ufc, nowMs }),
      nflForwardCoverage({ ...nfl, nowMs }),
      mlbForwardCoverage({ ...mlb, nowMs }),
    ],
  };
}
