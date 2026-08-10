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

  return {
    sport: "epl", competitionLabel: "Premier League", seasonContext: newestReal.season ?? "2026–27",
    coverage: "SCHEDULE_ONLY",
    sourceVerdict: { sourceId: "committed-fixture-capture", configured: true, fetchedAt: newestReal.generatedAt, freshness: classifySnapshotFreshness({ fetchedAt: newestReal.generatedAt, nowIso, freshWindowHours: 7 * 24 }), blocker: null },
    events, quarantined,
  };
}

/** NFL — nothing exists, and the page says exactly that. */
export function nflUpcoming() {
  return {
    sport: "nfl", competitionLabel: "NFL", seasonContext: "2026 preseason window",
    coverage: "SCHEDULE_ONLY",
    sourceVerdict: {
      sourceId: null, configured: false, fetchedAt: null, freshness: "UNKNOWN",
      blocker: "No NFL schedule source is configured — no artifact of any kind exists. The schedule adapter is contract-ready; ingesting an approved free source is the first NFL receipt (sequenced after EPL per the roadmap).",
    },
    events: [], quarantined: [],
  };
}

/** NBA — one authorized market probe exists (2026-06-10); it is stale and the league is off-season. */
export function nbaUpcoming({ nowIso, probe: probeOverride }) {
  const probe = probeOverride ?? readJson("nba", "market-probe-latest.json");
  const quarantined = [];
  const stale = probe ? classifySnapshotFreshness({ fetchedAt: probe.generatedAt, nowIso, freshWindowHours: 48 }) : "UNKNOWN";
  const upcoming = (probe?.events ?? [])
    .filter((e) => Date.parse(e.commence) > Date.parse(nowIso))
    .map((e) => toEvent(() => ({
      schemaVersion: SCHEDULE_CONTRACT_VERSION,
      sport: "nba", competition: "nba", season: "2026-27",
      providerEventId: String(e.id),
      canonicalEventId: canonicalEventId({ sport: "nba", competition: "nba", dateEt: dateEtOf(e.commence), providerEventId: String(e.id) }),
      scheduledStartUtc: e.commence,
      status: "SCHEDULED",
      competitors: { home: { id: e.home, name: e.home }, away: { id: e.away, name: e.away } },
      fetchedAt: probe.generatedAt, sourceAsOf: probe.generatedAt,
      provenance: "nba/market-probe-latest.json (Odds API probe — authorized source, probe cadence only)",
    }), quarantined)).filter(Boolean);

  return {
    sport: "nba", competitionLabel: "NBA", seasonContext: "off-season — 2026-27 schedule not yet published",
    coverage: "OFF_SEASON",
    sourceVerdict: {
      sourceId: "odds_api", configured: true, fetchedAt: probe?.generatedAt ?? null, freshness: stale,
      blocker: stale === "FRESH" ? null : "The only NBA capture is a June market probe — stale by design during the off-season; a schedule cadence starts with the 2026-27 schedule publication.",
    },
    events: upcoming, quarantined,
  };
}

/** UFC — forward pipeline: the settled archive is a RESULT and never renders as upcoming. */
export function ufcUpcoming() {
  const archive = readJson("ufc", "expanded-projections-latest.json");
  return {
    sport: "ufc", competitionLabel: "UFC", seasonContext: "next event not yet in our data",
    coverage: "SCHEDULE_ONLY",
    sourceVerdict: {
      sourceId: null, configured: false, fetchedAt: null, freshness: "UNKNOWN",
      blocker: `No forward UFC event source is configured. The settled archive (${archive?.eventName ?? "one card"}, ${String(archive?.eventDate ?? "").slice(0, 10)}) is preserved separately as a result and is deliberately NOT shown here as an upcoming event.`,
    },
    events: [], quarantined: [],
  };
}

/** All four, in display order — the single entry point the page and the discovery strip use. */
export function allUpcoming({ nowIso }) {
  return [eplUpcoming({ nowIso }), nflUpcoming(), nbaUpcoming({ nowIso }), ufcUpcoming()];
}
