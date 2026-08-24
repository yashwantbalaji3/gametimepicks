/**
 * UFC PREDICTION ENGINE V1 — a pure, deterministic engine that turns real data into ONE complete read per
 * fight. Transparent formulas, honest labels.
 *
 * TWO layers, clearly separated:
 *   • Moneyline — MARKET-BACKED. Real American odds → implied → de-vigged (formula in `deVig`). Preferred.
 *   • Fight type / distance / method / round — MODEL-DERIVED, EXPERIMENTAL. Style scores computed here from
 *     each fighter's REAL finish/record/rate stats (fighters-latest.json), then combined. Labeled
 *     "experimental / validation in progress / not a verified edge / paper-only".
 *
 * Where a fight has no odds → moneyline "unavailable" (Odds pending). Where a fighter's stats are missing →
 * fight-type/distance/method "unavailable" (Insufficient data). NOTHING is fabricated; confidence drops
 * with coverage. No "best bet / lock / positive EV / validated edge / official pick" is ever emitted.
 *
 * Pure: no fetch, no fs, no money. Extensionless imports.
 */
export type Confidence = "high" | "medium" | "low" | "no_read";
export type Source = "market_implied" | "model_derived" | "provider_market" | "unavailable";

export interface UfcPredictionRowV1 {
  fightId: string;
  fighterA: string;
  fighterB: string;
  dataCoverage: {
    schedule: boolean;
    moneylineOdds: boolean;
    fighterStatsA: boolean;
    fighterStatsB: boolean;
    fighterAMatchQuality: "matched" | "unmatched";
    fighterBMatchQuality: "matched" | "unmatched";
    propMarkets: boolean;
    historicalValidation: boolean;
    label: "Full data" | "Odds + model" | "Odds only" | "Model only" | "Records only";
  };
  moneyline: {
    source: Source;
    lean: string | null;
    fighterAProbability: number | null;
    fighterBProbability: number | null;
    confidence: Confidence;
    oddsA: number | null;
    oddsB: number | null;
    explanation: string;
  };
  fightType: { source: Source; label: string; confidence: Confidence; explanation: string };
  goesDistance: { source: Source; lean: string | null; probability: number | null; confidence: Confidence; explanation: string };
  method: { source: Source; lean: string | null; probabilities: { koTko: number; submission: number; decision: number } | null; confidence: Confidence; explanation: string };
  roundRange: { source: Source; lean: string | null; confidence: Confidence; explanation: string };
  gameTimeRead: string;
  summary: string;
  caveat: string;
  /** The two answers users care about most: who wins + how. Never fabricated. */
  prediction: {
    predictedWinner: string; // fighter name, or "No clear winner"
    predictedWinnerSource: "market_implied" | "model_derived" | "no_clear_read";
    predictedWinnerLabel: "Market-implied winner" | "Slight market lean" | "No clear winner";
    predictedWinnerConfidence: Confidence;
    methodOfVictory: "Decision" | "KO/TKO" | "Submission" | "No clear method";
    methodSource: "fighter_db_model" | "market_only_fallback" | "unavailable";
    methodConfidence: Confidence;
    winnerMethodText: string; // "Costa by Decision" / "No clear winner · No clear method"
  };
  /** Display-safe strings — the UI renders THESE, never blank. Every field is always non-empty. */
  display: {
    gameTimeRead: string;
    predictedWinnerText: string;
    methodOfVictoryText: string;
    winnerMethodText: string;
    moneyline: string;
    winProbability: string;
    fightType: string;
    distance: string;
    method: string;
    roundRange: string;
    confidence: string;
    why: string;
    coverage: string;
  };
}

// ── inputs (loosely typed — the real artifacts are validated by the readers) ──
export interface EngineFight { boutId?: string; fighterA?: string; fighterB?: string }

/** One bout as the card artifact writes it — corners named, not A/B. */
export interface CardBout { boutId?: string; red?: { name?: string | null }; blue?: { name?: string | null } }

/**
 * The card artifact's bouts, as fights this engine can read.
 *
 * WHY THIS EXISTS. The engine used to be fed from `schedule-latest.json`, which turned out to have
 * NO PRODUCER — an orphan last written 2026-07-10 that nothing regenerates. Its tests passed only
 * because the schedule and the odds were equally stale, so the join between them was vacuous and
 * looked fine; the first fresh price capture broke it and reported "0 market-backed moneylines",
 * which sounds like an odds problem and was not.
 *
 * `card-latest.json` is rebuilt by the fight-week job every run and is the same artifact the odds
 * capture prices, so the two cannot drift apart. Adapting here rather than at each call site means
 * a second consumer cannot quietly reintroduce the orphan.
 */
export function eventFightsFromCard(bouts: readonly CardBout[] | null | undefined): EngineFight[] {
  return (bouts ?? [])
    .map((b) => ({ boutId: b.boutId, fighterA: b.red?.name ?? undefined, fighterB: b.blue?.name ?? undefined }))
    // A bout missing a corner cannot be joined to a price or a fighter record, and a row built from
    // one would render a half-empty prediction rather than an honest absence.
    .filter((f) => Boolean(f.fighterA && f.fighterB));
}
export interface EngineOddsSide { name: string; price: number }
export interface EngineOddsBout { sides?: EngineOddsSide[] }
/** The per-fighter stats we consume from fighters-latest.json (all optional / null-safe). */
export interface EngineFighter {
  finishRate?: number | null;
  koWins?: number | null; subWins?: number | null; decisionWins?: number | null; finishWins?: number | null;
  wins?: number | null; losses?: number | null; total?: number | null;
  avgSigStrLandedPerRound?: number | null; sigStrAccuracy?: number | null; avgTakedownsPerRound?: number | null; subAttempts?: number | null;
  dataCompleteness?: number | null;
}

/** Normalize a fighter name for matching: fold diacritics (ï→i, é→e, ç→c) FIRST, then lowercase + strip
 *  punctuation. Without the fold, "Benoît" → "benot" and misses the DB's "Benoit". */
const norm = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const share = (part: number | null, whole: number | null): number => (part != null && whole != null && whole > 0 ? clamp(part / whole, 0, 1) : 0);

/** American odds → implied probability (with vig). */
export function impliedFromAmerican(odds: number): number {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}
/** Two-way no-vig normalization. Null when a side is missing. */
export function deVig(oddsA: number | null | undefined, oddsB: number | null | undefined): { a: number; b: number } | null {
  if (typeof oddsA !== "number" || typeof oddsB !== "number") return null;
  const ia = impliedFromAmerican(oddsA), ib = impliedFromAmerican(oddsB), s = ia + ib;
  return s > 0 ? { a: ia / s, b: ib / s } : null;
}
export function moneylineConfidence(favProb: number): Confidence {
  if (favProb >= 0.7) return "high";
  if (favProb >= 0.6) return "medium";
  if (favProb >= 0.58) return "low";
  return "no_read";
}

// ── style scores (0..1, null-safe) from a fighter's REAL win-type + finish + rate stats ──
interface StyleScores { finishThreat: number; distance: number; striking: number; grappling: number }
function styleScores(f: EngineFighter | null | undefined): StyleScores | null {
  if (!f) return null;
  const wins = num(f.wins) ?? ((num(f.koWins) ?? 0) + (num(f.subWins) ?? 0) + (num(f.decisionWins) ?? 0));
  if (wins <= 0 && f.finishRate == null) return null; // no usable signal
  const finishRate = clamp(num(f.finishRate) ?? share((num(f.koWins) ?? 0) + (num(f.subWins) ?? 0), wins), 0, 1);
  const koShare = share(num(f.koWins), wins);
  const subShare = share(num(f.subWins), wins);
  const decShare = share(num(f.decisionWins), wins);
  const normSig = clamp((num(f.avgSigStrLandedPerRound) ?? 0) / 10, 0, 1);
  const normTd = clamp((num(f.avgTakedownsPerRound) ?? 0) / 3, 0, 1);
  const acc = clamp(num(f.sigStrAccuracy) ?? 0, 0, 1);
  return {
    finishThreat: clamp(0.55 * finishRate + 0.30 * (koShare + subShare) + 0.15 * normSig, 0, 1),
    distance: clamp(0.55 * decShare + 0.45 * (1 - finishRate), 0, 1),
    striking: clamp(0.55 * koShare + 0.30 * normSig + 0.15 * acc, 0, 1),
    grappling: clamp(0.55 * subShare + 0.45 * normTd, 0, 1),
  };
}
const avg = (a: number, b: number) => (a + b) / 2;

/**
 * Build the V1 read for one fight from real odds + both fighters' real stats.
 */
export function buildUfcPredictionV1(fight: EngineFight, odds: EngineOddsBout | null | undefined, statsA: EngineFighter | null | undefined, statsB: EngineFighter | null | undefined): UfcPredictionRowV1 {
  const a = fight.fighterA ?? "Fighter A";
  const b = fight.fighterB ?? "Fighter B";
  const fightId = fight.boutId ?? `${norm(a)}|${norm(b)}`;

  // ── Moneyline (market-backed) ──
  const priceOf = (name: string): number | null => {
    const side = odds?.sides?.find((s) => norm(s.name) === norm(name));
    return typeof side?.price === "number" ? side.price : null;
  };
  const oddsA = priceOf(a), oddsB = priceOf(b);
  const dv = deVig(oddsA, oddsB);
  const hasOdds = dv != null;
  let moneyline: UfcPredictionRowV1["moneyline"];
  if (dv) {
    const favIsA = dv.a >= dv.b, favName = favIsA ? a : b, favProb = favIsA ? dv.a : dv.b, conf = moneylineConfidence(favProb);
    moneyline = {
      source: "market_implied",
      lean: conf === "no_read" ? "No clear market lean" : `${favName} by market lean`,
      fighterAProbability: dv.a, fighterBProbability: dv.b, confidence: conf, oddsA, oddsB,
      explanation: conf === "no_read"
        ? `The de-vigged moneyline is near a coin-flip (${favName} ${pct(favProb)}) — no clear market lean.`
        : `Market gives ${favName} a ${pct(favProb)} no-vig win probability.`,
    };
  } else {
    moneyline = { source: "unavailable", lean: null, fighterAProbability: null, fighterBProbability: null, confidence: "no_read", oddsA, oddsB, explanation: "No two-sided odds are available yet, so the moneyline is pending." };
  }

  // ── Model-derived reads from REAL fighter stats ──
  const sa = styleScores(statsA), sb = styleScores(statsB);
  const hasModel = Boolean(sa && sb);
  let goesDistance: UfcPredictionRowV1["goesDistance"];
  let method: UfcPredictionRowV1["method"];
  let roundRange: UfcPredictionRowV1["roundRange"];
  let fightType: UfcPredictionRowV1["fightType"];

  if (sa && sb) {
    const distanceScore = avg(sa.distance, sb.distance);
    const finishThreat = avg(sa.finishThreat, sb.finishThreat);
    const strikingScore = avg(sa.striking, sb.striking);
    const grapplingScore = avg(sa.grappling, sb.grappling);
    const dataConf = clamp(((num(statsA?.dataCompleteness) ?? 0.5) + (num(statsB?.dataCompleteness) ?? 0.5)) / 2, 0, 1);

    // Goes-distance (mission 4.4): centered at 0.50, pushed by distance vs finish.
    const gdProb = clamp(0.5 + 0.24 * (distanceScore - 0.5) - 0.30 * (finishThreat - 0.35), 0.25, 0.75);
    const gdSep = Math.abs(gdProb - 0.5);
    const gdConf = statConfidence(gdSep, dataConf);
    goesDistance = {
      source: "model_derived",
      lean: gdProb >= 0.58 ? "Leans distance" : gdProb <= 0.42 ? "Leans finish" : "No clear read",
      probability: gdProb,
      confidence: gdConf,
      explanation: `Model-derived from both fighters' finish/decision history: ${pct(gdProb)} chance of reaching a decision.`,
    };

    // Method mix (mission 4.5): decision≈distance, ko≈striking, sub≈grappling; normalized.
    const dScore = Math.max(0.01, distanceScore), kScore = Math.max(0.01, strikingScore), sScore = Math.max(0.01, grapplingScore);
    const total = dScore + kScore + sScore;
    const koTko = kScore / total, submission = sScore / total, decision = dScore / total;
    const ranked = [{ k: "KO/TKO threat", p: koTko }, { k: "Submission threat", p: submission }, { k: "Decision lean", p: decision }].sort((x, y) => y.p - x.p);
    const methSep = ranked[0].p - ranked[1].p;
    method = {
      source: "model_derived",
      lean: ranked[0].p >= 0.4 ? ranked[0].k : "No clear method read",
      probabilities: { koTko, submission, decision },
      confidence: statConfidence(methSep + (ranked[0].p >= 0.4 ? 0.08 : 0), dataConf),
      explanation: `Model-derived method mix: KO/TKO ${pct(koTko)} · sub ${pct(submission)} · decision ${pct(decision)}.`,
    };

    roundRange = {
      source: "model_derived",
      lean: gdProb >= 0.58 ? "Late / full-fight lean" : gdProb <= 0.42 ? "Early–middle finish threat" : "No clear round read",
      confidence: gdConf,
      explanation: `Round range inferred from the distance read (${pct(gdProb)} to decision).`,
    };

    const ftLabel = gdProb >= 0.58 ? "Likely decision-heavy" : finishThreat >= 0.5 ? (grapplingScore >= strikingScore ? "Grappling volatility" : "Striking volatility") : "Balanced";
    fightType = { source: "model_derived", label: ftLabel, confidence: gdConf, explanation: `Style read from finish threat ${pct(finishThreat)}, striking ${pct(strikingScore)}, grappling ${pct(grapplingScore)}.` };
  } else if (hasOdds) {
    // MARKET-ONLY fallback — a moneyline exists but the fighter model doesn't. Honest "No clear read" (we
    // can't read the style without fighter stats), NOT "Insufficient data" (we do have a market read).
    const mo = { source: "unavailable" as Source, confidence: "low" as Confidence };
    goesDistance = { ...mo, lean: "No clear read", probability: null, explanation: "Market gives a moneyline read, but fighter-stat coverage is limited — no confident distance read." };
    method = { ...mo, lean: "No clear read", probabilities: null, explanation: "Limited fighter data — no confident method read." };
    roundRange = { ...mo, lean: "No clear read", explanation: "Limited fighter data — no confident round read." };
    fightType = { ...mo, label: "Market-only read", explanation: "Moneyline is market-implied; fighter-stat coverage is limited." };
  } else {
    const insufficient = { source: "unavailable" as Source, confidence: "no_read" as Confidence };
    goesDistance = { ...insufficient, lean: "Insufficient data", probability: null, explanation: "Fighter stats and two-sided odds aren't available yet." };
    method = { ...insufficient, lean: "Insufficient data", probabilities: null, explanation: "Fighter stats and odds aren't available yet." };
    roundRange = { ...insufficient, lean: "Insufficient data", explanation: "Fighter stats and odds aren't available yet." };
    fightType = { ...insufficient, label: "Insufficient data", explanation: "Fighter stats and odds aren't available yet." };
  }

  const coverageLabel = hasOdds && hasModel ? "Full data" : hasOdds ? "Odds only" : hasModel ? "Model only" : "Records only";
  const dataCoverage = {
    schedule: true, moneylineOdds: hasOdds, fighterStatsA: Boolean(sa), fighterStatsB: Boolean(sb),
    fighterAMatchQuality: (sa ? "matched" : "unmatched") as "matched" | "unmatched",
    fighterBMatchQuality: (sb ? "matched" : "unmatched") as "matched" | "unmatched",
    propMarkets: false, historicalValidation: false, label: coverageLabel as UfcPredictionRowV1["dataCoverage"]["label"],
  };

  const gameTimeRead = hasOdds ? (moneyline.confidence === "no_read" ? "No clear moneyline edge" : moneyline.lean!) : "Odds pending";
  const modelBit = hasModel ? ` ${fightType.label.toLowerCase()}; ${goesDistance.lean!.toLowerCase()}.` : " Fighter-model read limited by missing stats.";
  const summary = `${hasOdds ? moneyline.explanation : "Moneyline pending."}${modelBit}`;
  const caveat = "Moneyline is market-implied; fight type / distance / method are GameTime V1 experimental model reads — validation in progress, not a verified edge. Paper-only.";

  // ── Predicted winner (market-implied). EVERY two-sided-odds fight gets a named winner: a clear favorite
  //    (≥55% de-vig) is a "Market-implied winner"; a near-pick'em (50–55%) is an honest "Slight market lean".
  //    Only a fight with NO two-sided odds stays "No clear winner" — a winner is never invented from stats. ──
  const lastNm = (n: string): string => (n.split(" ").filter(Boolean).pop() || n);
  let predictedWinner = "No clear winner";
  let predictedWinnerSource: UfcPredictionRowV1["prediction"]["predictedWinnerSource"] = "no_clear_read";
  let predictedWinnerConfidence: Confidence = "no_read";
  let predictedWinnerLabel: "Market-implied winner" | "Slight market lean" | "No clear winner" = "No clear winner";
  if (dv) {
    const favIsA = dv.a >= dv.b, favName = favIsA ? a : b, favProb = favIsA ? dv.a : dv.b;
    predictedWinner = favName;
    predictedWinnerSource = "market_implied";
    if (favProb >= 0.55) {
      predictedWinnerConfidence = favProb >= 0.7 ? "high" : favProb >= 0.6 ? "medium" : "low";
      predictedWinnerLabel = "Market-implied winner";
    } else {
      // 50–55% de-vigged → a real but slight edge. Named winner, low confidence, honest "slight lean" label.
      predictedWinnerConfidence = "low";
      predictedWinnerLabel = "Slight market lean";
    }
  }
  const isSlightLean = predictedWinnerLabel === "Slight market lean";

  // ── Method of victory — from the model's method mix (top ≥ 40%), else "No clear method". ──
  let methodOfVictory: UfcPredictionRowV1["prediction"]["methodOfVictory"] = "No clear method";
  let methodSource: UfcPredictionRowV1["prediction"]["methodSource"] = hasModel ? "fighter_db_model" : hasOdds ? "market_only_fallback" : "unavailable";
  let methodConfidence: Confidence = "no_read";
  if (hasModel && method.probabilities) {
    const mp = method.probabilities;
    const ranked = [{ k: "KO/TKO" as const, p: mp.koTko }, { k: "Submission" as const, p: mp.submission }, { k: "Decision" as const, p: mp.decision }].sort((x, y) => y.p - x.p);
    if (ranked[0].p >= 0.4) {
      methodOfVictory = ranked[0].k;
      methodConfidence = ranked[0].p >= 0.55 ? "high" : ranked[0].p >= 0.45 ? "medium" : "low";
    }
  }

  const winnerPhrase = predictedWinner === "No clear winner" ? "No clear winner" : isSlightLean ? `${lastNm(predictedWinner)} (slight lean)` : lastNm(predictedWinner);
  const winnerMethodText = predictedWinner === "No clear winner"
    ? "No clear winner · No clear method"
    : methodOfVictory === "No clear method"
      ? `${winnerPhrase} · method unclear`
      : `${winnerPhrase} by ${methodOfVictory}`;
  const prediction = { predictedWinner, predictedWinnerSource, predictedWinnerLabel, predictedWinnerConfidence, methodOfVictory, methodSource, methodConfidence, winnerMethodText };

  // ── Display-safe strings — the UI renders THESE. Every field is guaranteed non-empty (never a blank cell). ──
  const CONF_LABEL: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low", no_read: "No read" };
  const amer = (v: number | null): string | null => (typeof v === "number" && Number.isFinite(v) ? (v > 0 ? `+${v}` : `${v}`) : null);
  const last = (n: string): string => (n.split(" ").filter(Boolean).pop() || n);
  const nonEmpty = (s: string | null | undefined, fallback: string): string => (s && s.trim() ? s : fallback);
  const overallConf: Confidence = hasOdds ? moneyline.confidence : goesDistance.confidence;
  const display = {
    gameTimeRead: nonEmpty(gameTimeRead, "—"),
    predictedWinnerText: predictedWinner,
    methodOfVictoryText: methodOfVictory,
    winnerMethodText: winnerMethodText,
    moneyline: hasOdds ? `${last(a)} ${amer(oddsA) ?? "—"} · ${last(b)} ${amer(oddsB) ?? "—"}` : "Odds pending",
    winProbability: moneyline.fighterAProbability != null
      ? `${last(a)} ${pct(moneyline.fighterAProbability)} / ${last(b)} ${moneyline.fighterBProbability != null ? pct(moneyline.fighterBProbability) : "—"}`
      : "—",
    fightType: nonEmpty(fightType.label, "No clear read"),
    distance: nonEmpty(goesDistance.lean, "No clear read"),
    method: nonEmpty(method.lean, "No clear read"),
    roundRange: nonEmpty(roundRange.lean, "No clear read"),
    confidence: CONF_LABEL[overallConf],
    why: nonEmpty(summary, caveat),
    coverage: dataCoverage.label,
  };

  return { fightId, fighterA: a, fighterB: b, dataCoverage, moneyline, fightType, goesDistance, method, roundRange, gameTimeRead, summary, caveat, prediction, display };
}

/** Model confidence from a read's separation from a coin-flip and the fighters' data completeness. */
function statConfidence(sep: number, dataConf: number): Confidence {
  if (dataConf < 0.4) return "no_read";
  if (sep >= 0.16 && dataConf >= 0.75) return "high";
  if (sep >= 0.09) return "medium";
  if (sep >= 0.04) return "low";
  return "no_read";
}

/** Normalized fighter-name key for joining artifacts (order-independent within a bout). */
export function keyForNames(a: unknown, b: unknown): string {
  return [norm(a), norm(b)].sort().join("|");
}

/** Map one fighters-latest.json record → the engine's null-safe fighter stats. */
export function fighterFromDbRecord(rec: Record<string, any> | null | undefined): EngineFighter {
  const fin = rec?.finishes ?? {}, rt = rec?.rates ?? {}, rec2 = rec?.record ?? {};
  return {
    finishRate: num(fin.finishRate), koWins: num(fin.koWins), subWins: num(fin.subWins),
    decisionWins: num(fin.decisionWins), finishWins: num(fin.finishWins),
    wins: num(rec2.wins), losses: num(rec2.losses), total: num(rec2.total),
    avgSigStrLandedPerRound: num(rt.avgSigStrLandedPerRound), sigStrAccuracy: num(rt.sigStrAccuracy),
    avgTakedownsPerRound: num(rt.avgTakedownsPerRound), subAttempts: num(rt.subAttempts),
    dataCompleteness: num(rec?.dataCompleteness),
  };
}

/** Build a normalized name → EngineFighter index from fighters-latest.json records (canonicalName + aliases). */
export function buildFighterIndex(records: Array<Record<string, any>> | null | undefined): Map<string, EngineFighter> {
  const m = new Map<string, EngineFighter>();
  for (const rec of records ?? []) {
    const ef = fighterFromDbRecord(rec);
    if (rec?.canonicalName) m.set(norm(rec.canonicalName), ef);
    for (const alias of (rec?.aliases ?? []) as unknown[]) m.set(norm(alias), ef);
  }
  return m;
}

/**
 * Build the whole card. `oddsIndex` maps name-key → odds bout; `fighterByName` maps a single normalized
 * fighter name → their stats. Join by fighter name (order-independent).
 */
export function buildUfcCardPredictions(
  fights: EngineFight[],
  oddsIndex: Map<string, EngineOddsBout>,
  fighterByName: Map<string, EngineFighter>,
): UfcPredictionRowV1[] {
  return (fights ?? []).map((f) =>
    buildUfcPredictionV1(f, oddsIndex.get(keyForNames(f.fighterA, f.fighterB)) ?? null, fighterByName.get(norm(f.fighterA)) ?? null, fighterByName.get(norm(f.fighterB)) ?? null),
  );
}
