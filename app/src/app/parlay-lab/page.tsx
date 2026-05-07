import { getSlate, getMeta, getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import type { PropLean } from "@/lib/types";
import ParlayLabClient from "@/components/parlay-lab-client";
import DataSourceBadge from "@/components/data-source-badge";

/**
 * /parlay-lab — Phase 12 educational analysis foundation.
 *
 * NOT betting advice. NOT a recommendation engine. NOT a parlay scraper.
 *
 * This page lets a user paste parlay legs (e.g. from a DraftKings or
 * FanDuel slip they've already built) and see how each leg compares to
 * our model's projection, edge, confidence, and recent10 data.
 *
 * Data flow:
 *   - Server reads the per-day board JSONs that already exist on disk
 *   - Builds a flat array of all leans across the slate's primary day
 *     plus other days that have leans
 *   - Hands that array to the client component
 *   - Client lets user paste / pick a risk profile / sees per-leg analysis
 *
 * The server NEVER fetches odds, scrapes sportsbooks, or calls any API.
 * Static export friendly — same data the /board page reads.
 */
export default function ParlayLabPage() {
  const slate = getSlate();
  const meta = getMeta();

  // Collect leans across every available board day. Most users will
  // analyze only the primary date, but if they pasted legs from
  // tomorrow's board we want those to match too.
  const allDates = getAvailableBoardDates();
  const allLeans: PropLean[] = [];
  const dateLabels = new Map<string, string>();
  for (const date of allDates) {
    const board = getBoardForDate(date);
    if (board.leans.length > 0) {
      for (const lean of board.leans) {
        allLeans.push(lean);
      }
      const slateDay = slate.days.find((d) => d.date === date);
      dateLabels.set(date, slateDay?.dayLabel ?? date);
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-12 md:py-20">
      {/* Hero */}
      <section>
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em] mb-3 inline-flex items-center gap-2"
          style={{ color: "var(--vault-gold)" }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--vault-gold-bright)" }}
          />
          Parlay Lab · educational analysis
        </div>

        <h1 className="font-display text-[40px] md:text-[60px] leading-[0.95] tracking-tightest font-semibold max-w-3xl">
          Compare your slip to the{" "}
          <span style={{ color: "var(--vault-gold-bright)" }}>model</span>.
        </h1>

        <p className="mt-5 text-[var(--text-mute)] text-[15px] md:text-[16px] max-w-2xl leading-relaxed">
          Paste a parlay you've built on DraftKings, FanDuel, or any other
          sportsbook. We'll check each leg against our projections, edges,
          confidence tiers, and recent-trend data — then label the slip's
          overall risk profile. We never tell you to bet. We tell you what
          the model thinks.
        </p>

        <div className="mt-6 flex flex-wrap gap-3 items-center">
          <DataSourceBadge meta={meta} />
          <span
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] px-2.5 py-1 rounded-[2px]"
            style={{
              background: "var(--vault-warn-dim)",
              color: "var(--vault-warn)",
              border: "1px solid var(--vault-border)",
            }}
          >
            Educational only — not betting advice
          </span>
        </div>
      </section>

      {/* Disclaimer panel */}
      <section className="mt-10">
        <div
          className="rounded-[3px] p-4 sm:p-5 text-[13px] leading-relaxed"
          style={{
            background: "var(--vault-panel)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
          }}
        >
          <div
            className="font-mono text-[10px] uppercase tracking-[0.18em] mb-2"
            style={{ color: "var(--vault-gold)" }}
          >
            How this works
          </div>
          <ul className="space-y-1.5 text-[var(--vault-text-mute)] list-none">
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span> Paste
              one leg per line. Format example:{" "}
              <code style={{ color: "var(--vault-text)" }}>
                LeBron James Over 25.5 PTS -110
              </code>
            </li>
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span> We
              match each leg to our existing model row for that player + market
              + line. We don't synthesize alternate lines.
            </li>
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span> Same-game
              legs trigger a correlation warning. Outcomes within one game are
              not independent.
            </li>
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span> Risk
              profile is a label, not advice. Conservative ≠ guaranteed.
              Aggressive ≠ doomed.
            </li>
          </ul>
        </div>
      </section>

      {/* Client interactive area */}
      <section className="mt-8">
        <ParlayLabClient
          allLeans={allLeans}
          datesAvailable={Array.from(dateLabels.entries()).map(([date, label]) => ({ date, label }))}
        />
      </section>

      {/* Footer educational reminder */}
      <section className="mt-16">
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          GametimePicks is an educational analytics project. Nothing on this
          page is betting advice. Past model agreement does not guarantee
          future outcomes. Sports outcomes are uncertain. If gambling is
          affecting your wellbeing, please visit{" "}
          <a
            href="https://www.ncpgambling.org/help-treatment/national-helpline-1-800-522-4700/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--vault-gold-bright)] transition-colors"
          >
            the National Council on Problem Gambling helpline
          </a>
          .
        </p>
      </section>
    </div>
  );
}
