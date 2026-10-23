/**
 * LEVEL A · NBA GAME-WINNER TIERS (`nba-game-winner-tiers@1`). PURE. The rule in
 * docs/LEVEL_A_NBA_GAME_WINNER_TIERING_RULE.md (ACCEPTED FOR IMPLEMENTATION, release owner 2026-10-23), step 1 of its
 * §9: legs, refusals, joint, bands, selection and copy text, against an INJECTED display accessor.
 *
 * NO REAL ACCESSOR YET. The NBA model session owns the Elo game-winner probability display and its accessor. Until its
 * PR exists this module reads only the `DisplayProbability` shape below, built by an adapter that lands with step 2
 * (stacked on that PR). Tests use a FIXTURE accessor. Nothing here reads a receipt's probability, a simulation or a
 * market price: the accessor is the ONE probability source, and null from it means untiered.
 *
 * @typedef {object} DisplayProbability   what the display accessor publishes for one game (null when the display is
 *                                         OFF or the game is gated)
 * @property {string} eventId
 * @property {number} pHome                the published Elo home-win probability, exactly as the display holds it
 * @property {{ home: string, away: string }} shown   the % text the display shows for each side (its own rounding)
 * @property {number} decimals             the display's % precision (leg text only; the joint is shown at 1 dp)
 * @property {string} frozenAt             the frozen receipt the display read
 * @property {string} payloadSha256        that receipt's payload hash
 * @property {string} validationLabel      the display's own label constant (imported there, passed through here)
 * @property {string} source               the display's provenance line
 *
 * Switch: NBA_GAME_WINNER_TIERS_PUBLIC (default false), separate from LEVEL_A_SUGGESTIONS_PUBLIC.
 */
import { PUBLIC_RISK_TIERS, PUBLIC_RISK_LABELS } from "../../parlays/risk-odds-bands.mjs";
import { BAND_MAX_LEGS } from "../../parlays/multi-sport.mjs";
import { tierForJoint } from "./suggestions.mjs";

export const NBA_GW_POLICY = "nba-game-winner-tiers@1";
export const NBA_GW_RULE_DOC = "docs/LEVEL_A_NBA_GAME_WINNER_TIERING_RULE.md";

/** THE SWITCH. One committed constant, default false; flipped only after §7 verification and a founder go. */
export const NBA_GAME_WINNER_TIERS_PUBLIC = false;
export const NBA_GW_FLAG = "NEXT_PUBLIC_NBA_GAME_WINNER_TIERS";
export const nbaGameWinnerTiersEnabled = (env = { [NBA_GW_FLAG]: process.env.NEXT_PUBLIC_NBA_GAME_WINNER_TIERS }) => NBA_GAME_WINNER_TIERS_PUBLIC || env[NBA_GW_FLAG] === "1";

export const NBA_GW_REFUSAL = Object.freeze({
  NOT_NBA_GAME_WINNER: "not an NBA game-winner leg",
  NO_PUBLISHED_PROBABILITY: "Untiered: no published NBA win probability",
  PROVENANCE_MISMATCH: "the published probability is not from the same frozen forecast as the side",
  SIDE_DISAGREES: "the official side is not the team the published probability favours",
  BAD_PROBABILITY: "the published probability is not a valid probability",
});

export const NBA_GW_DEPENDENCY = "Assumes the games are independent: every leg is a different NBA game, so no two legs share a team, but same-night results can still be related (travel, schedule, league-wide scoring) and that is not modelled.";
/** The Low band's upper edge, from the D2 bands: a joint above it is shorter than Low and is not tiered. */
const SHORTER_THAN_LOW = "shorter than the Low band, so not tiered";

/**
 * The joint as shown. 1 dp, the same as every Level A card ("model joint probability 22.1%", the text the recorder
 * matches). The tier is decided on the EXACT joint (its rounded fair price, D2) and is never moved to fit the text; but
 * just past a band edge the 1 dp text can read as the neighbouring band (0.4987 is Medium at +101, yet "49.9%" bands as
 * Low). Then, for that card only, add decimals until the shown number bands where the card does (at most 4 dp).
 */
export function jointShownFor(joint, tier) {
  for (let d = 1; d <= 4; d += 1) {
    const text = (joint * 100).toFixed(d);
    if (tierForJoint(Number(text) / 100) === tier) return `${text}%`;
  }
  return `${(joint * 100).toFixed(4)}%`;
}

/**
 * One NBA game-winner leg: the Level A NBA side (already through the Level A leg gates) + the display's number.
 * @param {object} leg   a Level A leg: { sport, eventId, market, selection: { code }, forecast: { stampedAt } }
 * @param {DisplayProbability | null} d
 * @param {{ payloadSha256: string } | null} receipt   the side's own frozen receipt (the lane game's `receipt`), for the
 *   §1.4 cross-check. Passed in, not carried on the leg, so the untiered Level A output is unchanged by this rule.
 */
export function nbaGameWinnerLeg(leg, d, receipt) {
  if (leg?.sport !== "nba" || leg?.market !== "winner" || !["home", "away"].includes(leg?.selection?.code)) return { ok: false, code: "NOT_NBA_GAME_WINNER", leg };
  if (d == null) return { ok: false, code: "NO_PUBLISHED_PROBABILITY", leg };
  if (!(typeof d.pHome === "number" && d.pHome > 0 && d.pHome < 1)) return { ok: false, code: "BAD_PROBABILITY", leg };
  if (String(d.eventId) !== String(leg.eventId) || d.frozenAt !== leg.forecast?.stampedAt || !d.payloadSha256 || d.payloadSha256 !== receipt?.payloadSha256) return { ok: false, code: "PROVENANCE_MISMATCH", leg };
  const side = leg.selection.code;
  const p = side === "home" ? d.pHome : 1 - d.pHome;
  if (!(p >= 0.5)) return { ok: false, code: "SIDE_DISAGREES", leg };
  const shown = d.shown?.[side];
  if (typeof shown !== "string") return { ok: false, code: "BAD_PROBABILITY", leg };
  return {
    ok: true,
    leg: { ...leg, probability: p, shownPct: shown, decimals: d.decimals, validationLabel: d.validationLabel, display: { source: d.source, frozenAt: d.frozenAt, payloadSha256: d.payloadSha256 }, tierable: true, priced: false, price: null },
  };
}

function* combos(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc; return; }
  for (let i = start; i <= arr.length - (k - acc.length); i += 1) yield* combos(arr, k, i + 1, [...acc, arr[i]]);
}
const keyOf = (legs) => legs.map((l) => String(l.eventId)).sort().join("|");

function cardOf(legs, tier) {
  const joint = legs.reduce((p, l) => p * l.probability, 1);
  const tierOfJoint = tierForJoint(joint);
  return {
    policy: NBA_GW_POLICY, tier, tierLabel: PUBLIC_RISK_LABELS[tier], legs, sports: ["nba"],
    jointProbability: joint, jointShown: jointShownFor(joint, tierOfJoint),
    dependency: NBA_GW_DEPENDENCY,
    validationLabel: legs[0].validationLabel,
    whySelected: `Each leg is the official NBA side with its published Elo win probability; this is the combination with the highest joint probability in the ${PUBLIC_RISK_LABELS[tier]} band (${legs.length} legs).`,
    priced: false, price: null, payout: null,
  };
}

/**
 * The NBA game winners block. `accessor(eventId)` → DisplayProbability | null; `receiptOf(eventId)` → the side's
 * frozen receipt ({ payloadSha256 }) | null.
 * @returns {{ policy, public: boolean, tiers: Array<{ tier, tierLabel, card, reason }>, legs, untiered: Array<{ leg, code, reason }> }}
 */
export function nbaGameWinnerTiers({ legs = [], accessor, receiptOf = () => null, enabled = nbaGameWinnerTiersEnabled() }) {
  const graded = legs.map((l) => { let d = null; try { d = accessor?.(l.eventId) ?? null; } catch { d = null; } return nbaGameWinnerLeg(l, d, receiptOf(l.eventId)); });
  const ok = [];
  const seen = new Set();
  for (const g of graded) if (g.ok && !seen.has(String(g.leg.eventId))) { seen.add(String(g.leg.eventId)); ok.push(g.leg); } // one leg per game
  const untiered = graded.filter((g) => !g.ok).map((g) => ({ leg: g.leg, code: g.code, reason: NBA_GW_REFUSAL[g.code] }));
  const shorter = new Set();
  const tiers = PUBLIC_RISK_TIERS.map((tier) => {
    let top = null;
    for (let k = 2; k <= BAND_MAX_LEGS[tier]; k += 1) {
      if (k > ok.length) break;
      for (const c of combos(ok, k)) {
        const joint = c.reduce((p, l) => p * l.probability, 1);
        const t = tierForJoint(joint);
        if (t == null) { shorter.add(keyOf(c)); continue; }
        if (t !== tier) continue;
        if (!top || joint > top.joint || (joint === top.joint && keyOf(c) < keyOf(top.c))) top = { c, joint };
      }
    }
    return { tier, tierLabel: PUBLIC_RISK_LABELS[tier], card: top ? cardOf([...top.c], tier) : null, reason: null };
  });
  for (const t of tiers) if (!t.card) {
    t.reason = ok.length < 2
      ? `an NBA game-winner card needs 2 games with a published win probability; ${ok.length === 0 ? "none has" : "only 1 has"} one`
      : t.tier === "low" && shorter.size
        ? `no combination lands in the Low Risk band; ${shorter.size} combination${shorter.size === 1 ? " is" : "s are"} ${SHORTER_THAN_LOW}`
        : `no combination of today's NBA game winners lands in the ${t.tierLabel} band`;
  }
  return { policy: NBA_GW_POLICY, public: enabled === true, tiers, legs: ok, untiered, shorterThanLow: shorter.size };
}

/** The cards that may be recorded: only while the block is public, i.e. only cards readers saw. */
export function recordableNbaGameWinnerCards(block) {
  if (block?.public !== true) return [];
  return (block.tiers ?? []).map((t) => t.card).filter(Boolean);
}

/** Copyable plain text for one card. The display's own % text; no link, no price. */
export function nbaGameWinnerCopyText(card) {
  if (!card) return "";
  const lines = [`GameTimePicks NBA game winners · ${card.tierLabel} · ${card.legs.length} legs · paper only, no price`];
  for (const l of card.legs) lines.push(`- ${l.eventLabel}: ${l.selection.label} · published Elo win probability ${l.shownPct}`);
  lines.push(`Model joint probability ${card.jointShown} (${card.dependency.split(":")[0].toLowerCase()}).`);
  lines.push(card.validationLabel);
  lines.push("Not a bet and not a price. Check any sportsbook's own line before acting.");
  return lines.join("\n");
}
