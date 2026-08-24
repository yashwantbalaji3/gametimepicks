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
import { loadGradedPicks, loadMlbGameRecord, PICK_SPORTS } from "@/lib/sports/graded-picks-loader";

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

const FAMILY_LABEL: Record<string, string> = { moneyline: "Winner (moneyline)", total: "Total (over/under)", run_line: "Run line" };

export default function GradedPicksPage({ params }: { params: { sport: string } }) {
  const lane = HUBS[params.sport];
  if (!lane) return null;                 // dynamicParams=false makes this unreachable
  const record = loadGradedPicks(params.sport);
  // MLB carries a SECOND record — game-level calls — kept in its own artifact with its own
  // denominators. Rendering them in one table was the specific mistake B1 exists to prevent.
  const gameRecord = params.sport === "mlb" ? loadMlbGameRecord() : null;

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

      {gameRecord ? (
        <section className="mt-8">
          <SectionHeader
            as="h2"
            eyebrow="Separate record · game level"
            title="Game predictions"
            sub={gameRecord.what}
          />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12.5, maxWidth: 720 }}>
              <thead>
                <tr style={{ color: "var(--vault-text-faint)", textAlign: "left" }}>
                  <th className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Market</th>
                  <th className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Graded</th>
                  <th className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Record</th>
                  <th className="font-mono py-1" style={{ fontWeight: 500, fontSize: 10.5 }}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(gameRecord.families).map(([market, f]) => (
                  <tr key={market} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                    <td className="py-2 pr-3" style={{ fontWeight: 600 }}>{FAMILY_LABEL[market] ?? market}</td>
                    <td className="font-mono py-2 pr-3">{f.n.toLocaleString()}</td>
                    <td className="font-mono py-2 pr-3">{f.wins}–{f.losses}{f.pushes ? `–${f.pushes} pushes` : ""}</td>
                    <td className="font-mono py-2" style={{ color: "var(--vault-text-mute)" }}>
                      {f.hitRate != null ? `${(f.hitRate * 100).toFixed(1)}%` : "no decisive sample"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Object.values(gameRecord.families).some((f) => f.note) ? (
            <p className="mt-2" style={{ fontSize: 12, lineHeight: 1.7, color: "var(--vault-text-faint)", maxWidth: 720 }}>
              {Object.values(gameRecord.families).find((f) => f.note)?.note}
            </p>
          ) : null}
          <p className="mt-2" style={{ fontSize: 12, lineHeight: 1.7, color: "var(--vault-text-faint)", maxWidth: 720 }}>
            {gameRecord.caveat} Each row is graded from the newest prediction revision generated
            <em> before that game&apos;s first pitch</em>; {gameRecord.counts.missingPreEventFinals.toLocaleString()} earlier
            game finals have no such pre-event artifact and are named as gaps rather than reconstructed.
          </p>
        </section>
      ) : null}

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
