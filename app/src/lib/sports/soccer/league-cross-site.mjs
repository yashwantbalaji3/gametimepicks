/**
 * A registry soccer league (today Ligue 1) on the CROSS-SITE surfaces — /today, /sports and /results/picks (Batch 1 · #7).
 *
 * Ligue 1 had a hub at /soccer/ligue-1/ that no other surface knew about: /today listed none of its fixtures, the /sports
 * chooser had no "Next:" date and its hub list omitted it, and /results/picks had no Ligue 1 record. These are the pure
 * readers those surfaces share. Every value is read from the league's two PUBLIC artifacts — forecasts/latest.json (the
 * hub's fixtures and 1X2 probabilities) and results/graded.json (the hub's graded record) — and nothing is graded or
 * re-derived here: a row is "final" only when graded.json carries its final score, and the record is graded.json's own
 * summary and rows.
 *
 * WHAT THE RECORD COVERS. graded.json grades the win/draw/win (1X2) forecast only, by log loss, against the last
 * forecast published before kick-off. Over 2.5, both teams to score and scorelines are published on the hub and are NOT
 * graded (a founder rule decision is pending). No hit/miss count is made from the 1X2 probabilities here: graded.json
 * records no pick, and turning its probabilities into one would be a new grading rule.
 *
 * Pure: no filesystem, no clock (callers pass `nowMs`).
 */
import { fixtureState } from "./fixture-timing.mjs";
import { classifySnapshotFreshness } from "../schedule-contract.mjs";

const ET_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });

/** The ET calendar day (YYYY-MM-DD) of an instant, or null when unreadable. */
export function etDayOf(iso) {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? ET_KEY.format(new Date(t)) : null;
}

const pct0 = (p) => `${Math.round(p * 100)}%`;
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const OUTCOME = Object.freeze({ H: "home win", D: "draw", A: "away win" });

/** eventId → final score, from the graded record (the only place a Ligue 1 final is recorded). */
export function finalsById(graded) {
  return Object.fromEntries((graded?.matches ?? []).filter((m) => m?.final && finite(m.final.home) && finite(m.final.away)).map((m) => [String(m.eventId), { home: m.final.home, away: m.final.away }]));
}

/** "Home 6% · Draw 13% · Away 81%" — the hub's own three probabilities, rounded the way /today prints EPL's. */
export function oneXTwoRead(r) {
  const p = r?.probs;
  if (!p || !finite(p.home) || !finite(p.draw) || !finite(p.away)) return null;
  return `${r.homeClub ?? "Home"} ${pct0(p.home)} · Draw ${pct0(p.draw)} · ${r.awayClub ?? "Away"} ${pct0(p.away)}`;
}

/**
 * The league's games-table rows (the /today shape: components/games-experience-table-wire.ts GamesTableRow) for the given
 * ET dates. Upcoming fixtures come from the forecast file; a played match comes from the graded record (once a match is
 * played it leaves latest.json). Each event appears once — a graded row wins over a forecast row with the same id.
 *
 * @param {{ league: string, label: string, hubHref: string, resultHref: string, forecasts: any, graded: any, dates: string[], nowMs: number }} o
 */
export function leagueGamesTableRows({ league, label, hubHref, resultHref, forecasts, graded, dates, nowMs }) {
  const want = new Set(dates);
  const finals = finalsById(graded);
  const out = [];
  const seen = new Set();
  const NOTE_OPEN = "Can update until the start; frozen at the start.";
  for (const m of graded?.matches ?? []) {
    const date = etDayOf(m.kickoffUtc);
    const id = String(m.eventId);
    if (!date || !want.has(date) || seen.has(id) || !finals[id]) continue;
    seen.add(id);
    out.push({
      id: `${league}:${id}`, date, startUtc: m.kickoffUtc, time: `${ET_TIME.format(new Date(m.kickoffUtc))} ET`, sport: league, sportLabel: label,
      matchup: `${m.homeClub} vs ${m.awayClub}`, status: "Final · graded",
      forecast: "Frozen", read: oneXTwoRead(m), note: `Full time ${finals[id].home}–${finals[id].away}.`,
      eventHref: hubHref, resultHref,
    });
  }
  for (const r of forecasts?.rows ?? []) {
    const date = etDayOf(r.kickoffUtc);
    const id = String(r.eventId);
    if (!date || !want.has(date) || seen.has(id)) continue;
    seen.add(id);
    const state = fixtureState(r.kickoffUtc, nowMs, finals[id] ?? null);
    const started = state !== "UPCOMING";
    const read = oneXTwoRead(r);
    out.push({
      id: `${league}:${id}`, date, startUtc: r.kickoffUtc, time: `${ET_TIME.format(new Date(r.kickoffUtc))} ET`, sport: league, sportLabel: label,
      matchup: `${r.homeClub} vs ${r.awayClub}`,
      /* A started match without a recorded final is never "Final": the graded record is the only source of one. */
      status: started ? "Started" : "Scheduled",
      forecast: read ? (started ? "Frozen" : "Published") : "Unavailable",
      read, note: read ? (started ? null : NOTE_OPEN) : "No forecast was published for this fixture.",
      eventHref: hubHref, resultHref: null,
    });
  }
  return out;
}

/** The first fixture still to play at `nowMs` (kickoff in the future, no recorded final), or null. */
export function leagueNextFixtureUtc(forecasts, graded, nowMs) {
  const finals = finalsById(graded);
  const next = (forecasts?.rows ?? [])
    .filter((r) => fixtureState(r.kickoffUtc, nowMs, finals[String(r.eventId)] ?? null) === "UPCOMING")
    .map((r) => r.kickoffUtc)
    .sort()[0];
  return next ?? null;
}

/**
 * The /sports schedule section for the league, in the shared adapter shape (lib/sports/upcoming/adapters.mjs): the
 * fixtures still to play, from the same forecast file the hub renders.
 *
 * @param {{ league: string, label: string, seasonContext?: string, forecasts: any, graded: any, nowMs: number, displayCap?: number }} o
 */
export function leagueUpcomingSection({ league, label, seasonContext = "2026–27", forecasts, graded, nowMs, displayCap = 12 }) {
  if (!forecasts?.rows) {
    return {
      sport: league, competitionLabel: label, seasonContext, coverage: "SCHEDULE_ONLY",
      sourceVerdict: { sourceId: null, configured: false, fetchedAt: null, freshness: "UNKNOWN", blocker: `The ${label} fixture file is not available in this build.` },
      events: [], quarantined: [],
    };
  }
  const finals = finalsById(graded);
  const upcoming = forecasts.rows
    .filter((r) => fixtureState(r.kickoffUtc, nowMs, finals[String(r.eventId)] ?? null) === "UPCOMING")
    .sort((a, b) => String(a.kickoffUtc).localeCompare(String(b.kickoffUtc)));
  const events = upcoming.map((r) => ({
    canonicalEventId: String(r.eventId),
    scheduledStartUtc: r.kickoffUtc,
    status: "SCHEDULED",
    competitors: { home: { id: r.homeEspnId ?? r.homeClub, name: r.homeClub }, away: { id: r.awayEspnId ?? r.awayClub, name: r.awayClub } },
    venue: null,
  }));
  const fetchedAt = forecasts.generatedAt ?? null;
  return {
    sport: league, competitionLabel: label, seasonContext, coverage: "SCHEDULE_ONLY",
    sourceVerdict: { sourceId: "espn_scoreboard", configured: true, fetchedAt, freshness: classifySnapshotFreshness({ fetchedAt, nowIso: new Date(nowMs).toISOString(), freshWindowHours: 7 * 24 }), blocker: null },
    events: events.slice(0, displayCap),
    totals: { captured: forecasts.rows.length, upcoming: events.length, shown: Math.min(displayCap, events.length) },
    quarantined: [],
  };
}

/**
 * The league's graded 1X2 record for /results/picks, newest first — graded.json's own summary and rows, translated to
 * words. `when` is the ET day; `probabilityOfResult` is the probability the forecast gave the result that happened.
 */
export function leagueRecord(graded) {
  if (!graded || !Array.isArray(graded.matches)) return null;
  const rows = [...graded.matches]
    .filter((m) => m?.final && finite(m.final.home) && finite(m.final.away))
    .sort((a, b) => String(b.kickoffUtc).localeCompare(String(a.kickoffUtc)) || String(a.eventId).localeCompare(String(b.eventId)))
    .map((m) => ({
      eventId: String(m.eventId),
      when: etDayOf(m.kickoffUtc),
      matchup: `${m.homeClub} v ${m.awayClub}`,
      score: `${m.final.home}–${m.final.away}`,
      result: OUTCOME[m.result] ?? null,
      probabilityOfResult: finite(m.probabilityOfResult) ? m.probabilityOfResult : null,
      logLoss: finite(m.logLoss) ? m.logLoss : null,
    }));
  const s = graded.summary ?? {};
  return {
    matches: finite(s.matches) ? s.matches : rows.length,
    logLoss: finite(s.logLoss) ? s.logLoss : null,
    brier: finite(s.brier) ? s.brier : null,
    uniformLogLoss: finite(s.uniformLogLoss) ? s.uniformLogLoss : null,
    sampleState: s.sampleState ?? null,
    rows,
  };
}
