/**
 * /nfl/builder — NFL Bank Builder and Moonshot SCENARIOS (founder directive 2026-11-15, P3/P4), evidence-first.
 * Built at export time by lib/sports/nfl/builder-inputs.mjs (shared with scripts/nfl/audit-leg-screen.mjs):
 *   - LINES follow the canonical rule, per game: line-display-open.mjs nflOpenLineRecords (switch on AND a readable line
 *     artifact) → nflEvidenceLines at the build instant — the same line, book, price row and capture time the game
 *     page's line section shows. A game whose rule is closed supplies no leg and no refusal row; the board's offer
 *     slot is never read.
 *   - only an OFFICIAL projection (PUBLISHED family, not an estimate, as the game page prints it) is a candidate.
 * With every game closed (every build without the display key) the page carries no line, price, book or record
 * wording at all (builder-rendered.test.mjs, scenario-builder.test.mjs). Only legs that pass ship to the browser.
 * NOINDEX until a slate actually yields qualifying legs and the founder clears the page for discovery.
 */
import Link from "next/link";

import ScenarioBuilder, { type ScreenedLeg } from "@/components/products/scenario-builder";
import { loadBuilderSlate } from "@/lib/sports/nfl/builder-inputs.mjs";
import { buildAsOfIso } from "@/lib/build-asof";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/nfl/builder/", {
  title: "NFL Bank Builder and Moonshot scenarios · GameTime Picks",
  description: "Evidence-first NFL parlay scenarios from the official projections and each player's recent games.",
  robots: { index: false, follow: true },
});

function load() {
  const { candidates, screen: r, slate, openGames } = loadBuilderSlate({ now: buildAsOfIso() });
  /* ship only what the card prints: no game logs, no refused legs */
  const legs = r.passed.map((l: any) => ({ playerId: l.playerId, name: l.name, team: l.team, eventId: l.eventId, kickoffUtc: l.kickoffUtc, family: l.family, side: l.side, line: l.line, tier: l.tier, decimal: l.decimal, probability: l.probability })) as ScreenedLeg[];
  return { legs, candidates: candidates.length, refusedBy: r.reasons as Record<string, number>, slate, openGames };
}

export default function NflBuilderPage() {
  const { legs, candidates, refusedBy, slate, openGames } = load();
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12" style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 18 }}>
      <div>
        <p style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: 0 }}>NFL · Scenarios</p>
        <h1 style={{ fontSize: 26, margin: "4px 0 6px", color: "var(--vault-text)" }}>Bank Builder and Moonshot, built from evidence</h1>
        {openGames ? (
          <p style={{ fontSize: 14, color: "var(--vault-text-mute)", margin: 0, maxWidth: 720 }}>
            Pick a starting amount and a goal. A leg is used only if it has a real sportsbook line captured before kickoff (the line each game page
            shows), went 5 for 5 against that line in the player&apos;s last five complete games (4 for 5 only to fill), the player is not ruled out on the
            injury report, the projection is official, and the market is qualified for products. Anytime touchdown is not used: it has no over/under line. A 5 for 5 is a ranking from history, not a probability or a guarantee.{" "}
            {openGames} of {slate} upcoming games checked.
          </p>
        ) : (
          <p style={{ fontSize: 14, color: "var(--vault-text-mute)", margin: 0, maxWidth: 720 }} data-builder-state="UNAVAILABLE">
            {slate ? "Scenarios are not available for this slate." : "No upcoming NFL boards right now."} Each player&apos;s recent games are on NFL Trends.
          </p>
        )}
      </div>
      {openGames ? (
        <>
          <ScenarioBuilder product="bankBuilder" legs={legs} candidates={candidates} refusedBy={refusedBy} asOf="slate" />
          <ScenarioBuilder product="moonshot" legs={legs} candidates={candidates} refusedBy={refusedBy} asOf="slate" />
        </>
      ) : null}
      <p style={{ fontSize: 12.5, color: "var(--vault-text-faint)", margin: 0 }}>
        <Link href="/nfl/trends/">See each player&apos;s games on NFL Trends</Link> · <Link href="/responsible-use/">Responsible use</Link>
      </p>
    </div>
  );
}
