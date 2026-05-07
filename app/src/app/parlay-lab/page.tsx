import { getSlate, getMeta, getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import type { PropLean } from "@/lib/types";
import ParlayLabModeTabs from "@/components/parlay-lab-mode-tabs";
import DataSourceBadge from "@/components/data-source-badge";

/**
 * /parlay-lab — Phase 16 model-assisted builder + paste analysis.
 *
 * NOT betting advice. NOT a recommendation engine. NOT a parlay scraper.
 *
 * Two modes:
 *   - "Build with model"  — Phase 16: generate candidate parlays from real
 *                            slate leans by selected players, games, markets,
 *                            and risk profile. No fabrication.
 *   - "Analyze slip"      — Phase 12: paste a sportsbook slip and compare
 *                            each leg to the model.
 *
 * The server NEVER fetches odds, scrapes sportsbooks, or calls any API.
 * Every leg in every output is sourced from a real PropLean already on
 * disk — same data the /board page reads.
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
      <section className="vault-hero-grid">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em] mb-3 inline-flex items-center gap-2"
          style={{ color: "var(--vault-gold)" }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full vault-pulse"
            style={{ background: "var(--vault-gold-bright)" }}
          />
          Parlay Lab · educational analysis
        </div>

        <h1 className="font-display text-[40px] md:text-[60px] leading-[0.95] tracking-tightest font-semibold max-w-3xl">
          Build with the{" "}
          <span style={{ color: "var(--vault-gold-bright)" }}>model</span>
          .
        </h1>

        <p className="mt-5 text-[var(--text-mute)] text-[15px] md:text-[16px] max-w-2xl leading-relaxed">
          Generate candidate parlays from the slate's real model leans, or
          paste a slip you've already built and compare each leg to our
          projections, edges, and recent-trend data. We never tell you to
          bet — we tell you what the model thinks.
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
          className="rounded-[3px] p-4 sm:p-5 text-[13px] leading-relaxed vault-glass"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <div
            className="font-mono text-[10px] uppercase tracking-[0.18em] mb-2"
            style={{ color: "var(--vault-gold)" }}
          >
            How this works
          </div>
          <ul className="space-y-1.5 text-[var(--vault-text-mute)] list-none">
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
              <strong style={{ color: "var(--vault-text)" }}>Build mode</strong>{" "}
              generates candidate parlays from real slate leans. Pick a risk
              profile, optionally select specific players, games, or markets.
            </li>
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
              <strong style={{ color: "var(--vault-text)" }}>Analyze mode</strong>{" "}
              takes a pasted slip and matches each leg to the model. Format:{" "}
              <code style={{ color: "var(--vault-text)" }}>
                LeBron James Over 25.5 PTS -110
              </code>
            </li>
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span> We
              never synthesize alternate lines or fabricate legs. If the model
              doesn't have a lean, that combination isn't available.
            </li>
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
              Same-game legs trigger a correlation warning. Outcomes within one
              game are not independent.
            </li>
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span> Risk
              profile is a label, not advice. Conservative ≠ guaranteed.
              Aggressive ≠ doomed.
            </li>
          </ul>
        </div>
      </section>

      {/* Client interactive area — mode tabs hold both Build + Analyze */}
      <section className="mt-8">
        <ParlayLabModeTabs
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
