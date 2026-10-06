/**
 * /nfl/simulation/[eventId] — NFL Simulation V2, EXPERIMENTAL (founder P0 · 2026-10-05). PUBLIC.
 *
 * One page per game whose Simulation V2 receipt of record (the latest generated before kickoff) passes the receipt
 * validator with zero incoherent runs and at least 10,000 runs (lib/sports/nfl/sim-v2/public-receipt.mjs). A game whose
 * record fails gets no page — fail closed, never an older receipt in its place.
 *
 * SEPARATE FROM THE CANONICAL FORECAST. /nfl/game/[eventId] and its Projected Scorecard stay the Game Time Forecast and
 * keep their "expected statistical summaries · not one simulated game" label. This page is a different engine (SHADOW,
 * not promoted, not shown to be more accurate) and says so; the canonical numbers appear only in their own labelled card.
 * Statically generated from committed files at build time; nothing here is computed in the browser.
 */
import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";

import SimulationV2Report, { type CanonicalForecast } from "@/components/nfl/simulation-v2-report";
import { readShadowReceipts, showableSimulationEvents, simulationOfRecord } from "@/lib/sports/nfl/sim-v2/public-receipt.mjs";
import { unionFrozenForecasts } from "@/lib/sports/nfl/public-forecast-union.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const entries = () => readShadowReceipts(REPO_ROOT);

const readPublic = (rel: string) => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data", rel), "utf8")); } catch { return null; }
};

function canonicalFor(eventId: string): CanonicalForecast | null {
  const art = unionFrozenForecasts(readPublic("nfl/forecasts/latest.json"), readPublic("nfl/forecasts/frozen-latest.json"));
  const f = (art?.forecasts ?? []).find((x: any) => String(x.providerEventId) === eventId);
  const s = f?.forecastSummary;
  if (!s?.winProbability || !s?.projectedScore) return null;
  return {
    awayWin: s.winProbability.away, homeWin: s.winProbability.home,
    projectedAway: s.projectedScore.away, projectedHome: s.projectedScore.home,
    totalMedian: s.total?.median, modelId: f.model?.id ?? null, generatedAt: f.generatedAt ?? null,
  };
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
    title: `${r.away.abbr} @ ${r.home.abbr} — Simulation V2 (experimental) · GameTime Picks`,
    description: `${r.runCount.toLocaleString("en-US")} coherent simulated games of ${r.away.name} at ${r.home.name}: outcomes, quarters, team and player lines, touchdown scorers. Experimental engine, separate from the Game Time Forecast; educational and paper-only.`,
  });
}

export default function NflSimulationV2Page({ params }: { params: { eventId: string } }) {
  const rec = simulationOfRecord(entries(), params.eventId);
  if (!rec?.showable) notFound();
  const r = rec.receipt;
  const gameHref = `/nfl/game/${params.eventId}/`;
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <p className="font-mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: 0 }}>
        <Link href="/nfl/">NFL</Link> · <Link href={gameHref}>{r.away.abbr} @ {r.home.abbr}</Link> · Simulation
      </p>
      <h1 className="font-display" style={{ fontSize: 30, margin: "6px 0 0", color: "var(--vault-text)" }}>
        {r.away.name} at {r.home.name}
      </h1>
      <p className="font-mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-mute)", margin: "6px 0 0" }}>
        Simulation · experimental · {r.runCount.toLocaleString("en-US")} coherent game paths
      </p>
      <SimulationV2Report r={r} file={rec.file} canonical={canonicalFor(params.eventId)} gameHref={gameHref} />
    </div>
  );
}
