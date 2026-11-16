/**
 * THE LINE BESIDE A HISTORY (NFL Recent form panel, Trends): a hit rate is shown only against the line the game page's
 * line section displays for that player and family, and wherever it is shown the reader sees that line value, the
 * sportsbook (the section's own book label) and when it was captured (ET, the section's own format).
 *
 * SOURCE: the OPEN line rows for the game — lib/sports/nfl/line-display-open.mjs nflOpenLineRecords (switch on AND a
 * readable line artifact). NEVER the public board's per-player offer slot: the section reads the artifact, so a slot
 * (absent on current boards, possibly different when present) would show a line the section does not.
 * SELECTION: exactly the section's — nflPropLineInputs (identity: event + roster playerId + market; nflChooseOffer: the
 * latest eligible, unambiguous capture before kickoff) and nflCompareToLine (eligibility, kickoff, 12 h freshness at
 * `asOf`). A pair the section would compare (COMPARED or DIRECTION_WITHHELD) is OBSERVED with that line; anything else
 * carries a no-hit-rate state. Only PUBLISHED over/under families (the section's scope); anytime TD is a yes/no price,
 * never a line, so it has no entry.
 * SERVER ONLY (imports the line adapter; nothing "use client" may import it).
 *
 * States:
 *   NO_LINE            the rows hold no line for this player and market
 *   WITHHELD           only an ineligible operator's line ⇒ withheld, no hit rate
 *   NOT_BEFORE_KICKOFF the only line was captured at/after kickoff ⇒ no hit rate
 *   UNUSABLE           a line exists but the section does not compare it (stale, ambiguous, suspended, invalid)
 *   OBSERVED           { line, lineText, book, sportsbook (label), capturedAt, captured (ET) } ⇒ a record may be computed
 */
import { NFL_FAMILIES, NFL_PROP_LINE_ADAPTER, nflCompareToLine, nflPropLineInputs } from "./prop-line-adapter.mjs";
import { lineText, quoteTimeEt } from "../../odds/prop-line-view.mjs";
import { formatLineCaption } from "./trends-wire.mjs";

const STATE_OF_REASON = Object.freeze({ NO_LINE: "NO_LINE", INELIGIBLE: "WITHHELD", CAPTURED_AFTER_KICKOFF: "NOT_BEFORE_KICKOFF" });

/**
 * Line views for one game, keyed `${playerId}|${boardFamily}` (board family: player_receptions, player_reception_yds, …).
 * null when `rows` is null (the rule is closed: no line content at all).
 * @param {{ board: any, rows: any[] | null, asOf: string }} input  `asOf`: the section's comparison instant
 * @returns {Record<string, any> | null}
 */
export function nflEvidenceLines({ board, rows, asOf }) {
  if (!board || !Array.isArray(rows)) return null;
  const families = Object.entries(NFL_FAMILIES).filter(([, d]) => d.kind === "OU" && board.families?.[d.board]?.state === "PUBLISHED").map(([f]) => f);
  const { inputs } = nflPropLineInputs({ board, offers: rows, asOf, withLineOnly: false, families });
  const out = {};
  for (const i of inputs) {
    if (i.familyState !== "PUBLISHED" || i.projection == null) continue; // the section never compares it
    const key = `${i.player.id}|${NFL_FAMILIES[i.marketKey].board}`;
    const c = nflCompareToLine(i);
    out[key] = c.direction !== "UNAVAILABLE"
      ? { state: "OBSERVED", line: c.line, lineText: lineText(c.line), book: c.book, sportsbook: NFL_PROP_LINE_ADAPTER.bookLabel(c.book), capturedAt: c.capturedAt, captured: quoteTimeEt(c.capturedAt) }
      : { state: STATE_OF_REASON[c.reason] ?? "UNUSABLE", reason: c.reason };
  }
  return out;
}

/** "55.5 at DraftKings, captured Nov 15, 12:00 PM ET" for an OBSERVED line view; null otherwise. */
export function lineCaption(v) {
  return v?.state === "OBSERVED" ? formatLineCaption(v.lineText ?? String(v.line), v.sportsbook, v.captured) : null;
}

/** The sentence a surface prints when no hit rate is shown, by state (OBSERVED ⇒ null). */
export const NO_RATE_TEXT = Object.freeze({
  NO_LINE: "No sportsbook line was captured for this market before kickoff, so no hit rate is shown.",
  WITHHELD: "A sportsbook line exists for this market, but its operator is not on the eligible list, so the line is withheld and no hit rate is shown.",
  NOT_BEFORE_KICKOFF: "The captured line has no capture time before kickoff, so no hit rate is shown.",
  UNUSABLE: "A sportsbook line was captured for this market, but it is not one we compare against (too old, ambiguous or suspended), so no hit rate is shown.",
});
