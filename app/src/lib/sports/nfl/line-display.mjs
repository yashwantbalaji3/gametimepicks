/**
 * NFL SPORTSBOOK-LINE DISPLAY SWITCH — DERIVED, never edited here (the NBA pattern: lib/sports/nba/line-board.mjs
 * nbaLineDisplayFrom). The one record is lib/odds/display-authorization.mjs (`nfl` entry; site authorized 2026-10-29, social off);
 * every NFL line surface (the game page's player-prop section, any summary) reads NFL_LINE_DISPLAY, and the build-time
 * reader (public-line-records.mjs) re-checks the record before it reads a file. There is no second switch.
 * Server-only by convention (nothing "use client" may import it: nfl-prop-lines-switch-off.test.mjs).
 */
import { displayAuthorization, NOT_AUTHORIZED_REASON } from "../../odds/display-authorization.mjs";

/** `public` = the "site" surface, `social` = the "social" surface, `socialPrices` = prices/books in the social feed. */
export function nflLineDisplayFrom(record) {
  const site = displayAuthorization("nfl", "site", record), social = displayAuthorization("nfl", "social", record);
  return Object.freeze({
    public: site.ok,
    social: social.ok,
    socialPrices: displayAuthorization("nfl", "socialPrices", record).ok,
    reason: site.ok && social.ok ? null : NOT_AUTHORIZED_REASON.nfl,
  });
}

/** THE NFL DISPLAY SWITCH. Committed record (2026-10-29): public (site) on, social off. */
export const NFL_LINE_DISPLAY = nflLineDisplayFrom(undefined);
