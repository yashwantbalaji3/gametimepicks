/**
 * THE UFC PREDICTION BOARD — rows derived from the card artifact, nothing else (UFC-001 · UX Phase A).
 *
 * The board is the first thing on /ufc: every bout once, in the card's own order (main event first), with the
 * published winner forecast and the experimental method lean. It reads ONLY `card-latest.json` — the same artifact the
 * bout pages read through `findUfcBout` — so the board and `/ufc/bout/[boutId]` cannot disagree, and there is no second
 * hand-kept list of fighters, bouts or predictions.
 *
 * What each column means, exactly:
 *   - winner probability: `prediction.winner.probability`, the experimental fight model's published winner probability.
 *     Never a sportsbook price; never re-rounded beyond display.
 *   - method lean: `prediction.method.most`, the most likely way the FIGHT ends among fights that end with a winner —
 *     for either fighter. It is NOT the probability that the predicted winner wins that way, so the board shows the lean
 *     as a label and no number. The method head is experimental and not graded.
 *   - a bout the model declines carries its own `unmodelledReason`, shown as "Not modelled" — never a guess.
 */

/** Model method codes → the words the UFC pages already use (`ufc-card.tsx` METHOD_LABEL). */
export const METHOD_LEAN_LABEL = Object.freeze({ KO: "KO / TKO", SUB: "Submission", DEC: "Decision" });

/** Card position in the card's own vocabulary — same rule as `boutPositionLabel` in `bout.ts`. */
function position(index, total) {
  if (index === 0) return "Main event";
  if (index === 1) return "Co-main event";
  return `Bout ${index + 1} of ${total}`;
}

/**
 * Main card vs prelims, from the provider's own start times: the bouts that share the main event's start time are the
 * main card; every bout that starts earlier is a prelim. A card with one start time is all main card. No guessing from
 * order alone.
 */
function segmentOf(bout, mainStartMs) {
  const t = Date.parse(bout?.startUtc ?? "");
  if (!Number.isFinite(t) || !Number.isFinite(mainStartMs)) return null;
  return t >= mainStartMs ? "Main card" : "Prelims";
}

const side = (f) => ({
  athleteId: f?.athleteId ? String(f.athleteId) : null,
  name: f?.name ?? "TBD",
  record: f?.record ?? null,
  photoUrl: f?.photoUrl ?? null,
});

/**
 * @param {{ bouts?: any[], model?: { id?: string }, generatedAt?: string } | null | undefined} card
 * @returns {{ rows: any[], modelId: string | null, generatedAt: string | null, modelled: number, total: number }}
 */
export function buildPredictionBoard(card) {
  const bouts = Array.isArray(card?.bouts) ? card.bouts : [];
  const mainStartMs = Date.parse(bouts[0]?.startUtc ?? "");
  const rows = bouts.map((b, i) => {
    const red = side(b?.red);
    const blue = side(b?.blue);
    const w = b?.prediction?.winner;
    const pickSide = w && typeof w.probability === "number"
      ? (w.name === red.name ? "red" : w.name === blue.name ? "blue" : null)
      : null;
    const pick = pickSide ? { side: pickSide, name: w.name, probability: w.probability } : null;
    const mostCode = b?.prediction?.method?.most ?? null;
    const methodLean = pick && mostCode && METHOD_LEAN_LABEL[mostCode] ? { code: mostCode, label: METHOD_LEAN_LABEL[mostCode] } : null;
    return {
      boutId: String(b?.boutId ?? ""),
      href: `/ufc/bout/${String(b?.boutId ?? "")}/`,
      index: i,
      position: position(i, bouts.length),
      segment: segmentOf(b, mainStartMs),
      startUtc: b?.startUtc ?? null,
      weightClass: b?.weightClass ?? null,
      scheduledRounds: typeof b?.scheduledRounds === "number" ? b.scheduledRounds : null,
      red,
      blue,
      pick,
      methodLean,
      unmodelledReason: pick ? null : (b?.unmodelledReason ?? "No supported read for this bout."),
    };
  });
  return {
    rows,
    modelId: card?.model?.id ?? null,
    generatedAt: typeof card?.generatedAt === "string" ? card.generatedAt : null,
    modelled: rows.filter((r) => r.pick).length,
    total: rows.length,
  };
}
