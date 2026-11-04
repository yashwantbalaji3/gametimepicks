/**
 * BANK BUILDER / MOONSHOT SOCIAL COMBOS (`gtp.products.social-combo@1`). PURE: no I/O, no clock, no network.
 *
 * The engine writes one combo document per product per ET slate (contract: side-session note
 * bb-moonshot-social-combo-contract.md, 2026-11-03). This module re-checks that document against the committed NBA lane
 * and the R1-R3 availability guard before any card is drawn, and resolves each leg into the exact text a card prints.
 * Any failed check refuses the whole combination: there is no partial, empty or padded card.
 *
 *   data          schema, product policy, contentSha256 of the body, lane sha, leg count, one leg per game/team/player
 *   identity      game, tip, teams and player all from the lane; projection equals the lane value exactly
 *   availability  leg guard empty, lane injury not Out/Day-To-Day/Doubtful (R1), roster __guard (R1-R3) and __cells
 *   freshness     lane.generatedAt <= combo.asOf <= asOf < first tip minus the 30-minute cutoff; combo at most 12 h old
 *   honesty       a target must be the model's own (never a sportsbook line); no price is ever resolved for a card;
 *                 a joint chance is shown only when every leg's probability is MODEL_VALIDATED
 */
import { createHash } from "node:crypto";

import { canonicalJson } from "../products/daily-candidates/receipt.mjs";
import { POLICY } from "../products/daily-candidates/policy.mjs";
import { eloWinProbabilityOf } from "../sports/nba/elo-win-probability.mjs";

export const SOCIAL_COMBO_SCHEMA = "gtp.products.social-combo@1";
export const COMBO_STATE = Object.freeze({ QUALIFIED: "QUALIFIED", NONE: "NO_QUALIFYING_COMBINATION" });
export const PRICING_STATE = Object.freeze({ MODEL_ONLY: "MODEL_ONLY", VERIFIED: "VERIFIED_PRICES" });
export const COMBO_PRODUCTS = Object.freeze(["bank-builder", "moonshot"]);
export const RISK_TIER = Object.freeze({ "bank-builder": "CONSERVATIVE", moonshot: "LONGSHOT" });
/** Same 30-minute cutoff and 12-hour staleness as the eligible-leg contract (eligible-leg/contract.mjs). */
export const COMBO_FRESHNESS = Object.freeze({ cutoffMin: 30, maxAgeHours: 12 });
export const MARKET_LABEL = Object.freeze({
  pts: "Points", reb: "Rebounds", ast: "Assists", threePm: "3-pointers made",
  pra: "Pts + Reb + Ast", ptsReb: "Pts + Reb", ptsAst: "Pts + Ast", winner: "Game winner",
});
export const MARKET_SHORT = Object.freeze({ pts: "PTS", reb: "REB", ast: "AST", threePm: "3PM", pra: "PRA", ptsReb: "P+R", ptsAst: "P+A" });
/** R1 statuses, the same pattern nba-unified-roster.mjs guardReasons applies. */
const R1_STATUS = /^(out|day|doubtful|inactive|suspen|injured reserve)/i;

const isHex64 = (s) => /^[0-9a-f]{64}$/.test(String(s ?? ""));
const ms = (iso) => Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** contentSha256 of a combo body (everything except contentSha256, canonical JSON). */
export const comboSha = (doc) => { const { contentSha256: _c, ...body } = doc ?? {}; return createHash("sha256").update(canonicalJson(body)).digest("hex"); };
/** A finished combo document: the body plus its own hash. */
export const sealCombo = (body) => ({ ...body, contentSha256: comboSha(body) });

/** The lane's own value for a player market (medians, then comboMedians). undefined when the lane has none. */
export const laneValueOf = (player, market) => player?.medians?.[market] ?? player?.comboMedians?.[market];
/** One decimal, as the stat cards print a median. */
export const projectionText = (v) => Number(v).toFixed(1);
/** A model target, never a line: "25+" or "Under 6". */
export const targetText = (t) => (t.direction === "AT_LEAST" ? `${t.value}+` : `Under ${t.value}`);

/**
 * Every reason this combo cannot become a card ([] = renderable).
 * @param {object} doc     the combo document
 * @param {{ lane: object, laneSha256: string, asOf: string, roster?: object|null }} ctx
 */
export function comboViolations(doc, { lane, laneSha256, asOf, roster = null }) {
  const v = [];
  if (doc?.schema !== SOCIAL_COMBO_SCHEMA) return [`schema ${doc?.schema}`];
  if (!COMBO_PRODUCTS.includes(doc.product)) return [`product ${doc.product}`];
  if (doc.state !== COMBO_STATE.QUALIFIED) return [`${doc.state ?? "no state"}: ${(doc.reasons ?? []).map((r) => r.text ?? r.code).join("; ") || "no reason given"}`];
  if (!isHex64(doc.contentSha256) || comboSha(doc) !== doc.contentSha256) v.push("contentSha256 does not match the combo body");
  const policy = POLICY[doc.product];
  if (doc.policyId !== policy.id) v.push(`policyId ${doc.policyId} is not ${policy.id}`);
  if (doc.sport !== "nba") v.push(`sport ${doc.sport}: only NBA combos have a card`);
  if (!lane?.games?.length) return [...v, "no lane to check the legs against"];
  if (doc.slateDate !== lane.date) v.push(`slateDate ${doc.slateDate} is not the lane date ${lane.date}`);
  if (doc.source?.lane?.sha256 !== laneSha256) v.push("source.lane.sha256 is not the committed lane");
  const c = doc.combination;
  const legs = c?.legs ?? [];
  if (legs.length < policy.minLegs || legs.length > policy.maxLegs) v.push(`${legs.length} legs; ${policy.label} takes ${policy.minLegs}${policy.maxLegs > policy.minLegs ? ` to ${policy.maxLegs}` : ""}`);
  if (c?.risk?.tier !== RISK_TIER[doc.product]) v.push(`risk tier ${c?.risk?.tier} is not ${RISK_TIER[doc.product]}`);
  if (!Object.values(PRICING_STATE).includes(c?.pricing?.state)) v.push(`pricing state ${c?.pricing?.state}`);
  if (c?.pricing && Object.keys(c.pricing).some((k) => k !== "state")) v.push("pricing carries more than its state: a social combo never holds a price");
  for (const [what, key] of [["game", (l) => l.eventId], ["team", (l) => l.team], ["player", (l) => l.player?.id]]) {
    const seen = legs.map(key).filter(Boolean);
    if (new Set(seen).size !== seen.length) v.push(`two legs share a ${what}`);
  }
  const games = new Map(lane.games.map((g) => [String(g.providerEventId), g]));
  for (const l of legs) {
    const id = l.legId ?? "?";
    const g = games.get(String(l.eventId));
    if (!g) { v.push(`${id}: game ${l.eventId} is not in the lane`); continue; }
    if (l.tipUtc !== g.tipUtc) v.push(`${id}: tip ${l.tipUtc} is not the lane tip ${g.tipUtc}`);
    const sides = [g.away.abbr, g.home.abbr];
    if (!sides.includes(l.team) || !sides.includes(l.opponent) || l.team === l.opponent) v.push(`${id}: ${l.team} vs ${l.opponent} is not ${sides.join(" @ ")}`);
    if (l.availability?.guard?.length) v.push(`${id}: availability guard ${l.availability.guard.join(", ")}`);
    if (l.target != null) {
      if (l.target.source !== "MODEL") v.push(`${id}: target source ${l.target.source}; only a model target prints (no sportsbook line on social graphics)`);
      if (!["AT_LEAST", "AT_MOST"].includes(l.target.direction) || !isNum(l.target.value)) v.push(`${id}: target needs a direction and a number`);
    }
    if (l.kind === "GAME_WINNER") {
      if (l.market !== "winner" || l.player != null) v.push(`${id}: a winner leg has market winner and no player`);
      const wp = eloWinProbabilityOf(g);
      if (!wp) { v.push(`${id}: the lane has no usable win probability for this game`); continue; }
      const p = l.team === g.home.abbr ? wp.home : wp.away;
      if (l.projection !== p) v.push(`${id}: win probability ${l.projection} is not the lane's ${p}`);
      if (l.target != null) v.push(`${id}: a winner leg takes no target`);
    } else if (l.kind === "PLAYER_PROJECTION") {
      const side = l.team === g.home.abbr ? "home" : "away";
      const p = (g.players?.[side] ?? []).find((x) => String(x.providerAthleteId) === String(l.player?.id));
      if (!p) { v.push(`${id}: player ${l.player?.id} is not on the ${l.team} lane roster`); continue; }
      if (p.name !== l.player.name) v.push(`${id}: name ${l.player.name} is not the lane's ${p.name}`);
      if (!(l.market in MARKET_SHORT)) v.push(`${id}: market ${l.market} has no card label`);
      const lv = laneValueOf(p, l.market);
      if (!isNum(lv) || l.projection !== lv) v.push(`${id}: projection ${l.projection} is not the lane's ${lv}`);
      const status = p.injuryStatus ?? l.availability?.status ?? null;
      if (status && R1_STATUS.test(status)) v.push(`${id}: R1 ${status}`);
      if (roster) {
        const g2 = roster.__guard?.[String(p.providerAthleteId)];
        if (g2?.length) v.push(`${id}: roster guard ${g2.join(", ")}`);
        const cells = roster.__cells?.[String(p.providerAthleteId)] ?? [];
        if (cells.includes(l.market)) v.push(`${id}: the roster hides ${l.market} for this player`);
        if ((roster[l.team] ?? []).some((e) => e?.review && String(e.id) === String(p.providerAthleteId))) v.push(`${id}: the roster holds this player under review`);
      }
    } else v.push(`${id}: kind ${l.kind}`);
  }
  const now = ms(asOf); const made = ms(doc.asOf); const gen = ms(lane.generatedAt);
  if (!Number.isFinite(now)) v.push("asOf is required");
  if (!(made >= gen)) v.push("the combo predates the lane it reads");
  if (!(made <= now)) v.push("the combo is newer than the render instant");
  if ((now - made) / 3.6e6 > COMBO_FRESHNESS.maxAgeHours) v.push(`the combo is more than ${COMBO_FRESHNESS.maxAgeHours} hours old`);
  const first = Math.min(...legs.map((l) => ms(l.tipUtc)));
  if (legs.length && !(now < first - COMBO_FRESHNESS.cutoffMin * 60e3)) v.push(`the first leg tips within ${COMBO_FRESHNESS.cutoffMin} minutes or has started`);
  return v;
}

/** Card view of a checked combo. Throws on any violation. Legs are ordered by tip, then team. */
export function resolveCombo(doc, ctx) {
  const bad = comboViolations(doc, ctx);
  if (bad.length) throw new Error(`combo refused:\n  - ${bad.join("\n  - ")}`);
  const games = new Map(ctx.lane.games.map((g) => [String(g.providerEventId), g]));
  const legs = doc.combination.legs.map((l) => {
    const g = games.get(String(l.eventId));
    const wp = l.kind === "GAME_WINNER" ? eloWinProbabilityOf(g) : null;
    const team = l.team === g.home.abbr ? g.home : g.away;
    const opp = l.team === g.home.abbr ? g.away : g.home;
    return {
      legId: l.legId, eventId: String(l.eventId), tipUtc: l.tipUtc, kind: l.kind, market: l.market, marketLabel: MARKET_LABEL[l.market],
      team, opponent: opp, home: l.team === g.home.abbr, player: l.player,
      projection: l.projection,
      projectionText: wp ? `${l.team === g.home.abbr ? wp.homePct : wp.awayPct}%` : projectionText(l.projection),
      targetText: l.target ? targetText(l.target) : null,
    };
  }).sort((a, b) => ms(a.tipUtc) - ms(b.tipUtc) || a.team.abbr.localeCompare(b.team.abbr));
  const validated = doc.combination.legs.every((l) => l.probabilityBasis === "MODEL_VALIDATED") && isNum(doc.combination.risk.jointModelProbability);
  return {
    product: doc.product, label: POLICY[doc.product].label, slateDate: doc.slateDate, testData: doc.testData === true,
    legs, firstTipUtc: legs[0].tipUtc,
    pricing: doc.combination.pricing.state,
    joint: validated ? { value: doc.combination.risk.jointModelProbability, text: `${(doc.combination.risk.jointModelProbability * 100).toFixed(1)}%` } : null,
  };
}

/**
 * Social combo from an existing daily-candidates engine result (engine.mjs buildDailyCandidate). Only a NO_CANDIDATE
 * maps: its card reasons become the refusal. A CANDIDATE holds priced legs and no lane projections, so it is refused
 * here until the engine emits social-combo@1 itself.
 */
export function comboFromDailyCandidate(result, { reasonCopy = {}, laneRef = null } = {}) {
  const base = { schema: SOCIAL_COMBO_SCHEMA, product: result.product, sport: "nba", slateDate: result.productDay, asOf: result.asOf, testData: false, policyId: result.policy, source: laneRef ? { lane: laneRef } : {}, combination: null };
  if (result.status !== "NO_CANDIDATE") return sealCombo({ ...base, state: COMBO_STATE.NONE, reasons: [{ code: "ENGINE_SHAPE", text: "the engine returned a priced candidate, not a social-combo@1 document" }] });
  const reasons = (result.cardReasons ?? []).map((code) => ({ code, text: reasonCopy[code] ?? code }));
  return sealCombo({ ...base, state: COMBO_STATE.NONE, reasons: reasons.length ? reasons : [{ code: "NO_CANDIDATE", text: "no qualifying combination" }] });
}
