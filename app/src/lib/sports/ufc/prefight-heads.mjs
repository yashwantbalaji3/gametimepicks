/**
 * FREEZE ALL THREE PUBLISHED HEADS BEFORE THE CARD, NOT ONLY THE WINNER.
 *
 * `card-latest.json` publishes three heads per bout: winner, method (KO/TKO, submission, decision) and
 * ending round (1, 2, 3-or-later, plus "goes the distance", which is the method head's decision share).
 * The only pre-fight receipt was the model-vs-market snapshot, and it keeps the WINNER only, and only
 * for bouts that also had a usable price. So method and round, which Cage Chaos is built on, had no
 * frozen record at all, and a winner read on an unpriced bout was published and never recorded.
 * The only way to grade them afterwards was to dig the card out of git history.
 *
 * This is the receipt for that. It reads the card as published and copies every head of every bout
 * that carries a read, priced or not. It computes nothing new and does not touch the card. It refuses
 * at or after the card's start, so a frozen row can never have seen a result.
 *
 * It also records three coherence facts per bout, because they are properties of the published numbers:
 *   - each head's probabilities sum to 1
 *   - P(ends round 3 or later) >= P(decision): every decision ends in round 3 or 5, so it sits inside the 3+ class
 *   - "goes the distance" equals the method head's decision probability (one quantity, one number)
 * The method head is a FIGHT-level distribution. It does not say which fighter finishes, so
 * P(A by KO) + P(A by sub) + P(A by decision) = P(A wins) cannot be checked, and nothing here invents it.
 *
 * `gradePreFightHeads` scores frozen rows once a result exists (multiclass log loss / Brier / top class
 * through the forecast ledger's own measure). It is pure and returns rows. Nothing writes them anywhere
 * public: putting method and round in the public Forecast Record is a founder decision (grading rules, F10).
 */
import { boutKey } from "./model-vs-market.mjs";
import { measureBinary, measureMulticlass } from "../../forecast-ledger/measure.mjs";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const TOL = 1e-3; // the card rounds every probability to 4 dp

/** Method words in results-latest.json → the card's method keys. Anything else (DQ, overturned) is not gradable. */
export const RESULT_METHOD_TO_CLASS = Object.freeze({ ko_tko: "ko", submission: "submission", decision: "decision" });

/**
 * One frozen row per bout that carries at least one head.
 * @returns {{ rows: object[], skipped: Array<{boutId: string|null, reason: string}> }}
 */
export function buildPreFightHeads({ card, capturedAt }) {
  const eventDate = card?.event?.slateDate ?? null;
  const startUtc = card?.event?.startUtc ?? null;
  if (!eventDate || !startUtc) return { rows: [], skipped: [{ boutId: null, reason: "the card carries no date or start time" }] };
  if (!Number.isFinite(Date.parse(capturedAt))) return { rows: [], skipped: [{ boutId: null, reason: "no valid capture time" }] };
  if (Date.parse(capturedAt) >= Date.parse(startUtc)) {
    return { rows: [], skipped: [{ boutId: null, reason: `captured ${capturedAt} at or after the card started ${startUtc}: refused` }] };
  }
  const modelId = card?.model?.id ?? null;
  const rows = [];
  const skipped = [];
  for (const b of card?.bouts ?? []) {
    const p = b?.prediction ?? null;
    const w = p?.winner, m = p?.method, r = p?.rounds;
    const hasWinner = Boolean(w?.name) && isNum(w?.probability);
    const hasMethod = m?.probabilities && ["ko", "submission", "decision"].every((k) => isNum(m.probabilities[k]));
    const hasRounds = r?.probabilities && ["round1", "round2", "round3plus"].every((k) => isNum(r.probabilities[k]));
    if (!hasWinner && !hasMethod && !hasRounds) {
      skipped.push({ boutId: b?.boutId ?? null, reason: "the model published no read for this bout" });
      continue;
    }
    const method = hasMethod ? { ko: m.probabilities.ko, submission: m.probabilities.submission, decision: m.probabilities.decision } : null;
    const rounds = hasRounds ? { round1: r.probabilities.round1, round2: r.probabilities.round2, round3plus: r.probabilities.round3plus } : null;
    const goesTheDistance = hasRounds && isNum(r.goesTheDistance) ? r.goesTheDistance : null;
    rows.push({
      providerBoutId: b?.boutId != null ? String(b.boutId) : null,
      boutId: boutKey(eventDate, b?.red?.name, b?.blue?.name),
      eventDate,
      eventName: card?.event?.name ?? null,
      eventStartUtc: startUtc,
      boutStartUtc: b?.startUtc ?? null,
      red: b?.red?.name ?? null,
      blue: b?.blue?.name ?? null,
      scheduledRounds: isNum(b?.scheduledRounds) ? b.scheduledRounds : null,
      modelId,
      basis: p?.basis ?? null,
      winner: hasWinner ? { name: w.name, probability: w.probability, byFighter: w.byFighter ?? null } : null,
      method,
      methodMost: hasMethod ? m.most ?? null : null,
      rounds,
      endsIn: hasRounds ? r.endsIn ?? null : null,
      goesTheDistance,
      coherence: {
        methodSumsToOne: method ? Math.abs(sum(method) - 1) <= TOL : null,
        roundsSumToOne: rounds ? Math.abs(sum(rounds) - 1) <= TOL : null,
        round3plusCoversDecision: method && rounds ? rounds.round3plus + TOL >= method.decision : null,
        goesTheDistanceIsDecision: method && goesTheDistance != null ? Math.abs(goesTheDistance - method.decision) <= TOL : null,
      },
    });
  }
  return { rows, skipped };
}

/**
 * Index results-latest.json's finishes by the same folded, date-qualified key the frozen rows carry.
 * @returns {Map<string, {winner: string|null, method: string|null, round: number|null, status: string|null}>}
 */
export function finishIndexFromCorpus(doc) {
  const out = new Map();
  for (const r of doc?.results ?? []) {
    const d = String(r?.eventDate ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !r.fighterA || !r.fighterB) continue;
    out.set(boutKey(d, r.fighterA, r.fighterB), {
      winner: r.winner ?? null,
      method: r.method ?? null,
      round: Number.isFinite(r.round) ? r.round : null,
      status: r.resultStatus ?? null,
    });
  }
  return out;
}

/**
 * Score frozen rows against official finishes. A bout with no result yet is PENDING (never a miss); a draw,
 * no contest or a finish the corpus cannot classify is VOID for method and round.
 */
export function gradePreFightHeads(rows, finishByBout) {
  const graded = [];
  const pending = [];
  const voided = [];
  for (const row of rows ?? []) {
    const f = finishByBout.get(row.boutId);
    if (!f) { pending.push(row.boutId); continue; }
    const cls = RESULT_METHOD_TO_CLASS[f.method ?? ""];
    if (f.status !== "final" || !cls || !Number.isFinite(f.round)) { voided.push({ boutId: row.boutId, reason: `${f.status ?? "unknown"} / ${f.method ?? "no method"}` }); continue; }
    const roundClass = f.round === 1 ? "round1" : f.round === 2 ? "round2" : "round3plus";
    graded.push({
      boutId: row.boutId,
      providerBoutId: row.providerBoutId,
      observed: { method: cls, roundClass, round: f.round, wentTheDistance: cls === "decision" },
      method: row.method ? measureMulticlass({ classProbabilities: row.method, finalCategory: cls }) : null,
      rounds: row.rounds ? measureMulticlass({ classProbabilities: row.rounds, finalCategory: roundClass }) : null,
      goesTheDistance: row.goesTheDistance != null ? measureBinary({ probability: row.goesTheDistance, observed: cls === "decision" ? 1 : 0 }) : null,
    });
  }
  return { graded, pending, voided };
}
