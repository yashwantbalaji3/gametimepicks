/**
 * SESSION 5 · PHASE B — getOfficialProductCards: the cards GameTimePicks PUBLISHED, read from their owners.
 *
 * "What is today's Bank Builder?" had no source, and "today's suggested parlays" was answered from the optimizer's
 * candidate pool — not the ladder /build publishes. This tool reads only the `official` block of the parlays
 * projection (build-ask-projections.mjs buildOfficialCards): the dated risk ladder, today's published Bank
 * Builder / Moonshot lanes, and a past day's frozen lanes with their canonical results.
 *
 * It decides nothing. No card is built, re-priced, re-tiered or re-graded here; a tier with no card carries the
 * ladder's own reason, an awaiting lane its own reason. "No card" is a published state — never "pending".
 * Records (and which population a record counts) are getProductRecord's, and an open founder decision.
 */
import { ASK_ERROR, ASK_STATUS, askAssetPath } from "../contract.mjs";

export const OFFICIAL_PRODUCTS = Object.freeze(["SUGGESTED_PARLAYS", "BANK_BUILDER", "MOONSHOT"]);
const LANE_PRODUCT = { BANK_BUILDER: "bank-builder", MOONSHOT: "moonshot" };
const LINKS = Object.freeze({
  SUGGESTED_PARLAYS: { id: "suggested", label: "Open Suggested cards", href: "/build/" },
  BANK_BUILDER: { id: "bank-builder", label: "Open Bank Builder", href: "/bank-builder/" },
  MOONSHOT: { id: "moonshot", label: "Open Moonshot", href: "/moonshot/" },
});
const TIER_OF_ARG = { LOW: "low", MEDIUM: "medium", HIGH: "high", LONGSHOT: "longshot" };

const etDateOf = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** A lane's published state, in the product's own words. */
export function laneState(l) {
  if (l.result && l.result !== "pending") return String(l.result).toUpperCase();     // a settled day: WON / LOST / VOID / PUSH
  if (l.status === "active") return (l.legs ?? []).length ? "CARD PLACED" : "ACTIVE";
  if (l.status === "awaiting" && !(l.legs ?? []).length) return "NO CARD PLACED";
  return String(l.status ?? "unknown").toUpperCase();
}

export async function getOfficialProductCards(args, ctx) {
  const loaded = await ctx.turn.load(askAssetPath.parlays());
  if (!loaded.ok) return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE };
  const official = loaded.json?.official;
  if (!official) return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE };

  const date = args.date ?? etDateOf((ctx.now ? ctx.now() : new Date()).toISOString());
  const wanted = args.product ? [args.product] : [...OFFICIAL_PRODUCTS];
  const out = {};

  if (wanted.includes("SUGGESTED_PARLAYS")) {
    const day = official.suggested?.[date] ?? null;
    const tier = args.riskTier ? TIER_OF_ARG[args.riskTier] : null;
    /* Session 7: the PUBLISHED-card record (D1's population, published-band-record.mjs) for the asked level, or
       every level. Never the candidate pool — the projection carries no other population. */
    const r = official.suggestedRecord;
    const record = r && r.population === "PUBLISHED_CARDS"
      ? { population: r.population, sport: r.sport, since: r.since, settledDays: r.settledDays, overall: tier ? null : r.overall, byTier: Object.fromEntries(Object.entries(r.byTier ?? {}).filter(([t]) => !tier || t === tier)) }
      : null;
    out.suggestedParlays = day
      ? {
        published: true, date, generatedAt: day.generatedAt,
        cards: day.cards.filter((c) => !tier || c.tier === tier),
        noCardTiers: day.skipped.filter((x) => !tier || x.tier === tier),
        state: day.cards.some((c) => !tier || c.tier === tier) ? "PUBLISHED" : "NO QUALIFYING CARD",
        record,
      }
      : { published: false, date, state: "NOT PUBLISHED", detail: `no official Suggested Parlays ladder was published for ${date}`, latestPublishedDate: (official.suggestedDates ?? []).at(-1) ?? null, record };
  }
  for (const key of ["BANK_BUILDER", "MOONSHOT"]) {
    if (!wanted.includes(key)) continue;
    const day = official.portfolios?.[date] ?? null;
    const lanes = (day?.lanes ?? []).filter((l) => l.product === LANE_PRODUCT[key]).map((l) => ({ ...l, state: laneState(l) }));
    out[key === "BANK_BUILDER" ? "bankBuilder" : "moonshot"] = lanes.length
      ? { published: true, date, generatedAt: day.generatedAt, source: day.source, lanes }
      : { published: false, date, state: "NOT PUBLISHED", detail: `no official ${key === "BANK_BUILDER" ? "Bank Builder" : "Moonshot"} portfolio was published for ${date}`, latestPublishedDate: (official.portfolioDates ?? []).at(-1) ?? null };
  }

  /* Session 7: a risk level's published-card record answers "how has it performed" even on a day with no ladder. */
  const tierRecordAnswers = Boolean(args.riskTier && out.suggestedParlays?.record && Object.keys(out.suggestedParlays.record.byTier ?? {}).length);
  const any = Object.values(out).some((p) => p.published) || tierRecordAnswers;
  const links = wanted.map((k) => LINKS[k]);
  if (!any) {
    return {
      status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.NOT_PUBLISHED, date,
      detail: `GameTimePicks published no official ${wanted.length === 1 ? wanted[0].toLowerCase().replace(/_/g, " ") : "product"} card for ${date}`,
      products: out, links,
    };
  }
  return { status: ASK_STATUS.OK, dateApplied: date, products: out, links };
}
