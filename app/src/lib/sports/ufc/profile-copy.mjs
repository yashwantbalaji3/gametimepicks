/**
 * THE WORDS THE UFC CARD PRINTS ABOUT A FIGHTER'S TRACKED RECORD (UFC-001, 2026-10-10).
 *
 * Pure copy rules, imported by `scripts/ufc/build-ufc-card.mjs`. Nothing here touches a probability, a feature, a
 * threshold that selects a bout for modelling, or a grade: every rule fires on exactly the thresholds the builder used
 * before this file existed. What changed is that each sentence now says only what its counts support.
 *
 * Defects this replaced, each found on the 2026-10-10 card (UFC Fight Night: Allen vs. Duncan):
 *  - The empty-weakness fallback said "Too few tracked losses to name a pattern" for Meerschaert (14 tracked losses)
 *    and Fili (13). "Too few" is now said only when there are fewer losses than the loss rules need (2); otherwise the
 *    line says no rule cleared its threshold, with the loss count and how the losses came.
 *  - "Durable — most tracked fights reach the judges" fired on distance rate >= 60%, which measures how often a
 *    fighter goes the distance, not durability; Francisco Prado (1-5, five decision losses) was called durable.
 *  - "Finishes fights — mostly by submission" printed whenever the KO share of finishes was under 60%, so a 50/50 split
 *    read as "mostly by submission". The split now has three states and prints the counts.
 *  - The basis note said a fighter "has no UFC history in our corpus" when that fighter had 1 tracked bout (the
 *    threshold for "both known" is 2). It now states the count.
 *  - The per-bout line was documented as "assembled from the features that moved the prediction". It is not a model
 *    attribution: it reads raw tracked rates against fixed thresholds and ignores the tale-of-the-tape features the
 *    winner head uses. It is now labelled, in its own text, as a summary of tracked records, and it no longer says
 *    "reaches the judges" or "points to a knockout" when the method head's likeliest outcome is under 50%.
 *  - Claims resting on one or two bouts ("finishes 100% of wins") now carry the counts behind the percentage.
 */

/** "1 tracked bout", "2 tracked bouts". */
export const countOf = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pc = (num, den) => Math.round((100 * num) / den);
/** Surname for a second mention. A generational suffix is not a surname: "Kai Kamaka III" is Kamaka, not "III". */
export const lastName = (name) => {
  const parts = String(name).trim().split(/\s+/);
  while (parts.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1];
};

/** The label every tracked-record summary carries, so no renderer can present it as the model's reasoning. */
export const RECORD_SUMMARY_LABEL = "From the tracked records (a summary, not the model's reasoning):";

/** Losses below this count cannot trigger the loss-pattern rule, so "too few losses" is true only below it. */
export const MIN_LOSSES_FOR_PATTERN = 2;

/**
 * Strengths, weaknesses and the one-line summary for a fighter's tracked record.
 *
 * @param {{ n: number, w: number, koW: number, subW: number, decW: number, koL: number, subL: number, decL: number, dist: number }} r
 * @param {Array<{ result: "W" | "L" }>} last5 most recent first, at most five
 */
export function profileCopy(r, last5) {
  const pct = (num, den) => (den > 0 ? num / den : 0);
  const L = r.n - r.w;
  const fin = r.koW + r.subW;
  const finishRate = pct(fin, r.w);
  const koShare = pct(r.koW, fin);
  const finishedRate = pct(r.koL + r.subL, L);
  const distanceRate = pct(r.dist, r.n);
  const winRate = pct(r.w, r.n);

  /* Neutral, evidence-specific phrasing (P241 · A23): no gendered pronouns, and a fallback never reads as a verdict. */
  const strengths = [];
  if (r.w >= 3 && finishRate >= 0.6) {
    const how = koShare >= 0.6 ? "mostly by KO/TKO" : koShare <= 0.4 ? "mostly by submission" : "by KO/TKO and submission alike";
    strengths.push(`Finishes fights — ${fin} of ${r.w} wins inside the distance, ${how} (${r.koW} KO/TKO, ${r.subW} submission)`);
  }
  if (r.subW >= 3) strengths.push(`${r.subW} submission wins across ${countOf(r.n, "tracked bout")}`);
  if (r.koW >= 3) strengths.push(`${r.koW} KO/TKO wins across ${countOf(r.n, "tracked bout")}`);
  if (winRate >= 0.7 && r.n >= 5) strengths.push(`${Math.round(winRate * 100)}% win rate across ${r.n} tracked bouts (${r.w}-${L})`);
  // Distance rate measures how often a fighter goes to the scorecards — wins and losses alike — not durability.
  if (distanceRate >= 0.6 && r.n >= 5) strengths.push(`Often goes the distance — ${r.dist} of ${r.n} tracked fights reached the judges`);

  const weaknesses = [];
  if (L >= MIN_LOSSES_FOR_PATTERN && finishedRate >= 0.6) {
    weaknesses.push(`Losses tend to come by finish — ${r.koL + r.subL} of ${L} tracked losses (${r.koL} KO/TKO, ${r.subL} submission)`);
  }
  if (r.n >= 5 && winRate <= 0.45) weaknesses.push(`${Math.round((1 - winRate) * 100)}% of tracked bouts are losses (${L} of ${r.n})`);
  if (r.w >= 3 && finishRate <= 0.2) weaknesses.push(`Rarely finishes — ${fin} of ${r.w} wins inside the distance`);

  /* Every strength rule needs 5+ bouts or 3+ wins; below both, "too few" is the truth. Above, no rule fired. */
  if (!strengths.length) {
    strengths.push(r.n < 5 && r.w < 3
      ? `Only ${countOf(r.n, "tracked bout")} — too few to name a strength`
      : `No strength pattern clears our thresholds across ${r.n} tracked bouts`);
  }
  if (!weaknesses.length) {
    weaknesses.push(L < MIN_LOSSES_FOR_PATTERN
      ? `${L === 0 ? "No tracked losses" : "Only 1 tracked loss"} — too few to name a pattern; absence of data, not absence of weakness`
      : `No loss pattern clears our thresholds across ${L} tracked losses (${r.koL} KO/TKO, ${r.subL} submission, ${r.decL} decision)`);
  }

  const recent = last5.filter((b) => b.result === "W").length;
  const wins = r.w > 0 ? `${fin} of ${countOf(r.w, "win")} came by finish (${Math.round(finishRate * 100)}%)` : "No tracked wins";
  return {
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 2),
    summary: `${recent}-${last5.length - recent} in the last ${countOf(last5.length, "tracked bout")}. ${wins}; ${r.dist} of ${countOf(r.n, "tracked fight")} reached the judges (${Math.round(distanceRate * 100)}%).`,
  };
}

/**
 * The basis note for a bout where one side has fewer than 2 tracked bouts. Says the count — "no UFC history" is
 * printed only when the count is zero.
 *
 * @param {{ a: number, b: number }} priorFights tracked bouts per corner
 * @param {string} nameA alphabetical corner A
 * @param {string} nameB alphabetical corner B
 */
export function basisNoteFor(priorFights, nameA, nameB) {
  const thinA = priorFights.a <= priorFights.b;
  const [thin, thinN, known, knownN] = thinA
    ? [nameA, priorFights.a, nameB, priorFights.b]
    : [nameB, priorFights.b, nameA, priorFights.a];
  const lead = thinN === 0
    ? `${thin} has no tracked UFC bouts in our corpus`
    : `${thin} has only ${countOf(thinN, "tracked UFC bout")} in our corpus (fewer than the 2 we count as known)`;
  return `${lead}, so this read leans on ${known}'s ${countOf(knownN, "tracked bout")} and on league-average priors for ${thin}. Treat it as weaker than a bout where both fighters have at least 2 tracked bouts.`;
}

const METHOD_WORD = { KO: ["a KO/TKO", "ko"], SUB: ["a submission", "submission"], DEC: ["a decision", "decision"] };

/**
 * One line summarising the two tracked records beside the pick. NOT a model attribution: the clauses come from raw
 * tracked rates against fixed thresholds, and the winner head also uses inputs (age, reach, height, stance) this line
 * never reads. The text labels itself as such.
 *
 * @param {{ pick: string, other: string, A: object, B: object, pWin: number, method: { most: string, probabilities: { ko: number, submission: number, decision: number } } | null }} input
 *   A is the pick's tracked record, B the opponent's; `method` is the published method head or null when it is not published.
 */
export function recordSummary({ pick, other, A, B, pWin, method }) {
  if (!A || !B) return null;
  const rate = (num, den, fallback) => (den > 0 ? num / den : fallback);
  const o = lastName(other);
  const clauses = [];
  const winA = rate(A.w, A.n, 0.5), winB = rate(B.w, B.n, 0.5);
  if (winA - winB >= 0.12) clauses.push((s) => `${s} has won ${A.w} of ${A.n} tracked bouts (${pc(A.w, A.n)}%) to ${o}'s ${B.w} of ${B.n} (${pc(B.w, B.n)}%)`);
  const finWins = A.koW + A.subW, finLosses = B.koL + B.subL, lossesB = B.n - B.w;
  const finA = rate(finWins, A.w, 0), finishedB = rate(finLosses, lossesB, 0);
  if (finA >= 0.55 && finishedB >= 0.5) clauses.push((s) => `${s} has finished ${finWins} of ${countOf(A.w, "win")} (${pc(finWins, A.w)}%), and ${o} has been finished in ${finLosses} of ${countOf(lossesB, "loss", "losses")} (${pc(finLosses, lossesB)}%)`);
  else if (finA >= 0.6) clauses.push((s) => `${s} has finished ${finWins} of ${countOf(A.w, "win")} (${pc(finWins, A.w)}%)`);
  const expEdge = A.n - B.n;
  if (Math.abs(expEdge) >= 8) {
    clauses.push(expEdge > 0
      ? (s) => `${s} has ${A.n} tracked bouts to ${o}'s ${B.n}`
      : (s) => `${s} has the shorter tracked record (${countOf(A.n, "bout")} to ${o}'s ${B.n})`);
  }
  if (!clauses.length) {
    /* P213 R-C3: coin-flip language is earned only near 50%. */
    const pct = Math.round(pWin * 100);
    return pct >= 45 && pct <= 55
      ? `The model separates these two by very little — ${pct}% is close to a coin flip, and nothing in either tracked record separates them cleanly.`
      : `The model reads it ${pct}% — nothing in either tracked record separates them cleanly, so the number rests on the model's wider inputs rather than a headline stat.`;
  }
  const body = clauses.slice(0, 2).map((c, i) => c(i === 0 ? pick : lastName(pick))).join("; ");
  let tail = "";
  if (method && METHOD_WORD[method.most]) {
    const [word, key] = METHOD_WORD[method.most];
    const p = Number(method.probabilities?.[key]);
    if (Number.isFinite(p)) {
      tail = p >= 0.5
        ? ` The model's method read makes ${word} more likely than not (${pc(p, 1)}%).`
        : ` The model's method read has ${word} as the most likely of three endings (${pc(p, 1)}%), short of a majority.`;
    }
  }
  return `${RECORD_SUMMARY_LABEL} ${body}.${tail}`;
}
