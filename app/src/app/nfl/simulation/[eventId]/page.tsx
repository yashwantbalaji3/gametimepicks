/**
 * /nfl/simulation/[eventId] — NFL Simulation V2, EXPERIMENTAL (founder P0 · 2026-10-05). PUBLIC.
 *
 * One page per game whose Simulation V2 receipt of record (the latest generated before kickoff) passes the receipt
 * validator with zero incoherent runs and at least 10,000 runs (lib/sports/nfl/sim-v2/public-receipt.mjs). A game whose
 * record fails gets no page — fail closed, never an older receipt in its place.
 *
 * SEPARATE FROM THE CANONICAL FORECAST. /nfl/game/[eventId] and its Projected Scorecard stay the Game Time Forecast and
 * keep their "expected statistical summaries · not one simulated game" label. This page is a different engine (SHADOW,
 * not promoted, not shown to be more accurate) and says so.
 *
 * ONE OFFICIAL FORECAST (founder rule, 2026-11-02). The page opens on the official panel (NflOfficialDefault), fed only by
 * the game page's accessor: winner, win chance, projected score and every official player projection, never a simulated
 * number. Everything after it is hypothetical and labelled so, and the receipt's input revision, assumptions and
 * timestamps are printed and carried in the page's JSON (sim-input-provenance.mjs). A batch built on an earlier revision
 * says so; it is never shown as current, and its historical receipt stays on disk untouched.
 * Statically generated from committed files at build time; nothing here is computed in the browser.
 */
import type { Metadata } from "next";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";

import SimulationV2Report from "@/components/nfl/simulation-v2-report";
import NflOfficialDefault from "@/components/simulation-theater/NflOfficialDefault";
import type { SimProvenance } from "@/components/nfl/simulation-provenance";
import { readShadowReceipts, showableSimulationEvents, simulationOfRecord } from "@/lib/sports/nfl/sim-v2/public-receipt.mjs";
import { nflOfficialView, nflTheaterOfficial, readNflRosterPositions } from "@/lib/simulation-theater/loader.mjs";
import { nflOfficialDefault } from "@/lib/simulation-theater/official-default.mjs";
import { simInputProvenance } from "@/lib/simulation-theater/sim-input-provenance.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { PUBLIC_TERMS } from "@/lib/public-registry";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const entries = () => readShadowReceipts(REPO_ROOT);

/**
 * SIMULATION REPLAY (Simulation Theater V2), PUBLIC BETA BEHIND A BUILD FLAG (P242 narrow exception, founder 2026-10-19;
 * docs/launch/approvals/P242_NFL_THEATER_PUBLIC_BETA_2026-10-19.md). Drive-level playback of one representative run of
 * THIS page's receipt of record, with persistent SIMULATED · DRIVE-LEVEL · MOVEMENT ILLUSTRATIVE · EXPERIMENTAL MODEL
 * labels. Default OFF: next.config.mjs defines `process.env.GTP_NFL_THEATER_PUBLIC` as "1" only when the build sets it,
 * so this `if` is a compile-time constant and, OFF, the import below is never part of the build (no theater pack, CSS
 * or island chunk in the page; public-theater-export.test.mjs checks out/). Rollback = build with the flag unset.
 * This is NOT the retired presentation-player ceremony (P242), which stays unmounted.
 * Flag ON the section opens on the official panel itself; flag OFF the page prints the same panel on its own.
 */
async function officialAndReplay(rec: NonNullable<ReturnType<typeof simulationOfRecord>>, eventId: string, gameHref: string) {
  if (process.env.GTP_NFL_THEATER_PUBLIC === "1") {
    const { default: PublicTheaterSection } = await import("@/components/simulation-theater/PublicTheaterSection");
    return <PublicTheaterSection rec={rec} />;
  }
  return <div style={{ marginTop: 20 }}><NflOfficialDefault model={nflOfficialDefault(nflOfficialView(REPO_ROOT, eventId), { positions: readNflRosterPositions(REPO_ROOT) })} gameHref={gameHref} /></div>;
}

export function generateStaticParams() {
  return showableSimulationEvents(entries()).map((eventId) => ({ eventId }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { eventId: string } }): Metadata {
  const rec = simulationOfRecord(entries(), params.eventId);
  if (!rec?.showable) return withRouteMetadata(`/nfl/simulation/${params.eventId}/`, { title: "NFL simulation · GameTime Picks" });
  const r = rec.receipt;
  return withRouteMetadata(`/nfl/simulation/${params.eventId}/`, {
    title: `${r.away.abbr} @ ${r.home.abbr} — ${PUBLIC_TERMS.GAME_SIMULATION} (Simulation V2) · GameTime Picks`,
    description: `${r.runCount.toLocaleString("en-US")} coherent simulated games of ${r.away.name} at ${r.home.name}: outcomes, quarters, team and player lines, touchdown scorers. A ${PUBLIC_TERMS.GAME_SIMULATION} from a separate engine, not the ${PUBLIC_TERMS.OFFICIAL_FORECAST}; educational and paper-only.`,
  });
}

export default async function NflSimulationV2Page({ params }: { params: { eventId: string } }) {
  const rec = simulationOfRecord(entries(), params.eventId);
  if (!rec?.showable) notFound();
  const r = rec.receipt;
  const gameHref = `/nfl/game/${params.eventId}/`;
  const official = nflTheaterOfficial(REPO_ROOT, params.eventId);
  const provenance = simInputProvenance({ receipt: r, official: official.revision, revisions: official.revisions }) as SimProvenance;
  const opening = await officialAndReplay(rec, params.eventId, gameHref);
  return (
    // overflow-x: clip (not hidden) where supported: hidden makes this shell a scroll container, which pins the
    // replay's sticky score bug to the shell instead of the viewport on phones; clip trims the same overflow without that.
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden supports-[overflow:clip]:overflow-x-clip">
      <p className="font-mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: 0 }}>
        <Link href="/nfl/">NFL</Link> · <Link href={gameHref}>{r.away.abbr} @ {r.home.abbr}</Link> · Simulation
      </p>
      <h1 className="font-display" style={{ fontSize: 30, margin: "6px 0 0", color: "var(--vault-text)" }}>
        {r.away.name} at {r.home.name}
      </h1>
      <p className="font-mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-mute)", margin: "6px 0 0" }}>
        {PUBLIC_TERMS.GAME_SIMULATION} · Hypothetical · Simulation V2 · {r.runCount.toLocaleString("en-US")} coherent game paths
      </p>
      {/* the simulation's inputs, assumptions and timestamps, machine-readable (sim-input-provenance.mjs) */}
      <script type="application/json" data-sim-provenance-json="" dangerouslySetInnerHTML={{ __html: JSON.stringify(provenance).replace(/</g, "\\u003c") }} />
      {opening}
      <SimulationV2Report r={r} provenance={provenance} gameHref={gameHref} />
    </div>
  );
}
