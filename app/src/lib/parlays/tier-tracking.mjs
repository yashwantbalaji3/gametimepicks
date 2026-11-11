/**
 * PARLAY LAB · TIER PERFORMANCE (checklist row H, 2026-11-11). PURE: no fs, no clock (the caller passes `today`).
 *
 * Built ONLY from the frozen card ledger and its official settlement — the Level A suggestions record and its grades,
 * as lib/results/level-a-record.mjs already pairs them (an entry's result is its grade row's; no grade row ⇒ PENDING).
 * Nothing is regraded and no new rule is introduced:
 *   frozen    cards recorded (each card is written once, as shown, before its first leg started)
 *   settled   cards with a final grade (won + lost + void)
 *   won/lost  the card's graded result; VOID and PENDING are never a loss and are counted apart
 *   hit rate  ALWAYS "won of decided" (decided = won + lost) with its denominator; a percentage only from the site's
 *             own sample rule (MIN_DECIDED_FOR_RATE, graded-picks ASSESSABLE_MIN), below it counts only
 *   returns   NOT TRACKED: the record holds no price (priced: false) and there are no verified prices, so no ROI, payout
 *             or odds figure exists anywhere in this module's output
 *
 * WINDOWS by the card's product day (ET) against `today` (ET): today · last 3 days · last 7 · last 30 · this season ·
 * all-time. "This season": every leg's game is in its sport's current season (calendar conventions, not model inputs:
 * NBA Aug–Jul, NFL Mar–Feb league year, EPL/Ligue 1 Jul–Jun, MLB the calendar year).
 * GROUPS: per tier (Low · Medium · High · Longshot · Untiered) and, inside a tier, per sport — a card whose legs span
 * sports is "mixed", never split across sports.
 */
import { MIN_DECIDED_FOR_RATE } from "../results/level-a-record.mjs";

export const TIER_TRACKING_SCHEMA = "gtp.parlay-tier-tracking@1";
export const RETURNS_NOTE = "returns not tracked: no verified prices";
export const WINDOWS = Object.freeze([
  { key: "day", label: "Today", days: 1 },
  { key: "3d", label: "Last 3 days", days: 3 },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "season", label: "This season", days: null },
  { key: "all", label: "All-time", days: null },
]);
export const TIER_ORDER = Object.freeze(["low", "medium", "high", "longshot", "untiered"]);
export const SPORT_LABEL = Object.freeze({ nba: "NBA", nfl: "NFL", mlb: "MLB", epl: "Premier League", "ligue-1": "Ligue 1", mixed: "Mixed sports" });
const SPORT_ORDER = ["nfl", "nba", "mlb", "epl", "ligue-1", "mixed"];

const DAY = 864e5;
const dayMs = (d) => Date.parse(`${d}T12:00:00Z`);
/** Days from `day` back to `today` (0 = today), or null for a malformed day. */
export const ageDays = (day, today) => { const a = dayMs(day), b = dayMs(today); return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / DAY) : null; };

/** The season a game on ET date `d` belongs to, per sport (calendar conventions). */
export function seasonOf(sport, d) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(d ?? ""));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  if (sport === "nba") return mo >= 8 ? y : y - 1;
  if (sport === "nfl") return mo >= 3 ? y : y - 1;
  if (sport === "epl" || sport === "ligue-1") return mo >= 7 ? y : y - 1;
  if (sport === "mlb") return y;
  return null;
}
const legDay = (l) => (l.startUtc ? new Date(Date.parse(l.startUtc)).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : null);

/** Is a card in window `w` on `today`? */
export function inWindow(card, w, today) {
  if (w.key === "all") return true;
  if (w.key === "season") return (card.legs ?? []).length > 0 && card.legs.every((l) => { const s = seasonOf(l.sport, legDay(l) ?? card.productDay); return s != null && s === seasonOf(l.sport, today); });
  const a = ageDays(card.productDay, today);
  return a != null && a >= 0 && a < w.days;
}

export const cardSport = (card) => { const s = [...new Set((card.legs ?? []).map((l) => l.sport))]; return s.length === 1 ? s[0] : "mixed"; };

const zero = () => ({ frozen: 0, settled: 0, won: 0, lost: 0, void: 0, pending: 0 });
function tally(cards) {
  const t = zero();
  for (const c of cards) {
    t.frozen += 1;
    if (c.status === "WON") { t.won += 1; t.settled += 1; }
    else if (c.status === "LOST") { t.lost += 1; t.settled += 1; }
    else if (c.status === "VOID") { t.void += 1; t.settled += 1; }
    else t.pending += 1;
  }
  const decided = t.won + t.lost;
  return { ...t, decided, hit: { won: t.won, of: decided, rate: decided >= MIN_DECIDED_FOR_RATE ? t.won / decided : null } };
}

/**
 * The tier-performance model.
 * @param {Array<{ id, productDay, tier, tierLabel, status, legs: Array<{ sport, startUtc }> }>} entries  levelARecord().entries
 * @param {{ today: string, asOf?: object }} o  today = the build's ET date
 */
export function tierPerformance(entries, { today, asOf = null }) {
  const cards = (entries ?? []).filter((e) => e && e.tier);
  const tierLabelOf = new Map(cards.map((c) => [c.tier, c.tierLabel ?? c.tier]));
  const rank = (t) => { const i = TIER_ORDER.indexOf(t); return i < 0 ? TIER_ORDER.length : i; };
  const tiers = [...new Set(cards.map((c) => c.tier))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const windows = WINDOWS.map((w) => {
    const inW = cards.filter((c) => inWindow(c, w, today));
    return {
      key: w.key, label: w.label,
      total: tally(inW),
      tiers: tiers.map((tier) => {
        const t = inW.filter((c) => c.tier === tier);
        const sports = [...new Set(t.map(cardSport))].sort((a, b) => SPORT_ORDER.indexOf(a) - SPORT_ORDER.indexOf(b));
        return { tier, label: tierLabelOf.get(tier), ...tally(t), bySport: sports.map((s) => ({ sport: s, label: SPORT_LABEL[s] ?? s, ...tally(t.filter((c) => cardSport(c) === s)) })) };
      }),
    };
  });
  return { schema: TIER_TRACKING_SCHEMA, today, asOf, minDecidedForRate: MIN_DECIDED_FOR_RATE, returns: RETURNS_NOTE, windows };
}

/** The hit record in words, always with its denominator: "4 won of 9 decided" (+ "· 44%" only from the minimum). */
export function hitText(h) {
  if (!h.of) return "no decided card yet";
  return `${h.won} won of ${h.of} decided${h.rate == null ? "" : ` · ${Math.round(h.rate * 100)}%`}`;
}

/**
 * One card's history for the drawer — exactly as frozen, plus its settlement: each leg's frozen forecast version
 * (model + stamp), the eligibility recorded at freeze (or "not recorded"), and the leg's graded outcome.
 */
export function cardHistory(e) {
  return {
    id: e.id, productDay: e.productDay, tier: e.tier, tierLabel: e.tierLabel ?? e.tier, label: e.label ?? null, sport: cardSport(e),
    status: e.status, shownAt: e.servedFrom ?? e.shownAt ?? null, source: e.source ?? null, revisionOf: e.revisionOf ?? null, gradedAt: e.gradedAt ?? null,
    legs: (e.legs ?? []).map((l) => ({
      sport: l.sport, eventId: l.eventId, eventLabel: l.eventLabel ?? null, startUtc: l.startUtc ?? null, selection: l.selection ?? null,
      forecast: { modelId: l.modelId ?? null, stampedAt: l.stampedAt ?? null },
      eligibility: l.eligibility ?? null,
      outcome: l.result ?? "PENDING", final: l.final ?? null,
    })),
  };
}
