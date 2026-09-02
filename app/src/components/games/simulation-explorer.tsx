/**
 * SimulationExplorer (Sprint 012 · R9) — the flagship simulation DISCOVERY surface: the whole slate as a
 * gallery of SimulationCards, so a user can browse "what does the simulation say about every game today?"
 * without opening each report.
 *
 * It is a presentation shell over the SAME canonical objects the game report and /today already use
 * (Sprint 008 full-game artifact + Sprint 009 prediction decision) — no new engine, no recomputation, and
 * no fabricated data. Games without a full-game artifact are simply absent (they still have their own
 * honest report action elsewhere); an empty slate renders an honest empty state rather than a fake grid.
 */
import { type SimulationCardInput } from "@/components/entity/simulation-card";
import ExplorerControls from "@/components/games/explorer-controls";
import { buildAllGameDetails } from "@/lib/game-detail";
import { formatEtTime } from "@/lib/mlb/public-provenance";

/**
 * Derive the explorer's cards from the canonical details — ONCE, here in the component (the same pattern
 * SimulateLobby follows), never duplicated into a page file. Only games with a REAL full-game artifact
 * appear; ordering is chronological by first pitch.
 */
function explorerCards(): { cards: SimulationCardInput[]; slateDate: string | null } {
  const details = buildAllGameDetails().filter((d) => d.sport === "mlb" && d.fullGameSim);
  /*
   * THE SLATE THESE CARDS BELONG TO (P232 · C).
   *
   * This is not the date the reader selected — it is whatever the newest committed artifacts hold.
   * On 2026-09-02 the page header said "0 of 0 events on this slate" and "No MLB games on this
   * date" while this gallery rendered fifteen full reports from 09-01, with nothing on the section
   * to say so. Nothing was stale or fabricated; the section simply had no date on it, and a reader
   * has no way to tell yesterday's slate from today's.
   *
   * Browsing the last simulated slate on an empty day is genuinely useful. It just has to say when.
   */
  const slateDate = [...new Set(details.map((d) => d.date).filter(Boolean))].sort().pop() ?? null;
  const cards = details
    .map((d) => ({
      slug: d.slug,
      href: `/games/mlb/${d.slug}/`,
      homeLogo: d.homeLogo ?? null,
      awayLogo: d.awayLogo ?? null,
      firstPitchLabel: formatEtTime(d.fullGameSim!.firstPitch ?? null),
      game: d.fullGameSim!,
      prediction: d.prediction ?? null,
    }))
    .sort((a, b) => (a.game.firstPitch ?? "").localeCompare(b.game.firstPitch ?? ""));
  return { cards, slateDate };
}

/** "Sep 1" from an ISO date, in UTC so a build in any zone renders the same string. */
function slateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function SimulationExplorer({ selectedDate = null }: { selectedDate?: string | null }) {
  const { cards, slateDate } = explorerCards();
  const isOtherDay = Boolean(slateDate && selectedDate && slateDate !== selectedDate);
  return (
    <section aria-labelledby="simulation-explorer-h" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 id="simulation-explorer-h" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>
          Simulation Explorer
        </h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
          {slateDate ? `${slateLabel(slateDate)} slate · ${slateDate}` : "every simulated game"} · outcomes and player impact
        </span>
      </div>

      {/* When the gallery is not the day the reader picked, say it plainly ABOVE the cards — the
          header a few inches up may be truthfully reporting zero events for their date. */}
      {isOtherDay ? (
        <p className="text-[12px] m-0" style={{ color: "var(--vault-text-mute)" }}>
          These are the <strong>{slateLabel(slateDate!)}</strong> simulations — the most recent slate with
          full-game artifacts. Your selected date ({slateLabel(selectedDate!)}) has none yet.
        </p>
      ) : null}

      {cards.length === 0 ? (
        <p className="text-[12px] m-0" style={{ color: "var(--vault-text-mute)" }}>
          No full-game simulations have been generated yet. Simulations are deterministic and
          only appear once genuinely produced — never placeholder numbers.
        </p>
      ) : (
        /* Filter + sort chrome (Sprint 013). The cards are derived HERE on the server; the client boundary
           only reorders/narrows them via pure selectors — it never simulates or invents a value. */
        <ExplorerControls cards={cards} />
      )}

      <p className="font-mono m-0" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        Frequencies are the share of simulated games an outcome occurred in. Predictions are the simulation&rsquo;s
        directional read — not a bet, and not a claim to out-perform the book.
      </p>
    </section>
  );
}
