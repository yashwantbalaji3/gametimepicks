/**
 * /results/picks/<sport> — every graded pick this sport's model has made, against what happened.
 *
 * ONE ROUTE FOR ALL FOUR SPORTS, because the question is the same one everywhere and four bespoke
 * pages would drift into four different degrees of confidence about their own numbers. What differs
 * between sports is carried on the ARTIFACT — what the picks are, and what a reader must know to
 * read them correctly — so this page states each sport's terms without composing any of them.
 *
 * EVERY DECLARED SPORT GETS A PAGE, whether or not it has graded anything yet. A hub links here
 * unconditionally, and a link into a route that does not exist is a 404 in the main navigation,
 * which is worse than an empty state. "Nothing has been graded yet" is a product state; a broken
 * link is not.
 */
import type { Metadata } from "next";
import Link from "next/link";

import SectionHeader from "@/components/section-header";
import GradedPicksSection from "@/components/sports/graded-picks-section";
import { loadGradedPicks, PICK_SPORTS } from "@/lib/sports/graded-picks-loader";

const HUBS: Record<string, { label: string; hub: string }> = {
  mlb: { label: "MLB", hub: "/mlb" },
  nfl: { label: "NFL", hub: "/nfl" },
  ufc: { label: "UFC", hub: "/ufc" },
  epl: { label: "Premier League", hub: "/epl" },
};

export function generateStaticParams() {
  return PICK_SPORTS.map((sport) => ({ sport }));
}
export const dynamicParams = false;

export function generateMetadata({ params }: { params: { sport: string } }): Metadata {
  const lane = HUBS[params.sport];
  const rec = loadGradedPicks(params.sport);
  if (!lane) return { title: "Graded picks · GameTime Picks" };
  return {
    title: `${lane.label} — Picks vs Outcomes · GameTime Picks`,
    description: rec
      ? `${rec.counts.counted.toLocaleString()} ${lane.label} predictions graded against official results. Paper-only and educational — nothing here is a pick or a recommendation to wager.`
      : `${lane.label} predictions graded against official results. Nothing has been graded yet.`,
  };
}

export default function GradedPicksPage({ params }: { params: { sport: string } }) {
  const lane = HUBS[params.sport];
  if (!lane) return null;                 // dynamicParams=false makes this unreachable
  const record = loadGradedPicks(params.sport);

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6">
      <SectionHeader
        as="h1"
        eyebrow={`Track record · ${lane.label}`}
        title="Picks vs outcomes"
        sub="Every prediction this model has made that has since been graded against an official result. Paper-only and educational — nothing here is a pick or a recommendation to wager, and no stake is filled in anywhere on this site."
      />

      {record ? (
        <>
          <GradedPicksSection record={record} rows={record.picks.length} href={lane.hub} />
          <p className="mt-4" style={{ fontSize: 12, lineHeight: 1.7, color: "var(--vault-text-faint)" }}>
            {/*
              The one thing a reader must not take from a hit rate. Being right more often than not
              is not the same as being right more often than the price implies — the second is the
              only claim that would mean anything about a market, and it is measured separately, per
              sport, against a de-vigged line.
            */}
            A hit rate is not a claim about a sportsbook. Being right more often than not and being right
            more often than the posted price implies are different things, and only the second would say
            anything about a market. That comparison is tracked separately for each sport and has cleared
            nothing here.
          </p>
        </>
      ) : (
        <p className="mt-4" style={{ fontSize: 13, lineHeight: 1.7, color: "var(--vault-text-mute)" }}>
          {/* Absent, not zero. */}
          No {lane.label} prediction has been graded yet, so there is no record to show — which is a
          different thing from a record of nothing. Predictions are graded once the official result is
          published, and this page fills in from that point.
        </p>
      )}

      <nav className="mt-6 flex flex-wrap gap-3" style={{ fontSize: 12.5 }}>
        <Link href={lane.hub} style={{ color: "var(--gtp-bank-cta)" }}>← {lane.label} hub</Link>
        {PICK_SPORTS.filter((s) => s !== params.sport).map((s) => (
          <Link key={s} href={`/results/picks/${s}`} style={{ color: "var(--vault-text-mute)" }}>
            {HUBS[s].label} record →
          </Link>
        ))}
        <Link href="/methodology" style={{ color: "var(--vault-text-mute)" }}>How everything is graded → Methodology</Link>
      </nav>
    </main>
  );
}
