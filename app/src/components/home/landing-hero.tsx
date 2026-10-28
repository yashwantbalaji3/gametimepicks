/**
 * LandingHero — the homepage's first viewport (P213 · Release A). A LAUNCHPAD, not a manifesto:
 * one short headline, one primary action (today's forecasts) and one secondary, and one derived status line. The badge stack and
 * explanatory paragraph the founder's 2026-08-26 screenshot flagged are GONE from the hero — the
 * beta/deterministic/educational framing lives on /about and /methodology, and the one global
 * educational note is the site-wide strip; repeating them here bought no comprehension and cost
 * the whole first viewport.
 *
 * Purely presentational — every figure arrives as a pre-formatted prop from the page's existing
 * canonical owners. It carries NO money and NO win–loss figure by design (see /results).
 */
import Link from "next/link";

import { SETTLED_LABELS } from "@/lib/results/settled-through.mjs";

export interface LandingHeroProps {
  /** Count of sim-ready games today (/simulate's own count). Decides the secondary action's wording only. */
  readyCount: number;
  /** Sports active this week (the Simulation Hub's primary partition; GTP-33). */
  activeSports: number;
  /** Events across every sport today (the cross-sport day owner). */
  eventsToday: number;
  /** Every sport's schedule for today is known, so eventsToday is a claim about the day. */
  eventsKnown?: boolean;
  /** The SITE's "Latest results" date (YYYY-MM-DD) — the newest day any current official record is settled through,
   *  from the one owner (lib/results/settled-through.mjs), the same date as the global header chip. */
  latestResultsDate: string | null;
}

const fmtDay = (d: string) => {
  try {
    return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  } catch {
    return d;
  }
};

/** The hero's ONE primary action: today's official forecasts, every sport, on /today (W4 · 2026-10-28). */
export const HERO_PRIMARY = Object.freeze({ label: "See today\u2019s forecasts", href: "/today" });

export default function LandingHero({ readyCount, activeSports, eventsToday, eventsKnown = false, latestResultsDate }: LandingHeroProps) {
  return (
    <section aria-label="Today's launchpad" className="flex flex-col gap-4">
      <h1
        className="font-display tracking-tight"
        style={{ color: "var(--vault-text)", fontSize: "clamp(24px,5.4vw,38px)", fontWeight: 800, lineHeight: 1.05 }}
      >
        Today&rsquo;s games, picks and results.
      </h1>

      {/* WHAT THIS SITE IS, in one sentence (P602; plain words W4 2026-10-28): the core product is an official forecast
          per game, made before the start and frozen at it. No claim beyond what ships (not every sport is graded yet). */}
      <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 13.5, lineHeight: 1.5, maxWidth: 640 }}>
        Free model forecasts for NFL, NBA, MLB, Premier League and UFC games &mdash; published before the start, frozen
        once it begins, and kept on the public record.
      </p>

      {/* W4 (2026-10-28): ONE primary action — today's official forecasts — and one secondary. The hero used to carry
          three equal buttons (Simulate / Picks → /markets / Parlay Center) and none led to the forecasts, the core
          product. Picks and the Parlay Center stay one tap away in the navigation. URLs unchanged. */}
      <div className="flex flex-wrap gap-2.5">
        <Link
          href={HERO_PRIMARY.href}
          className="vault-press inline-flex items-center justify-center rounded-full px-5 font-semibold tracking-[-0.005em]"
          style={{
            background: "var(--vault-gold-bright)",
            color: "var(--vault-on-accent-deep)",
            fontSize: 14.5,
            fontWeight: 700,
            minHeight: 44,
            textDecoration: "none",
          }}
        >
          {`${HERO_PRIMARY.label} →`}
        </Link>
        <Link
          href="/simulate"
          className="vault-press inline-flex items-center justify-center rounded-full px-5 font-semibold tracking-[-0.005em]"
          style={{
            border: "1px solid var(--vault-border-strong)",
            color: "var(--vault-text)",
            fontSize: 14.5,
            fontWeight: 700,
            minHeight: 44,
            textDecoration: "none",
          }}
        >
          {readyCount > 0 ? <>Simulate Today&rsquo;s Games</> : "Open a game simulation"}
        </Link>
      </div>

      {/* ONE derived status line — current owners only, no hand-kept counts. It used to be five micro-facts (sports,
          events, simulation-ready, top picks, "no qualified product card today"); the day's size and where the results
          are is what a first-time reader can use. 0 renders as its honest words. */}
      <p className="m-0 flex flex-wrap items-center gap-x-1.5 tabular-nums" style={{ fontSize: 13, color: "var(--vault-text-mute)" }}>
        {/* P293 → 2026-09-28. The figure is the CROSS-SPORT DAY count (lib/product-day crossSportToday: each sport's
            schedule, a game counts with or without our forecast), so it may say "today" — but only when every sport's
            schedule for today is known. While one is still loading the count is a lower bound and keeps P293's board
            wording (on 2026-09-13 a board-based "16 events today" hid 15 MLB games). */}
        <span>
          <span style={{ color: "var(--vault-text)", fontWeight: 700 }}>{eventsToday}</span>{" "}
          {eventsKnown ? (eventsToday === 1 ? "event today" : "events today") : "events on today’s board"}
          {" · "}
          <span style={{ color: "var(--vault-text)", fontWeight: 700 }}>{activeSports}</span> {activeSports === 1 ? "sport active" : "sports active"}
          {" · "}
        </span>
        <Link href="/results" className="vault-press" style={{ color: "var(--vault-success)", fontWeight: 700, textDecoration: "none", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
          {/* P0 U1: worded "Latest results", not "Settled through" — the date speaks for the newest record across
              the site, not for every ledger (each ledger's own settled-through date is on its page). */}
          {latestResultsDate ? `${SETTLED_LABELS.site} ${fmtDay(latestResultsDate)} →` : "See every settled result →"}
        </Link>
      </p>
    </section>
  );
}
