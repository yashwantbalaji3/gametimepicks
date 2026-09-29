/**
 * /sports — Upcoming Sports schedules (Program 148 · Release B).
 *
 * HISTORY, deliberately kept: the 2026-07-30 public-route audit RETIRED this route to a redirect
 * because a directory of equal sport tiles beside one FULL_MODEL sport overstated coverage no
 * matter how carefully each tile was gated. This revival is the founder-directed Release B design
 * that removes the overstatement instead of the page: every sport section states its coverage in
 * words ("Schedule only — not modelled"), names its source and capture time or the exact blocker,
 * renders no liveness chips, and closes with an explicit no-model/no-picks line. The guards that
 * pinned the stub (product-reset-phase-a, slate-liveness) are REPOINTED to those wordings — the
 * invariant they protect (no overstated coverage, no false liveness) is unchanged and now enforced
 * against rendered text rather than against the route's absence.
 *
 * Data path: build-time adapters over COMMITTED artifacts only (no network). Freshness words are
 * computed against the build instant; capture timestamps render as absolute dates so nothing rots.
 * MLB is deliberately NOT listed here — it has a full Simulation Center at /mlb and linking it from
 * a schedule-only directory would understate it exactly as the old page overstated the others.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { allUpcoming, resultsTrackingNote } from "@/lib/sports/upcoming/adapters.mjs";
import { UpcomingSportsSections, type SportSchedule } from "@/components/sports/upcoming-sports";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import path from "node:path";
import { buildProductDays, buildSportToday, crossSportToday } from "@/lib/product-day/product-day";
import { currentEtDate } from "@/lib/freshness";
import { getSportIdentity } from "@/lib/sport-identity";

/*
 * #797 PR B · THE SPORTS PRIMARY IS A SWITCHER FIRST. "Sports" is one of the five primaries on every nav
 * surface, and it opened on a paragraph with the four hubs as inline links and a raw schedule list — a
 * reader who tapped "Sports" to change sport had to read to find the choice. The four hubs now lead, each
 * with one ABSOLUTE fact from the existing owners (a dated count or the next dated event) — never "today"
 * or "live", which a static page would carry past its day.
 */
const HUBS = [
  { sport: "nfl", label: "NFL", href: "/nfl/", unit: "game" },
  { sport: "mlb", label: "MLB", href: "/mlb/", unit: "game" },
  { sport: "epl", label: "Premier League", href: "/epl/", unit: "match", identity: "world_cup" },
  { sport: "ufc", label: "UFC", href: "/ufc/", unit: "bout" },
] as const;
const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
const etDayLabel = (isoOrDay: string) => ET_DAY.format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(isoOrDay) ? `${isoOrDay}T12:00:00Z` : isoOrDay));

function SportChooser() {
  const today = currentEtDate();
  const dataRoot = path.join(process.cwd(), "public", "data");
  const days = buildProductDays(dataRoot, { today });
  const across = crossSportToday(today, buildSportToday(dataRoot, { today, days }));
  return (
    <nav aria-label="Choose a sport" style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      {HUBS.map((h) => {
        const n = across.bySport.find((x) => x.sport === h.sport)?.eventsToday ?? 0;
        const next = days.find((d) => d.sport === h.sport)?.nextEventUtc ?? null;
        const fact = n > 0 ? `${n} ${h.unit}${n === 1 ? "" : "s"} · ${etDayLabel(today)}`
          : next && Date.parse(next) > Date.now() ? `Next: ${etDayLabel(next)}`
          : "No scheduled events";
        const id = getSportIdentity("identity" in h ? h.identity : h.sport);
        return (
          <Link key={h.sport} href={h.href} className="vault-press" style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 72, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--vault-border-strong)", background: "var(--gtp-card)", textDecoration: "none" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--vault-text)" }}><span aria-hidden>{id.icon}</span> {h.label}</span>
            <span className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>{fact}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export const metadata: Metadata = withRouteMetadata("/sports/", {
  title: "Upcoming Sports — Schedules · GameTime Picks",
  description:
    "Premier League, NFL, NBA and UFC schedule status — what data exists, where it comes from, and what is honestly not published yet. MLB, NFL, EPL and UFC are modelled on their own hubs; NBA carries schedules only.",
});

export default function UpcomingSportsPage() {
  const sports = (allUpcoming({ nowIso: new Date().toISOString() }) as SportSchedule[])
    .map((s) => ({ ...s, resultsNote: resultsTrackingNote(s.sport) }));
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px 64px" }}>
      <h1 style={{ margin: 0, fontSize: 26 }}>Sports</h1>
      <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--vault-text-mute)" }}>Choose a sport — each hub has its games, predictions and simulations.</p>
      <SportChooser />
      <h2 style={{ margin: "34px 0 0", fontSize: 18 }}>Schedules and coverage status</h2>
      <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-dim, var(--text-mute))", maxWidth: 640 }}>
        Four sports we track toward coverage. Each section says exactly what exists today — the
        schedule source, when it was captured, or the specific reason nothing is published yet.
        The{" "}
        <Link href="/mlb/" style={{ color: "var(--vault-gold)" }}>MLB Simulation Center</Link> is the
        most fully modelled sport. The{" "}
        <Link href="/nfl/" style={{ color: "var(--vault-gold)" }}>NFL</Link>,{" "}
        <Link href="/epl/" style={{ color: "var(--vault-gold)" }}>Premier League</Link> and{" "}
        <Link href="/ufc/" style={{ color: "var(--vault-gold)" }}>UFC</Link> hubs each state what
        they publish and how experimental it is. NBA carries schedules only, and each section below
        names the specific blocker rather than promising a date.
      </p>
      <div style={{ marginTop: 24 }}>
        <UpcomingSportsSections sports={sports} />
      </div>
    </div>
  );
}
