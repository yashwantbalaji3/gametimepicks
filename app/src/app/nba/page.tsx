/**
 * /nba — the NBA hub: schedule and official finals, no forecast (Session 6 · NBA factual shell).
 *
 * This route was a redirect to /results/nba because the old hub's Projections / Player Props tabs read as
 * live coverage while the source was dead. What is here now is only what the repo can stand behind: the
 * ESPN schedule capture (preseason from 2026-10-03, regular season from 2026-10-20) and the write-once
 * finals record. NBA stays HISTORICAL_ONLY in the capability registry and no NBA model has cleared its
 * preregistered bars, so no row carries a probability, a pick or a projected score — the adapter has no
 * path that could attach one. The retired May–June player-prop archive stays where it was, linked below
 * and labelled as the retired model it is.
 */
import Link from "next/link";
import HubHeader, { HubTitle } from "@/components/sport-hub/hub-header";
import SportSwitcher from "@/components/sports/sport-switcher";
import { nbaHub } from "@/lib/sport-hub/nba-hub";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/nba/", {
  title: "NBA — Schedule & final scores · GameTime Picks",
  description:
    "The 2026-27 NBA schedule and official finals. No NBA forecast is published yet: the model is in validation against preregistered bars. The retired May–June 2026 player-prop archive is linked separately.",
});

export default function NbaHubPage() {
  const model = nbaHub(new Date().toISOString());
  const finals = model.rows.filter((r) => r.status === "final").length;
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      {/* UX-001 phase 2: the shared sport switcher — every hub links to every other sport. */}
      <SportSwitcher current="nba" />
      <HubTitle model={model} />
      <p className="m-0 max-w-2xl text-[13.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        <span className="font-semibold" style={{ color: "var(--vault-text)" }}>Schedule only — no public forecast.</span>{" "}
        Games, start times and official finals. The NBA model is in validation and publishes nothing until it
        clears its preregistered bars on regular-season games.
      </p>
      <section id="nba-games" className="scroll-mt-24" aria-label="NBA games">
        {/* Session 11: schedule-only — one line per game keeps every game inside the page budget. */}
        <HubHeader model={model} compact />
      </section>

      <section id="nba-model-status" className="scroll-mt-24 flex flex-col gap-2" aria-labelledby="nba-model-status-h">
        <h2 id="nba-model-status-h" className="m-0 font-display text-[18px] font-bold" style={{ color: "var(--vault-text)" }}>Model status</h2>
        <ul className="m-0 pl-5 text-[13.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          <li>Game winner, score and player stats: <strong style={{ color: "var(--vault-text)" }}>in validation</strong> — nothing is published.</li>
          <li>Preseason games are tracked for schedule and final-score plumbing only; they never count as model evidence.</li>
          <li>A family publishes only after it meets its bar on regular-season games, scored against forecasts frozen before tip-off.</li>
        </ul>
      </section>

      <section id="nba-results" className="scroll-mt-24 flex flex-col gap-2" aria-labelledby="nba-results-h">
        <h2 id="nba-results-h" className="m-0 font-display text-[18px] font-bold" style={{ color: "var(--vault-text)" }}>Results</h2>
        <p className="m-0 text-[13.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          {finals > 0
            ? `${finals} official final${finals === 1 ? "" : "s"} in the window above, from the write-once finals record.`
            : "Official finals appear on their game rows once the finals record holds them. A game without one is pending, not a result."}
        </p>
        <p className="m-0 text-[13.5px]">
          <Link href="/results/nba/" className="underline" style={{ color: "var(--vault-text)" }}>
            May–June 2026 player-prop archive
          </Link>
          <span style={{ color: "var(--vault-text-mute)" }}> — a retired model&rsquo;s settled record, kept for transparency.</span>
        </p>
      </section>
    </div>
  );
}
