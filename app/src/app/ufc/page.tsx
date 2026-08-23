/**
 * /ufc — the UFC settled archive.
 *
 * UFC is SCAFFOLD_ONLY in the capability registry (formally downgraded 2026-07-23): the retired V1
 * moneyline read was a de-vigged market price with a capped nudge, and no bout is cleanly
 * backtestable without point-in-time odds capture. So nothing predictive publishes here — no
 * projections, no suggested cards, no fight-card simulator, no upcoming-event framing.
 *
 * What DOES stay published is the settled record: UFC Freedom 250 was graded from the official
 * ESPN MMA scoreboard and its outcomes were public product output, so the record is preserved as a
 * dated archive rather than quietly deleted (same principle as the NBA settled archive). The page
 * is fail-closed on the settlement artifact: no official "final" settlement, no record shown.
 */
import fs from "node:fs";
import Explain from "@/components/ui/explain";
import TopReadsPanel from "@/components/top-reads-panel";
import { loadTopReads, topForSport } from "@/lib/top-reads";
import UfcCard, { type UfcCardArtifact } from "@/components/sports/ufc-card";
import { ScheduleList } from "@/components/sports/sport-schedule-page";
import { allUpcoming } from "@/lib/sports/upcoming/adapters.mjs";
import path from "node:path";
import Link from "next/link";
import UfcEventResultsRecap, { type UfcSettlement } from "@/components/ufc/event-results-recap";
import SportLabCards from "@/components/sport-lab-cards";
import GradedPicksSection from "@/components/sports/graded-picks-section";
import { loadGradedPicks } from "@/lib/sports/graded-picks-loader";
import { eventState, eventHeading, EVENT_STATE } from "@/lib/sports/event-lifecycle.mjs";
import { loadSportLabLadder } from "@/lib/parlays/sport-lab-cards";

export const metadata = {
  /*
   * THE METADATA WAS DESCRIBING A PAGE THAT NO LONGER EXISTED.
   *
   * It read "Historical record only; UFC has no live model coverage" — on a page that renders a
   * model pick for every bout on the next card and, since tonight, paper cards carrying posted
   * prices. This is the copy that reaches a search result and a link preview, so it is a public
   * claim made where nobody on the team ever looks, which is precisely why it went stale unnoticed.
   *
   * The replacement states what is here AND what it is worth: experimental, paper-only, and a record
   * of exactly one settled card. Naming the sample size in the description is deliberate — a reader
   * arriving from a search result has not read anything else on the page.
   */
  title: "UFC — Next Card Model Read & Settled Archive · GameTime Picks",
  description:
    "An experimental fight model's read on every bout of the next UFC card — winner, method and finishing round — with paper cards built from posted fight-winner prices. Paper-only and educational, never advice. The settled archive below covers one officially graded card.",
};

function loadJSONUfc<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", name), "utf-8")) as T;
  } catch {
    return null;
  }
}

const fmtDay = (iso?: string) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
};

export default function UfcArchivePage() {
  // UPCOMING SCHEDULE (P186). The archive stays exactly as it is — it is the only surface the settled
  // record has — and the schedule sits above it so the page answers "what is next" as well as "what
  // happened". Nothing predictive is added: bouts are listed with a time and nothing else.
  type Feed = { sport?: string; events?: unknown[]; totals?: { upcoming?: number }; sourceVerdict?: { sourceId?: string | null; fetchedAt?: string | null } };
  const feed = (allUpcoming({ nowIso: new Date().toISOString() }) as unknown as Feed[]).find((x) => x.sport === "ufc");
  // The full card (bouts, portraits, records, the one modelled prop) when a card artifact exists;
  // the generic schedule list is the fallback so the page never renders empty.
  const card = loadJSONUfc<UfcCardArtifact>("card-latest.json");
  /*
   * The card's own start time against the clock — the comparison no surface here was making. The
   * default six-hour window covers a full card from first prelim; calling one COMPLETE while it is
   * still running would be the worse error, because that is the one that starts presenting live
   * picks as a finished record.
   */
  const cardState = eventState({ startUtc: card?.event?.startUtc ?? null, nowIso: new Date().toISOString() });
  const ufcGraded = loadGradedPicks("ufc");
  const topReads = loadTopReads();
  /* Keyed to the CARD'S OWN date. A ladder built for another event must never appear under this one:
     the UFC ladder previously carried three dates at once — written 08-18, fighting 08-22, published
     as 08-21 — and a reader could not have told which fights they were looking at. */
  /*
   * A PAPER CARD IS A PREGAME PRODUCT, so it renders only while the card is still ahead.
   * This loaded the ladder for whatever day the card artifact named, and that artifact describes a
   * FOUGHT card for three days out of every seven — so the hub carried "Today's ladder · 3 of 4
   * price bands", with live prices, for an event that had already happened. The ladder itself was
   * correct and correctly dated; presenting it as today's was the defect.
   */
  const labLadder = cardState === EVENT_STATE.UPCOMING
    ? loadSportLabLadder("ufc", card?.event?.slateDate ?? null)
    : null;
  const settlement = loadJSONUfc<UfcSettlement>("results-settled-latest.json");
  // Fail-closed: only an OFFICIAL final settlement may render a record.
  const settled = settlement && settlement.status === "final" ? settlement : null;
  const settledOn = fmtDay(settled?.settledAt);

  // A later card can exist in the schedule artifact without ever being officially settled. It must
  // never be framed as a next/current event here — the only honest statement is that no record exists.
  const sched = loadJSONUfc<{ eventName?: string; eventDate?: string }>("schedule-latest.json");
  const unsettledLaterCard =
    settled && sched?.eventName && sched.eventName !== settled.event
      ? { name: sched.eventName, day: fmtDay(sched.eventDate) }
      : null;

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 24, fontWeight: 700 }}>
            UFC
          </h1>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--sport-ufc)", border: "1px solid var(--sport-ufc)", background: "rgba(217,164,65,0.08)" }}
          >
            Predictions · experimental
          </span>
        </div>
        <p className="max-w-2xl font-mono text-[11.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          Winner, method and finishing round for every bout on the next card. Paper and educational.
        </p>
        {/*
          THIS PARAGRAPH WAS ASSERTING THE OPPOSITE OF THE PAGE.
          It read "No sportsbook price is shown or compared — our odds authorisation covers NFL only".
          Both halves had expired. A dedicated UFC receipt exists (500 credits, fight-winner prices,
          bulk endpoint), prices have been captured under it since, and the paper cards below now
          show a posted price on every leg. The sentence was true when written and became a
          contradiction sitting directly above the numbers it denied — the same shape as a nav entry
          reading "simulation pending" while rendering on a page full of simulations.
          What is STILL true is the part that matters, and it is kept: the model's probabilities have
          never been set against a no-vig line. Showing a price and being measured against one are
          different things, and only the first has changed.
        */}
        <Explain label="What changed, and what is still refused">
          The de-vigged-price read that ran until 2026-07-23 was retired: it restated the sportsbook
          rather than forming an opinion. What publishes now is a fight model trained on 8,642
          decisive bouts, with each of its three markets tested separately against a base-rate
          baseline. Posted fight-winner prices ARE shown on the paper cards below, under a UFC odds
          authorisation of its own — but the model has never been SCORED against a no-vig line, so
          its probabilities stand alone rather than being presented as beating a market they have not
          been measured against. The settled record from the retired era is kept below.
        </Explain>
        <nav className="flex flex-wrap gap-3 font-mono text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
          <Link href="/today" style={{ color: "var(--gtp-bank-heat)" }}>Live action → Today</Link>
          <Link href="/results" style={{ color: "var(--vault-text-mute)" }}>Track record → Results</Link>
          <Link href="/methodology" style={{ color: "var(--vault-text-mute)" }}>How everything is graded → Methodology</Link>
        </nav>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/*
            "NEXT CARD" WAS A LITERAL STRING, and it was wrong for three days out of every seven.
            The card artifact is rebuilt Tuesday, Thursday and Saturday, so between a Saturday card
            and the following Tuesday the newest artifact legitimately describes a FOUGHT event —
            and this page presented it as the next one, with a live paper ladder beneath it. Nothing
            was broken; no surface compared the card's own start time to the clock.
            The heading is now derived from that comparison, so it cannot disagree with the thing
            underneath it, and a card with no readable start time reads as "Published card" rather
            than being guessed in either direction.
          */}
          <h2 className="font-display" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700, margin: 0 }}>
            {eventHeading(cardState)}
          </h2>
          {cardState === EVENT_STATE.COMPLETE ? (
            <span className="font-mono" style={{ fontSize: 10.5, color: "var(--vault-text-faint)", letterSpacing: "0.08em" }}>
              FOUGHT — the next card&rsquo;s read publishes when it is built
            </span>
          ) : null}
        </div>
        {/*
          FRESHNESS FROM THE CARD'S OWN ARTIFACT.
          This page showed no stamp of any kind: it rendered a card artifact and never told a reader
          when that artifact was produced, so a two-day-old read and a two-minute-old one looked
          identical. The stamp is the card's own generatedAt — never a build time, which records when
          the site was compiled rather than when anything was known, and never another artifact's,
          because this page reads several with different stamps and one number standing for all of
          them would be a figure built for one scope reused for a broader claim.
        */}
        {card?.generatedAt ? (
          <p className="m-0" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
            Card and model read {card.generatedAt}
          </p>
        ) : null}
        {/* A nearer card the model cannot read. Contender Series is five debutants — the engine
            correctly says nothing about it, but a hub that just showed the later card would look
            like it had missed this one. Naming it, with the real counts, makes the skip auditable. */}
        {(card?.skippedForCoverage ?? []).map((s) => (
          <p
            key={s.name}
            className="rounded-lg px-3 py-2 text-[11.5px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)", background: "rgba(7,11,9,0.5)", margin: 0 }}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)" }}>
              Sooner, but not read ·{" "}
            </span>
            <strong style={{ color: "var(--vault-text)", fontWeight: 600 }}>{s.name}</strong> is on{" "}
            {new Date(s.dateUtc).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric" })}.
            We have UFC history for both fighters in {s.modellableBouts} of its {s.bouts} bouts, so the model has nothing
            to say about it and we publish no read. The card below is the next one it can read.
          </p>
        ))}
        {card?.bouts?.length
          ? <UfcCard card={card} />
          : <ScheduleList events={(feed?.events ?? []) as never[]} sides={["red", "blue"]} joiner="vs" />}
        <p className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)", margin: 0 }}>
          Schedule source: {feed?.sourceVerdict?.sourceId ?? "ESPN"}
        </p>
      </section>

      {settled ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)" }}>
              Officially settled {settledOn}
            </span>
          </div>
      {labLadder ? <SportLabCards ladder={labLadder} nameEvent={false} /> : null}

      {/*
        WHAT THE MODEL SAID, AND WHAT ACTUALLY HAPPENED. The hub published a read for every bout on
        the card and, once those fights were over, showed a reader nothing about how the reads did.
        Forecasts published continuously and results published nowhere is the shape of every tipster
        site there has ever been; this is the other half, from the graded ledger.
      */}
      {ufcGraded ? <GradedPicksSection record={ufcGraded} href="/results/picks/ufc" /> : null}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700, margin: 0 }}>
            Settled archive
          </h2>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)", background: "rgba(7, 11, 9,0.5)" }}
          >
            Archive · no live coverage
          </span>
        </div>
      </section>

          <UfcEventResultsRecap s={settled} />
          <p className="font-mono text-[10px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
            This is one settled event ({settled.fights.length} graded fights). A single-card record is an outcome log,
            not model validation — the moneyline model was retired unvalidated.
          </p>
        </section>
      ) : (
        <section className="rounded-[10px] px-4 py-5 font-mono text-[11.5px]" style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-border)", background: "rgba(11, 18, 14,0.45)" }}>
          No officially settled UFC record is available. Nothing renders here until an official settlement exists.
        </section>
      )}

      {unsettledLaterCard ? (
        <p className="max-w-2xl font-mono text-[10.5px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
          {unsettledLaterCard.name}
          {unsettledLaterCard.day ? ` (${unsettledLaterCard.day})` : ""} was listed with market-implied reads only
          before the event; no model picks were published for it and no official settlement was ingested, so no record
          is claimed for it.
        </p>
      ) : null}
      {/* The five reads this sport's model is most confident about today — team markets and player
          markets both, interleaved rather than sorted together, because a match favourite always
          outranks any single player and a plain sort would make the list all-team. */}
      {topReads ? (
        <TopReadsPanel
          set={topReads}
          reads={topForSport(topReads, "ufc", 5)}
          eyebrow="UFC · model reads"
          title="What the model is most confident about today"
        />
      ) : null}

    </div>
  );
}
