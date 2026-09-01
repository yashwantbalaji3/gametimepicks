/**
 * THE OFFERED-WINDOW CONTROL PLANE — one truthful answer to four questions.
 *
 * Program 225 · Release C. Which events are offered right now, what evidence exists for each, what
 * should have been generated, and what was published or refused?
 *
 * Every surface used to answer these separately. /today counted one way, the sport hubs another, the
 * console a third, and each was right about its own artifact and wrong about the platform. The
 * recurring shape is not disagreement about numbers — it is that "we have no card" and "no card was
 * offered" and "we could not look" were all rendered as the same quiet zero.
 *
 * THE VOCABULARY IS CLOSED. Every event inside the horizon lands in exactly one state:
 *
 *   NOT_OFFERED       the provider lists no supported market for it — evidence, not an outage
 *   NOT_YET_CAPTURED  scheduled, and OUR OWN acquisition for it has not run yet
 *   OFFERED_UNPRICED  a market exists but carries no usable price yet
 *   OFFERED_PRICED    a usable price is on file
 *   FORECAST_READY    a model artifact exists and is pre-start
 *   PUBLISHED         it reached a public surface
 *   REFUSED           we declined, with a typed reason
 *   STARTED           the event began; nothing new may be generated for it
 *   SETTLED           an official result is recorded
 *   SOURCE_STALE      the newest capture is too old to describe this event
 *   JOIN_FAILED       evidence exists but cannot be tied to this identity
 *
 * The states are ORDERED by precedence, most-terminal first, because an event can satisfy several
 * at once and a matrix that lists a game twice cannot be reconciled. SETTLED outranks STARTED
 * outranks PUBLISHED, and the two failure states outrank everything: a row we cannot join or whose
 * source has rotted must never be reported as healthy just because a later stage also matched.
 *
 * WHAT THIS IS NOT. It is not a producer. It never fetches, never prices, never decides an identity
 * and never writes a forecast. It reads what the pipeline already committed and states what is
 * true — so a surface that disagrees with it is a surface with a defect, not a second opinion.
 *
 * Pure. Every artifact and the clock are passed in.
 */

/** Most-terminal first. `classifyEvent` returns the first that matches. */
export const OFFERED_STATES = Object.freeze([
  "JOIN_FAILED",
  "SOURCE_STALE",
  "SETTLED",
  "STARTED",
  "REFUSED",
  "PUBLISHED",
  "FORECAST_READY",
  "OFFERED_PRICED",
  "OFFERED_UNPRICED",
  /*
   * NOT_YET_CAPTURED — an explicitly named extension, added when today's real slate exposed the gap.
   *
   * The event is scheduled inside our horizon and OUR OWN acquisition for it has not run yet. That
   * is a different fact from NOT_OFFERED ("the provider lists no supported market"), and from
   * SOURCE_STALE ("we captured, too long ago"). Collapsing it into NOT_OFFERED would report fifteen
   * games as unofferable five hours before the capture is even due.
   */
  "NOT_YET_CAPTURED",
  "NOT_OFFERED",
]);

/** States that mean the pipeline still owes this event work. */
const OWES_WORK = new Set(["OFFERED_PRICED", "FORECAST_READY"]);

/** Scheduled but not captured: awaited, not owed — until the runner marks the capture overdue. */
const AWAITED = new Set(["NOT_YET_CAPTURED"]);

/** States that are a finding rather than a stage. */
const FAILURE_STATES = new Set(["JOIN_FAILED", "SOURCE_STALE"]);

/**
 * Classify ONE event from the evidence committed about it.
 *
 * @param {object} e
 * @param {string} e.sport
 * @param {string|null} e.providerEventId  the provider's own id
 * @param {string|null} e.canonicalId      our durable identity
 * @param {string|null} e.startUtc
 * @param {number} e.nowMs
 * @param {boolean} e.joined               evidence could be tied to this identity
 * @param {number|null} e.sourceAgeHours   age of the newest capture describing it
 * @param {number|null} e.maxSourceAgeHours
 * @param {boolean} e.offered              a supported market exists
 * @param {boolean} e.priced               a usable price is on file
 * @param {boolean} e.forecast             a pre-start model artifact exists
 * @param {boolean} e.published            it reached a public surface
 * @param {string|null} e.refusalReason    a typed refusal, when we declined
 * @param {boolean} e.settled
 */
export function classifyEvent(e) {
  const started = startedBy(e.startUtc, e.nowMs);

  /*
   * FAILURES FIRST. A row whose evidence cannot be joined, or whose newest capture is older than the
   * event it claims to describe, is a finding — and would otherwise be masked by whatever later
   * stage happens to match. That masking is how a stale UFC odds capture covering a card that had
   * already been fought read as an ordinary unpriced window.
   */
  if (e.joined === false) return state("JOIN_FAILED", "evidence exists but cannot be tied to this identity");
  if (
    e.maxSourceAgeHours != null &&
    e.sourceAgeHours != null &&
    e.sourceAgeHours > e.maxSourceAgeHours
  ) {
    return state("SOURCE_STALE", `newest capture is ${e.sourceAgeHours.toFixed(1)}h old against a ${e.maxSourceAgeHours}h bound`);
  }

  if (e.settled) return state("SETTLED", "official result recorded");
  if (started) return state("STARTED", "the event has begun; nothing new may be generated for it");
  if (e.refusalReason) return state("REFUSED", e.refusalReason);
  if (e.published) return state("PUBLISHED", "reached a public surface");
  if (e.forecast) return state("FORECAST_READY", "a pre-start model artifact exists");
  if (e.priced) return state("OFFERED_PRICED", "a usable price is on file");
  if (e.offered) return state("OFFERED_UNPRICED", "a market exists but carries no usable price yet");
  /*
   * "We have not looked yet" is not "there is nothing there". A caller that knows its own capture is
   * still pending says so; only a caller that HAS captured may report NOT_OFFERED.
   */
  if (e.captured === false) {
    return state("NOT_YET_CAPTURED", e.captureDueReason ?? "scheduled, and our acquisition for it has not run yet");
  }
  return state("NOT_OFFERED", "the provider lists no supported market — evidence, not an outage");
}

const state = (s, reason) => ({ state: s, reason });

/**
 * Has the event started? Fails CLOSED: an unreadable or absent start time counts as started, because
 * generating for an event that may already be under way is the error that cannot be undone.
 */
export function startedBy(startUtc, nowMs) {
  const t = Date.parse(startUtc ?? "");
  if (!Number.isFinite(t) || !Number.isFinite(nowMs)) return true;
  return t <= nowMs;
}

/**
 * Build the matrix for one sport and reconcile it.
 *
 * Conservation is the point: every event inside the horizon appears EXACTLY ONCE, the per-state
 * counts sum to the population, and the caller is told what the pipeline still owes. A matrix that
 * does not add up is reported as such rather than rendered.
 */
export function buildSportWindow({ sport, events, horizonHours, nowMs, readable = true }) {
  if (!readable) {
    return {
      sport,
      state: "UNKNOWN",
      note: "the artifacts for this sport could not be read — not knowing is not the same as nothing scheduled",
      population: 0,
      counts: {},
      owed: [],
      awaited: [],
      findings: [],
      rows: [],
      conserved: false,
    };
  }

  const rows = (events ?? []).map((e) => {
    const c = classifyEvent({ ...e, nowMs });
    return {
      sport,
      providerEventId: e.providerEventId ?? null,
      canonicalId: e.canonicalId ?? null,
      startUtc: e.startUtc ?? null,
      marketFamilies: e.marketFamilies ?? [],
      acquisitionAt: e.acquisitionAt ?? null,
      forecastRevision: e.forecastRevision ?? null,
      publicRoute: e.publicRoute ?? null,
      settlementId: e.settlementId ?? null,
      sourceAgeHours: e.sourceAgeHours ?? null,
      state: c.state,
      reason: c.reason,
    };
  });

  const counts = {};
  for (const s of OFFERED_STATES) counts[s] = 0;
  for (const r of rows) counts[r.state] += 1;

  const summed = Object.values(counts).reduce((a, b) => a + b, 0);
  const conserved = summed === rows.length;

  const owed = rows.filter((r) => OWES_WORK.has(r.state));
  const awaited = rows.filter((r) => AWAITED.has(r.state));
  const findings = rows.filter((r) => FAILURE_STATES.has(r.state));

  /*
   * NO_EVENTS is a statement about the WINDOW, never a pass. An empty horizon satisfies every check
   * vacuously, and a sport that has quietly stopped producing looks identical to a sport with
   * nothing on — until you say which one it is.
   */
  const sportState =
    !conserved ? "INCONSISTENT"
      : findings.length > 0 ? "FINDINGS"
        : rows.length === 0 ? "NO_EVENTS"
          : owed.length > 0 ? "WORK_OWED"
            : "COMPLETE";

  return { sport, state: sportState, horizonHours, population: rows.length, counts, owed, awaited, findings, rows, conserved };
}

/** Worst-of across sports. UNKNOWN outranks every known state: not knowing is worse than a defect. */
export function worstWindowState(states) {
  const order = ["COMPLETE", "NO_EVENTS", "WORK_OWED", "FINDINGS", "INCONSISTENT", "UNKNOWN"];
  return (states ?? []).reduce((worst, s) => (order.indexOf(s) > order.indexOf(worst) ? s : worst), "COMPLETE");
}

/**
 * The compact, customer-safe view. Counts and states only — never a provider payload, a price, an
 * acquisition receipt or a private route. The full matrix stays internal.
 */
export function publicSummary(sports) {
  return {
    state: worstWindowState(sports.map((s) => s.state)),
    sports: sports.map((s) => ({
      sport: s.sport,
      state: s.state,
      events: s.population,
      counts: Object.fromEntries(Object.entries(s.counts).filter(([, n]) => n > 0)),
    })),
  };
}
