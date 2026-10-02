/**
 * ASK · NFL PRODUCT ELIGIBILITY (Session 9 · G) — "why isn't NFL in today's Bank Builder?", answered from data.
 *
 * Reads the daily Ask projection of `public/data/nfl/family-eligibility.json`, which republishes the
 * family-level product gate in public terms (lib/products/engine-v2/nfl-family-eligibility-public.mjs).
 * Every reason Ask gives is one of that file's blockers, with its evidence numbers and the condition that
 * would clear it — so when a blocker clears upstream, the answer changes with no edit here.
 *
 * READ-ONLY. No provider, no network beyond the deployment's own asset, no write.
 */
import { ASK_ERROR, ASK_STATUS, askAssetPath } from "../contract.mjs";

export const NFL_ELIGIBILITY_FAMILIES = Object.freeze(["anytime_td", "player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions"]);

/**
 * @param {{ family?: string }} args
 * @param {{ turn: { load: (p: string) => Promise<any> } }} ctx
 */
export async function getNflProductEligibility(args, ctx) {
  const family = args?.family ? String(args.family).toLowerCase() : null;
  if (family && !NFL_ELIGIBILITY_FAMILIES.includes(family)) {
    return { status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.NOT_PUBLISHED, detail: `no NFL market called "${args.family}" is tracked for products`, known: [...NFL_ELIGIBILITY_FAMILIES] };
  }
  const loaded = await ctx.turn.load(askAssetPath.nflEligibility());
  const doc = loaded?.json;
  if (!loaded?.ok || !doc) return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE };
  if (doc.available !== true) {
    return { status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.NOT_PUBLISHED, detail: "no NFL product-eligibility record is published for the next slate yet" };
  }
  const families = (doc.families ?? []).filter((f) => !family || f.family === family);
  return {
    status: ASK_STATUS.OK,
    generatedAt: doc.generatedAt ?? null,
    slate: doc.slate ?? null,
    sport: doc.sport ?? null,
    products: doc.products ?? [],
    families,
  };
}
