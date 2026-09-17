/**
 * /compare — COMPARE TOOLS (v1.4). PUBLIC, indexable.
 *
 * A directory of the Team and Player Compare shells, with what each sport supports stated plainly (read from the
 * committed compare readiness receipt, never restated by hand). No data is fetched on this page.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { Eyebrow, PANEL, ResearchShell, Section } from "@/components/research-pages/research-primitives";
import { comparePath } from "@/lib/compare/contract.mjs";
import { SPORT_NAME } from "@/lib/compare/copy.mjs";
import { compareReadiness } from "@/lib/compare/compare-store";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata: Metadata = withRouteMetadata("/compare/", {
  title: "Compare teams and players | GameTimePicks",
  description: "Compare two MLB or NFL teams on recorded results and meetings, or two NFL, Premier League or MLB players on the same recorded stat, with sample sizes and coverage shown.",
});

const card: React.CSSProperties = { ...PANEL, display: "block", textDecoration: "none", color: "var(--vault-text)", minHeight: 44 };

export default function CompareHub() {
  const r = compareReadiness();
  return (
    <ResearchShell back={{ href: "/sports/", label: "Sports" }}>
      <Eyebrow>Research · Compare</Eyebrow>
      <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0" }}>Compare teams and players</h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--vault-text-mute)", maxWidth: 680, lineHeight: 1.6 }}>
        Put two teams or two players side by side on recorded facts only: the same stat, the same definition, and the number of games behind every figure. A comparison is not a forecast.
      </p>

      <Section id="compare-teams" title="Team Compare" sub="Records and points or runs from official final scores, plus recorded meetings.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {(["NFL", "MLB"] as const).map((s) => (
            <Link key={s} href={comparePath("team", s)} style={card}>
              <strong>Compare {SPORT_NAME[s]} teams →</strong>
              <span style={{ display: "block", fontSize: 12.5, color: "var(--vault-text-mute)", marginTop: 4 }}>{r.teams[s].eligible} teams</span>
            </Link>
          ))}
          <Link href={comparePath("team", "EPL")} style={card}>
            <strong>Premier League teams</strong>
            <span style={{ display: "block", fontSize: 12.5, color: "var(--vault-text-mute)", marginTop: 4 }}>Not available: final results are not yet an ID-based fact in GameTimePicks data</span>
          </Link>
        </div>
      </Section>

      <Section id="compare-players" title="Player Compare" sub="Two players on one shared recorded stat, season by season, with n shown.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {(["NFL", "EPL", "MLB"] as const).map((s) => (
            <Link key={s} href={comparePath("player", s)} style={card}>
              <strong>Compare {SPORT_NAME[s]} players →</strong>
              <span style={{ display: "block", fontSize: 12.5, color: "var(--vault-text-mute)", marginTop: 4 }}>
                {r.players[s].eligible} players · {r.players[s].comparableFamilies.length} shared-stat options{s === "MLB" ? " · captured categories only" : ""}
              </span>
            </Link>
          ))}
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)" }}>
          UFC fighters are not compared: GameTimePicks data records each bout&apos;s outcome but no comparable fight statistic. Each fighter&apos;s research page shows their recorded bouts.
        </p>
      </Section>
    </ResearchShell>
  );
}
