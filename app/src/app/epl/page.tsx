/**
 * /epl — Premier League schedule hub.
 *
 * SCHEDULE_ONLY. The internal FIFA-Poisson soccer work is research, not a published product, and it
 * has never been validated on Premier League fixtures — so nothing predictive appears here. The page
 * renders through the shared SportSchedulePage so it cannot drift from /nba and /ufc.
 */
import type { Metadata } from "next";
import SportSchedulePage from "@/components/sports/sport-schedule-page";
import { allUpcoming } from "@/lib/sports/upcoming/adapters.mjs";

export const metadata: Metadata = {
  title: "Premier League — Schedule · GameTime Picks",
  description:
    "Premier League fixture schedule. Schedule only — no simulations, projections or picks are published for this competition yet.",
};

export default function EplPage() {
  type Feed = { sport?: string; events?: unknown[]; totals?: { upcoming?: number }; sourceVerdict?: { sourceId?: string | null; fetchedAt?: string | null } };
  const s = (allUpcoming({ nowIso: new Date().toISOString() }) as unknown as Feed[]).find((x) => x.sport === "epl");
  return (
    <SportSchedulePage
      title="Premier League"
      blurb="The 2026-27 Premier League fixture list, kept current so the season is ready to model the moment it can be."
      logoSport="soccer"
      sides={["home", "away"]}
      joiner="at"
      events={(s?.events ?? []) as never[]}
      source={s?.sourceVerdict?.sourceId ?? "openfootball (public domain)"}
      capturedAt={s?.sourceVerdict?.fetchedAt ?? null}
      totalEvents={s?.totals?.upcoming}
      blocker="Simulating a fixture needs per-club scoring rates fitted to this competition and validated out of sample; that work has not been done for the Premier League, so publishing a number here would be a guess wearing a model's clothes."
    />
  );
}
