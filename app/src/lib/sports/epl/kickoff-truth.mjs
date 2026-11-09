/**
 * EPL KICKOFF TRUTH (founder Option A, 2026-11-09). The fixture list (openfootball) gives every round a provisional
 * "Saturday 15:00" block until broadcasters pick slots, and the 2026-27 file never received the real slots. From
 * 2026-11-03 every published EPL forecast carried that placeholder: Matchweek 10's games actually ran Fri 20:00Z to
 * Sun 16:30Z, and Everton v Coventry (Fri 6 Nov) was forecast, identified and looked up as Sat 7 Nov.
 *
 * The authoritative kickoff is ESPN eng.1's scheduled event (a UTC instant; ESPN publishes the real slot as soon as it
 * is set). A fixture's kickoff is CONFIRMED only when exactly one ESPN event has the same canonical home AND away club
 * (the alias table resolves both; a pair meets at one ground once per season) and the schedule capture is fresh.
 * Anything else is UNVERIFIED — "kickoff not confirmed" — and the caller withholds every time-dependent use (publishing
 * a forecast as pregame, freezing, grading). A provisional time is never published as confirmed. Pure.
 */

/** Relative to public/data/soccer/epl — its own directory: fixtures/ holds only membership-verified captures. */
export const ESPN_SCHEDULE_FILE = "kickoffs/espn-schedule-latest.json";
export const ESPN_SCHEDULE_SCHEMA = "gtp.epl-espn-schedule@1";
export const KICKOFF_UNVERIFIED = "KICKOFF_UNVERIFIED";
export const KICKOFF_UNVERIFIED_REASON = "kickoff not confirmed";
/** The schedule capture runs with every matchweek refresh (several a day); older than this, nothing is confirmed. */
export const SCHEDULE_MAX_AGE_HOURS = 36;

/** YYYYMM for every month touching [now - 14 d, now + 60 d] (the scoreboard honours only the month form). */
export function scheduleMonths(nowIso) {
  const start = new Date(Date.parse(nowIso) - 14 * 86_400_000), end = new Date(Date.parse(nowIso) + 60 * 86_400_000);
  const out = [];
  for (let y = start.getUTCFullYear(), m = start.getUTCMonth(); y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth()); m === 11 ? (y += 1, m = 0) : (m += 1)) {
    out.push(`${y}${String(m + 1).padStart(2, "0")}`);
  }
  return out;
}

/** ESPN scoreboard events → schedule rows (ESPN's own spellings and UTC instant; no club is resolved here). */
export function espnScheduleRows(events) {
  return (events ?? []).map((e) => {
    const c = e?.competitions?.[0];
    const side = (role) => c?.competitors?.find((x) => x.homeAway === role)?.team?.displayName ?? null;
    return { providerEventId: String(e?.id ?? ""), kickoffUtc: e?.date ?? null, home: side("home"), away: side("away"), statusRaw: e?.status?.type?.name ?? null };
  }).filter((r) => r.providerEventId && Number.isFinite(Date.parse(r.kickoffUtc ?? "")) && r.home && r.away);
}

/** "2026-11-06T20:00Z" → "2026-11-06T20:00:00Z" (ESPN omits seconds; every EPL artifact writes them). */
export const normalizeUtc = (iso) => new Date(Date.parse(iso)).toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Confirm each fixture's kickoff against the ESPN schedule.
 *
 * @param {Array<{ eventId: string, homeClub: string, awayClub: string, kickoffIso: string }>} fixtures  capture rows
 * @param {{ capturedAt: string, rows: Array<object> } | null} schedule  the committed ESPN schedule capture
 * @param {{ resolve: (name: string) => ({ canonical: string } | null), rebuildId: (fixture: object, kickoffIso: string) => string | null, nowIso: string, maxAgeHours?: number }} ctx
 *   `rebuildId` returns the canonical eventId for the fixture at its CONFIRMED kickoff (the id encodes the kickoff minute)
 * @returns {{ confirmed: object[], unverified: object[], scheduleState: "FRESH"|"STALE"|"MISSING" }}
 */
export function confirmFixtureKickoffs(fixtures, schedule, { resolve, rebuildId, nowIso, maxAgeHours = SCHEDULE_MAX_AGE_HOURS }) {
  const age = schedule ? (Date.parse(nowIso) - Date.parse(schedule.capturedAt ?? "")) / 3_600_000 : NaN;
  const scheduleState = !schedule ? "MISSING" : Number.isFinite(age) && age >= 0 && age <= maxAgeHours ? "FRESH" : "STALE";
  const canon = (n) => resolve(n)?.canonical ?? null;
  const byPair = new Map();
  if (scheduleState === "FRESH") {
    for (const r of schedule.rows ?? []) {
      const h = canon(r.home), a = canon(r.away);
      if (!h || !a || h === a) continue;
      const k = `${h}|${a}`;
      byPair.set(k, [...(byPair.get(k) ?? []), r]);
    }
  }
  const confirmed = [], unverified = [];
  for (const f of fixtures ?? []) {
    const unv = (why) => unverified.push({ ...f, kickoffState: KICKOFF_UNVERIFIED, reason: `${KICKOFF_UNVERIFIED_REASON} — ${why}` });
    if (scheduleState !== "FRESH") { unv(scheduleState === "MISSING" ? "no ESPN schedule capture" : `ESPN schedule capture is older than ${maxAgeHours} h`); continue; }
    const h = canon(f.homeClub), a = canon(f.awayClub);
    const hits = h && a ? byPair.get(`${h}|${a}`) ?? [] : [];
    if (hits.length !== 1) { unv(hits.length ? "several ESPN events match this pairing" : "no ESPN event for this pairing"); continue; }
    const kickoffIso = normalizeUtc(hits[0].kickoffUtc);
    const eventId = rebuildId(f, kickoffIso);
    if (!eventId) { unv("the confirmed kickoff does not form a canonical identity"); continue; }
    confirmed.push({ ...f, eventId, kickoffIso, espnEventId: hits[0].providerEventId, kickoffSource: "ESPN", kickoffState: "CONFIRMED", ...(kickoffIso !== f.kickoffIso ? { provisionalKickoffIso: f.kickoffIso, provisionalEventId: f.eventId } : {}) });
  }
  return { confirmed, unverified, scheduleState };
}

/** The confirmed fixtures still to be played at `nowIso` — by their CONFIRMED kickoff, so a match is never treated as
 *  pregame after it has really started (Everton v Coventry: real Fri 20:00Z, provisional Sat 15:00Z). */
export function unplayedConfirmed(confirmed, nowIso) {
  const now = Date.parse(nowIso);
  return (confirmed ?? []).filter((f) => f.kickoffState === "CONFIRMED" && Number.isFinite(Date.parse(f.kickoffIso ?? "")) && Date.parse(f.kickoffIso) > now);
}
