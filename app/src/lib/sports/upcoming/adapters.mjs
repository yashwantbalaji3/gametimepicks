/**
 * Upcoming-schedule adapters — four sports, one contract, committed artifacts only
 * (Program 148 · Release B).
 *
 * Each adapter returns the SAME normalized shape the shared presentation consumes:
 *   { sport, competitionLabel, seasonContext, coverage, sourceVerdict, events }
 * where events satisfy the Release A schedule contract (validated here, quarantined on failure)
 * and sourceVerdict tells the truth about where the data came from and how fresh it is.
 *
 * NO NETWORK. Adapters read committed artifacts. Where no approved source has ever produced an
 * artifact, the adapter says so in `sourceVerdict.blocker` — an honest "schedule not published"
 * beats an invented fixture list, and the blocker text is the founder-facing receipt of exactly
 * what is missing. Today's disk truth (verified 2026-08-09):
 *   EPL  soccer/epl/fixtures holds a SAMPLE artifact only (dataClass "sample")
 *   NFL  no artifact of any kind
 *   NBA  one Odds-API market probe from 2026-06-10 (authorized source, stale + off-season)
 *   UFC  settled archive only — a RESULT, never presented as an upcoming event
 */
import fs from "node:fs";
import path from "node:path";

import {
  SCHEDULE_CONTRACT_VERSION, EVENT_STATUS, canonicalEventId, normalizeEventStatus,
  validateEvent, classifySnapshotFreshness,
} from "../schedule-contract.mjs";

const DATA = () => path.join(process.cwd(), "public", "data");
const readJson = (...seg) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA(), ...seg), "utf8")); } catch { return null; }
};

/**
 * Build + validate a contract event; invalid records are dropped with their reasons kept.
 * `build` may throw (canonicalEventId refuses identity-less rows by design) — a throw is a
 * quarantine too, so one bad row can never kill the batch.
 */
function toEvent(build, quarantine) {
  let raw;
  try { raw = build(); } catch (err) { quarantine.push({ id: "?", errors: [String(err?.message ?? err)] }); return null; }
  const check = validateEvent(raw);
  if (!check.ok) { quarantine.push({ id: raw?.canonicalEventId ?? "?", errors: check.errors }); return null; }
  return raw;
}

const dateEtOf = (iso) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));

/**
 * EPL — the fixtures root exists but holds only the schema sample; that is the receipt.
 * `artifact` injects a capture in place of the disk scan (tests prove the event path without
 * committing fake fixture data the page would then render as real).
 */
export function eplUpcoming({ nowIso, artifact }) {
  let newestReal = artifact ?? null;
  if (!newestReal) {
    const dir = path.join(DATA(), "soccer", "epl", "fixtures");
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
      for (const f of files.reverse()) {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        // The committed sample declares dataClass FIXTURE_SAMPLE — any *sample* class is display-inert.
        if (!/sample/i.test(String(d?.dataClass ?? "")) && Array.isArray(d?.rows) && d.rows.length) { newestReal = { file: f, ...d }; break; }
      }
    } catch { /* dir absent → same verdict as sample-only */ }
  }

  if (!newestReal) {
    return {
      sport: "epl", competitionLabel: "Premier League", seasonContext: "2026–27",
      coverage: "SCHEDULE_ONLY",
      sourceVerdict: {
        sourceId: null, configured: false, fetchedAt: null, freshness: "UNKNOWN",
        blocker: "The fixtures root (soccer/epl/fixtures) holds the schema sample only — no approved fixture capture has ever been ingested. Founder-side: none needed yet; engineering-side: the capture job against an authorized source is the next receipt (Release C).",
      },
      events: [], quarantined: [],
    };
  }

  const quarantined = [];
  // Rows follow the documented soccer/epl fixture schema (homeClub/awayClub/kickoffIso/lifecycle/
  // providerRefs); the provider event id comes from the providerRefs entry of kind "event".
  const events = (newestReal.rows ?? []).map((r) => toEvent(() => {
    const kickoff = r.kickoffIso ?? r.kickoffUtc;
    const providerEventId = String(r.providerRefs?.find?.((p) => p?.kind === "event")?.id ?? r.providerFixtureId ?? "");
    const rawStatus = r.lifecycle ?? r.status ?? "ns";
    return {
      schemaVersion: SCHEDULE_CONTRACT_VERSION,
      sport: "epl", competition: "premier-league", season: newestReal.season ?? "2026-27",
      providerEventId,
      canonicalEventId: canonicalEventId({ sport: "epl", competition: "premier-league", dateEt: dateEtOf(kickoff), providerEventId }),
      scheduledStartUtc: kickoff,
      status: EVENT_STATUS.includes(rawStatus) ? rawStatus : normalizeEventStatus("epl", rawStatus),
      competitors: { home: { id: r.homeId ?? r.homeClub ?? r.home, name: r.homeClub ?? r.home }, away: { id: r.awayId ?? r.awayClub ?? r.away, name: r.awayClub ?? r.away } },
      venue: r.venue ?? null,
      fetchedAt: newestReal.generatedAt, sourceAsOf: newestReal.sourceAsOf ?? newestReal.capturedAt ?? newestReal.generatedAt,
      provenance: `soccer/epl/fixtures/${newestReal.file} (${newestReal.source ?? "committed capture"})`,
    };
  }, quarantined)).filter(Boolean);

  // A season capture holds 380 fixtures; the page shows a bounded upcoming window and SAYS SO —
  // rendering the whole season would bury the near slate, and silently truncating would lie.
  const DISPLAY_CAP = 12;
  const upcoming = events
    .filter((e) => Date.parse(e.scheduledStartUtc) > Date.parse(nowIso))
    .sort((a, b) => a.scheduledStartUtc.localeCompare(b.scheduledStartUtc));
  return {
    sport: "epl", competitionLabel: "Premier League", seasonContext: newestReal.season ?? "2026–27",
    coverage: "SCHEDULE_ONLY",
    sourceVerdict: { sourceId: "openfootball", configured: true, fetchedAt: newestReal.generatedAt, freshness: classifySnapshotFreshness({ fetchedAt: newestReal.generatedAt, nowIso, freshWindowHours: 7 * 24 }), blocker: null },
    events: upcoming.slice(0, DISPLAY_CAP),
    totals: { captured: events.length, upcoming: upcoming.length, shown: Math.min(DISPLAY_CAP, upcoming.length) },
    quarantined,
  };
}


/**
 * Results-tracking note for a sport's /sports section — derived from the results capture
 * artifact's OWN state field, never recomputed and never promising picks. A sport without a
 * results path returns null and the section says nothing (absence over advertisement).
 */
export function resultsTrackingNote(sport) {
  const artifact = sport === "epl" ? readJson("soccer", "epl", "results", "latest.json") : readJson(sport, "results", "latest.json");
  if (!artifact?.state) return null;
  const checked = (artifact.sourceAsOf ?? artifact.generatedAt ?? "").slice(0, 10);
  switch (artifact.state) {
    case "PRESEASON": return `Results tracking is armed for the season — nothing grades before league play starts (checked ${checked}).`;
    case "NO_RESULTS_YET": return `Results tracking is active — no completed games in the current capture window yet (checked ${checked}).`;
    case "RESULTS": return `${artifact.completedCount ?? (artifact.rows ?? []).length} completed ${(artifact.completedCount ?? 0) === 1 ? "game" : "games"} captured from the official scoreboard (checked ${checked}).`;
    default: return null; // SOURCE_STALE and unknown states: the capture line above already carries the stamp
  }
}

/**
 * NFL — ESPN public-scoreboard captures (scripts/nfl/capture-nfl-schedule.mjs). A missing capture
 * renders the honest no-source state; a stale one says it is stale. `capture` injects for tests.
 */
export function nflUpcoming({ nowIso, capture: captureOverride } = {}) {
  const capture = captureOverride ?? readJson("nfl", "schedule", "latest.json");
  if (!capture?.rows?.length) {
    return {
      sport: "nfl", competitionLabel: "NFL", seasonContext: "2026 preseason window",
      coverage: "SCHEDULE_ONLY",
      sourceVerdict: {
        sourceId: null, configured: false, fetchedAt: null, freshness: "UNKNOWN",
        blocker: "No NFL schedule capture exists. The capture script (ESPN public scoreboard, no key) is the receipt path; run it to publish the window.",
      },
      events: [], quarantined: [],
    };
  }
  const quarantined = [];
  const seasonLabel = { 1: "2026 preseason", 2: "2026 regular season", 3: "2026-27 postseason" };
  const events = capture.rows
    .filter((r) => Date.parse(r.dateUtc) > Date.parse(nowIso))
    .map((r) => toEvent(() => ({
      schemaVersion: SCHEDULE_CONTRACT_VERSION,
      sport: "nfl", competition: "nfl", season: "2026",
      providerEventId: String(r.providerEventId),
      canonicalEventId: canonicalEventId({ sport: "nfl", competition: "nfl", dateEt: dateEtOf(r.dateUtc), providerEventId: String(r.providerEventId) }),
      scheduledStartUtc: r.dateUtc,
      // ESPN's "STATUS_SCHEDULED" style → the closed taxonomy via the nfl map; unmapped → UNKNOWN.
      status: normalizeEventStatus("nfl", String(r.statusRaw ?? "").replace(/^status_/i, "").toLowerCase()),
      competitors: { home: { id: r.home?.abbr ?? r.home?.name, name: r.home?.name }, away: { id: r.away?.abbr ?? r.away?.name, name: r.away?.name } },
      venue: r.venue ?? null,
      fetchedAt: capture.generatedAt, sourceAsOf: capture.generatedAt,
      provenance: `nfl/schedule/latest.json (${capture.source?.name ?? "committed capture"})`,
    }), quarantined))
    .filter(Boolean)
    .filter((e) => e.status !== "UNKNOWN");
  const types = [...new Set(capture.rows.map((r) => r.seasonType))];
  return {
    sport: "nfl", competitionLabel: "NFL",
    seasonContext: types.length === 1 ? (seasonLabel[types[0]] ?? "2026 season") : "2026 season",
    coverage: "SCHEDULE_ONLY",
    sourceVerdict: {
      sourceId: "espn_scoreboard", configured: true, fetchedAt: capture.generatedAt,
      freshness: classifySnapshotFreshness({ fetchedAt: capture.generatedAt, nowIso, freshWindowHours: 7 * 24 }),
      blocker: null,
    },
    events, quarantined,
  };
}

/**
 * NBA — ESPN public-scoreboard captures (scripts/nba/capture-nba-schedule.mjs). Only genuinely
 * published events exist in the artifact, and the section says so: a partial official calendar
 * renders as partial, never as the season. The stale June market probe stopped being a display
 * source 2026-08-09 (the probe file stays on disk as research history).
 */
export function nbaUpcoming({ nowIso, capture: captureOverride } = {}) {
  const capture = captureOverride ?? readJson("nba", "schedule", "latest.json");
  if (!capture?.rows?.length) {
    return {
      sport: "nba", competitionLabel: "NBA", seasonContext: "off-season — 2026-27 schedule not yet published",
      coverage: "OFF_SEASON",
      sourceVerdict: {
        sourceId: null, configured: false, fetchedAt: null, freshness: "UNKNOWN",
        blocker: "No NBA schedule capture exists. The capture script (ESPN public scoreboard, no key) publishes confirmed events as the league releases them.",
      },
      events: [], quarantined: [],
    };
  }
  const quarantined = [];
  const events = capture.rows
    .filter((r) => Date.parse(r.dateUtc) > Date.parse(nowIso))
    .map((r) => toEvent(() => ({
      schemaVersion: SCHEDULE_CONTRACT_VERSION,
      sport: "nba", competition: "nba", season: "2026-27",
      providerEventId: String(r.providerEventId),
      canonicalEventId: canonicalEventId({ sport: "nba", competition: "nba", dateEt: dateEtOf(r.dateUtc), providerEventId: String(r.providerEventId) }),
      scheduledStartUtc: r.dateUtc,
      status: normalizeEventStatus("nba", String(r.statusRaw ?? "").replace(/^status_/i, "").toLowerCase()),
      competitors: { home: { id: r.home?.abbr ?? r.home?.name, name: r.home?.name }, away: { id: r.away?.abbr ?? r.away?.name, name: r.away?.name } },
      venue: r.neutralSite && r.venue ? `${r.venue} (neutral site)` : r.venue ?? null,
      fetchedAt: capture.generatedAt, sourceAsOf: capture.generatedAt,
      provenance: `nba/schedule/latest.json (${capture.source?.name ?? "committed capture"})`,
    }), quarantined))
    .filter(Boolean)
    .filter((e) => e.status !== "UNKNOWN")
    .sort((a, b) => a.scheduledStartUtc.localeCompare(b.scheduledStartUtc));
  const DISPLAY_CAP = 12;
  const firstDate = events[0] ? dateEtOf(events[0].scheduledStartUtc) : null;
  return {
    sport: "nba", competitionLabel: "NBA",
    seasonContext: `2026-27 — confirmed events only (full schedule not yet published)${firstDate ? `; first game ${firstDate}` : ""}`,
    coverage: "SCHEDULE_ONLY",
    sourceVerdict: {
      sourceId: "espn_scoreboard", configured: true, fetchedAt: capture.generatedAt,
      freshness: classifySnapshotFreshness({ fetchedAt: capture.generatedAt, nowIso, freshWindowHours: 7 * 24 }),
      blocker: null,
    },
    events: events.slice(0, DISPLAY_CAP),
    totals: { captured: capture.rows.length, upcoming: events.length, shown: Math.min(DISPLAY_CAP, events.length) },
    quarantined,
  };
}

/**
 * UFC — forward cards + bouts from the ESPN MMA capture (scripts/ufc/capture-ufc-events.mjs).
 * Contract events are BOUTS (red/blue is the contract's own UFC scheme); each carries its parent
 * card's name as display context. The settled archive remains a separate RESULT store and is
 * never rendered as upcoming — that separation is guard-pinned.
 */
export function ufcUpcoming({ nowIso, capture: captureOverride } = {}) {
  const capture = captureOverride ?? readJson("ufc", "schedule", "latest.json");
  if (!capture?.bouts?.length) {
    const archive = readJson("ufc", "expanded-projections-latest.json");
    return {
      sport: "ufc", competitionLabel: "UFC", seasonContext: "next event not yet in our data",
      coverage: "SCHEDULE_ONLY",
      sourceVerdict: {
        sourceId: null, configured: false, fetchedAt: null, freshness: "UNKNOWN",
        blocker: `No forward UFC capture exists. The settled archive (${archive?.eventName ?? "one card"}, ${String(archive?.eventDate ?? "").slice(0, 10)}) is preserved separately as a result and is deliberately NOT shown here as an upcoming event.`,
      },
      events: [], quarantined: [],
    };
  }
  const quarantined = [];
  const cardName = Object.fromEntries((capture.events ?? []).map((e) => [e.providerEventId, e.name]));
  const cardVenue = Object.fromEntries((capture.events ?? []).map((e) => [e.providerEventId, e.venue]));
  const events = capture.bouts
    .filter((b) => Date.parse(b.dateUtc) > Date.parse(nowIso))
    .map((b) => toEvent(() => ({
      schemaVersion: SCHEDULE_CONTRACT_VERSION,
      sport: "ufc", competition: "ufc", season: "2026",
      providerEventId: String(b.providerBoutId),
      canonicalEventId: canonicalEventId({ sport: "ufc", competition: "ufc", dateEt: dateEtOf(b.dateUtc), providerEventId: String(b.providerBoutId) }),
      scheduledStartUtc: b.dateUtc,
      status: normalizeEventStatus("ufc", String(b.statusRaw ?? "").replace(/^status_/i, "").toLowerCase()),
      competitors: { red: { id: b.redProviderId ?? b.red, name: b.red }, blue: { id: b.blueProviderId ?? b.blue, name: b.blue } },
      venue: cardVenue[b.eventProviderId] ?? null,
      context: [cardName[b.eventProviderId], b.weightClass].filter(Boolean).join(" · ") || null,
      fetchedAt: capture.generatedAt, sourceAsOf: capture.generatedAt,
      provenance: `ufc/schedule/latest.json (${capture.source?.name ?? "committed capture"})`,
    }), quarantined))
    .filter(Boolean)
    .filter((e) => e.status !== "UNKNOWN")
    .sort((a, b) => a.scheduledStartUtc.localeCompare(b.scheduledStartUtc));
  const DISPLAY_CAP = 12;
  return {
    sport: "ufc", competitionLabel: "UFC",
    seasonContext: `${(capture.events ?? []).length} cards captured in the ${capture.windowDays}-day window`,
    coverage: "SCHEDULE_ONLY",
    sourceVerdict: {
      sourceId: "espn_scoreboard", configured: true, fetchedAt: capture.generatedAt,
      freshness: classifySnapshotFreshness({ fetchedAt: capture.generatedAt, nowIso, freshWindowHours: 7 * 24 }),
      blocker: null,
    },
    events: events.slice(0, DISPLAY_CAP),
    totals: { captured: capture.bouts.length, upcoming: events.length, shown: Math.min(DISPLAY_CAP, events.length) },
    quarantined,
  };
}

/** All four, in display order — the single entry point the page and the discovery strip use. */
export function allUpcoming({ nowIso }) {
  return [eplUpcoming({ nowIso }), nflUpcoming({ nowIso }), nbaUpcoming({ nowIso }), ufcUpcoming({ nowIso })];
}
