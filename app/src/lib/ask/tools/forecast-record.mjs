/**
 * ASK V2 · THE FORECAST RECORD TOOLS (Session 13) — over the Universal Forecast Ledger, read from its Ask projection
 * (`ask/v1/forecast-record.json` + one rows shard per sport). Nothing is recomputed here: family metrics are the
 * Results V2 owner's own numbers, and history rows are the ledger's own rows, filtered.
 *
 *   getForecastFamilyPerformance  how one forecast type has done, with the yardstick its kind calls for
 *   getForecastHistory            one player's / team's / fighter's / game's individual published forecasts and how each
 *                                 turned out (a subject with no rows fails closed — never "0 forecasts")
 *
 * THE RULES THESE KEEP (each one an LLM would otherwise break):
 *   1. NO POOLED ACCURACY. A family returns its own metrics; there is no all-families number to quote.
 *   2. A PROJECTION HAS NO W–L. A record is returned ONLY where the owner graded a directional claim, with the basis it
 *      graded (a published pick, or the side a projection or probability pointed to).
 *   3. PENDING, VOID AND WITHDRAWN ARE NEVER MISSES. Each row carries its state in words; only measured rows carry a score.
 *   4. A FILTERED LIST IS NOT A RECORD. History returns the matched rows and how many matched — never a hit rate over
 *      a window the owner did not publish.
 *   5. NO MARKET NUMBER AS OURS. Rows carry no sportsbook probability at all.
 */
import { ASK_ERROR, ASK_STATUS, ASK_FORECAST_KINDS, askAssetPath } from "../contract.mjs";

const SPORT_SLUG = { NFL: "nfl", MLB: "mlb", EPL: "epl", LIGUE_1: "ligue-1", UFC: "ufc" };
const RECORD_LINK = { id: "forecast-record", label: "Forecast record", href: "/results/forecasts/" };

async function loadIndex(ctx) {
  const loaded = await ctx.turn.load(askAssetPath.forecastRecord());
  if (!loaded.ok) return { ok: false, envelope: { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE } };
  if (!loaded.json?.available) {
    return { ok: false, envelope: { status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.NOT_PUBLISHED, detail: "no Forecast Record is published in this build", links: [RECORD_LINK] } };
  }
  return { ok: true, doc: loaded.json };
}

/* ─────────────────────────────  getForecastFamilyPerformance  ───────────────────────────── */

export async function getForecastFamilyPerformance(args, ctx) {
  const idx = await loadIndex(ctx);
  if (!idx.ok) return idx.envelope;
  const doc = idx.doc;
  const sport = String(args.sport).toUpperCase();
  let families = (doc.families ?? []).filter((f) => f.sport === sport);
  if (args.family) families = families.filter((f) => f.family === args.family);
  const gaps = (doc.gaps ?? []).filter((g) => g.sport === sport);
  if (!families.length) {
    return {
      status: ASK_STATUS.UNSUPPORTED,
      error: ASK_ERROR.NOT_PUBLISHED,
      detail: args.family ? `no measured ${args.family} forecasts for ${sport}` : `no measured forecasts for ${sport}`,
      sport,
      availableFamilies: (doc.families ?? []).filter((f) => f.sport === sport).map((f) => f.family),
      gaps,
      links: [RECORD_LINK],
    };
  }
  return {
    status: ASK_STATUS.OK,
    sport,
    asOf: doc.asOf ?? null,
    families: families.map((f) => ({
      family: f.family, label: f.label, kind: f.kind, counts: f.counts, n: f.n,
      ...(f.kind === "CONTINUOUS_PROJECTION" ? { mae: f.mae, medianAbsError: f.medianAbsError, rmse: f.rmse, bias: f.bias, coverage: f.coverage } : {}),
      ...(f.kind === "BINARY_PROBABILITY" ? { brier: f.brier, logLoss: f.logLoss, meanForecast: f.meanForecast, observedRate: f.observedRate, ece: f.ece } : {}),
      ...(f.kind === "MULTICLASS_PROBABILITY" ? { brier: f.brier, logLoss: f.logLoss, topClassAccuracy: f.topClassAccuracy, topClassLabel: f.topClassLabel ?? null, uniformReference: f.uniformReference } : {}),
      pickRecord: f.pickRecord ?? null,
      latestEvent: f.latestEvent ?? null,
      href: f.href,
    })),
    gaps,
    links: [RECORD_LINK, ...families.slice(0, 3).map((f) => ({ id: `fr-${f.family}`, label: `${sport} ${f.label}`, href: f.href }))],
  };
}

/* ─────────────────────────────────  getForecastHistory  ───────────────────────────────── */

function unpack(shard, row) {
  const c = shard.columns;
  const v = (k) => row[c.indexOf(k)];
  const fam = shard.dict.families[v("family")] ?? [];
  const subj = shard.dict.subjects[v("subject")] ?? [];
  return {
    family: fam[1] ?? null,
    date: v("date"),
    subjectId: subj[0] ?? null,
    subject: subj[1] ?? null,
    team: subj[2] ?? null,
    participants: Array.isArray(subj[3]) ? subj[3] : null,
    matchup: v("matchup") == null ? null : shard.dict.matchups[v("matchup")] ?? null,
    kind: ASK_FORECAST_KINDS[v("kind")] ?? null,
    projection: v("projection"),
    rangeLow: v("rangeLow"),
    rangeHigh: v("rangeHigh"),
    probability: v("probability"),
    state: v("state"),
    finalValue: v("finalValue"),
    finalCategory: v("finalCategory"),
    observed: v("observed"),
    absoluteError: v("absoluteError"),
    brier: v("brier"),
    pick: v("directional"),
    call: v("call") ?? null,
    classes: v("classes") ?? null,
  };
}

export async function getForecastHistory(args, ctx) {
  const idx = await loadIndex(ctx);
  if (!idx.ok) return idx.envelope;
  const sport = String(args.sport).toUpperCase();
  const slug = SPORT_SLUG[sport];
  if (!slug) return { status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.UNSUPPORTED_SPORT, detail: `no forecast history for ${sport}`, links: [RECORD_LINK] };
  if (!args.playerId && !args.gameId && !args.teamId) {
    return { status: ASK_STATUS.ERROR, error: ASK_ERROR.MISSING_ARGUMENT, detail: "name a player, team or game (resolveEntity first)" };
  }
  const loaded = await ctx.turn.load(askAssetPath.forecastRows(slug));
  if (!loaded.ok) return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE };
  const shard = loaded.json;
  let rows = (shard.rows ?? []).map((r) => unpack(shard, r));
  /* A team, club or fighter is the subject of its own rows (NFL team score) or a joined side of a game-level row. */
  const involves = (id) => (r) => r.subjectId === id || (r.participants ?? []).some(([pid]) => pid === id);
  const who = args.playerId ?? args.teamId ?? null;
  if (args.playerId) rows = rows.filter(involves(args.playerId));
  if (args.teamId) rows = rows.filter(involves(args.teamId));
  if (args.gameId) rows = rows.filter((r) => r.subjectId === args.gameId || r.matchup === args.gameId);
  /*
   * ⚠ FAIL CLOSED, NEVER "0 FORECASTS" (2026-10-05 audit). Game-level rows (MLB moneyline / run line / total, NFL
   * winner / total / margin, EPL 1X2 / over 2.5, UFC winner) are keyed by the GAME; they now reach a team, club or
   * fighter through the joined `participants`, but a side that did not join (a fighter with no Ask entity) still matches
   * nothing. A subject with no rows here is a subject this tool cannot list, said as that, with the Forecast Record
   * linked; it is never an empty record — the evidence once turned that into "has not published any match forecasts".
   */
  const subjectTotal = rows.length;
  /* The name of who was asked about: their own row's name, else their joined side's label — never the game's title. */
  const nameOf = (r) => (r.subjectId === who ? r.subject : (r.participants ?? []).find(([pid]) => pid === who)?.[1] ?? r.subject);
  const subjectName = rows[0] ? (who ? nameOf(rows[0]) : rows[0].subject) : null;
  const familyLink = args.family ? (idx.doc.families ?? []).find((f) => f.sport === sport && f.family === args.family) : null;
  const recordLinks = [RECORD_LINK, ...(familyLink ? [{ id: `fr-${familyLink.family}`, label: `${sport} ${familyLink.label} record`, href: familyLink.href }] : [])];
  if (!subjectTotal) {
    const what = args.teamId ? "team or club" : args.gameId ? "game" : sport === "UFC" ? "fighter" : "player";
    return {
      status: ASK_STATUS.UNSUPPORTED,
      error: ASK_ERROR.UNSUPPORTED_DATA,
      detail: `forecast history for that ${what} is not available through Ask yet; the Forecast Record pages list every graded ${sport} forecast`,
      links: recordLinks,
    };
  }
  if (args.family) rows = rows.filter((r) => r.family === args.family);
  if (args.minProjection != null) rows = rows.filter((r) => typeof r.projection === "number" && r.projection > args.minProjection);
  if (args.maxProjection != null) rows = rows.filter((r) => typeof r.projection === "number" && r.projection < args.maxProjection);
  if (args.settledOnly) rows = rows.filter((r) => r.state === "SETTLED");
  const matched = rows.length;
  const sportFamilies = (idx.doc.families ?? []).filter((f) => f.sport === sport);
  const labels = new Map(sportFamilies.map((f) => [f.family, f.label]));
  /* What a row's WIN / LOSS grades — the family's own basis, so a graded side is never called "the published pick". */
  const bases = new Map(sportFamilies.map((f) => [f.family, f.pickRecord?.basis ?? null]));
  const shown = rows.slice(0, args.limit ?? 5).map((r) => ({ ...r, familyLabel: labels.get(r.family) ?? r.family, pickBasis: r.pick ? bases.get(r.family) ?? null : null }));
  const fam = familyLink;
  return {
    status: ASK_STATUS.OK,
    sport,
    subjectId: args.playerId ?? args.teamId ?? args.gameId,
    subject: subjectName,
    matched,
    subjectTotal,
    returned: shown.length,
    rows: shown,
    asOf: idx.doc.asOf ?? null,
    links: [fam ? { id: `fr-${fam.family}`, label: `${sport} ${fam.label} record`, href: fam.href } : RECORD_LINK],
  };
}
