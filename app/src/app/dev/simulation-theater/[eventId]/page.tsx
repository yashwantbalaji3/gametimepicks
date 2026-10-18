/**
 * /dev/simulation-theater/[eventId] — DEVELOPMENT ONLY, UNLINKED, NOINDEX (founder D2, 2026-10-18).
 *
 * The first Simulation Theater V2 prototype: drive-level playback of ONE recorded representative run of ONE
 * `nfl-drive-sim-v2` receipt of record (the latest generated before kickoff, as on the public simulation page).
 * Every frame comes from lib/simulation-theater (adapter → validation → compiled timeline → stateAt).
 *
 * Exists in the static export ONLY when the build sets GTP_DEV_ROUTES=1, and then for ≤3 fixture events
 * (lib/simulation-theater/loader.mjs FIXTURE_EVENT_IDS) whose receipt of record passes validation. In the default and
 * Production builds generateStaticParams yields only an inert placeholder (Next 14.2.15 rejects an empty list under
 * `output: "export"`), the page 404s, and scripts/prune-internal-routes.mjs removes out/dev/ entirely.
 * Nothing links here. No data is written: receipts are read, never modified.
 *
 * Dev-only URL hook (this route only): `?run=<runIndex>&t=<seconds>` opens that representative run paused at that
 * playback second (deterministic: stateAt is a pure function of t), for screenshots and demos. See DEMO notes in the
 * PR; the public route will never pass `devHooks`.
 */
import type { Metadata } from "next";
import path from "node:path";
import { notFound } from "next/navigation";

import { withRouteMetadata } from "@/lib/seo/route-metadata";
import TheaterSection from "@/components/simulation-theater/TheaterSection";
import type { TheaterLoad } from "@/components/simulation-theater/types";
import { DISABLED_PLACEHOLDER, devRoutesEnabled, devStaticParams } from "@/lib/simulation-theater/dev-routes.mjs";
import { FIXTURE_EVENT_IDS, loadTheater, usableFixtures } from "@/lib/simulation-theater/loader.mjs";

const REPO_ROOT = path.resolve(process.cwd(), "..");

export function generateStaticParams() {
  return devStaticParams(() => usableFixtures(REPO_ROOT));
}

export const dynamicParams = false;

const DEV_METADATA: Metadata = {
  title: "Simulation Theater V2 · development prototype",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/** noindex stays; og:url/canonical name the page itself (rendered-metadata.test: every page's og:url is its own). */
export function generateMetadata({ params }: { params: { eventId: string } }): Metadata {
  return withRouteMetadata(`/dev/simulation-theater/${params.eventId}/`, DEV_METADATA);
}

export default function SimulationTheaterDevPage({ params }: { params: { eventId: string } }) {
  if (!devRoutesEnabled() || params.eventId === DISABLED_PLACEHOLDER || !FIXTURE_EVENT_IDS.includes(params.eventId)) notFound();
  const load = loadTheater(REPO_ROOT, params.eventId) as TheaterLoad;
  return (
    <div className="vault-page-shell" style={{ padding: "16px 16px 48px" }}>
      {/* devHooks: the `?run=&t=` seek hook for reproducible screenshots (TheaterIsland). Dev route only. */}
      <TheaterSection load={load} devHooks />
    </div>
  );
}
