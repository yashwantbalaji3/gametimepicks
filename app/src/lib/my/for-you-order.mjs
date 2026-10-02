/**
 * FOR YOU — an ORDERING and FILTERING layer over official GameTimePicks items (Session 8 · G).
 *
 * Not a prediction model. It never creates an item, never edits one, and never changes a probability,
 * line, price, publication status, model status or settlement: every item it returns is the SAME object
 * it was given (identity-preserved, so a test can prove nothing was touched). Each result names the
 * official receipt it cites.
 *
 * Inputs are the reader's EXPLICIT choices only:
 *   follows    canonical follow refs ({ sport, entityType, id } — lib/follow/follow-schema.mjs)
 *   prefs      { favoriteSports, hiddenSports, preferredProducts, preferredFamilies, riskBands, hidePlayerProps }
 *   savedRefs  ids the reader already saved (shown later, never hidden)
 *
 * ⚠ THERE IS NO RESULTS INPUT, BY DESIGN. A reader's wins, losses, P/L or bankroll cannot reach this
 * function, so "you lost yesterday, here is a longshot" is not expressible. A risk band is applied only as
 * a filter the reader chose; nothing here widens it, and an empty choice means "no filter", never "more".
 *
 * Item shape (an official leg or card, as published):
 *   { receiptId, kind: "card"|"leg", sport, product?, family?, riskBand?, legClass?, teamIds?[], playerIds?[], eventIds?[] }
 */

export const FOR_YOU_VERSION = "for-you@1";
const RISK_BANDS = new Set(["low", "medium", "high", "longshot"]);
const ALLOWED_PREF_KEYS = new Set(["favoriteSports", "hiddenSports", "preferredProducts", "preferredFamilies", "riskBands", "hidePlayerProps"]);

/** Reasons are shown to the reader verbatim, so they describe THEIR choice, never a prediction. */
const REASON = Object.freeze({
  FOLLOWED_PLAYER: "A player you follow",
  FOLLOWED_TEAM: "A team you follow",
  FOLLOWED_GAME: "A game you follow",
  FAVORITE_SPORT: "A sport you picked",
  PREFERRED_PRODUCT: "A product you picked",
  PREFERRED_FAMILY: "A market type you picked",
});

function normalizePrefs(prefs) {
  const p = prefs ?? {};
  for (const k of Object.keys(p)) if (!ALLOWED_PREF_KEYS.has(k)) throw new Error(`for-you: unknown preference "${k}" — only explicit reader choices are accepted`);
  const set = (v) => new Set((Array.isArray(v) ? v : []).map((x) => String(x).toLowerCase()));
  const riskBands = set(p.riskBands);
  for (const b of riskBands) if (!RISK_BANDS.has(b)) throw new Error(`for-you: "${b}" is not a published risk level`);
  return {
    favoriteSports: set(p.favoriteSports), hiddenSports: set(p.hiddenSports),
    preferredProducts: set(p.preferredProducts), preferredFamilies: set(p.preferredFamilies),
    riskBands, hidePlayerProps: p.hidePlayerProps === true,
  };
}

/**
 * @returns {{ version:string, items: Array<{ item:object, cites:string, reasons:string[], score:number }>, hidden:number }}
 */
export function forYouOrder(items, { follows = [], prefs = {}, savedRefs = [] } = {}) {
  const P = normalizePrefs(prefs);
  const followed = { team: new Set(), player: new Set(), game: new Set() };
  for (const f of follows ?? []) if (f?.entityType in followed && f.id) followed[f.entityType].add(String(f.id));
  const saved = new Set(savedRefs ?? []);

  const kept = [];
  let hidden = 0;
  (items ?? []).forEach((item, index) => {
    const sport = String(item?.sport ?? "").toLowerCase();
    // Filters: only what the reader explicitly asked to hide.
    if (P.hiddenSports.has(sport)) { hidden += 1; return; }
    if (P.riskBands.size && item?.riskBand && !P.riskBands.has(String(item.riskBand).toLowerCase())) { hidden += 1; return; }
    if (P.hidePlayerProps && (item?.legClass === "PLAYER" || (item?.playerIds ?? []).length > 0)) { hidden += 1; return; }

    const reasons = [];
    let score = 0;
    if ((item?.playerIds ?? []).some((id) => followed.player.has(String(id)))) { score += 8; reasons.push(REASON.FOLLOWED_PLAYER); }
    if ((item?.teamIds ?? []).some((id) => followed.team.has(String(id)))) { score += 6; reasons.push(REASON.FOLLOWED_TEAM); }
    if ((item?.eventIds ?? []).some((id) => followed.game.has(String(id)))) { score += 5; reasons.push(REASON.FOLLOWED_GAME); }
    if (P.favoriteSports.has(sport)) { score += 3; reasons.push(REASON.FAVORITE_SPORT); }
    if (item?.product && P.preferredProducts.has(String(item.product).toLowerCase())) { score += 2; reasons.push(REASON.PREFERRED_PRODUCT); }
    if (item?.family && P.preferredFamilies.has(String(item.family).toLowerCase())) { score += 1; reasons.push(REASON.PREFERRED_FAMILY); }
    kept.push({ item, cites: item?.receiptId ?? null, reasons, score, savedAlready: saved.has(item?.receiptId), index });
  });

  // Stable: equal relevance keeps the official order; already-saved items sink within their score.
  kept.sort((a, b) => b.score - a.score || Number(a.savedAlready) - Number(b.savedAlready) || a.index - b.index);
  return { version: FOR_YOU_VERSION, items: kept.map(({ index, ...rest }) => rest), hidden };
}
