/**
 * BANK BUILDER & MOONSHOT · RECOMMENDATION CLASSES under `bbm-rules@2` (founder directive 2026-11-04 ~19:00Z). PURE.
 *
 *   LEVEL_A  MODEL-VALIDATED VALUE    a validated probability with EV under uncertainty (rules-v2.mjs). None today.
 *   LEVEL_B  HISTORICAL HIT-RATE RESEARCH   hit-rate evidence, role, availability, data quality and price checks pass.
 *            NO EV CLAIM and no probability: a hit rate is shown only as hits of n, never as a percentage chance.
 *            Appears only in an explicitly labelled research challenge, and only if the founder approves that mode.
 *   HOLD     anything else, with every reason.
 *
 * Six signals are separate inputs and are reported separately; they are never added up into a "probability":
 *   A evidence strength (hit-rate windows with denominators, the evaluator's shrunk rate)
 *   B role / minutes stability          C availability / injury          D data quality
 *   E market (exact line at one book, depth, bounds, freshness)          F model validation (Level A only)
 * A card is LEVEL_B only when every leg is; Level B cards are ranked by an explicit rules-based order (below), labelled
 * as such. Props (pts/reb/ast) and moneylines are candidates alike; prop prices come from the private props capture.
 */
import { canonical, sha256 } from "./chain.mjs";
import { priceRatio, payoutCents, decimalToAmerican } from "./payout.mjs";
import { stepPosition, RULES_VERSION } from "./rules-v2.mjs";
import { ELIGIBLE_OPERATOR_KEYS } from "../sports/odds/eligible-operators.mjs";
import { EVIDENCE_LABEL, SELECTION_LABEL, publicFlags, laneTypeOf, laneTypeRefusal, evidenceLine, propositionIdentity } from "./card-fields.mjs";
export { EVIDENCE_LABEL, PRIVATE_LEG_FIELDS, publicLeg, privateLeg } from "./card-fields.mjs";

export const SHORTLIST_SCHEMA = "gtp.bbm.level-b-shortlist@1";
export const LEVEL = Object.freeze({ A: "LEVEL_A", B: "LEVEL_B", HOLD: "HOLD" });
export const LEVEL_LABEL = Object.freeze({ LEVEL_A: "MODEL-VALIDATED VALUE", LEVEL_B: "HISTORICAL HIT-RATE RESEARCH — no EV claim", HOLD: "HOLD" });
export const RANKING_LABEL = "RULES-BASED RANKING — an ordering of evidence, not a probability; no EV claim";
export const NOV4_SNAPSHOT_OVERRIDE = Object.freeze({ id: "2026-11-04-founder-odds-snapshot-override", capturedFrom: "2026-11-04T21:05:00Z", capturedTo: "2026-11-04T21:07:00Z", expiresAt: "2026-11-05T04:59:59Z", label: "ODDS SNAPSHOT · 4:05 PM ET", receipt: "docs/receipts/FOUNDER_ODDS_SNAPSHOT_OVERRIDE_2026-11-04.md (f529fa44fa)" });
/**
 * The latest instant a priced card may be posted: the earliest leg tip, and (without an exception) quote fetch + 90 min;
 * under a dated freshness exception the 90-minute term is replaced by the exception's expiry. Never after a tip.
 * @param {{ startUtc: string, fetchedAt?: string, quote?: { fetchedAt: string } }[]} legs
 */
export function latestPostAt(legs, { freshnessOverride = null, maxQuoteAgeMs = 90 * 60 * 1000 } = {}) {
  const tip = Math.min(...legs.map((l) => Date.parse(l.startUtc)));
  const fetched = Math.min(...legs.map((l) => Date.parse(l.fetchedAt ?? l.quote?.fetchedAt ?? l.priceCheck?.fetchedAt)));
  const inWindow = freshnessOverride && legs.every((l) => { const f = Date.parse(l.fetchedAt ?? l.quote?.fetchedAt ?? l.priceCheck?.fetchedAt); return f >= Date.parse(freshnessOverride.capturedFrom) && f <= Date.parse(freshnessOverride.capturedTo); });
  const quoteLimit = inWindow ? Date.parse(freshnessOverride.expiresAt) : fetched + maxQuoteAgeMs;
  return new Date(Math.min(tip, quoteLimit)).toISOString();
}
/* Founder approval 2026-11-05T16:04:37Z, item 2 (~/gtp-evidence/nov5-founder-approval-items1-5.md, sha256 64bbd869…):
   "Step 2 graphics may show tonight's capture for tonight's games only, with snapshot time, never as live." */
export const NOV5_SNAPSHOT_OVERRIDE = Object.freeze({ id: "2026-11-05-founder-step2-snapshot", capturedFrom: "2026-11-05T18:50:00Z", capturedTo: "2026-11-05T19:30:00Z", expiresAt: "2026-11-06T04:59:59Z", label: "ODDS SNAPSHOT · Thu 3:00 PM ET", receipt: "~/gtp-evidence/nov5-founder-approval-items1-5.md (sha256 64bbd86930ca8409552e1980b9e7b1dbae833ce35e8ad340913a67ef134b1c7d), item 2" });
export const PROP_FAMILIES = Object.freeze({ pts: "player_points", reb: "player_rebounds", ast: "player_assists" });

export const LEVEL_B_PARAMS = Object.freeze({
  minLongestWindowN: Object.freeze({ value: 20, state: "PROPOSED" }),
  minShrunkRate: Object.freeze({ value: 0.60, state: "PROPOSED" }),
  minGamesPlayed: Object.freeze({ value: 3, state: "PROPOSED" }),
  maxMinutesCv: Object.freeze({ value: 0.25, state: "PROPOSED" }),
  allowedInjury: Object.freeze({ value: Object.freeze(["ACTIVE", "PROBABLE"]), state: "PROPOSED" }),
  /* Founder 2026-11-04 ~19:25Z: an evening prop needs its role under tonight's lineup, not static morning evidence. */
  requireLineup: Object.freeze({ value: true, state: "PROPOSED" }),
  /* Founder 2026-11-04 ~19:40Z, DAILY RESEARCH SELECTION (development): hold only for integrity blockers; role and lineup
     uncertainty become disclosed flags; the payout target is a guide (a wide window, ranked evidence-first). */
  mode: Object.freeze({ value: "STRICT", state: "PROPOSED", note: "STRICT | RESEARCH" }),
  minShrunkRateByFamily: Object.freeze({ value: null, state: "PROPOSED", note: "e.g. { pts: 0.60, reb: 0.60, ast: 0.57 } from nba-engine-eval's walk-forward (cc465d1a57)" }),
  /* FOUNDER-APPROVED 2026-11-04 ~20:45Z, superseding research-band@1 (~20:40Z), verbatim via the PD: "I am superseding my
     earlier approval of 'no lower payout limit and +20% upper limit.'… I want a strict ±10% gross payout band around the
     target for the current ladder step, applicable to BOTH Bank Builder and Moonshot, across BOTH Lane A (moneylines) and
     Lane B (player props). This is an actual eligibility requirement, not a soft preference." research-band@2: gross in
     [target × 0.90, target × 1.10] for the current step (target from the step, bankroll = the actual settled bankroll). */
  guideWindow: Object.freeze({ value: Object.freeze([0.90, 1.10]), state: "FOUNDER_APPROVED", version: "research-band@2", supersedes: "research-band@1 (no lower bound, +20%; founder ~20:40Z)", approvalRef: "founder 2026-11-04 ~20:45Z via PD (strict ±10% gross band, both products, both lanes; eligibility requirement)", note: "RESEARCH: gross within [target × 0.90, target × 1.10]" }),
  lineupExcludeMinN: Object.freeze({ value: 20, state: "PROPOSED", note: "RESEARCH: exclude when tonight's teammate scenario has n ≥ this and its side rate is below lineupExcludeRate" }),
  lineupExcludeRate: Object.freeze({ value: 0.55, state: "PROPOSED" }),
  /* Founder ~19:55Z: a projected-minutes drop of ≥ 20% vs L5 is a flag, and the evidence is re-weighted to minutes-comparable games. */
  minutesDropPct: Object.freeze({ value: 0.20, state: "PROPOSED" }),
  minutesConditioned: Object.freeze({ value: null, state: "PROPOSED", note: "{ legId: { hits, n, note } } from the evaluator: games within ±4 of tonight's projected minutes" }),
  /* Founder ~19:55Z lane specialization (bbm-rules@2 laneType): A lanes moneylines only, B lanes player props only. */
  /* FOUNDER EXCEPTION, dated and expiring (receipt docs/receipts/FOUNDER_ODDS_SNAPSHOT_OVERRIDE_2026-11-04.md, commit
     f529fa44fa on claude/bbm-v2-authorization): the 21:05–21:06Z captures may be displayed past 90 min as a disclosed
     historical snapshot, until 2026-11-04 23:59 ET, pregame only. Not a global change; pass it explicitly. */
  freshnessOverride: Object.freeze({ value: null, state: "FOUNDER_EXCEPTION_DATED", note: "pass NOV4_SNAPSHOT_OVERRIDE for 2026-11-04 only" }),
  diversity: Object.freeze({ value: null, state: "PROPOSED", note: "diversity@1 (founder ~21:12Z): no identical combinations across the four lanes; a leg in at most two lanes; never a duplicate fallback" }),
  laneTypes: Object.freeze({ value: null, state: "PROPOSED", note: '{ "bb-a": "moneyline", "ms-a": "moneyline", "bb-b": "props", "ms-b": "props" }' }),
  legDecimalRange: Object.freeze({ value: Object.freeze([1.25, 4.0]), state: "PROPOSED" }),
  minBooksAtLine: Object.freeze({ value: 2, state: "PROPOSED" }),
  maxQuoteAgeMs: Object.freeze({ value: 90 * 60 * 1000, state: "PROPOSED" }),
  bandPct: Object.freeze({ value: 0.10, state: "PROPOSED" }),
  rateBucket: Object.freeze({ value: 0.05, state: "PROPOSED" }),
});
const P = (k, over) => over?.[k] ?? LEVEL_B_PARAMS[k].value;
/* Bucket index with a tolerance: 0.60 / 0.05 is 11.999… in binary floating point, and 0.60 must sit in bucket 12. */
const bucketOf = (x, bucket) => Math.floor(x / bucket + 1e-9);

/** "hits of n" text: the ONLY way a hit rate is displayed. 5 of 5 is "5 of 5", never "100%". */
export const hitRateText = (w) => `${w.hits} of ${w.n} (${w.window})`;

/** Refuse a malformed shortlist whole. */
export function verifyShortlist(doc) {
  const errs = [];
  if (doc?.schema !== SHORTLIST_SCHEMA) errs.push(`schema must be ${SHORTLIST_SCHEMA}`);
  for (const [i, c] of (doc?.candidates ?? []).entries()) {
    const at = `candidates[${i}]`;
    if (!c.eventId || !c.startUtc || !c.eventLabel) errs.push(`${at}: eventId/eventLabel/startUtc`);
    if (![...Object.keys(PROP_FAMILIES), "winner"].includes(c.family)) errs.push(`${at}: family ${c.family}`);
    if (c.family !== "winner" && !(c.player?.playerId && typeof c.line === "number" && ["over", "under"].includes(c.side))) errs.push(`${at}: a prop needs player.playerId, an exact line and side over/under`);
    if (c.family === "winner" && !["home", "away"].includes(c.side)) errs.push(`${at}: winner side`);
    for (const w of c.hitRate?.windows ?? []) if (!(Number.isInteger(w.hits) && Number.isInteger(w.n) && w.n > 0 && w.hits >= 0 && w.hits <= w.n)) errs.push(`${at}: window ${w.window} needs integer hits ≤ n`);
  }
  return errs.length ? { ok: false, errors: errs } : { ok: true };
}

/** The leg schema (founder contract), from one shortlist row. Probability and EV are null: Level B never carries them. */
export function legFromShortlist(c) {
  /* The leg id never contains the line: ids are public, the line is price data. */
  const id = c.family === "winner" ? `nba:${c.eventId}:winner:${c.side}` : `nba:${c.eventId}:${c.family}:${c.player.playerId}:${c.side}`;
  return {
    legId: id, sport: "nba", gameId: String(c.eventId), eventLabel: c.eventLabel, startUtc: c.startUtc,
    market: c.family === "winner" ? "h2h" : PROP_FAMILIES[c.family], family: c.family,
    player: c.player ?? null, team: c.family === "winner" ? c.teamAbbr ?? null : c.player?.team ?? null, side: c.side, line: c.line ?? null,
    forecastVersion: c.forecastVersion ?? null, evidenceSha256: c.evidenceSha256 ?? null,
    projection: c.projection ? { value: c.projection.value ?? null, label: "MODEL PROJECTION", snapshotId: c.projection.snapshotId ?? null } : null,
    hitRate: c.hitRate ? { windows: (c.hitRate.windows ?? []).map((w) => ({ window: w.window, hits: w.hits, n: w.n, text: hitRateText(w) })), shrunk: c.hitRate.shrunk ?? null, lineBasis: c.hitRate.lineBasis ?? null } : null,
    role: c.role ?? null, injury: c.injury ?? null, dataQuality: c.dataQuality ?? null, lineup: c.lineup ?? null,
    eloSide: c.eloSide ?? undefined, roster: c.roster ?? undefined, flags: c.family === "winner" ? c.flags ?? undefined : undefined, context: c.context ?? undefined,
    probability: null, uncertainty: null, ev: null,
  };
}

/** Prop quotes indexed for exact matching: (event, player, family, line, book) → latest record. */
export function indexPropCapture(capture) {
  const ix = new Map();
  for (const r of capture?.records ?? []) {
    if (r.schema !== "gtp.nba.prop-price@1" || typeof r.line !== "number") continue;
    const k = `${r.eventId}|${r.providerAthleteId}|${r.family}|${r.line}|${r.book}`;
    const prev = ix.get(k);
    if (!prev || String(r.fetchedAt) > String(prev.fetchedAt)) ix.set(k, r);
  }
  return ix;
}

/** One leg's quote at one book: exact line (props) or the h2h side, or null. */
function quoteAt(leg, book, { propIx, h2h }) {
  if (leg.family === "winner") {
    const o = h2h?.games?.[leg.gameId]?.books?.[book]?.[leg.side];
    const other = h2h?.games?.[leg.gameId]?.books?.[book]?.[leg.side === "home" ? "away" : "home"];
    return Number.isInteger(o?.price) ? { book, american: o.price, otherAmerican: other?.price ?? null, quotedAt: h2h.games[leg.gameId].books[book].lastUpdate ?? null, fetchedAt: h2h.fetchedAt, line: null } : null;
  }
  const r = propIx?.get(`${leg.gameId}|${leg.player.playerId}|${leg.family}|${leg.line}|${book}`);
  if (!r) return null;
  const american = leg.side === "over" ? r.overAmerican : r.underAmerican;
  const otherAmerican = leg.side === "over" ? r.underAmerican : r.overAmerican;
  return Number.isInteger(american) ? { book, american, otherAmerican: otherAmerican ?? null, quotedAt: r.capturedAt ?? null, fetchedAt: r.fetchedAt ?? null, line: r.line, recordId: r.recordId ?? null } : null;
}
const booksQuoting = (leg, books, q) => books.filter((b) => quoteAt(leg, b, q)).length;

/** Per-leg Level B signals A–E (F, model validation, is Level A only and is "not validated" today). */
export function legSignals(leg, { params = null, now } = {}) {
  const r = [];
  const f = []; // RESEARCH-mode flags: disclosed limitations, not refusals
  const research = P("mode", params) === "RESEARCH";
  const soft = (code) => (research ? f : r).push(code);
  const w = leg.hitRate?.windows ?? [];
  const longest = w.reduce((m, x) => Math.max(m, x.n), 0);
  /* RESEARCH with the evaluator's contextual block: the evidence rate is the lineup-pooled, market-shrunk rate for
     tonight's expected lineup (wider when relevant games are few), not the lineup-blind one. */
  const ctxl = research ? leg.lineup?.contextual ?? null : null;
  const A = { longestN: longest, windows: w.map((x) => x.text), shrunkRate: ctxl?.primary?.rate ?? leg.hitRate?.shrunk?.rate ?? null, nEffective: ctxl?.primary?.nEff ?? leg.hitRate?.shrunk?.nEffective ?? null, basis: ctxl ? "contextual (lineup-pooled)" : "lineup-blind", interval95: ctxl?.primary?.interval95 ?? leg.hitRate?.shrunk?.interval95 ?? null };
  /* RESEARCH moneylines (founder ~20:18Z): team evidence plus market context, never a probability. Blockers: the model
     side and the no-vig favourite disagree, or no W-L evidence. The small samples and roster turnover are disclosed. */
  if (research && leg.family === "winner") {
    const nv = leg.hitRate?.shrunk?.marketNoVig;
    const sh = leg.hitRate?.shrunk;
    const A = { longestN: longest, windows: w.map((x) => x.text), shrunkRate: typeof sh?.rate === "number" ? sh.rate : null, nEffective: sh?.nEffective ?? null, interval95: sh?.interval95 ?? null, basis: "moneyline team evidence shrunk toward the no-vig (research; not a probability)", marketNoVig: nv ?? null };
    for (const fl of leg.flags ?? []) { const code = String(fl).split(" ")[0]; if (["TOP5_OUT", "KEY_UNCERTAIN", "BACK_TO_BACK"].includes(code)) f.push(`ML_${code} ${leg.legId}: ${fl}`); }
    if (!w.length) r.push(`A_NO_EVIDENCE ${leg.legId}: no W-L windows`);
    if (!leg.eloSide || leg.eloSide !== leg.side) r.push(`ML_NOT_MODEL_SIDE ${leg.legId}`);
    if (!(typeof nv === "number" && nv > 0.5)) r.push(`ML_MARKET_DISAGREES ${leg.legId}: the no-vig favourite is the opponent`);
    if (longest < 20) f.push(`ML_SMALL_SAMPLE ${leg.legId}: W-L windows n ≤ ${longest}${leg.hitRate?.shrunk?.rate == null ? "; no fitted shrinkage" : "; shrinkage fitted on few games, wide interval"}`);
    if (leg.roster && leg.roster.stable === false) f.push(`ML_ROSTER_TURNOVER ${leg.legId}`);
    for (const k of leg.injury?.keyPlayers ?? []) f.push(`ML_KEY_${/out/i.test(k.status) ? "OUT" : "DTD"} ${leg.legId}: ${k.name} ${k.status}`);
    const D = { ok: leg.dataQuality?.ok ?? null, issues: leg.dataQuality?.issues ?? [] };
    if (D.ok !== true) r.push(`D_DATA_QUALITY ${leg.legId}`);
    if (!(Date.parse(leg.startUtc) > Date.parse(now))) r.push(`STARTED ${leg.legId}`);
    return { signals: { A, B: { stable: null, gamesPlayed: null, minutesCv: null }, C: { status: null }, D, F: { validated: false, note: "Elo is uncalibrated; no probability" } }, reasons: r, flags: f };
  }
  if (!w.length) r.push(`A_NO_EVIDENCE ${leg.legId}: no hit-rate windows`);
  else if (longest < P("minLongestWindowN", params)) r.push(`A_SMALL_SAMPLE ${leg.legId}: longest window n ${longest} < ${P("minLongestWindowN", params)}`);
  if (!(typeof A.shrunkRate === "number")) r.push(`A_NO_SHRUNK_RATE ${leg.legId}`);
  else {
    const floor = P("minShrunkRateByFamily", params)?.[leg.family] ?? P("minShrunkRate", params);
    if (A.shrunkRate < floor - 1e-9) r.push(`A_WEAK_EVIDENCE ${leg.legId}: shrunk ${A.shrunkRate.toFixed(3)} < ${floor}`);
  }
  const ro = leg.role;
  const cv = ro && ro.minutesAvg > 0 && typeof ro.minutesSd === "number" ? ro.minutesSd / ro.minutesAvg : null;
  const B = { stable: ro?.stable ?? null, gamesPlayed: ro?.gamesPlayed ?? null, minutesCv: cv };
  if (leg.family !== "winner") {
    if (!ro) r.push(`B_NO_ROLE ${leg.legId}`);
    else {
      if (ro.stable !== true) soft(`B_ROLE_UNSTABLE ${leg.legId}${ro.note ? `: ${ro.note}` : ""}`);
      if (!(ro.gamesPlayed >= P("minGamesPlayed", params))) r.push(`B_FEW_GAMES ${leg.legId}: ${ro.gamesPlayed ?? 0} < ${P("minGamesPlayed", params)}`);
      if (cv == null || cv > P("maxMinutesCv", params)) soft(`B_MINUTES_VOLATILE ${leg.legId}: minutes CV ${cv == null ? "unknown" : cv.toFixed(3)}`);
    }
  }
  /* Projected-minutes drop: the lane's projection for tonight vs the L5 mean (from the evaluator's role note or fields).
     When it drops by ≥ minutesDropPct, flag it (counts twice) and cap the evidence rate at the minutes-comparable
     window's rate (k+1)/(n+2), so a role that shrinks tonight is not ranked on history from a bigger role. */
  if (leg.family !== "winner" && ro) {
    const m = String(ro.note ?? "").match(/lane projected ([\d.]+) min; L5 mean ([\d.]+)/);
    const proj = ro.laneProjected ?? (m ? Number(m[1]) : null); const l5 = ro.l5Mean ?? (m ? Number(m[2]) : null);
    if (proj != null && l5 > 0 && proj < l5 * (1 - P("minutesDropPct", params))) {
      const mc = P("minutesConditioned", params)?.[leg.legId];
      const mw = mc ? { window: "within ±4 of tonight's projection", hits: mc.hits, n: mc.n } : w.find((x) => x.window === "last20-minutes-within-4");
      const capped = mw && mw.n > 0 ? (mw.hits + 1) / (mw.n + 2) : null;
      (research ? f : r).push(`B_MINUTES_DROP ${leg.legId}: projected ${proj} min vs L5 ${l5}${mw ? ` · minutes-comparable ${mw.hits}/${mw.n}` : " · no minutes-comparable window"}`);
      if (research) f.push(`B_MINUTES_DROP_WEIGHT ${leg.legId}`);
      if (capped != null && A.shrunkRate != null && capped < A.shrunkRate) { A.uncappedRate = A.shrunkRate; A.shrunkRate = capped; A.basis = `${A.basis}; capped to minutes-comparable games`; }
      if (A.shrunkRate != null) { const floor = P("minShrunkRateByFamily", params)?.[leg.family] ?? P("minShrunkRate", params); if (A.shrunkRate < floor - 1e-9 && !r.some((x) => x.startsWith(`A_WEAK_EVIDENCE ${leg.legId}`))) r.push(`A_WEAK_EVIDENCE ${leg.legId}: minutes-comparable rate ${A.shrunkRate.toFixed(3)} < ${floor}`); }
    }
  }
  /* The evaluator's minutes-conditioned evidence (games within ±4 of tonight's projection): always a disclosed
     MINUTES_UNCERTAIN flag, and the evidence rate is capped at its (k+1)/(n+2) when lower. */
  const mcx = P("minutesConditioned", params)?.[leg.legId];
  if (research && mcx && Number.isInteger(mcx.hits) && mcx.n > 0) {
    f.push(`B_MINUTES_UNCERTAIN ${leg.legId}: within ±4 of the projection ${mcx.hits}/${mcx.n}${mcx.note ? ` · ${mcx.note}` : ""}`);
    const capped = (mcx.hits + 1) / (mcx.n + 2);
    if (A.shrunkRate != null && capped < A.shrunkRate) { A.uncappedRate = A.uncappedRate ?? A.shrunkRate; A.shrunkRate = capped; A.basis = `${A.basis}; capped to minutes-conditioned games`; }
    const floor = P("minShrunkRateByFamily", params)?.[leg.family] ?? P("minShrunkRate", params);
    for (let i = r.length - 1; i >= 0; i--) if (r[i].startsWith(`A_WEAK_EVIDENCE ${leg.legId}`)) r.splice(i, 1);
    if (A.shrunkRate != null && A.shrunkRate < floor - 1e-9) r.push(`A_WEAK_EVIDENCE ${leg.legId}: minutes-conditioned rate ${A.shrunkRate.toFixed(3)} < ${floor}`);
  }
  const C = { status: leg.injury?.status ?? null, fetchedAt: leg.injury?.fetchedAt ?? null };
  if (leg.family !== "winner" && !P("allowedInjury", params).includes(C.status)) r.push(`C_AVAILABILITY ${leg.legId}: ${C.status ?? "unknown"}`);
  /* Lineup sensitivity: the evaluator's teammate-scenario splits (k/n at this line per scenario) decide whether the base
     sample represents tonight. Unknown → HOLD; sensitive or unrepresentative → HOLD. */
  const lu = leg.lineup;
  C.lineup = lu ? { tonightScenario: lu.tonightScenario ?? null, sensitive: lu.sensitive ?? null, baseRepresentative: lu.baseRepresentative ?? null, scenarios: (lu.scenarios ?? []).map((x) => `${x.label}: ${x.hits}/${x.games}${x.minutesAvg != null ? ` · ${x.minutesAvg} min` : ""}`), keyTeammates: (lu.keyTeammates ?? []).map((t) => `${t.name} ${t.statusNow}`) } : null;
  if (leg.family !== "winner" && P("requireLineup", params)) {
    if (!lu) r.push(`C_LINEUP_UNKNOWN ${leg.legId}: no teammate-scenario evidence`);
    else if (research && lu.contextual) {
      const cx = lu.contextual;
      if (cx.exclude) r.push(`C_LINEUP_EXCLUDED ${leg.legId}: ${cx.excludeReason ?? "lineup impact too uncertain to describe"}`);
      else if (cx.flagLevel === "HIGH" || cx.flagLevel === "MEDIUM") {
        const txt = `C_LINEUP_${cx.flagLevel} ${leg.legId}: tonight ${cx.expectedLineup ?? lu.tonightScenario ?? "?"} · exact ${cx.primary?.exact?.hits ?? "?"}/${cx.primary?.exact?.games ?? "?"} · contextual ${cx.primary?.rate} [${cx.primary?.interval95?.join(", ") ?? "?"}]${(cx.uncertainTeammates ?? []).length ? ` · uncertain: ${cx.uncertainTeammates.map((t) => t.name ?? t).join(", ")}` : ""}`;
        f.push(txt);
        if (cx.flagLevel === "HIGH") f.push(`C_LINEUP_HIGH_WEIGHT ${leg.legId}`); // a HIGH flag counts twice in ranking
      }
    } else if (research) {
      /* Contextual: exclude only when tonight's own teammate scenario is large and does not support the side (e.g. a
         starter's role jumps and the history points the other way); otherwise disclose the uncertainty. */
      const t = lu.tonight ?? (lu.scenarios ?? []).find((x) => x.label === lu.tonightScenario) ?? null;
      const rate = t && t.games > 0 ? t.hits / t.games : null;
      if (t && t.games >= P("lineupExcludeMinN", params) && rate < P("lineupExcludeRate", params)) r.push(`C_LINEUP_EXCLUDED ${leg.legId}: tonight's scenario (${lu.tonightScenario}) ${t.hits}/${t.games} does not support the side`);
      else if (lu.sensitive !== false || lu.baseRepresentative !== true) f.push(`C_LINEUP_UNCERTAIN ${leg.legId}: ${lu.tonightScenario ?? "?"}${t ? ` ${t.hits}/${t.games}` : ""}${t && t.games < 8 ? " (small sample: wide uncertainty)" : ""}${lu.note ? ` · ${lu.note}` : ""}`);
    } else if (lu.sensitive !== false || lu.baseRepresentative !== true) r.push(`C_LINEUP_SENSITIVE ${leg.legId}: ${lu.sensitive !== false ? "role shifts across plausible teammate scenarios" : "base sample does not represent tonight's lineup"}${lu.note ? ` (${lu.note})` : ""}`);
  }
  const D = { ok: leg.dataQuality?.ok ?? null, issues: leg.dataQuality?.issues ?? [] };
  if (D.ok !== true) r.push(`D_DATA_QUALITY ${leg.legId}: ${D.issues.join(", ") || "not confirmed"}`);
  if (!(Date.parse(leg.startUtc) > Date.parse(now))) r.push(`STARTED ${leg.legId}`);
  return { signals: { A, B, C, D, F: { validated: false, note: "no leg model is validated for EV today (Level A unavailable)" } }, reasons: r, flags: f };
}

/**
 * One candidate (1 or 2 legs) at one lane position. Classification: LEVEL_B only with zero reasons; else HOLD.
 * @param {object[]} set   legs from legFromShortlist
 * @param {{ position, now, propCapture?, propIx?, propCaptureSha256?, h2h?, params?, excludeGames?, bookmakers? }} ctx
 */
export function evaluateLevelSet(set, { laneType = null, position, now, propIx, propCaptureSha256 = null, h2h = null, params = null, excludeGames = [], bookmakers = ELIGIBLE_OPERATOR_KEYS }) {
  const legs = [...set].sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)) || a.legId.localeCompare(b.legId));
  const reasons = [];
  const flags = [];
  const perLeg = legs.map((l) => { const s = legSignals(l, { params, now }); reasons.push(...s.reasons); flags.push(...s.flags); return s.signals; });
  if (legs.length > 2) reasons.push("LEG_COUNT_EXCEEDED");
  for (const l of legs) { const m = laneTypeRefusal(laneType, l); if (m) reasons.push(m); }
  const players = legs.filter((l) => l.player).map((l) => l.player.playerId);
  if (new Set(players).size !== players.length) reasons.push("CORRELATED_SAME_PLAYER: no dependence model for two lines of one player");
  if (new Set(legs.map((l) => l.gameId)).size !== legs.length) reasons.push("CORRELATED_SAME_GAME: no dependence model and no provider-quoted same-game price");
  for (const l of legs) if (excludeGames.includes(l.gameId)) reasons.push(`DIVERSIFICATION ${l.legId}: game held by the other lane`);
  const candidateId = `v2b-${sha256(`${RULES_VERSION}|B|${position.product}|${position.step}|${legs.map((l) => l.legId).join("+")}`).slice(0, 16)}`;
  const base = { candidateId, selectionMode: P("mode", params), legCount: legs.length, rulesVersion: RULES_VERSION, rankingLabel: RANKING_LABEL, probability: null, ev: null, evClaim: false };
  const legView = (q) => legs.map((l, i) => ({ ...l, quote: q?.[i] ?? null, signals: perLeg[i] }));

  /* E: one book prices every leg at its exact line; the first eligible operator in fixed order (never shopped). */
  const q = { propIx, h2h };
  const book = bookmakers.find((b) => legs.every((l) => quoteAt(l, b, q)));
  if (!book) return { ...base, classification: LEVEL.HOLD, reasons: [...reasons, "E_NO_SINGLE_BOOK_AT_EXACT_LINE"], legs: legView(null), price: null, money: null };
  const quotes = legs.map((l) => quoteAt(l, book, q));
  const [minDec, maxDec] = P("legDecimalRange", params);
  let ratio = { n: 1n, d: 1n };
  quotes.forEach((x, i) => {
    const l = legs[i]; const r = priceRatio("american", x.american); const ro = x.otherAmerican == null ? null : priceRatio("american", x.otherAmerican);
    if (!r) { reasons.push(`E_BAD_ODDS ${l.legId}`); return; }
    const d = Number(r.n) / Number(r.d);
    x.decimal = d;
    if (ro && 1 / d + Number(ro.d) / Number(ro.n) < 1) reasons.push(`E_BAD_ODDS ${l.legId}: two-way implied below 1`);
    if (d < minDec || d > maxDec) reasons.push(`E_PRICE_BOUNDS ${l.legId}: decimal ${d.toFixed(4)} outside [${minDec}, ${maxDec}]`);
    const depth = booksQuoting(l, bookmakers, q); x.booksAtLine = depth;
    if (depth < P("minBooksAtLine", params)) reasons.push(`E_THIN_MARKET ${l.legId}: ${depth} books at this exact line`);
    const age = Date.parse(now) - Date.parse(x.fetchedAt);
    if (!(age >= 0 && age <= P("maxQuoteAgeMs", params))) {
      /* Dated founder exception (2026-11-04-founder-odds-snapshot-override): quotes fetched inside its capture window may be
         used past 90 minutes until its expiry, as a disclosed historical snapshot. Pregame only (STARTED still refuses). */
      const ov = P("freshnessOverride", params);
      const f = Date.parse(x.fetchedAt); const n = Date.parse(now);
      if (ov && f >= Date.parse(ov.capturedFrom) && f <= Date.parse(ov.capturedTo) && n < Date.parse(ov.expiresAt) && age >= 0) flags.push(`E_SNAPSHOT_OVERRIDE ${l.legId}: ${ov.id}; odds snapshot fetched ${x.fetchedAt}, may have changed`);
      else reasons.push(`E_STALE_QUOTE ${l.legId}: fetched ${x.fetchedAt}`);
    }
    ratio = { n: ratio.n * BigInt(r.n), d: ratio.d * BigInt(r.d) };
  });
  const D = Number(ratio.n) / Number(ratio.d);
  const money = { stakeCents: position.bankrollCents, ...payoutCents(position.bankrollCents, ratio) };
  const win = P("mode", params) === "RESEARCH" ? P("guideWindow", params) : null;
  if (win) { const lo = Math.ceil(position.targetCents * win[0]); const hi = Math.floor(position.targetCents * win[1]); if (money.grossPayoutCents < lo || money.grossPayoutCents > hi) reasons.push(`OUT_OF_GUIDE_WINDOW: gross ${money.grossPayoutCents} outside [${lo}, ${hi}]`); }
  else if (money.grossPayoutCents < position.band.loCents || money.grossPayoutCents > position.band.hiCents) reasons.push(`OUT_OF_BAND: gross ${money.grossPayoutCents} outside [${position.band.loCents}, ${position.band.hiCents}]`);
  const minShrunk = Math.min(...perLeg.map((s) => s.A.shrunkRate ?? 0));
  const minN = Math.min(...perLeg.map((s) => s.A.longestN ?? 0));
  const maxCv = Math.max(...perLeg.map((s) => s.B.minutesCv ?? 0));
  const freshest = Math.min(...quotes.map((x) => Date.parse(now) - Date.parse(x.fetchedAt)));
  return {
    ...base, flags, classification: reasons.length ? LEVEL.HOLD : LEVEL.B, classificationLabel: LEVEL_LABEL[reasons.length ? LEVEL.HOLD : LEVEL.B], reasons,
    legs: legView(quotes),
    price: { book, method: "CALCULATED_LEG_PRODUCT", label: "calculated leg product", decimal: D, american: decimalToAmerican(D), ratio: { n: String(ratio.n), d: String(ratio.d) }, propCaptureSha256, h2hSnapshotSha256: h2h?.snapshotSha256 ?? null },
    money, targetDeviation: money.grossPayoutCents / position.targetCents - 1,
    rankKeys: { weakestShrunkRate: minShrunk, smallestLongestN: minN, worstMinutesCv: maxCv, legCount: legs.length, flagCount: flags.length, freshestQuoteAgeMs: freshest },
  };
}

/** All 1- and 2-leg Level B candidates at one position, ranked by the rules-based order. */
export function evaluateLevelCandidates({ laneType = null, legs, position, now, propCapture = null, propCaptureSha256 = null, h2h = null, params = null, excludeGames = [], bookmakers = ELIGIBLE_OPERATOR_KEYS }) {
  const propIx = indexPropCapture(propCapture);
  const ctx = { laneType, position, now, propIx, propCaptureSha256, h2h, params, excludeGames, bookmakers };
  const sets = legs.map((l) => [l]);
  for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) sets.push([legs[i], legs[j]]);
  const rows = sets.map((s) => evaluateLevelSet(s, ctx));
  const bucket = P("rateBucket", params);
  /* RULES-BASED ORDER (labelled, not a probability): weakest leg's shrunk rate (bucketed), then fewer legs, then the
     smallest evidence denominator, then minutes stability, then closeness to the step target, then freshness, then id. */
  const ranked = rows.filter((r) => r.classification === LEVEL.B).sort((a, b) =>
    bucketOf(b.rankKeys.weakestShrunkRate, bucket) - bucketOf(a.rankKeys.weakestShrunkRate, bucket)
    || a.rankKeys.legCount - b.rankKeys.legCount
    || (a.rankKeys.flagCount ?? 0) - (b.rankKeys.flagCount ?? 0) // fewer disclosed limitations (suitability)
    || b.rankKeys.smallestLongestN - a.rankKeys.smallestLongestN
    || a.rankKeys.worstMinutesCv - b.rankKeys.worstMinutesCv
    || Math.abs(a.targetDeviation) - Math.abs(b.targetDeviation)
    || a.rankKeys.freshestQuoteAgeMs - b.rankKeys.freshestQuoteAgeMs
    || a.candidateId.localeCompare(b.candidateId));
  ranked.forEach((r, i) => { r.rank = i + 1; });
  const inBand = rows.filter((r) => r.money && r.money.grossPayoutCents >= position.band.loCents && r.money.grossPayoutCents <= position.band.hiCents).length;
  return { rulesVersion: RULES_VERSION, rankingLabel: RANKING_LABEL, position, now, candidates: rows, ranked, counts: { total: rows.length, priced: rows.filter((r) => r.money).length, inBand, levelB: ranked.length } };
}

const heldOf = (ev) => {
  const why = {};
  for (const c of ev.candidates) for (const r of c.reasons) { const k = r.split(/[ :]/)[0]; why[k] = (why[k] ?? 0) + 1; }
  return { classification: LEVEL.HOLD, code: "NO_QUALIFIED_CARD", reasonCounts: why, inBand: ev.counts.inBand };
};

/** Lanes A and B: independent positions; B game-disjoint from A and Level B on its own merits, or HOLD. */
export function constructLevelPair({ legs, now, product, laneA, laneB, propCapture, propCaptureSha256, h2h, params }) {
  const pos = (l) => stepPosition({ product, ...l, params: params?.bandPct != null ? { bandPct: params.bandPct } : null });
  const pA = pos(laneA); const pB = pos(laneB);
  const common = { legs, now, propCapture, propCaptureSha256, h2h, params };
  const evA = pA.ok ? evaluateLevelCandidates({ ...common, position: pA }) : null;
  const A = evA?.ranked[0] ? { classification: LEVEL.B, candidate: evA.ranked[0] } : evA ? heldOf(evA) : { classification: LEVEL.HOLD, code: pA.refusal };
  const exclude = A.candidate ? A.candidate.legs.map((l) => l.gameId) : [];
  const evB = pB.ok ? evaluateLevelCandidates({ ...common, position: pB, excludeGames: exclude }) : null;
  const B = evB?.ranked[0] ? { classification: LEVEL.B, candidate: evB.ranked[0] } : evB ? heldOf(evB) : { classification: LEVEL.HOLD, code: pB.refusal };
  return { rulesVersion: RULES_VERSION, product, mode: "LEVEL_B_RESEARCH (founder approval required)", A, B, evaluation: { A: evA, B: evB } };
}

/** The card record (founder contract): classification plus the approval and publication receipts, all pending. */
export function levelCardRecord(candidate, { laneId, date }) {
  return {
    schema: "gtp.bbm.card@2", rulesVersion: RULES_VERSION, laneId, date, candidateId: candidate.candidateId,
    classification: candidate.classification, classificationLabel: LEVEL_LABEL[candidate.classification], evidenceLabel: EVIDENCE_LABEL[candidate.classification] ?? null, evClaim: false,
    selectionMode: candidate.selectionMode ?? "STRICT", selectionLabel: SELECTION_LABEL[candidate.selectionMode ?? "STRICT"] ?? null, flags: publicFlags(candidate.flags), probability: null,
    legs: candidate.legs.map((l) => ({ legId: l.legId, sport: l.sport, gameId: l.gameId, eventLabel: l.eventLabel, startUtc: l.startUtc, player: l.player, team: l.team, market: l.market, family: l.family, eloSide: l.eloSide, evidenceLine: evidenceLine(l), projection: l.projection ?? null, line: l.line, side: l.side, book: l.quote?.book ?? null, price: l.quote?.american ?? null, quotedAt: l.quote?.quotedAt ?? null, fetchedAt: l.quote?.fetchedAt ?? null, forecastVersion: l.forecastVersion, hitRate: l.hitRate, role: l.role, injury: l.injury, flagText: (candidate.flags ?? []).filter((f) => String(f).split(" ")[1]?.replace(/:$/, "") === l.legId && !/_WEIGHT /.test(f)), lineupContext: l.lineup?.contextual ? { expectedLineup: l.lineup.contextual.expectedLineup ?? l.lineup.tonightScenario ?? null, exact: l.lineup.contextual.primary?.exact ?? null, uncertainTeammates: (l.lineup.contextual.uncertainTeammates ?? []).map((t) => t.name ?? t) } : l.lineup ? { expectedLineup: l.lineup.tonightScenario ?? null, exact: null, uncertainTeammates: [] } : null, classification: candidate.classification, evidenceClass: candidate.classification === LEVEL.HOLD ? null : candidate.classification, evidenceLabel: EVIDENCE_LABEL[candidate.classification] ?? null, probability: null, uncertainty: null, ev: null })),
    combined: candidate.price && { method: candidate.price.method, label: candidate.price.label, decimal: candidate.price.decimal, american: candidate.price.american },
    money: candidate.money, reasons: candidate.reasons,
    /* Parity gate fields (engine → site → graphic → caption → console); filled by each stage, never by the engine. */
    injuryStatus: candidate.legs.map((l) => ({ legId: l.legId, status: l.injury?.status ?? null, checkedAt: l.injury?.fetchedAt ?? null, lineup: l.lineup ? { tonightScenario: l.lineup.tonightScenario ?? null, sensitive: l.lineup.sensitive ?? null } : null })),
    approvalStatus: "PENDING_FOUNDER", priceEventSha256: null, graphicVersion: null, captionText: null, captionSha256: null, siteRecordVersion: null, xReceipt: null,
    recordSha256: null,
  };
}
export const sealCardRecord = (r) => ({ ...r, recordSha256: sha256(canonical({ ...r, recordSha256: null })) });


/* ───────────────────────────── four-lane joint assignment (founder ~19:25Z) ───────────────────────────── */

const LANE_IDS4 = Object.freeze({ "bank-builder": ["bb-a", "bb-b"], moonshot: ["ms-a", "ms-b"] });
const legSetKey = (c) => c.legs.map((l) => l.legId).sort().join("+");
/** A candidate's quality tier for "never weaker": the first two rules-based ranking keys. */
const tierOf = (c, bucket) => [bucketOf(c.rankKeys.weakestShrunkRate, bucket), -c.rankKeys.legCount];
const notWeaker = (x, y, bucket) => { const a = tierOf(x, bucket); const b = tierOf(y, bucket); return a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]); };

/**
 * Build both products' ranked pools, then assign bb-a, bb-b, ms-a, ms-b jointly:
 *   - each lane takes its best Level B candidate that shares no game with its product partner (A before B);
 *   - across products, a card identical to one already assigned is replaced only by a candidate that is NOT weaker
 *     (same evidence tier, no more legs); otherwise the identical card stands and the trade-off is recorded;
 *   - no qualifying candidate → HELD.
 * Returns per lane: the assignment, the top 3 options under the lane's constraints, and the trade-offs.
 */
/** diversity@1: why `card` may not join `assignedCards`, or null. Same combination (order-insensitive) → refused; a leg
    already used by two lanes → refused. Legs compare by legId, which fixes game, market, player/team and side. */
export function diversityRefusal(assignedCards, card, { maxLegUse = 2 } = {}) {
  const key = legSetKey(card);
  for (const l of card.legs) for (const c of assignedCards) for (const x of c.legs) if (x.gameId != null && l.gameId != null && propositionIdentity(x) === propositionIdentity(l) && (x.side ?? null) !== (l.side ?? null)) return `DIVERSITY_OPPOSING_SIDES ${propositionIdentity(l)}`;
  if (assignedCards.some((c) => legSetKey(c) === key)) return "DIVERSITY_DUPLICATE_COMBINATION";
  for (const l of card.legs) if (assignedCards.filter((c) => c.legs.some((x) => x.legId === l.legId)).length >= maxLegUse) return `DIVERSITY_LEG_LIMIT ${l.legId}: already in ${maxLegUse} lane(s)`;
  return null;
}
/** An approval binds one exact sealed record: any change to the card (legs, line, price, stake) invalidates it. */
export const approvalValid = (record, approval) => !!approval && !!record?.recordSha256 && approval.recordSha256 === record.recordSha256 && approval.candidateId === record.candidateId;

/** Option A = best single, Option B = best 2-leg, Option C = next best overall (rules-based order), each with the joint
    evidence lower bound (product of each leg's interval lower bound: no independence benefit is claimed) and the joint
    market no-vig (product of the quoting book's per-leg no-vig: disclosure, not a probability claim). */
function optionsABC(ranked, pick) {
  const view = (c, tag) => c && { option: tag, candidateId: c.candidateId, rank: c.rank, legCount: c.legCount, grossPayoutCents: c.money.grossPayoutCents, targetDeviation: c.targetDeviation, american: c.price.american, jointEvidenceLower: c.legs.reduce((p, l) => p * (l.signals?.A?.interval95?.[0] ?? NaN), 1), jointMarketNoVig: c.legs.reduce((p, l) => { const a = l.quote?.american; const o = l.quote?.otherAmerican; if (!Number.isInteger(a) || !Number.isInteger(o)) return NaN; const x = a > 0 ? 100 / (a + 100) : -a / (-a + 100); const y = o > 0 ? 100 / (o + 100) : -o / (-o + 100); return p * (x / (x + y)); }, 1), flags: c.flags, legs: c.legs.map((l) => `${l.player?.name ?? l.team} ${l.family} ${l.side} ${l.line ?? ""}`.trim()) };
  const A = ranked.find((c) => c.legCount === 1) ?? null; const B = ranked.find((c) => c.legCount === 2) ?? null;
  const C = ranked.find((c) => c !== A && c !== B) ?? null;
  return { A: view(A, "A single"), B: view(B, "B two-leg"), C: view(C, "C next"), chosen: pick?.candidateId ?? null };
}

export function assignFourLanes({ legs, now, propCapture, propCaptureSha256 = null, h2h = null, params = null, bankrolls = { "bb-a": 10000, "bb-b": 10000, "ms-a": 2500, "ms-b": 2500 }, steps = { "bb-a": 1, "bb-b": 1, "ms-a": 1, "ms-b": 1 } }) {
  const bucket = P("rateBucket", params);
  const bandParams = params?.bandPct != null ? { bandPct: params.bandPct } : null;
  const out = {}; const assigned = []; const tradeOffs = [];
  for (const product of ["bank-builder", "moonshot"]) {
    const [a, b] = LANE_IDS4[product];
    for (const laneId of [a, b]) {
      const pos = stepPosition({ product, step: steps[laneId], bankrollCents: bankrolls[laneId], params: bandParams });
      if (!pos.ok) { out[laneId] = { laneId, status: "HELD", code: pos.refusal, options: [] }; continue; }
      const partner = laneId === b ? out[a]?.card : null;
      const laneType = laneTypeOf(P("laneTypes", params)?.[laneId]);
      const laneLegs = laneType ? legs.filter((l) => !laneTypeRefusal(laneType, l)) : legs;
      const ev = evaluateLevelCandidates({ laneType, legs: laneLegs, position: pos, now, propCapture, propCaptureSha256, h2h, params, excludeGames: partner ? partner.legs.map((l) => l.gameId) : [] });
      const eligible = ev.ranked;
      const identical = (c) => assigned.find((x) => legSetKey(x.card) === legSetKey(c));
      const diversity = P("diversity", params);
      let pick = eligible[0] ?? null; let note = null;
      if (diversity === "diversity@1" || diversity === "diversity@2") {
        /* diversity@1 (founder ~21:12Z): no two lanes hold the same combination (order-insensitive) and a leg is used by
           at most two lanes. A duplicate is never a fallback: the best candidate that satisfies both, or HELD. */
        const blocked = (c) => diversityRefusal(assigned.map((x) => x.card), c, { maxLegUse: diversity === "diversity@2" ? 1 : 2 });
        const first = pick;
        pick = eligible.find((c) => !blocked(c)) ?? null;
        if (first && pick !== first) { note = `diversity@1: ${first.candidateId} ${blocked(first)}; ${pick ? `took ${pick.candidateId} (rank ${pick.rank})` : "no eligible distinct card: HELD"}`; tradeOffs.push({ laneId, note }); }
      } else if (pick && identical(pick)) {
        const alt = eligible.find((c) => !identical(c) && notWeaker(c, pick, bucket));
        const twin = identical(pick).laneId;
        if (alt) { note = `diversified: ${legSetKey(pick)} is already ${twin}; took ${alt.candidateId} (same evidence tier, not weaker)`; pick = alt; }
        else { note = `IDENTICAL to ${twin}: every non-identical alternative is weaker (or none exists), so the identical card stands (founder may HOLD instead)`; }
        tradeOffs.push({ laneId, note });
      }
      const options = eligible.slice(0, 3).map((c) => ({ rank: c.rank, candidateId: c.candidateId, identicalTo: identical(c)?.laneId ?? null, legs: c.legs.map((l) => ({ legId: l.legId, player: l.player?.name ?? null, team: l.team, family: l.family, side: l.side, line: l.line, eventLabel: l.eventLabel, book: l.quote?.book ?? null, american: l.quote?.american ?? null, quotedAt: l.quote?.quotedAt ?? null, fetchedAt: l.quote?.fetchedAt ?? null })), american: c.price.american, grossPayoutCents: c.money.grossPayoutCents, targetDeviation: c.targetDeviation, rankKeys: c.rankKeys }));
      const why = {}; for (const c of ev.candidates) for (const x of c.reasons) { const k = x.split(/[ :]/)[0]; why[k] = (why[k] ?? 0) + 1; }
      out[laneId] = pick
        ? { laneId, product, laneType, status: "READY_FOR_APPROVAL", classification: LEVEL.B, card: pick, note, options, optionsABC: optionsABC(eligible, pick), position: pos, counts: ev.counts, reasonCounts: why }
        : { laneId, product, status: "HELD", code: laneLegs.length ? "NO_QUALIFIED_CARD" : "NO_CANDIDATES_FOR_LANE_TYPE", laneType, options, position: pos, counts: ev.counts, reasonCounts: why };
      if (pick) assigned.push({ laneId, product, card: pick });
    }
  }
  return { rulesVersion: RULES_VERSION, mode: "LEVEL_B_RESEARCH (founder approval required)", rankingLabel: RANKING_LABEL, lanes: out, tradeOffs };
}
