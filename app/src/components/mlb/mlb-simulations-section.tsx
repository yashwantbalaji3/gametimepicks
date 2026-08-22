/**
 * The MLB Simulations section — one card per simulated game, each opening its full distribution.
 *
 * Mirrors what /epl already gave its readers. Every figure is read from the simulation artifact;
 * this component computes nothing and compares nothing to a sportsbook price.
 */
import Link from "next/link";

import SectionHeader from "@/components/section-header";
import TeamLogo from "@/components/team-logo";
import type { MlbSimCard, MlbSimSet } from "@/lib/mlb/full-game/hub-cards";

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

function SimCard({ c, href }: { c: MlbSimCard; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-[12px] p-4"
      style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)", color: "var(--vault-text)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <TeamLogo team={c.away} sport="mlb" size="sm" ariaLabel={`${c.away} logo`} />
        <TeamLogo team={c.home} sport="mlb" size="sm" ariaLabel={`${c.home} logo`} />
        <span className="font-mono ml-auto" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>
          {c.firstPitch ? `${ET_TIME.format(new Date(c.firstPitch))} ET` : "time TBD"}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>{c.away} at {c.home}</p>
      <p className="font-mono mt-1" style={{ margin: 0, fontSize: 11.5, color: "var(--vault-text-mute)" }}>
        {/* A tie has no favourite and says so, rather than defaulting to the home side. */}
        {c.favourite ? `${c.favourite.team} ${pct(c.favourite.probability)}` : "even in the simulation"}
        {c.medianTotal != null ? ` · median ${c.medianTotal} runs` : ""}
      </p>
      {c.likeliestScore ? (
        <p className="font-mono mt-1" style={{ margin: 0, fontSize: 11, color: "var(--vault-text-faint)" }}>
          likeliest {c.likeliestScore.away}–{c.likeliestScore.home} at {pct(c.likeliestScore.probability)}
        </p>
      ) : null}
      {/*
        The provisional state is on the ROW, not in a footnote. A reader about to open a distribution
        built on a padded lineup should know that before they read it, not after.
      */}
      {c.awaitingLineup ? (
        <p className="font-mono mt-1" style={{ margin: 0, fontSize: 10.5, color: "var(--vault-text-faint)" }}>
          batting order not posted yet · refreshes hourly
        </p>
      ) : null}
      <p className="font-mono mt-2" style={{ margin: 0, fontSize: 10.5, color: "var(--vault-accent)" }}>Open the simulation →</p>
    </Link>
  );
}

export default function MlbSimulationsSection({ set, hrefFor }: { set: MlbSimSet; hrefFor: (c: MlbSimCard) => string | null }) {
  const rows = set.cards.map((c) => ({ c, href: hrefFor(c) })).filter((r): r is { c: MlbSimCard; href: string } => Boolean(r.href));
  if (rows.length === 0) return null;
  return (
    <section className="mt-8">
      <SectionHeader
        eyebrow={`Simulations · ${rows.length} game${rows.length === 1 ? "" : "s"}`}
        title="Open a game's full distribution"
        sub="Every game on the slate simulated pitch by pitch from the posted lineups — win probability, the run-total distribution, the likeliest final scores, the run line and a simulated box score. These are the model's own numbers and are not compared against any sportsbook price."
      />
      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {rows.map(({ c, href }) => <SimCard key={c.slug} c={c} href={href} />)}
      </div>
      <p className="mt-3" style={{ fontSize: 12, color: "var(--vault-text-faint)", lineHeight: 1.6 }}>
        {/* The run count is quoted only when the whole set agrees on one — never one game's figure
            standing in for the rest. */}
        {set.runCount ? `${set.runCount.toLocaleString()} complete games simulated per matchup. ` : ""}
        {set.readyCount} of {set.cards.length} are built on both confirmed batting orders; the rest use the
        batters who have posted lines so far and refresh as the orders arrive.
      </p>
    </section>
  );
}
