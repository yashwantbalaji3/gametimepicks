/**
 * TIER BOARD VIEW (Founder Priority 4, 2026-11-03) — the one view model the redesigned /bank-builder and /moonshot
 * pages render their featured parlay from. Pure; computes no probability, no tier and no price.
 *
 * Sources, in order:
 *   1. The engine's gtp.suggested-cards@1 day file (app/public/data/suggested-cards/<ET date>.json; engine session,
 *      branch claude/betting-engine-1104-02e05b). Public-safe by contract: no price, line, book or link.
 *   2. Until that file lands for the day, the Level A page model the page already evaluates once (level-a/model.mjs) —
 *      the same engine the suggested-cards file reuses, so the card is identical.
 *
 * States (one vocabulary, one badge each): qualified · model-only · blocked · insufficient · historical.
 * "qualified" needs fresh permitted prices and is never produced today; it renders only if a source emits it.
 *
 * FIXTURES: a document carrying `fixture: true` is refused unless the caller passes { allowFixture: true }, which only
 * the component tests and the GTP_DEV_ROUTES-gated /dev/tier-board-fixture route do. Fixture data never reaches a real page.
 *
 * PRICING: a leg price or a combined price is rendered only when the source says pricing is authorized AND carries the
 * price. Neither source does today, so every card reads as model-only, with no odds and no payout.
 */
import { PARLAY_ODDS_BANDS, PUBLIC_RISK_LABELS } from "../../parlays/risk-odds-bands.mjs";
import { hubLaneAnchor, slateHref } from "../../sports/nba/projection-board-ops.mjs";

export const TIER_BOARD_SCHEMA = "gtp.suggested-cards@1";
export const MODEL_PROJECTION = "MODEL PROJECTION";

/** The five public states. `tone` names a CSS token family; `glyph` gives each state a shape so colour is never the only cue. */
export const TIER_STATES = Object.freeze({
  qualified: { label: "Qualified", glyph: "◆", tone: "success", text: "Every leg passed its checks and carries a fresh, permitted sportsbook price." },
  "model-only": { label: "Model only", glyph: "◇", tone: "info", text: "Built from MODEL PROJECTIONS alone. No sportsbook price is shown, so there is no payout figure." },
  blocked: { label: "Blocked", glyph: "■", tone: "danger", text: "A check failed, so no card is published today." },
  insufficient: { label: "Insufficient legs", glyph: "□", tone: "warn", text: "Not enough eligible legs today to build this card." },
  historical: { label: "Historical", glyph: "○", tone: "mute", text: "A past card, graded against official results." },
});
export const tierState = (s) => TIER_STATES[normState(s)] ?? TIER_STATES.insufficient;
function normState(s) {
  const k = String(s ?? "").toLowerCase().replace(/_/g, "-");
  return k === "model_only" ? "model-only" : k === "insufficient-legs" ? "insufficient" : k;
}

/** The fair-probability range of a public risk band, derived from the band's own American edges (never hand-typed). */
const probOf = (american) => (american > 0 ? 100 / (american + 100) : -american / (-american + 100));
export function bandProbabilityRange(tier) {
  const b = PARLAY_ODDS_BANDS[tier];
  if (!b) return null;
  // Lower price edge → higher probability. A null max (Longshot) is open-ended at 0.
  return { tier, label: PUBLIC_RISK_LABELS[tier], hi: probOf(b.minAmerican), lo: b.maxAmerican == null ? 0 : probOf(b.maxAmerican) };
}
const pctText = (p) => `${(p * 100).toFixed(p * 100 < 20 && p * 100 % 1 ? 1 : 0)}%`;
export function bandRangeText(tier) {
  const r = bandProbabilityRange(tier);
  if (!r) return null;
  return r.lo === 0 ? `under ${pctText(r.hi)}` : `${pctText(r.lo)}–${pctText(r.hi)}`;
}

/**
 * The two products' identities. Leg counts and bands are the Level A product policies (suggestions.mjs:
 * bank-builder-suggest@1 exactly 2 legs Low/Medium; moonshot-suggest@1 exactly 3 legs High/Longshot; the NBA game
 * winners rule lets a Moonshot card carry up to 5).
 */
export const PRODUCT_IDENTITY = Object.freeze({
  "bank-builder": {
    product: "bank-builder", name: "Bank Builder", eyebrow: "Conservative · 2 legs", bands: ["low", "medium"],
    promise: "Two legs, chosen for the highest model chance of both landing. Built to be the calm card on the board.",
    risk: "Even a Low Risk card loses often: in the Low band the model gives both legs together about a coin flip or better, never a certainty.",
  },
  moonshot: {
    product: "moonshot", name: "Moonshot", eyebrow: "High Risk · 3+ legs", bands: ["high", "longshot"],
    promise: "Three or more legs stacked for a big swing. The model's best long-odds combination of the day.",
    risk: "Most Moonshots lose. In these bands the model gives every leg landing together a 1-in-4 chance or less.",
  },
});

const SPORT = { nba: "NBA", nfl: "NFL", mlb: "MLB", epl: "Premier League", "ligue-1": "Ligue 1" };
const sportLabel = (s) => SPORT[s] ?? String(s ?? "").toUpperCase();
const pct1 = (p) => (typeof p === "number" && Number.isFinite(p) ? `${(p * 100).toFixed(1)}%` : null);
const GUARD_TEXT = { pass: "Eligible · passed every guard", review: "Eligible with review flags", blocked: "Ineligible · blocked by a guard" };

/** Names, shortened: "A, B, C +2 more". */
const nameList = (xs, n = 3) => (xs.length <= n ? xs.join(", ") : `${xs.slice(0, n).join(", ")} +${xs.length - n} more`);

/**
 * One leg, in the page's words. `productDay` picks the player page (the day's NBA projection board); `players` are the
 * day's player MODEL PROJECTIONS (suggested-cards playerProjections.nba or Level A nbaProjections), of which the leg
 * shows its own team's three heaviest-minute players.
 */
export function legView(leg, { productDay = null, players = [] } = {}) {
  const sport = leg.sport ?? "nba";
  const shown = leg.probabilityShown ?? leg.shownPct ?? pct1(leg.probability);
  const isPlayer = Boolean(leg.player || leg.playerId);
  const guardState = leg.guard?.state ?? (leg.probability != null ? "pass" : "review");
  const flags = (leg.guard?.flagText?.length ? leg.guard.flagText : leg.guard?.flags ?? []).map(String);
  const priced = Boolean(leg.price && leg.priceAuthorized === true);
  const teamName = leg.selection?.label?.replace(/\s*\(official side\)\s*$/i, "").replace(/\s+to win$/i, "") ?? null;
  const teamAbbr = leg.selection?.teamAbbr ?? (teamName && /^[A-Z]{2,4}$/.test(teamName) ? teamName : null);
  const flaggedNames = new Set((leg.guard?.rotationFlagged ?? []).map((p) => p.name));
  // A rotation player already named above is not repeated in the out-at-freeze list.
  const out = (leg.guard?.outAtFreeze ?? []).map((p) => p.name).filter((n) => n && !flaggedNames.has(n));
  /* ROTATION_FROM_LANE is informational (engine, a746932123) and never puts a leg under review, so it is not listed. */
  const rotation = (leg.guard?.rotationFlagged ?? []).filter((p) => p.flag !== "ROTATION_FROM_LANE").map((p) => `${p.name} (${p.status})`);
  const playerHref = sport === "nba" && productDay ? slateHref(productDay) : null;
  /* Founder rule (PD 2026-11-04): a withheld or under-review value is never displayed, anywhere. Only players whose
     guard passed are listed (engine: "blocked" = R1–R3 or a readiness block, "review" = flagged); the rest are omitted,
     never shown with a number. A Level A projection carries no guard and is shown as published. */
  const teamPlayers = isPlayer || !teamAbbr ? [] : players
    .filter((p) => p.eventId === leg.eventId && p.team === teamAbbr && (p.guard ? p.guard.state === "pass" : true))
    .sort((a, b) => (b.expectedMinutes ?? 0) - (a.expectedMinutes ?? 0))
    .slice(0, 3)
    .map((p) => ({ name: p.name, points: p.medians?.pts ?? p.points?.median ?? null, href: playerHref }));
  return {
    key: leg.legId ?? `${sport}:${leg.eventId}:${leg.selection?.code ?? ""}`,
    sport, sportLabel: sportLabel(sport),
    title: leg.selection?.label ?? leg.label ?? "—",
    subject: isPlayer
      ? { kind: "player", name: leg.player?.name ?? leg.name ?? null, team: leg.player?.teamAbbr ?? leg.team ?? null }
      : { kind: "team", name: teamName, team: null },
    market: leg.market ?? null,
    game: { id: leg.eventId ?? null, label: leg.eventLabel ?? null, startUtc: leg.startUtc ?? null, href: gameHref(sport, leg.eventId) },
    playerHref: isPlayer ? (leg.player?.href ?? playerHref) : (teamPlayers.length ? playerHref : null),
    players: teamPlayers,
    projection: shown ? { label: MODEL_PROJECTION, text: `${shown} to win`, value: leg.probability ?? null } : null,
    eligibility: { state: guardState, text: GUARD_TEXT[guardState] ?? GUARD_TEXT.review, flags },
    availability: isPlayer
      ? { state: leg.availability ?? "unknown", text: leg.availability ? `Availability: ${leg.availability}` : "Availability not yet reported" }
      : {
          state: rotation.length ? "flagged" : "team",
          text: [
            rotation.length ? `Season top-five rotation listed at freeze: ${nameList(rotation)}` : null,
            out.length ? `Out at forecast freeze: ${nameList(out)}` : null,
          ].filter(Boolean).join(" · ") || "No player listed out at forecast freeze",
        },
    frozenAt: leg.forecast?.stampedAt ?? leg.display?.frozenAt ?? null,
    price: priced ? { american: leg.price.american, bookmaker: leg.price.bookmaker, capturedAt: leg.price.capturedAt } : null,
    source: leg,
  };
}
function gameHref(sport, eventId) {
  if (!eventId) return null;
  if (sport === "nba") return hubLaneAnchor(eventId);
  return null;
}

/** One card, in the page's words. */
export function cardView(card, { state = "model-only", productDay = null, origin, players = [] } = {}) {
  if (!card) return null;
  const legs = (card.legs ?? []).map((l) => legView(l, { productDay, players }));
  const tier = card.band?.tier ?? card.tier ?? null;
  const joint = card.jointShown ?? (typeof card.jointProbability === "number" ? pct1(card.jointProbability) : null);
  const why = [
    card.band?.rule ?? (tier ? `Lands in the ${PUBLIC_RISK_LABELS[tier] ?? tier} band (model chance ${bandRangeText(tier)}).` : null),
    card.rationale ?? card.whySelected ?? null,
    legs.length ? `${legs.length} legs from ${new Set(legs.map((l) => l.game.id)).size} different games.` : null,
  ].filter(Boolean);
  const risks = [
    card.dependency ?? null,
    card.confidence ?? null,
    ...legs.filter((l) => l.eligibility.state !== "pass").map((l) => `${l.title}: ${l.eligibility.text.toLowerCase()} (open the leg for why).`),
    "If any one leg loses, the whole card loses.",
  ].filter(Boolean);
  const authorized = card.priced === true && card.price != null;
  return {
    id: card.id ?? null, origin, state: normState(state), tier, tierLabel: card.tierLabel ?? PUBLIC_RISK_LABELS[tier] ?? null,
    joint, legs, why, risks, disclosure: card.disclosure ?? null,
    pricing: authorized
      ? { authorized: true, text: "Priced from a permitted sportsbook quote.", combined: card.price }
      : { authorized: false, text: "No sportsbook price — model only. No odds and no payout are shown." },
    source: card,
  };
}

/** Pick the product's sections out of a suggested-cards@1 document. */
export function tierBoardFromSuggestedCards(doc, product, { allowFixture = false } = {}) {
  if (!doc || doc.schema !== TIER_BOARD_SCHEMA) return null;
  if (doc.fixture === true && !allowFixture) return null;
  const key = product === "moonshot" ? "moonshot" : "bankBuilder";
  const sections = doc[key] ?? {};
  const order = ["cross", "nba"];
  const slots = order.filter((s) => sections[s]).map((scope) => ({ scope, ...sections[scope] }));
  const lead = slots.find((s) => s.card && s.state !== "blocked") ?? null;
  const state = lead ? lead.state : (slots.find((s) => s.state === "blocked") ? "blocked" : "insufficient");
  return {
    product, productDay: doc.productDay ?? null, origin: "suggested-cards", fixture: doc.fixture === true,
    state: normState(state),
    featured: lead ? cardView(lead.card, { state: lead.state, productDay: doc.productDay, origin: "suggested-cards", players: doc.playerProjections?.nba ?? [] }) : null,
    reasons: slots.filter((s) => !s.card && s.reason).map((s) => ({ scope: s.scope, text: String(s.reason).replace(/\.$/, "") })),
    legPool: doc.sports?.nba?.legPool ?? null,
    legKinds: Array.isArray(doc.nbaLegKinds) ? doc.nbaLegKinds.map(String) : [],
    /* The engine's methodology dependencies that are not yet approved, in its own words (effect only). */
    pending: (doc.methodologyDependencies ?? []).filter((m) => m && m.state !== "APPROVED" && m.effect).map((m) => ({ key: String(m.key), state: String(m.state), text: String(m.effect) })),
  };
}

/** The same view from the Level A page model (mixed card first, then the NBA game-winners card when that display is public). */
export function tierBoardFromLevelA(model, product) {
  if (!model) return null;
  const slot = product === "moonshot" ? model.moonshot : model.bankBuilder;
  const gw = model.nbaGameWinners?.public ? (product === "moonshot" ? model.nbaGameWinners.moonshot : model.nbaGameWinners.bankBuilder) : null;
  const lead = slot?.card ? slot : gw?.card ? gw : null;
  return {
    product, productDay: model.productDay ?? null, origin: "level-a", fixture: false,
    state: lead ? "model-only" : "insufficient",
    featured: lead ? cardView(lead.card, { state: "model-only", productDay: model.productDay, origin: "level-a", players: (model.nbaProjections ?? []).map((p) => ({ ...p, eventId: p.eventId ?? null })) }) : null,
    reasons: [slot, gw].filter((s) => s && !s.card && s.reason).map((s, i) => ({ scope: i === 0 ? "cross" : "nba", text: s.reason })),
    legPool: null,
    legKinds: [],
    pending: [],
  };
}

/**
 * The page's one call: today's engine file when it is for this product day, else the Level A model.
 * @param {"bank-builder" | "moonshot"} product
 * @param {{ suggestedCards?: any, levelAModel?: any, productDay?: string | null }} [opts]
 */
export function tierBoardFor(product, { suggestedCards = null, levelAModel = null, productDay = null } = {}) {
  const fromFile = suggestedCards && (!productDay || suggestedCards.productDay === productDay) ? tierBoardFromSuggestedCards(suggestedCards, product) : null;
  return fromFile ?? tierBoardFromLevelA(levelAModel, product);
}

/** Where a board's cards came from, said plainly (founder rule B, 2026-11-04: the frozen daily file is the default; the
 *  Level A model is the labelled fallback for a day with no file). */
export function sourceLine(board) {
  if (!board) return null;
  return board.origin === "suggested-cards"
    ? `Source: the frozen daily card file for ${board.productDay ?? "today"}.`
    : `Source: today's model suggestions. The frozen daily card file has not been published for ${board.productDay ?? "today"}, so this is the fallback.`;
}

export const PARLAY_TIERS = Object.freeze(["low", "medium", "high", "longshot"]);
const SCOPE_LABEL = { cross: "Mixed-sport card", nba: "NBA game winners card" };

/** One tier of the Parlay Lab board from per-scope slots ({ scope, state, card, reason }); a mixed-sport card leads, then NBA. */
function tierView(tier, slots, { productDay, origin, players }) {
  const lead = slots.find((s) => s.card && s.state !== "blocked") ?? null;
  const state = lead ? lead.state : slots.some((s) => s.state === "blocked") ? "blocked" : "insufficient";
  return {
    tier, label: PUBLIC_RISK_LABELS[tier], range: bandRangeText(tier), state: normState(state),
    card: lead ? cardView(lead.card, { state: lead.state, productDay, origin, players }) : null,
    reasons: slots.filter((s) => !s.card && s.reason).map((s) => ({ scope: s.scope, label: SCOPE_LABEL[s.scope] ?? s.scope, text: String(s.reason).replace(/\.$/, "") })),
  };
}

/** The four-tier Parlay Lab board from a suggested-cards@1 document (`parlays.{cross,nba}[]`). */
export function parlayTiersFromSuggestedCards(doc, { allowFixture = false } = {}) {
  if (!doc || doc.schema !== TIER_BOARD_SCHEMA) return null;
  if (doc.fixture === true && !allowFixture) return null;
  const ctx = { productDay: doc.productDay ?? null, origin: "suggested-cards", players: doc.playerProjections?.nba ?? [] };
  const of = (scope) => (doc.parlays?.[scope] ?? []).map((t) => ({ scope, ...t }));
  const all = [...of("cross"), ...of("nba")];
  return {
    productDay: ctx.productDay, origin: ctx.origin, fixture: doc.fixture === true,
    tiers: PARLAY_TIERS.map((tier) => tierView(tier, all.filter((s) => s.tier === tier), ctx)),
    legKinds: Array.isArray(doc.nbaLegKinds) ? doc.nbaLegKinds.map(String) : [],
    pending: (doc.methodologyDependencies ?? []).filter((m) => m && m.state !== "APPROVED" && m.effect).map((m) => ({ key: String(m.key), state: String(m.state), text: String(m.effect) })),
  };
}

/** The same board from the Level A model (parlayLab = mixed cards; nbaGameWinners.tiers when that display is public). */
export function parlayTiersFromLevelA(model) {
  if (!model) return null;
  const ctx = { productDay: model.productDay ?? null, origin: "level-a", players: [] };
  const cross = (model.parlayLab ?? []).map((t) => ({ scope: "cross", state: t.card ? "model-only" : "insufficient", ...t }));
  const nba = model.nbaGameWinners?.public ? (model.nbaGameWinners.tiers ?? []).map((t) => ({ scope: "nba", state: t.card ? "model-only" : "insufficient", ...t })) : [];
  const all = [...cross, ...nba];
  return { productDay: ctx.productDay, origin: ctx.origin, fixture: false, tiers: PARLAY_TIERS.map((tier) => tierView(tier, all.filter((s) => s.tier === tier), ctx)), legKinds: [], pending: [] };
}

/**
 * The Parlay Lab page's one call: the day's frozen file when present, else the Level A model.
 * @param {{ suggestedCards?: any, levelAModel?: any, productDay?: string | null }} [opts]
 */
export function parlayTiersFor({ suggestedCards = null, levelAModel = null, productDay = null } = {}) {
  const fromFile = suggestedCards && (!productDay || suggestedCards.productDay === productDay) ? parlayTiersFromSuggestedCards(suggestedCards) : null;
  return fromFile ?? parlayTiersFromLevelA(levelAModel);
}
