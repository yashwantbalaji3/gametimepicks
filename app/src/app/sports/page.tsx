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

export const metadata: Metadata = {
  title: "Upcoming Sports — Schedules · GameTime Picks",
  description:
    "Premier League, NFL, NBA and UFC schedule status — what data exists, where it comes from, and what is honestly not published yet. NFL and MLB are simulated; the rest are schedule information only.",
};

export default function UpcomingSportsPage() {
  const sports = (allUpcoming({ nowIso: new Date().toISOString() }) as SportSchedule[])
    .map((s) => ({ ...s, resultsNote: resultsTrackingNote(s.sport) }));
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px 64px" }}>
      <p style={{ margin: 0, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-mute)" }}>
        Upcoming sports
      </p>
      <h1 style={{ margin: "6px 0 0", fontSize: 26 }}>Schedules and coverage status</h1>
      <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-dim, var(--text-mute))", maxWidth: 640 }}>
        Four sports we track toward coverage. Each section says exactly what exists today — the
        schedule source, when it was captured, or the specific reason nothing is published yet.
        Two sports are simulated so far: the{" "}
        <Link href="/mlb/" style={{ color: "var(--vault-gold)" }}>MLB Simulation Center</Link> and the{" "}
        <Link href="/nfl/" style={{ color: "var(--vault-gold)" }}>NFL hub</Link>. Premier League, NBA
        and UFC carry schedules only — simulation for those is not published yet, and each section
        below names the specific blocker rather than promising a date.
      </p>
      <div style={{ marginTop: 24 }}>
        <UpcomingSportsSections sports={sports} />
      </div>
    </main>
  );
}
