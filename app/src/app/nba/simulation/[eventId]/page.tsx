/**
 * /nba/simulation/[eventId] — NBA Simulation Theater, PUBLIC CANDIDATE. OFF.
 *
 * Renders the possession-level Theater (research engine, labelled "not the official forecast") beside the OFFICIAL
 * PROJECTION PANEL only when BOTH deliberate acts are done (lib/simulation-theater/nba/possession/public-route.mjs):
 * NBA_THEATER_PUBLIC_ENABLED === true in a reviewed commit citing a recorded founder / release-owner decision (today
 * false — NBA public model output stays blocked by the September preregistration), AND the build sets
 * GTP_NBA_THEATER_PUBLIC=1. next.config.mjs defines `process.env.GTP_NBA_THEATER_PUBLIC` as "1" only when the build
 * sets exactly "1", else "0" (the GTP_NFL_THEATER_PUBLIC pattern), so the branches below are compile-time constants:
 * OFF, the loader, the payload and the island are never part of the build, generateStaticParams yields one inert
 * placeholder that 404s, and scripts/prune-internal-routes.mjs deletes out/nba/simulation/ and its chunks.
 * public-theater-route.test.mjs checks the source; export-boundary.mjs scans out/ (flag-ON allowlist included).
 * Statically generated from committed files at build time; the browser never reads the private research tree.
 *
 * SETTLED PAGES (overnight W7 2026-10-28; audit A #17): with the gate ON, every game of the newest committed dated lanes
 * BEFORE the build's ET date also gets a page at the same URL — the frozen Official Forecast from that date's lane file,
 * the official final and the official record's verdict, and a "Game Simulation archived" note (the replay is not kept;
 * no simulation is shown or re-run). Public committed files only (components/nba/settled-simulation-data.ts), so a
 * shared game-day link no longer dies at the ET rollover. Older links still reach the 404 tombstone.
 */
import type { Metadata } from "next";
import path from "node:path";
import { notFound } from "next/navigation";

import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { NBA_PUBLIC_THEATER_PLACEHOLDER, nbaPublicTheaterOn, nbaPublicTheaterParams } from "@/lib/simulation-theater/nba/possession/public-route.mjs";
import type { PbLoad } from "@/components/simulation-theater/nba/possession/possession-types";
import SettledSimulation from "@/components/nba/settled-simulation";
import { loadSettledSimulation, settledSimulationParams } from "@/components/nba/settled-simulation-data";
import { currentEtDate } from "@/lib/freshness";

const REPO_ROOT = path.resolve(process.cwd(), "..");
export async function generateStaticParams() {
  // the flag test is written INLINE (never behind a helper): webpack folds `"0" === "1"` only as a literal condition, which
  // is what drops the dynamic imports below from a flag-OFF build (export-boundary.test.mjs scans out/ for their markers)
  if (process.env.GTP_NBA_THEATER_PUBLIC === "1") {
    const { publicPossessionEvents } = await import("@/lib/simulation-theater/nba/possession/public-loader.mjs");
    const live = nbaPublicTheaterParams(() => publicPossessionEvents(REPO_ROOT)).filter((p) => p.eventId !== NBA_PUBLIC_THEATER_PLACEHOLDER);
    // past slates: the settled page at the same URL (never an id a current Game Simulation page builds)
    const settled = nbaPublicTheaterOn() ? settledSimulationParams(currentEtDate(), live.map((p) => p.eventId)).map((eventId) => ({ eventId })) : [];
    if (live.length || settled.length) return [...live, ...settled];
  }
  return [{ eventId: NBA_PUBLIC_THEATER_PLACEHOLDER }];
}

export const dynamicParams = false;

const METADATA: Metadata = {
  title: "NBA Game Simulation · GameTime Picks",
  description: "A Game Simulation of one NBA game, possession by possession, from the NBA possession engine — shown beside the Official Forecast, which it never changes. Educational and paper-only.",
  // candidate: kept out of search until the release owner publishes it
  robots: { index: false, follow: false },
};

export function generateMetadata({ params }: { params: { eventId: string } }): Metadata {
  // a settled page names its game and says what it holds (the frozen forecast and the final), not a simulation
  const settled = nbaPublicTheaterOn() && params.eventId !== NBA_PUBLIC_THEATER_PLACEHOLDER ? loadSettledSimulation(params.eventId, currentEtDate()) : null;
  if (settled) {
    const { away, home } = settled.game;
    return withRouteMetadata(`/nba/simulation/${params.eventId}/`, {
      ...METADATA,
      title: `${away.abbr ?? away.name} @ ${home.abbr ?? home.name} · ${settled.date} · NBA Official Forecast and final · GameTime Picks`,
      description: `The Official Forecast for ${away.name ?? away.abbr} at ${home.name ?? home.abbr} on ${settled.date}, frozen before tip-off, beside the official final. The game-day Game Simulation is archived. Not betting advice.`,
    });
  }
  return withRouteMetadata(`/nba/simulation/${params.eventId}/`, METADATA);
}

export default async function NbaSimulationTheaterPage({ params }: { params: { eventId: string } }) {
  if (process.env.GTP_NBA_THEATER_PUBLIC === "1" && nbaPublicTheaterOn() && params.eventId !== NBA_PUBLIC_THEATER_PLACEHOLDER) {
    const { loadPublicPossessionTheater } = await import("@/lib/simulation-theater/nba/possession/public-loader.mjs");
    const { default: NbaPossessionGamePage } = await import("@/components/simulation-theater/nba/possession/NbaPossessionGamePage");
    const load = loadPublicPossessionTheater(REPO_ROOT, params.eventId) as PbLoad; // JS loader → the island's type (as the dev route)
    if (!load.ok) {
      // not on the current slate: a past slate's game gets its settled page (frozen forecast + final), else the 404
      const settled = loadSettledSimulation(params.eventId, currentEtDate());
      if (!settled) notFound();
      return (
        <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden supports-[overflow:clip]:overflow-x-clip">
          <SettledSimulation view={settled} />
        </div>
      );
    }
    /* NBA UI parity (founder directive 2026-10-22): skip link → Theater → server-rendered official predictions. */
    return (
      <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden supports-[overflow:clip]:overflow-x-clip">
        <NbaPossessionGamePage load={load} />
      </div>
    );
  }
  notFound();
}
