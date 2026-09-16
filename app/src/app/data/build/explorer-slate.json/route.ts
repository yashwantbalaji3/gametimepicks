/**
 * The Parlay Center explorer's data, emitted as a static file at build time (P257).
 *
 * `/build/custom` embedded the whole "Advanced" explorer — every eligible leg, the game-specific cards
 * and the coverage matrix — in its HTML and its client payload, inside a disclosure most readers never
 * open. The page scaled with the slate: 573KB on 373 legs (2026-09-09), 886KB on 598 (2026-09-11),
 * past its 800KB budget. The explorer now loads this file the first time the disclosure opens.
 *
 * Same loaders, same view, same coverage as the page used — only the delivery moved. Static export
 * renders this GET once at build time to out/data/build/explorer-slate.json; the client fetches that
 * literal path, which is also what keeps the post-build /data sweep from pruning it.
 */
import { loadTodaySlate, explorerSlateView } from "@/lib/parlays/ui-loader";
import { buildCoverageMatrix } from "@/lib/parlays/coverage-matrix";
import { loadMoonshotLane } from "@/lib/moonshot/moonshot-lane";
import { buildAsOfIso } from "@/lib/build-asof";

export const dynamic = "force-static";

export function GET() {
  /*
   * ONE `asOf` FOR THE WHOLE BUILD (Phase 6). This used to call `new Date()` while /build/custom
   * called its own, in a different `next build` worker — so a first pitch landing between the two
   * renders left the page stating 137 legs over an artifact carrying 177. Both now resolve the pool
   * at the build's stamped instant, and the artifact SAYS which instant, because a reader's clock
   * has moved on by the time they open it.
   */
  const asOf = buildAsOfIso();
  const slate = loadTodaySlate(undefined, asOf);
  return Response.json({
    schemaVersion: 1,
    artifact: "build-explorer-slate",
    generatedAt: asOf,
    /** The instant the eligibility gate was resolved. Clients re-check each leg's start against their own clock. */
    asOf,
    date: slate.date ?? null,
    slate: explorerSlateView(slate),
    coverage: buildCoverageMatrix(slate, loadMoonshotLane(), asOf),
  });
}
