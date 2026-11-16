/**
 * /nfl/builder — NFL Bank Builder and Moonshot SCENARIOS (founder directive 2026-11-15, P3/P4), evidence-first.
 * Built at export time: every candidate leg on the upcoming boards goes through the leg screen
 * (lib/sports/nfl/leg-screen.mjs); only legs that pass ship to the browser, with the exact refusal counts for the rest.
 * NOINDEX until a slate actually yields qualifying legs and the founder clears the page for discovery.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

import ScenarioBuilder, { type ScreenedLeg } from "@/components/products/scenario-builder";
import { familiesFrom, legCandidates } from "@/lib/sports/nfl/leg-candidates.mjs";
import { screenLegs } from "@/lib/sports/nfl/leg-screen.mjs";
import { readEvidenceFor } from "@/lib/sports/nfl/player-evidence-file.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/nfl/builder/", {
  title: "NFL Bank Builder and Moonshot scenarios · GameTime Picks",
  description: "Evidence-first NFL parlay scenarios: only legs with a real captured line, a complete 5-game record against it, an eligible player and a qualified market.",
  robots: { index: false, follow: true },
});

function load() {
  const read = (p: string) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
  const dir = path.join(process.cwd(), "public/data/nfl/player-board");
  const root = path.join(process.cwd(), "..");
  const boards: any[] = [];
  const evidenceByEvent: Record<string, any> = {};
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)); } catch { /* none */ }
  for (const f of files) {
    const b = read(path.join(dir, f));
    if (!b) continue;
    const ev = readEvidenceFor(root, b.providerEventId);
    if (!Object.keys(ev).length) continue;
    boards.push(b); evidenceByEvent[String(b.providerEventId)] = ev;
  }
  const families = familiesFrom(read(path.join(process.cwd(), "public/data/nfl/family-eligibility.json")));
  const cands = legCandidates({ boards, evidenceByEvent });
  const r = screenLegs(cands as any[], { families });
  /* ship only what the card prints: no game logs, no refused legs */
  const legs = r.passed.map((l: any) => ({ playerId: l.playerId, name: l.name, team: l.team, eventId: l.eventId, family: l.family, side: l.side, line: l.line, tier: l.tier, decimal: l.decimal, probability: l.probability })) as ScreenedLeg[];
  return { legs, candidates: cands.length, refusedBy: r.reasons as Record<string, number>, slate: boards.length };
}

export default function NflBuilderPage() {
  const { legs, candidates, refusedBy, slate } = load();
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12" style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 18 }}>
      <div>
        <p style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: 0 }}>NFL · Scenarios</p>
        <h1 style={{ fontSize: 26, margin: "4px 0 6px", color: "var(--vault-text)" }}>Bank Builder and Moonshot, built from evidence</h1>
        <p style={{ fontSize: 14, color: "var(--vault-text-mute)", margin: 0, maxWidth: 720 }}>
          Pick a starting amount and a goal. A leg is used only if it has a real sportsbook line captured before kickoff, went 5 for 5 against
          that line in the player&apos;s last five complete games (4 for 5 only to fill), the player is confirmed to play, and the market is qualified
          for products. A streak is history, not a probability. {slate ? `${slate} upcoming games checked.` : "No upcoming NFL boards right now."}
        </p>
      </div>
      <ScenarioBuilder product="bankBuilder" legs={legs} candidates={candidates} refusedBy={refusedBy} asOf={slate ? "slate" : null} />
      <ScenarioBuilder product="moonshot" legs={legs} candidates={candidates} refusedBy={refusedBy} asOf={slate ? "slate" : null} />
      <p style={{ fontSize: 12.5, color: "var(--vault-text-faint)", margin: 0 }}>
        {/* The "See each player's games on NFL Trends" link returns once /nfl/trends (PR #1355) is on main. */}
        <Link href="/responsible-use/">Responsible use</Link>
      </p>
    </div>
  );
}
