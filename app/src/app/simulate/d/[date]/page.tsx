/**
 * /simulate/d/[date] — one static page per date in the bounded selection window (P209 · Release A).
 *
 * Same selector and component as /simulate; the date is the route, so the selection is shareable
 * and back/forward-safe with zero hydration state. generateStaticParams enumerates ONLY dates a
 * registered sport actually has events on (union across owners), and always includes today so the
 * param list can never be empty — an empty list would kill the whole export (P202 lesson).
 * History beyond the window lives on /results; the in-window past renders SETTLED states that
 * route to results/reports, never a generate action.
 */
import SimulateDay from "@/components/simulate/simulate-day";
import { availableSimulateDates, buildSimulateDay } from "@/lib/simulate/day-view";
import Link from "next/link";
import type { Metadata } from "next";

export function generateStaticParams() {
  return availableSimulateDates().map((date) => ({ date }));
}
export const dynamicParams = false;

export function generateMetadata({ params }: { params: { date: string } }): Metadata {
  return {
    title: `Simulate · ${params.date} · GameTime Picks`,
    description: `Events, simulations and honest availability for ${params.date}. Educational, paper-only.`,
  };
}

export default function SimulateDatePage({ params }: { params: { date: string } }) {
  const view = buildSimulateDay(params.date);
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 24, fontWeight: 800 }}>
          Simulate
        </h1>
        <p className="m-0 max-w-[72ch]" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.6 }}>
          {view.date < view.today
            ? <>A settled slate: {view.totals.settled} of {view.totals.events} events are final — results route to their reports and the record. Deeper history lives on <Link href="/results" style={{ color: "var(--vault-gold-bright)" }}>Results</Link>.</>
            : <>{view.totals.ready} of {view.totals.events} events on this slate have a simulation report ready; every other state says exactly what it is.</>}
        </p>
      </header>
      <SimulateDay view={view} />
    </div>
  );
}
