/**
 * THE ONE NFL LINE-DISPLAY RULE FOR A GAME (founder 2026-11-16: one canonical rule, never duplicated or approximated).
 * SERVER / BUILD TIME ONLY (reads the encrypted line artifact via public-line-records.mjs; nothing "use client" may
 * import it: nfl-prop-lines-switch-off.test.mjs walks the client graph).
 *
 *   open(eventId) = display.public (NFL_LINE_DISPLAY, the display authorization record)
 *                   AND a readable line artifact for that game (nflPublicLineRecords(eventId) != null)
 *
 * Every NFL surface that may print line content for a game asks THIS module: the game page's line section
 * (withNflPropLines), the game page's Recent form panel, and /nfl/trends (per game). line-display-open.test.mjs fails
 * if a surface computes the gate any other way.
 *
 * Memoised per process per (eventId, appRoot = cwd, display key, lines dir): one artifact read per game per build, while
 * a different key / directory (tests, a re-keyed build) is a different entry. A read that throws (tampered or invalid
 * artifact — a release error) is never cached. The switch is checked first: while off, nothing is read.
 */
import crypto from "node:crypto";
import { NFL_LINE_DISPLAY } from "./line-display.mjs";
import { NFL_LINES_DIR_ENV, nflPublicLineRecords } from "./public-line-records.mjs";
import { ODDS_DISPLAY_KEY_ENV } from "../../odds/display-crypto.mjs";

const memo = new Map();
const keyOf = (eventId) => {
  const k = process.env[ODDS_DISPLAY_KEY_ENV];
  const kh = k == null || String(k).trim() === "" ? "" : crypto.createHash("sha256").update(String(k)).digest("hex");
  return [eventId, process.cwd(), kh, process.env[NFL_LINES_DIR_ENV] ?? ""].join("\0");
};

/**
 * The game's authorized offer rows when the rule is open, else null. Rows may be [] (an artifact with no usable line:
 * the line section's NO_LINES state) — that is still OPEN.
 * @param {string} eventId @param {{ public: boolean }} [display]
 */
export function nflOpenLineRecords(eventId, display = NFL_LINE_DISPLAY) {
  if (!display?.public) return null;
  const id = String(eventId ?? "");
  const k = keyOf(id);
  if (memo.has(k)) return memo.get(k);
  const rows = nflPublicLineRecords(id);
  memo.set(k, rows);
  return rows;
}

/** THE RULE: may this game's surfaces print line content? @param {string} eventId @param {{ public: boolean }} [display] */
export function nflLineDisplayOpen(eventId, display = NFL_LINE_DISPLAY) {
  return nflOpenLineRecords(eventId, display) != null;
}
