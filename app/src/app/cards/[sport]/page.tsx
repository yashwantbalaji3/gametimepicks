/**
 * A SPORT'S PAPER CARDS, ON THEIR OWN PAGE.
 *
 * The Products rail listed four destinations and all four were baseball: Bank Builder, Moonshot,
 * Homer Nukes, Mr. Dub. EPL and UFC have published card products of their own for days — real posted
 * prices, a settleable leg contract, bands assigned by the same canonical bucket function — and
 * neither had a destination anywhere. They were reachable only by scrolling the sport hub.
 *
 * ONE ROUTE, NOT ONE PER SPORT. Every live lane publishes the same ladder shape, so a second copy of
 * this page per sport would be a second place for the claim to drift. The sports that exist are
 * enumerated from the artifacts on disk at build time: a lane with no published ladder gets no page
 * rather than an empty one.
 *
 * THE SELECTION SENTENCE STILL COMES FROM THE ARTIFACT. UFC picks the side its model reads because
 * that model passed its preregistered bar; EPL takes the market's own favourite because its model
 * has not. A products page that wrote its own caption would eventually put one sport's claim over
 * another's cards, which on the page looks identical to the honest version.
 */
import type { Metadata } from "next";
import Link from "next/link";

import SportLabCards from "@/components/sport-lab-cards";
import SectionHeader from "@/components/section-header";
import { loadCurrentSportLabLadder, ladderDayLabel, type SportLabLadder } from "@/lib/parlays/sport-lab-cards";
import { loadUfcResultsCoverage } from "@/lib/sports/ufc/coverage-loader";

/** Lanes that can carry a card product, with the hub each one belongs to. */
const LANES: Record<string, { label: string; hub: string; hubLabel: string; slateOf: (l: SportLabLadder) => string }> = {
  epl: { label: "Premier League", hub: "/epl", hubLabel: "Premier League hub", slateOf: (l) => l.date },
  ufc: { label: "UFC", hub: "/ufc", hubLabel: "UFC hub", slateOf: (l) => l.eventName ?? l.date },
  // P201: the NFL lane earned a destination when its cards became gradeable (settle-lab-cards
  // gained gradeNflLeg). Between priced slates the page renders the ladder's own typed refusal.
  nfl: { label: "NFL", hub: "/nfl", hubLabel: "NFL hub", slateOf: (l) => l.date },
};

/*
 * EVERY DECLARED LANE GETS A PAGE, ALWAYS.
 *
 * This used to enumerate only the lanes with a published ladder, on the reasoning that an empty
 * product page is worse than none. That was wrong in a way the guards caught within the hour: the
 * Products rail links to these routes unconditionally, and a lane's ladder empties out during the
 * day as its fixtures kick off — EPL had one card at noon and none by four. A nav item pointing at a
 * route that no longer exists is a 404 in the main navigation, which is worse than any empty state.
 *
 * So the page always exists, and says plainly when there is nothing to show. "No cards for this
 * slate" is a product state; a broken link is not.
 */
export function generateStaticParams() {
  return Object.keys(LANES).map((sport) => ({ sport }));
}
export const dynamicParams = false;

export function generateMetadata({ params }: { params: { sport: string } }): Metadata {
  const lane = LANES[params.sport];
  const ladder = loadCurrentSportLabLadder(params.sport);
  if (!lane) return { title: "Paper cards · GameTime Picks" };
  return {
    title: `${lane.label} Paper Cards · GameTime Picks`,
    description: ladder
      ? `${ladder.cards.length} of 4 price bands built from real posted prices for ${lane.slateOf(ladder)}. ` +
        "Paper-only and educational — no stake is filled in, and nothing here is a pick or a recommendation to wager."
      : `${lane.label} paper card ladder. No cards are published right now — a ladder is built only from events that have not started. Paper-only and educational.`,
  };
}

export default function SportCardsPage({ params }: { params: { sport: string } }) {
  const lane = LANES[params.sport];
  if (!lane) return null;              // dynamicParams=false means this is unreachable
  const ladder = loadCurrentSportLabLadder(params.sport);
  /* Only UFC grades from a third-party corpus, so only UFC can be waiting on one. */
  const coverageNote = params.sport === "ufc" ? loadUfcResultsCoverage().note : null;

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6">
      <SectionHeader
        eyebrow={`${lane.label} · paper cards`}
        title={`${lane.label} card ladder`}
        sub="One card per price band, built from prices a sportsbook actually posted. Paper-only and educational — no stake is filled in anywhere, and nothing here is a pick or a recommendation to wager."
      />

      {ladder ? (
        <SportLabCards ladder={ladder} eyebrow={ladderDayLabel(ladder.date)} />
      ) : (
        /*
          THE EMPTY STATE, NAMED. A ladder empties as its events start — by late afternoon a slate
          that carried four bands at breakfast may carry none. Saying which of the two situations
          this is matters: "nothing left to price today" and "we could not build anything" are
          different facts, and only the first is routine.
        */
        <p className="mt-4" style={{ fontSize: 13, lineHeight: 1.7, color: "var(--vault-text-mute)" }}>
          No {lane.label} cards are published right now. A ladder is built only from events that have
          not started, so it empties as the day&rsquo;s {params.sport === "ufc" ? "card approaches" : "matches kick off"} —
          the next one appears when the following slate is priced.
        </p>
      )}

      {/*
        THE RECORD, STATED RATHER THAN OMITTED. These lanes have settled nothing yet. A product page
        that simply showed no record would read as a clean slate; saying so is the difference between
        "nothing has been graded" and "nothing has gone wrong".
      */}
      <p className="mt-6" style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--vault-text-mute)" }}>
        No {lane.label} card has been settled yet, so this lane has no win/loss record to show. Every leg
        here settles from an official result once the {params.sport === "ufc" ? "card is fought" : "matches finish"} —
        a card that could not be graded would never be published.
      </p>

      {/*
        "ONCE THE CARD IS FOUGHT" STOPPED BEING THE WHOLE ANSWER.
        The 2026-08-22 card was fought and its cards still read pending, because the corpus we grade
        UFC from is published by a third party and had reached only 2026-08-15. The sentence above is
        about OUR rule; this one is about the world, and without it a reader is left to assume the
        delay says something about the cards. It says nothing about them at all.
      */}
      {coverageNote ? (
        <p className="mt-3" style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--vault-text-faint)" }}>
          {coverageNote}
        </p>
      ) : null}

      <nav className="mt-4 flex flex-wrap gap-3" style={{ fontSize: 12.5 }}>
        <Link href={lane.hub} style={{ color: "var(--gtp-bank-cta)" }}>← {lane.hubLabel}</Link>
        <Link href="/results" style={{ color: "var(--vault-text-mute)" }}>Settled track record → Results</Link>
        <Link href="/methodology" style={{ color: "var(--vault-text-mute)" }}>How everything is graded → Methodology</Link>
      </nav>
    </main>
  );
}
