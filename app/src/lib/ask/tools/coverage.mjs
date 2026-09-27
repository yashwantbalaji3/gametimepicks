/**
 * ASK COVERAGE TOOL (§2.3, §4.3, §10) — "does GameTimePicks actually have this, and may it be used?"
 *
 * WHY THIS IS THE TOOL ASK WAS MISSING. §4.3 lists the states Ask must STATE rather than work
 * around — NOT_LIVE_TRACKABLE, DEMOTE_TO_MARKET_CONTEXT, STOP, REJECTED, PAUSED, UNEVALUATED, no
 * authoritative measurement — and Ask had no tool that could answer any of them. It could fetch a
 * forecast, a record and a live slate; it could not say whether a market is allowed to be treated
 * as a forecast at all. So "what is GameTimePicks' read on batter hits?" had no grounded answer,
 * and the only safe behaviour was a refusal that could not explain itself.
 *
 * ⚠ IT DERIVES, IT DOES NOT RESTATE. Every field comes from a registry that already governs the
 * product — `market-coverage.ts` for what is published, `model-calibration-status.ts` for whether
 * the model is allowed to be called one. Copying either into this file would be the second source
 * of truth §10 exists to prevent, and the one that drifts is always the copy.
 *
 * ⚠ AND IT NEVER SAYS "COMING SOON". A limitation is a fact about today, not a promise about
 * tomorrow. The registry's own wording is passed through unchanged.
 *
 * READ-ONLY. No provider, no network, no write.
 *
 * ⚠ IT READS A PROJECTION, NOT THE REGISTRIES DIRECTLY, AND THAT IS NOT A STYLE CHOICE. The first
 * cut imported `market-coverage.ts` and `model-calibration-status.ts`. Both are TypeScript; Ask
 * answers from `api/ask.mjs`, a plain-node serverless function that cannot load a `.ts` module — so
 * the tool worked under the test runner and would have thrown in production. No other Ask tool
 * imports a `.ts` file, which was the signal. The derivation moved to
 * `scripts/ask/build-ask-projections.mjs`, which already runs under `tsx` and already imports those
 * owners, and the result is a committed projection this tool loads like every other asset.
 */
import { ASK_ERROR, ASK_STATUS, askAssetPath } from "../contract.mjs";

/** The sports this registry actually describes. Anything else is refused, not guessed at. */
export const COVERAGE_SPORTS = Object.freeze(["mlb", "nfl", "ufc", "soccer"]);

/**
 * @param {{ sport: string, market?: string }} args
 * @param {{ turn: { load: (p: string) => Promise<any> } }} ctx
 */
export async function getCoverage(args, ctx) {
  const sport = String(args?.sport ?? "").toLowerCase();
  if (!COVERAGE_SPORTS.includes(sport)) {
    return {
      status: ASK_STATUS.UNSUPPORTED,
      error: ASK_ERROR.UNSUPPORTED_SPORT,
      sport: args?.sport ?? null,
      known: [...COVERAGE_SPORTS],
    };
  }

  const loaded = await ctx.turn.load(askAssetPath.coverage());
  /* ⚠ `loaded.json`, not `loaded.doc`. The loader returns `{ ok, json }`; reading a key it does not
     have gave `ok: true` with an undefined payload, which fell through to ASSET_UNAVAILABLE and
     read on screen as "GameTimePicks publishes no coverage registry" — a refusal caused by a typo,
     which is the most convincing kind of wrong answer. */
  const doc = loaded?.json;
  if (!loaded?.ok || !Array.isArray(doc?.markets)) {
    return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE, sport };
  }

  const wanted = args?.market ? String(args.market).toLowerCase() : null;
  const rows = doc.markets
    .filter((r) => r.sport === sport)
    .filter((r) => {
      if (!wanted) return true;
      if (r.market.toLowerCase() === wanted) return true;
      if (String(r.label).toLowerCase().includes(wanted)) return true;
      /* ⚠ A FAMILY NAME MUST FIND THE ROW THAT GOVERNS IT. "batter hits" is not this registry's key
         (`player_props`) nor in its label ("Player props (K / hits / TB)") — it is a calibration
         family. Without this, asking about the exact market whose demotion matters most returned
         every other MLB row instead. */
      const norm = wanted.replace(/[\s-]+/g, "_");
      return (r.governedFamilies ?? []).some((f) => f === norm || f.includes(norm) || norm.includes(f));
    });

  if (!rows.length) {
    /* A market this registry does not describe is one GameTimePicks does not cover — and saying so
       is the answer, not a failure. */
    return {
      status: ASK_STATUS.OK,
      sport, market: args?.market ?? null,
      covered: false,
      markets: [],
      note: `GameTimePicks publishes no coverage entry for that ${sport} market.`,
    };
  }

  return {
    status: ASK_STATUS.OK,
    sport,
    market: args?.market ?? null,
    covered: true,
    markets: rows,
  };
}
