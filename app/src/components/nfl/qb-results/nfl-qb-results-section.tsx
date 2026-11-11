/**
 * The NFL game page's settled QB record (results on the QB panel, 2026-11-11): for a game whose kickoff has passed, each
 * projected QB's frozen pregame MODEL PROJECTION, the FINAL · settled actual and the grade row once it exists, under the
 * "graded against" line (#1314) — or "not graded: served version not verified" on a HOLD game. Rendered only inside the
 * GTP_NFL_TRENDS_PUBLIC branch of /nfl/game/[eventId] (default OFF). Server component.
 */
import SectionHeader from "@/components/section-header";
import TrendsResultCard from "@/components/trends/trends-results";
import type { TrendsGameResult } from "@/lib/trends/contract";

export default function NflQbResultsSection({ result }: { result: TrendsGameResult | null }) {
  if (!result) return null;
  return (
    <section aria-label="Quarterbacks: frozen projection, final and grade" data-nfl-qb-results="" style={{ marginTop: 24 }}>
      <SectionHeader eyebrow="Quarterbacks · EXPERIMENTAL" title="Frozen projection, final and grade" />
      {result.qbs.map((q) => (
        <TrendsResultCard key={q.playerId} r={{ eventId: result.eventId, kickoffUtc: result.kickoffUtc, state: result.state, gradedAgainst: result.gradedAgainst, holdText: result.holdText, qb: q }} />
      ))}
    </section>
  );
}
