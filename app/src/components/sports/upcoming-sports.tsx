/**
 * Upcoming Sports — ONE shared presentation for every non-MLB sport's schedule surface
 * (Program 148 · Release B).
 *
 * Consumes the normalized adapter shape (Release A contract events + sourceVerdict) and NOTHING
 * provider-specific. Honesty rules, in rendered words rather than convention:
 *   - coverage state is written out per sport ("Schedule only — not modelled") so no tile can read
 *     as an equal peer of the MLB Simulation Center — the exact overstatement that retired the old
 *     /sports directory in the 2026-07-30 route audit;
 *   - capture timestamps are ABSOLUTE (a relative "2h ago" baked at build time rots; "Jun 10, 2026"
 *     cannot lie later);
 *   - a sport with no data says why in the adapter's own blocker words — never an empty calendar
 *     pretending to be complete, never a spinner;
 *   - no liveness chips of any kind — there is no chip to date-gate, which is the structural fix.
 */
import Link from "next/link";

const ET_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });
const etDate = (iso: string | null | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? ET_DATE.format(new Date(t)) : null; };
const etDateTime = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? `${ET_DATE.format(new Date(t))} · ${ET_TIME.format(new Date(t))} ET` : "time unavailable"; };

/** Contract event as the adapters emit it (subset the presentation needs). */
export interface UpcomingEvent {
  canonicalEventId: string;
  scheduledStartUtc: string;
  status: string;
  competitors: { home?: { name?: string; id?: string }; away?: { name?: string; id?: string }; red?: { name?: string; id?: string }; blue?: { name?: string; id?: string } };
  venue?: string | null;
  /** Display context beyond the matchup — e.g. a UFC bout's parent card + weight class. */
  context?: string | null;
}

export interface SportSchedule {
  /** Optional results-tracking sentence derived from the results capture artifact's own state. */
  resultsNote?: string | null;
  sport: string;
  competitionLabel: string;
  seasonContext: string;
  coverage: string;
  sourceVerdict: { sourceId: string | null; configured: boolean; fetchedAt: string | null; freshness: string; blocker: string | null };
  events: UpcomingEvent[];
  /** Present when the adapter windows a larger capture — rendered so truncation is never silent. */
  totals?: { captured: number; upcoming: number; shown: number };
}

/** Registry source ids → public display names (a slug on a public page reads as a leak, not a label). */
const SOURCE_DISPLAY: Record<string, string> = {
  odds_api: "The Odds API",
  mlb_statsapi: "MLB StatsAPI",
  espn_cdn: "ESPN public data",
  espn_scoreboard: "ESPN public scoreboard",
  api_football: "API-Football",
  openfootball: "openfootball (public domain)",
  "committed-fixture-capture": "committed fixture capture",
};

/** Sports with their own hub, so a schedule section can point at what actually publishes. */
const SPORT_HUB: Record<string, string> = { ufc: "/ufc/", nfl: "/nfl/", epl: "/epl/" };

/** Coverage state → rendered words. State is carried by TEXT; color never carries meaning alone. */
const COVERAGE_WORDS: Record<string, string> = {
  SCHEDULE_ONLY: "Schedule only — not modelled",
  OFF_SEASON: "Off-season",
  SOURCE_STALE: "Source stale",
  DATA_READY: "Data ready — not modelled",
  SHADOW_MODEL: "Internal research only",
};

function competitorsLine(e: UpcomingEvent): string {
  const c = e.competitors ?? {};
  if (c.away?.name && c.home?.name) return `${c.away.name} at ${c.home.name}`;
  if (c.red?.name && c.blue?.name) return `${c.red.name} vs ${c.blue.name}`;
  return "participants unavailable";
}

/** One sport's section — anchor id = sport key, so /sports#epl deep-links. */
export function UpcomingSportSection({ s }: { s: SportSchedule }) {
  const captured = etDate(s.sourceVerdict.fetchedAt);
  return (
    <section
      id={s.sport}
      aria-labelledby={`upcoming-${s.sport}-h`}
      style={{ border: "1px solid var(--vault-border)", borderRadius: 14, padding: "18px 20px", background: "var(--vault-panel)" }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 14px" }}>
        <h2 id={`upcoming-${s.sport}-h`} style={{ margin: 0, fontSize: 17, letterSpacing: "0.01em" }}>{s.competitionLabel}</h2>
        <span style={{ fontSize: 12, color: "var(--text-mute)" }}>{s.seasonContext}</span>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-mute)", border: "1px solid var(--vault-border-strong)", borderRadius: 999, padding: "2px 10px" }}>
          {COVERAGE_WORDS[s.coverage] ?? s.coverage}
        </span>
      </div>

      <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--text-mute)" }}>
        {s.sourceVerdict.configured && s.sourceVerdict.fetchedAt
          ? <>Source: {SOURCE_DISPLAY[s.sourceVerdict.sourceId ?? ""] ?? s.sourceVerdict.sourceId} · captured {captured}{s.sourceVerdict.freshness === "STALE" ? " · stale snapshot" : ""}</>
          : <>No approved schedule source is configured for this sport yet.</>}
      </p>

      {s.totals && s.totals.upcoming > s.totals.shown ? (
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-mute)" }}>
          Showing the next {s.totals.shown} of {s.totals.upcoming} upcoming events ({s.totals.captured} in this capture).
        </p>
      ) : null}

      {s.events.length > 0 ? (
        <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 10 }}>
          {s.events.map((e) => (
            <li key={e.canonicalEventId} style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "baseline", borderTop: "1px solid var(--vault-border)", paddingTop: 10 }}>
              <span style={{ fontSize: 14 }}>{competitorsLine(e)}</span>
              <span style={{ fontSize: 12.5, color: "var(--text-mute)" }}>{etDateTime(e.scheduledStartUtc)}</span>
              {e.status !== "SCHEDULED" ? <span style={{ fontSize: 11, color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{e.status.toLowerCase()}</span> : null}
              {e.venue ? <span style={{ fontSize: 12, color: "var(--text-mute)" }}>{e.venue}</span> : null}
              {e.context ? <span style={{ fontSize: 11.5, color: "var(--text-mute)", fontStyle: "italic" }}>{e.context}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: "12px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "var(--text-dim, var(--text-mute))" }}>
          No upcoming events are published here yet. {s.sourceVerdict.blocker ?? ""}
        </p>
      )}

      {s.resultsNote ? (
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--text-mute)" }}>{s.resultsNote}</p>
      ) : null}

      {/*
        P185-G · THE SENTENCE MADE A SITE-WIDE CLAIM THIS PAGE CANNOT VERIFY.

        It read "This sport has no simulations, no predictions and no picks ON THIS SITE" — and
        rendered under UFC, where /ufc publishes winner, method and finishing round for every bout
        on the next card from a model trained on 8,642 decisive bouts. Understating is the safer
        direction than overstating and it is still a contradiction between two public surfaces.

        The coverage STATE above is deliberately NOT touched. It is a gated claim — the schedule
        contract says "SIMULATION_READY and beyond require their sport-gate stages" — and promoting
        a sport past its gate from a UI release is precisely what that contract exists to prevent.
        The mismatch between UFC's gate and UFC's hub is a real finding and is raised, not papered
        over here.

        What this sentence can honestly say is what THIS PAGE contains. Where a sport has its own
        hub, the reader is sent there to see what it publishes.
      */}
      <p style={{ margin: "12px 0 0", fontSize: 11.5, color: "var(--text-mute)" }}>
        This section is the schedule only.
        {SPORT_HUB[s.sport] ? (
          <>
            {" "}What is published for this sport, if anything, is on its{" "}
            <a href={SPORT_HUB[s.sport]} style={{ color: "var(--vault-gold)" }}>
              {s.competitionLabel} hub
            </a>.
          </>
        ) : null}
      </p>
    </section>
  );
}

/** The full four-sport stack for the /sports page. */
export function UpcomingSportsSections({ sports }: { sports: SportSchedule[] }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {sports.map((s) => <UpcomingSportSection key={s.sport} s={s} />)}
    </div>
  );
}

/**
 * Restrained homepage strip — one line per sport with its status in words, linking to the
 * per-sport anchor. Deliberately quiet: the strip must never compete with the MLB spine.
 */
export function UpcomingSportsStrip({ sports }: { sports: SportSchedule[] }) {
  return (
    <nav aria-label="Upcoming sports schedules" style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 12.5 }}>
      {sports.map((s) => (
        <Link key={s.sport} href={`/sports/#${s.sport}`} style={{ color: "var(--text-mute)", textDecoration: "none", borderBottom: "1px dotted var(--vault-border-strong)" }}>
          {s.competitionLabel}: {(s.totals?.upcoming ?? s.events.length) > 0 ? `${s.totals?.upcoming ?? s.events.length} upcoming` : "schedule not yet published"}
        </Link>
      ))}
    </nav>
  );
}
