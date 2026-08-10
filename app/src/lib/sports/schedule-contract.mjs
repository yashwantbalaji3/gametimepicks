/**
 * Shared schedule/event contract — the provider-neutral platform every sport adapter satisfies
 * (Program 148 · Release A).
 *
 * WHAT THIS GENERALIZES. MLB's operational lessons, minus its baseball mathematics:
 *   - doubleheader-safe identity ({away}-{home}-{date}-{gamePk}) generalizes to
 *     `{sport}:{competition}:{date}:{providerEventId}` — provider event id is REQUIRED, because
 *     name+date collides the moment a doubleheader, replay or rematch exists;
 *   - "Final without scores lies" (StatsAPI) generalizes to a closed status taxonomy where every
 *     provider string must map explicitly or land on UNKNOWN — never guessed to a nearby state;
 *   - capturedAt-before-start (research leakage) generalizes to fetchedAt/sourceAsOf stamps on
 *     every snapshot, so point-in-time behaviour is provable later.
 *
 * COVERAGE STATE IS NOT EVENT STATE. A route must never infer "we cover this sport" from the mere
 * existence of events — that is the Program 139 UFC lesson (history is not activity) applied
 * forward: a schedule feed is not a model, and the enum below makes the claim explicit at every
 * altitude. Nothing here grants public visibility; the sport gate and founder activation still own
 * that.
 */

export const SCHEDULE_CONTRACT_VERSION = 1;

/** Closed event-status taxonomy. Every provider string maps here explicitly or becomes UNKNOWN. */
export const EVENT_STATUS = Object.freeze([
  "SCHEDULED", "LIVE", "FINAL", "POSTPONED", "CANCELLED", "SUSPENDED", "ABANDONED", "UNKNOWN",
]);

/** UFC bout-level extension — a sport EXTENSION, not a corruption of the shared taxonomy. */
export const UFC_BOUT_STATUS_EXT = Object.freeze(["BOUT_CANCELLED", "REPLACEMENT_PENDING", "NO_CONTEST", "OVERTURNED"]);

/**
 * Coverage state — what WE claim about a sport's surface, decided by evidence, never inferred from
 * events existing. SCHEDULE_ONLY is a legitimate public state; SIMULATION_READY and beyond require
 * their sport-gate stages; PUBLIC_ACTIVE additionally requires founder activation.
 */
export const COVERAGE_STATES = Object.freeze([
  "SCHEDULE_ONLY", "DATA_READY", "SHADOW_MODEL", "SIMULATION_READY", "PICKS_ELIGIBLE",
  "PUBLIC_ACTIVE", "OFF_SEASON", "SOURCE_STALE", "INCIDENT",
]);

/** Provider-string → canonical status, per sport. Unmapped strings are UNKNOWN by construction. */
const STATUS_MAPS = {
  // MLB StatsAPI vocabulary (reference implementation — the live pipeline keeps its own loader;
  // this map exists so the shared contract can express MLB without importing baseball code).
  mlb: { "scheduled": "SCHEDULED", "pre-game": "SCHEDULED", "in progress": "LIVE", "final": "FINAL", "game over": "FINAL", "postponed": "POSTPONED", "cancelled": "CANCELLED", "suspended": "SUSPENDED" },
  epl: { "ns": "SCHEDULED", "tbd": "SCHEDULED", "1h": "LIVE", "ht": "LIVE", "2h": "LIVE", "et": "LIVE", "ft": "FINAL", "aet": "FINAL", "pen": "FINAL", "pst": "POSTPONED", "canc": "CANCELLED", "susp": "SUSPENDED", "abd": "ABANDONED" },
  nfl: { "scheduled": "SCHEDULED", "pregame": "SCHEDULED", "in_progress": "LIVE", "halftime": "LIVE", "final": "FINAL", "final_overtime": "FINAL", "postponed": "POSTPONED", "canceled": "CANCELLED" },
  nba: { "scheduled": "SCHEDULED", "in_progress": "LIVE", "final": "FINAL", "postponed": "POSTPONED", "canceled": "CANCELLED" },
  ufc: { "scheduled": "SCHEDULED", "live": "LIVE", "final": "FINAL", "cancelled": "CANCELLED", "postponed": "POSTPONED" },
};

/** Map a raw provider status. UNKNOWN is an answer, not an error — the caller decides severity. */
export function normalizeEventStatus(sport, raw) {
  const map = STATUS_MAPS[sport];
  if (!map) return "UNKNOWN";
  return map[String(raw ?? "").toLowerCase().trim()] ?? "UNKNOWN";
}

/**
 * Canonical event id. Provider event id is REQUIRED — name+date identity collides on
 * doubleheaders, rematches and replays, which is precisely the MLB lesson.
 */
export function canonicalEventId({ sport, competition, dateEt, providerEventId }) {
  for (const [k, v] of Object.entries({ sport, competition, dateEt, providerEventId })) {
    if (v == null || String(v).trim() === "") throw new Error(`canonicalEventId: ${k} is required`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEt)) throw new Error(`canonicalEventId: dateEt must be YYYY-MM-DD, got ${dateEt}`);
  return `${sport}:${competition}:${dateEt}:${providerEventId}`;
}

/**
 * Validate a normalized event against the contract. Returns {ok, errors} — total, never throws,
 * so a batch normalizer quarantines bad records instead of dying mid-slate.
 */
export function validateEvent(e) {
  const errors = [];
  const req = (k) => { if (e?.[k] == null || e[k] === "") errors.push(`missing ${k}`); };
  ["schemaVersion", "sport", "competition", "season", "providerEventId", "canonicalEventId", "scheduledStartUtc", "status", "fetchedAt", "sourceAsOf", "provenance"].forEach(req);
  if (e?.schemaVersion !== SCHEDULE_CONTRACT_VERSION) errors.push(`schemaVersion must be ${SCHEDULE_CONTRACT_VERSION}`);
  if (e?.status && !EVENT_STATUS.includes(e.status) && !UFC_BOUT_STATUS_EXT.includes(e.status)) errors.push(`status ${e.status} outside the closed taxonomy`);
  // Competitors: home/away roles, or UFC red/blue — exactly one scheme.
  const hasHomeAway = e?.competitors?.home && e?.competitors?.away;
  const hasCorners = e?.competitors?.red && e?.competitors?.blue;
  if (!hasHomeAway && !hasCorners) errors.push("competitors must carry home/away or red/blue");
  if (hasHomeAway && hasCorners) errors.push("competitors must not mix role schemes");
  // Point-in-time discipline: the snapshot must not claim to be newer than its fetch.
  if (e?.fetchedAt && e?.sourceAsOf && Date.parse(e.sourceAsOf) > Date.parse(e.fetchedAt)) {
    errors.push("sourceAsOf is after fetchedAt — a snapshot cannot know the future");
  }
  return { ok: errors.length === 0, errors };
}

/** Freshness classification for a schedule snapshot, per the shared windows. */
export function classifySnapshotFreshness({ fetchedAt, nowIso, freshWindowHours = 26 }) {
  if (!fetchedAt || !nowIso) return "UNKNOWN";
  const age = (Date.parse(nowIso) - Date.parse(fetchedAt)) / 3_600_000;
  if (!Number.isFinite(age) || age < 0) return "UNKNOWN";
  return age <= freshWindowHours ? "FRESH" : "STALE";
}

/**
 * Alias normalization with quarantine. Unknown aliases NEVER silently mint identities — the
 * Sprint 043/044 collision lessons say identity mistakes are the expensive kind.
 */
export function resolveAlias(aliasMap, rawName) {
  const key = String(rawName ?? "").toLowerCase().trim().replace(/\s+/g, " ");
  if (!key) return { ok: false, quarantine: { rawName, reason: "empty name" } };
  const id = aliasMap[key];
  return id != null
    ? { ok: true, canonicalId: id }
    : { ok: false, quarantine: { rawName, reason: `unknown alias "${key}" — add it to the alias map deliberately, never auto-mint` } };
}
