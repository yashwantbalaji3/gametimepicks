/**
 * /results/picks/ligue-1 — the Ligue 1 forecast record (Batch 1 · #7).
 *
 * The Ligue 1 hub showed its graded record ("45 matches graded") while /results/picks had no Ligue 1 page and no index
 * row. This page publishes the SAME record, from the same committed artifact the hub reads
 * (public/data/soccer/ligue-1/results/graded.json, through lib/sports/soccer/league-cross-site.mjs leagueRecord):
 * each match graded once, against the last forecast published before kick-off, from the official final score.
 *
 * It is its own route rather than a fifth /results/picks/[sport] param because the record is a different kind of
 * thing: graded.json scores the win/draw/win PROBABILITIES by log loss and records no pick, so there is no hit/miss
 * count to print — and none is invented here. Over 2.5, both teams to score and scorelines are published on the hub but
 * NOT graded (a founder rule decision is pending); the page says so in plain words.
 */
import type { Metadata } from "next";
import Link from "next/link";

import SectionHeader from "@/components/section-header";
import { loadLeagueGraded } from "@/lib/sports/soccer/forecast-view";
import { gradedCaption } from "@/lib/sports/soccer/grading.mjs";
import { leagueRecord } from "@/lib/sports/soccer/league-cross-site.mjs";
import { PICK_SPORTS } from "@/lib/sports/graded-picks-loader";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

const OTHER_RECORDS: Record<string, string> = { mlb: "MLB", nfl: "NFL", ufc: "UFC", epl: "Premier League" };

export function generateMetadata(): Metadata {
  const rec = leagueRecord(loadLeagueGraded("ligue-1"));
  return withRouteMetadata("/results/picks/ligue-1/", {
    title: "Ligue 1 — Picks vs Outcomes · GameTime Picks",
    description: rec && rec.matches > 0
      ? `${rec.matches} Ligue 1 win/draw/win forecasts graded against official final scores. Model-only forecasts for research and entertainment — not betting advice.`
      : "Ligue 1 win/draw/win forecasts graded against official final scores. Nothing has been graded yet.",
  });
}

const pct = (p: number | null) => (p == null ? "—" : `${(p * 100).toFixed(1)}%`);
const dayLabel = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");

export default function Ligue1RecordPage() {
  const rec = leagueRecord(loadLeagueGraded("ligue-1"));
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6">
      <SectionHeader
        as="h1"
        eyebrow="Track record · Ligue 1"
        title="Picks vs outcomes"
        sub="Every Ligue 1 win/draw/win forecast that has since been graded against the official final score. Model-only forecasts for research and entertainment — not betting advice, and no stake is filled in anywhere on this site."
      />

      <section aria-labelledby="l1-what" className="mt-5">
        <h2 id="l1-what" style={{ margin: 0, fontSize: 15, color: "var(--vault-text)" }}>What is graded</h2>
        <p data-l1-scope="" style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "var(--vault-text-mute)", maxWidth: "75ch" }}>
          Only the win/draw/win forecast is graded. Each match is graded once, against the last forecast published before
          kick-off, by log loss — how much probability the forecast gave the result that happened. Over 2.5, both teams to
          score and the likeliest score are published on the hub but are not graded yet: the rule for grading them has not
          been decided, so no record is shown for them.
        </p>
      </section>

      {rec && rec.matches > 0 ? (
        <>
          <p data-l1-summary="" className="mt-4" style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--vault-text)", maxWidth: "75ch" }}>
            {rec.matches} {rec.matches === 1 ? "match" : "matches"} graded · average log loss {rec.logLoss ?? "—"} (a one-in-three guess scores {rec.uniformLogLoss ?? "—"}) — {gradedCaption({ matches: rec.matches, sampleState: rec.sampleState })}.
          </p>
          <p className="mt-1" style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--vault-text-faint)", maxWidth: "75ch" }}>
            Lower log loss is better. These forecasts publish probabilities, not picks, so there is no hit-or-miss count here.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: "var(--vault-text-faint)", textAlign: "left" }}>
                  <th scope="col" className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Date (ET)</th>
                  <th scope="col" className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Match</th>
                  <th scope="col" className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Final</th>
                  <th scope="col" className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Result</th>
                  <th scope="col" className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Forecast gave the result</th>
                  <th scope="col" className="font-mono py-1" style={{ fontWeight: 500, fontSize: 10.5 }}>Log loss</th>
                </tr>
              </thead>
              <tbody>
                {rec.rows.map((r) => (
                  <tr key={r.eventId} data-l1-row={r.eventId} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                    <td className="font-mono py-2 pr-3" style={{ whiteSpace: "nowrap" }}>{dayLabel(r.when)}</td>
                    <td className="py-2 pr-3" style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{r.matchup}</td>
                    <td className="font-mono py-2 pr-3">{r.score}</td>
                    <td className="py-2 pr-3" style={{ color: "var(--vault-text-mute)" }}>{r.result ?? "—"}</td>
                    <td className="font-mono py-2 pr-3">{pct(r.probabilityOfResult)}</td>
                    <td className="font-mono py-2" style={{ color: "var(--vault-text-mute)" }}>{r.logLoss ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="mt-4" style={{ fontSize: 13, lineHeight: 1.7, color: "var(--vault-text-mute)" }}>
          No Ligue 1 forecast has been graded yet, so there is no record to show — which is a different thing from a record
          of nothing. Each match is graded once its official final score is recorded.
        </p>
      )}

      <nav className="mt-6 flex flex-wrap gap-3" style={{ fontSize: 12.5 }}>
        <Link href="/soccer/ligue-1/" className="gtp-backlink" style={{ color: "var(--gtp-bank-heat)" }}>← Ligue 1 hub</Link>
        <Link href="/results/picks/" style={{ color: "var(--vault-text-mute)" }}>Every sport&rsquo;s record →</Link>
        {PICK_SPORTS.map((s) => (
          <Link key={s} href={`/results/picks/${s}/`} style={{ color: "var(--vault-text-mute)" }}>{OTHER_RECORDS[s] ?? s} record →</Link>
        ))}
        <Link href="/methodology" style={{ color: "var(--vault-text-mute)" }}>How everything is graded → Methodology</Link>
      </nav>
    </div>
  );
}
