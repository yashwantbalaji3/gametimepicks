/**
 * CHALLENGE RESEARCH CANDIDATES · one product, one day (not lane state). PURE except the encryption helpers.
 *
 * The ranked Level B alternatives (status RESEARCH) and the in-band candidates held back (UNDER_REVIEW), shown in their
 * own section below the lanes: never an official selection, never a pick, never with a stake or payout. The public
 * file (`gtp.challenge-research.public@1`) carries identity, side, model projection, evidence class and refusal codes;
 * lines, books, prices, quote times and line-dependent hit rates are only in the encrypted companion
 * (`gtp.challenge-research.prices@1`, aad `challenge-research/<product>`), bound to the public file by its sha.
 */
import { canonical, sha256 } from "./chain.mjs";
import { publicLeg, privateLeg, EVIDENCE_LABEL, SELECTION_LABEL, publicFlags } from "./card-fields.mjs";

export const RESEARCH_SCHEMA = "gtp.challenge-research.public@1";
export const RESEARCH_PRICES_SCHEMA = "gtp.challenge-research.prices@1";
export const RESEARCH_LABEL = "Research candidates — not official selections";
export const RESEARCH_HELD_LABEL = "Not an official selection";
export const researchAad = (product) => `challenge-research/${product}`;
const codes = (reasons) => [...new Set(reasons.map((r) => r.split(/[ :]/)[0]))];

/**
 * @param {{ product, date, evaluation, held?: { [laneId]: { heldCode, reason } }, maxCandidates? }} p
 *   evaluation: levels.evaluateLevelCandidates(...) for the product's step (lane A's position)
 */
export function researchDocs({ product, date, evaluation, held = {}, maxCandidates = 10 }) {
  const band = evaluation.position.band;
  const inBandHeld = evaluation.candidates.filter((c) => c.classification === "HOLD" && c.money && c.money.grossPayoutCents >= band.loCents && c.money.grossPayoutCents <= band.hiCents);
  const picked = [...evaluation.ranked.map((c) => ({ c, status: "RESEARCH" })), ...inBandHeld.map((c) => ({ c, status: "UNDER_REVIEW" }))].slice(0, maxCandidates);
  const doc = {
    schema: RESEARCH_SCHEMA, product, date, official: false, label: RESEARCH_LABEL, heldLabel: RESEARCH_HELD_LABEL,
    rulesVersion: evaluation.rulesVersion, rankingLabel: evaluation.rankingLabel, step: evaluation.position.step, targetPayoutCents: evaluation.position.targetCents,
    lanesHeld: Object.entries(held).map(([laneId, h]) => ({ laneId, heldCode: h.heldCode, reason: h.reason })),
    candidates: picked.map(({ c, status }) => ({
      candidateId: c.candidateId, status, rank: c.rank ?? null, evidenceClass: c.classification === "HOLD" ? null : c.classification, evidenceLabel: EVIDENCE_LABEL[c.classification] ?? null,
      legs: c.legs.map((l) => publicLeg({ legId: l.legId, sport: l.sport, gameId: l.gameId, eventLabel: l.eventLabel, startUtc: l.startUtc, market: l.market, family: l.family, player: l.player, team: l.team, side: l.side, projection: l.projection ?? null })),
      reasonCodes: codes(c.reasons), selectionLabel: SELECTION_LABEL[c.selectionMode] ?? null, flags: publicFlags(c.flags),
    })),
  };
  const pub = { ...doc, contentSha256: sha256(canonical(doc)) };
  const prices = {
    schema: RESEARCH_PRICES_SCHEMA, product, date, publicSha256: pub.contentSha256,
    candidates: picked.map(({ c }) => ({
      candidateId: c.candidateId, combined: c.price ? { label: c.price.label, decimal: c.price.decimal, american: c.price.american, book: c.price.book } : null,
      legs: c.legs.map((l) => privateLeg({ legId: l.legId, line: l.line, side: l.side, book: l.quote?.book, price: l.quote?.american, quotedAt: l.quote?.quotedAt, fetchedAt: l.quote?.fetchedAt, hitRate: l.hitRate, flagText: (c.flags ?? []).filter((f) => String(f).split(" ")[1]?.replace(/:$/, "") === l.legId && !/_WEIGHT /.test(f)) })),
      reasons: c.reasons,
    })),
  };
  return { public: pub, prices };
}

export const verifyResearch = (doc) => { if (doc?.schema !== RESEARCH_SCHEMA) return false; const { contentSha256, ...rest } = doc; return contentSha256 === sha256(canonical(rest)); };

/** The site's view: the public doc, with lines and prices filled in only from a companion made from this exact doc. */
export function researchDisplay(pub, prices = null) {
  if (!verifyResearch(pub)) throw new Error("researchDisplay: the research file does not verify; refusing to display it");
  if (prices && (prices.schema !== RESEARCH_PRICES_SCHEMA || prices.publicSha256 !== pub.contentSha256)) throw new Error("researchDisplay: the prices file was not made from this research file");
  const byId = new Map((prices?.candidates ?? []).map((c) => [c.candidateId, c]));
  return {
    product: pub.product, date: pub.date, official: false, label: pub.label, heldLabel: pub.heldLabel, rankingLabel: pub.rankingLabel, lanesHeld: pub.lanesHeld, priced: !!prices,
    candidates: pub.candidates.map((c) => { const p = byId.get(c.candidateId); return { ...c, combined: p?.combined ?? null, legs: c.legs.map((l) => ({ ...l, price: p?.legs.find((x) => x.legId === l.legId) ?? null })) }; }),
    sourceSha256: pub.contentSha256,
  };
}
