/**
 * LEVEL A · SLIP LEGS (server side). Turns a Level A leg into the minimal PUBLIC payload an <AddToSlip> button carries
 * into the browser — sport, event, teams, market and outcome, start, freeze time, the source's name, and the published
 * model estimate ONLY where the leg's canonical source publishes one:
 *   MLB / EPL / Ligue 1   the official forecast probability (verbatim), shown as the cards show it
 *   NBA                   the Elo display's exact number with its own text: from the NBA game-winner rule's leg
 *                         ("Elo-derived game-winner estimate: 66%") or, for an untiered side, the display line itself
 *   anything else         no estimate ("no published estimate"), never imputed
 * Nothing else crosses: no forecast ref, receipt hash, internal path, grader name or price (a test pins the fields).
 *
 * levelASlipLegFor(sport, eventId) is the helper the sport hubs call: the exact Level A leg for that event, or null when
 * Level A has none (so a hub can never add a pick that is not a Level A suggestion).
 */
import { toSlipLeg } from "./slip.mjs";

const isP = (x) => typeof x === "number" && Number.isFinite(x) && x > 0 && x < 1;
const teamsOf = (label) => String(label ?? "").split(/ @ | v /).map((t) => t.trim()).filter(Boolean).slice(0, 2);

/** The published estimate of a Level A leg, or null. */
export function publishedEstimate(leg) {
  if (!leg) return null;
  const source = leg.forecast?.owner ?? "";
  if (leg.sport === "nba") {
    if (isP(leg.probability) && leg.shownPct && leg.label) return { value: leg.probability, text: `${leg.label}: ${leg.shownPct}`, source };
    const u = leg.uncertainty;
    if (u?.kind === "elo-win-probability" && u.text) {
      const v = leg.selection?.code === "home" ? u.home : leg.selection?.code === "away" ? u.away : null;
      if (isP(v)) return { value: v, text: u.text, source };
    }
    return null;
  }
  if (isP(leg.probability)) return { value: leg.probability, text: `Official Forecast ${(leg.probability * 100).toFixed(1)}%`, source };
  return null;
}

/** The public slip payload for one Level A leg. */
export function slipLegOf(leg) {
  return toSlipLeg({
    sport: leg.sport, eventId: leg.eventId, eventLabel: leg.eventLabel, teams: teamsOf(leg.eventLabel),
    market: leg.market, outcome: { code: leg.selection?.code, label: leg.selection?.label },
    startUtc: leg.startUtc, frozenAt: leg.display?.frozenAt ?? leg.forecast?.stampedAt ?? null,
    estimate: publishedEstimate(leg), source: leg.forecast?.owner ?? "",
  });
}

/** Every Level A leg a model holds, the richest version of each event first (an NBA rule leg carries its display text). */
function legsOf(model) {
  const cards = [...(model?.parlayLab ?? []).map((t) => t.card), model?.bankBuilder?.card, model?.moonshot?.card].filter(Boolean);
  const gw = model?.nbaGameWinners;
  const gwCards = gw?.public ? [...(gw.tiers ?? []).map((t) => t.card), gw.bankBuilder?.card, gw.moonshot?.card].filter(Boolean) : [];
  return [...(gw?.public ? gw.legs ?? [] : []), ...gwCards.flatMap((c) => c.legs), ...cards.flatMap((c) => c.legs), ...(model?.legs ?? []), ...(model?.untiered ?? [])];
}

/**
 * The Level A slip leg for one event, or null. `model` is the page's Level A model (levelAPageModel()); a hub that has
 * none passes nothing and the page model is built once per build process.
 */
let cached = null;
export async function levelASlipLegFor(sport, eventId, { model = null } = {}) {
  let m = model;
  if (!m) {
    cached ??= import("./model.mjs").then((x) => x.levelAPageModel());
    m = await cached;
  }
  const leg = legsOf(m).find((l) => l.sport === sport && String(l.eventId) === String(eventId) && l.selection);
  return leg ? slipLegOf(leg) : null;
}

/** Synchronous form for a page that already holds its model. */
export function slipLegFor(model, sport, eventId) {
  const leg = legsOf(model).find((l) => l.sport === sport && String(l.eventId) === String(eventId) && l.selection);
  return leg ? slipLegOf(leg) : null;
}

/** The slip legs a page shows Add buttons for (its own cards, the NBA block's cards for that page, the untiered sides),
 *  once each — what the bar sends to the browser. */
export function slipCatalogFor(model, mode) {
  if (!model) return [];
  const own = mode === "bank-builder" ? [model.bankBuilder?.card] : mode === "moonshot" ? [model.moonshot?.card] : (model.parlayLab ?? []).map((t) => t.card);
  const gw = model.nbaGameWinners?.public ? model.nbaGameWinners : null;
  const gwOwn = !gw ? [] : mode === "bank-builder" ? [gw.bankBuilder?.card] : mode === "moonshot" ? [gw.moonshot?.card] : (gw.tiers ?? []).map((t) => t.card);
  const legs = [...gwOwn.filter(Boolean).flatMap((c) => c.legs), ...own.filter(Boolean).flatMap((c) => c.legs), ...(model.untiered ?? [])];
  const out = new Map();
  for (const l of legs) { if (!l.selection) continue; const s = slipLegOf(l); if (!out.has(s.key)) out.set(s.key, s); }
  return [...out.values()];
}
