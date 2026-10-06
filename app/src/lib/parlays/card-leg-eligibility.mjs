/**
 * CARD-LEG ELIGIBILITY — the ONE rule for "may this leg appear on a suggested card?" (Suggested Parlays V2 · F-1).
 *
 * Before this, the optimizer, the MLB risk ladder, the tier grid and Ask each decided on their own, and none of them
 * looked at a market FAMILY's status: every public MLB card was built from batter-hits / H+R+RBI legs, a family the
 * coverage registry (lib/market-coverage.ts) marks DEMOTED_TO_MARKET_CONTEXT, publicEligible false — and the cards were
 * picked by that demoted model's own edge and confidence. A demoted model may not be promoted for content, so:
 *
 *   - a leg whose sport:family the registry demotes to market context is NOT eligible, and a card with any such leg is
 *     withheld (counted, with the families named — never silently dropped);
 *   - a price older than PRICE_MAX_AGE_DAYS is not a price anyone can act on (the lab's own freshness rule, owned here).
 *
 * The registry is read through its committed projection (data/ask-projection/v1/coverage.json — built from
 * market-coverage.ts on every build and held to it by `ask:check`), so plain-Node producers and the TypeScript app
 * read the same answer. Pure except `loadCommittedCoverage`.
 */
import fs from "node:fs";
import path from "node:path";

/** How stale a price capture may be before it stops being publishable (was lab-eligibility's private constant). */
export const PRICE_MAX_AGE_DAYS = 3;

/** The coverage registry's demoted families as "SPORT:family" keys (sport upper-cased). */
export function marketContextFamilies(coverageDoc) {
  return new Set((coverageDoc?.markets ?? [])
    .flatMap((m) => (m.demotedFamilies ?? []).map((f) => `${String(m.sport).toUpperCase()}:${f}`)));
}

/** Is this leg from a market-context (demoted) family? `sport` is the card's sport when the leg carries none. */
export function legIsMarketContext(leg, families, sport = null) {
  return families.has(`${String(leg?.sport ?? sport ?? "").toUpperCase()}:${leg?.market}`);
}

/**
 * Split cards into those every leg of which is eligible and those withheld. The withheld are counted and their
 * families named, so a surface can say WHY a lane has no card instead of just showing nothing.
 */
export function partitionByLegEligibility(slips, families, sport = null) {
  const eligible = [];
  const withheld = [];
  const named = new Set();
  for (const s of slips ?? []) {
    const bad = (s.legs ?? []).filter((l) => legIsMarketContext(l, families, s.sport ?? sport));
    if (bad.length) { withheld.push(s); for (const l of bad) named.add(l.marketLabel ?? l.market); }
    else eligible.push(s);
  }
  return { eligible, withheld, withheldFamilies: [...named].sort() };
}

/**
 * The same rule applied to the LIVE LEG POOL (Build Your Own, /today's Parlay Center tile, the explorer, the Bank
 * Builder dry-run preview — every surface fed by `loadTodaySlate`). Before this, that pool only checked that an event
 * had not started, so before first pitch every demoted MLB prop leg reached Build Your Own as "model-qualified".
 *
 * Fails CLOSED, never open:
 *   - no coverage document → no leg is kept (the rule cannot be judged, so nothing is promoted);
 *   - a sport whose registry demotes any family → a leg of that sport must resolve to exactly ONE family key
 *     (its own `marketKey`, else `familyKeysByLabel.get("SPORT|<marketType>")`); an unknown or ambiguous family
 *     is withheld.
 * Legs of sports with no demoted family are unchanged. Pure: the caller loads the coverage document.
 */
export function withholdMarketContextLegs(legs, coverageDoc, familyKeysByLabel = new Map()) {
  const all = legs ?? [];
  if (!coverageDoc) return { kept: [], withheldCount: all.length };
  const families = marketContextFamilies(coverageDoc);
  const gatedSports = new Set([...families].map((k) => k.split(":")[0]));
  const kept = all.filter((l) => {
    const sport = String(l?.sport ?? "").toUpperCase();
    if (!gatedSports.has(sport)) return true;
    let family = l?.marketKey ?? null;
    if (!family) {
      const keys = familyKeysByLabel.get(`${sport}|${l?.marketType ?? ""}`);
      if (!keys || keys.size !== 1) return false;
      family = [...keys][0];
    }
    return !legIsMarketContext({ sport, market: family }, families);
  });
  return { kept, withheldCount: all.length - kept.length };
}

/** Is a price captured at `capturedAt` still fresh at `nowIso`? An unreadable timestamp is never fresh. */
export function priceIsFresh(capturedAt, nowIso) {
  const c = Date.parse(capturedAt ?? ""), n = Date.parse(nowIso ?? "");
  return Number.isFinite(c) && Number.isFinite(n) && (n - c) / 86_400_000 <= PRICE_MAX_AGE_DAYS;
}

/** The committed coverage projection, or null (a caller then withholds nothing it cannot judge — and says so). */
export function loadCommittedCoverage(repoRoot) {
  try { return JSON.parse(fs.readFileSync(path.join(repoRoot, "data/ask-projection/v1/coverage.json"), "utf8")); }
  catch { return null; }
}

/** The one sentence every surface uses for a lane emptied by this rule. */
export const marketContextReason = (families) =>
  `every candidate on today's slate uses a market-context family (${families.join(", ") || "demoted"}) — the model behind it was demoted and is not a published GameTime projection, so no card is offered`;
