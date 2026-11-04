/**
 * RESULTS FOR THE SUGGESTED CARDS. PURE. Grades every card in one `gtp.suggested-cards@1` file (the same file the pages
 * and social read) against official finals, so the record can never describe a card nobody was shown.
 *
 * NBA legs settle on the write-once finals record (sports/nba/finals-record.mjs finalFor): WIN when the official side
 * won, LOSS otherwise. A game the record does not hold is PENDING, and one under review stays UNDER_REVIEW: neither is
 * ever read as a loss. A card is WIN only when every leg won, LOSS as soon as one leg lost, otherwise PENDING. Other
 * sports' legs stay PENDING here until their own grader is wired (their Level A record already settles them).
 * Paper only: no stake, no payout, no ROI — there is no price.
 */
import { finalFor } from "../../sports/nba/finals-record.mjs";
import { verifySuggestedCards } from "./daily-cards.mjs";

export const GRADE_SCHEMA = "gtp.suggested-cards.grade@1";

export function gradeLeg(leg, finals) {
  if (leg.sport !== "nba") return { legId: leg.legId, state: "PENDING", note: "graded by its own sport's settlement" };
  const f = finalFor(finals, leg.eventId);
  if (f.state === "PENDING") return { legId: leg.legId, state: "PENDING" };
  if (f.state !== "FINAL") return { legId: leg.legId, state: "UNDER_REVIEW" };
  return { legId: leg.legId, state: f.winnerSide === leg.selection.code ? "WIN" : "LOSS", final: { home: f.home, away: f.away, ftHome: f.ftHome, ftAway: f.ftAway } };
}

export function gradeCard(card, finals) {
  const legs = card.legs.map((l) => gradeLeg(l, finals));
  const state = legs.some((l) => l.state === "LOSS") ? "LOSS" : legs.every((l) => l.state === "WIN") ? "WIN" : "PENDING";
  return { id: card.id, policy: card.policy, tier: card.tier, jointProbability: card.jointProbability, state, legs };
}

/** Every card in the file: Bank Builder, Moonshot and each parlay tier, NBA-only and cross-sport. */
export function gradeSuggestedCards(doc, finals) {
  if (!verifySuggestedCards(doc)) throw new Error("gradeSuggestedCards: the file's content digest does not verify; refusing to grade an altered card file");
  const sections = [
    ...["nba", "cross"].flatMap((s) => [["bank-builder", s, doc.bankBuilder?.[s]], ["moonshot", s, doc.moonshot?.[s]]]),
    ...["nba", "cross"].flatMap((s) => (doc.parlays?.[s] ?? []).map((t) => [`parlay-${t.tier}`, s, t])),
  ];
  const cards = sections.filter(([, , x]) => x?.card).map(([product, scope, x]) => ({ product, scope, ...gradeCard(x.card, finals) }));
  return { schema: GRADE_SCHEMA, productDay: doc.productDay, source: { schema: doc.schema, contentSha256: doc.contentSha256 }, cards };
}
