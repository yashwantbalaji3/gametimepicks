/**
 * ASK FORECAST + PARLAY TOOLS — the two places where "the model might make something up" is not a
 * hypothetical, and the two tools most carefully shaped so it cannot.
 *
 * THE FORECAST TOOL CANNOT REACH A BLOCKED MODEL, BY CONSTRUCTION
 * --------------------------------------------------------------
 * There is no `includePrivate`, no `includeShadow`, no `includePaused`, no status override. Those
 * arguments do not exist in the registry, so a planner cannot pass one and a prompt cannot ask for
 * one. The projection contains only what the published owners published, with `pauseMlbMarkets`
 * already applied upstream, so the blocked data is not filtered here — it never arrives.
 *
 * A paused market is the one deliberate exception, and it is carried ON PURPOSE with status PAUSED and
 * the owner's own reason, because "why is this MLB market paused?" is a real question with a real
 * answer. `publishedMarkets()` is what the writer is given; the paused row goes in a separate field it
 * can only quote as an explanation. Explaining a pause and forecasting through one are different jobs,
 * and the separation is in the data shape rather than in a prompt instruction.
 *
 * THE PARLAY TOOL CANNOT INVENT A LEG, BY CONSTRUCTION
 * ----------------------------------------------------
 * It returns candidates the optimizer produced, identified by the optimizer's own `slipId`, with legs
 * copied field-for-field. The model selects and explains among them. It has no tool that composes a
 * slip, so "build me a 5-leg parlay from the best legs" is answered with the candidates that exist —
 * there is no code path that would assemble a new one even if it asked.
 */
import {
  ASK_ERROR,
  ASK_EXPECTED_PARLAY_SPORTS,
  ASK_STATUS,
  RISK_SECTION_KEY,
  askAssetPath,
} from "../contract.mjs";

/* ────────────────────────────  getPublishedForecasts  ──────────────────────────── */

export async function getPublishedForecasts(args, ctx) {
  const loaded = await ctx.turn.load(askAssetPath.forecasts());
  if (!loaded.ok) return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE };
  const doc = loaded.json;

  let rows = doc.forecasts ?? [];
  if (args.sport) rows = rows.filter((f) => f.sport === args.sport);
  if (args.gameId) rows = rows.filter((f) => f.gameId === args.gameId);
  if (args.date) rows = rows.filter((f) => (f.date ?? etDateOf(f.startUtc)) === args.date);
  if (args.teamId) {
    // Team matching is by the ids the entity resolver hands out, or by the abbreviations the artifacts
    // carry — never by a name the model typed, which is how the wrong team's forecast gets returned.
    const want = String(args.teamId).toLowerCase();
    rows = rows.filter((f) =>
      [f.home, f.away, f.homeName, f.awayName, f.gameId].some((v) => v && String(v).toLowerCase() === want)
      || want.endsWith(String(f.home ?? "").toLowerCase())
      || want.endsWith(String(f.away ?? "").toLowerCase()));
  }

  if (!rows.length) {
    return {
      status: ASK_STATUS.UNSUPPORTED,
      error: ASK_ERROR.NOT_PUBLISHED,
      /*
       * "No published forecast" is a real, correct answer and must not be softened into one. A model
       * asked "who wins tonight" with nothing published should say nothing is published — not reach
       * for recorded history and present it as a prediction (§44).
       */
      detail: "no currently published GameTime forecast matches",
      eligibleSports: doc.eligibleSports ?? [],
      links: [{ id: "today", label: "See today's slate", href: "/today/" }],
    };
  }

  const forecasts = rows.slice(0, args.limit).map(shapeForecast);
  return {
    status: ASK_STATUS.OK,
    totalMatched: rows.length,
    returned: forecasts.length,
    forecasts,
    links: forecasts.flatMap((f) => f.links),
  };
}

function shapeForecast(f) {
  const published = (f.markets ?? []).filter((m) => m.status === "PUBLISHED");
  const paused = (f.markets ?? []).filter((m) => m.status === "PAUSED");
  return {
    forecastId: f.forecastId,
    sport: f.sport,
    gameId: f.gameId,
    matchup: f.matchup ?? (f.away && f.home ? `${f.away} @ ${f.home}` : null),
    startUtc: f.startUtc ?? null,
    /*
     * EXPERIMENTAL TRAVELS WITH THE FORECAST. NFL and EPL forecasts publish and are graded, but every
     * NFL event is EXPERIMENTAL_LEAN and none qualifies as a product leg. A reader told "GameTime
     * forecasts DET" without that word has been told something the product does not claim.
     */
    experimental: Boolean(f.experimental),
    modelStatus: f.experimental ? "EXPERIMENTAL" : "PUBLISHED",
    capability: f.capability ?? null,
    predictedWinner: f.predictedWinner ?? null,
    probabilities: f.probabilities ?? null,
    markets: published,
    /* Quotable as an explanation, never presentable as a forecast. */
    pausedMarkets: paused.map((m) => ({ market: m.market, label: m.label, reason: m.pausedReason })),
    why: f.why ?? [],
    completeness: f.completeness ?? null,
    players: f.players ?? [],
    updatedAt: f.updatedAt ?? null,
    links: f.links ?? [],
  };
}

const etDateOf = (iso) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
};

/* ────────────────────────────  getParlayCandidates  ──────────────────────────── */

export async function getParlayCandidates(args, ctx) {
  const loaded = await ctx.turn.load(askAssetPath.parlays());
  if (!loaded.ok) return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE };
  const doc = loaded.json;

  const date = args.date ?? (doc.dates ?? []).slice(-1)[0] ?? null;
  const day = date ? doc.byDate?.[date] : null;
  if (!day) {
    return {
      status: ASK_STATUS.UNSUPPORTED,
      error: ASK_ERROR.NOT_PUBLISHED,
      detail: date ? `no parlay candidates were published for ${date}` : "no parlay candidates are published",
      availableDates: doc.dates ?? [],
      links: [{ id: "parlay-lab", label: "Open Parlay Lab", href: "/parlay-lab/" }],
    };
  }

  const profiles = args.riskProfile ? [args.riskProfile] : Object.keys(day.profiles ?? {});
  let slips = profiles.flatMap((p) => day.profiles?.[p] ?? []);

  /*
   * ⚠ SPORT ELIGIBILITY IS CHECKED AGAIN HERE, AND NOT BECAUSE THE BUILDER IS UNTRUSTED.
   *
   * The builder drops sport cuts the capability registry refuses, so an ineligible sport should never
   * be in this artifact. This second check exists because the artifact is a FILE: it is emitted by one
   * process, read by another, and a stale or hand-edited copy is exactly the scenario where a dormant
   * `nba` cut would reappear. Two independent checks, one at write and one at read, is the difference
   * between "we filter it" and "it cannot get through".
   */
  const eligible = new Set((day.eligibleSports ?? ASK_EXPECTED_PARLAY_SPORTS).map((s) => String(s).toUpperCase()));
  const refusedSports = new Set();
  slips = slips.filter((s) => {
    const ok = s.legs.every((l) => eligible.has(String(l.sport).toUpperCase())) && eligible.has(String(s.sport).toUpperCase());
    if (!ok) refusedSports.add(s.sport);
    return ok;
  });

  if (args.sports) {
    const want = new Set(args.sports.map((s) => s.toUpperCase()));
    slips = slips.filter((s) => want.has(String(s.sport).toUpperCase()));
  }
  if (args.maxLegs) slips = slips.filter((s) => s.legCount <= args.maxLegs);

  if (!slips.length) {
    return {
      status: ASK_STATUS.UNSUPPORTED,
      error: ASK_ERROR.NOT_PUBLISHED,
      detail: "no published candidate matches those preferences",
      date,
      availableProfiles: Object.keys(day.profiles ?? {}),
      eligibleSports: [...eligible],
      links: [{ id: "parlay-lab", label: "Open Parlay Lab", href: "/parlay-lab/" }],
    };
  }

  /*
   * DETERMINISTIC RERANK OVER THE OWNER'S OWN FIELDS (§104). The optimizer's `score` is the ranking; a
   * lower leg count breaks ties within a profile. There is no learned reranker, and the model is never
   * asked to sort candidates by intuition — it receives them already ordered and explains the order it
   * was given.
   */
  slips.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.legCount - b.legCount || (a.slipId < b.slipId ? -1 : 1));

  const candidates = slips.slice(0, args.limit).map((s) => ({
    slipId: s.slipId,
    riskProfile: s.profile,
    sport: s.sport,
    legCount: s.legCount,
    sameGame: s.sameGame,
    rationale: s.rationale,
    optimizerScore: s.score,
    /*
     * CORRELATION IS REPORTED, NOT INFERRED. The optimizer's own penalty is passed through. Where it is
     * null, `correlationModelled` is false and the writer must say correlation is not modelled for this
     * candidate — it must never say the legs are independent, which is a claim no owner makes (§114).
     */
    correlationPenalty: s.correlationPenalty,
    correlationModelled: s.correlationPenalty != null,
    legs: s.legs,
    payoutPer100: s.payoutPer100,
    links: [{ id: "parlay-lab", label: "Open in Parlay Lab", href: "/parlay-lab/" }],
  }));

  return {
    status: ASK_STATUS.OK,
    date,
    generatedAt: day.generatedAt ?? null,
    riskProfile: args.riskProfile ?? null,
    riskSectionKey: args.riskProfile ? RISK_SECTION_KEY[args.riskProfile] : null,
    totalMatched: slips.length,
    returned: candidates.length,
    candidates,
    eligibleSports: [...eligible],
    refusedSports: [...refusedSports],
    /*
     * STATED IN THE RESULT, NOT ONLY IN THE PROMPT. The writer receives, as data, the fact that no
     * price-aware expected value owner exists — so "these are not ranked by expected value" is a fact
     * it is repeating rather than a rule it is obeying.
     */
    expectedValueAvailable: false,
    stakePolicyAvailable: false,
    links: [{ id: "parlay-lab", label: "Open Parlay Lab", href: "/parlay-lab/" }],
  };
}
