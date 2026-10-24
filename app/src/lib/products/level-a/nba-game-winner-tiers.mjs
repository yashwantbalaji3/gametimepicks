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
 * @property {string} label                the display's name for the number (its ELO_WIN_PROBABILITY_LABEL), passed through
 * @property {string} source               the display's provenance line
 *
 * Switch: NBA_GAME_WINNER_TIERS_PUBLIC, separate from LEVEL_A_SUGGESTIONS_PUBLIC (on since Release H, 2026-10-24).
 */
import { PUBLIC_RISK_TIERS, PUBLIC_RISK_LABELS } from "../../parlays/risk-odds-bands.mjs";
import { BAND_MAX_LEGS } from "../../parlays/multi-sport.mjs";
import { jointShownFor, tierForJoint } from "./suggestions.mjs";

export const NBA_GW_POLICY = "nba-game-winner-tiers@1";
export const NBA_GW_RULE_DOC = "docs/LEVEL_A_NBA_GAME_WINNER_TIERING_RULE.md";

/** THE SWITCH. One committed constant. Flipped to true in Release H (2026-10-24) after the §7 evidence on the committed
 *  10-24 lane matched (founder conditional approval 2026-10-23: no further routine go). Rollback = set it back to false. */
export const NBA_GAME_WINNER_TIERS_PUBLIC = true;
export const NBA_GW_FLAG = "NEXT_PUBLIC_NBA_GAME_WINNER_TIERS";
export const nbaGameWinnerTiersEnabled = (env = { [NBA_GW_FLAG]: process.env.NEXT_PUBLIC_NBA_GAME_WINNER_TIERS }) => NBA_GAME_WINNER_TIERS_PUBLIC || env[NBA_GW_FLAG] === "1";

export const NBA_GW_REFUSAL = Object.freeze({
  NOT_NBA_GAME_WINNER: "not an NBA game-winner leg",
  NO_PUBLISHED_PROBABILITY: "Untiered: no published Elo-derived game-winner estimate",
  PROVENANCE_MISMATCH: "the published probability is not from the same frozen forecast as the side",
  SIDE_DISAGREES: "the official side is not the team the published probability favours",
  BAD_PROBABILITY: "the published probability is not a valid probability",
});

export const NBA_GW_DEPENDENCY = "Assumes the games are independent: every leg is a different NBA game, so no two legs share a team, but same-night results can still be related (travel, schedule, league-wide scoring) and that is not modelled.";
/** The Low band's upper edge, from the D2 bands: a joint above it is shorter than Low and is not tiered. */
const SHORTER_THAN_LOW = "shorter than the Low band, so not tiered";

/** The joint is shown by Level A's one joint text (suggestions.mjs jointShownFor): 1 dp, band-edge safe. */
export { jointShownFor };

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
  /* Strictly above 0.5: the display's own consistency rule (FAVOURED home ⇔ pHome > 0.5; exactly 0.5 is TOO_CLOSE, no side). */
  if (!(p > 0.5)) return { ok: false, code: "SIDE_DISAGREES", leg };
  const shown = d.shown?.[side];
  if (typeof shown !== "string") return { ok: false, code: "BAD_PROBABILITY", leg };
  return {
    ok: true,
    leg: { ...leg, probability: p, shownPct: shown, decimals: d.decimals, label: d.label, display: { source: d.source, frozenAt: d.frozenAt, payloadSha256: d.payloadSha256 }, tierable: true, priced: false, price: null },
  };
}

function* combos(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc; return; }
  for (let i = start; i <= arr.length - (k - acc.length); i += 1) yield* combos(arr, k, i + 1, [...acc, arr[i]]);
}
const keyOf = (legs) => legs.map((l) => String(l.eventId)).sort().join("|");
/** The two teams of a leg's game, from its "AWAY @ HOME" label. */
const teamsOf = (leg) => String(leg.eventLabel ?? "").split(" @ ").map((t) => t.trim()).filter(Boolean);
/** Distinct games AND distinct teams: an NBA team plays once a night, so this only ever rejects a malformed input. */
const independentGames = (c) => {
  const teams = c.flatMap(teamsOf);
  return new Set(c.map((l) => String(l.eventId))).size === c.length && new Set(teams).size === teams.length;
};

/** The product policies of this rule, one family (`nba-game-winner-tiers@1`), graded the same way. */
export const NBA_GW_POLICIES = Object.freeze({
  parlayLab: `${NBA_GW_POLICY}/parlay-lab`,
  bankBuilder: `${NBA_GW_POLICY}/bank-builder`,
  moonshot: `${NBA_GW_POLICY}/moonshot`,
});
/** Bank Builder: conservative, exactly 2 legs in Low or Medium. Moonshot: Longshot, up to BAND_MAX_LEGS.longshot legs. */
export const NBA_GW_PRODUCT_RULES = Object.freeze({
  bankBuilder: { sizes: [2], tiers: ["low", "medium"] },
  moonshot: { sizes: [2, 3, 4, 5].filter((k) => k <= BAND_MAX_LEGS.longshot), tiers: ["longshot"] },
});

function cardOf(legs, tier, policy) {
  const joint = legs.reduce((p, l) => p * l.probability, 1);
  return {
    policy, tier, tierLabel: PUBLIC_RISK_LABELS[tier], legs, sports: ["nba"],
    jointProbability: joint, jointShown: jointShownFor(joint, tierForJoint(joint)),
    dependency: NBA_GW_DEPENDENCY,
    label: legs[0].label,
    whySelected: `Each leg is the official NBA side with its published Elo-derived game-winner estimate; this is the combination with the highest joint probability in the ${PUBLIC_RISK_LABELS[tier]} band (${legs.length} legs).`,
    priced: false, price: null, payout: null,
  };
}

/** The highest-joint combination of `sizes` legs (distinct games and teams) whose band is in `tiers`; ties by event ids. */
function best(ok, sizes, tiers, shorter) {
  let top = null;
  for (const k of sizes) {
    if (k > ok.length) continue;
    for (const c of combos(ok, k)) {
      if (!independentGames(c)) continue;
      const joint = c.reduce((p, l) => p * l.probability, 1);
      const t = tierForJoint(joint);
      if (t == null) { shorter?.add(keyOf(c)); continue; }
      if (!tiers.includes(t)) continue;
      if (!top || joint > top.joint || (joint === top.joint && keyOf(c) < keyOf(top.c))) top = { c: [...c], joint, tier: t };
    }
  }
  return top;
}

const howMany = (sizes) => (sizes.length === 1 ? (sizes[0] === 2 ? "two" : String(sizes[0])) : `${sizes[0]} to ${sizes.at(-1)}`);
const possibleSizes = (sizes, tiers) => sizes.filter((k) => !(tiers.length === 1 && tiers[0] === "longshot" && k < 3)); // two favourites never reach Longshot

/**
 * The NBA game winners block. `accessor(eventId)` → DisplayProbability | null; `receiptOf(eventId)` → the side's
 * frozen receipt ({ payloadSha256 }) | null. One engine for the Parlay Center (a card per tier), Bank Builder and Moonshot.
 */
export function nbaGameWinnerTiers({ legs = [], accessor, receiptOf = () => null, disclosure = null, enabled = nbaGameWinnerTiersEnabled() }) {
  const graded = legs.map((l) => { let d = null; try { d = accessor?.(l.eventId) ?? null; } catch { d = null; } return nbaGameWinnerLeg(l, d, receiptOf(l.eventId)); });
  const ok = [];
  const seen = new Set();
  for (const g of graded) if (g.ok && !seen.has(String(g.leg.eventId))) { seen.add(String(g.leg.eventId)); ok.push(g.leg); } // one leg per game
  const untiered = graded.filter((g) => !g.ok).map((g) => ({ leg: g.leg, code: g.code, reason: NBA_GW_REFUSAL[g.code] }));
  const tooFew = (need) => `an NBA game-winner card needs ${need} games with a published Elo-derived estimate; ${ok.length === 0 ? "none has" : `only ${ok.length} ${ok.length === 1 ? "has" : "have"}`} one`;
  const shorter = new Set();
  const tiers = PUBLIC_RISK_TIERS.map((tier) => {
    const sizes = Array.from({ length: BAND_MAX_LEGS[tier] - 1 }, (_, i) => i + 2);
    const top = best(ok, sizes, [tier], shorter);
    const need = Math.min(...possibleSizes(sizes, [tier]));
    return {
      tier, tierLabel: PUBLIC_RISK_LABELS[tier], card: top ? cardOf(top.c, tier, NBA_GW_POLICIES.parlayLab) : null,
      reason: top ? null : ok.length < need ? tooFew(need)
        : `no ${howMany(possibleSizes(sizes, [tier]))} of tonight's favourites combine into the ${PUBLIC_RISK_LABELS[tier]} band${tier === "low" && shorter.size ? `; ${shorter.size} combination${shorter.size === 1 ? " is" : "s are"} ${SHORTER_THAN_LOW}` : ""}`,
    };
  });
  const product = (rule, policy, name) => {
    const top = best(ok, rule.sizes, rule.tiers, null);
    const sizes = possibleSizes(rule.sizes, rule.tiers);
    const need = Math.min(...sizes);
    return { card: top ? cardOf(top.c, top.tier, policy) : null, reason: top ? null : ok.length < need ? tooFew(need) : `no ${howMany(sizes)} of tonight's favourites combine into the ${rule.tiers.map((t) => PUBLIC_RISK_LABELS[t]).join(" or ")} band (${name})` };
  };
  const bankBuilder = product(NBA_GW_PRODUCT_RULES.bankBuilder, NBA_GW_POLICIES.bankBuilder, "Bank Builder");
  const moonshot = product(NBA_GW_PRODUCT_RULES.moonshot, NBA_GW_POLICIES.moonshot, "Moonshot");
  /* `disclosure`: the display's accuracy disclosure, verbatim, shown once per block (and carried on each card's copy text). */
  for (const c of [...tiers.map((t) => t.card), bankBuilder.card, moonshot.card]) if (c) c.disclosure = disclosure;
  return { policy: NBA_GW_POLICY, public: enabled === true, tiers, bankBuilder, moonshot, legs: ok, untiered, shorterThanLow: shorter.size, disclosure };
}

/** The exact identity a page prints on each NBA card (data-level-a-card) and the recorder matches: policy, tier, the
 *  games, and the shown joint text. One function, so page and record cannot disagree. */
export const nbaGameWinnerCardKey = (card) => `${card.policy}|${card.tier}|${keyOf(card.legs)}|${jointShownFor(card.jointProbability, card.tier)}`;

/** The cards that may be recorded, with the page each is on: only while the block is public, i.e. only cards readers saw. */
export function recordableNbaGameWinnerCards(block) {
  if (block?.public !== true) return [];
  return [...(block.tiers ?? []).map((t) => t.card), block.bankBuilder?.card, block.moonshot?.card].filter(Boolean);
}

/** Copyable plain text for one card. The display's own % text; no link, no price. */
export function nbaGameWinnerCopyText(card) {
  if (!card) return "";
  const lines = [`GameTimePicks NBA game winners · ${card.tierLabel} · ${card.legs.length} legs · paper only, no price`];
  for (const l of card.legs) lines.push(`- ${l.eventLabel}: ${l.selection.label} · ${l.label}: ${l.shownPct}`);
  lines.push(`Model joint probability ${card.jointShown} (${card.dependency.split(":")[0].toLowerCase()}).`);
  if (card.disclosure) lines.push(card.disclosure);
  lines.push("No sportsbook price. Settles on the official final.");
  return lines.join("\n");
}
