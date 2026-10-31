/**
 * NFL LINES FOR FOUNDER-REVIEW GRAPHICS: reads the saved private captures under ~/gtp-private/odds/nfl/<stamp>/capture-*.json.
 * No key, no network, no clock. A later capture of a refresh run is picked up on its own, so the rerender keeps its dedupeId.
 * Never a page or route import; nothing here reaches the repository.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { REFERENCE_BOOK_ORDER } from "../../src/lib/sports/nba/line-comparison.mjs";
import { isEligibleOperator } from "../../src/lib/sports/odds/eligible-operators.mjs";
import { nflChooseOffer, nflOffersFromCapture } from "../../src/lib/sports/nfl/prop-line-adapter.mjs";

export const NFL_ODDS_DIR = () => path.join(os.homedir(), "gtp-private", "odds", "nfl");
/** Order and size of the combined props. */
export const NFL_PROP_SLOTS = Object.freeze([
  Object.freeze({ family: "player_pass_yds", label: "PASS YDS", rows: 2 }),
  Object.freeze({ family: "player_rush_yds", label: "RUSH YDS", rows: 4 }),
  Object.freeze({ family: "player_reception_yds", label: "REC YDS", rows: 6 }),
  Object.freeze({ family: "player_receptions", label: "REC", rows: 4 }),
]);

const rank = (b) => { const i = REFERENCE_BOOK_ORDER.indexOf(b); return i === -1 ? REFERENCE_BOOK_ORDER.length : i; };
const american = (p) => Number.isInteger(p) && Math.abs(p) >= 100;

/** Every saved capture, flattened. Moneyline rows carry the canonical event id from the capture's own join. */
export function loadNflCaptures(dir = NFL_ODDS_DIR()) {
  const out = { refs: [], offers: [], moneylines: [] };
  if (!fs.existsSync(dir)) return out;
  for (const stamp of fs.readdirSync(dir).filter((d) => /^\d{8}T\d{6}Z$/.test(d)).sort()) {
    for (const f of fs.readdirSync(path.join(dir, stamp)).filter((x) => /^capture-.*\.json$/.test(x)).sort()) {
      const bytes = fs.readFileSync(path.join(dir, stamp, f));
      const doc = JSON.parse(bytes.toString("utf8"));
      if (doc.artifact !== "nfl-odds-capture") continue;
      out.refs.push({ ref: `gtp-private/odds/nfl/${stamp}/${f}`, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
      out.offers.push(...nflOffersFromCapture(doc));
      const lineage = doc.join?.lineage ?? {};
      for (const r of doc.rows ?? []) if (r.marketType === "h2h" && lineage[r.providerEventId]) out.moneylines.push({ ...r, canonicalEventId: lineage[r.providerEventId] });
    }
  }
  return out;
}

/** The latest clean pre-kickoff quote for a side, by the reference book order; a two-way market only, never inferred. */
export function nflMoneylineQuote(rows, { eventId, awayName, homeName, sideName, kickoffUtc, asOf }) {
  const kick = Date.parse(kickoffUtc); const now = Date.parse(asOf);
  const clean = rows.filter((r) => {
    const t = Date.parse(r.capturedAt);
    const o = r.outcomes ?? [];
    return r.canonicalEventId === `nfl-${eventId}` && t < kick && t <= now && isEligibleOperator(r.bookmaker) && o.length === 2 && [awayName, homeName].every((n) => o.filter((x) => x.name === n).length === 1) && o.every((x) => american(x.price));
  }).sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt) || rank(a.bookmaker) - rank(b.bookmaker) || a.bookmaker.localeCompare(b.bookmaker));
  const r = clean[0];
  return r ? { book: r.bookmaker, price: r.outcomes.find((x) => x.name === sideName).price, quotedAt: r.capturedAt } : null;
}

/** The one shared offer rule for a player and market. Null for an ineligible, ambiguous or post-kickoff quote. */
export function nflPropOffer(offers, { eventId, playerId, market, kickoffUtc, asOf }) {
  const mine = offers.filter((o) => o.canonicalEventId === `nfl-${eventId}` && o.playerId === playerId && o.market === (market === "anytime_td" ? "player_anytime_td" : market) && Date.parse(o.capturedAt) <= Date.parse(asOf));
  const q = nflChooseOffer(mine, kickoffUtc);
  if (!q || q.eligible === false || q.ambiguous || !(Date.parse(q.capturedAt) < Date.parse(kickoffUtc))) return null;
  return { ...q, quotedAt: q.capturedAt };
}
