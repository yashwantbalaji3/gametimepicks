/**
 * /results/picks — every sport's model record in one place.
 *
 * The per-sport pages answer "how did THIS model do". This answers the question a reader actually
 * arrives with, which is "how do these models do", and it is the only place on the site where the
 * four records sit next to each other.
 *
 * PUTTING THEM SIDE BY SIDE IS EXACTLY WHERE A COMPARISON BECOMES TEMPTING AND WRONG. The four
 * numbers are not comparable: MLB's is 32,000 player-prop projections, UFC's is six fight winners,
 * NFL's is preseason games a model that has cleared nothing was asked to call. A table that ranked
 * them by hit rate would be inventing a league table out of four different questions. So the rate
 * renders only where the sample can carry one, every row states what its picks ARE, and the sports
 * are ordered by name rather than by performance.
 */
import type { Metadata } from "next";
import Link from "next/link";

import SectionHeader from "@/components/section-header";
import { loadAllGradedPicks, loadMlbGameRecord } from "@/lib/sports/graded-picks-loader";

export const metadata: Metadata = {
  title: "Picks vs Outcomes · GameTime Picks",
  description:
    "Every prediction each sport's model has made, graded against official results. Paper-only and educational — nothing here is a pick or a recommendation to wager.",
};

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const SHOW_RATE = new Set(["ASSESSABLE", "EMERGING"]);

export default function AllGradedPicksPage() {
  const records = loadAllGradedPicks();
  const mlbGames = loadMlbGameRecord();

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6">
      <SectionHeader
        as="h1"
        eyebrow="Track record · every sport"
        title="Picks vs outcomes"
        sub="What each model predicted, and what actually happened, graded against official results. Paper-only and educational — nothing here is a pick or a recommendation to wager, and no stake is filled in anywhere on this site."
      />

      {records.length === 0 ? (
        <p className="mt-4" style={{ fontSize: 13, lineHeight: 1.7, color: "var(--vault-text-mute)" }}>
          No sport has graded a prediction yet, so there is no record to show — which is a different
          thing from a record of nothing.
        </p>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: "var(--vault-text-faint)", textAlign: "left" }}>
                  <th className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Sport</th>
                  <th className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Graded</th>
                  <th className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Hit</th>
                  <th className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Missed</th>
                  <th className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Rate</th>
                  <th className="font-mono py-1" style={{ fontWeight: 500, fontSize: 10.5 }}>What is being graded</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.sport} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                    <td className="py-2 pr-3" style={{ fontWeight: 600 }}>
                      <Link href={`/results/picks/${r.sport}`} style={{ color: "var(--gtp-bank-cta)" }}>{r.label}</Link>
                    </td>
                    <td className="font-mono py-2 pr-3">{r.counts.counted.toLocaleString()}</td>
                    <td className="font-mono py-2 pr-3">{r.counts.hits.toLocaleString()}</td>
                    <td className="font-mono py-2 pr-3">{r.counts.misses.toLocaleString()}</td>
                    <td className="font-mono py-2 pr-3" style={{ color: "var(--vault-text-mute)" }}>
                      {/* A rate only where the sample can carry one. Below that the count IS the answer. */}
                      {r.hitRate != null && SHOW_RATE.has(r.sampleState) ? pct(r.hitRate) : "too few to say"}
                    </td>
                    <td className="py-2" style={{ color: "var(--vault-text-mute)", maxWidth: 420 }}>{r.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4" style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--vault-text-faint)" }}>
            {/*
              The sentence that has to be here, on the one page where the four sit together. Reading
              down this column and picking a winner is the natural thing to do and the wrong thing to
              do, and saying so is cheaper than hoping nobody does it.
            */}
            These four numbers are not comparable with each other. They come from different models
            answering different questions over samples that differ by four orders of magnitude — thousands
            of player-prop projections against a handful of fight winners — so reading down this column
            and picking a best model is not something the numbers support. Each row links to its own
            record, where what it covers is stated in full.
          </p>
          <p className="mt-2" style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--vault-text-faint)" }}>
            A hit rate is also not a claim about a sportsbook. Being right more often than not and being
            right more often than the posted price implies are different things, and only the second would
            say anything about a market. That comparison is tracked separately for each sport and has
            cleared nothing here.
          </p>

          {mlbGames ? (
            <div className="mt-6">
              <h2 className="font-mono" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: 0 }}>
                MLB · game predictions — a separate record
              </h2>
              <p className="mt-1" style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--vault-text-mute)", maxWidth: 720 }}>
                {/* Its own denominators, its own artifact; never added to the player-prop table above. */}
                Winner, total and run line for each game, graded from the newest prediction revision
                generated before first pitch:{" "}
                {Object.entries(mlbGames.families)
                  .filter(([, f]) => f.n > 0)
                  .map(([m, f]) => `${m.replace("_", " ")} ${f.wins}–${f.losses}${f.pushes ? `–${f.pushes}` : ""}`)
                  .join(" · ")}
                . Not comparable with the player-prop record above and never combined with it —{" "}
                <Link href="/results/picks/mlb" style={{ color: "var(--gtp-bank-cta)" }}>full game-level record</Link>.
              </p>
            </div>
          ) : null}
        </>
      )}

      <nav className="mt-6 flex flex-wrap gap-3" style={{ fontSize: 12.5 }}>
        <Link href="/results" style={{ color: "var(--vault-text-mute)" }}>Settled money record → Results</Link>
        <Link href="/results/parlay-lab" style={{ color: "var(--vault-text-mute)" }}>Parlay Lab record →</Link>
        <Link href="/methodology" style={{ color: "var(--vault-text-mute)" }}>How everything is graded → Methodology</Link>
      </nav>
    </main>
  );
}
