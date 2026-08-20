/**
 * SportSchedulePage — the shared hub for a sport that has a SCHEDULE but no simulation yet.
 *
 * One component serves EPL, NBA and UFC. Writing three near-identical pages is what produced the
 * drift this repository keeps closing: /nfl was a fork of /mlb, and closing that cost more than
 * building it shared would have. When one of these sports earns a model, it graduates to the real
 * hub and loses this page — the coverage line here is the thing that has to change, not the layout.
 *
 * The honesty contract, stated in rendered words rather than implied by layout:
 *   · every page says "Schedule only — simulation pending" above the fold
 *   · no projection, probability, price or pick appears anywhere on it
 *   · the source and its capture time are named, so a stale feed is visible rather than silent
 */
import Link from "next/link";
import TeamLogo from "@/components/team-logo";

type Side = { id?: string | null; name?: string | null };

export type ScheduleEvent = {
  canonicalEventId?: string;
  scheduledStartUtc?: string;
  status?: string;
  competitors?: Record<string, Side>;
};

export type SportScheduleProps = {
  /** Display name for the competition ("Premier League"). */
  title: string;
  /** One-line description of what this sport is here for. */
  blurb: string;
  /** ESPN logo namespace — omit for a sport whose participants are people, not clubs. */
  logoSport?: "nba" | "nfl" | "soccer" | "mlb";
  /** Which two competitor keys to read, in display order (home/away, or red/blue for a bout). */
  sides: [string, string];
  /** Separator between the two sides ("at" for a fixture, "vs" for a bout). */
  joiner: string;
  events: ScheduleEvent[];
  /** Where the schedule came from and when it was captured. */
  source: string;
  capturedAt?: string | null;
  /**
   * The specific reason no simulation is published — never a date, never "coming soon" on its own.
   * A reader should learn what would have to exist for this sport to be modelled.
   */
  blocker: string;
  /*
   * Does this sport PUBLISH forecasts on the page below? Default false keeps /nba and /ufc exactly
   * as they were. EPL flipped true on P185 and exposed the bug this prop fixes: the badge and the
   * "no projections are published" sentence were hardcoded, so the live page read "with model
   * forecasts ... No projections, probabilities, prices or picks are published for this sport" in a
   * single paragraph while a forecast table sat underneath it. Two contradictory claims about the
   * same page is worse than either one alone — a reader cannot tell which to believe.
   */
  forecastsPublished?: boolean;
  totalEvents?: number;
  /** This sport's accent token, so the page reads as its own place on the shared green chrome. */
  accent?: string;
};

const ET = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));

const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" })
    .format(new Date(iso));

function Participant({ side, logoSport }: { side: Side; logoSport?: SportScheduleProps["logoSport"] }) {
  const name = side?.name ?? side?.id ?? "TBD";
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {logoSport ? <TeamLogo team={side?.id ?? name} sport={logoSport} size="sm" /> : null}
      <span className="truncate" style={{ color: "var(--vault-text)", fontWeight: 600 }}>{name}</span>
    </span>
  );
}

/**
 * The day-grouped event list on its own, so a page that owns its shell (/ufc keeps a settled
 * archive) renders the SAME rows instead of a second copy that drifts away from this one.
 */
export function ScheduleList({ events, sides, joiner, logoSport, accent = "var(--vault-gold)" }: Pick<SportScheduleProps, "events" | "sides" | "joiner" | "logoSport" | "accent">) {
  const byDay = new Map<string, ScheduleEvent[]>();
  for (const e of events) {
    if (!e.scheduledStartUtc) continue;
    const k = dayKey(e.scheduledStartUtc);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const days = [...byDay.keys()].sort();
  if (days.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--vault-text-faint)", margin: 0 }}>
        No upcoming events are in the current capture. That is the feed&apos;s state, not an error on this page.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {days.map((d) => (
        <section key={d}>
          <h2 className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10, color: accent, margin: "0 0 8px" }}>
            {dayLabel(byDay.get(d)![0].scheduledStartUtc!)}
          </h2>
          <ul className="flex flex-col gap-1.5" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {byDay.get(d)!.map((e) => {
              const a = e.competitors?.[sides[0]] ?? {};
              const b = e.competitors?.[sides[1]] ?? {};
              return (
                <li key={e.canonicalEventId ?? `${d}-${a.name}-${b.name}`}
                  className="flex items-center justify-between gap-3 rounded-[12px] px-3 py-2.5 flex-wrap"
                  style={{ border: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.015)" }}>
                  <span className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Participant side={b} logoSport={logoSport} />
                    <span className="font-mono shrink-0" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>{joiner}</span>
                    <Participant side={a} logoSport={logoSport} />
                  </span>
                  <span className="font-mono shrink-0" style={{ fontSize: 10.5, color: "var(--vault-text-mute)" }}>
                    {e.scheduledStartUtc ? `${ET(e.scheduledStartUtc)} ET` : "time TBD"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function SportSchedulePage(p: SportScheduleProps) {
  const accent = p.accent ?? "var(--vault-gold)";

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px 64px" }}>
      <p className="font-mono uppercase" style={{ margin: 0, fontSize: 11, letterSpacing: "0.14em", color: "var(--vault-text-mute)" }}>
        {p.title}
      </p>
      <h1 className="font-display" style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 800 }}>Schedule</h1>

      <div className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5"
        style={{ border: "1px solid var(--vault-border)", background: "rgba(255,255,255,0.03)" }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: "var(--vault-text-faint)" }} />
        <span className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10, color: "var(--vault-text-mute)" }}>
          {p.forecastsPublished ? "Schedule + model forecasts — not validated out of sample" : "Schedule only — simulation pending"}
        </span>
      </div>

      <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.65, color: "var(--vault-text-mute)", maxWidth: 660 }}>
        {p.blurb}{p.forecastsPublished ? " " : " No projections, probabilities, prices or picks are published for this sport — this page is the schedule and nothing more. "}{p.blocker}
      </p>
      <p className="font-mono" style={{ margin: "10px 0 0", fontSize: 10.5, color: "var(--vault-text-faint)" }}>
        Source: {p.source}{p.capturedAt ? ` · captured ${ET(p.capturedAt)} ET` : ""}
        {p.totalEvents && p.totalEvents > p.events.length ? ` · showing the next ${p.events.length} of ${p.totalEvents}` : ""}
      </p>

      <div className="mt-6">
        <ScheduleList events={p.events} sides={p.sides} joiner={p.joiner} logoSport={p.logoSport} accent={accent} />
      </div>

      <p className="mt-7" style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
        The sports that are simulated today are{" "}
        <Link href="/mlb/" style={{ color: accent }}>MLB</Link> and{" "}
        <Link href="/nfl/" style={{ color: accent }}>NFL</Link>. Every sport&apos;s coverage
        state is listed on <Link href="/sports/" style={{ color: accent }}>Sports · Schedules</Link>.
      </p>
    </main>
  );
}
